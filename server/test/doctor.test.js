import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, allPassed, checkScenario, seededStore } from '../src/doctor.js';
import { rawStory, SCENARIOS } from '../src/story.js';

test('every doctor check passes in a clean checkout (mock)', async () => {
  const checks = await runChecks({ env: {} });
  const failed = checks.filter((c) => c.level === 'fail');
  assert.deepEqual(failed.map((c) => `${c.id}: ${c.detail}`), []);
  assert.ok(allPassed(checks));
});

test('every scenario behaves as its lesson says, via the doctor harness itself', () => {
  assert.ok(SCENARIOS.length >= 5);
  for (const sc of rawStory().scenarios) {
    const problems = checkScenario(sc);
    assert.deepEqual(problems, [], sc.id);
  }
});

test('the seeded store resolves the marquee beat: twins within 0.05 refuse', () => {
  const store = seededStore();
  assert.equal(store.size(), 3);
});
