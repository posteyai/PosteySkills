import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// check-versions.js resolves ROOT from its own location, so a fixture that
// carries its own scripts/ copy is checked as if it were the repo. That is the
// only way to assert what the script does when a file it compares is ABSENT —
// the case every soft-skip used to swallow.
function fixture({ version = '1.0.0', omit = [] } = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'postey-versions-'));
	const skill = path.join(root, 'skills', 'postey');
	for (const d of ['scripts/lib', 'skills/postey/.claude-plugin', '.claude-plugin', '.codex-plugin', '.cursor-plugin']) {
		fs.mkdirSync(path.join(root, d), { recursive: true });
	}
	fs.copyFileSync(path.join(REPO, 'scripts/check-versions.js'), path.join(root, 'scripts/check-versions.js'));
	fs.copyFileSync(path.join(REPO, 'scripts/lib/skills.js'), path.join(root, 'scripts/lib/skills.js'));

	const write = (rel, body) => {
		if (omit.includes(rel)) return;
		fs.writeFileSync(path.join(root, rel), body);
	};
	write('skills/postey/SKILL.md', `---\nname: postey\nversion: ${version}\n---\n\nbody\n`);
	write('skills/postey/.claude-plugin/plugin.json', JSON.stringify({ name: 'postey', version }));
	write('skills/postey/pack.json', JSON.stringify({ name: 'postey', version }));
	write('.claude-plugin/marketplace.json', JSON.stringify({ plugins: [{ name: 'postey', version }] }));
	write('.codex-plugin/plugin.json', JSON.stringify({ name: 'postey', version }));
	write('.cursor-plugin/plugin.json', JSON.stringify({ name: 'postey', version }));
	write('skills/REGISTRY.md', `| Skill | What | Status | Version |\n|---|---|---|---|\n| [postey](postey/) | hub | stable | ${version} |\n`);
	write('README.md', `# Postey\n\n[![Version](https://img.shields.io/badge/version-${version}-green.svg)]()\n`);
	return root;
}

/** @returns {{code:number, out:string}} */
function run(root) {
	try {
		const out = execFileSync(process.execPath, [path.join(root, 'scripts/check-versions.js')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		return { code: 0, out };
	} catch (err) {
		return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
	}
}

test('a complete, consistent tree passes', () => {
	assert.equal(run(fixture()).code, 0);
});

test('a version that disagrees in one place FAILS', () => {
	const root = fixture();
	fs.writeFileSync(path.join(root, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'postey', version: '9.9.9' }));
	const { code, out } = run(root);
	assert.equal(code, 1);
	assert.match(out, /codex/);
});

// The vacuity cases. Each of these used to exit 0 having asserted nothing.
test('an empty skills/ FAILS rather than passing vacuously', () => {
	const root = fixture();
	fs.rmSync(path.join(root, 'skills', 'postey'), { recursive: true, force: true });
	const { code, out } = run(root);
	assert.equal(code, 1, 'a tree with no skills must not report success');
	assert.match(out, /nothing to assert/);
});

for (const missing of [
	'.codex-plugin/plugin.json',
	'.cursor-plugin/plugin.json',
	'skills/postey/.claude-plugin/plugin.json',
	'skills/postey/pack.json',
	'.claude-plugin/marketplace.json',
	'skills/REGISTRY.md',
	'README.md'
]) {
	test(`a missing ${missing} FAILS rather than being skipped`, () => {
		assert.equal(run(fixture({ omit: [missing] })).code, 1, `${missing} absent was treated as success`);
	});
}
