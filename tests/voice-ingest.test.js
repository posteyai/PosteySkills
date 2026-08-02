'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  analyze, observationsFrom, summarise,
} = require('../skills/postey-voice/scripts/voiceFeatures');
const { compileRules } = require('../skills/postey-voice/scripts/voiceRules');

const CLI = path.join(__dirname, '..', 'skills', 'postey-voice', 'scripts', 'voice.js');
const run = args => JSON.parse(
  execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
);

// --- feature extraction ---

test('counts the things it claims to count', () => {
  const f = analyze('Why this? Because it works — always! 🎉 #growth https://x.com/a');
  assert.strictEqual(f.em_dashes, 1);
  assert.strictEqual(f.exclamations, 1);
  assert.strictEqual(f.emoji, 1);
  assert.strictEqual(f.hashtags, 1);
  assert.strictEqual(f.links, 1);
  assert.strictEqual(f.opens_with_question, true);
});

test('a greeting opener is detected and is not a question', () => {
  const f = analyze('Hey everyone. Here is the thing about pricing.');
  assert.strictEqual(f.opens_with_greeting, true);
  assert.strictEqual(f.opens_with_question, false);
});

test('empty text yields zeros, not NaN', () => {
  const f = analyze('');
  assert.strictEqual(f.words, 0);
  assert.strictEqual(f.sentences, 0);
  assert.strictEqual(f.median_sentence_words, 0);
});

// A short fragment cannot evidence "no emoji" — absence in 4 words means nothing.
test('short documents produce no punctuation-habit observations', () => {
  const obs = observationsFrom([{ id: 1, text: 'Short one.', ts: '2026-07-01T00:00:00Z' }]);
  assert.ok(!obs.some(o => o.rule === 'no emoji'), 'too short to evidence emoji habits');
});

test('a long document evidences habits both ways', () => {
  const clean = 'A '.repeat(30) + 'sentence about pricing strategy and nothing else at all.';
  const obs = observationsFrom([{ id: 1, text: clean, ts: '2026-07-01T00:00:00Z' }]);
  assert.strictEqual(obs.find(o => o.rule === 'no emoji').supports, true);

  const noisy = clean + ' 🎉 #growth!';
  const obs2 = observationsFrom([{ id: 2, text: noisy, ts: '2026-07-01T00:00:00Z' }]);
  assert.strictEqual(obs2.find(o => o.rule === 'no emoji').supports, false);
  assert.strictEqual(obs2.find(o => o.rule === 'no hashtags').supports, false);
});

test('scope carries through to the observation', () => {
  const obs = observationsFrom([
    { id: 1, text: 'Word '.repeat(30), scope: 'LINKEDIN', ts: '2026-07-01T00:00:00Z' },
  ]);
  assert.ok(obs.every(o => o.scope === 'LINKEDIN'));
});

test('every summarised feature cites the documents behind it', () => {
  const docs = [
    { id: 'a', text: 'Word '.repeat(40), ts: '2026-07-01T00:00:00Z' },
    { id: 'b', text: 'Word '.repeat(40), ts: '2026-07-02T00:00:00Z' },
  ];
  for (const f of summarise(docs)) {
    assert.ok(Array.isArray(f.from) && f.from.length > 0, `${f.feature} has no citations`);
  }
});

// --- the pipeline: ingest feeds the compiler ---

function scratchCorpus() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  const body = 'Teams measure the wrong thing. Retention is the number that moves the business. ' +
               'Stop counting shipped features and count weeks a customer stays active instead.';
  for (const n of ['a', 'b', 'c']) fs.writeFileSync(path.join(dir, `${n}.md`), body);
  return dir;
}

test('ingest → compile promotes a habit seen in three documents', () => {
  const dir = scratchCorpus();
  try {
    const ingested = run(['ingest', dir]);
    assert.strictEqual(ingested.corpus.documents, 3);

    const rules = compileRules(ingested.observations, '2026-08-02T00:00:00Z');
    const emoji = rules.find(r => r.rule === 'no emoji' && r.scope === 'all');
    assert.strictEqual(emoji.status, 'active');
    assert.strictEqual(emoji.evidence, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ingest reads a JSON export, keeping post ids, platform and date', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  try {
    fs.writeFileSync(path.join(dir, 'export.json'), JSON.stringify({
      posts: [{
        post_id: 1180, platform: 'LINKEDIN',
        text: 'Word '.repeat(40), published_at: '2026-07-11T00:00:00Z',
      }],
    }));
    const r = run(['ingest', dir]);
    assert.strictEqual(r.corpus.documents, 1);
    assert.deepStrictEqual(r.corpus.scopes, ['LINKEDIN']);
    assert.ok(r.observations.every(o => o.post_id === 1180));
    assert.ok(r.observations.every(o => o.ts === '2026-07-11T00:00:00Z'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--since drops older documents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  try {
    fs.writeFileSync(path.join(dir, 'export.json'), JSON.stringify({
      posts: [
        { post_id: 1, text: 'Word '.repeat(40), published_at: '2025-01-01T00:00:00Z' },
        { post_id: 2, text: 'Word '.repeat(40), published_at: '2026-07-01T00:00:00Z' },
      ],
    }));
    const r = run(['ingest', dir, '--since', '2026-01-01T00:00:00Z']);
    assert.strictEqual(r.corpus.documents, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a directory with nothing readable is an error, not an empty success', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  try {
    fs.writeFileSync(path.join(dir, 'photo.png'), 'not text');
    assert.throws(() => run(['ingest', dir]));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('malformed JSON is skipped, not fatal, when other content is readable', () => {
  const dir = scratchCorpus();
  try {
    fs.writeFileSync(path.join(dir, 'broken.json'), '{not json');
    assert.strictEqual(run(['ingest', dir]).corpus.documents, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compile is reproducible for a fixed --now', () => {
  const dir = scratchCorpus();
  try {
    const ledger = path.join(dir, 'ledger.json');
    run(['ingest', dir, '--out', ledger]);
    const a = run(['compile', ledger, '--now', '2026-08-02T00:00:00Z']);
    const b = run(['compile', ledger, '--now', '2026-08-02T00:00:00Z']);
    assert.deepStrictEqual(a, b);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
