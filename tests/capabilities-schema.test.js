'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  readCapabilities,
  loadSnapshot,
  validateDeclarations,
} = require('../scripts/lib/capabilities');
const { discoverSkills } = require('../scripts/lib/skills');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'capabilities');
const fx = name => path.join(FIXTURES, name);

test('reads owns / reads / prompts from a SKILL.md', () => {
  const caps = readCapabilities(fx('declared'));
  assert.deepStrictEqual(caps.owns, ['post.create', 'post.update']);
  assert.deepStrictEqual(caps.reads, ['analytics.top_posts']);
  assert.deepStrictEqual(caps.prompts, ['compose-post']);
});

test('a skill with no capabilities block yields empty lists, not a throw', () => {
  const caps = readCapabilities(fx('absent'));
  assert.deepStrictEqual(caps, { owns: [], reads: [], prompts: [] });
});

test('comments inside the block are ignored', () => {
  assert.deepStrictEqual(readCapabilities(fx('commented')).owns, ['post.create']);
});

test('an empty sub-list is empty, and does not swallow the next key', () => {
  const caps = readCapabilities(fx('empty-owns'));
  assert.deepStrictEqual(caps.owns, []);
  assert.deepStrictEqual(caps.reads, ['post.read']);
});

test('the snapshot exposes canonical keys and prompts', () => {
  const snap = loadSnapshot(ROOT);
  assert.ok(Object.keys(snap.canonical).length >= 40, 'expected the full canonical map');
  assert.ok(snap.canonical['post.create'], 'post.create must be a canonical key');
  assert.ok(snap.prompts.includes('compose-post'));
});

test('an unknown capability key is a problem', () => {
  const snap = loadSnapshot(ROOT);
  const problems = validateDeclarations(
    [{ name: 'alpha', caps: { owns: ['post.nope'], reads: [], prompts: [] } }],
    snap
  );
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0].reason, /not a canonical capability/i);
});

test('an unknown prompt is a problem', () => {
  const snap = loadSnapshot(ROOT);
  const problems = validateDeclarations(
    [{ name: 'alpha', caps: { owns: [], reads: [], prompts: ['no-such-prompt'] } }],
    snap
  );
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0].reason, /not a prompt/i);
});

test('declaring the same key as both owns and reads is a problem', () => {
  const snap = loadSnapshot(ROOT);
  const problems = validateDeclarations(
    [{ name: 'alpha', caps: { owns: ['post.create'], reads: ['post.create'], prompts: [] } }],
    snap
  );
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0].reason, /both owns and reads/i);
});

test('a valid declaration has no problems', () => {
  const snap = loadSnapshot(ROOT);
  const problems = validateDeclarations(
    [{ name: 'alpha', caps: { owns: ['post.create'], reads: ['post.read'], prompts: ['compose-post'] } }],
    snap
  );
  assert.deepStrictEqual(problems, []);
});

// The S0.3 gate: the template and the hub must both parse and validate.
test('every real skill declares a schema-valid capabilities block', () => {
  const snap = loadSnapshot(ROOT);
  const skills = discoverSkills(path.join(ROOT, 'skills'))
    .map(s => ({ name: s.name, caps: readCapabilities(s.dir) }));
  assert.ok(skills.length > 0);
  for (const s of skills) {
    assert.ok(
      s.caps.owns.length + s.caps.reads.length > 0,
      `skills/${s.name} declares no capabilities`
    );
  }
  assert.deepStrictEqual(validateDeclarations(skills, snap), []);
});

test('the _template capabilities block is commented out, so it parses as empty', () => {
  assert.deepStrictEqual(
    readCapabilities(path.join(ROOT, 'skills', '_template')),
    { owns: [], reads: [], prompts: [] }
  );
});
