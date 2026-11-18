# Talk track

<!-- Generated from server/src/story.js by `npm run talk-track`. Do not edit by hand. -->

## What this page is

The Privilege console has an AI Intents page: an admin names a purpose, gives example phrases, sets a similarity floor, and declares twin intents it must be told apart from. Applications then select intents, and each agent action is matched through an encoder. This lab is that page, rebuilt from the console API shapes we measured.

## The shapes are the product's

Description, Exemplars, Twins, Patterns, Acts, Floor; Status with Validation and Warnings; the per-app config with IntentIDs and the Encoder sidecar. All of it read off the console swagger, not invented. Our tenant defined zero intents, so every intent here is lab-authored.

## The encoder is a stand-in

We measured the console probing a Triton-style encoder over KServe v2. The lab ships the same wire shape but a hashed trigram vector instead of a trained model — deterministic, offline, honest. What the product does with the vector is labelled UNVERIFIED everywhere.

## The decision engine is ours

Score, floor, twins, Acts, fail-closed: each step is a hop in the trail with the lab's own reading stated. The demo's key beat is the twin pair: two money intents within 0.05 of each other are refused, not guessed.

## What to leave with

Intents turn "what did the agent do" into "what was the agent for". If you can name the purpose and its confusable twin, you can deny the ambiguity instead of allowing a guess.

## The scenarios

1. **A matched acting intent allows.** An action whose text lands over the intent's Floor on an Acts=true intent is allowed, bound to that intent.
2. **A read-only intent refuses a write-shaped action.** check-balance is Acts=false. The lab reads that as "describes, does not authorize": an action matched only by it is denied as read-only.
3. **Twin intents within a hair are ambiguous.** transfer-funds and pay-beneficiary are declared twins. An action that lands over both floors with less than 0.05 between them is refused rather than guessed — money must not move on a coin flip.
4. **Below the floor nothing matches.** An action that does not resemble any exemplar scores under every Floor. Fail-closed (the default) denies; fail-open would allow with "no intent matched".
5. **An app that selects no intents has no intent resolution.** Empty IntentIDs means NO intents can match — the lab reads it as "this app has no intent policy", so fail-closed denies everything. There is no "empty means all".
6. **Fail-open lets unmatched text through.** With Encoder.FailClosed=false, an action under every floor is allowed with "no intent matched" — the lab shows why fail-open on a payments app is a bad default.
