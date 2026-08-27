#!/usr/bin/env node
'use strict';
// CI gate: fail if any file under the target(s) contains a denylisted private
// identifier (hashed exact-token match) or a secret-shaped pattern.
// The plaintext denylist is private; this repo carries only sha256 hashes.
// Extend at runtime with:
//   LEAK_EXTRA_DENYLIST=<path to a plaintext terms file>  (one term per line)
//   LEAK_EXTRA_TERMS=<terms inline>                       (newline- or comma-separated)
// Hash a term for the committed denylist with:
//   node scripts/check-leaks.js --hash "<term>"
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Names skipped at any depth: never shipped, never scanned. Matched by name
// before type, because `.git` is a FILE in a linked worktree — it holds a
// `gitdir:` line pointing at the real repository. Skipping it only when it is a
// directory means every run inside a worktree scans that absolute path, which
// is exactly the workflow this repo documents.
const SKIP_DIR_NAMES = new Set(['node_modules', '.git']);
// Skipped only when directly under the scan root: the repo-level tests/
// directory holds synthetic secret-shaped fixtures. A tests/ directory nested
// inside shipped skill content is NOT exempt — shipped content is always scanned.
// .claude/ holds agent worktrees. They are untracked, so CI never sees them,
// but a local run walks into whatever branch they hold and reports findings
// from code that is not in this checkout. That made the gate unusable locally,
// which is worse than a gap — a check nobody can run is a check nobody runs.
// Scoped to the root, so a skill shipping its own .claude/ is still scanned.
const ROOT_SKIP_DIRS = new Set(['tests']);
// .claude/worktrees holds agent worktrees: untracked, and a local run would walk
// into whatever branch they hold. .claude itself stays scanned — settings.json is
// committed, and exempting committed content is what this gate exists to prevent.
const SKIP_REL_DIRS = new Set([path.join('.claude', 'worktrees')]);
// Unicode-aware: hyphenated, dotted, spaced, underscored, or accented terms
// become token SEQUENCES ("acme-corp" and "acme_corp" -> ["acme","corp"]) and
// are matched as n-grams across line breaks. Text is NFKC-normalized with
// format chars (Cf: zero-width etc.) AND nonspacing marks (Mn: combining
// joiners, variation selectors) stripped, so invisible characters can neither
// split a token nor disguise a secret-shaped pattern.
const TOKEN_RE = /[\p{L}\p{N}]+/gu;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const HASH_RE = /^[0-9a-f]{64}$/;

function normalizeText(text) {
  return text.normalize('NFKC').replace(/[\p{Cf}\p{Mn}]/gu, '');
}

function tokenize(text) {
  return normalizeText(text).toLowerCase().match(TOKEN_RE) || [];
}

// The single hashing convention for denylist entries: sha256 of the
// space-joined, tokenized term, keyed by token count. Use this (via the
// --hash CLI mode) to generate committed hashes; hand-rolled sha256 of the
// raw term will NOT match for any term containing a separator.
function hashTerm(term) {
  const toks = tokenize(term);
  if (!toks.length) return null;
  return { n: toks.length, hash: sha256(toks.join(' ')) };
}

function addTerm(term, byLen) {
  const h = hashTerm(term);
  if (!h) return;
  if (!byLen.has(h.n)) byLen.set(h.n, new Set());
  byLen.get(h.n).add(h.hash);
}

function addHash(n, hash, byLen, source) {
  if (!Number.isInteger(n) || n < 1 || !HASH_RE.test(hash)) {
    throw new Error(`invalid denylist entry in ${source}: hashes must be 64-char lowercase hex with n >= 1`);
  }
  if (!byLen.has(n)) byLen.set(n, new Set());
  byLen.get(n).add(hash);
}

function loadDenylist(jsonPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const byLen = new Map();
  for (const hash of raw.hashedTerms || []) addHash(1, hash, byLen, 'hashedTerms');
  for (const p of raw.hashedPhrases || []) addHash(p.n, p.hash, byLen, 'hashedPhrases');
  const extraPath = process.env.LEAK_EXTRA_DENYLIST;
  let extraTerms = '';
  if (extraPath && fs.existsSync(extraPath)) extraTerms += fs.readFileSync(extraPath, 'utf8') + '\n';
  if (process.env.LEAK_EXTRA_TERMS) extraTerms += process.env.LEAK_EXTRA_TERMS;
  for (const term of extraTerms.split(/[\r\n,]+/)) {
    if (term.trim()) addTerm(term, byLen);
  }
  const patterns = (raw.patterns || []).map((p) => ({
    name: p.name,
    re: new RegExp(p.regex, 'g'),
  }));
  return { byLen, patterns };
}

