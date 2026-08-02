'use strict';

// Capability-keyed ownership.
//
// A skill declares what it does in CANONICAL CAPABILITY KEYS, never in raw tool
// names. The keys come from capability-snapshot.json, which is generated from
// postey://skill-manifest — so the vocabulary is the server's, and a second
// hand-maintained list cannot drift from it (the S9.5 principle, applied to
// ownership instead of platforms).
//
//   capabilities:
//     owns:    [...]   exclusive — exactly one skill may own a key (C2)
//     reads:   [...]   shared — any number of skills may read
//     prompts: [...]   MCP prompt names
//
// This module is schema only: it parses and checks that declared keys exist.
// Coverage (C1) and exclusivity (C2) across the whole repo are S1.1.

const fs = require('fs');
const path = require('path');

const { extractFrontmatter, blockList } = require('./frontmatter');

// The snapshot currently ships inside the hub skill. S1.1 decides whether it
// moves to the repo root now that it describes every skill, not just postey.
const SNAPSHOT_REL = path.join('skills', 'postey', 'capability-snapshot.json');

function loadSnapshot(repoRoot) {
  const snap = JSON.parse(fs.readFileSync(path.join(repoRoot, SNAPSHOT_REL), 'utf8'));
  return {
    canonical: snap.canonical || {},
    prompts: snap.prompts || [],
    supersededBy: snap.superseded_by || {},
  };
}

function readCapabilities(skillDir) {
  const fm = extractFrontmatter(path.join(skillDir, 'SKILL.md'));
  return {
    owns: blockList(fm, 'capabilities', 'owns'),
    reads: blockList(fm, 'capabilities', 'reads'),
    prompts: blockList(fm, 'capabilities', 'prompts'),
  };
}

// Per-skill schema validation. `skills` is [{ name, caps }].
function validateDeclarations(skills, snapshot) {
  const problems = [];

  for (const { name, caps } of skills) {
    for (const kind of ['owns', 'reads']) {
      for (const key of caps[kind]) {
        if (!(key in snapshot.canonical)) {
          problems.push({
            skill: name, key,
            reason: `"${key}" is not a canonical capability key`,
          });
        }
      }
    }

    for (const prompt of caps.prompts) {
      if (!snapshot.prompts.includes(prompt)) {
        problems.push({
          skill: name, key: prompt,
          reason: `"${prompt}" is not a prompt the server declares`,
        });
      }
    }

    for (const key of caps.owns) {
      if (caps.reads.includes(key)) {
        problems.push({
          skill: name, key,
          reason: `"${key}" is declared in both owns and reads — owning implies reading`,
        });
      }
    }
  }

  return problems;
}

module.exports = { loadSnapshot, readCapabilities, validateDeclarations, SNAPSHOT_REL };
