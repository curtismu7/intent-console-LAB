import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_CAST, VERTICALS, unfilled } from '../src/cast.js';
import { buildStory, rawStory, renderTalkTrackMarkdown, FACTS, SCENARIOS, PRODUCTS } from '../src/story.js';

test('every {{token}} in the story is defined in every vertical pack', () => {
  const text = JSON.stringify(rawStory());
  for (const [name, cast] of Object.entries(VERTICALS)) assert.deepEqual(unfilled(text, cast), [], name);
  assert.ok(!JSON.stringify(buildStory(DEFAULT_CAST)).includes('{{'));
});

test('docs/talk-track.md is exactly what the data generates (no drift)', () => {
  const doc = fs.readFileSync(new URL('../../docs/talk-track.md', import.meta.url), 'utf8');
  assert.equal(doc, renderTalkTrackMarkdown(DEFAULT_CAST));
});

test('every fact carries a status label; product claims are marked', () => {
  assert.ok(FACTS.length >= 6);
  for (const f of FACTS) assert.ok(['measured', 'inferred', 'UNVERIFIED'].includes(f.status), f.id);
  const unverified = FACTS.filter((f) => f.status === 'UNVERIFIED');
  assert.ok(unverified.some((f) => /encoder|resolution|Acts|FailClosed|Twins/.test(f.text)), 'the engine mapping is UNVERIFIED, not passed off as product behaviour');
});

test('every scenario names a runnable action with an expect the harness can check', () => {
  for (const sc of SCENARIOS) {
    assert.ok(sc.run && typeof sc.run.action === 'string' && Array.isArray(sc.run.intents), sc.id);
    assert.ok(sc.expect && typeof sc.expect.decision === 'string', sc.id);
    assert.ok(sc.lesson && sc.title, sc.id);
  }
});

test('the banner and intro say what is simulated', () => {
  const s = buildStory(DEFAULT_CAST);
  assert.match(s.banner, /SIMULATION/);
  assert.match(s.banner, /Real mode the decision comes from the tenant's live AI Gateway/);
  assert.match(s.tokenLabel, /MOCK/);
  assert.ok(s.products.length >= 4);
});
