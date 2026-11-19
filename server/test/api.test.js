import test from 'node:test';
import assert from 'node:assert/strict';
import { post, withServer } from './helpers.js';

const J = (r) => r.json();
const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

test('GET /api/health is demo-health/1, GET only, and names this lab', async () => {
  await withServer(async (url) => {
    const j = await (await fetch(`${url}/api/health`)).json();
    assert.equal(j.schema, 'demo-health/1');
    assert.equal(j.state, 'ready');
    assert.equal(j.demo.id, 'intent-console-lab');
    const bad = await fetch(`${url}/api/health`, { method: 'POST', headers: { origin: url } });
    assert.equal(bad.status, 405);
  });
});

test('GET /api/info: mock by default, simulated always true, real disabled with the honest reason', async () => {
  await withServer(async (url) => {
    const j = await (await fetch(`${url}/api/info`)).json();
    assert.equal(j.source, 'mock');
    assert.equal(j.simulated, true);
    assert.equal(j.realAvailable, false);
    assert.match(j.realHint, /Real mode is not configured/);
  });
});

test('POST /api/mode: exact body only, 409 with the reason when real is not enabled, both directions when it is', async () => {
  await withServer(async (url) => {
    const bad = await post(url, '/api/mode', { source: 'live' });
    assert.equal(bad.status, 400);
    const real = await post(url, '/api/mode', { source: 'real' });
    assert.equal(real.status, 409);
    const rb = await real.json();
    assert.match(rb.detail, /Real mode is not configured/);
    const ok = await post(url, '/api/mode', { source: 'mock' });
    assert.equal(ok.status, 200);
  });
  await withServer(async (url) => {
    const on = await post(url, '/api/mode', { source: 'real' });
    assert.equal(on.status, 200);
    const info = await (await fetch(`${url}/api/info`)).json();
    assert.equal(info.source, 'real');
    assert.equal(info.simulated, true, 'real mode in this lab is still a simulation — the page keeps its banner');
    const back = await post(url, '/api/mode', { source: 'mock' });
    assert.equal((await back.json()).source, 'mock');
  }, { env: { INTC_MODE_REAL: '1' } });
});

test('the seed: three intents exist on a fresh workspace, transfer-funds and pay-beneficiary are twins', async () => {
  await withServer(async (url) => {
    const j = await (await fetch(`${url}/api/intents`)).json();
    const names = j.intents.map((i) => i.ObjectMeta.Name).sort();
    assert.deepEqual(names, ['check-balance', 'pay-beneficiary', 'transfer-funds']);
    const tf = j.intents.find((i) => i.ObjectMeta.Name === 'transfer-funds');
    assert.deepEqual(tf.Spec.Twins, ['pay-beneficiary']);
    assert.equal(typeof tf.Spec.Floor, 'number');
    assert.ok(Array.isArray(tf.Spec.Exemplars) && tf.Spec.Exemplars.length > 0);
    assert.equal(tf.Status.Validation, 'Valid');
    assert.ok(tf.Status.ValidatedAt);
  });
});

