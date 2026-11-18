// The per-application intent-resolution policy (modelAIIntentConfig from the console swagger, measured
// 2026-11-18): which intents an app selects, and the encoder sidecar settings (URL, TimeoutMS, FailClosed).
// The field names are the product's; the lab's defaults and validation are its own.
import { cleanText, isLoopbackHost } from './safety.js';

export const TIMEOUT_DEFAULT = 2000;
export const TIMEOUT_MAX = 10_000;
export const MAX_SELECTED = 40;

export const ENCODER_URL_DEFAULT = 'http://127.0.0.1:7825/encoder'; // the lab's own in-process encoder, exposed on the same origin

export function validateAppConfig(body) {
  if (body === undefined || body === null) return { value: defaultAppConfig() };
  if (typeof body !== 'object' || Array.isArray(body)) return { error: 'bad_body', detail: 'config must be an object' };
  let selected = body.IntentIDs ?? [];
  if (!Array.isArray(selected) || selected.length > MAX_SELECTED) return { error: 'bad_intents', detail: `IntentIDs must be an array of at most ${MAX_SELECTED} intent names` };
  selected = selected.map((s) => (typeof s === 'string' ? cleanText(s, 40) : '')).filter(Boolean);
  if (new Set(selected).size !== selected.length) return { error: 'bad_intents', detail: 'IntentIDs must not repeat an intent' };
  const enc = body.Encoder ?? {};
  if (typeof enc !== 'object' || Array.isArray(enc)) return { error: 'bad_encoder', detail: 'Encoder must be an object' };
  let timeout = enc.TimeoutMS;
  if (timeout === undefined || timeout === null || timeout === '') timeout = TIMEOUT_DEFAULT;
  if (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout < 100 || timeout > TIMEOUT_MAX) return { error: 'bad_encoder', detail: `Encoder.TimeoutMS must be an integer between 100 and ${TIMEOUT_MAX}` };
  if (enc.FailClosed !== undefined && typeof enc.FailClosed !== 'boolean') return { error: 'bad_encoder', detail: 'Encoder.FailClosed must be a boolean' };
  let url = enc.URL === undefined || enc.URL === '' ? ENCODER_URL_DEFAULT : cleanText(enc.URL, 200);
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'bad_encoder', detail: 'Encoder.URL must be http(s)' };
    if (!isLoopbackHost(u.hostname)) return { error: 'bad_encoder', detail: 'Encoder.URL must point at loopback — the lab makes no outbound calls' };
  } catch { return { error: 'bad_encoder', detail: 'Encoder.URL is not a valid URL' }; }
  return {
    value: {
      Disabled: body.Disabled === true,
      IntentIDs: selected,
      Encoder: { URL: url, TimeoutMS: timeout, FailClosed: enc.FailClosed !== false },
    },
  };
}

export function defaultAppConfig() {
  return { Disabled: false, IntentIDs: [], Encoder: { URL: ENCODER_URL_DEFAULT, TimeoutMS: TIMEOUT_DEFAULT, FailClosed: true } };
}
