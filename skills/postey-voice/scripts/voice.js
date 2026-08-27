#!/usr/bin/env node
'use strict';

/**
 * postey-voice CLI. Local-machine work only, per docs/skills-mcp-contract.md:
 * reading the user's own files and doing deterministic arithmetic over them.
 * It calls no Postey API and creates nothing — the agent still does every write
 * through MCP.
 *
 *   voice.js ingest <path...> [--account ID] [--scope X] [--since ISO] [--out FILE]
 *       Bulk-ingest local content — a directory, a file, or a Postey/JSON export
 *       — and emit countable features plus rule observations.
 *       --account names the account this profile is FOR, and defaults the output
 *       to voice-profile-<id>.json so two accounts cannot overwrite each other.
 *       Without it the profile is written with profile_for: null and must not be
 *       applied to a named account.
 *
 *   voice.js compile <ledger.json> [--now ISO]
 *       Apply the rules-ledger thresholds and emit the compiled profile.
 *
 * JSON to stdout, human chrome to stderr — the repo convention.
 */

const fs = require('fs');
const path = require('path');

const { analyze, observationsFrom, summarise } = require('./voiceFeatures');
const { compileRules, activeRules } = require('./voiceRules');

const TEXT_EXT = new Set(['.md', '.txt', '.markdown']);
const MAX_BYTES = 2 * 1024 * 1024; // a 2 MB "post" is not a post

const out = data => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
const note = msg => { if (process.stderr.isTTY) process.stderr.write(`${msg}\n`); };
const die = (msg, hint) => {
  process.stdout.write(JSON.stringify({ error: msg, ...(hint && { hint }) }, null, 2) + '\n');
  process.exit(1);
};

function flag(args, name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

function walk(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const found = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

// A JSON export becomes many documents; a text file becomes one.
// Recognised export shapes: a bare array, {posts:[…]}, or {data:[…]}.
function documentsFrom(file) {
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  if (stat.size > MAX_BYTES) {
    note(`  skipped ${path.basename(file)} (over ${MAX_BYTES} bytes)`);
    return [];
  }

  if (ext === '.json') {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      note(`  skipped ${path.basename(file)} (not valid JSON)`);
      return [];
    }
    const rows = Array.isArray(parsed) ? parsed : parsed.posts || parsed.data || [];
    return rows
      .map((row, i) => ({
        id: row.post_id ?? row.id ?? `${path.basename(file)}#${i}`,
        text: row.text ?? row.content ?? row.caption ?? '',
        scope: row.platform ?? null,
        ts: row.published_at ?? row.created_at ?? row.ts ?? null,
      }))
      .filter(d => String(d.text).trim());
  }

  if (!TEXT_EXT.has(ext)) return [];
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return [];
  return [{ id: path.basename(file), text, scope: null, ts: null }];
}

function cmdIngest(args) {
  const paths = args.filter(a => !a.startsWith('--') && !isFlagValue(args, a));
  if (!paths.length) die('ingest needs at least one path', 'voice.js ingest ./my-posts');

  const scope = flag(args, 'scope');
  const since = flag(args, 'since');
  const account = flag(args, 'account');
  // A profile with no account behind it must stay visibly unscoped. The same rule
  // the schema applies to features without post ids: a later session cannot tell
  // a guess from evidence, so never let one look like the other.
  if (account !== null && !/^[A-Za-z0-9_-]+$/.test(account)) {
    die(`--account must be an account id, got: ${account}`, 'voice.js ingest ./posts --account 317');
  }
  // `--out` wins when given. Otherwise an account id names the file, so two
  // accounts cannot silently overwrite each other's profile.
  const outFile = flag(args, 'out') || (account ? `voice-profile-${account}.json` : null);
  // Undated documents still need a timestamp for the thresholds. Falling back to
  // the file's mtime keeps ordering real rather than inventing one.
  const docs = [];
  for (const target of paths) {
    if (!fs.existsSync(target)) die(`no such path: ${target}`);
    for (const file of walk(target)) {
      for (const doc of documentsFrom(file)) {
        docs.push({
          ...doc,
          scope: scope || doc.scope || 'all',
          ts: doc.ts || fs.statSync(file).mtime.toISOString(),
        });
      }
    }
  }

  const kept = since
    ? docs.filter(d => Date.parse(d.ts) >= Date.parse(since))
    : docs;

  if (!kept.length) die('no readable documents found', 'expected .md, .txt or a .json export');

  note(`ingested ${kept.length} document(s)`);

  const result = {
    corpus: {
      // Which account this profile is FOR. null means unscoped — derived from
      // local files with no account named. Never treat null as "the only account".
      profile_for: account,
      documents: kept.length,
      scopes: [...new Set(kept.map(d => d.scope))].sort(),
      window: [
        kept.reduce((a, d) => (a < d.ts ? a : d.ts), kept[0].ts),
        kept.reduce((a, d) => (a > d.ts ? a : d.ts), kept[0].ts),
      ],
    },
    features: summarise(kept),
    observations: observationsFrom(kept),
  };

  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
    note(`wrote ${outFile}`);
    if (!account) {
      note('  no --account given: this profile is unscoped. Do not apply it to a');
      note('  specific account without re-running with --account <id>.');
    }
  }
  out(result);
}

// `--scope X` — X is a value, not a path.
function isFlagValue(args, token) {
  const i = args.indexOf(token);
  return i > 0 && args[i - 1].startsWith('--');
}

function cmdCompile(args) {
  const file = args.find(a => !a.startsWith('--') && !isFlagValue(args, a));
  if (!file) die('compile needs a ledger file', 'voice.js compile ./voice-ledger.json');
  if (!fs.existsSync(file)) die(`no such file: ${file}`);

  const now = flag(args, 'now') || new Date().toISOString();
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    die(`ledger is not valid JSON: ${err.message}`);
  }

  const observations = [
    ...(ledger.observations || []),
    ...(ledger.verdict_observations || []),
  ];
  const rules = compileRules(observations, now);

  out({
    compiled_at: now,
    corpus: ledger.corpus || null,
    features: ledger.features || [],
    rules,
    active: activeRules(rules).map(r => r.rule),
  });
}

const COMMANDS = {
  ingest: cmdIngest,
  compile: cmdCompile,
};

function showHelp() {
  process.stderr.write(`Usage: voice.js <command>

Commands:
  ingest <path...>      Bulk-ingest local content into features + observations
  compile <ledger>      Apply thresholds and emit the compiled profile

Flags:
  --scope <PLATFORM>    Attribute every ingested document to one platform
  --since <ISO>         Ignore documents older than this
  --out <file>          Also write the result to a file
  --now <ISO>           Compile as of this instant (default: now)
`);
}

const [command, ...rest] = process.argv.slice(2);
const handler = COMMANDS[command];
if (!handler) {
  showHelp();
  process.exit(command ? 1 : 0);
}
try {
  handler(rest);
} catch (err) {
  die(err.message);
}
