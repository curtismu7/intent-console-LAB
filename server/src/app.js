// One Express app. /api = health, info, the Mock/Real toggle, the AIIntent CRUD, the per-app intent config,
// the resolver probe, the encoder probe and reset. State is per workspace id (X-Workspace) so one visitor's
// intents never touch another's. Loopback Host check and same-origin writes on everything. Serves web/dist.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { hostCheck, sameOriginWrites } from './safety.js';
import { createHealth } from './health.js';
import { mountShelfRoute } from './shelfLink.js';
import { loadCast, verticalFrom, VERTICALS } from './cast.js';
import { modeFrom, realAvailableFrom, realProblemFrom } from './config.js';
import { buildStory, TITLE } from './story.js';
import { DIAGRAM_NAMES, buildDiagram } from './diagramData.js';
import { createIntentStore, seedIntents } from './intents.js';
import { resolveAction } from './resolver.js';
import { validateAppConfig, defaultAppConfig } from './appConfig.js';
import { modelInfo, infer } from './encoder.js';
import { createWorkspaces, workspaceFrom } from './workspaces.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.WEB_DIST || path.resolve(HERE, '../../web/dist');
const CONFIG = process.env.CUSTOMER_CONFIG || path.resolve(HERE, '../../customer.config.json');

export function createApp({
  health = createHealth(), configFile = CONFIG, env = process.env, now = Date.now,
  workspaces = createWorkspaces({ now }),
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(hostCheck);
  app.use(sameOriginWrites);
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });

  // The runtime mode (rule 19): starts from the launch mode, switches without a restart.
  let mode = modeFrom(env);

  const api = express.Router();
  api.use(express.json({ limit: '64kb' }));
  api.use('/health', health.router);
  mountShelfRoute(api, { env }); // GET /api/shelf for the header "Shelf" button
  const castFor = (req) => loadCast(configFile, verticalFrom(req.query.vertical));

  api.get('/scenarios', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(buildStory(castFor(req))); });
  api.get('/diagram', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(buildDiagram(castFor(req), DIAGRAM_NAMES.includes(req.query.name) ? req.query.name : DIAGRAM_NAMES[0])); });
  api.get('/info', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      mode, source: mode, simulated: true, realAvailable: realAvailableFrom(env), realHint: realProblemFrom(env),
      title: TITLE,
      version: (() => { try { return JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version || null; } catch { return null; } })(),
    });
  });
  // Rule 19: exactly { source: "mock"|"real" }; 409 when Real is not enabled.
  api.post('/mode', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !['mock', 'real'].includes(body.source)) {
      return res.status(400).json({ error: 'bad_source', detail: 'body must be exactly { source: "mock" | "real" }' });
    }
    if (body.source === 'real' && !realAvailableFrom(env)) return res.status(409).json({ error: 'real_not_configured', detail: realProblemFrom(env) });
    mode = body.source;
    return res.json({ source: mode });
  });

  const withWorkspace = (handler) => (req, res) => {
    const ws = workspaceFrom(req);
    if (!ws) return res.status(400).json({ error: 'bad_workspace' });
    res.set('Cache-Control', 'no-store');
    return handler(ws, req, res);
  };
  const fail = (res, e) => {
    if (e?.error) return res.status(e.status || 400).json(e);
    return res.status(500).json({ error: 'internal_error' });
  };

  const storeOf = (ws) => {
    const v = workspaces.state(ws);
    if (!v.store) {
      v.store = createIntentStore({ now });
      for (const s of seedIntents()) v.store.create({ ObjectMeta: { Name: s.name }, Spec: s.Spec, State: s.State });
      v.appConfig = defaultAppConfig();
    }
    return v;
  };

  // ---- AIIntent CRUD (console shapes: imodelAIIntent) ----
  api.get('/intents', withWorkspace((ws, _req, res) => res.json({ intents: storeOf(ws).store.list(), workspace: ws })));
  api.get('/intents/:name', withWorkspace((ws, req, res) => {
    const i = storeOf(ws).store.get(String(req.params.name));
    return i ? res.json({ intent: i, workspace: ws }) : res.status(404).json({ error: 'not_found', detail: `intent "${req.params.name}" does not exist` });
  }));
  api.post('/intents', withWorkspace((ws, req, res) => {
    const v = storeOf(ws).store.create(req.body);
    if (v.error) return fail(res, v.error === 'exists' ? { ...v, status: 409 } : v);
    workspaces.record(ws, { action: 'intent-create', name: v.value.ObjectMeta.Name });
    return res.status(201).json({ intent: v.value, workspace: ws });
  }));
  api.put('/intents/:name', withWorkspace((ws, req, res) => {
    const v = storeOf(ws).store.update(String(req.params.name), req.body);
    if (v.error) return fail(res, v.error === 'not_found' ? { ...v, status: 404 } : v);
    workspaces.record(ws, { action: 'intent-update', name: String(req.params.name) });
    return res.json({ intent: v.value, workspace: ws });
  }));
  api.delete('/intents/:name', withWorkspace((ws, req, res) => {
    const v = storeOf(ws).store.remove(String(req.params.name));
    if (v.error) return fail(res, { ...v, status: 404 });
    workspaces.record(ws, { action: 'intent-delete', name: String(req.params.name) });
    return res.json({ deleted: String(req.params.name), workspace: ws });
  }));
  api.post('/intents/revalidate', withWorkspace((ws, _req, res) => {
    storeOf(ws).store.revalidate();
    return res.json({ intents: storeOf(ws).store.list(), workspace: ws });
  }));

  // ---- Per-app config (modelAIIntentConfig) ----
  api.get('/app-config', withWorkspace((ws, _req, res) => res.json({ config: storeOf(ws).appConfig, workspace: ws })));
  api.put('/app-config', withWorkspace((ws, req, res) => {
    const v = validateAppConfig(req.body);
    if (v.error) return fail(res, v);
    storeOf(ws).appConfig = v.value;
    workspaces.record(ws, { action: 'app-config', intents: v.value.IntentIDs.length });
    return res.json({ config: v.value, workspace: ws });
  }));

  // ---- Resolution probe ----
  api.post('/resolve', withWorkspace((ws, req, res) => {
    const text = req.body?.action;
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'bad_action', detail: 'body.action must be a non-empty string' });
    if (text.length > 2000) return res.status(400).json({ error: 'bad_action', detail: 'action text is capped at 2000 characters' });
    // An explicit intent selection overrides the app config, so the scenarios can be driven one at a time.
    let config = storeOf(ws).appConfig;
    if (Array.isArray(req.body.intents)) {
      const v = validateAppConfig({ ...config, IntentIDs: req.body.intents, Encoder: { ...config.Encoder, FailClosed: req.body.failClosed === false ? false : config.Encoder.FailClosed } });
      if (v.error) return fail(res, v);
      config = v.value;
    } else if (req.body.failClosed !== undefined) {
      const v = validateAppConfig({ ...config, Encoder: { ...config.Encoder, FailClosed: req.body.failClosed === true } });
      if (v.error) return fail(res, v);
      config = v.value;
    }
    const r = resolveAction({ text, intents: storeOf(ws).store, config, now });
    workspaces.record(ws, { action: 'resolve', decision: r.decision, matched: r.matched });
    return res.json({ ...r, workspace: ws, config });
  }));

  // ---- The encoder probe (KServe v2 wire, stand-in model) ----
  api.get('/encoder/info', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(modelInfo()); });
  api.post('/encoder/infer', (req, res) => {
    const out = infer(req.body);
    if (out.error) return res.status(400).json({ error: out.error, detail: 'body must be KServe v2: { inputs: [{ name: "TEXT", data: [text...] }] }, at most 4 inputs of 4 texts, 2000 chars each' });
    return res.json(out);
  });

  api.get('/runs', withWorkspace((ws, _req, res) => res.json(workspaces.runs(ws))));
  // Reset restores this workspace to the seed intents and the default app config (the mode stays).
  api.post('/reset', withWorkspace((ws, _req, res) => {
    workspaces.resetWorkspace(ws);
    res.json({ reset: 'ok', workspace: ws });
  }));
  api.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use('/api', api);
  // Errors become short JSON. Express's default handler would send an HTML stack trace with absolute file paths.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = Number(err?.status || err?.statusCode);
    if (status === 413) return res.status(413).json({ error: 'payload_too_large' });
    if (status >= 400 && status < 500) return res.status(status).json({ error: 'bad_request' });
    return res.status(500).json({ error: 'internal_error' });
  });

  if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    app.use(express.static(WEB_DIST));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }
  return app;
}

export function startHttpServer({ port, host, app = createApp() } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve({ server, url: `http://${host}:${server.address().port}/` }));
    server.once('error', reject);
  });
}
