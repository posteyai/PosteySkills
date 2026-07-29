'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// S9.5 — the skill reads capability from discovery, not from lists a human keeps
// in sync by hand.
//
// The previous shape kept the same list in four places: SKILL.md `platforms:`,
// postey.js SOCIAL_PLATFORMS, check-platform-sync.js, and MCP_PLATFORMS in
// skill-parity.test.js. Every one of them was hand-maintained, so "parity" only
// ever proved the copies agreed with each other — not that any of them matched
// the server. That is exactly how the body tables drifted to seven platforms
// while the frontmatter said nine and the parity test passed.
//
// There is now ONE machine-generated artifact, capability-snapshot.json, refreshed
// from postey://skill-manifest by scripts/refresh-capability-snapshot.js. Everything
// else derives from it. A literal list anywhere else is a regression.

const ROOT = path.join(__dirname, '..');
const SKILL_DIR = path.join(ROOT, 'skills', 'postey');
const SNAPSHOT = path.join(SKILL_DIR, 'capability-snapshot.json');

function snapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
}

function skillMd() {
  return fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
}

function frontmatter(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/);
  assert.ok(m, 'SKILL.md must have frontmatter');
  return m[1];
}

test('the capability snapshot is generated, not authored', () => {
  const snap = snapshot();
  assert.ok(snap.generated_from, 'snapshot must record the resource it came from');
  assert.strictEqual(snap.generated_from, 'postey://skill-manifest');
  assert.ok(
    Array.isArray(snap.platforms) && snap.platforms.length > 0,
    'snapshot must carry the platform set'
  );
  assert.ok(Array.isArray(snap.tools) && snap.tools.length > 0);
  assert.ok(Array.isArray(snap.resources) && snap.resources.length > 0);
});

test('SKILL.md no longer hand-maintains a platforms: list', () => {
  const fm = frontmatter(skillMd());
  assert.ok(
    !/^platforms:/m.test(fm),
    'platforms: is a hand-maintained copy of the server\'s set — read the snapshot instead'
  );
});

test('SKILL.md body enumerates no platform set', () => {
  const md = skillMd();
  const snap = snapshot();
  // Frontmatter is excluded deliberately: `description:` / `when_to_use:` are the
  // harness's trigger-matching surface, not agent instructions, and a user asking
  // to "post to Pinterest" should still match. They are checked below instead —
  // derived, not exempt.
  const body = md.split(/^---\s*$/m).slice(2).join('---');
  const offset = md.split('\n').length - body.split('\n').length;

  // A line naming three or more platform slugs is a list pretending to be prose.
  // Two is a legitimate contrast ("X threads, LinkedIn does not").
  //
  // Two things are NOT enumeration and must not trip this: a worked example
  // (`--platforms INSTAGRAM,LINKEDIN,X`), which teaches syntax rather than the
  // set, and a quoted user phrase in the routing table, which is trigger text.
  // Flagging those would push authors to write worse examples to satisfy a test.
  const slugs = snap.platforms.map((p) => p.toUpperCase());
  const offenders = [];
  let inFence = false;
  body.split('\n').forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    const unquoted = line.replace(/"[^"]*"/g, '').replace(/`[^`]*`/g, '');
    const hits = slugs.filter((s) => new RegExp(`\\b${s}\\b`, 'i').test(unquoted));
    if (hits.length >= 3) offenders.push(`SKILL.md:${offset + i + 1}: ${line.trim()}`);
  });
  assert.deepStrictEqual(
    offenders,
    [],
    `platform enumeration in the body — point at postey://platform-limits instead:\n${offenders.join('\n')}`
  );
});

