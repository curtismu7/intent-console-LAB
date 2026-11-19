// Builds content-pack.json for the Learning Hub from the story data, so the pack cannot drift from the lab.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CAST } from '../server/src/cast.js';
import { buildStory } from '../server/src/story.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

export function buildPack() {
  const story = buildStory(DEFAULT_CAST);
  const sid = (n) => `S${String(n).padStart(2, '0')}`;
  const terms = {
    'acts-allow': ['ai-intent'], 'readonly-deny': ['ai-intent'], 'twins-ambiguous': ['twin-intents'],
    'floor-deny': ['similarity-floor'], 'none-selected': ['fail-closed'], 'failopen': ['fail-closed'],
  };
  return {
    schema: 'demo-content-pack/1',
    id: 'intent-console-lab',
    title: 'AI Intents Console Lab',
    version,
    demo: { id: 'intent-console-lab', name: 'AI Intents Console Lab', catalog: 'D134', baseUrl: 'http://localhost:7825', doctor: '/api/health', tags: ['pingone-privilege', 'ai-agent-security', 'ai-intents', 'agent-governance', 'mock-only'] },
    glossary: [
      { id: 'ai-intent', term: 'AI Intent', definition: 'A named purpose for an agent action, with example phrases (exemplars), a similarity floor, and twin intents it must be told apart from. Shapes from the Privilege console swagger (imodelAIIntent*); the lab\'s resolution engine over them is lab-invented.', aliases: ['intent'] },
      { id: 'twin-intents', term: 'Twin intents', definition: 'Two intents declared as confusable (Spec.Twins on both). The lab denies an action that lands over both floors within 0.05 of each other rather than guessing.', aliases: ['twins'] },
      { id: 'similarity-floor', term: 'Floor', definition: 'Spec.Floor: the minimum encoder similarity for an action to match an intent. Each intent carries its own.', aliases: ['threshold'] },
      { id: 'fail-closed', term: 'Fail-closed', definition: 'Encoder.FailClosed on: when no intent matches, deny. Off (fail-open): allow with "no intent matched" — shown in the lab as a bad default for a payments app.', aliases: ['fail-open'] },
    ],
    sources: [
      { id: 'console-swagger', title: 'PingOne Privilege console swagger (imodelAIIntent*, modelAIIntent*)', url: 'https://console-swagger.invalid', kind: 'product-doc', use: 'The Spec/Status and per-app config shapes this lab simulates, measured on the console swagger 2026-11-18 (host not named here per the family safety rule).', status: 'read', checked: '2026-11-18' },
      { id: 'kserve', title: 'KServe v2 inference protocol (Triton wire)', url: 'https://kserve.github.io/website/', kind: 'standard', use: 'The encoder sidecar wire shape; the lab\'s model is a stand-in.', status: 'not-read', checked: '2026-11-18' },
    ],
    cards: [
      ...story.scenarios.map((sc, i) => ({ id: `try-${sc.id}`, label: `Scenario ${i + 1}: ${sc.title}`, description: sc.lesson, group: 'try-it', action: { type: 'route', href: `/#try-${sc.id}` }, terms: terms[sc.id], story: sid(i + 1) })),
      { id: 'concept-intents', label: 'Define intents', description: 'Exemplars, twins, floor and Acts on the console-shaped form.', group: 'concept', action: { type: 'route', href: '/#intents' }, terms: ['ai-intent'] },
      { id: 'concept-encoder', label: 'The encoder sidecar', description: 'The KServe v2 wire with a hashed-trigram stand-in model.', group: 'concept', action: { type: 'route', href: '/#encoder' }, terms: [] },
      { id: 'ref-doctor', label: 'Doctor and health', description: 'Preflight checks and the demo-health/1 endpoint.', group: 'setup', action: { type: 'route', href: '/api/health' } },
    ],
    stories: story.scenarios.map((sc, i) => ({ id: sid(i + 1), title: sc.title, say: sc.lesson })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`);
}
