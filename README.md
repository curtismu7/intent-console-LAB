# AI Intents Console LAB

Tier: Demo.
Repo: https://github.com/curtismu7/intent-console-LAB

The PingOne Privilege console has an **AI Intents** page: an admin names a purpose for an agent action, gives example phrases, sets a similarity floor, declares twin intents it must be told apart from, and marks whether the intent authorizes an action. Applications then select intents, and every agent action is matched against them through an encoder sidecar. This lab rebuilds that page as a simulation.

Catalog id **D130** (provisional; the owner confirmed the lab 2026-11-18).

## What is measured and what is simulated

- **Measured (2026-11-18, from the console swagger `imodelAIIntent*` / `modelAIIntent*`):** the shapes — `Spec { Description, Exemplars, Twins, Patterns, Acts, Floor }`, `Status { Validation, Error, ValidatedAt, Warnings }`, and the per-app `modelAIIntentConfig { IntentIDs, Encoder { URL, TimeoutMS, FailClosed } }`. The full CRUD surface (`/api/{tenant}/v1/aiintents`).
- **Measured (2026-11-17 export):** our tenant had defined **zero** AI intents. Every intent in this lab is lab-authored.
- **Measured (2026-11-06, coding-agents lab):** the console probes an encoder endpoint on the NVIDIA Triton inference-server wire (KServe v2: `/v2`, `/model_info`, `/get_worker_address`).
- **UNVERIFIED:** everything the product *does* with those shapes — how scores, Floors, Twins, Acts and FailClosed become a decision, what the encoder model is. The lab states its own reading of each step on the decision trail, and every such claim is labelled UNVERIFIED on the Facts tab.
- **The encoder is a stand-in:** a deterministic hashed character-trigram vector (384 dims, FP32, cosine similarity), not a trained model. Same wire shape, no GPU, no download.

## What it teaches

1. **Intents turn "what did the agent do" into "what was the agent for".** An action carries no purpose label; the intent set gives it one.
2. **Twins make ambiguity explicit.** `transfer-funds` and `pay-beneficiary` are declared twins: an action landing over both floors within 0.05 of each other is **refused, not guessed** — money must not move on a coin flip.
3. **Acts separates describing from authorizing.** `check-balance` (Acts=false) can match an action and still deny it: reading is not writing.
4. **Fail-closed vs fail-open.** With `FailClosed` off, unmatched text sails through as "no intent matched" — the lab shows why that is a bad default on a payments app.
5. **Empty selection means no policy.** An app that selects no intents has no intent resolution; fail-closed denies everything. There is no "empty means all".

## Run it

- Host: `./scripts/run.sh` (Node 26+), then open http://localhost:7825/.
- Docker (OrbStack): `HOST_PORT=7825 docker compose up --build -d`, published on `127.0.0.1` only.
- Through the shared lab-proxy: `https://local.ping-devops.com:8443/intent-console-lab/` once the route is registered.
- Tests: `npm ci && npm test` (server, web and packaging). Preflight: `npm run doctor`. Reset: `npm run reset`.
- **No live mode.** This lab contacts no Privilege console and no remote encoder in any mode (the netguard refuses every non-loopback socket). `INTC_MODE_REAL=1` in the lab's own `.env` only enables the rule-19 Real switch, and the page keeps its simulation banner. `MODE` in `.env` forces the start mode; the header toggle (`POST /api/mode`, exactly `{source:"mock"|"real"}`, 409 with the reason) switches at runtime.

## Run from a clone

Prerequisites: Node 26 or newer. Docker (OrbStack) only for the Docker form. Mock needs no tenant and no credentials.

```
git clone https://github.com/curtismu7/intent-console-LAB.git
cd intent-console-LAB
npm ci
npm run build
npm run doctor
npm start
```

Open http://127.0.0.1:7825/. `GET /api/health` answers `demo-health/1`.

## What to do if the port is taken

```
Ports: intent-console-LAB listens on 7825 only.
Docker publishes it on 127.0.0.1:7825 only.

If the port is taken:
1. Find what is using it:
   lsof -iTCP:7825 -sTCP:LISTEN -n -P
2. If it is an old copy of this lab (npm start), stop that process: kill <PID>.
   If it is this lab's container: docker compose down (from this folder).
3. If it is something else, stop it. The lab refuses any other port on purpose
   (one port per app; npm run doctor says so), so free 7825 rather than moving the lab.
4. Then start again: npm start, or docker compose up -d.
```

## Tabs

**Intents** (the console-shaped CRUD table: exemplars, twins, Patterns, Acts chip, Floor, validation status with warnings; the per-app selection checkboxes), **Resolve** (the app's `modelAIIntentConfig` — IntentIDs, encoder URL, TimeoutMS, FailClosed — and the probe: action text in, per-intent scores, the decision trail, ALLOW/DENY), **Encoder** (the KServe v2 `model_info` shape and a live infer against the lab's own sidecar route, first values shown), **Diagram** (ReactFlow, movable boxes, Simulate, Reset, speed control: one action from text to decision), **Facts & Talk** (every claim with its measured/UNVERIFIED status, the six scenarios, the talk track). Presenter mode (key `P`) keeps the banner.

## Surface

`GET|POST /api/intents`, `GET|PUT|DELETE /api/intents/:name`, `POST /api/intents/revalidate`, `GET|PUT /api/app-config`, `POST /api/resolve` (`{action, intents?, failClosed?}`), `GET /api/encoder/info`, `POST /api/encoder/infer` (KServe v2 shape, bounded: 4 inputs of 4 texts, 2000 chars each), `GET /api/scenarios`, `GET /api/diagram`, `GET /api/info`, `POST /api/mode`, `GET /api/runs`, `POST /api/reset`, `GET /api/health` (`demo-health/1`). Every visitor carries an `X-Workspace` id; intents, config and resolution are per workspace, and Reset restores that workspace's three seed intents.

Safety: loopback bind only (plus `LAB_ALLOWED_HOSTS`), same-origin writes, bounded input, `nosniff`, read-only container filesystem, non-root, a network guard that refuses every non-loopback connection. See `docs/safety.md` and `docs/talk-track.md` (generated from the same data the UI reads).

## Attribution

The scaffold (server shell, safety, workspaces, diagram viewer, packaging) was copied from `observability-LAB`; the intents domain — store, encoder, resolver, app config, UI — is this lab's own. No code or identifier was imported from the console or any other repo.
