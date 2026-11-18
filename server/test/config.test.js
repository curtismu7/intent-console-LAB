import test from 'node:test';
import assert from 'node:assert/strict';
import { modeFrom, realAvailableFrom, realProblemFrom } from '../src/config.js';

test('MODE defaults to Mock (this lab has no live mode); only mock/real accepted; real needs INTC_MODE_REAL=1', () => {
  assert.equal(modeFrom({}), 'mock');
  assert.equal(modeFrom({ MODE: 'mock' }), 'mock');
  assert.throws(() => modeFrom({ MODE: 'real' }), /INTC_MODE_REAL/, 'Real requested without the opt-in is refused, never a silent fallback');
  assert.equal(modeFrom({ INTC_MODE_REAL: '1' }), 'real');
  assert.equal(modeFrom({ INTC_MODE_REAL: '1', MODE: 'mock' }), 'mock');
  assert.equal(modeFrom({ INTC_MODE_REAL: '1', MODE: 'real' }), 'real');
  for (const MODE of ['live', 'prod', 'Mock', 'x']) assert.throws(() => modeFrom({ INTC_MODE_REAL: '1', MODE }), /not available/, MODE);
});

test('realAvailable reflects only the opt-in; the problem text is honest about no live mode', () => {
  assert.equal(realAvailableFrom({}), false);
  assert.equal(realAvailableFrom({ INTC_MODE_REAL: '1' }), true);
  assert.match(realProblemFrom({}), /no live mode/);
  assert.match(realProblemFrom({}), /INTC_MODE_REAL/);
});
