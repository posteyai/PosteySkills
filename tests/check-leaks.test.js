'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { scanText, scanTree, loadDenylist } = require('../scripts/check-leaks.js');

const h = (s) => crypto.createHash('sha256').update(s.toLowerCase()).digest('hex');
const dl = {
  byLen: new Map([
    [1, new Set([h('zzsecretname'), h('sky'), h('josé')])],
    [2, new Set([h('acme corp')])],
    [3, new Set([h('internal example com')])],
  ]),
  patterns: [
    { name: 'postey-api-key', re: /mk_[A-Za-z0-9_-]{20,}/g },
    { name: 'whatsapp-group', re: /\d{10,}@g\.us/g },
  ],
};

test('flags a denylisted token with masked output', () => {
  const finds = scanText('written by zzSecretName yesterday', dl);
  assert.strictEqual(finds.length, 1);
  assert.strictEqual(finds[0].kind, 'denylisted-term');
  assert.ok(!finds[0].masked.includes('zzsecretname'), 'must not echo the term');
});

test('does NOT flag Bluesky when sky is denylisted', () => {
  assert.strictEqual(scanText('Bluesky caps posts at 300 chars.', dl).length, 0);
});

test('matches hyphenated and dotted terms as token sequences', () => {
  assert.strictEqual(scanText('shipped by acme-corp today', dl).length, 1);
  assert.strictEqual(scanText('see internal.example.com for details', dl).length, 1);
  assert.strictEqual(scanText('acme said corp things', dl).length, 0, 'non-adjacent tokens must not match');
});

test('matches non-ASCII terms', () => {
  assert.strictEqual(scanText('José wrote this', dl).length, 1);
});

test('flags API-key and JID shapes', () => {
  const finds = scanText('key mk_abcdefghij0123456789XY and 120000000000000@g.us', dl);
  assert.deepStrictEqual(finds.map((f) => f.kind).sort(), ['postey-api-key', 'whatsapp-group']);
});

test('reports line numbers (CRLF tolerated)', () => {
  const finds = scanText('clean line\r\nzzsecretname here', dl);
  assert.strictEqual(finds.length, 1);
  assert.strictEqual(finds[0].line, 2);
});

test('loadDenylist merges LEAK_EXTRA_TERMS including multi-token terms', () => {
  process.env.LEAK_EXTRA_TERMS = 'zzextra-word\nplainzz';
  try {
    const real = loadDenylist(path.join(__dirname, '..', 'scripts', 'leak-denylist.json'));
    assert.strictEqual(scanText('about zzextra.word here', real).length, 1, 'separator-insensitive');
    assert.strictEqual(scanText('about plainzz here', real).length, 1);
  } finally {
    delete process.env.LEAK_EXTRA_TERMS;
  }
});

test('CLI exits 1 on findings and 0 when clean, accepts multiple targets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leaktest-'));
  try {
    const dirty = path.join(dir, 'dirty.md');
    fs.writeFileSync(dirty, 'contains 120000000000000@g.us');
    const clean = path.join(dir, 'clean.md');
    fs.writeFileSync(clean, 'nothing to see');
    const script = path.join(__dirname, '..', 'scripts', 'check-leaks.js');
    const bad = spawnSync(process.execPath, [script, dirty, clean], { encoding: 'utf8' });
    assert.strictEqual(bad.status, 1);
    assert.ok(!bad.stderr.includes('120000000000000@g.us'), 'must not echo the match');
    const ok = spawnSync(process.execPath, [script, clean], { encoding: 'utf8' });
    assert.strictEqual(ok.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scanTree skips binary files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leakbin-'));
  try {
    fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from('zzsecretname')]));
    assert.deepStrictEqual(scanTree(dir, dl), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('real denylist + shipped skill content is clean', () => {
  const real = loadDenylist(path.join(__dirname, '..', 'scripts', 'leak-denylist.json'));
  const finds = scanTree(path.join(__dirname, '..', 'skills'), real);
  assert.deepStrictEqual(finds, []);
});

test('NFD and NFC forms of the same term both match', () => {
  const nfdDl = {
    byLen: new Map([[1, new Set([h('josé'.normalize('NFKC'))])]]),
    patterns: [],
  };
  assert.strictEqual(scanText('by José today', nfdDl).length, 1, 'NFD text must match NFC-hashed term');
});

test('underscore and hyphen forms share one token sequence', () => {
  assert.strictEqual(scanText('made by acme_corp today', dl).length, 1);
});

test('zero-width characters cannot split a term to evade matching', () => {
  assert.strictEqual(scanText('by zzsecret​name today', dl).length, 1);
});

test('hashedPhrases in the JSON file are honored', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leakjson-'));
  try {
    const jsonPath = path.join(dir, 'dl.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      hashedTerms: [],
      hashedPhrases: [{ n: 2, hash: h('zz corp') }],
      patterns: [],
    }));
    const loaded = loadDenylist(jsonPath);
    assert.strictEqual(scanText('shipped by zz-corp today', loaded).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI exits 2 with a clean error on a missing target', () => {
  const script = path.join(__dirname, '..', 'scripts', 'check-leaks.js');
  const r = spawnSync(process.execPath, [script, path.join(os.tmpdir(), 'no-such-dir-zz')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /target not found/);
});
