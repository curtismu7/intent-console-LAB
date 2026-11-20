# Bug: Cloud→node config projection drops `McpAppConfig.AIIntentConfig` from enrolled AI Gateway nodes

**Product:** PingOne Privilege — AI Gateway (agentless-mcpgw) / Procyon control plane
**Severity:** High — AI Intents feature is completely non-functional on enrolled gateways
**Reported:** 2026-11-20 · Reporter: Curtis Muir (SE demo tenant `0428ba4f-169c-436b-aff9-b230496e0e3b`)
**Builds observed:** gateway `v1.261112-NYLb`, `v1.261120`; console as served 2026-11-19/20

---

## Summary

The console (UI and REST API) accepts and persists an application's `Spec.McpAppConfig.AIIntentConfig`
(encoder URL, TimeoutMS, FailClosed, IntentIDs) and renders it back correctly on GET and in the UI.
However, the configuration projection delivered to **enrolled AI Gateway nodes** does not contain this
field at all. The gateway therefore never initializes its aiintent registry, never probes the encoder,
and never produces intent signals — regardless of what is configured.

This is not a propagation delay: it was reproduced across multiple gateway restarts over ~28 hours,
after saves through both the REST API and the console UI's own write path.

## Reproduction

1. Tenant `0428ba4f-169c-436b-aff9-b230496e0e3b`, namespace `default`.
2. Console UI → application **opensearch** (MCP Server) → **Intent** tab:
   - Select intents (custom: `transfer_funds`, `pay_beneficiary`, `check_balance` — all Valid)
   - Encoder URL: `http://intent-encoder.ping-devops-curtismuir.svc.cluster.local:8000/v2`
   - Click **Save Changes** → save succeeds, UI shows "Selected Intents (3 of 28)".
   - `GET /api/{tenant}/v1/applications/default/opensearch` confirms the saved config, e.g.:
     ```json
     "AIIntentConfig": {
       "Encoder": {"URL": "http://intent-encoder.ping-devops-curtismuir.svc.cluster.local:8000/v2",
                    "TimeoutMS": 5000, "FailClosed": false},
       "Disabled": false,
       "IntentIDs": {"Elems": ["transfer_funds", "pay_beneficiary", "check_balance"]}
     }
     ```
3. Restart an enrolled gateway node and wait for its full startup sync
   (deployment `agentless-mcpgw`, namespace `ping-devops-cmuir`, cluster
   `ping-dev-aws-us-east-2`; the node is one of the 5 shown on the console
   **Nodes** page under enrollment `ai-demo-cmuir`).
4. Inspect the node's sync results:
   ```sh
   kubectl --context us exec -n ping-devops-cmuir deploy/agentless-mcpgw \
     -c agentless-mcpgw -- sh -c \
     "grep -c 'http-opensearch' /var/log/procyon/cyonproxy.log; \
      grep -ci 'aiintent' /var/log/procyon/cyonproxy.log"
   ```
   **Actual:** the `http-opensearch` frontend nodes ARE in the sync (13 lines), but
   `aiintent` appears **0** times — no registry init, no encoder probe, no config hash line.

## Expected

Either:
- the projected app object on the node carries `McpAppConfig.AIIntentConfig`, and the node's
  aiintent registry logs its evaluation within ~20 min of start (observed behaviour on older
  gateway builds: a line like
  `[mcpgw] aiintent: configuration <hash> has a deterministic tier for N intent(s)` plus an
  encoder probe result), **or**
- the registry evaluates lazily on first request through the app.

## Actual

The node's projection of the application contains **no AIIntentConfig whatsoever**. The registry
never logs anything (neither success nor failure) for the entire pod lifetime. Intent signals stay
silently unavailable. Older gateway deployments (now deleted) in the same tenant exhibited the
companion symptom: they *did* initialize the registry but only ever with a stale config hash
probing a dead encoder URL — the fresh config never reached them either, across re-PUTs and
restarts.

## What we ruled out (so dev doesn't have to)

- **Client-side staleness / caching:** reproduced after full pod restarts with clean startup sync
  (all `Created frontend node` lines present) on 2026-11-19 and again 2026-11-20.
- **Wrong write path:** reproduced with the config saved via the console UI's own save button
  (not just the REST API), and verified persisted via REST GET afterwards.
- **Propagation delay:** 28+ hours and multiple write cycles; the console-side revision increments
  (e.g. TenantProfile rev 70) while node projections never change.
- **Object scope confusion:** confirmed the gateway consumes the **application-level**
  `McpAppConfig.AIIntentConfig`; a `TenantProfile` `CodingAgent.AIIntent` blob also exists and was
  also set correctly (the cluster gateways never log any TenantProfile consumption, so this may be
  a separate consumer path).
- **Encoder reachability:** the encoder side is healthy — a Triton `intent-encoder` model serving
  KServe v2 (verified `/v2/info` 200, `/infer` returning 384-dim embeddings) is reachable both from
  the owner's Mac (`local.ping-devops.com:8597`) and from inside the cluster
  (`svc/intent-encoder` in `ping-devops-curtismuir`, verified with a curl pod in the gateway's
  namespace).
- **Watch events:** the gateway's log shows ~1900 `MedusaLinkEvent` entries (link churn) but zero
  object-change watch events (Application/TenantProfile); config appears to arrive only via the
  startup sync — and the sync's projection lacks the field.

## Related observation (possibly same root cause)

During the same window, the gateway logged a storm of
`Error creating the tenantprofile {...}: Tenant not found: <tenant>. Retrying`
(`controller/model/imodel/generated/watcher/tenant_profile.wtch.go:71`) — ~130× per startup,
present in logs back to 2026-10-10, i.e. predating all of our changes. It may indicate the
same control-plane → node object pipeline dropping/mangling tenant-scoped objects.

## Impact

Any tenant configuring AI Intents on an AI Gateway gets a silently no-op feature: policies
conditioned on intent signals can never match, with no error surfaced to the admin.

## Environment / access for dev

- Cluster: `ping-dev-aws-us-east-2` (SE DevOps), context `us`
- Tenant: `0428ba4f-169c-436b-aff9-b230496e0e3b`, gateway enrollment `ai-demo-cmuir`
- Node deployments: `agentless-mcpgw` (+ `-pingid`, `-pingid2`) in ns `ping-devops-cmuir`
- Console (tunneled): `https://local.procyon.ai:8643` → proxies to `console.privilege.pingone.com`
- Gateway log on node: `/var/log/procyon/cyonproxy.log`
- Full investigation history, test matrix, and encoder deployment manifests:
  `deploy/INTENT-ENCODER-TENANT-SETUP.md` in https://github.com/curtismu7/intent-console-LAB
- Test encoder (KServe v2, 384-dim Triton model) can be redeployed anywhere from the same repo:
  `deploy/intent-encoder-k8s.yaml`

## Acceptance test for the fix

1. Save an app's AIIntentConfig in the console (any encoder URL).
2. Restart an enrolled gateway node; wait for sync.
3. `grep -i aiintent /var/log/procyon/cyonproxy.log` shows a registry evaluation line naming the
   saved config and an encoder probe result — within ~20 min of pod start.
4. An MCP request through the app produces intent-signal attributes usable by policy.
