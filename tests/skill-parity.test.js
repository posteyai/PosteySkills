'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'skills', 'postey');

// The nine platforms the MCP server actually supports (Support_Mcp_Socials_Enum
// / PLATFORM_KNOWLEDGE in MarqetiveBackendV2). `check-platform-sync.js` compares
// against that file directly, but it SKIPS when the backend checkout is absent —
// which is the normal case in CI, and is why the skill drifted to seven
// unnoticed. These tests need no sibling checkout, so divergence always fails.
const MCP_PLATFORMS = [
  'X',
  'LINKEDIN',
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'THREADS',
  'BLUESKY',
  'FACEBOOK',
  'PINTEREST'
];

function skillMd() {
  return fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
}

function frontmatterPlatforms(md) {
  const block = md.match(/^platforms:\s*\n((?:\s+-\s+\S+\n?)+)/m);
  assert.ok(block, 'SKILL.md must declare a platforms: list');
  return block[1]
    .split('\n')
    .map((l) => l.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
}

test('SKILL.md declares every platform the MCP server supports', () => {
  const declared = frontmatterPlatforms(skillMd());
  const missing = MCP_PLATFORMS.filter((p) => !declared.includes(p));
  assert.deepStrictEqual(
    missing,
    [],
    `platforms: is missing ${missing.join(', ')} — the skill would tell users these do not exist`
  );
});

test('SKILL.md declares no platform the MCP server does not support', () => {
  const declared = frontmatterPlatforms(skillMd());
  const extra = declared.filter((p) => !MCP_PLATFORMS.includes(p));
  assert.deepStrictEqual(extra, [], `platforms: declares unsupported ${extra.join(', ')}`);
});

test('postey.js SOCIAL_PLATFORMS matches the declared platforms', () => {
  const js = fs.readFileSync(path.join(ROOT, 'scripts', 'postey.js'), 'utf8');
  const match = js.match(/SOCIAL_PLATFORMS\s*=\s*new Set\(\[([^\]]+)\]\)/);
  assert.ok(match, 'postey.js must define SOCIAL_PLATFORMS');
  const inJs = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  assert.deepStrictEqual(
    [...inJs].sort(),
    [...MCP_PLATFORMS].sort(),
    'the CLI would reject a platform the skill advertises (or vice versa)'
  );
});

// V-5. MCP tool names are derived from whatever the USER named the server, so a
// hardcoded connector slug is wrong for everyone who named it differently. The
// same server appeared as `postey`, `postey-dev` and `claude_ai_postey` during
// the audit — none matching the skill's original `mcp__claude_ai_postey__`.
test('skill guidance does not hardcode an MCP server namespace', () => {
  const files = ['SKILL.md', 'routing-guide.md', 'command-reference.md', 'prompts.md'];
  const offenders = [];

  for (const name of files) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // Match the concrete prefix, not the placeholder form we teach.
        if (/mcp__[a-z0-9_]*__/i.test(line) && !/mcp__<server>__/.test(line)) {
          offenders.push(`${name}:${i + 1}: ${line.trim()}`);
        }
      });
  }

  assert.deepStrictEqual(
    offenders,
    [],
    `hardcoded MCP namespace — use bare tool names:\n${offenders.join('\n')}`
  );
});
