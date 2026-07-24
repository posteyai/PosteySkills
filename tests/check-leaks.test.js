'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('node:path');
const { scanText, scanTree, loadDenylist } = require('../scripts/check-leaks.js');

const h = (s) => crypto.createHash('sha256').update(s.toLowerCase()).digest('hex');
const dl = {
  hashes: new Set([h('zzsecretname'), h('sky')]),
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

test('flags API-key and JID shapes', () => {
  const finds = scanText('key mk_abcdefghij0123456789XY and 120000000000000@g.us', dl);
  assert.deepStrictEqual(finds.map((f) => f.kind).sort(), ['postey-api-key', 'whatsapp-group']);
});

test('reports line numbers (CRLF tolerated)', () => {
  const finds = scanText('clean line\r\nzzsecretname here', dl);
  assert.strictEqual(finds.length, 1);
  assert.strictEqual(finds[0].line, 2);
});

test('real denylist + shipped skill content is clean', () => {
  const real = loadDenylist(path.join(__dirname, '..', 'scripts', 'leak-denylist.json'));
  const finds = scanTree(path.join(__dirname, '..', 'skills'), real);
  assert.deepStrictEqual(finds, []);
});
