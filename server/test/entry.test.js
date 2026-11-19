import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// index.js starts the server at import time, so it cannot be imported in a test. Pin its order instead: the env
// file is read (the Real settings may come from it), then the netguard is installed with the allowlist computed
// from it — all before the doctor runs or any server starts.
test('the entry loads env, computes the allowlist and installs the netguard before it can open any socket', () => {
  const src = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const envAt = src.indexOf('loadEnvFile(');
  const allowAt = /^installNetguard\(/m.exec(src).index; // the allowlist is computed as the guard's argument
  const guard = allowAt;
  assert.ok(envAt >= 0 && envAt < guard, 'the env file is read before the guard');
  assert.ok(/netguardAllowlist\(\)/.test(src.slice(guard, guard + 60)), 'the allowlist is computed into the guard');
  assert.ok(src.indexOf('netguardAllowlist') < guard + 40);
  for (const later of ['runChecks()', 'startHttpServer({']) assert.ok(src.indexOf(later) > guard, `${later} comes after the guard`);
  assert.ok(src.indexOf("import { installNetguard }") < guard);
});
