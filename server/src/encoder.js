// The intent encoder: the sidecar the console's modelAIIntentEncoderConfig points at.
// The real product sends action text to an encoder endpoint and reads back a vector (we measured the console
// probing the NVIDIA Triton inference-server wire, KServe v2: /v2, /model_info, /get_worker_address, on the
// coding-agents lab 2026-11-06). What the product does with the vector — thresholds, which intents it can tell
// apart — is UNVERIFIED. This lab's encoder is a stand-in: a deterministic hashed character-trigram vector,
// cosine similarity, no model download, no GPU. Same wire shape, honest about the arithmetic.
import { createHash } from 'node:crypto';

export const DIMS = 384;
export const MODEL_NAME = 'intent-encoder';
const K = 3; // character trigram

// A hashed character-trigram bag-of-vectors: text -> a DIMS-length FP32 vector. Deterministic, order-stable.
export function embed(text) {
  const s = String(text ?? '').toLowerCase().normalize('NFKC');
  const v = new Float32Array(DIMS);
  for (let i = 0; i + K <= s.length; i++) {
    const h = createHash('sha256').update(s.slice(i, i + K)).digest();
    const idx = h.readUInt32BE(0) % DIMS;
    const sign = (h[4] & 1) === 0 ? 1 : -1;
    v[idx] += sign * (1 + (h[5] % 97) / 97);
  }
  return v;
}

export function cosine(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < DIMS; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

// Score one action's text against an intent's exemplars: the best cosine similarity. An intent with no
// exemplars cannot match anything (score 0) — the console requires at least one (aibundle.FromIntentConfig
// validates this in the real product; UNVERIFIED, the lab enforces it as its own rule and says so).
export function scoreAgainst(text, exemplars) {
  if (!Array.isArray(exemplars) || exemplars.length === 0) return 0;
  const t = embed(text);
  let best = -1;
  for (const e of exemplars) {
    const s = cosine(t, embed(e));
    if (s > best) best = s;
  }
  return best;
}

// The KServe v2 responses the encoder sidecar answers with, for the probe page.
export function modelInfo() {
  return {
    name: MODEL_NAME,
    versions: ['1'],
    platform: 'lab-stand-in',
    inputs: [{ name: 'TEXT', datatype: 'BYTES', shape: [-1] }],
    outputs: [{ name: 'EMBEDDING', datatype: 'FP32', shape: [-1, DIMS] }],
  };
}

// POST /v2/models/intent-encoder/infer with { inputs: [{ name:'TEXT', data:[text] }], outputs:[{name:'EMBEDDING'}] }.
// Bounded: at most 4 inputs, each at most 2000 characters.
export function infer(body) {
  const inputs = body?.inputs;
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 4) return { error: 'bad_inputs' };
  const rows = [];
  for (const inp of inputs) {
    const data = inp?.data;
    if (!Array.isArray(data) || data.length === 0 || data.length > 4) return { error: 'bad_inputs' };
    for (const d of data) {
      if (typeof d !== 'string' || d.length > 2000) return { error: 'bad_inputs' };
      rows.push(d);
    }
  }
  const out = rows.map((r) => Array.from(embed(r)));
  return {
    model_name: MODEL_NAME,
    outputs: [{ name: 'EMBEDDING', datatype: 'FP32', shape: [rows.length, DIMS], data: out.flat() }],
  };
}
