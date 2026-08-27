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

// A malformed manifest is a finding, not a crash: the message has to name the
// file, or a stray trailing comma surfaces as a bare SyntaxError stack.
function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`${path.relative(ROOT, file)} is not valid JSON: ${err.message}`);
    return null;
  }
}

function parsePluginJsonVersion(pluginJsonPath) {
  return readJson(pluginJsonPath)?.version || null;
}

function parseMarketplaceVersion(marketplacePath, pluginName) {
  const json = readJson(marketplacePath);
  return json ? (json.plugins || []).find(p => p.name === pluginName)?.version || null : null;
}

function parsePackJsonVersion(packJsonPath) {
  return readJson(packJsonPath)?.version || null;
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
const HUB_SKILL = 'postey';
const README_BADGES = {
  [HUB_SKILL]: 'README.md',
};

const skillsDir = path.join(ROOT, 'skills');
const marketplacePath = path.join(ROOT, '.claude-plugin', 'marketplace.json');

// discoverSkills returns [] for a missing or renamed skills/ directory. Without
// this the loop body never runs, errors stays 0, and the gate reports success
// having compared nothing. check-release-tag.mjs already refuses to pass on an
// empty set; this is the same stance.
const skills = discoverSkills(skillsDir);
if (skills.length === 0) {
  console.error(`✗ no skills found under ${skillsDir} — the check has nothing to assert, which is a failure`);
  process.exit(1);
}

for (const { name: skill, dir: skillDir } of skills) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const pluginJsonPath = path.join(skillDir, '.claude-plugin', 'plugin.json');

  const frontmatterVersion = parseFrontmatterVersion(skillMdPath);
  const pluginJsonVersion = parsePluginJsonVersion(pluginJsonPath);
  const marketplaceVersion = parseMarketplaceVersion(marketplacePath, skill);

  if (!frontmatterVersion) {
    fail(`skills/${skill}/SKILL.md missing 'version:' in frontmatter`);
    continue;
  }

  // Every version place, as data. Each row is asserted the same way: declared
  // but unreadable is a failure, never a skip — that is how a place goes stale
  // with the gate green. `hubOnly` rows are keyed to the hub because that is the
  // plugin Codex and Cursor install; a pack ships inside it, not as its own
  // listing. Keeping this a table (rather than a block per place) is what stops
  // a new place from being added to the writer and forgotten here.
  const isHub = skill === HUB_SKILL;
  const places = [
    [`skills/${skill}/.claude-plugin/plugin.json`, pluginJsonVersion],
    ['.claude-plugin/marketplace.json', marketplaceVersion],
    [`skills/${skill}/pack.json`, parsePackJsonVersion(path.join(skillDir, 'pack.json'))],
    ['skills/REGISTRY.md', parseRegistryVersion(path.join(skillsDir, 'REGISTRY.md'), skill)],
    // Two independent rules, kept independent: a badge belongs to whichever skill
    // README_BADGES names, while the Codex and Cursor manifests always track the
    // hub. Deriving the second from the first is what let both rows switch off
    // together when the badge entry was the only thing turning them on.
    ...(README_BADGES[skill]
      ? [[README_BADGES[skill], parseReadmeBadgeVersion(path.join(ROOT, README_BADGES[skill]))]]
      : []),
    ...(isHub
      ? ['.codex-plugin/plugin.json', '.cursor-plugin/plugin.json'].map((m) => [
          m,
          parsePluginJsonVersion(path.join(ROOT, m)),
        ])
      : []),
  ];

  for (const [where, actual] of places) {
    if (!actual) {
      fail(`${where}: missing or carries no version — skills/${skill} declares ${frontmatterVersion}`);
    } else if (actual !== frontmatterVersion) {
      fail(`${where}: ${actual} != skills/${skill} SKILL.md version (${frontmatterVersion})`);
    }
  }

  if (!errors) {
    console.log(`✓ ${skill}: version ${frontmatterVersion} consistent`);
  }
}

if (errors > 0) process.exit(1);
