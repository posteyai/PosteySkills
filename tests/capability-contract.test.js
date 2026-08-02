'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { checkCover, checkExclusive } = require('../scripts/lib/capability-contract');
const { loadSnapshot, readCapabilities } = require('../scripts/lib/capabilities');
const { discoverSkills } = require('../scripts/lib/skills');

const ROOT = path.join(__dirname, '..');
const snapshot = { canonical: { 'a.one': 'x', 'a.two': 'y', 'b.one': 'z' }, prompts: [] };
const skill = (name, owns = [], reads = []) => ({ name, caps: { owns, reads, prompts: [] } });

// --- C1 Cover ---

test('C1: a key claimed by no skill is a failure', () => {
  const r = checkCover([skill('alpha', ['a.one', 'a.two'])], snapshot, []);
  assert.strictEqual(r.failures.length, 1);
  assert.match(r.failures[0].reason, /no skill/i);
  assert.strictEqual(r.failures[0].key, 'b.one');
});

test('C1: reads count as coverage, not just owns', () => {
  const r = checkCover([skill('alpha', ['a.one', 'a.two'], ['b.one'])], snapshot, []);
  assert.deepStrictEqual(r.failures, []);
});

test('C1: an allowlisted unclaimed key is deferred, not failed', () => {
  const r = checkCover([skill('alpha', ['a.one', 'a.two'])], snapshot, ['b.one']);
  assert.deepStrictEqual(r.failures, []);
  assert.deepStrictEqual(r.deferred, ['b.one']);
});

// Without this the allowlist never shrinks and the split silently "completes".
test('C1: an allowlist entry that is now claimed is a failure (stale allowlist)', () => {
  const r = checkCover([skill('alpha', ['a.one', 'a.two', 'b.one'])], snapshot, ['b.one']);
  assert.strictEqual(r.failures.length, 1);
  assert.match(r.failures[0].reason, /stale/i);
});

test('C1: an allowlist entry that is not a canonical key is a failure', () => {
  const r = checkCover([skill('alpha', ['a.one', 'a.two', 'b.one'])], snapshot, ['not.a.key']);
  assert.ok(r.failures.some(f => /not a canonical/i.test(f.reason)));
});

test('C1: full coverage with an empty allowlist passes', () => {
  const r = checkCover([skill('alpha', ['a.one', 'a.two', 'b.one'])], snapshot, []);
  assert.deepStrictEqual(r.failures, []);
  assert.deepStrictEqual(r.deferred, []);
});

// --- C2 Exclusive ---

test('C2: two skills owning the same key is a failure', () => {
  const r = checkExclusive([skill('alpha', ['a.one']), skill('beta', ['a.one'])]);
  assert.strictEqual(r.failures.length, 1);
  assert.strictEqual(r.failures[0].key, 'a.one');
  assert.match(r.failures[0].reason, /alpha.*beta|beta.*alpha/);
});

test('C2: several skills reading the same key is fine', () => {
  const r = checkExclusive([skill('alpha', [], ['a.one']), skill('beta', [], ['a.one'])]);
  assert.deepStrictEqual(r.failures, []);
});

test('C2: one owner plus other readers is fine', () => {
  const r = checkExclusive([skill('alpha', ['a.one']), skill('beta', [], ['a.one'])]);
  assert.deepStrictEqual(r.failures, []);
});

// --- the real tree ---

test('the real tree passes C1 and C2 with the committed allowlist', () => {
  const { UNCLAIMED_ALLOWLIST } = require('../scripts/lib/capability-contract');
  const snap = loadSnapshot(ROOT);
  const skills = discoverSkills(path.join(ROOT, 'skills'))
    .map(s => ({ name: s.name, caps: readCapabilities(s.dir) }));

  const cover = checkCover(skills, snap, UNCLAIMED_ALLOWLIST);
  assert.deepStrictEqual(cover.failures, [], JSON.stringify(cover.failures, null, 2));
  assert.deepStrictEqual(checkExclusive(skills).failures, []);

  // The hub deliberately leaves these unclaimed until their pillar ships (D-010).
  assert.strictEqual(cover.deferred.length, 14, `deferred: ${cover.deferred.join(', ')}`);
});
