#!/usr/bin/env node
'use strict';

// CI: the capability contract between the skills and the MCP server.
// docs/skills-mcp-contract.md § "Enforcement".
//
//   C1 cover      every canonical capability is claimed by some skill
//   C2 exclusive  no capability is owned by two skills
//   C3..C6        land in S1.2 / S1.3 / S1.4
//
// Usage: node scripts/check-capability-contract.js [--check c1,c2]

const path = require('path');

const { discoverSkills } = require('./lib/skills');
const { loadSnapshot, readCapabilities, validateDeclarations } = require('./lib/capabilities');
const { UNCLAIMED_ALLOWLIST, checkCover, checkExclusive } = require('./lib/capability-contract');

const IMPLEMENTED = ['c1', 'c2'];

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
const skills = discoverSkills(path.join(ROOT, 'skills'))
  .map(s => ({ name: s.name, caps: readCapabilities(s.dir) }));

const failures = [];

// Schema first — an unknown key would make the coverage numbers meaningless.
for (const p of validateDeclarations(skills, snapshot)) {
  failures.push({ check: 'schema', key: p.key, skill: p.skill, reason: p.reason });
}

if (checks.includes('c1')) {
  const { failures: f, deferred } = checkCover(skills, snapshot, UNCLAIMED_ALLOWLIST);
  failures.push(...f);
  if (deferred.length) {
    console.error(
      `⚠ C1: ${deferred.length} capability/capabilities unclaimed and allowlisted — ` +
      `the split is complete when this reaches 0:`
    );
    for (const key of deferred) console.error(`    · ${key}`);
  }
}

if (checks.includes('c2')) {
  failures.push(...checkExclusive(skills).failures);
}

for (const f of failures) {
  console.error(`✗ [${f.check}] ${f.skill ? `skills/${f.skill}: ` : ''}${f.reason}`);
}

if (failures.length) {
  console.error(`check-capability-contract: ${failures.length} problem(s). Failing.`);
  process.exit(1);
}

console.log(`check-capability-contract: ${checks.join(', ')} clean (${skills.length} skill(s))`);
