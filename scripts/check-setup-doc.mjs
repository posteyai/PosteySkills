// setup.md is executed by an agent, not read by a person. Two failure modes
// follow from that, and neither is visible to any other check in this repo:
//
//   1. A command that waits for a keystroke. An unattended run hangs forever.
//      This is not a style problem — it is the difference between the document
//      working and not working.
//   2. An agent named in Step 0 with no row in the steps that act on it. The
//      agent identifies itself, then finds no instruction for its own case.
//
// check-doc-commands.js cannot catch either: it scans skills/ only, and matches
// postey.js commands only, so no regular expression in it can match `npx` or
// `claude plugin`. check-setup-links.mjs checks that URLs resolve.
//
// Exported so the test can drive it against fixtures rather than only the real
// file — a check that has never been seen to fail is not known to work (F-046).
import { readFileSync } from 'node:fs';

/** Commands that block on input unless the escape hatch is present. */
const INTERACTIVE = [
	{
		name: 'skills-add-without-agent-and-yes',
		// The CLI prompts for scope, agent and skill unless both are passed.
		test: (line) =>
			/\bskills\s+add\b/.test(line) &&
			!/--list\b/.test(line) &&
			!(/(^|\s)(-a|--agent)\s/.test(line) && /(^|\s)(-y|--yes)\s|(-y|--yes)$/.test(line)),
		why: 'prompts for scope, agent and skill; pass -a <agent> and -y'
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

const FENCE = /^\s*```/;

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
		for (const rule of INTERACTIVE) {
			if (rule.test(line)) {
				problems.push({ rule: rule.name, line: n, why: rule.why, text: line.trim() });
			}
		}
	}

	const agents = agentsNamedInStep0(markdown);
	const bySection = sections(markdown);
	// Step 2 registers the server; Step 6 records the rules. An agent named in
	// Step 0 and absent from either is told to identify itself for nothing.
	const required = [...bySection.keys()].filter((h) => /^Step (2|6)\b/.test(h));
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
