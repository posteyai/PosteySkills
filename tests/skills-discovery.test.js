'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { discoverSkills } = require('../scripts/lib/skills');

// Fixture tree: two real skills, one template, one directory without a SKILL.md,
// and one loose file. Only alpha and beta are skills.
const FIXTURE = path.join(__dirname, 'fixtures', 'multi-skill', 'skills');

test('discovers every directory holding a SKILL.md', () => {
  const names = discoverSkills(FIXTURE).map(s => s.name).sort();
  assert.deepStrictEqual(names, ['alpha', 'beta']);
});

test('returns an absolute dir for each skill', () => {
  for (const skill of discoverSkills(FIXTURE)) {
    assert.ok(path.isAbsolute(skill.dir), `${skill.name}: dir must be absolute`);
    assert.strictEqual(path.basename(skill.dir), skill.name);
  }
});

test('excludes underscore-prefixed directories', () => {
  const names = discoverSkills(FIXTURE).map(s => s.name);
  assert.ok(!names.includes('_template'), '_template must not be treated as a skill');
});

test('excludes directories without a SKILL.md', () => {
  const names = discoverSkills(FIXTURE).map(s => s.name);
  assert.ok(!names.includes('no-skill-md'), 'a dir without SKILL.md is not a skill');
});

test('excludes loose files', () => {
  const names = discoverSkills(FIXTURE).map(s => s.name);
  assert.ok(!names.includes('REGISTRY.md'), 'files are not skills');
});

test('is sorted, so downstream output is deterministic', () => {
  const names = discoverSkills(FIXTURE).map(s => s.name);
  assert.deepStrictEqual(names, [...names].sort());
});

test('discovers the real skills tree', () => {
  const real = discoverSkills(path.join(__dirname, '..', 'skills'));
  assert.ok(real.length >= 1, 'the repo must have at least one skill');
  assert.ok(real.some(s => s.name === 'postey'), 'postey must be discovered');
  assert.ok(!real.some(s => s.name.startsWith('_')), 'no template dirs');
});

test('returns an empty array for a missing directory', () => {
  assert.deepStrictEqual(discoverSkills(path.join(FIXTURE, 'does-not-exist')), []);
});
