import test from 'node:test';
import assert from 'node:assert/strict';
import { newTrace, formatTraceparent, parseTraceparent } from '../src/trace.js';

// The lab keeps the W3C Trace Context helper (rule 14): the resolution trail carries trace ids, and an
// incoming traceparent continues its trace. The hops themselves are plain objects (from/to/label/decision).
test('traceparent parse/format round trip; invalid and zero values start a new trace', () => {
  const t = newTrace('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  assert.equal(t.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
  const fresh = newTrace('garbage');
  assert.notEqual(fresh.traceId, 'garbage');
  assert.match(fresh.traceId, /^[0-9a-f]{32}$/);
  const fmt = formatTraceparent(t.traceId, t.span());
  assert.equal(parseTraceparent(fmt).traceId, t.traceId);
  assert.equal(parseTraceparent(`00-${'0'.repeat(32)}-00f067aa0ba902b7-01`), null);
  assert.equal(parseTraceparent(`00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-ff`), null);
});
