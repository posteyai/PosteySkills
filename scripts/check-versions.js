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

function parseFrontmatterVersion(skillMdPath) {
  const content = fs.readFileSync(skillMdPath, 'utf8');
  const match = content.match(/^---[\s\S]*?^version:\s*(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

function parsePluginJsonVersion(pluginJsonPath) {
  if (!fs.existsSync(pluginJsonPath)) return null;
  const json = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
  return json.version || null;
}

function parseMarketplaceVersion(marketplacePath, pluginName) {
  if (!fs.existsSync(marketplacePath)) return null;
  const json = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  const entry = (json.plugins || []).find(p => p.name === pluginName);
  return entry ? entry.version : null;
}

const skillsDir = path.join(ROOT, 'skills');
const marketplacePath = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const skillDirs = fs.readdirSync(skillsDir).filter(d => {
  if (d.startsWith('_')) return false;
  return fs.statSync(path.join(skillsDir, d)).isDirectory();
});

for (const skill of skillDirs) {
  const skillMdPath = path.join(skillsDir, skill, 'SKILL.md');
  const pluginJsonPath = path.join(skillsDir, skill, '.claude-plugin', 'plugin.json');

  if (!fs.existsSync(skillMdPath)) continue;

  const frontmatterVersion = parseFrontmatterVersion(skillMdPath);
  const pluginJsonVersion = parsePluginJsonVersion(pluginJsonPath);
  const marketplaceVersion = parseMarketplaceVersion(marketplacePath, skill);

  if (!frontmatterVersion) {
    fail(`skills/${skill}/SKILL.md missing 'version:' in frontmatter`);
    continue;
  }

  if (pluginJsonVersion && pluginJsonVersion !== frontmatterVersion) {
    fail(`skills/${skill}: plugin.json version (${pluginJsonVersion}) != SKILL.md version (${frontmatterVersion})`);
  }

  if (marketplaceVersion && marketplaceVersion !== frontmatterVersion) {
    fail(`skills/${skill}: marketplace.json version (${marketplaceVersion}) != SKILL.md version (${frontmatterVersion})`);
  }

  if (!errors) {
    console.log(`✓ ${skill}: version ${frontmatterVersion} consistent`);
  }
}

if (errors > 0) process.exit(1);
