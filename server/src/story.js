// All page text in one place. Facts carry a status: measured (we did it on a real system), inferred
// (the doc says it, we saw consistent evidence) or UNVERIFIED (we never tested it). A doctor check fails
// on any fact with no status, and on any scenario that does not teach what it says it teaches.
export const TITLE = 'AI Intents Console Lab';
export const INTRO = 'The PingOne Privilege console lets an admin define AI Intents: named purposes with example phrases, threshold floors and twin intents it must be told apart from. An application that selects intents gets each agent action matched against them through an encoder sidecar. This lab rebuilds that page as a simulation: the shapes come from the console API (measured), the resolution engine is ours, and every product behaviour we could not test is labelled UNVERIFIED.';
export const BANNER = 'SIMULATION: the intent table, encoder and diagram are mock/stand-in (a hashed character-trigram vector, not a trained model) and the mock engine is lab-invented. In Real mode the decision comes from the tenant\'s live AI Gateway; everything else stays simulated. For education.';
export const REAL_BANNER = 'REAL MODE: each Resolve probe is sent to the tenant\'s live AI Gateway and the verdict shown is the gateway\'s own (allow, agent refusal, AI Guard block). The console API and the encoder are still simulated: the intent table, the encoder probe and the diagram do not contact anything.';

export const PRODUCTS = [
  { id: 'intents', name: 'AI Intents', blurb: 'Named intents with exemplars, twins, floors' },
  { id: 'app-config', name: 'App config', blurb: 'modelAIIntentConfig: which intents, which encoder' },
  { id: 'encoder', name: 'Encoder sidecar', blurb: 'KServe v2 wire, stand-in model' },
  { id: 'resolution', name: 'Resolution', blurb: 'Score, floor, twins, Acts, fail-closed' },
];

export const FACTS = [
  { id: 'shapes', status: 'measured', text: 'The console API exposes aiintents with Spec { Description, Exemplars, Twins, Patterns, Acts, Floor } and Status { Validation, Error, ValidatedAt, Warnings }, plus per-app modelAIIntentConfig { IntentIDs, Encoder { URL, TimeoutMS, FailClosed } } — read from the console swagger (imodelAIIntent*, modelAIIntent*) on 2026-11-18.' },
  { id: 'empty-tenant', status: 'measured', text: 'Our tenant defined zero AI intents at export time (2026-11-17): every intent on this page is lab-authored.' },
  { id: 'kserve', status: 'measured', text: 'The console probes an encoder endpoint on the NVIDIA Triton inference-server wire (KServe v2: /v2, /model_info, /get_worker_address) — observed on the coding-agents lab, 2026-11-06.' },
  { id: 'encoder-standin', status: 'measured', text: 'The lab page\'s encoder is a KServe-v2 stand-in (trigram vector); the gateway\'s encoder side is now real: nomic-embed-text-v1.5 (768 dims) behind a KServe-v2 proxy at intent-encoder:8000 in the tenant namespace, deployed 2026-11-19. What similarity function and thresholds the real product applies on top is still UNVERIFIED.' },
  { id: 'tenant-blocker', status: 'measured', text: 'Tenant-side status 2026-11-19: the TenantProfile (CodingAgent.AIIntent) now points the gateway at the real encoder and the three lab intents exist and validate clean on the console (0 warnings). The gateways still read the stale config: their store logs "Tenant not found ... Retrying" for this tenant (tenant_profile.wtch.go) and never picked up the update across two restarts and 30+ minutes. Tracked in deploy/INTENT-ENCODER-TENANT-SETUP.md.' },
  { id: 'resolution', status: 'UNVERIFIED', text: 'How the product turns scores, Floors, Twins, Acts and FailClosed into an allow/deny is UNVERIFIED. The lab states its own reading on every decision.' },
  { id: 'acts', status: 'UNVERIFIED', text: 'The meaning of Spec.Acts in the product is UNVERIFIED. The lab reads it as "this intent authorizes an action" (true) versus "this intent only describes" (false).' },
  { id: 'failclosed', status: 'UNVERIFIED', text: 'The meaning of Encoder.FailClosed in the product is UNVERIFIED. The lab reads it as "deny when nothing matches" (true) versus "allow when nothing matches" (false).' },
  { id: 'twins', status: 'UNVERIFIED', text: 'How the product uses Spec.Twins is UNVERIFIED. The lab treats a twin pair within 0.05 similarity of each other, both over their floors, as ambiguous and denies.' },
];

