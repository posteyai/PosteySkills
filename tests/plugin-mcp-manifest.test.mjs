// Claude Code registers a plugin's MCP servers from `.mcp.json` at the PLUGIN
// root when the plugin is installed. That removes a whole step for Claude Code
// users: `claude plugin install` now registers the server as well as the skill,
// so there is no `claude mcp add` to get wrong and no per-client entry to hand
// them.
//
// The file buys that by becoming a THIRD place the server address lives, after
// setup.md and the app. Every copy in this estate has drifted at least once, so
// the address here is pinned to the one setup.md publishes rather than merely
// asserted to look right.
//
// Every rule below is driven against a fixture that violates it and asserted to
// fail (F-046). A green run of the real file proves nothing on its own.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const PLUGIN_ROOT = path.join(ROOT, 'skills', 'postey');
const MANIFEST = path.join(PLUGIN_ROOT, '.mcp.json');

/** The checks, as a pure function, so fixtures can drive them. */
export function checkPluginMcpManifest(manifestText, setupDoc) {
	const problems = [];
	let manifest;
	try {
		manifest = JSON.parse(manifestText);
	} catch (err) {
		return [`.mcp.json is not valid JSON: ${err.message}`];
	}

	const servers = manifest.mcpServers;
	if (!servers || typeof servers !== 'object') {
		return ['.mcp.json has no mcpServers object'];
	}

	const names = Object.keys(servers);
	if (names.length === 0) problems.push('mcpServers is empty — the manifest registers nothing');

	for (const name of names) {
		const entry = servers[name];

		// The connection name becomes the tool prefix on clients that add one
		// (mcp__postey__get_accounts). setup.md names it `postey` everywhere; a
		// different name here would give plugin installs a different prefix from
		// every documented install.
		if (name !== 'postey') {
			problems.push(`server is named '${name}'; setup.md names it 'postey' and the tool prefix derives from it`);
		}

		// setup.md trap 1: Claude Code reads a url with no type as a stdio server.
		// This file is read by Claude Code and nothing else, so the trap applies
		// directly.
		if (entry.type !== 'http') {
			problems.push(`'${name}' has type ${JSON.stringify(entry.type)}; a url entry without "type": "http" is read as a stdio server`);
		}

		if (typeof entry.url !== 'string' || entry.url.length === 0) {
			problems.push(`'${name}' has no url`);
			continue;
		}

		// A command means a local process. Postey is remote, and setup.md spends a
		// section on why wrapping it is wrong.
		if (entry.command) {
			problems.push(`'${name}' carries a command; Postey is a remote server and must be registered by address`);
		}

		if (!setupDoc.includes(entry.url)) {
			problems.push(`url ${entry.url} does not appear anywhere in setup.md — the two copies have drifted`);
		}
	}
	return problems;
}

const validManifest = (over = {}) =>
	JSON.stringify({
		mcpServers: { postey: { type: 'http', url: 'https://srvr.postey.ai/mcp', ...over } }
	});
const SETUP = 'Register `https://srvr.postey.ai/mcp` in your own client.';

test('the shipped manifest passes', () => {
	assert.deepStrictEqual(
		checkPluginMcpManifest(fs.readFileSync(MANIFEST, 'utf8'), fs.readFileSync(path.join(ROOT, 'setup.md'), 'utf8')),
		[]
	);
});

test('it sits at the plugin root, beside .claude-plugin', () => {
	// Placement is the whole mechanism. At the repo root Claude Code never reads
	// it, and the file would look correct while doing nothing — which is how it
	// was described in CLAUDE.md before it existed.
	assert.ok(fs.existsSync(MANIFEST), '.mcp.json must be at skills/postey/, the plugin root');
	assert.ok(
		fs.existsSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json')),
		'the plugin root is the directory holding .claude-plugin/'
	);
	assert.ok(!fs.existsSync(path.join(ROOT, '.mcp.json')), 'a repo-root .mcp.json is read by nothing');
});

test('a url with no type FAILS', () => {
	const [problem] = checkPluginMcpManifest(
		JSON.stringify({ mcpServers: { postey: { url: 'https://srvr.postey.ai/mcp' } } }),
		SETUP
	);
	assert.match(problem, /read as a stdio server/);
});

test('a url that setup.md does not publish FAILS', () => {
	const [problem] = checkPluginMcpManifest(
		validManifest({ url: 'https://dev.srvr.postey.ai/mcp' }),
		SETUP
	);
	assert.match(problem, /have drifted/);
});

test('a renamed server FAILS, because the tool prefix derives from it', () => {
	const [problem] = checkPluginMcpManifest(
		JSON.stringify({ mcpServers: { 'postey-prod': { type: 'http', url: 'https://srvr.postey.ai/mcp' } } }),
		SETUP
	);
	assert.match(problem, /tool prefix derives from it/);
});

test('a local command instead of an address FAILS', () => {
	const problems = checkPluginMcpManifest(
		JSON.stringify({
			mcpServers: { postey: { type: 'http', url: 'https://srvr.postey.ai/mcp', command: 'npx' } }
		}),
		SETUP
	);
	assert.ok(problems.some((p) => /registered by address/.test(p)));
});

test('an empty mcpServers FAILS rather than passing vacuously', () => {
	assert.deepStrictEqual(checkPluginMcpManifest(JSON.stringify({ mcpServers: {} }), SETUP), [
		'mcpServers is empty — the manifest registers nothing'
	]);
});

test('malformed JSON FAILS as a named problem, not a thrown suite', () => {
	const [problem] = checkPluginMcpManifest('{ not json', SETUP);
	assert.match(problem, /not valid JSON/);
});

test('the plugin version and the manifest ship together', () => {
	// pack.json drives fetch-based installs and does not carry .mcp.json, because
	// a fetch install is not a plugin install. Assert the plugin manifest exists
	// so the two install paths cannot silently diverge on which one registers a
	// server.
	const plugin = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
	assert.strictEqual(plugin.name, 'postey');
	assert.ok(fs.existsSync(MANIFEST));
});
