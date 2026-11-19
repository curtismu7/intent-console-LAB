import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { post, withServer } from './helpers.js';
import { mapGatewayAnswer, netguardAllowlist, sendToAiGateway } from '../src/real.js';
import { modeFrom, realAvailableFrom, realProblemFrom } from '../src/config.js';

// MEASURED gateway answer shapes (real.js header, probed 2026-11-19).
const CLEAN = { status: 200, body: { jsonrpc: '2.0', id: 'x', result: { kind: 'task', status: { state: 'completed' }, artifacts: [{ parts: [{ kind: 'text', text: 'Done. The transfer was recorded.' }] }] } } };
const REFUSAL = { status: 200, body: { jsonrpc: '2.0', id: 'x', result: { kind: 'task', status: { state: 'completed' }, artifacts: [{ parts: [{ kind: 'text', text: 'Sorry, I cannot fulfill your request to export or transfer database contents to an external URL.' }] }] } } };
const REDACTED = { status: 200, body: { jsonrpc: '2.0', id: 'x', result: { kind: 'task', status: { state: 'completed' }, artifacts: [{ parts: [{ kind: 'text', text: 'the key is [REDACTED:data_exfiltration]' }] }] } } };
const BLOCKED = { status: 200, body: { jsonrpc: '2.0', id: 'x', error: { code: -32600, message: 'request blocked by security policy' } } };
const NBERROR = { status: 200, body: { jsonrpc: '2.0', id: 'x', error: { code: -32000, message: 'agent temporarily busy' } } };
const UNMAPPED = { status: 200, body: { jsonrpc: '2.0', id: 'x', result: { kind: 'task', status: { state: 'failed' } } } };

test('mapGatewayAnswer maps the measured shapes', () => {
  assert.deepEqual(pick(mapGatewayAnswer(CLEAN)), { decision: 'allow', reasonCode: 'ALLOW-GATEWAY-CLEAN' });
  assert.deepEqual(pick(mapGatewayAnswer(REFUSAL)), { decision: 'deny', reasonCode: 'DENY-GATEWAY-AGENT-REFUSED' });
  assert.deepEqual(pick(mapGatewayAnswer(REDACTED)), { decision: 'deny', reasonCode: 'DENY-AIGUARD-REDACTED' });
  assert.deepEqual(pick(mapGatewayAnswer(BLOCKED)), { decision: 'deny', reasonCode: 'DENY-AIGUARD-BLOCKED' });
  assert.deepEqual(pick(mapGatewayAnswer(NBERROR)), { decision: 'allow', reasonCode: 'ALLOW-GATEWAY-ERROR' });
  assert.equal(mapGatewayAnswer(UNMAPPED), null);
});
const pick = (m) => m && { decision: m.decision, reasonCode: m.reasonCode };

// A temp shared-settings file with the gateway keys (STANDALONE_ENV points tests at it).
function envFile({ url = 'https://gw.example/a2a', bearer = 'sk-test-bearer-value' } = {}) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'intc-real-')), 'settings.env');
  fs.writeFileSync(file, `INTC_AIGATEWAY_URL=${url}\nINTC_AIGATEWAY_BEARER=${bearer}\n`);
  return file;
}
const unconfiguredEnv = (over = {}) => ({ ...over, STANDALONE_ENV: path.join(os.tmpdir(), 'intc-no-settings.env') });
const configuredEnv = (over = {}) => ({ ...over, STANDALONE_ENV: envFile() });
const URL_SECRET = 'sk-test-bearer-value';

test('realAvailableFrom: configuration (URL+bearer) is the primary signal; INTC_MODE_REAL still works', () => {
  assert.equal(realAvailableFrom(unconfiguredEnv()), false);
  assert.equal(realAvailableFrom(configuredEnv()), true);
  assert.equal(realAvailableFrom({ INTC_MODE_REAL: '1' }), true);
  assert.equal(modeFrom(configuredEnv()), 'real');
  assert.equal(modeFrom({ ...configuredEnv(), MODE: 'mock' }), 'mock');
  assert.throws(() => modeFrom({ ...unconfiguredEnv(), MODE: 'real' }), /not configured/);
  assert.match(realProblemFrom(unconfiguredEnv()), /Real mode is not configured/);
});

test('netguardAllowlist returns exactly [host] when configured, [] when not', () => {
  assert.deepEqual(netguardAllowlist(unconfiguredEnv()), []);
  assert.deepEqual(netguardAllowlist(configuredEnv({ url: 'https://gw.example/a2a' })), ['gw.example']);
  assert.deepEqual(netguardAllowlist(configuredEnv({ url: 'https://gw.example/jsonrpc' })), ['gw.example']);
});

test('POST /api/mode: 409 without config, both directions with a stubbed config', async () => {
  await withServer(async (url) => {
    const real = await post(url, '/api/mode', { source: 'real' });
    assert.equal(real.status, 409);
    const rb = await real.json();
    assert.match(rb.detail, /Real mode is not configured/);
    const ok = await post(url, '/api/mode', { source: 'mock' });
    assert.equal(ok.status, 200);
  }, { env: unconfiguredEnv() });
  await withServer(async (url) => {
    const on = await post(url, '/api/mode', { source: 'real' });
    assert.equal(on.status, 200);
    const info = await (await fetch(`${url}/api/info`)).json();
    assert.equal(info.source, 'real');
    const back = await post(url, '/api/mode', { source: 'mock' });
    assert.equal((await back.json()).source, 'mock');
  }, { env: configuredEnv() });
});

