#!/usr/bin/env node
'use strict';

/**
 * CI: no shipped guidance may route to a CLI command that does not exist.
 *
 * F-031 was exactly this. S9.1 deleted every write command from the CLI, and
 * `routing-guide.md` went on sending CI/CD, Cursor, Windsurf and SDK agents to
 * "the CLI" for create / update / publish / schedule. The prose and the COMMANDS
 * table disagreed for a whole release because nobody re-read both at once.
 *
 * So: every command a shipped doc names must be in the COMMANDS table of
 * postey.js — the table itself, parsed, not the reference doc's own prose (which
 * is another copy that can drift the same way). The parser is imported from
 * check-capability-overlap.js so there is exactly one of it.
 *
 * Commands that were REMOVED are still legitimately nameable — "never run X, it
 * does not exist" is useful guidance. Those are declared below, but a declaration
 * is not a blanket pass: the mention has to READ as a warning, or the exemption
 * would have covered F-031 itself (which was an affirmative route to a removed
 * command). The declaration is also self-checking in both directions: naming a
 * command that came back fails, and declaring one no doc mentions fails.
 *
 * Exit codes: 0 = every named command exists, 1 = a doc routes somewhere real.
 */

const fs = require('fs');
const path = require('path');
const { cliCommands } = require('./check-capability-overlap.js');

const ROOT = path.resolve(__dirname, '..');
const SKILLS = path.join(ROOT, 'skills');

/**
 * Commands the docs name in order to tell an agent NOT to use them. Each is a
 * command this repo deliberately removed; the contract (docs/skills-mcp-contract.md)
 * gives the effect to MCP.
 */
const REMOVED_ON_PURPOSE = {
  'drafts:create': 'removed — MCP create_post owns it',
  'drafts:publish': 'removed — MCP publish_draft owns it',
  'drafts:schedule': 'removed — MCP schedule_post owns it',
  'accounts:list': 'never existed — postey://accounts / get_accounts owns it',
};

/**
 * SKILL.md's `routing:` map is the machine-readable half of the same guidance,
 * and F-031's exact wording named no command at all — it just said "→ CLI". The
 * map is where that claim is checkable: only an operation the CONTRACT gives the
 * skill may route to `cli`. `ci-environment: cli` and `fallback: cli` both failed
 * this rule, and both shipped.
 *
 * An environment is not an operation; an unknown operation is not the skill's.
 */
const CLI_ROUTABLE = {
  'local-file': 'Local filesystem access — the server cannot see the user\'s disk',
  'video-transcription': 'Video processing — needs local ffmpeg and the file itself',
};

const ROUTING_PATHS = new Set(['mcp-resource', 'mcp-tool', 'cli']);

/**
 * A removed command may only be named on a line that says it is gone. Anything
 * else is a route, and a route to a removed command is the defect.
 */
const WARNS_AGAINST = /\bnever\b|\bdo not use\b|\bremoved\b|\bno longer\b|\bdoes not exist\b|\bdid not exist\b/i;

/**
 * CHANGELOG files are release history: they must name removed commands to record
 * removing them, and that list only grows. Everything else under skills/ is
 * guidance an agent acts on.
 */
const SKIP_FILES = new Set(['CHANGELOG.md']);

let errors = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  errors++;
};

function markdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.name.endsWith('.md') && !SKIP_FILES.has(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Command references in a line of markdown, in the two forms the docs use:
 *   1. an invocation — `postey.js video transcribe …`
 *   2. a bare colon-form command name — `media:upload`, `posts:create`
 * The colon form is unambiguous CLI shape: `postey://accounts` does not match
 * (the resource has `//`), and neither does ordinary prose punctuation.
 */
function commandsIn(line, groups) {
  const found = [];

  for (const m of line.matchAll(/postey\.js\s+([a-z][a-z0-9:_-]*)(?:\s+([a-z][a-z0-9-]*))?/g)) {
    const [, head, next] = m;
    found.push(groups.has(head) && next ? `${head} ${next}` : head);
  }

  for (const m of line.matchAll(/`([a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*)`/g)) {
    found.push(m[1]);
  }

  return found;
}

/** The `routing:` block of SKILL.md's frontmatter, as {key: [path, …]}. */
function routingMap() {
  const src = fs.readFileSync(path.join(SKILLS, 'postey', 'SKILL.md'), 'utf8');
  const block = src.match(/^routing:\n((?:[ \t]+\S[^\n]*\n)+)/m);
  if (!block) {
    console.error('✗ could not locate the routing: block in SKILL.md');
    process.exit(1);
  }
  const map = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s+([a-z][a-z0-9-]*):\s*([^#\n]+)/);
    if (m) map[m[1]] = m[2].trim().split('>').map((p) => p.trim()).filter(Boolean);
  }
  return map;
}

function checkRouting() {
  const map = routingMap();
  const keys = Object.keys(map);
  if (keys.length === 0) {
    console.error('✗ parsed zero routing rules — the check would pass vacuously');
    process.exit(1);
  }

  for (const [key, paths] of Object.entries(map)) {
    for (const p of paths) {
      if (!ROUTING_PATHS.has(p)) {
        fail(`SKILL.md routing \`${key}\` names path \`${p}\`, which is not one of ${[...ROUTING_PATHS].join(' | ')}`);
      }
    }
    if (paths[0] === 'cli' && !(key in CLI_ROUTABLE)) {
      fail(
        `SKILL.md routes \`${key}\` to the CLI, but the contract gives the skill only ` +
          `${Object.keys(CLI_ROUTABLE).join(' and ')}. Either this is MCP's ` +
          `(docs/skills-mcp-contract.md), or add the row there first and declare it in CLI_ROUTABLE.`
      );
    }
  }

  for (const key of Object.keys(CLI_ROUTABLE)) {
    if (!(key in map)) {
      fail(`CLI_ROUTABLE declares \`${key}\`, which SKILL.md's routing map no longer has — remove the stale entry`);
    }
  }
  return keys.length;
}

function main() {
  const commands = cliCommands();
  if (commands.length === 0) {
    console.error('✗ parsed zero CLI commands — the check would pass vacuously');
    process.exit(1);
  }

  // `video post` is a command; `video` on its own is a group prefix, and a doc
  // may legitimately write `postey.js video <subcommand> --help`.
  const groups = new Set(
    commands.filter((c) => c.includes(' ')).map((c) => c.split(' ')[0])
  );
  const known = new Set([...commands, ...groups]);

  const files = markdownFiles(SKILLS);
  const mentioned = new Set();
  let checked = 0;

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const command of commandsIn(line, groups)) {
        checked++;
        if (known.has(command)) continue;
        if (command in REMOVED_ON_PURPOSE) {
          mentioned.add(command);
          if (WARNS_AGAINST.test(line)) continue;
          fail(
            `${rel}:${i + 1} routes to \`${command}\` (${REMOVED_ON_PURPOSE[command]}). ` +
              `A removed command may only be named on a line that says it is gone.`
          );
          continue;
        }
        fail(
          `${rel}:${i + 1} routes to \`${command}\`, which the CLI does not have. ` +
            `Either the doc is stale, or — if it is naming a removed command to ` +
            `warn against it — declare it in REMOVED_ON_PURPOSE.`
        );
      }
    });
  }

  if (checked === 0) {
    console.error('✗ found zero command references in skills/ — the scan is not working');
    process.exit(1);
  }

  // A declaration for a command that came back would silently exempt a real
  // overlap; one no doc mentions is dead cover for whatever next takes the name.
  for (const [command, why] of Object.entries(REMOVED_ON_PURPOSE)) {
    if (known.has(command)) {
      fail(`REMOVED_ON_PURPOSE lists \`${command}\` (${why}) but the CLI now has it — the declaration is stale`);
    } else if (!mentioned.has(command)) {
      fail(`REMOVED_ON_PURPOSE lists \`${command}\` but no shipped doc mentions it — remove the stale entry`);
    }
  }

  const rules = checkRouting();

  if (errors) {
    console.error(`\n✗ ${errors} routing defect(s) — see docs/skills-mcp-contract.md`);
    process.exit(1);
  }
  console.log(
    `✓ ${checked} command references across ${files.length} docs, all in the COMMANDS table`
  );
  console.log(`✓ ${rules} routing rules, none sending an MCP-owned operation to the CLI`);
}

main();
