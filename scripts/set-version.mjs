// Cutting a release means writing the same version into seven places. Six of
// them are asserted afterwards by check-versions.js; the seventh — the tag
// inside pack.json's rawBase — is asserted by pack-manifest.test.js. Both only
// ever catch the mistake after a human has made it.
//
// This writes all seven from one argument, so the hand edit that check-versions
// exists to police stops happening. check-versions.js stays exactly as it is:
// the writer and the assertion are deliberately separate programs, so a bug
// here cannot silence the check that would catch it.
//
// Usage:
//   node scripts/set-version.mjs 2.6.0                 # the postey skill
//   node scripts/set-version.mjs 1.1.0 --skill foo
//   node scripts/set-version.mjs 2.6.0 --check         # report, write nothing
//
// It does not tag and it does not commit. Push the tag after the release
// merges — check-release-tag.mjs is what notices when nobody did.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Every place a skill's version is written, as pure string edits.
 *
 * Each entry returns null when the file does not apply to this skill, and
 * throws when the file applies but the anchor is missing — a version this
 * script silently failed to write is the failure it was built to prevent.
 */
function edits(skill, version, root) {
	const skillDir = path.join(root, 'skills', skill);
	const rawBase =
		`https://raw.githubusercontent.com/posteyai/skills/refs/tags/` +
		`skills/${skill}/v${version}/skills/${skill}/`;

	return [
		{
			file: path.join(skillDir, 'SKILL.md'),
			what: 'SKILL.md frontmatter',
			apply: (s) => replaceOne(s, /^(version:\s*)(\S+)\s*$/m, `$1${version}`)
		},
		{
			file: path.join(skillDir, '.claude-plugin', 'plugin.json'),
			what: 'plugin.json',
			apply: (s) => replaceOne(s, /("version":\s*")([^"]+)(")/, `$1${version}$3`)
		},
		{
			file: path.join(root, '.claude-plugin', 'marketplace.json'),
			what: 'marketplace.json',
			apply: (s) => setMarketplaceVersion(s, skill, version)
		},
		{
			file: path.join(skillDir, 'pack.json'),
			what: 'pack.json version',
			apply: (s) => replaceOne(s, /("version":\s*")([^"]+)(")/, `$1${version}$3`)
		},
		{
			file: path.join(skillDir, 'pack.json'),
			what: 'pack.json rawBase tag',
			apply: (s) => replaceOne(s, /("rawBase":\s*")([^"]+)(")/, `$1${rawBase}$3`)
		},
		{
			file: path.join(root, 'skills', 'REGISTRY.md'),
			what: 'REGISTRY.md row',
			apply: (s) => setRegistryVersion(s, skill, version)
		},
		{
			file: path.join(root, 'README.md'),
			what: 'README badge',
			skip: skill !== 'postey', // the repo-level badge tracks postey only
			apply: (s) => replaceOne(s, /(badge\/version-)([0-9.]+)(-)/, `$1${version}$3`)
		},
		// Codex and Cursor read their own root manifests. Like the README badge
		// these track the hub, because that is the plugin both agents install —
		// a pack ships inside it, not as a separate listing. Left out here they
		// would go on advertising a stale version to two whole ecosystems, and
		// nothing in a green build would say so.
		{
			file: path.join(root, '.codex-plugin', 'plugin.json'),
			what: '.codex-plugin/plugin.json',
			skip: skill !== 'postey',
			apply: (s) => replaceOne(s, /("version":\s*")([^"]+)(")/, `$1${version}$3`)
		},
		{
			file: path.join(root, '.cursor-plugin', 'plugin.json'),
			what: '.cursor-plugin/plugin.json',
			skip: skill !== 'postey',
			apply: (s) => replaceOne(s, /("version":\s*")([^"]+)(")/, `$1${version}$3`)
		}
	];
}

function replaceOne(source, pattern, replacement) {
	const matches = source.match(new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g'));
	if (!matches) throw new Error('anchor not found');
	if (matches.length > 1) throw new Error(`anchor matched ${matches.length} times; expected exactly one`);
	return source.replace(pattern, replacement);
}

/** marketplace.json holds many plugins; only this skill's entry moves. */
function setMarketplaceVersion(source, skill, version) {
	const json = JSON.parse(source);
	const entry = (json.plugins || []).find((p) => p.name === skill);
	if (!entry) throw new Error(`no plugins[] entry named ${skill}`);
	if (!entry.version) {
		throw new Error(`marketplace.json: plugins[] entry "${skill}" has no version field to move`);
	}
	if (entry.version === version) return source;
	// Rewrite textually so key order and formatting survive untouched.
	const block = new RegExp(
		`("name":\\s*"${skill}"[\\s\\S]{0,600}?"version":\\s*")([^"]+)(")`
	);
	return replaceOne(source, block, `$1${version}$3`);
}

/** REGISTRY.md row: | [skill](skill/) | … | status | version | */
function setRegistryVersion(source, skill, version) {
	const lines = source.split('\n');
	const i = lines.findIndex((l) => l.includes(`[${skill}](`));
	if (i === -1) throw new Error(`no REGISTRY.md row for ${skill}`);
	const cells = lines[i].split('|');
	// Last cell is trailing whitespace after the closing pipe; version is before it.
	if (!lines[i].trimEnd().endsWith('|')) {
		throw new Error(`REGISTRY.md: the ${skill} row does not end in "|", so its columns cannot be located`);
	}
	const last = cells.length - 2;
	// Test for a match, not for a change: an idempotent re-run legitimately
	// produces the same string, while a blank cell matches nothing and used to
	// leave the row untouched while reporting success.
	if (!/\S+/.test(cells[last])) {
		throw new Error(`REGISTRY.md: the ${skill} row has an empty version column`);
	}
	cells[last] = cells[last].replace(/\S+/, version);
	lines[i] = cells.join('|');
	return lines.join('\n');
}

export function setVersion(version, { skill = 'postey', root = ROOT, check = false } = {}) {
	if (!SEMVER.test(version)) {
		throw new Error(`'${version}' is not a bare semver version, e.g. 2.6.0`);
	}
	const changed = [];
	for (const edit of edits(skill, version, root)) {
		if (edit.skip) continue;
		if (!fs.existsSync(edit.file)) {
			throw new Error(`${edit.what}: ${path.relative(root, edit.file)} does not exist`);
		}
		const before = fs.readFileSync(edit.file, 'utf8');
		let after;
		try {
			after = edit.apply(before);
		} catch (err) {
			throw new Error(`${edit.what} (${path.relative(root, edit.file)}): ${err.message}`);
		}
		if (after === before) continue;
		if (!check) fs.writeFileSync(edit.file, after);
		changed.push(`${edit.what}  ${path.relative(root, edit.file)}`);
	}
	return changed;
}

const invokedDirectly =
	process.argv[1] &&
	import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (invokedDirectly) {
	const args = process.argv.slice(2);
	const version = args.find((a) => !a.startsWith('--'));
	const check = args.includes('--check');
	const skill = args.includes('--skill') ? args[args.indexOf('--skill') + 1] : 'postey';

	if (!version) {
		console.error('usage: node scripts/set-version.mjs <version> [--skill <name>] [--check]');
		process.exit(2);
	}
	try {
		const changed = setVersion(version, { skill, check });
		if (changed.length === 0) {
			console.log(`${skill} is already at ${version}; nothing to write`);
		} else {
			for (const c of changed) console.log(`${check ? 'would write' : 'wrote'}  ${c}`);
		}
		if (!check) {
			console.log(`\nNext: node scripts/check-versions.js && node --test`);
			console.log(`Then, after the release merges:`);
			console.log(`  git tag skills/${skill}/v${version} <merge-sha> && git push origin skills/${skill}/v${version}`);
		}
	} catch (err) {
		console.error(`✗ ${err.message}`);
		process.exit(1);
	}
}
