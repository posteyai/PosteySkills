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

function parsePackJsonVersion(packJsonPath) {
  if (!fs.existsSync(packJsonPath)) return null;
  const json = JSON.parse(fs.readFileSync(packJsonPath, 'utf8'));
  return json.version || null;
}

// REGISTRY.md table row: | [name](name/) | ... | status | version |
function parseRegistryVersion(registryPath, skillName) {
  if (!fs.existsSync(registryPath)) return null;
  const content = fs.readFileSync(registryPath, 'utf8');
  const row = content.split('\n').find(l => l.includes(`[${skillName}](`));
  if (!row) return null;
  const cells = row.split('|').map(c => c.trim()).filter(Boolean);
  return cells.length ? cells[cells.length - 1] : null;
}

// README shield badge: .../badge/version-X.Y.Z-green.svg (repo-level badge
// tracks the postey skill version).
function parseReadmeBadgeVersion(readmePath) {
  if (!fs.existsSync(readmePath)) return null;
  const match = fs.readFileSync(readmePath, 'utf8').match(/badge\/version-([0-9.]+)-/);
  return match ? match[1] : null;
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

  const packVersion = parsePackJsonVersion(path.join(skillsDir, skill, 'pack.json'));
  if (packVersion && packVersion !== frontmatterVersion) {
    fail(`skills/${skill}: pack.json version (${packVersion}) != SKILL.md version (${frontmatterVersion})`);
  }

  const registryVersion = parseRegistryVersion(path.join(skillsDir, 'REGISTRY.md'), skill);
  if (registryVersion && registryVersion !== frontmatterVersion) {
    fail(`skills/${skill}: REGISTRY.md version (${registryVersion}) != SKILL.md version (${frontmatterVersion})`);
  }

  if (skill === 'postey') {
    const badgeVersion = parseReadmeBadgeVersion(path.join(ROOT, 'README.md'));
    if (badgeVersion && badgeVersion !== frontmatterVersion) {
      fail(`README.md badge version (${badgeVersion}) != SKILL.md version (${frontmatterVersion})`);
    }
  }

  if (!errors) {
    console.log(`✓ ${skill}: version ${frontmatterVersion} consistent`);
  }
}

if (errors > 0) process.exit(1);
