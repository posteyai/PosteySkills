#!/usr/bin/env node
'use strict';

// CI: shipped docs must not advertise a pack that does not exist.
//
// The hub's Content Flows table tells the user which optional pack carries each
// flow. While the split is in progress those packs appear one at a time, so the
// table is the easiest place in the repo to promise something un-installable.
// Any `postey-<name>` mentioned in shipped markdown must be a real skill.

const fs = require('fs');
const path = require('path');

const { discoverSkills } = require('./lib/skills');

const ROOT = path.resolve(__dirname, '..');

// The marketplace is named postey-skills; it is a catalog, not a skill.
const NOT_A_PACK = new Set(['postey-skills']);

const PACK_TOKEN = /\bpostey-[a-z][a-z0-9-]*/g;

function markdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const known = new Set(discoverSkills(path.join(ROOT, 'skills')).map(s => s.name));

const files = [
  ...markdownFiles(path.join(ROOT, 'skills')),
  ...['setup.md', 'README.md'].map(f => path.join(ROOT, f)).filter(fs.existsSync),
];

const problems = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  for (const [token] of fs.readFileSync(file, 'utf8').matchAll(PACK_TOKEN)) {
    if (NOT_A_PACK.has(token) || known.has(token)) continue;
    problems.push({ rel, token });
  }
}

for (const p of problems) {
  console.error(
    `✗ ${p.rel}: advertises pack "${p.token}", which is not a skill in this repo — ` +
    `a user cannot install it`
  );
}

if (problems.length) {
  console.error(`check-pack-discovery: ${problems.length} problem(s). Failing.`);
  process.exit(1);
}

console.log(`check-pack-discovery: clean (${known.size} skill(s) known)`);
