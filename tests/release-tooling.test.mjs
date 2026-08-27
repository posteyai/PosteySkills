// Both scripts under test exist to catch a mistake a human makes at release
// time, which means neither is ever exercised by an ordinary run. Five checks
// in this repo have shipped reporting success without ever running (F-046), so
// every rule below is driven against a fixture that violates it and asserted to
// fail. A green run of the real tree proves nothing on its own.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { setVersion } from '../scripts/set-version.mjs';
import { checkReleaseTags, packagedSkills, remoteTags, tagFor } from '../scripts/check-release-tag.mjs';

const REAL_ROOT = path.join(import.meta.dirname, '..');

/** A miniature repo carrying every file the fan-out writes. */
function fixtureRoot({ version = '1.0.0', omit = [] } = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'postey-release-'));
	const skill = path.join(root, 'skills', 'postey');
	fs.mkdirSync(path.join(skill, '.claude-plugin'), { recursive: true });
	fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });

	const write = (rel, body) => {
		if (omit.includes(rel)) return;
		fs.writeFileSync(path.join(root, rel), body);
	};

	write('skills/postey/SKILL.md', `---\nname: postey\nversion: ${version}\n---\n\nbody\n`);
	write('skills/postey/.claude-plugin/plugin.json', JSON.stringify({ name: 'postey', version }, null, 2));
	write(
		'.claude-plugin/marketplace.json',
		JSON.stringify(
			{ name: 'postey-skills', plugins: [{ name: 'other', version: '9.9.9' }, { name: 'postey', version }] },
			null,
			2
		)
	);
	write(
		'skills/postey/pack.json',
		JSON.stringify(
			{
				name: 'postey',
				version,
				skill: 'SKILL.md',
				rawBase: `https://raw.githubusercontent.com/posteyai/skills/refs/tags/skills/postey/v${version}/skills/postey/`
			},
			null,
			2
		)
	);
	write(
		'skills/REGISTRY.md',
		`# Skills Registry\n\n| Skill | Description | Status | Version |\n|---|---|---|---|\n| [postey](postey/) | words | stable | ${version} |\n`
	);
	write('README.md', `# Postey Skills\n\n[![Version](https://img.shields.io/badge/version-${version}-green.svg)]()\n`);
	return root;
}

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// ── set-version ──────────────────────────────────────────────────────────────

test('writes every one of the seven places, including the rawBase tag', () => {
	const root = fixtureRoot();
	const changed = setVersion('2.6.0', { root });
	assert.strictEqual(changed.length, 7, `expected 7 edits, got ${changed.length}:\n${changed.join('\n')}`);

	assert.match(read(root, 'skills/postey/SKILL.md'), /^version: 2\.6\.0$/m);
	assert.strictEqual(JSON.parse(read(root, 'skills/postey/.claude-plugin/plugin.json')).version, '2.6.0');
	assert.strictEqual(JSON.parse(read(root, 'skills/postey/pack.json')).version, '2.6.0');
	assert.match(read(root, 'skills/REGISTRY.md'), /\| 2\.6\.0 \|/);
	assert.match(read(root, 'README.md'), /badge\/version-2\.6\.0-green/);

	const market = JSON.parse(read(root, '.claude-plugin/marketplace.json'));
	assert.strictEqual(market.plugins.find((p) => p.name === 'postey').version, '2.6.0');
});

test('the rawBase tag moves with the version — the edit nothing enforced before', () => {
	const root = fixtureRoot();
	setVersion('2.6.0', { root });
	assert.strictEqual(
		JSON.parse(read(root, 'skills/postey/pack.json')).rawBase,
		'https://raw.githubusercontent.com/posteyai/skills/refs/tags/skills/postey/v2.6.0/skills/postey/'
	);
});

test('leaves a sibling plugin entry alone', () => {
	const root = fixtureRoot();
	setVersion('2.6.0', { root });
	const market = JSON.parse(read(root, '.claude-plugin/marketplace.json'));
	assert.strictEqual(market.plugins.find((p) => p.name === 'other').version, '9.9.9');
});

test('--check writes nothing', () => {
	const root = fixtureRoot();
	const before = read(root, 'skills/postey/pack.json');
	const changed = setVersion('2.6.0', { root, check: true });
	assert.strictEqual(changed.length, 7);
	assert.strictEqual(read(root, 'skills/postey/pack.json'), before, 'fixture was mutated under --check');
});

