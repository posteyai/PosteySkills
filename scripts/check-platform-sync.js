#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = 0;

function fail(msg) {
  console.error(`✗ ${msg}`);
  errors++;
}

function extractJsPlatforms(jsPath) {
  const content = fs.readFileSync(jsPath, 'utf8');
  const match = content.match(/SOCIAL_PLATFORMS\s*=\s*new Set\(\[([^\]]+)\]\)/);
  if (!match) return null;
  return match[1].match(/["']([A-Z]+)["']/g).map(s => s.replace(/["']/g, ''));
}

function extractSkillMdPlatforms(skillMdPath) {
  const content = fs.readFileSync(skillMdPath, 'utf8');
  const match = content.match(/^platforms:\s*\n((?:\s+-\s+\S+\n?)+)/m);
  if (!match) return null;
  return match[1].match(/^\s+-\s+(\S+)/mg).map(l => l.trim().replace(/^-\s+/, ''));
}

const posteyJs = path.join(ROOT, 'skills', 'postey', 'scripts', 'postey.js');
const skillMd = path.join(ROOT, 'skills', 'postey', 'SKILL.md');

const jsPlatforms = extractJsPlatforms(posteyJs);
const mdPlatforms = extractSkillMdPlatforms(skillMd);

if (!jsPlatforms) {
  console.log('⚠ SOCIAL_PLATFORMS not found in postey.js — skipping sync check (add platforms: to SKILL.md frontmatter to enable)');
  process.exit(0);
}

if (!mdPlatforms) {
  console.log('⚠ platforms: field not found in SKILL.md frontmatter — skipping sync check (add platforms: list to enable)');
  process.exit(0);
}

const jsSet = new Set(jsPlatforms);
const mdSet = new Set(mdPlatforms);

for (const p of jsSet) {
  if (!mdSet.has(p)) fail(`Platform '${p}' in postey.js SOCIAL_PLATFORMS but missing from SKILL.md platforms:`);
}
for (const p of mdSet) {
  if (!jsSet.has(p)) fail(`Platform '${p}' in SKILL.md platforms: but missing from postey.js SOCIAL_PLATFORMS`);
}

if (errors > 0) process.exit(1);
console.log(`✓ JS ↔ SKILL.md platforms in sync: ${[...jsSet].join(', ')}`);

// Phase 2: SKILL.md platforms vs platform_knowledge.py (MCP server)
const pyPath = process.env.MCP_PLATFORM_KNOWLEDGE_PATH
  ?? path.join(ROOT, '..', 'postey-backend', 'app', 'core', 'mcp', 'platform_knowledge.py');

if (!fs.existsSync(pyPath)) {
  console.log(`⚠ platform_knowledge.py not found at ${pyPath} — skipping MCP platform check`);
  console.log('  Set MCP_PLATFORM_KNOWLEDGE_PATH to enable this check.');
} else {
  const pySource = fs.readFileSync(pyPath, 'utf8');
  // Extract top-level keys from PLATFORM_KNOWLEDGE dict.
  // Keys appear as exactly 4-space indented quoted uppercase strings followed by ": {".
  // We extract only lines that come after the PLATFORM_KNOWLEDGE declaration.
  const pkStart = pySource.indexOf('PLATFORM_KNOWLEDGE');
  let pyPlatforms = [];
  if (pkStart !== -1) {
    const afterDecl = pySource.slice(pkStart);
    pyPlatforms = [...afterDecl.matchAll(/^    ["']([A-Z][A-Z0-9_]*)["']\s*:/gm)]
      .map(m => m[1]);
  }

  if (pyPlatforms.length === 0) {
    console.log('⚠ PLATFORM_KNOWLEDGE not found or empty in platform_knowledge.py — skipping');
  } else {
    const pySet = new Set(pyPlatforms);
    let pyErrors = 0;
    for (const p of mdSet) {
      if (!pySet.has(p)) { fail(`Platform '${p}' in SKILL.md but missing from PLATFORM_KNOWLEDGE in platform_knowledge.py`); pyErrors++; }
    }
    for (const p of pySet) {
      if (!mdSet.has(p)) { fail(`Platform '${p}' in PLATFORM_KNOWLEDGE but missing from SKILL.md platforms:`); pyErrors++; }
    }
    if (pyErrors === 0) {
      console.log(`✓ SKILL.md ↔ platform_knowledge.py platforms in sync: ${[...pySet].join(', ')}`);
    }
  }
}

if (errors > 0) process.exit(1);
