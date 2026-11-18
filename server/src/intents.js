// The AIIntent store, per workspace (rule 13). An AIIntent's shape comes from the console swagger
// (imodelAIIntent / imodelAIIntentSpec / imodelAIIntentStatus, measured 2026-11-18):
//   Spec: Description, Exemplars[], Twins[], Patterns[], Acts (bool), Floor (number)
//   Status: Validation, Error, ValidatedAt, Warnings[]
// The shapes are the product's; everything the lab computes from them (validation, resolution) is
// lab-invented and labelled as such. The owner tenant's export was empty — zero shipped intents.
import { cleanText } from './safety.js';
import { scoreAgainst } from './encoder.js';

export const MAX_INTENTS = 50;
export const MAX_STRINGS = 40;
export const MAX_STRING_LEN = 200;
export const MAX_DESC_LEN = 500;
export const FLOOR_DEFAULT = 0.72;
export const VALIDATION_OK = 'Valid';

const NAME = /^[a-z][a-z0-9-]{0,39}$/;

const oneString = (v, max) => (typeof v === 'string' ? cleanText(v, max) : null);
const stringArray = (v, max) => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_STRINGS) return null;
  const out = [];
  for (const item of v) {
    const s = oneString(item, max);
    if (s === null || !s) return null;
    out.push(s);
  }
  return out;
};

// Validate one intent body for create/update. Returns { value } or { error, detail }.
// Lab rule (labelled): an intent needs a name, a description, and at least one exemplar; Floor is 0..1.
export function validateIntent(name, body) {
  if (typeof name !== 'string' || !NAME.test(name)) return { error: 'bad_name', detail: 'name must be 1-40 chars of a-z 0-9 -, starting with a letter' };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad_body', detail: 'body must be an object' };
  const spec = body.Spec && typeof body.Spec === 'object' && !Array.isArray(body.Spec) ? body.Spec : body;
  const description = oneString(spec.Description, MAX_DESC_LEN);
  if (!description) return { error: 'bad_description', detail: `Spec.Description is required (max ${MAX_DESC_LEN} chars)` };
  const exemplars = stringArray(spec.Exemplars, MAX_STRING_LEN);
  if (exemplars === null) return { error: 'bad_exemplars', detail: `Spec.Exemplars must be an array of at most ${MAX_STRINGS} non-empty strings (max ${MAX_STRING_LEN} chars each)` };
  if (exemplars.length === 0) return { error: 'bad_exemplars', detail: 'Spec.Exemplars needs at least one example phrase — an intent with no exemplar cannot match anything (lab rule, enforced)' };
  const twins = stringArray(spec.Twins, MAX_STRING_LEN);
  if (twins === null) return { error: 'bad_twins', detail: `Spec.Twins must be an array of at most ${MAX_STRINGS} strings` };
  const patterns = stringArray(spec.Patterns, MAX_STRING_LEN);
  if (patterns === null) return { error: 'bad_patterns', detail: `Spec.Patterns must be an array of at most ${MAX_STRINGS} strings` };
  let floor = spec.Floor;
  if (floor === undefined || floor === null || floor === '') floor = FLOOR_DEFAULT;
  if (typeof floor !== 'number' || !Number.isFinite(floor) || floor < 0 || floor > 1) return { error: 'bad_floor', detail: 'Spec.Floor must be a number between 0 and 1' };
  if (spec.Acts !== undefined && typeof spec.Acts !== 'boolean') return { error: 'bad_acts', detail: 'Spec.Acts must be a boolean' };
  return {
    value: {
      ObjectMeta: { Name: name, Namespace: 'default' },
      Spec: { Description: description, Exemplars: exemplars, Twins: twins, Patterns: patterns, Acts: spec.Acts === undefined ? true : spec.Acts, Floor: floor },
      State: body.State === 'Disabled' ? 'Disabled' : 'Active',
      Source: 'lab',
    },
  };
}

