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
console.log(`✓ Platforms in sync: ${[...jsSet].join(', ')}`);
