// pack.json's rawBase pins an immutable tag: refs/tags/skills/postey/v<version>.
// Every fetch-based install resolves its files through that URL, so a version
// that ships without its tag pushed does not degrade — it 404s, and the install
// fails at the first fetch.
//
// pack-manifest.test.js already asserts rawBase *names* the right tag. Nothing
// asserted the tag *exists*. That is the whole gap this closes: the two failures
// look identical in a diff and only one of them is visible offline.
//
// Read from the remote, not from local refs. `actions/checkout` fetches no tags
// by default, so `git tag -l` is empty in CI — a local check would pass
// vacuously on the one machine that matters. Five checks in this repo have
// shipped in a state where they reported success without ever running (F-046);
// this one fails when it cannot answer.
//
// Usage:
//   node scripts/check-release-tag.mjs              # check every skill
//   node scripts/check-release-tag.mjs --skill postey
//
// Run it on main and at release. A release PR legitimately carries a version
// whose tag does not exist yet — the tag is pushed after the merge — so this is
// not a pull-request gate.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Tag name for a released skill version. Mirrors pack.json's rawBase. */
export function tagFor(skill, version) {
	return `skills/${skill}/v${version}`;
}

/**
 * Tags present on the remote, as a Set.
 *
 * Throws rather than returning empty on failure. An empty Set and an
 * unreachable remote are the same value and opposite meanings, and returning
 * one for the other is how a check becomes a green skip.
 */
export function remoteTags(remote = 'origin', run = defaultRun) {
	const out = run('git', ['ls-remote', '--tags', remote]);
	const tags = new Set();
	for (const line of out.split('\n')) {
		const m = line.match(/\trefs\/tags\/(.+?)(?:\^\{\})?$/);
		if (m) tags.add(m[1]);
	}
	if (tags.size === 0) {
		throw new Error(
			`${remote} advertises no tags at all. Expected at least the released ` +
				`skill tags. Refusing to report success on an answer this check cannot trust.`
		);
	}
	return tags;
}

function defaultRun(cmd, args) {
	return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Every skill directory that carries a pack.json, with its declared version. */
export function packagedSkills(root = ROOT) {
	const skillsDir = path.join(root, 'skills');
	const out = [];
	for (const name of fs.readdirSync(skillsDir)) {
		if (name.startsWith('_')) continue;
		const packPath = path.join(skillsDir, name, 'pack.json');
		if (!fs.existsSync(packPath)) continue;
		const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
		if (!pack.version) throw new Error(`skills/${name}/pack.json has no version`);
		out.push({ skill: name, version: pack.version });
	}
	if (out.length === 0) {
		throw new Error('no packaged skills found — the check has nothing to assert, which is a failure');
	}
	return out;
}

/**
 * Whether a skill's shipped content differs from the tag its manifest pins.
 *
 * Existence was not enough, and this is the case that proved it: `auth:link`
 * and a plugin manifest landed on main while pack.json still declared 2.5.2 and
 * pinned the v2.5.2 tag. Both checks were green — the version was internally
 * consistent and the tag existed — and a fetch-based install still received a
 * skill without the command the setup document told it to run.
 *
 * Returns null when the comparison cannot be made (no tag locally, not a git
 * tree). A comparison that cannot run says so rather than reporting agreement.
 */
export function contentDiffersFromTag(skill, version, run = defaultRun) {
	const tag = tagFor(skill, version);
	try {
		run('git', ['rev-parse', '--verify', `${tag}^{commit}`]);
	} catch {
		return null;
	}
	try {
		run('git', ['diff', '--quiet', tag, 'HEAD', '--', `skills/${skill}/`]);
		return false;
	} catch (err) {
		// git diff --quiet exits 1 when there IS a difference, and >1 on error.
		if (err && err.status === 1) return true;
		return null;
	}
}

/** @returns {string[]} one message per problem; empty when every tag is present and current. */
export function checkReleaseTags({ root = ROOT, tags, only, run = defaultRun } = {}) {
	const problems = [];
	for (const { skill, version } of packagedSkills(root)) {
		if (only && skill !== only) continue;
		const tag = tagFor(skill, version);

		if (tags.has(tag)) {
			const drifted = contentDiffersFromTag(skill, version, run);
			if (drifted === true) {
				problems.push(
					`skills/${skill}: the shipped content differs from ${tag}, which pack.json pins.\n` +
						`      A fetch-based install resolves rawBase to that tag and receives the OLD\n` +
						`      skill, while the setup document served from this branch describes the new\n` +
						`      one. Bump the version — node scripts/set-version.mjs <next> — and tag the\n` +
						`      release.`
				);
			}
			continue;
		}

		if (!tags.has(tag)) {
			problems.push(
				`skills/${skill}: pack.json declares ${version}, but tag ${tag} does not exist on the ` +
					`remote. Every fetch-based install of this version 404s until it is pushed:\n` +
					`      git tag ${tag} <release-sha> && git push origin ${tag}`
			);
		}
	}
	return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const only = process.argv.includes('--skill')
		? process.argv[process.argv.indexOf('--skill') + 1]
		: undefined;
	let problems;
	try {
		problems = checkReleaseTags({ tags: remoteTags(), only });
	} catch (err) {
		console.error(`✗ check-release-tag could not run: ${err.message}`);
		process.exit(2);
	}
	for (const p of problems) console.error(`✗ ${p}`);
	if (problems.length) process.exit(1);
	console.log('check-release-tag: every packaged version has its tag');
}
