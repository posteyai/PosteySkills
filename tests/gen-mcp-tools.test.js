'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { toolsFor, rewriteSkillMd } = require('../scripts/lib/gen-mcp-tools');
const { loadSnapshot, readCapabilities } = require('../scripts/lib/capabilities');
const { discoverSkills } = require('../scripts/lib/skills');
const { extractFrontmatter, blockList } = require('../scripts/lib/frontmatter');

const ROOT = path.join(__dirname, '..');

const snapshot = {
  canonical: {
    'post.create': 'create_post',
    'account.list': 'postey://accounts',
    'post.analytics': 'postey://posts/{post_id}/analytics',
  },
  supersededBy: { get_accounts: 'postey://accounts' },
};

test('a capability served by a tool contributes that tool', () => {
  const { primary } = toolsFor({ owns: ['post.create'], reads: [] }, snapshot);
  assert.deepStrictEqual(primary, ['create_post']);
});

test('a capability served by a resource contributes its superseded tool as a fallback', () => {
  const r = toolsFor({ owns: ['account.list'], reads: [] }, snapshot);
  assert.deepStrictEqual(r.primary, []);
  assert.deepStrictEqual(r.fallback, ['get_accounts']);
});

test('a resource with no superseded tool contributes nothing', () => {
  const r = toolsFor({ owns: ['post.analytics'], reads: [] }, snapshot);
  assert.deepStrictEqual(r.primary, []);
  assert.deepStrictEqual(r.fallback, []);
});

test('unclaimed capabilities contribute nothing — no orphan grants', () => {
  assert.deepStrictEqual(toolsFor({ owns: [], reads: [] }, snapshot), { primary: [], fallback: [] });
});

test('reads contribute tools too', () => {
  const { primary } = toolsFor({ owns: [], reads: ['post.create'] }, snapshot);
  assert.deepStrictEqual(primary, ['create_post']);
});

test('rewriting replaces the tools sub-list and leaves its siblings intact', () => {
  const before = [
    '---', 'name: x', 'mcp-tools:',
    '  resources:', '    - postey://accounts',
    '  tools:', '    # stale comment', '    - old_tool',
    '  prompts:', '    - compose-post',
    '---', 'body',
  ].join('\n');

  const after = rewriteSkillMd(before, { owns: ['post.create'], reads: [] }, snapshot);
  assert.ok(after.includes('    - create_post'), 'generated tool present');
  assert.ok(!after.includes('old_tool'), 'hand-written entry gone');
  assert.ok(after.includes('  resources:\n    - postey://accounts'), 'resources untouched');
  assert.ok(after.includes('  prompts:\n    - compose-post'), 'prompts untouched');
  assert.ok(after.endsWith('---\nbody'), 'body untouched');
});

test('rewriting is idempotent', () => {
  const once = rewriteSkillMd(
    '---\nmcp-tools:\n  tools:\n    - old\n  prompts:\n---\nb',
    { owns: ['post.create'], reads: [] }, snapshot
  );
  assert.strictEqual(rewriteSkillMd(once, { owns: ['post.create'], reads: [] }, snapshot), once);
});

test('a SKILL.md with no mcp-tools block is returned unchanged', () => {
  const src = '---\nname: prose-only\n---\nbody';
  assert.strictEqual(rewriteSkillMd(src, { owns: [], reads: [] }, snapshot), src);
});

// The C5 gate: what is committed must equal what generation produces.
test('every real skill has a committed tools list matching its capabilities', () => {
  const snap = loadSnapshot(ROOT);
  for (const skill of discoverSkills(path.join(ROOT, 'skills'))) {
    const file = path.join(skill.dir, 'SKILL.md');
    const fs = require('node:fs');
    const content = fs.readFileSync(file, 'utf8');
    assert.strictEqual(
      rewriteSkillMd(content, readCapabilities(skill.dir), snap),
      content,
      `skills/${skill.name}: run node scripts/gen-mcp-tools.js`
    );
  }
});

test('the hub grants no tool for a capability it does not claim', () => {
  const snap = loadSnapshot(ROOT);
  for (const skill of discoverSkills(path.join(ROOT, 'skills'))) {
    const caps = readCapabilities(skill.dir);
    const expected = new Set([
      ...toolsFor(caps, snap).primary,
      ...toolsFor(caps, snap).fallback,
    ]);
    const declared = blockList(
      extractFrontmatter(path.join(skill.dir, 'SKILL.md')), 'mcp-tools', 'tools'
    );
    for (const tool of declared) {
      assert.ok(expected.has(tool), `skills/${skill.name}: orphan grant "${tool}"`);
    }
  }
});
