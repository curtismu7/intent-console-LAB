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

## Known blocker (Ping-side, needs SE/DevOps) — UPDATED 2026-11-20

**What we established across 2026-11-19/20:**

1. **The encoder side is done.** The Triton `intent-encoder` model (384 dims, KServe-v2,
   `/v2/models/intent-encoder/infer`) runs healthy; two reachable deployments exist:
   - on the owner's Mac: Docker `intent-encoder-triton` (127.0.0.1:8597, resolves via
     the Mac's `/etc/hosts` entry for `local.ping-devops.com`)
   - in-cluster: `svc/intent-encoder` (and `intent-encoder-8597`) in
     `ping-devops-curtismuir` — verified serving real nomic embeddings from the
     gateway's namespace.
2. **The console UI config is done.** Via the console UI (not the API — the explorer
   key lost its grant when the local gateway session cycled): intents
   `transfer_funds`, `pay_beneficiary`, `check_balance` recreated and **Valid**; the
   `opensearch` app's Intent tab selects exactly these 3 with encoder URL
   `http://intent-encoder.ping-devops-curtismuir.svc.cluster.local:8000/v2` and **saved
   through the console's own UI write path**.
3. **The projected gateway nodes never receive the AIIntentConfig.** On the enrolled
   gateway fleet (`agentless-mcpgw*` in `ping-devops-cmuir`, the set shown on the
   console Nodes page as `ai-demo-cmuir`), a fresh pod's startup sync includes the
   `http-opensearch` frontend nodes (13 log lines) but **zero** `AIIntent` traces —
   the cloud→node projection strips the AIIntentConfig. Therefore the aiintent
   registry never initializes, never probes any encoder, and intent signals stay
   unavailable regardless of what the console holds.
4. Earlier red herrings, resolved: the `Tenant not found ... Retrying` storm in
   `tenant_profile.wtch.go` predates this work (back to 2026-10-10) and the cluster
   gateways don't consume TenantProfiles at all; the stale `8597` probes came from a
   since-deleted gateway deployment in `ping-devops-curtismuir`; the curtismuir
   gateway deployments were removed overnight 11-19/20.
5. Also broken independently: `bxaigateway.pingidentity.cloud:8623` (the EC2 gateway
   the labs' Real mode calls) refuses connections since 2026-11-20 ~15:00Z.

**Question for Ping:** why does the cloud→enrolled-node projection not carry the
application's `McpAppConfig.AIIntentConfig` (encoder URL, IntentIDs, FailClosed)?
The console shows it saved; a freshly started, fully synced gateway node shows no
trace of it. Without that field reaching the node, the aiintent registry cannot
start. (Node builds: `v1.261112-NYLb`, `v1.261120`; log: `/var/log/procyon/cyonproxy.log`.)

**How to verify once fixed** — a freshly restarted enrolled gateway should log an
aiintent evaluation line (`... has a deterministic tier for N intent(s)` and/or a
probe of the encoder URL) within ~20 min of start.

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