// The description may name platforms (it is what makes "post to Pinterest" trigger
// the skill), but it may not drift from the server. This is the check that would
// have caught the seven-vs-nine gap at its real cost: two platforms nobody could
// discover.
test('the description advertises exactly the platforms that exist', () => {
  const fm = frontmatter(skillMd());
  const described = fm.match(/^description:[\s\S]*?(?=^\w+:)/m)[0];
  const aliases = {
    X: ['X'],
    LINKEDIN: ['LinkedIn'],
    BLUESKY: ['Bluesky'],
    TIKTOK: ['TikTok'],
    YOUTUBE: ['YouTube']
  };

  const missing = snapshot().platforms.filter((p) => {
    const names = aliases[p] || [p.charAt(0) + p.slice(1).toLowerCase()];
    return !names.some((n) => new RegExp(`\\b${n}\\b`).test(described));
  });
  assert.deepStrictEqual(
    missing,
    [],
    `description omits ${missing.join(', ')} — users on those platforms will never trigger the skill`
  );
});

test('SKILL.md tells the agent to read capability from discovery', () => {
  const md = skillMd();
  assert.match(
    md,
    /postey:\/\/skill-manifest/,
    'SKILL.md must name the discovery resource it derives capability from'
  );
  assert.match(md, /canonical/i, 'SKILL.md must teach the canonical/superseded distinction');
  assert.match(md, /superseded_by/, 'SKILL.md must name the field that redirects a fallback tool');
});

// The one thing that legitimately stays in frontmatter: it is the harness's
// access grant, not documentation. Deleting it would revoke the skill's tools.
test('mcp-tools: survives as the harness access grant', () => {
  const fm = frontmatter(skillMd());
  assert.match(fm, /^mcp-tools:/m, 'mcp-tools: is the access grant — it must stay');
});

test('every tool the skill is granted still exists on the server', () => {
  const fm = frontmatter(skillMd());
  const block = fm.match(/^mcp-tools:\s*\n((?:[ \t]+[^\n]*\n?)*)/m);
  assert.ok(block, 'mcp-tools: block must parse');

  // mcp-tools: has sibling sub-blocks (resources:, tools:, prompts:). Only the
  // tools: entries are tool names — flattening the lot reports every prompt as a
  // nonexistent tool.
  const granted = [];
  let inTools = false;
  for (const raw of block[1].split('\n')) {
    const subKey = raw.match(/^\s{2}(\w[\w-]*):\s*$/);
    if (subKey) { inTools = subKey[1] === 'tools'; continue; }
    if (!inTools) continue;
    const entry = raw.replace(/^\s*-\s*/, '').trim();
    if (entry && !entry.startsWith('#')) granted.push(entry);
  }
  assert.ok(granted.length > 0, 'mcp-tools.tools: must list the granted tools');

  const live = new Set(snapshot().tools);
  const ghosts = granted.filter((t) => !live.has(t));
  assert.deepStrictEqual(
    ghosts,
    [],
    `granted tools that no longer exist on the server: ${ghosts.join(', ')}`
  );
});

test('postey.js derives its platform set from the snapshot', () => {
  const js = fs.readFileSync(path.join(SKILL_DIR, 'scripts', 'postey.js'), 'utf8');
  assert.ok(
    !/SOCIAL_PLATFORMS\s*=\s*new Set\(\[\s*['"]/.test(js),
    'SOCIAL_PLATFORMS is a hand-maintained literal — build it from capability-snapshot.json'
  );
  assert.match(
    js,
    /capability-snapshot\.json/,
    'postey.js must read the snapshot to know which platforms exist'
  );
});

test('the CLI accepts exactly the platforms the server supports', () => {
  const { SOCIAL_PLATFORMS } = require(path.join(SKILL_DIR, 'scripts', 'postey.js'));
  assert.ok(SOCIAL_PLATFORMS instanceof Set, 'postey.js must export SOCIAL_PLATFORMS');
  assert.deepStrictEqual(
    [...SOCIAL_PLATFORMS].sort(),
    [...snapshot().platforms].sort(),
    'the CLI would reject a platform the server supports (or vice versa)'
  );
});