function scanText(text, denylist) {
  const finds = [];
  const lines = normalizeText(text).split(/\r?\n/);
  // Patterns run per normalized line, so invisible chars inside a key or JID
  // cannot break the shape.
  lines.forEach((lineText, i) => {
    for (const p of denylist.patterns) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(lineText)) !== null) {
        finds.push({ line: i + 1, kind: p.name });
        if (m[0] === '') p.re.lastIndex++;
      }
    }
  });
  // n-grams slide over the whole file's token stream (not per line), so a
  // multi-token term that hard-wraps across a line break still matches.
  // Findings report the line of the first token in the gram.
  const toks = [];
  lines.forEach((lineText, i) => {
    for (const t of lineText.toLowerCase().match(TOKEN_RE) || []) {
      toks.push({ t, line: i + 1 });
    }
  });
  for (const [n, hashSet] of denylist.byLen) {
    for (let s = 0; s + n <= toks.length; s++) {
      const gram = toks.slice(s, s + n).map((x) => x.t).join(' ');
      if (hashSet.has(sha256(gram))) {
        finds.push({ line: toks[s].line, kind: 'denylisted-term' });
      }
    }
  }
  return finds.sort((a, b) => a.line - b.line);
}

// Decode a file for scanning. UTF-16 (BOM-detected) is decoded rather than
// mistaken for binary — every ASCII char in UTF-16 carries a 0x00 byte, and
// Windows tools (PowerShell 5 redirection, Notepad "Unicode") emit UTF-16 by
// default. Returns null only for genuinely binary content.
function decodeFile(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le');
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');
  }
  if (buf.subarray(0, 1024).includes(0)) return null; // binary: skip
  return buf.toString('utf8');
}

function scanTree(rootDir, denylist) {
  const out = [];
  (function walk(dir, isRoot) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      // Skip by name regardless of type: in a git worktree `.git` is a FILE
      // holding `gitdir: <absolute path>`, and that path is not content either.
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      if (entry.isDirectory()) {
        if (isRoot && ROOT_SKIP_DIRS.has(entry.name)) continue;
        if (SKIP_REL_DIRS.has(path.relative(rootDir, full))) continue;
        walk(full, false);
      } else if (entry.isFile()) {
        // Symlinks are intentionally not followed: no cycles, no escaping the
        // target tree. In-tree symlink targets (e.g. AGENTS.md -> CLAUDE.md)
        // are scanned directly as their own entries.
        const text = decodeFile(fs.readFileSync(full));
        if (text === null) continue;
        for (const f of scanText(text, denylist)) {
          out.push({ file: path.relative(process.cwd(), full), ...f });
        }
      }
    }
  })(rootDir, true);
  return out;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--hash') {
    const term = argv.slice(1).join(' ');
    const h = term ? hashTerm(term) : null;
    if (!h) {
      console.error('usage: check-leaks.js --hash "<term>"');
      process.exit(2);
    }
    // n === 1 goes into hashedTerms; n > 1 goes into hashedPhrases as {n, hash}.
    console.log(JSON.stringify(h));
    process.exit(0);
  }
  // Default target is the repo root — the same scope CI scans — regardless of
  // the caller's working directory.
  const targets = argv.length > 0 ? argv : [path.resolve(__dirname, '..')];
  const denylist = loadDenylist(path.join(__dirname, 'leak-denylist.json'));
  const finds = [];
  for (const target of targets) {
    const full = path.resolve(target);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      console.error(`check-leaks: target not found: ${target}`);
      process.exit(2);
    }
    if (st.isDirectory()) {
      finds.push(...scanTree(full, denylist));
    } else {
      const text = decodeFile(fs.readFileSync(full));
      if (text !== null) {
        for (const f of scanText(text, denylist)) {
          finds.push({ file: path.relative(process.cwd(), full), ...f });
        }
      }
    }
  }
  if (finds.length) {
    // Never echo any part of a match; file:line + kind locate it.
    for (const f of finds) console.error(`${f.file}:${f.line} [${f.kind}] ***`);
    console.error(`check-leaks: ${finds.length} finding(s). Failing.`);
    process.exit(1);
  }
  console.log('check-leaks: clean');
}

module.exports = { loadDenylist, scanText, scanTree, tokenize, hashTerm, sha256 };
