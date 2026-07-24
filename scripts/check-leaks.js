#!/usr/bin/env node
'use strict';
// CI gate: fail if any file under the target directory contains a denylisted
// private identifier (hashed exact-token match) or a secret-shaped pattern.
// The plaintext denylist is private; this repo carries only sha256 hashes.
// Extend at runtime with LEAK_EXTRA_DENYLIST=<path to plaintext terms file>.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SKIP_DIRS = new Set(['node_modules', '.git']);
// Unicode-aware: hyphenated, dotted, spaced, or accented terms become token
// SEQUENCES ("acme-corp" -> ["acme","corp"]) and are matched as n-grams.
const TOKEN_RE = /[\p{L}\p{N}_]+/gu;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function tokenize(text) {
  return text.toLowerCase().match(TOKEN_RE) || [];
}

// A term is stored as the hash of its space-joined token sequence, keyed by
// token count, so "internal.example.com" and "internal example com" match alike.
function addTerm(term, byLen) {
  const toks = tokenize(term);
  if (!toks.length) return;
  const n = toks.length;
  if (!byLen.has(n)) byLen.set(n, new Set());
  byLen.get(n).add(sha256(toks.join(' ')));
}

function loadDenylist(jsonPath, extraPlaintextPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const byLen = new Map();
  if (raw.hashedTerms && raw.hashedTerms.length) byLen.set(1, new Set(raw.hashedTerms));
  for (const p of raw.hashedPhrases || []) {
    if (!byLen.has(p.n)) byLen.set(p.n, new Set());
    byLen.get(p.n).add(p.hash);
  }
  const extraPath = extraPlaintextPath || process.env.LEAK_EXTRA_DENYLIST;
  let extraTerms = '';
  if (extraPath && fs.existsSync(extraPath)) extraTerms += fs.readFileSync(extraPath, 'utf8') + '\n';
  if (process.env.LEAK_EXTRA_TERMS) extraTerms += process.env.LEAK_EXTRA_TERMS;
  for (const term of extraTerms.split(/\r?\n/)) {
    if (term.trim()) addTerm(term, byLen);
  }
  const patterns = (raw.patterns || []).map((p) => ({
    name: p.name,
    re: new RegExp(p.regex, 'g'),
  }));
  return { byLen, patterns };
}

function mask(tok) {
  return tok.length <= 2 ? '***' : tok[0] + '***';
}

function scanText(text, denylist) {
  const finds = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, i) => {
    const toks = tokenize(lineText);
    for (const [n, hashSet] of denylist.byLen) {
      for (let s = 0; s + n <= toks.length; s++) {
        const gram = toks.slice(s, s + n).join(' ');
        if (hashSet.has(sha256(gram))) {
          finds.push({ line: i + 1, kind: 'denylisted-term', masked: mask(gram) });
        }
      }
    }
    for (const p of denylist.patterns) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(lineText)) !== null) {
        finds.push({ line: i + 1, kind: p.name, masked: mask(m[0]) });
        if (m[0] === '') p.re.lastIndex++;
      }
    }
  });
  return finds;
}

function scanTree(rootDir, denylist) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const buf = fs.readFileSync(full);
        if (buf.subarray(0, 1024).includes(0)) continue; // binary: skip
        for (const f of scanText(buf.toString('utf8'), denylist)) {
          out.push({ file: path.relative(process.cwd(), full), ...f });
        }
      }
    }
  })(rootDir);
  return out;
}

if (require.main === module) {
  const targets = process.argv.length > 2 ? process.argv.slice(2) : ['skills'];
  const denylist = loadDenylist(path.join(__dirname, 'leak-denylist.json'));
  const finds = [];
  for (const target of targets) {
    const full = path.resolve(target);
    if (fs.statSync(full).isDirectory()) {
      finds.push(...scanTree(full, denylist));
    } else {
      for (const f of scanText(fs.readFileSync(full, 'utf8'), denylist)) {
        finds.push({ file: path.relative(process.cwd(), full), ...f });
      }
    }
  }
  if (finds.length) {
    for (const f of finds) console.error(`${f.file}:${f.line} [${f.kind}] ${f.masked}`);
    console.error(`check-leaks: ${finds.length} finding(s). Failing.`);
    process.exit(1);
  }
  console.log('check-leaks: clean');
}

module.exports = { loadDenylist, scanText, scanTree };
