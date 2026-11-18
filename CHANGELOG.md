# Changelog

## 0.1.0 (2026-11-18)

- New lab: the Privilege console's AI Intents page as a standalone simulation. Console-shaped AIIntent CRUD (`Spec { Description, Exemplars, Twins, Patterns, Acts, Floor }`, `Status { Validation, Error, ValidatedAt, Warnings }` — measured from the console swagger `imodelAIIntent*`/`modelAIIntent*` on 2026-11-18), a per-app `modelAIIntentConfig` (IntentIDs + Encoder URL/TimeoutMS/FailClosed), and a lab-invented resolution engine (score → Floor → Twins → Acts → FailClosed) with the lab's own reading stated on every decision hop.
- Encoder sidecar on the KServe v2 wire (`model_info` + `infer`, 384-dim FP32): a deterministic hashed character-trigram stand-in model, not a trained encoder; what the product does with the vector is UNVERIFIED.
- Six doctor-checked scenarios, including the marquee beat: twin intents both over their floors within 0.05 are refused as ambiguous, never guessed.
- No live mode by design: the lab contacts no console and no remote encoder (netguard); `INTC_MODE_REAL=1` only enables the rule-19 Real switch, and the page keeps its simulation banner.
- Per-workspace state (rule 13): intents, app config and decisions are per `X-Workspace`; Reset restores the three seed intents.
- Diagram: one action from text to decision, diagram-studio/1 data (rule 17), ReactFlow with Simulate, Reset and speed control.
- Content pack (Learning Hub `demo-content-pack/1`) built from the same story data the UI reads.
- Port 7825 (one port, from the shelf allocator, 2026-11-18). Catalog id D130 (provisional).
