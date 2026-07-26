'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { scanText, scanTree, loadDenylist, hashTerm } = require('../scripts/check-leaks.js');

// Hermetic: a maintainer's ambient private-denylist env must not leak into
// test verdicts (node --test runs each file in its own process, so deleting
// here cannot affect other suites). spawnSync calls pin env explicitly.
delete process.env.LEAK_EXTRA_DENYLIST;
delete process.env.LEAK_EXTRA_TERMS;
const CLEAN_ENV = { ...process.env };

// Fixtures use the production hashing convention (hashTerm), so a convention
// change cannot silently diverge from these tests.
function makeDenylist(terms, patterns) {
  const byLen = new Map();
  for (const term of terms) {
    const h = hashTerm(term);
    if (!byLen.has(h.n)) byLen.set(h.n, new Set());
    byLen.get(h.n).add(h.hash);
  }
  return { byLen, patterns: patterns || [] };
}

const dl = makeDenylist(
  ['zzsecretname', 'sky', 'josé', 'acme corp', 'internal example com'],
  [
    { name: 'postey-api-key', re: /mk_[A-Za-z0-9_-]{20,}/g },
    { name: 'whatsapp-group', re: /\d{10,}@g\.us/g },
  ]
);

test('flags a denylisted token without echoing it', () => {
  const finds = scanText('written by zzSecretName yesterday', dl);
  assert.strictEqual(finds.length, 1);
  assert.strictEqual(finds[0].kind, 'denylisted-term');
  assert.ok(!JSON.stringify(finds).toLowerCase().includes('zzsecretname'), 'finding must not carry the term');
});

test('does NOT flag Bluesky when sky is denylisted', () => {
  assert.strictEqual(scanText('Bluesky caps posts at 300 chars.', dl).length, 0);
});

test('matches hyphenated and dotted terms as token sequences', () => {
  assert.strictEqual(scanText('shipped by acme-corp today', dl).length, 1);
  assert.strictEqual(scanText('see internal.example.com for details', dl).length, 1);
  assert.strictEqual(scanText('acme said corp things', dl).length, 0, 'non-adjacent tokens must not match');
});

test('matches a phrase wrapped across a line break', () => {
  const finds = scanText('shipped by acme\ncorp today', dl);
  assert.strictEqual(finds.length, 1, 'hard-wrapped phrase must still match');
  assert.strictEqual(finds[0].line, 1, 'reported at the first token');
});

test('matches non-ASCII terms', () => {
  assert.strictEqual(scanText('José wrote this', dl).length, 1);
});

test('flags API-key and JID shapes', () => {
  const finds = scanText('key mk_abcdefghij0123456789XY and 120000000000000@g.us', dl);
  assert.deepStrictEqual(finds.map((f) => f.kind).sort(), ['postey-api-key', 'whatsapp-group']);
});

test('invisible chars inside a secret shape cannot defeat the patterns', () => {
  assert.strictEqual(scanText('key mk_abcdefghij­0123456789XY', dl).length, 1, 'soft hyphen');
  assert.strictEqual(scanText('group 1200000​00000000@g.us', dl).length, 1, 'zero-width space');
  assert.strictEqual(scanText('group １２０000000000000@g.us', dl).length, 1, 'fullwidth digits');
});

test('reports line numbers (CRLF tolerated)', () => {
  const finds = scanText('clean line\r\nzzsecretname here', dl);
  assert.strictEqual(finds.length, 1);
  assert.strictEqual(finds[0].line, 2);
});

test('loadDenylist merges LEAK_EXTRA_TERMS: newline, comma, multi-token', () => {
  process.env.LEAK_EXTRA_TERMS = 'zzextra-word\nplainzz, commazz';
  try {
    const real = loadDenylist(path.join(__dirname, '..', 'scripts', 'leak-denylist.json'));
    assert.strictEqual(scanText('about zzextra.word here', real).length, 1, 'separator-insensitive');
    assert.strictEqual(scanText('about plainzz here', real).length, 1);
    assert.strictEqual(scanText('about commazz here', real).length, 1, 'comma-separated term');
  } finally {
    delete process.env.LEAK_EXTRA_TERMS;
  }
});

