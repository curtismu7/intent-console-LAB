// Deployment configuration: the Mock/Real toggle (rule 19). Real mode sends the action text to the
// tenant's live AI Gateway (one hostname, one outbound call, see real.js); Mock is the fully-offline
// default. Real is available when the gateway settings are configured (URL + bearer, from the shared
// settings file or the lab's .env); INTC_MODE_REAL=1 alone still enables it if present.
import { aiGatewayConfig, realNotConfiguredReason } from './real.js';

export function realAvailableFrom(env = process.env) {
  return aiGatewayConfig(env).configured || env.INTC_MODE_REAL === '1';
}

export function realProblemFrom(env = process.env) {
  return realNotConfiguredReason();
}

// The launch mode. Default: Real if configured, else Mock. The runtime mode (POST /api/mode) starts from this.
export function modeFrom(env = process.env) {
  if (env.MODE === undefined || env.MODE === '') return realAvailableFrom(env) ? 'real' : 'mock';
  const m = env.MODE;
  if (m !== 'mock' && m !== 'real') throw new Error(`MODE=${String(m).slice(0, 20)} is not available: this app has mock and real modes`);
  if (m === 'real' && !realAvailableFrom(env)) throw new Error('MODE=real requested but Real mode is not configured (gateway URL + bearer missing)');
  return m;
}
