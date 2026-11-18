// The resolution engine: action text in, one intent (or none) out, with the decision trail.
// Everything here is LAB-INVENTED over the console's shapes (Spec.Floor, Spec.Twins, Spec.Acts,
// modelAIIntentConfig.FailClosed). How the real product resolves intents is UNVERIFIED; the lab's
// mapping is labelled as such in the UI and in story.js.
import { scoreAgainst, cosine, embed } from './encoder.js';

// Resolve one action against the workspace's intents, honouring the app's config
// ({ IntentIDs: [], Encoder: { URL, TimeoutMS, FailClosed } }).
// Steps, in order (each becomes a GatewayTrace decision hop):
//   1. The app's intent config selects which intents can match (IntentIDs empty = none can — there is no
//      "empty means all": an app with no intents selected has no intent resolution, by lab rule).
//   2. Score the action against every selected intent's exemplars (best cosine over the encoder vector).
//   3. Intents scoring below their own Spec.Floor are out.
//   4. Twins: among the survivors, if the best two are declared twins of each other, the pair is ambiguous
//      and the lab refuses (no default-on when two protected paths look equally likely) — lab-invented.
//   5. One survivor: if Spec.Acts is true the action may proceed (allow, intent-bound); if false the intent
//      is read-only and a mutating action is refused (deny, intent read-only) — lab-invented.
//   6. No survivor: FailClosed=true denies; false allows with "no intent matched" (fail-open) — the
//      config field's meaning in the console is UNVERIFIED; the lab's reading is stated in the UI.
export function resolveAction({ text, intents, config, now = Date.now }) {
  const t = new Date(now()).toISOString();
  const base = { action: text, at: t };
  const list = intents.list();
  const selected = config?.IntentIDs ?? [];
  const enc = config?.Encoder ?? {};
  const failClosed = enc.FailClosed !== false; // default fail-closed, stated in the UI

  if (!text || typeof text !== 'string') return { ...base, decision: 'deny', matched: null, reason: 'no_action', hops: [hop(1, 'input', 'lab', 'no action text given', 'deny')] };

  // 1. selection
  const pool = selected.length ? list.filter((i) => selected.includes(i.ObjectMeta.Name) && i.State !== 'Disabled') : [];
  if (pool.length === 0) return { ...base, decision: failClosed ? 'deny' : 'allow', matched: null, reason: failClosed ? 'no_intents_selected' : 'no_intents_selected_failopen', hops: [hop(1, 'input', 'lab', 'the app selects no intents', failClosed ? 'deny (fail-closed)' : 'allow (fail-open)')] };

  // 2. score
  const scored = pool
    .map((i) => ({ intent: i, score: scoreAgainst(text, i.Spec.Exemplars) }))
    .sort((a, b) => b.score - a.score);

  // 3. floor
  const over = scored.filter((s) => s.score >= s.intent.Spec.Floor);
  if (over.length === 0) return {
    ...base, decision: failClosed ? 'deny' : 'allow', matched: null, reason: failClosed ? 'below_floor' : 'below_floor_failopen',
    scores: scored.map(({ intent, score }) => ({ name: intent.ObjectMeta.Name, score: round(score), floor: intent.Spec.Floor })),
    hops: [hop(1, 'input', 'lab', `${pool.length} intents in scope`, '-'), hop(2, 'lab', 'encoder', 'embed the action text (KServe v2 shape)', 'vector returned'), hop(3, 'lab', 'lab', `best score ${round(scored[0]?.score ?? 0)} below every Floor`, failClosed ? 'deny (fail-closed)' : 'allow (fail-open)')],
  };

  // 4. twins: the top two survivors declared twins of each other -> ambiguous, refuse (fail-closed regardless,
  //    because the app cannot know which protected path was meant).
  if (over.length >= 2) {
    const [top, second] = over;
    const a = top.intent.ObjectMeta.Name; const b = second.intent.ObjectMeta.Name;
    const twinPair = top.intent.Spec.Twins.includes(b) && second.intent.Spec.Twins.includes(a);
    if (twinPair && Math.abs(top.score - second.score) < 0.05) {
      return {
        ...base, decision: 'deny', matched: null, reason: 'ambiguous_twins',
        scores: scored.map(({ intent, score }) => ({ name: intent.ObjectMeta.Name, score: round(score), floor: intent.Spec.Floor })),
        hops: [hop(1, 'input', 'lab', `${pool.length} intents in scope`, '-'), hop(2, 'lab', 'encoder', 'embed the action text (KServe v2 shape)', 'vector returned'), hop(3, 'lab', 'lab', `"${a}" and "${b}" are twins within 0.05 and both over their floors`, 'deny (ambiguous)')],
      };
    }
  }

  // 5. one winner
  const winner = over[0];
  const decision = winner.intent.Spec.Acts ? 'allow' : 'deny';
  return {
    ...base, decision, matched: winner.intent.ObjectMeta.Name, reason: winner.intent.Spec.Acts ? 'intent_acts' : 'intent_readonly',
    scores: scored.map(({ intent, score }) => ({ name: intent.ObjectMeta.Name, score: round(score), floor: intent.Spec.Floor })),
    hops: [
      hop(1, 'input', 'lab', `${pool.length} intents in scope`, '-'),
      hop(2, 'lab', 'encoder', 'embed the action text (KServe v2 shape)', 'vector returned'),
      hop(3, 'lab', 'lab', `"${winner.intent.ObjectMeta.Name}" matched at ${round(winner.score)} (floor ${winner.intent.Spec.Floor})`, decision === 'allow' ? 'allow (Acts=true)' : 'deny (Acts=false: the intent is read-only)'),
    ],
  };
}

const round = (n) => Math.round(n * 1000) / 1000;
const hop = (n, from, to, label, decision) => ({ n, from, to, label, decision, checked: true });
