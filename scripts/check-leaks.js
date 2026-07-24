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
const TOKEN_RE = /[a-z0-9_]+/g;

function loadDenylist(jsonPath, extraPlaintextPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const hashes = new Set(raw.hashedTerms || []);
  const extraPath = extraPlaintextPath || process.env.LEAK_EXTRA_DENYLIST;
  let extraTerms = '';
  if (extraPath && fs.existsSync(extraPath)) extraTerms += fs.readFileSync(extraPath, 'utf8') + '\n';
  if (process.env.LEAK_EXTRA_TERMS) extraTerms += process.env.LEAK_EXTRA_TERMS;
  for (const term of extraTerms.split(/\r?\n/)) {
    const t = term.trim().toLowerCase();
    if (t) hashes.add(crypto.createHash('sha256').update(t).digest('hex'));
  }
  const patterns = (raw.patterns || []).map((p) => ({
    name: p.name,
    re: new RegExp(p.regex, 'g'),
  }));
  return { hashes, patterns };
}

function mask(tok) {
  return tok.length <= 2 ? '***' : tok[0] + '***';
}

function scanText(text, denylist) {
  const finds = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, i) => {
    for (const tok of lineText.toLowerCase().match(TOKEN_RE) || []) {
      const hex = crypto.createHash('sha256').update(tok).digest('hex');
      if (denylist.hashes.has(hex)) {
        finds.push({ line: i + 1, kind: 'denylisted-term', masked: mask(tok) });
      }
    }
    for (const p of denylist.patterns) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(lineText)) !== null) {
        finds.push({ line: i + 1, kind: p.name, masked: mask(m[0]) });
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
        for (const f of scanText(fs.readFileSync(full, 'utf8'), denylist)) {
          out.push({ file: path.relative(process.cwd(), full), ...f });
        }
      }
    }
  })(rootDir);
  return out;
}

if (require.main === module) {
  const target = process.argv[2] || 'skills';
  const denylist = loadDenylist(path.join(__dirname, 'leak-denylist.json'));
  const finds = scanTree(path.resolve(target), denylist);
  if (finds.length) {
    for (const f of finds) console.error(`${f.file}:${f.line} [${f.kind}] ${f.masked}`);
    console.error(`check-leaks: ${finds.length} finding(s). Failing.`);
    process.exit(1);
  }
  console.log('check-leaks: clean');
}

module.exports = { loadDenylist, scanText, scanTree };
