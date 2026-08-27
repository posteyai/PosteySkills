// N12.2's gate: "the prefixed name of every tool fits 64 characters on the
// plugin path."
//
// Claude Code namespaces a plugin's MCP tools as `mcp__<plugin>__<tool>` and
// truncates nothing -- a name over the budget is a name the model cannot call.
// The plugin slug is immutable once published, so a rename to buy headroom
// breaks every existing install. That is why the budget is asserted here rather
// than discovered later.
//
// The stage also asks that the plugin name EQUAL the server name, so the prefix
// collapses to one token instead of two. `server.json` lives in
// MarqetiveBackendV2 and is not readable from this repo, so the slug is pinned
// below and the reason it cannot drift is written next to it.
//
// ONE HAZARD, and it is the whole reason this file says what it says: this gate
// reads the tool list from capability-snapshot.json. That file is GENERATED, and
// it was found on 2026-08-27 sitting at server_version 2.1.0 while the server
// served 2.3.0 -- naming four tools that had been renamed away and missing seven
// that existed. A budget checked against a stale list is a budget checked
// against nothing. `check-server-card.js` is what keeps the list honest; this
// file additionally refuses to run against a snapshot that names a tool the
// server's own superseded list has retired.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_ROOT = path.join(ROOT, 'skills', 'postey');

// From `server.json` on MarqetiveBackendV2 origin/main: "name": "ai.postey/postey".
// The registry namespace is `ai.postey`; the server slug is the segment after
// the slash. Both halves are immutable once the server is published to the
// official MCP Registry -- a published name cannot be renamed, only superseded
// by a new entry, which orphans every install pointing at the old one.
const SERVER_NAME = 'ai.postey/postey';
const SERVER_SLUG = SERVER_NAME.split('/')[1];

// Claude Code's namespacing. Not configurable, and not padded: the budget is
// exactly what the host will build.
const PREFIXED = (plugin, tool) => `mcp__${plugin}__${tool}`;
const BUDGET = 64;

/** The checks, as a pure function, so fixtures can drive them (F-046). */
export function checkToolNameBudget(pluginName, toolNames, retiredNames = []) {
	const problems = [];

	if (pluginName !== SERVER_SLUG) {
		problems.push(
			`plugin is named '${pluginName}'; the server slug is '${SERVER_SLUG}', and §12·N12.2 sets them equal so the prefix collapses`
		);
	}

	if (!Array.isArray(toolNames) || toolNames.length === 0) {
		problems.push('no tool names to check — the budget would pass vacuously');
		return problems;
	}

	for (const tool of toolNames) {
		const full = PREFIXED(pluginName, tool);
		if (full.length > BUDGET) {
			problems.push(`'${full}' is ${full.length} chars, over the ${BUDGET}-char plugin-path budget`);
		}
	}

	// A retired name in the list is proof the list is stale, and a stale list
	// makes every assertion above meaningless rather than merely incomplete.
	for (const retired of retiredNames) {
		if (toolNames.includes(retired)) {
			problems.push(`'${retired}' is a retired tool name — the snapshot is stale, so this gate is not measuring the live surface`);
		}
	}

	return problems;
}

const snapshot = () =>
	JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'capability-snapshot.json'), 'utf8'));
const pluginJson = () =>
	JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));

// The four names N4 renamed away. Kept here, not derived, because their whole
// purpose is to be absent: deriving them from the same file they are meant to
// police would make the check circular.
const RETIRED = [
	'get_post_by_share_link',
	'get_specific_post_content',
	'reply_to_platform_comment',
	'review_post_content_and_add_comments_for_virality'
];

test('the shipped plugin and tool list meet the gate', () => {
	assert.deepStrictEqual(checkToolNameBudget(pluginJson().name, snapshot().tools, RETIRED), []);
});

test('the marketplace entry names the same plugin', () => {
	// Two files declare the plugin name. Claude Code reads the marketplace entry
	// to install and plugin.json to run, so a disagreement installs one thing and
	// prefixes another.
	const marketplace = JSON.parse(
		fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')
	);
	const entries = marketplace.plugins ?? [];
	assert.ok(entries.length > 0, 'marketplace.json lists no plugins');
	assert.ok(
		entries.some((p) => p.name === SERVER_SLUG),
		`no marketplace entry named '${SERVER_SLUG}'; found ${entries.map((p) => p.name).join(', ')}`
	);
});

test('a plugin renamed away from the server slug FAILS', () => {
	const [problem] = checkToolNameBudget('postey-prod', ['get_accounts'], RETIRED);
	assert.match(problem, /the prefix collapses/);
});

test('a tool name over the budget FAILS', () => {
	// A name long enough to breach under the collapsed prefix. Invented, and said
	// to be: no live tool comes close, and pretending one does would misreport the
	// headroom.
	const long = 'a'.repeat(BUDGET - PREFIXED('postey', '').length + 1);
	const [problem] = checkToolNameBudget('postey', [long], []);
	assert.match(problem, /over the 64-char plugin-path budget/);
});

test('collapsing the prefix is what buys the headroom', () => {
	// This is the arithmetic §12·N12.2 rests on, and it is worth pinning because
	// the guide states it wrongly.
	//
	// The guide says the 49-char pre-N4 name "reaches 76 characters" under a
	// plugin prefix. It does not reproduce at either candidate prefix. Measured:
	//   mcp__ai.postey/postey__<49> = 72  -- over the 64 budget
	//   mcp__postey__<49>           = 62  -- under it
	// So the guide's conclusion holds and its figure does not. The stage exists
	// because the UNCOLLAPSED prefix breaches, not because 76 is a real number.
	const preN4 = 'review_post_content_and_add_comments_for_virality';
	assert.strictEqual(preN4.length, 49);
	assert.strictEqual(PREFIXED(SERVER_NAME, preN4).length, 72);
	assert.strictEqual(PREFIXED(SERVER_SLUG, preN4).length, 62);
	assert.ok(PREFIXED(SERVER_NAME, preN4).length > BUDGET);
	assert.ok(PREFIXED(SERVER_SLUG, preN4).length <= BUDGET);
});

test('the live surface has real headroom, and the margin is reported', () => {
	// A gate that only says "passed" hides how close it is. Print the worst case
	// so a future rename is judged against a number, not against a green tick.
	const tools = snapshot().tools;
	const worst = tools.map((t) => PREFIXED(SERVER_SLUG, t)).sort((a, b) => b.length - a.length)[0];
	console.log(`  longest prefixed tool name: ${worst} (${worst.length}/${BUDGET})`);
	assert.ok(worst.length <= BUDGET);
});

test('an empty tool list FAILS rather than passing vacuously', () => {
	assert.deepStrictEqual(checkToolNameBudget('postey', [], []), [
		'no tool names to check — the budget would pass vacuously'
	]);
});

test('a retired tool name in the list FAILS as staleness, not as a budget problem', () => {
	const [problem] = checkToolNameBudget('postey', ['get_accounts', 'get_post_by_share_link'], RETIRED);
	assert.match(problem, /the snapshot is stale/);
});