export const SCENARIOS = [
  {
    id: 'acts-allow',
    title: 'A matched acting intent allows',
    lesson: 'An action whose text lands over the intent\'s Floor on an Acts=true intent is allowed, bound to that intent.',
    steps: ['Define or pick the transfer-funds intent (Acts on, Floor 0.7).', 'Ask the resolver: "move 200 dollars from checking to savings".', 'See the trail: embed, score, over floor, allow.'],
    run: { action: 'move 200 dollars from checking to savings', intents: ['transfer-funds'] },
    expect: { decision: 'allow', matched: 'transfer-funds' },
  },
  {
    id: 'readonly-deny',
    title: 'A read-only intent refuses a write-shaped action',
    lesson: 'check-balance is Acts=false. The lab reads that as "describes, does not authorize": an action matched only by it is denied as read-only.',
    steps: ['Pick only check-balance (Acts off).', 'Ask the resolver: "show my account balance".', 'The trail ends deny (Acts=false).'],
    run: { action: 'show my account balance', intents: ['check-balance'] },
    expect: { decision: 'deny', matched: 'check-balance' },
  },
  {
    id: 'twins-ambiguous',
    title: 'Twin intents within a hair are ambiguous',
    lesson: 'transfer-funds and pay-beneficiary are declared twins. An action that lands over both floors with less than 0.05 between them is refused rather than guessed — money must not move on a coin flip.',
    steps: ['Pick transfer-funds AND pay-beneficiary (twins of each other).', 'Ask: "send money to my savings account".', 'Both score over their floors and close together: deny (ambiguous twins).'],
    run: { action: 'send money to my savings and to my landlord', intents: ['transfer-funds', 'pay-beneficiary'] },
    expect: { decision: 'deny', matched: null },
  },
  {
    id: 'floor-deny',
    title: 'Below the floor nothing matches',
    lesson: 'An action that does not resemble any exemplar scores under every Floor. Fail-closed (the default) denies; fail-open would allow with "no intent matched".',
    steps: ['Pick transfer-funds only.', 'Ask: "book a flight to Chicago".', 'The trail shows the score under the floor and the fail-closed deny.'],
    run: { action: 'book a flight to Chicago', intents: ['transfer-funds'] },
    expect: { decision: 'deny', matched: null },
  },
  {
    id: 'none-selected',
    title: 'An app that selects no intents has no intent resolution',
    lesson: 'Empty IntentIDs means NO intents can match — the lab reads it as "this app has no intent policy", so fail-closed denies everything. There is no "empty means all".',
    steps: ['Leave IntentIDs empty.', 'Ask anything.', 'deny (no intents selected), whatever the text says.'],
    run: { action: 'transfer funds between my accounts', intents: [] },
    expect: { decision: 'deny', matched: null },
  },
  {
    id: 'failopen',
    title: 'Fail-open lets unmatched text through',
    lesson: 'With Encoder.FailClosed=false, an action under every floor is allowed with "no intent matched" — the lab shows why fail-open on a payments app is a bad default.',
    steps: ['Pick transfer-funds, switch FailClosed off.', 'Ask: "book a flight to Chicago".', 'allow with reason below_floor_failopen.'],
    run: { action: 'book a flight to Chicago', intents: ['transfer-funds'], failClosed: false },
    expect: { decision: 'allow', matched: null },
  },
];

export const TALK_TRACK = [
  { title: 'What this page is', say: 'The Privilege console has an AI Intents page: an admin names a purpose, gives example phrases, sets a similarity floor, and declares twin intents it must be told apart from. Applications then select intents, and each agent action is matched through an encoder. This lab is that page, rebuilt from the console API shapes we measured.' },
  { title: 'The shapes are the product\'s', say: 'Description, Exemplars, Twins, Patterns, Acts, Floor; Status with Validation and Warnings; the per-app config with IntentIDs and the Encoder sidecar. All of it read off the console swagger, not invented. Our tenant defined zero intents, so every intent here is lab-authored.' },
  { title: 'The encoder is a stand-in', say: 'We measured the console probing a Triton-style encoder over KServe v2. The lab ships the same wire shape but a hashed trigram vector instead of a trained model — deterministic, offline, honest. What the product does with the vector is labelled UNVERIFIED everywhere.' },
  { title: 'The decision engine is ours', say: 'Score, floor, twins, Acts, fail-closed: each step is a hop in the trail with the lab\'s own reading stated. The demo\'s key beat is the twin pair: two money intents within 0.05 of each other are refused, not guessed.' },
  { title: 'What to leave with', say: 'Intents turn "what did the agent do" into "what was the agent for". If you can name the purpose and its confusable twin, you can deny the ambiguity instead of allowing a guess.' },
];

export const RELABEL_RULE = null;
export const ALERT_RULES = [];
export const TOOLS = [];

export const rawStory = () => ({ title: TITLE, intro: INTRO, banner: BANNER, realBanner: REAL_BANNER, products: PRODUCTS, facts: FACTS, scenarios: SCENARIOS, talkTrack: TALK_TRACK });

// The story with the cast filled in. {{cast}} tokens still work (rule 10) even though the intents text
// currently uses none; a doctor check fails on any unfilled token if text gains one.
import { fillDeep } from './cast.js';
export function buildStory(cast) {
  const s = rawStory();
  return { ...fillDeep(s, cast), tokenLabel: 'MOCK intents and MOCK identifiers: for education, never real product output', cast };
}

// docs/talk-track.md is generated from the same data the UI reads (`npm run talk-track`); a test fails if they drift.
export function renderTalkTrackMarkdown(cast) {
  const s = buildStory(cast);
  const parts = ['# Talk track', '', '<!-- Generated from server/src/story.js by `npm run talk-track`. Do not edit by hand. -->', ''];
  for (const t of s.talkTrack) parts.push(`## ${t.title}`, '', t.say, '');
  parts.push('## The scenarios', '');
  s.scenarios.forEach((sc, i) => parts.push(`${i + 1}. **${sc.title}.** ${sc.lesson}`));
  return `${parts.join('\n')}\n`;
}
export { SCENARIOS as RAW_SCENARIOS };
