import { fileURLToPath } from 'node:url';
import { installNetguard } from './netguard.js';
import { startHttpServer, createApp } from './app.js';
import { allPassed, runChecks } from './doctor.js';
import { assertBindAllowed, bindHost, resolvePort } from './safety.js';
import { modeFrom } from './config.js';
import { netguardAllowlist } from './real.js';

try { process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); } catch { /* no .env */ }

installNetguard(netguardAllowlist()); // the Real gateway hostname is the ONE allowed outbound; everything else is refused

const checks = await runChecks();
if (!allPassed(checks)) {
  for (const c of checks.filter((x) => x.level === 'fail')) console.error(`[intent-console-lab] refusing to start: ${c.id}: ${c.detail}`);
  process.exit(1);
}
console.log(`[intent-console-lab] starting in ${modeFrom()} mode`);
const host = assertBindAllowed(bindHost(), process.env);
const { url } = await startHttpServer({ port: resolvePort(), host, app: createApp() });
console.log(`[intent-console-lab] lab at ${url} (loopback${modeFrom() === 'real' ? `, real AI Gateway host: ${netguardAllowlist().join(', ') || 'none'}` : ', no outbound network except the allowlisted gateway host'})`);
console.log(`[intent-console-lab] health: ${url}api/health`);
