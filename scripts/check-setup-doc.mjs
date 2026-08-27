// setup.md is executed by an agent, not read by a person. Three failure modes
// follow from that, and none is visible to any other check in this repo:
//
//   1. A command that waits for a keystroke. An unattended run hangs forever.
//      This is not a style problem — it is the difference between the document
//      working and not working.
//   2. An agent named in Step 0 with no row in the steps that act on it. The
//      agent identifies itself, then finds no instruction for its own case.
//   3. A registration that goes through a local bridge. Postey is remote and
//      authorizes with OAuth, so a bridge breaks the browser flow, keeps the
//      credential out of the client keychain, and pins an old protocol revision.
//
// check-doc-commands.js cannot catch any of them: it scans skills/ only, and matches
// postey.js commands only, so no regular expression in it can match `npx` or
// `claude plugin`. check-setup-links.mjs checks that URLs resolve.
//
// Exported so the test can drive it against fixtures rather than only the real
// file — a check that has never been seen to fail is not known to work (F-046).
import { readFileSync } from 'node:fs';

/** Commands that block on input unless the escape hatch is present. */
const INTERACTIVE = [
	{
		name: 'skills-add-without-agent-skill-and-yes',
		// -a and -y stop it prompting. -s stops it installing skills/_template as
		// a second skill called "skill-name", which it does by default.
		test: (line) =>
			/\bskills\s+add\b/.test(line) &&
			!/--list\b/.test(line) &&
			!(
				/(^|\s)(-a|--agent)\s/.test(line) &&
				/(^|\s)(-s|--skill)\s/.test(line) &&
				/(^|\s)(-y|--yes)(\s|$)/.test(line)
			),
		why: 'prompts, or installs the _template skill; pass -a <agent> -s postey -y'
	},
	{
		name: 'plugin-slash-command',
		// The slash form opens a TUI panel. The shell form does not.
		// The backtick matters: in a table cell the command is quoted, so anchoring
		// on whitespace alone misses every occurrence that actually ships.
		test: (line) => /(^|[\s`("'])\/plugin\b/.test(line),
		why: 'the /plugin slash command opens an interactive panel; use `claude plugin ...`'
	},
	{
		name: 'postey-setup-without-key',
		test: (line) => /postey\.js\s+setup\b/.test(line) && !/--key\b/.test(line),
		why: 'prompts on stdin for the key; pass --key'
	}
];

/**
 * Registrations that route Postey through a local process instead of the address.
 * Prose is not scanned, so naming a bridge in order to forbid it stays legal.
 */
const PROXIED = [
	{
		name: 'bridge-wrapper',
		test: (line) => /\b(mcp-remote|mcp-proxy|supergateway|mcpo|mcp-hub)\b/.test(line),
		why: 'wraps the remote server in a local process; register the address natively'
	},
	{
		name: 'hermes-skills-install-url',
		// Verified failing twice on v0.19.0, including with --force --yes. The
		// agent then hand-copied SKILL.md alone, which yields a skill with no
		// scripts/ that `hermes skills list` still reports as present. Use the
		// `skills add` installer, whose Hermes identifier is `hermes-agent`.
		test: (line) => /\bhermes\s+skills\s+install\b/.test(line) && /https?:\/\//.test(line),
		why: 'hermes skills install cannot fetch a raw file URL; use npx -y skills add with -a hermes-agent'
	},
	{
		name: 'hardcoded-tool-prefix',
		// The prefix is built from the name the user gave the connection, and the
		// separator varies by client. S9.3 removed these literals from the skill
		// for the same reason.
		test: (line) => /\bmcp_+postey_+/i.test(line),
		why: 'the tool prefix follows the connection name; tell the agent to read its own tool list'
	},
	{
		name: 'rest-api-fallback',
		// The REST base is a different product surface. Reaching it with a
		// credential meant for MCP hides the setup failure it stands in for.
		test: (line) => /srvr\.postey\.ai\/v1\b/.test(line),
		why: 'calls the REST API instead of MCP; setup is not proven by another surface'
	},
	{
		name: 'agent-self-invocation',
		// A nested agent is a conduit even when it is the same agent. The nested
		// run has no terminal, so it hangs, and a tool call there says nothing
		// about this session.
		test: (line) =>
			/\bhermes\s+(chat|--resume)\b/.test(line) ||
			/\bclaude\s+-p\b/.test(line) ||
			/\bcodex\s+exec\b/.test(line) ||
			/\bgemini\s+-p\b/.test(line),
		why: 'drives another agent session; the tools must resolve in this session'
	},
	{
		name: 'hermes-mcp-add',
		// Verified on v0.19.0: `hermes mcp add --help` offers --url, --command,
		// --args, --auth, --preset, --connect-timeout and --env. None writes
		// skip_preflight, which Postey needs, and --skip-preflight exits 2.
		// `hermes config set` writes all three keys and never blocks.
		test: (line) => /\bhermes\s+mcp\s+add\b/.test(line),
		why: 'no hermes mcp add option writes skip_preflight; use hermes config set'
	},
	{
		name: 'mcp-add-with-command',
		// `hermes mcp add <name> --command <cmd>` and its equivalents. The flag is
		// correct for a server that runs locally. Postey does not.
		test: (line) => /\bmcp\s+add\b/.test(line) && /--command\b/.test(line),
		why: 'registers a command instead of the address; pass --url'
	}
];

const RULES = [...INTERACTIVE, ...PROXIED];

const FENCE = /^\s*```/;

/**
 * The load section holds shell actions by definition. A slash command there is a
 * chat command, and an agent that runs one gets `exit 127` — observed with
 * `/reload-mcp`. Scoping to the section keeps Step 3's legal `/mcp` mention.
 */
function chatCommandInLoadSection(markdown) {
	const problems = [];
	let inSection = false;
	let seenSection = false;
	// Matched on the TITLE, at either heading level, with or without a step
	// number. This rule was anchored on `### Load the server`; promoting that
	// section to `## Step 7 — Load the server` made it match nothing, so the
	// check reported clean while asserting nothing about the section it exists
	// for. A heading level and a step number are both presentation.
	const isLoadHeading = (line) => /^#{2,3}\s+(?:Step\s+\d+\s+[—-]\s+)?Load the server\b/.test(line);
	markdown.split('\n').forEach((line, i) => {
		if (/^#{2,3}\s/.test(line)) {
			inSection = isLoadHeading(line);
			if (inSection) seenSection = true;
		}
		if (!inSection) return;
		if (/`\/[a-z][a-z0-9-]*`/.test(line)) {
			problems.push({
				rule: 'chat-command-in-load-section',
				line: i + 1,
				why: 'a slash command is a chat command, not a shell command',
				text: line.trim()
			});
		}
	});
	// `seenSection` is returned rather than turned into a problem here: this
	// function also runs against minimal fixtures that legitimately have no such
	// section. That the REAL document has one — so this rule is not silently
	// scanning nothing — is asserted in tests/setup-doc.test.mjs, where it
	// belongs.
	loadSectionSeen = seenSection;
	return problems;
}

/** Whether the last load-section scan found its section. Read by the tests. */
export let loadSectionSeen = false;

function commandLines(markdown) {
	const out = [];
	let inFence = false;
	markdown.split('\n').forEach((line, i) => {
		if (FENCE.test(line)) {
			inFence = !inFence;
			return;
		}
		// Commands appear in fences and in table cells. Both are executed.
		if (inFence || line.trimStart().startsWith('|')) out.push({ line, n: i + 1 });
	});
	return out;
}

function sections(markdown) {
	const found = new Map();
	let current = null;
	for (const line of markdown.split('\n')) {
		const heading = line.match(/^##\s+(.*)$/);
		if (heading) {
			current = heading[1].trim();
			found.set(current, []);
		} else if (current) {
			found.get(current).push(line);
		}
	}
	return found;
}

/** Agents Step 0 tells the reader to identify themselves as. */
function agentsNamedInStep0(markdown) {
	const step0 = [...sections(markdown)].find(([h]) => /^Step 0\b/.test(h));
	if (!step0) return [];
	const body = step0[1].join('\n');
	const sentence = body.match(/This document names([\s\S]*?)\./);
	if (!sentence) return [];
	return sentence[1]
		.replace(/\band\b/g, ',')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export function checkSetupDoc(markdown) {
	const problems = [];

	for (const { line, n } of commandLines(markdown)) {
		for (const rule of RULES) {
			if (rule.test(line)) {
				problems.push({ rule: rule.name, line: n, why: rule.why, text: line.trim() });
			}
		}
	}

	problems.push(...chatCommandInLoadSection(markdown));

	const agents = agentsNamedInStep0(markdown);
	const bySection = sections(markdown);
	// Step 2 registers the server; Step 6 records the rules. An agent named in
	// Step 0 and absent from either is told to identify itself for nothing.
	// Selected by TITLE, not by number. Anchoring on `^Step (2|6)` meant a
	// renumbering dropped a section out of `required` silently — the check kept
	// passing, having asserted less. Numbers are ordering; the titles are what
	// these two sections ARE.
	const REQUIRED_TITLES = [/Register the Postey MCP server/, /Record usage rules/];
	const required = [...bySection.keys()].filter((h) =>
		REQUIRED_TITLES.some((t) => t.test(h))
	);
	if (required.length !== REQUIRED_TITLES.length) {
		problems.push({
			rule: 'required-step-missing',
			line: 0,
			why:
				`expected ${REQUIRED_TITLES.length} required sections, found ${required.length}` +
				' — an agent named in Step 0 is being checked against fewer steps than intended',
			text: ''
		});
	}
	for (const agent of agents) {
		for (const heading of required) {
			const body = bySection.get(heading).join('\n');
			if (!body.includes(agent)) {
				problems.push({
					rule: 'agent-missing-from-step',
					line: 0,
					why: `"${agent}" is named in Step 0 but has no row under "${heading}"`,
					text: agent
				});
			}
		}
	}

	if (agents.length === 0) {
		problems.push({
			rule: 'no-agents-parsed',
			line: 0,
			why: 'Step 0 named no agents, so the coverage check ran vacuously',
			text: ''
		});
	}

	return problems;
}

// --- CLI -------------------------------------------------------------------

const isMain =
	process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
	const path = new URL('../setup.md', import.meta.url);
	const problems = checkSetupDoc(readFileSync(path, 'utf8'));

	for (const p of problems) {
		const where = p.line ? `setup.md:${p.line}` : 'setup.md';
		console.error(`${where} [${p.rule}] ${p.why}`);
		if (p.text) console.error(`    ${p.text}`);
	}

	if (problems.length) {
		console.error(`check-setup-doc: ${problems.length} problem(s). Failing.`);
		process.exit(1);
	}
	console.log('check-setup-doc: clean');
}