test('CRUD: create with validation, duplicate 400/409, update refreshes status, delete, 404s', async () => {
  await withServer(async (url) => {
    const created = await post(url, '/api/intents', { name: 'open-account', Spec: { Description: 'Open a new account for a customer.', Exemplars: ['start a brand new deposit relationship'], Twins: [], Acts: true, Floor: 0.8 } });
    assert.equal(created.status, 201);
    const ci = await created.json();
    assert.equal(ci.intent.ObjectMeta.Name, 'open-account');
    assert.equal(ci.intent.Status.Validation, 'Valid');

    const dup = await post(url, '/api/intents', { name: 'open-account', Spec: { Description: 'x', Exemplars: ['y'] } });
    assert.equal(dup.status, 409);

    const noExemplar = await post(url, '/api/intents', { name: 'no-ex', Spec: { Description: 'x', Exemplars: [] } });
    assert.equal(noExemplar.status, 400);
    assert.match((await noExemplar.json()).detail, /at least one example/);

    const badFloor = await post(url, '/api/intents', { name: 'bad-floor', Spec: { Description: 'x', Exemplars: ['y'], Floor: 7 } });
    assert.equal(badFloor.status, 400);

    const up = await fetch(`${url}/api/intents/open-account`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ Spec: { Description: 'Open a new account.', Exemplars: ['start a brand new deposit relationship'], Twins: ['transfer-funds'], Acts: true, Floor: 0.75 } }) });
    assert.equal(up.status, 200);
    const ui = await up.json();
    assert.deepEqual(ui.intent.Spec.Twins, ['transfer-funds']);

    // Twin warning now that transfer-funds exists but shares no words
    assert.ok(ui.intent.Status.Warnings.some((w) => /shares no words/.test(w)), JSON.stringify(ui.intent.Status.Warnings));

    const del = await fetch(`${url}/api/intents/open-account`, { method: 'DELETE', headers: { origin: url } });
    assert.equal(del.status, 200);
    const gone = await fetch(`${url}/api/intents/open-account`);
    assert.equal(gone.status, 404);
  });
});

test('revalidate resolves twin warnings once both intents exist', async () => {
  await withServer(async (url) => {
    const created = await post(url, '/api/intents', { name: 'open-account', Spec: { Description: 'Open accounts.', Exemplars: ['start a brand new deposit relationship'], Twins: ['transfer-funds'] } });
    const withWarn = await created.json();
    assert.ok(withWarn.intent.Status.Warnings.length > 0);
    const rv = await post(url, '/api/intents/revalidate', {});
    assert.equal(rv.status, 200);
    const list = await rv.json();
    assert.ok(list.intents.every((i) => i.Status.Validation === 'Valid'));
  });
});

test('GET/PUT /api/app-config: modelAIIntentConfig shape, loopback-only encoder, exact body', async () => {
  await withServer(async (url) => {
    const j = await (await fetch(`${url}/api/app-config`)).json();
    assert.deepEqual(j.config, { Disabled: false, IntentIDs: [], Encoder: { URL: 'http://127.0.0.1:7825/encoder', TimeoutMS: 2000, FailClosed: true } });
    const put = await fetch(`${url}/api/app-config`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ IntentIDs: ['transfer-funds', 'pay-beneficiary'], Encoder: { URL: 'http://127.0.0.1:7825/encoder', TimeoutMS: 1500, FailClosed: false } }) });
    assert.equal(put.status, 200);
    const c = await put.json();
    assert.deepEqual(c.config.IntentIDs, ['transfer-funds', 'pay-beneficiary']);
    assert.equal(c.config.Encoder.FailClosed, false);
    const remote = await fetch(`${url}/api/app-config`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ Encoder: { URL: 'http://example.invalid:9999' } }) });
    assert.equal(remote.status, 400);
    const badTimeout = await fetch(`${url}/api/app-config`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ Encoder: { TimeoutMS: 3 } }) });
    assert.equal(badTimeout.status, 400);
  });
});

test('POST /api/resolve: the six scenario decisions come out as advertised, with hops and scores', async () => {
  await withServer(async (url) => {
    const run = (action, intents, failClosed) => post(url, '/api/resolve', { action, intents, failClosed });
    const r1 = await (await run('move 200 dollars from checking to savings', ['transfer-funds'])).json();
    assert.equal(r1.decision, 'allow'); assert.equal(r1.matched, 'transfer-funds'); assert.ok(r1.hops.length >= 3);

    const r2 = await (await run('show my account balance', ['check-balance'])).json();
    assert.equal(r2.decision, 'deny'); assert.equal(r2.matched, 'check-balance'); assert.equal(r2.reason, 'intent_readonly');

    const r3 = await (await run('send money to my savings and to my landlord', ['transfer-funds', 'pay-beneficiary'])).json();
    assert.equal(r3.decision, 'deny'); assert.equal(r3.matched, null); assert.equal(r3.reason, 'ambiguous_twins');

    const r4 = await (await run('book a flight to Chicago', ['transfer-funds'])).json();
    assert.equal(r4.decision, 'deny'); assert.equal(r4.reason, 'below_floor');

    const r5 = await (await run('transfer funds between my accounts', [])).json();
    assert.equal(r5.decision, 'deny'); assert.equal(r5.reason, 'no_intents_selected');

    const r6 = await (await run('book a flight to Chicago', ['transfer-funds'], false)).json();
    assert.equal(r6.decision, 'allow'); assert.equal(r6.reason, 'below_floor_failopen');

    const empty = await post(url, '/api/resolve', { action: '  ' });
    assert.equal(empty.status, 400);
    const long = await post(url, '/api/resolve', { action: 'x'.repeat(2001) });
    assert.equal(long.status, 400);
  });
});

