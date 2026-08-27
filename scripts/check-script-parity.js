#!/usr/bin/env node
'use strict';

// CI: skills that ship a copy of the hub's CLI must ship it byte-identically.
//
// D-004: postey-video carries its own copy of the CLI rather than reaching into
// the hub's directory, which no install layout guarantees. Total duplication is
// cheaper to enforce than partial: one hash per file, no drift-by-degrees.
//
// capability-snapshot.json is in the list on purpose (D-011). postey.js does
// `require("../capability-snapshot.json")` at runtime for SOCIAL_PLATFORMS, so a
// copied CLI without the snapshot beside it crashes on require.

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HUB = path.join(ROOT, 'skills', 'postey');

// Skills that mirror the hub's CLI, and the files that must match exactly.
const MIRRORS = ['postey-video'];
const MIRRORED_FILES = [
  'scripts/postey.js',
  'scripts/videoUtils.js',
  'scripts/mediaValidator.js',
  'capability-snapshot.json',
];

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

let problems = 0;

for (const mirror of MIRRORS) {
  const dir = path.join(ROOT, 'skills', mirror);
  if (!fs.existsSync(dir)) {
    console.error(`✗ ${mirror} is listed as a CLI mirror but does not exist`);
    problems++;
    continue;
  }

  for (const rel of MIRRORED_FILES) {
    const hubFile = path.join(HUB, rel);
    const copy = path.join(dir, rel);

    if (!fs.existsSync(copy)) {
      console.error(`✗ skills/${mirror}/${rel} is missing — the copied CLI cannot run without it`);
      problems++;
      continue;
    }
    if (sha(hubFile) !== sha(copy)) {
      console.error(
        `✗ skills/${mirror}/${rel} differs from the hub's — ` +
        `copy it verbatim; the two must version-bump together`
      );
      problems++;
    }
  }
}

if (problems) {
  console.error(`check-script-parity: ${problems} problem(s). Failing.`);
  process.exit(1);
}

console.log(
  `check-script-parity: ${MIRRORS.length} mirror(s) × ${MIRRORED_FILES.length} file(s) identical`
);
