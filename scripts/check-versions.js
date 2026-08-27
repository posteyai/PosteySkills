#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { discoverSkills } = require('./lib/skills');

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

// README shield badge: .../badge/version-X.Y.Z-green.svg
function parseReadmeBadgeVersion(readmePath) {
  if (!fs.existsSync(readmePath)) return null;
  const match = fs.readFileSync(readmePath, 'utf8').match(/badge\/version-([0-9.]+)-/);
  return match ? match[1] : null;
}

// Which skill each README badge tracks. The repo-level README badge tracks
// `postey`; a skill absent from this map has no badge to check. Add an entry
// when a skill gets its own badge — data, not a branch.
const README_BADGES = {
  postey: 'README.md',
};

const skillsDir = path.join(ROOT, 'skills');
const marketplacePath = path.join(ROOT, '.claude-plugin', 'marketplace.json');

for (const { name: skill, dir: skillDir } of discoverSkills(skillsDir)) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const pluginJsonPath = path.join(skillDir, '.claude-plugin', 'plugin.json');

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

  const packVersion = parsePackJsonVersion(path.join(skillDir, 'pack.json'));
  if (packVersion && packVersion !== frontmatterVersion) {
    fail(`skills/${skill}: pack.json version (${packVersion}) != SKILL.md version (${frontmatterVersion})`);
  }

  const registryVersion = parseRegistryVersion(path.join(skillsDir, 'REGISTRY.md'), skill);
  if (registryVersion && registryVersion !== frontmatterVersion) {
    fail(`skills/${skill}: REGISTRY.md version (${registryVersion}) != SKILL.md version (${frontmatterVersion})`);
  }

  const badgeFile = README_BADGES[skill];
  if (badgeFile) {
    const badgeVersion = parseReadmeBadgeVersion(path.join(ROOT, badgeFile));
    if (badgeVersion && badgeVersion !== frontmatterVersion) {
      fail(`${badgeFile} badge version (${badgeVersion}) != skills/${skill} SKILL.md version (${frontmatterVersion})`);
    }

    // Codex and Cursor read their own root manifests, and each carries its own
    // copy of the version. They are keyed to the hub because that is the plugin
    // both agents install; a pack ships inside it, not as a separate listing.
    // Unpinned, they silently advertise a stale version to two whole ecosystems.
    for (const manifest of ['.codex-plugin/plugin.json', '.cursor-plugin/plugin.json']) {
      const manifestVersion = parsePluginJsonVersion(path.join(ROOT, manifest));
      if (manifestVersion && manifestVersion !== frontmatterVersion) {
        fail(`${manifest} version (${manifestVersion}) != SKILL.md version (${frontmatterVersion})`);
      }
    }
  }

  if (!errors) {
    console.log(`✓ ${skill}: version ${frontmatterVersion} consistent`);
  }
}

if (errors > 0) process.exit(1);