test('the workspace keeps intents apart: a delete in one workspace does not touch another', async () => {
  await withServer(async (url) => {
    const H = { 'x-workspace': 'visitor-a' };
    await fetch(`${url}/api/intents/check-balance`, { method: 'DELETE', headers: { origin: url, ...H } });
    const a = (await (await fetch(`${url}/api/intents`, { headers: H })).json());
    assert.deepEqual(a.intents.map((i) => i.ObjectMeta.Name).sort(), ['pay-beneficiary', 'transfer-funds']);
    const b = (await (await fetch(`${url}/api/intents`, { headers: { 'x-workspace': 'visitor-b' } })).json());
    assert.equal(b.intents.length, 3);
    const badWs = await fetch(`${url}/api/intents`, { headers: { 'x-workspace': 'BAD WORKSPACE' } });
    assert.equal(badWs.status, 400);
  });
});

test('encoder probe: /api/encoder/info is the KServe v2 model_info shape; /api/encoder/infer bounds input', async () => {
  await withServer(async (url) => {
    const mi = await (await fetch(`${url}/api/encoder/info`)).json();
    assert.equal(mi.name, 'intent-encoder');
    assert.equal(mi.outputs[0].shape[1], 384);
    const inf = await post(url, '/api/encoder/infer', { inputs: [{ name: 'TEXT', data: ['move money'] }] });
    assert.equal(inf.status, 200);
    const ij = await inf.json();
    assert.equal(ij.outputs[0].shape[0], 1);
    assert.equal(ij.outputs[0].data.length, 384);
    const tooMany = await post(url, '/api/encoder/infer', { inputs: [{ name: 'TEXT', data: ['x'] }, { name: 'TEXT', data: ['x'] }, { name: 'TEXT', data: ['x'] }, { name: 'TEXT', data: ['x'] }, { name: 'TEXT', data: ['x'] }] });
    assert.equal(tooMany.status, 400);
    const notText = await post(url, '/api/encoder/infer', { inputs: [{ name: 'TEXT', data: [42] }] });
    assert.equal(notText.status, 400);
  });
});

test('reset restores the seed: delete everything, reset, all three are back', async () => {
  await withServer(async (url) => {
    for (const n of ['transfer-funds', 'pay-beneficiary', 'check-balance']) await fetch(`${url}/api/intents/${n}`, { method: 'DELETE', headers: { origin: url } });
    assert.equal((await (await fetch(`${url}/api/intents`)).json()).intents.length, 0);
    const rs = await post(url, '/api/reset', {});
    assert.equal(rs.status, 200);
    assert.equal((await (await fetch(`${url}/api/intents`)).json()).intents.length, 3);
  }, { now: () => NOW });
});

test('safety: foreign Host is 403, cross-origin write is 403, 404s are JSON', async () => {
  await withServer(async (url) => {
    const cross = await fetch(`${url}/api/intents`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
    assert.equal(cross.status, 403);
    const nf = await fetch(`${url}/api/nope`);
    assert.equal(nf.status, 404);
    assert.equal((await nf.json()).error, 'not_found');
  });
  const { rawHttp } = await import('./helpers.js');
  await withServer(async (url) => {
    const r = await rawHttp(`${url}/api/intents`, { method: 'GET', headers: { Host: 'evil.example' } });
    assert.equal(r.status, 403);
  });
});
