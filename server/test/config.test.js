import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { modeFrom, realAvailableFrom, realProblemFrom } from '../src/config.js';

// Isolate from the developer's shared settings file: without Real config, Mock is the default.
const NO_ENV = path.join(os.tmpdir(), 'intc-config-test-unconfigured.env');

test('MODE defaults to Mock when Real is not configured; only mock/real accepted; real needs config or INTC_MODE_REAL=1', () => {
  assert.equal(modeFrom({ STANDALONE_ENV: NO_ENV }), 'mock');
  assert.equal(modeFrom({ MODE: 'mock' }), 'mock');
  assert.throws(() => modeFrom({ STANDALONE_ENV: NO_ENV, MODE: 'real' }), /not configured/, 'Real requested without config is refused, never a silent fallback');
  assert.equal(modeFrom({ INTC_MODE_REAL: '1' }), 'real');
  assert.equal(modeFrom({ INTC_MODE_REAL: '1', MODE: 'mock' }), 'mock');
  assert.equal(modeFrom({ INTC_MODE_REAL: '1', MODE: 'real' }), 'real');
  for (const MODE of ['live', 'prod', 'Mock', 'x']) assert.throws(() => modeFrom({ INTC_MODE_REAL: '1', MODE }), /not available/, MODE);
});

test('realAvailable reflects the gateway config or the opt-in; the problem text names what to set', () => {
  assert.equal(realAvailableFrom({ STANDALONE_ENV: NO_ENV }), false);
  assert.equal(realAvailableFrom({ INTC_MODE_REAL: '1' }), true);
  assert.match(realProblemFrom({ STANDALONE_ENV: NO_ENV }), /Real mode is not configured/);
  assert.match(realProblemFrom({ STANDALONE_ENV: NO_ENV }), /INTC_AIGATEWAY_URL/);
});