// The lab's validation pass (the console records Status.Validation / Warnings): what the lab can check locally.
// Lab-invented checks, labelled as such in the UI. Every warning also names the twin it flags, if any.
export function validateIntentAgainst(intents, name) {
  const intent = intents.get(name);
  if (!intent) return null;
  const warnings = [];
  // Twins that do not exist yet are recorded as warnings, not errors.
  for (const t of intent.Spec.Twins) if (!intents.has(t)) warnings.push(`Twin "${t}" is not defined yet — disambiguation against it cannot run (lab check)`);
  // Twins that share no exemplar vocabulary with this intent make disambiguation meaningless. Lab-invented heuristic.
  for (const t of intent.Spec.Twins) {
    const twin = intents.get(t);
    if (!twin) continue;
    const twinWords = new Set(twin.Spec.Exemplars.join(' ').toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    const mine = intent.Spec.Exemplars.join(' ').toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const shared = mine.filter((w) => twinWords.has(w));
    if (shared.length === 0) warnings.push(`Twin "${t}" shares no words with this intent's exemplars — check that the pair is really confusable (lab heuristic)`);
  }
  // A very low floor matches almost anything.
  if (intent.Spec.Floor < 0.4) warnings.push(`Floor ${intent.Spec.Floor} is low: near-threshold scores will match (lab check)`);
  return {
    Validation: VALIDATION_OK,
    Warnings: warnings,
    ValidatedAt: null, // filled by the caller with its clock
    Error: null,
  };
}

export function createIntentStore({ now = Date.now } = {}) {
  const map = new Map(); // name -> { ...imodelAIIntent, Status }
  return {
    list() { return [...map.values()].sort((a, b) => a.ObjectMeta.Name.localeCompare(b.ObjectMeta.Name)); },
    get(name) { return map.get(name) || null; },
    has(name) { return map.has(name); },
    create(body) {
      if (map.size >= MAX_INTENTS) return { error: 'too_many', detail: `at most ${MAX_INTENTS} intents per workspace` };
      const v = validateIntent(body?.ObjectMeta?.Name ?? body?.name, body);
      if (v.error) return v;
      if (map.has(v.value.ObjectMeta.Name)) return { error: 'exists', detail: `intent "${v.value.ObjectMeta.Name}" already exists (names are immutable; delete and recreate)` };
      map.set(v.value.ObjectMeta.Name, v.value);
      const intent = { ...v.value, Status: validateIntentAgainst(map, v.value.ObjectMeta.Name) };
      intent.Status.ValidatedAt = new Date(now()).toISOString();
      map.set(intent.ObjectMeta.Name, intent);
      return { value: intent };
    },
    update(name, body) {
      if (!map.has(name)) return { error: 'not_found', detail: `intent "${name}" does not exist` };
      const v = validateIntent(name, body);
      if (v.error) return v;
      map.set(name, { ...v.value, ObjectMeta: { ...v.value.ObjectMeta, Name: name } });
      const status = validateIntentAgainst(map, name);
      status.ValidatedAt = new Date(now()).toISOString();
      const intent = { ...v.value, ObjectMeta: { ...v.value.ObjectMeta, Name: name }, Status: status };
      map.set(name, intent);
      return { value: intent };
    },
    // PUT-style refresh of every status (a new twin may resolve an old warning).
    revalidate() {
      for (const name of map.keys()) {
        const status = validateIntentAgainst(map, name);
        status.ValidatedAt = new Date(now()).toISOString();
        map.set(name, { ...map.get(name), Status: status });
      }
    },
    remove(name) { return map.delete(name) ? { value: true } : { error: 'not_found', detail: `intent "${name}" does not exist` }; },
    size() { return map.size; },
  };
}

// The seed set the lab starts with (reset restores these). Three intents with a real twin pair, so the
// disambiguation story can be told on a fresh workspace. All lab-authored; the names are .example-class words.
export function seedIntents() {
  return [
    { name: 'transfer-funds', Spec: { Description: 'Move money between the customer\'s own accounts.', Exemplars: ['move 200 dollars from checking to savings', 'transfer funds between my accounts', 'send money to my savings account'], Twins: ['pay-beneficiary'], Patterns: [], Acts: true, Floor: 0.7 }, State: 'Active' },
    { name: 'pay-beneficiary', Spec: { Description: 'Send money to another person on the beneficiary list.', Exemplars: ['pay the plumber 150 dollars', 'send 500 to my landlord', 'make a payment to a beneficiary'], Twins: ['transfer-funds'], Patterns: [], Acts: true, Floor: 0.7 }, State: 'Active' },
    { name: 'check-balance', Spec: { Description: 'Read the balance of an account without changing anything.', Exemplars: ['what is my balance', 'how much is in checking', 'show my account balance'], Twins: [], Patterns: [], Acts: false, Floor: 0.7 }, State: 'Active' },
  ];
}
