#!/usr/bin/env node
'use strict';

// Regenerate every skill's `mcp-tools.tools:` from its `capabilities:` block.
//   node scripts/gen-mcp-tools.js           write
//   node scripts/gen-mcp-tools.js --check   fail if the committed block differs (CI)

const path = require('path');

const { discoverSkills } = require('./lib/skills');
const { loadSnapshot, readCapabilities } = require('./lib/capabilities');
const { rewriteFile } = require('./lib/gen-mcp-tools');

const ROOT = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');

const snapshot = loadSnapshot(ROOT);
let stale = 0;

for (const skill of discoverSkills(path.join(ROOT, 'skills'))) {
  const file = path.join(skill.dir, 'SKILL.md');
  const caps = readCapabilities(skill.dir);
  const { changed } = rewriteFile(file, caps, snapshot, { write: !check });

  if (!changed) {
    console.log(`✓ ${skill.name}: mcp-tools.tools: matches capabilities:`);
  } else if (check) {
    console.error(
      `✗ ${skill.name}: mcp-tools.tools: does not match capabilities: — ` +
      `run \`node scripts/gen-mcp-tools.js\``
    );
    stale++;
  } else {
    console.log(`· ${skill.name}: regenerated mcp-tools.tools:`);
  }
}

if (stale) process.exit(1);