test('is idempotent — a second run reports no edits', () => {
	const root = fixtureRoot();
	setVersion('2.6.0', { root });
	assert.deepStrictEqual(setVersion('2.6.0', { root }), []);
});

test('a missing file FAILS rather than being skipped', () => {
	const root = fixtureRoot({ omit: ['skills/postey/pack.json'] });
	assert.throws(() => setVersion('2.6.0', { root }), /pack\.json does not exist/);
});

test('a file whose anchor is gone FAILS rather than writing nothing', () => {
	const root = fixtureRoot();
	fs.writeFileSync(path.join(root, 'README.md'), '# Postey Skills\n\nno badge here\n');
	assert.throws(() => setVersion('2.6.0', { root }), /README badge.*anchor not found/s);
});

test('a version that is not bare semver FAILS', () => {
	const root = fixtureRoot();
	for (const bad of ['v2.6.0', '2.6', '2.6.0-rc1', 'latest']) {
		assert.throws(() => setVersion(bad, { root }), /bare semver/, `accepted ${bad}`);
	}
});

// ── check-release-tag ────────────────────────────────────────────────────────

test('a version whose tag is absent FAILS, and the message names the push', () => {
	const root = fixtureRoot({ version: '2.6.0' });
	const problems = checkReleaseTags({ root, tags: new Set(['skills/postey/v2.5.2']) });
	assert.strictEqual(problems.length, 1);
	assert.match(problems[0], /tag skills\/postey\/v2\.6\.0 does not exist/);
	assert.match(problems[0], /git push origin skills\/postey\/v2\.6\.0/);
});

test('a version whose tag exists passes', () => {
	const root = fixtureRoot({ version: '2.6.0' });
	assert.deepStrictEqual(checkReleaseTags({ root, tags: new Set(['skills/postey/v2.6.0']) }), []);
});

test('finding zero packaged skills FAILS rather than passing vacuously', () => {
	const root = fixtureRoot({ omit: ['skills/postey/pack.json'] });
	assert.throws(() => checkReleaseTags({ root, tags: new Set(['x']) }), /nothing to assert/);
});

test('a remote that advertises no tags FAILS rather than reporting success', () => {
	// An unreachable remote and a tagless one produce the same empty parse. The
	// check must not read that as "every tag is present".
	assert.throws(() => remoteTags('origin', () => ''), /advertises no tags/);
});

test('a remote query that throws propagates rather than being swallowed', () => {
	assert.throws(
		() =>
			remoteTags('origin', () => {
				throw new Error('fatal: could not read from remote repository');
			}),
		/could not read from remote/
	);
});

test('peeled and unpeeled tag refs both parse', () => {
	const lsRemote = [
		'a1b2c3\trefs/tags/skills/postey/v2.5.2',
		'd4e5f6\trefs/tags/skills/postey/v2.5.2^{}',
		'aabbcc\trefs/tags/skills/postey-video/v1.0.0'
	].join('\n');
	const tags = remoteTags('origin', () => lsRemote);
	assert.ok(tags.has('skills/postey/v2.5.2'));
	assert.ok(tags.has('skills/postey-video/v1.0.0'));
	assert.ok(!tags.has('skills/postey/v2.5.2^{}'), 'the peeled ref leaked in as its own tag');
});

// ── the real tree ────────────────────────────────────────────────────────────

test('the committed tree agrees with what the fan-out would write', () => {
	// Reads the version out of the tree and asserts writing it back is a no-op.
	// Catches a hand edit that moved one of the seven and not the rest, without
	// duplicating check-versions.js's comparison.
	const skills = packagedSkills(REAL_ROOT);
	assert.ok(skills.length > 0);
	for (const { skill, version } of skills) {
		assert.deepStrictEqual(
			setVersion(version, { skill, root: REAL_ROOT, check: true }),
			[],
			`skills/${skill}: version ${version} is not written consistently across all seven places`
		);
	}
});

test('tagFor matches the tag pack.json rawBase pins', () => {
	for (const { skill, version } of packagedSkills(REAL_ROOT)) {
		const pack = JSON.parse(fs.readFileSync(path.join(REAL_ROOT, 'skills', skill, 'pack.json'), 'utf8'));
		assert.ok(
			pack.rawBase.includes(`/refs/tags/${tagFor(skill, version)}/`),
			`skills/${skill}: rawBase does not pin ${tagFor(skill, version)}`
		);
	}
});