test('real denylist patterns catch modern prefixed keys', () => {
  const real = loadDenylist(path.join(__dirname, '..', 'scripts', 'leak-denylist.json'));
  const kinds = scanText('sk-proj-Ab1_Cd2-Ef3_Gh4-Ij5Kl and sk-ant-api03-Ab1Cd2Ef3Gh4Ij5Kl6Mn7', real)
    .map((f) => f.kind);
  assert.deepStrictEqual(kinds, ['generic-secret', 'generic-secret']);
});

test('loadDenylist rejects malformed committed hashes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leakbad-'));
  try {
    const jsonPath = path.join(dir, 'dl.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ hashedTerms: ['DEADBEEF'], patterns: [] }));
    assert.throws(() => loadDenylist(jsonPath), /invalid denylist entry/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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
    const bad = spawnSync(process.execPath, [script, dirty, clean], { encoding: 'utf8', env: CLEAN_ENV });
    assert.strictEqual(bad.status, 1);
    assert.ok(!bad.stderr.includes('120000000000000@g.us'), 'must not echo the match');
    const ok = spawnSync(process.execPath, [script, clean], { encoding: 'utf8', env: CLEAN_ENV });
    assert.strictEqual(ok.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --hash emits the production convention', () => {
  const script = path.join(__dirname, '..', 'scripts', 'check-leaks.js');
  const r = spawnSync(process.execPath, [script, '--hash', 'acme-corp'], { encoding: 'utf8', env: CLEAN_ENV });
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(r.stdout), hashTerm('acme corp'), 'separator term hashes as its token sequence');
});

test('scanTree skips binary files but decodes UTF-16', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leakbin-'));
  try {
    fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from('zzsecretname')]));
    assert.deepStrictEqual(scanTree(dir, dl), [], 'NUL without BOM is binary');
    fs.writeFileSync(path.join(dir, 'doc.md'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('by zzsecretname today', 'utf16le')]));
    const finds = scanTree(dir, dl);
    assert.strictEqual(finds.length, 1, 'UTF-16LE text must be scanned, not skipped as binary');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tests/ is skipped only at the scan root, not inside shipped content', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leakskip-'));
  try {
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(dir, 'tests', 'fixture.md'), 'zzsecretname');
    fs.mkdirSync(path.join(dir, 'skills', 'tests'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', 'tests', 'shipped.md'), 'zzsecretname');
    fs.writeFileSync(path.join(dir, 'skills', 'tests-notes.md'), 'clean');
    const finds = scanTree(dir, dl);
    assert.strictEqual(finds.length, 1, 'root tests/ skipped; nested tests/ scanned');
    assert.ok(finds[0].file.includes('shipped'), 'the nested file is the finding');
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
  const nfdDl = makeDenylist(['josé'.normalize('NFD')]);
  assert.strictEqual(scanText('by José today', nfdDl).length, 1, 'NFD text must match');
  assert.strictEqual(scanText('by José today', nfdDl).length, 1, 'NFC text must match');
});

test('underscore and hyphen forms share one token sequence', () => {
  assert.strictEqual(scanText('made by acme_corp today', dl).length, 1);
});

test('invisible characters cannot split a term to evade matching', () => {
  assert.strictEqual(scanText('by zzsecret​name today', dl).length, 1, 'zero-width space (Cf)');
  assert.strictEqual(scanText('by zzsecret͏name today', dl).length, 1, 'combining grapheme joiner (Mn)');
  assert.strictEqual(scanText('by zzsecret️name today', dl).length, 1, 'variation selector (Mn)');
});

test('hashedPhrases in the JSON file are honored', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leakjson-'));
  try {
    const jsonPath = path.join(dir, 'dl.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      hashedTerms: [],
      hashedPhrases: [hashTerm('zz corp')],
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
  const r = spawnSync(process.execPath, [script, path.join(os.tmpdir(), 'no-such-dir-zz')], { encoding: 'utf8', env: CLEAN_ENV });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /target not found/);
});
