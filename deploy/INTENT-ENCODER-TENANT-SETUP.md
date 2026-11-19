# Tenant-side AI Intents encoder + gateway setup (owner tenant 0428ba4f)

State as of 2026-11-19. Everything here is on the SE cluster (context `us`), namespace
`ping-devops-curtismuir`, tenant `0428ba4f-169c-436b-aff9-b230496e0e3b` (Privilege console
`https://local.procyon.ai:8643`).

## What is deployed

### 1. Real embedding model (already existed)
- `deploy/embeddings` + `svc/embeddings` in namespace `ping-devops-cmuir`
- llama.cpp server (`--embedding --pooling mean`) hosting
  `/models/nomic-embed-text-v1.5.Q8_0.gguf`, 768 dims, OpenAI shape
  `POST /v1/embeddings`

### 2. KServe-v2 proxy (this lab's encoder)
- `deploy/intent-encoder` + `svc/intent-encoder` (port 8000) in namespace
  `ping-devops-curtismuir`; python:3.12-alpine, `runAsUser: 65534` required
- Code: ConfigMap `intent-encoder-shim` (source of truth: `intent-encoder-kserve-proxy.py`
  in this directory), mounted at `/srv/encoder.py`, command `python /srv/encoder.py`
- Endpoints: `GET /v2`, `GET /v2/info`, `GET /v2/models/intent-encoder[/model_info|/get_worker_address]`,
  `POST /v2/models/intent-encoder/infer` — proxies to the nomic server above
- Apply: `kubectl --context us apply -f intent-encoder-k8s.yaml`

### 3. Tenant objects (console API, x-api-key/x-api-secret/x-procyon-session-id)
- TenantProfile (`/api/{tenant}/v1/tenantprofiles/default/{tenant}`),
  `Spec.CodingAgent.AIIntent.Encoder` =
  `http://intent-encoder.ping-devops-curtismuir.svc.cluster.local:8000/v2`,
  TimeoutMS 5000, FailClosed false — **this is the config the gateway's aiintent
  registry reads** (NOT the per-app `modelAIIntentConfig`)
- `opensearch` application `Spec.McpAppConfig.AIIntentConfig`: same encoder URL,
  IntentIDs = 7 built-ins + `transfer-funds`, `pay-beneficiary`, `check-balance`
- 3 AIIntents created and Valid with 0 warnings: `transfer-funds`, `pay-beneficiary`,
  `check-balance` (namespace `default`)

## Known blocker (Ping-side, needs SE/DevOps)

The agentless-mcpgw gateways (`agentless-mcpgw`, `agentless-mcpgw3` in
`ping-devops-curtismuir`) still probe the OLD dead URL
`http://local.ping-devops.com:8597/v2` (config hash `c061ebd06f2b35098a0426469bd17b8c`)
even after:

- the TenantProfile PUT is confirmed in the console store (rev 70, new URL)
- re-PUTs and a no-op re-PUT (all 200)
- full restarts of both gateways (fresh startup sync, 33 frontend nodes created)
- 30+ minutes of propagation time per attempt

Both gateways log a storm of `Error creating the tenantprofile ... Tenant not found:
0428ba4f-... Retrying` from
`controller/model/imodel/generated/watcher/tenant_profile.wtch.go` during startup.
The registry evaluates the aiintent config once, ~15–20 min after pod start
(gateway3: started 13:23Z, evaluated 13:40:09Z, read the stale profile).
The replicated store the gateways read does not reflect the console's TenantProfile.

**Question for Ping:** is `Tenant not found ... Retrying` in
`tenant_profile.wtch.go` known-benign, or is TenantProfile replication broken for
this tenant? Once the gateway store refreshes, custom-intent matching goes live with
no further changes — the encoder and all tenant objects are already correct.

## How to verify once unblocked

```sh
kubectl --context us exec -n ping-devops-curtismuir deploy/agentless-mcpgw3 \
  -c agentless-mcpgw3 -- sh -c \
  "grep -i aiintent /var/log/procyon/cyonproxy.log | tail -3"
# want: '... has a deterministic tier for 7 intent(s)' AND a probe of
# http://intent-encoder...:8000/v2 (no 'not usable' line for 8597)
```

Then run the lab in Real mode (`https://local.ping-devops.com:8443/intent-console-lab/`,
Resolve section) with the good/bad/ambiguity probes and check intent-signal attribution
in the gateway log.