test('GET /api/info carries realAvailable and the honest hint, never the URL or bearer', async () => {
  await withServer(async (url) => {
    const j = await (await fetch(`${url}/api/info`)).json();
    assert.equal(j.realAvailable, false);
    assert.match(j.realHint, /not configured/);
    assert.ok(!JSON.stringify(j).includes('aigateway'), JSON.stringify(j));
  }, { env: unconfiguredEnv() });
  await withServer(async (url) => {
    const j = await (await fetch(`${url}/api/info`)).json();
    assert.equal(j.realAvailable, true);
  }, { env: configuredEnv() });
});

const stubFetch = (shape) => async () => ({ status: shape.status, text: async () => JSON.stringify(shape.body) });

test('resolve in real mode: each measured shape becomes the mapped decision, with hops, projection and no bearer anywhere', async () => {
  for (const [shape, decision, reasonCode] of [
    [CLEAN, 'allow', 'ALLOW-GATEWAY-CLEAN'],
    [REFUSAL, 'deny', 'DENY-GATEWAY-AGENT-REFUSED'],
    [REDACTED, 'deny', 'DENY-AIGUARD-REDACTED'],
    [BLOCKED, 'deny', 'DENY-AIGUARD-BLOCKED'],
    [NBERROR, 'allow', 'ALLOW-GATEWAY-ERROR'],
  ]) {
    await withServer(async (url) => {
      const res = await post(url, '/api/resolve', { action: 'move 200 dollars from checking to savings', intents: ['transfer-funds'] });
      assert.equal(res.status, 200);
      const j = await res.json();
      assert.equal(j.source, 'real');
      assert.equal(j.decision, decision);
      assert.equal(j.reason, reasonCode);
      assert.ok(j.decidedBy.includes('gateway'));
      assert.equal(j.matched, null);
      assert.equal(j.hops.length, 2);
      assert.equal(j.hops[1].to, 'ai-gateway');
      assert.ok(j.hops[1].request.includes('Bearer ***'));
      assert.ok(j.localProjection, 'localProjection present');
      assert.ok(['allow', 'deny'].includes(j.localProjection.decision));
      assert.ok(Array.isArray(j.localProjection.scores));
      const text = JSON.stringify(j);
      assert.ok(!text.includes(URL_SECRET), 'the bearer value never appears in the response');
      assert.ok(!text.includes('gw.example'), 'the gateway URL host never appears in the response');
    }, { env: configuredEnv(), fetchFn: stubFetch(shape) });
  }
});

test('resolve in real mode records resolve-real in the workspace runs', async () => {
  await withServer(async (url) => {
    await post(url, '/api/resolve', { action: 'move 200 dollars from checking to savings', intents: ['transfer-funds'] });
    const runs = await (await fetch(`${url}/api/runs`)).json();
    const last = runs.runs.at(-1);
    assert.equal(last.action, 'resolve-real');
    assert.equal(last.decision, 'allow');
  }, { env: configuredEnv(), fetchFn: stubFetch(CLEAN) });
});

test('resolve in real mode: unreachable gateway answers structured JSON 502, never HTML', async () => {
  await withServer(async (url) => {
    const res = await post(url, '/api/resolve', { action: 'move money', intents: ['transfer-funds'] });
    assert.equal(res.status, 502);
    const j = await res.json();
    assert.equal(j.error, 'gateway_unreachable');
    assert.equal(typeof j.message, 'string');
    assert.ok(!j.message.includes(URL_SECRET));
  }, { env: configuredEnv(), fetchFn: async () => { throw new Error('ECONNREFUSED'); } });
});

test('resolve in real mode without gateway config: 409 real_not_configured (INTC_MODE_REAL=1 with no URL+bearer)', async () => {
  await withServer(async (url) => {
    const res = await post(url, '/api/resolve', { action: 'move money' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'real_not_configured');
  }, { env: unconfiguredEnv({ INTC_MODE_REAL: '1' }) });
});

test('real mode keeps the same 400s as mock for bad action text', async () => {
  await withServer(async (url) => {
    assert.equal((await post(url, '/api/resolve', { action: '  ' })).status, 400);
    assert.equal((await post(url, '/api/resolve', { action: 'x'.repeat(2001) })).status, 400);
  }, { env: configuredEnv(), fetchFn: stubFetch(CLEAN) });
});

test('sendToAiGateway posts the A2A message/send shape with the bearer header', async () => {
  const seen = [];
  const out = await sendToAiGateway({
    action: 'move money', cfg: { configured: true, url: 'https://gw.example/a2a', bearer: URL_SECRET }, fetchFn: async (u, init) => {
      seen.push({ u: String(u), init });
      return { status: 200, text: async () => JSON.stringify(CLEAN.body) };
    },
  });
  assert.match(seen[0].u, /^https:\/\/gw\.example\/a2a\/jsonrpc$/);
  assert.equal(seen[0].init.headers.authorization, `Bearer ${URL_SECRET}`);
  assert.equal(JSON.parse(seen[0].init.body).method, 'message/send');
  assert.equal(out.mapped.decision, 'allow');
});

