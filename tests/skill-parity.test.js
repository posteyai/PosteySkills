'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'skills', 'postey');

// Platform parity moved to tests/capability-discovery.test.js (S9.5). It used to
// live here as MCP_PLATFORMS — a hardcoded nine-entry array, which made this file
// the *fourth* hand-maintained copy of the server's platform set. Copies can only
// prove they agree with each other; that is how SKILL.md's body tables drifted to
// seven while every check here stayed green. The set now derives from
// capability-snapshot.json, generated out of postey://skill-manifest.
//
// What remains here is the namespace rule (V-5), which has no discovery source.

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
