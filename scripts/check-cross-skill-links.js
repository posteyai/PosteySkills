#!/usr/bin/env node
'use strict';

// CI: no skill may reference a file it does not ship.
// See scripts/lib/cross-skill-links.js for what counts as a reference.

const path = require('path');
const { findCrossSkillLinkProblems } = require('./lib/cross-skill-links');

const skillsDir = path.resolve(__dirname, '..', 'skills');
const problems = findCrossSkillLinkProblems(skillsDir);

for (const p of problems) {
  console.error(`✗ skills/${p.skill}/${p.file}: ${p.kind} "${p.ref}" — ${p.reason}`);
}

if (problems.length) {
  console.error(`check-cross-skill-links: ${problems.length} problem(s). Failing.`);
  process.exit(1);
}

console.log('check-cross-skill-links: clean');
