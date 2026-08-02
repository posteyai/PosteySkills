#!/usr/bin/env node
'use strict';

// CI: the capability contract between the skills and the MCP server.
// docs/skills-mcp-contract.md § "Enforcement".
//
//   C1 cover      every canonical capability is claimed by some skill
//   C2 exclusive  no capability is owned by two skills
//   C3 resource-first  a superseded tool may appear only beside its resource
//   C4 prompts owned   every server prompt is routed to by some skill
//   C6 non-intersection delegated to check-capability-overlap.js
//   C5                 lands in S1.3
//
// Usage: node scripts/check-capability-contract.js [--check c1,c2]

const path = require('path');

const { discoverSkills } = require('./lib/skills');
const { loadSnapshot, readCapabilities, validateDeclarations } = require('./lib/capabilities');
const { extractFrontmatter, blockList } = require('./lib/frontmatter');
const {
  UNCLAIMED_ALLOWLIST, PROMPT_ALLOWLIST,
  checkCover, checkExclusive, checkResourceFirst, checkPromptsOwned,
} = require('./lib/capability-contract');

const IMPLEMENTED = ['c1', 'c2', 'c3', 'c4', 'c6'];

function selectedChecks(argv) {
  const i = argv.indexOf('--check');
  if (i === -1) return IMPLEMENTED;
  const asked = (argv[i + 1] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const unknown = asked.filter(c => !IMPLEMENTED.includes(c));
  if (unknown.length) {
    console.error(`✗ unknown or not-yet-implemented check(s): ${unknown.join(', ')}`);
    console.error(`  implemented: ${IMPLEMENTED.join(', ')}`);
    process.exit(2);
  }
  return asked;
}

const ROOT = path.resolve(__dirname, '..');
const checks = selectedChecks(process.argv.slice(2));

const snapshot = loadSnapshot(ROOT);
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

function reportDeferred(label, items, what) {
  if (!items.length) return;
  console.error(`⚠ ${label}: ${items.length} ${what} unclaimed and allowlisted — ` +
                `the split is complete when this reaches 0:`);
  for (const key of items) console.error(`    · ${key}`);
}

const failures = [];

// Schema first — an unknown key would make the coverage numbers meaningless.
for (const p of validateDeclarations(skills, snapshot)) {
  failures.push({ check: 'schema', key: p.key, skill: p.skill, reason: p.reason });
}

if (checks.includes('c1')) {
  const { failures: f, deferred } = checkCover(skills, snapshot, UNCLAIMED_ALLOWLIST);
  failures.push(...f);
  reportDeferred('C1', deferred, 'capabilities');
}

if (checks.includes('c2')) {
  failures.push(...checkExclusive(skills).failures);
}

if (checks.includes('c3')) {
  failures.push(...checkResourceFirst(skills, snapshot).failures);
}

if (checks.includes('c4')) {
  const { failures: f, deferred } = checkPromptsOwned(skills, snapshot, PROMPT_ALLOWLIST);
  failures.push(...f);
  reportDeferred('C4', deferred, 'prompts');
}

if (checks.includes('c6')) {
  // C6 lives in check-capability-overlap.js, which compares CAPABILITY rather than
  // spelling. Run it as a child so there is exactly one implementation and one set
  // of SKILL_OWNED exemptions.
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'check-capability-overlap.js')],
    { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || '');
    failures.push({ check: 'c6', reason: 'CLI commands overlap MCP — see output above' });
  }
}

for (const f of failures) {
  console.error(`✗ [${f.check}] ${f.skill ? `skills/${f.skill}: ` : ''}${f.reason}`);
}

if (failures.length) {
  console.error(`check-capability-contract: ${failures.length} problem(s). Failing.`);
  process.exit(1);
}

console.log(`check-capability-contract: ${checks.join(', ')} clean (${skills.length} skill(s))`);
