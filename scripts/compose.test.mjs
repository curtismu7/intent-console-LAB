import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { portProblem } from '../server/src/safety.js';

// Every published port must be bound to loopback on the host. A small line parser (no YAML dependency).
export function publishedPorts(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)ports:\s*$/.exec(lines[i]);
    if (!m) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const item = /^\s*-\s*["']?([^"'\s#]+)["']?/.exec(lines[j]);
      if (!item || lines[j].search(/\S/) <= m[1].length) break;
      out.push(item[1]);
    }
  }
  return out;
}
const here = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('docker-compose.yml publishes only on 127.0.0.1', () => {
  const ports = publishedPorts(here('docker-compose.yml'));
  assert.ok(ports.length > 0, 'the parser found the published port');
  for (const p of ports) assert.match(p, /^127\.0\.0\.1:/, `${p} must start with 127.0.0.1:`);
});

test('the parser flags an unbound or wildcard publish', () => {
  for (const bad of ['- "7825:7825"', '- "0.0.0.0:7825:7825"', '- 7825', '- "::1:7825:7825"']) {
    const ports = publishedPorts(`services:\n  a:\n    ports:\n      ${bad}\n`);
    assert.equal(ports.length, 1);
    assert.doesNotMatch(ports[0], /^127\.0\.0\.1:/);
  }
});

test('compose default host port and Dockerfile port are allowed ports and agree', () => {
  const compose = here('docker-compose.yml');
  const host = Number(/\$\{HOST_PORT:-(\d+)\}/.exec(compose)[1]);
  assert.equal(portProblem(host), null);
  const docker = here('Dockerfile');
  const port = Number(/^EXPOSE (\d+)/m.exec(docker)[1]);
  assert.equal(portProblem(port), null);
  assert.match(compose, new RegExp(`:${port}"`));
  assert.match(docker, /^ENV INTC_BIND=0\.0\.0\.0$/m);
  assert.match(docker, /^USER node$/m);
});

test('the container is locked down: read-only fs, no capabilities, no new privileges, restart policy (rule 21)', () => {
  const compose = here('docker-compose.yml');
  assert.match(compose, /restart: unless-stopped/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop: \[ALL\]/);
  assert.match(compose, /no-new-privileges:true/);
});

test('start mode: compose replaces the image MODE=mock with INTC_MODE, empty when unset; Real follows the gateway config', async () => {
  const compose = here('docker-compose.yml');
  const lab = new RegExp('^  intent-console-lab:\\n((?:    .*\\n|\\n)+)', 'm').exec(compose)?.[1] ?? '';
  assert.ok(lab, 'the lab service exists');
  assert.match(lab, /^      MODE: \$\{INTC_MODE:-\}$/m, 'MODE comes from INTC_MODE with an empty default');
  assert.match(lab, /^      INTC_MODE_REAL: \$\{INTC_MODE_REAL:-\}$/m);
  assert.match(here('Dockerfile'), /^ENV .*\bMODE=mock\b/m, 'the image default stays mock (rule 19) for a plain docker run');
  const { modeFrom, realAvailableFrom } = await import('../server/src/config.js');
  // modeFrom consults realAvailableFrom, which reads the shared settings file for the gateway keys; a bare env object
  // without STANDALONE_ENV sees the developer's real file, so these checks stub it to an empty fixture.
  const os = await import('node:os'); const fs = await import('node:fs'); const path = await import('node:path');
  const fixture = path.join(os.tmpdir(), `intc-compose-test-${Date.now()}.env`);
  fs.writeFileSync(fixture, '# empty fixture\n');
  const env = { MODE: '', STANDALONE_ENV: fixture };
  try {
    assert.equal(modeFrom(env), 'mock', 'unconfigured: Mock');
    assert.equal(modeFrom({ ...env, INTC_MODE_REAL: '1' }), 'real', 'the legacy opt-in alone still enables Real (documented fallback)');
    assert.equal(realAvailableFrom(env), false, 'unconfigured: Real unavailable');
    fs.writeFileSync(fixture, 'INTC_AIGATEWAY_URL=http://127.0.0.1:1/a2a\nINTC_AIGATEWAY_BEARER=stub\n');
    assert.equal(modeFrom(env), 'real', 'configured: Real');
    assert.equal(modeFrom({ ...env, MODE: 'mock' }), 'mock');
  } finally { fs.rmSync(fixture, { force: true }); }
});

test('LAB_ALLOWED_HOSTS and SHELF_URL pass through with safe defaults', () => {
  const compose = here('docker-compose.yml');
  assert.match(compose, /LAB_ALLOWED_HOSTS: \$\{LAB_ALLOWED_HOSTS:-intent-console-lab\.local\.ping-devops\.com\}/);
  assert.match(compose, /SHELF_URL: \$\{SHELF_URL:-https:\/\/local\.ping-devops\.com:8443\/demo-shelf\}/);
});
