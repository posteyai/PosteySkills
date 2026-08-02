'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { findCrossSkillLinkProblems } = require('../scripts/lib/cross-skill-links');

const FIXTURES = path.join(__dirname, 'fixtures', 'cross-skill-links');
const fixture = name => path.join(FIXTURES, name, 'skills');

const find = name => findCrossSkillLinkProblems(fixture(name));

test('a clean tree has no problems', () => {
  assert.deepStrictEqual(find('clean'), []);
});

test('a markdown link into another skill is a problem', () => {
  const problems = find('leak-link');
  assert.strictEqual(problems.length, 1, JSON.stringify(problems, null, 2));
  assert.strictEqual(problems[0].skill, 'alpha');
  assert.strictEqual(problems[0].kind, 'link');
  assert.match(problems[0].reason, /beta/);
});

// The split's dominant failure mode: flows cite craft files as `backticked.md`,
// not as markdown links. A link-only checker passes while every one of them breaks.
test('a backtick reference to a file that now lives in another skill is a problem', () => {
  const problems = find('leak-backtick');
  assert.strictEqual(problems.length, 1, JSON.stringify(problems, null, 2));
  assert.strictEqual(problems[0].skill, 'alpha');
  assert.strictEqual(problems[0].kind, 'backtick');
  assert.match(problems[0].ref, /moved\.md/);
});

test('a dangling markdown link is a problem', () => {
  const problems = find('dangling');
  assert.strictEqual(problems.length, 1, JSON.stringify(problems, null, 2));
  assert.strictEqual(problems[0].kind, 'link');
  assert.match(problems[0].reason, /does not exist/i);
});

// CHANGELOG.md cites `skills/SKILLS.md`, which lives in no skill in this repo.
// That is history, not a cross-skill leak. Only a basename that exists in ANOTHER
// skill counts.
test('a backtick reference resolving nowhere is not a problem', () => {
  assert.deepStrictEqual(find('backtick-unknown'), []);
});

test('a link escaping to a repo-level doc is not a problem', () => {
  assert.deepStrictEqual(find('escape-to-docs'), []);
});

test('anchors are stripped before resolving', () => {
  assert.deepStrictEqual(find('anchored'), []);
});

test('http(s) links are ignored', () => {
  assert.deepStrictEqual(find('external-url'), []);
});

test('the real skills tree is clean', () => {
  const problems = findCrossSkillLinkProblems(path.join(__dirname, '..', 'skills'));
  assert.deepStrictEqual(problems, [], JSON.stringify(problems, null, 2));
});
