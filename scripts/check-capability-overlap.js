#!/usr/bin/env node
'use strict';

/**
 * CI: no CLI command may reach an effect MCP owns (S9.6).
 *
 * The contract's rule is a single question — *"does this require access to
 * something only the user's machine has, or is it judgment rather than
 * contract?"* Yes → skill. No → MCP. Arguable → MCP, because MCP is the one that
 * can enforce permissions.
 *
 * WHAT THIS DELIBERATELY IS NOT
 *
 * A literal `commandNames ∩ toolNames` check passes vacuously. The two surfaces
 * do not share a naming convention: the CLI says `media:upload`, MCP says
 * `upload_media`. Their intersection is empty today and would stay empty even if
 * someone added a `posts:create` that duplicated `create_post` outright — which
 * is the exact violation (V-1) this repo already had to fix once. A gate that
 * cannot fail is worse than no gate, because it reads as protection. That is the
 * lesson F-026/L-016 cost twice already.
 *
 * So this compares CAPABILITY, not spelling. Each CLI command normalises to a
 * `noun.verb` key (`media:upload` → `media.upload`) and is checked against the
 * canonical provider recorded in capability-snapshot.json, which is generated from
 * postey://skill-manifest. If the canonical provider of that capability is an MCP
 * tool or resource, the CLI is duplicating MCP — unless the contract explicitly
 * assigns it to the skill, which is what SKILL_OWNED records.
 *
 * Exit codes: 0 = no overlap, 1 = a CLI command duplicates MCP.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKILL_DIR = path.join(ROOT, 'skills', 'postey');
const CLI = path.join(SKILL_DIR, 'scripts', 'postey.js');
const SNAPSHOT = path.join(SKILL_DIR, 'capability-snapshot.json');

/**
 * Capabilities the CONTRACT assigns to the skill even though MCP also serves the
 * capability name. Each answers the dividing question with "yes — only the user's
 * machine has this", and each cites the ownership-table row that grants it.
 *
 * Adding an entry here is the deliberate, reviewable act of claiming an exception.
 * That is the point: the gate does not block layering, it blocks *silent* layering.
 */
const SKILL_OWNED = {
  'media:upload': {
    overlaps: 'media.upload',
    why:
      'Chunked / large-file upload — streams from disk; MCP\'s inline path is ' +
      'context-bound. upload_media\'s own description defers local_path here.',
  },
  'video transcribe': {
    overlaps: 'media.transcribe',
    why:
      'Video processing — needs local ffmpeg and the file itself. transcribe_video ' +
      'runs PosteySkills video2post.js, so MCP delegates here rather than competing.',
  },
};

/** Commands that are not capabilities at all — local config and help. */
const NOT_A_CAPABILITY = new Set([
  'help',
  '--help',
  '-h',
  'setup',
  'config:show',
  'auth:login',
  'auth:logout',
]);

let errors = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  errors++;
};

function cliCommands() {
  const src = fs.readFileSync(CLI, 'utf8');
  const block = src.match(/const COMMANDS\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    console.error('✗ could not locate the COMMANDS table in postey.js');
    process.exit(1);
  }
  const top = block[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .map((line) => line.match(/^"?([a-zA-Z0-9:_-]+)"?\s*:/))
    .filter(Boolean)
    .map((m) => m[1]);

  // Expand group commands into their subcommands, keeping the group itself out:
  // `video` alone is not a capability, `video transcribe` is.
  const expanded = [];
  for (const command of top) {
    const subs = /Group,?$/.test(block[1].match(
      new RegExp(`"?${command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?\\s*:\\s*(\\w+)`)
    )?.[1] || '') ? subcommandsOf(command, src) : [];
    if (subs.length) expanded.push(...subs.map((s) => `${command} ${s}`));
    else expanded.push(command);
  }
  return expanded;
}

/** `media:upload` → `media.upload`; `video transcribe` → `video.transcribe`. */
const toCapability = (command) => command.replace(/[: ]/g, '.');

/**
 * Subcommands of a group command, e.g. `video post` / `video transcribe`.
 *
 * Without these the group name `video` is all CI would see, and `video transcribe`
 * duplicating `transcribe_video` would be invisible — the same vacuity a literal
 * name check has. Read from the group's own help text, which is the one place the
 * subcommands are already enumerated for users.
 */
function subcommandsOf(group, src) {
  // The group's own --help text is the canonical enumeration for users, so it is
  // the one place that cannot drift from what the CLI actually offers.
  const help = src.match(
    new RegExp(`Usage: postey\\.js ${group} <subcommand>[\\s\\S]*?Subcommands:\\\\n([\\s\\S]*?)\\\\n\\\\n`)
  );
  if (!help) return [];
  return [...new Set(
    [...help[1].matchAll(/(?:^|\\n)\s*([a-z][a-z0-9-]*)\s{2,}/g)].map((m) => m[1])
  )];
}

function main() {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const canonical = snapshot.canonical || {};
  const mcpTools = new Set(snapshot.tools || []);
  const commands = cliCommands();

  if (commands.length === 0) {
    console.error('✗ parsed zero CLI commands — the check would pass vacuously');
    process.exit(1);
  }

  for (const command of commands) {
    // The cheap literal case: a command named exactly like an MCP tool.
    if (mcpTools.has(command)) {
      fail(`\`${command}\` is also an MCP tool of the same name`);
      continue;
    }
    if (NOT_A_CAPABILITY.has(command)) continue;

    const declared = SKILL_OWNED[command];
    if (declared) {
      // A declaration is only cover if the capability it names is real. A typo or
      // a renamed capability would otherwise be a permanent silent exemption.
      if (!canonical[declared.overlaps]) {
        fail(
          `SKILL_OWNED['${command}'] claims capability \`${declared.overlaps}\`, ` +
            `which no longer exists in the snapshot — the exemption is stale`
        );
      } else {
        console.log(
          `  · \`${command}\` overlaps \`${canonical[declared.overlaps]}\` — ` +
            `allowed: ${declared.why}`
        );
      }
      continue;
    }

    // Undeclared: fall back to spelling. This catches the accidental duplicate
    // (`posts:create` vs `create_post`), which is what V-1 actually was. It cannot
    // catch a duplicate that renames its noun — that is what the declarations and
    // review are for, and pretending otherwise is how a gate becomes decoration.
    const capability = toCapability(command);
    const provider = canonical[capability];
    if (!provider) continue;

    const servedByMcp =
      mcpTools.has(provider) || String(provider).startsWith('postey://');
    if (!servedByMcp) continue;

    fail(
      `\`${command}\` serves \`${capability}\`, whose canonical provider is ` +
        `\`${provider}\` (MCP). Either delete the command, or — if it genuinely ` +
        `needs the user's machine — declare it in SKILL_OWNED citing the contract row.`
    );
  }

  // The inverse rot: an exemption for a command that no longer exists quietly
  // grants cover to whatever later takes that name.
  for (const command of Object.keys(SKILL_OWNED)) {
    if (!commands.includes(command)) {
      fail(
        `SKILL_OWNED lists \`${command}\` but the CLI has no such command — ` +
          `remove the stale exemption`
      );
    }
  }

  if (errors) {
    console.error(`\n✗ ${errors} capability overlap(s) — see docs/skills-mcp-contract.md`);
    process.exit(1);
  }
  console.log(`✓ ${commands.length} CLI commands, no undeclared overlap with MCP`);
}

// `cliCommands` is the one parser of the COMMANDS table; check-doc-commands.js
// reuses it rather than growing a second copy that could disagree with this one.
module.exports = { cliCommands };

if (require.main === module) main();
