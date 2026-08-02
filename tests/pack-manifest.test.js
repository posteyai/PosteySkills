'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { discoverSkills } = require('../scripts/lib/skills');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

// Parsed inside the tests (not at module load) so a malformed pack.json fails
// as a named assertion instead of killing the whole suite anonymously.
function loadPack(root) {
  const raw = fs.readFileSync(path.join(root, 'pack.json'), 'utf8');
  let pack;
  assert.doesNotThrow(() => { pack = JSON.parse(raw); }, 'pack.json must be valid JSON');
  return pack;
}

const skills = discoverSkills(SKILLS_DIR);

test('the repo has at least one skill to check', () => {
  assert.ok(skills.length > 0, `no skills discovered under ${SKILLS_DIR}`);
});

for (const { name, dir: ROOT } of skills) {
  test(`${name}: ships a pack.json (the fetch-install channel needs one)`, () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'pack.json')), `skills/${name}/pack.json missing`);
  });

  test(`${name}: pack version matches plugin.json and SKILL.md frontmatter`, () => {
    const pack = loadPack(ROOT);
    const plugin = JSON.parse(
      fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
    );
    assert.strictEqual(pack.version, plugin.version);
    const fm = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8').match(/^version:\s*(\S+)/m);
    assert.ok(fm, 'SKILL.md must have a version: frontmatter line');
    assert.strictEqual(pack.version, fm[1]);
  });

  test(`${name}: every manifest file exists`, () => {
    const pack = loadPack(ROOT);
    const listed = [
      pack.skill,
      pack.bootstrapPrompt,
      ...(pack.docs || []),
      ...(pack.scripts || []),
      ...(pack.references || []),
    ].filter(Boolean);
    for (const rel of listed) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
    }
  });

  test(`${name}: every references/*.md file is listed in the manifest`, () => {
    const referencesDir = path.join(ROOT, 'references');
    if (!fs.existsSync(referencesDir)) return; // a skill may ship no references
    const pack = loadPack(ROOT);
    const listed = new Set(pack.references || []);
    const entries = fs.readdirSync(referencesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue; // ignore strays (.DS_Store, backups)
      assert.ok(listed.has(`references/${e.name}`), `unlisted references/${e.name}`);
    }
  });

  test(`${name}: every supporting doc SKILL.md links to is listed in the manifest`, () => {
    const pack = loadPack(ROOT);
    const skill = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
    const listed = new Set([
      ...(pack.docs || []),
      ...(pack.references || []),
      pack.bootstrapPrompt,
      'pack.json',
    ]);
    // Markdown links to sibling .md files, e.g. [x](prompts.md) or [x](references/y.md)
    for (const m of skill.matchAll(/\]\(((?:references\/)?[\w-]+\.md)\)/g)) {
      assert.ok(listed.has(m[1]), `SKILL.md links ${m[1]} but pack.json does not list it`);
    }
  });

  test(`${name}: rawBase pins the immutable release tag for this version`, () => {
    const pack = loadPack(ROOT);
    assert.strictEqual(
      pack.rawBase,
      `https://raw.githubusercontent.com/posteyai/skills/refs/tags/skills/${name}/v${pack.version}/skills/${name}/`
    );
  });
}
