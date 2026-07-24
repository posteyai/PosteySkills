'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'skills', 'postey');
const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'pack.json'), 'utf8'));

test('pack version matches plugin.json and SKILL.md frontmatter', () => {
  const plugin = JSON.parse(
    fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  assert.strictEqual(pack.version, plugin.version);
  const fm = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8').match(/^version:\s*(\S+)/m);
  assert.ok(fm, 'SKILL.md must have a version: frontmatter line');
  assert.strictEqual(pack.version, fm[1]);
});

test('every manifest file exists', () => {
  for (const rel of [pack.skill, pack.bootstrapPrompt, ...pack.references]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
  }
});

test('every references/*.md is listed in the manifest', () => {
  const listed = new Set(pack.references);
  for (const f of fs.readdirSync(path.join(ROOT, 'references'))) {
    assert.ok(listed.has(`references/${f}`), `unlisted references/${f}`);
  }
});

test('rawBase is the canonical raw URL prefix', () => {
  assert.strictEqual(
    pack.rawBase,
    'https://raw.githubusercontent.com/posteyai/skills/main/skills/postey/'
  );
});
