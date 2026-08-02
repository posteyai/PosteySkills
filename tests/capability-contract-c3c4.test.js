'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  checkResourceFirst,
  checkPromptsOwned,
  PROMPT_ALLOWLIST,
} = require('../scripts/lib/capability-contract');
const { loadSnapshot, readCapabilities } = require('../scripts/lib/capabilities');
const { discoverSkills } = require('../scripts/lib/skills');

const ROOT = path.join(__dirname, '..');

const snapshot = {
  canonical: { 'account.list': 'postey://accounts', 'post.create': 'create_post' },
  supersededBy: { get_accounts: 'postey://accounts' },
  prompts: ['compose-post', 'improve-post'],
};

const skill = (name, caps, mcp) => ({
  name,
  caps: { owns: [], reads: [], prompts: [], ...caps },
  mcp: { tools: [], resources: [], ...mcp },
});

// --- C3 resource-first ---

test('C3: a superseded tool without its resource is a failure', () => {
  const r = checkResourceFirst(
    [skill('alpha', { owns: ['account.list'] }, { tools: ['get_accounts'], resources: [] })],
    snapshot
  );
  assert.strictEqual(r.failures.length, 1);
  assert.match(r.failures[0].reason, /postey:\/\/accounts/);
});

test('C3: a superseded tool alongside its resource is fine (fallback, not path)', () => {
  const r = checkResourceFirst(
    [skill('alpha', { owns: ['account.list'] },
      { tools: ['get_accounts'], resources: ['postey://accounts'] })],
    snapshot
  );
  assert.deepStrictEqual(r.failures, []);
});

// A tool for a capability the skill does not claim is a C5 problem (orphan tool
// entry), not a C3 one. Keeping the checks disjoint stops one defect failing twice.
test('C3: ignores superseded tools for capabilities the skill does not claim', () => {
  const r = checkResourceFirst(
    [skill('alpha', {}, { tools: ['get_accounts'], resources: [] })],
    snapshot
  );
  assert.deepStrictEqual(r.failures, []);
});

test('C3: reads count, not just owns', () => {
  const r = checkResourceFirst(
    [skill('alpha', { reads: ['account.list'] }, { tools: ['get_accounts'], resources: [] })],
    snapshot
  );
  assert.strictEqual(r.failures.length, 1);
});

// --- C4 prompts owned ---

test('C4: an unclaimed prompt is a failure', () => {
  const r = checkPromptsOwned([skill('alpha', { prompts: ['compose-post'] })], snapshot, []);
  assert.strictEqual(r.failures.length, 1);
  assert.strictEqual(r.failures[0].key, 'improve-post');
});

test('C4: an allowlisted unclaimed prompt is deferred', () => {
  const r = checkPromptsOwned([skill('alpha', { prompts: ['compose-post'] })], snapshot, ['improve-post']);
  assert.deepStrictEqual(r.failures, []);
  assert.deepStrictEqual(r.deferred, ['improve-post']);
});

test('C4: a stale prompt allowlist entry is a failure', () => {
  const r = checkPromptsOwned(
    [skill('alpha', { prompts: ['compose-post', 'improve-post'] })], snapshot, ['improve-post']
  );
  assert.strictEqual(r.failures.length, 1);
  assert.match(r.failures[0].reason, /stale/i);
});

test('C4: two skills may both route to one prompt', () => {
  const r = checkPromptsOwned(
    [skill('alpha', { prompts: ['compose-post', 'improve-post'] }),
     skill('beta', { prompts: ['compose-post'] })],
    snapshot, []
  );
  assert.deepStrictEqual(r.failures, []);
});

// --- the real tree ---

test('the real tree passes C3 and C4 with the committed allowlist', () => {
  const { extractFrontmatter, blockList } = require('../scripts/lib/frontmatter');
  const snap = loadSnapshot(ROOT);
  const skills = discoverSkills(path.join(ROOT, 'skills')).map(s => {
    const fm = extractFrontmatter(path.join(s.dir, 'SKILL.md'));
    return {
      name: s.name,
      caps: readCapabilities(s.dir),
      mcp: {
        tools: blockList(fm, 'mcp-tools', 'tools'),
        resources: blockList(fm, 'mcp-tools', 'resources'),
      },
    };
  });

  const c3 = checkResourceFirst(skills, snap);
  assert.deepStrictEqual(c3.failures, [], JSON.stringify(c3.failures, null, 2));

  const c4 = checkPromptsOwned(skills, snap, PROMPT_ALLOWLIST);
  assert.deepStrictEqual(c4.failures, [], JSON.stringify(c4.failures, null, 2));
  assert.strictEqual(c4.deferred.length, 1, `deferred: ${c4.deferred.join(', ')}`);
});
