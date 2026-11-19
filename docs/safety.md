# Safety

- Loopback bind only (`INTC_BIND` is the explicit opt-in the container uses); the compose file publishes `127.0.0.1` only (a test pins it).
- Host header must be a loopback name (or one in `LAB_ALLOWED_HOSTS`); writes must be same-origin.
- Netguard blocks every non-loopback outbound connection (fetch, socket, DNS, UDP) with a self-test, and a test asserts the refusals. ONE exception: when Real mode is configured (gateway URL + bearer from the shared settings file, owner-set), the gateway's single hostname is allowlisted for Real mode's one A2A call; Mock makes zero outbound calls in every configuration. The bearer is write-only: never returned by any API, never logged, never echoed; the lab never prints the endpoint host either.
- The app-config encoder URL must be a plain http(s) URL on loopback with no credentials — a remote URL is refused (400), never contacted.
- Input is bounded and validated on every route: intent names `^[a-z][a-z0-9-]{0,39}$`, at most 50 intents and 40 exemplars/twins/patterns per intent, strings capped (200/500 chars) and stripped of control and bidirectional characters, `Floor` 0..1, `TimeoutMS` 100..10000, at most 4 encoder inputs of 4 texts of 2000 chars, action text 2000 chars, JSON body caps (64 kb). The parser is a single iterative pass; no `eval`, `Function` or `vm` anywhere.
- Everything is rendered as React text through the lab's `visible()` guard (control and bidirectional characters shown as escapes); never `dangerouslySetInnerHTML`.
- Workspaces (rule 13) are capped in count and age; per workspace at most 50 intents and 20 recorded actions.
- Everything in mock mode is synthetic: hosts end in `.example`/`.invalid`, ids are made up, no real credential, key or token exists anywhere. `customer.config.json` only sets four display strings and is git-ignored.
- No tenant, credential or customer identifier ships. The console's host is never named in shipped text; the swagger source is cited as `console-swagger.invalid`.
