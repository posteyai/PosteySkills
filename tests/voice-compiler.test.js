'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const {
  compileRules, activeRules, PROMOTE_AT, STALE_AFTER_DAYS,
} = require('../skills/postey-voice/scripts/voiceRules');

const NOW = '2026-08-02T00:00:00Z';
const obs = (rule, ts, { scope = 'all', post_id = 1, supports = true } = {}) =>
  ({ rule, scope, post_id, supports, ts });

// The S3.4 gate, stated in the implementation guide.
test('4 consistent em-dash removals + 2 LinkedIn question openers → 1 active, 1 candidate', () => {
  const rules = compileRules([
    obs('no em-dashes', '2026-07-11T00:00:00Z', { post_id: 1180 }),
    obs('no em-dashes', '2026-07-18T00:00:00Z', { post_id: 1194 }),
    obs('no em-dashes', '2026-07-25T00:00:00Z', { post_id: 1207 }),
    obs('no em-dashes', '2026-07-30T00:00:00Z', { post_id: 1231 }),
    obs('opens with a question', '2026-07-28T00:00:00Z', { scope: 'LINKEDIN', post_id: 1219 }),
    obs('opens with a question', '2026-07-29T00:00:00Z', { scope: 'LINKEDIN', post_id: 1226 }),
  ], NOW);

  assert.strictEqual(rules.filter(r => r.status === 'active').length, 1);
  assert.strictEqual(rules.filter(r => r.status === 'candidate').length, 1);

  const active = rules.find(r => r.status === 'active');
  assert.strictEqual(active.rule, 'no em-dashes');
  assert.strictEqual(active.evidence, 4);
  assert.deepStrictEqual(active.from, [1180, 1194, 1207, 1231]);
});

test('the contradiction fixture demotes active → candidate', () => {
  const base = [
    obs('no em-dashes', '2026-07-11T00:00:00Z'),
    obs('no em-dashes', '2026-07-18T00:00:00Z'),
    obs('no em-dashes', '2026-07-25T00:00:00Z'),
    obs('no em-dashes', '2026-07-30T00:00:00Z'),
  ];
  assert.strictEqual(compileRules(base, NOW)[0].status, 'active');

  const contradicted = compileRules(
    [...base, obs('no em-dashes', '2026-07-31T00:00:00Z', { supports: false })], NOW
  );
  assert.strictEqual(contradicted[0].status, 'candidate');
  assert.strictEqual(contradicted[0].evidence, 0, 'the run resets');
  assert.strictEqual(contradicted[0].contradictions, 1);
  assert.strictEqual(contradicted[0].total_observations, 4, 'history is kept');
});

test('one contradiction demotes; it takes 3 more to climb back', () => {
  const after = [
    obs('no em-dashes', '2026-07-01T00:00:00Z'),
    obs('no em-dashes', '2026-07-02T00:00:00Z'),
    obs('no em-dashes', '2026-07-03T00:00:00Z'),
    obs('no em-dashes', '2026-07-04T00:00:00Z', { supports: false }),
    obs('no em-dashes', '2026-07-05T00:00:00Z'),
    obs('no em-dashes', '2026-07-06T00:00:00Z'),
  ];
  assert.strictEqual(compileRules(after, NOW)[0].status, 'candidate');
  assert.strictEqual(
    compileRules([...after, obs('no em-dashes', '2026-07-07T00:00:00Z')], NOW)[0].status,
    'active'
  );
});

test(`promotion needs exactly ${PROMOTE_AT}`, () => {
  const two = [obs('x', '2026-07-01T00:00:00Z'), obs('x', '2026-07-02T00:00:00Z')];
  assert.strictEqual(compileRules(two, NOW)[0].status, 'candidate');
  assert.strictEqual(
    compileRules([...two, obs('x', '2026-07-03T00:00:00Z')], NOW)[0].status, 'active'
  );
});

test(`unconfirmed for over ${STALE_AFTER_DAYS} days → stale`, () => {
  const old = ['2026-01-01', '2026-01-02', '2026-01-03']
    .map(d => obs('x', `${d}T00:00:00Z`));
  assert.strictEqual(compileRules(old, NOW)[0].status, 'stale');
  assert.strictEqual(
    compileRules([...old, obs('x', '2026-07-30T00:00:00Z')], NOW)[0].status, 'active',
    'one fresh confirmation revives it'
  );
});

test('scope separates rules — a LinkedIn habit is not an X habit', () => {
  const rules = compileRules([
    obs('opens with a question', '2026-07-01T00:00:00Z', { scope: 'LINKEDIN' }),
    obs('opens with a question', '2026-07-02T00:00:00Z', { scope: 'LINKEDIN' }),
    obs('opens with a question', '2026-07-03T00:00:00Z', { scope: 'LINKEDIN' }),
    obs('opens with a question', '2026-07-04T00:00:00Z', { scope: 'X' }),
  ], NOW);
  assert.strictEqual(rules.length, 2);
  assert.strictEqual(rules.find(r => r.scope === 'LINKEDIN').status, 'active');
  assert.strictEqual(rules.find(r => r.scope === 'X').status, 'candidate');
});

test('a rule only ever contradicted never becomes a rule', () => {
  assert.deepStrictEqual(
    compileRules([obs('x', '2026-07-01T00:00:00Z', { supports: false })], NOW), []
  );
});

test('only active rules constrain drafting', () => {
  const rules = compileRules([
    obs('a', '2026-07-01T00:00:00Z'), obs('a', '2026-07-02T00:00:00Z'),
    obs('a', '2026-07-03T00:00:00Z'), obs('b', '2026-07-03T00:00:00Z'),
  ], NOW);
  assert.deepStrictEqual(activeRules(rules).map(r => r.rule), ['a']);
});

test('output is deterministic regardless of input order', () => {
  const input = [
    obs('b', '2026-07-03T00:00:00Z'), obs('a', '2026-07-01T00:00:00Z'),
    obs('a', '2026-07-02T00:00:00Z'), obs('a', '2026-07-03T00:00:00Z'),
  ];
  const forward = compileRules(input, NOW);
  const reversed = compileRules([...input].reverse(), NOW);
  assert.deepStrictEqual(forward, reversed);
  assert.strictEqual(forward[0].rule, 'a', 'active sorts first');
});

test('an invalid now is an error, not a silent wrong answer', () => {
  assert.throws(() => compileRules([], 'not-a-date'), /invalid now/);
});

test('empty input yields no rules', () => {
  assert.deepStrictEqual(compileRules([], NOW), []);
});
