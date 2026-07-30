// Five checks in this repo have shipped in a state where they reported success
// without ever really running (F-046). So every rule below is driven against a
// fixture that violates it, and asserted to fail. A green run of the real file
// proves nothing on its own.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkSetupDoc } from '../scripts/check-setup-doc.mjs';

/** A minimal document that satisfies every rule. Each test breaks one thing. */
function validDoc({ step0 = 'This document names Claude Code and Cursor.', body = '' } = {}) {
	return `# Set up Postey

## Step 0 — Identify the environment

${step0}

## Step 2 — Register the Postey MCP server

| Agent | Command |
|---|---|
| Claude Code | \`claude mcp add --transport http postey URL --scope user\` |
| Cursor | edit \`~/.cursor/mcp.json\` |

${body}

## Step 6 — Record usage rules

| Agent | File |
|---|---|
| Claude Code | \`CLAUDE.md\` |
| Cursor | \`.cursor/rules/postey.mdc\` |
`;
}

const rules = (problems) => problems.map((p) => p.rule);

describe('check-setup-doc', () => {
	test('a compliant document produces no problems', () => {
		assert.deepEqual(checkSetupDoc(validDoc()), []);
	});

	test('catches a skills install that would prompt', () => {
		const doc = validDoc({ body: '```\nnpx -y skills add posteyai/skills\n```' });
		assert.ok(rules(checkSetupDoc(doc)).includes('skills-add-without-agent-skill-and-yes'));
	});

	test('accepts a skills install that names agent, skill and -y', () => {
		const doc = validDoc({
			body: '```\nnpx -y skills add posteyai/skills -a claude-code -s postey -y\n```'
		});
		assert.deepEqual(checkSetupDoc(doc), []);
	});

	test('catches an install with no -s, which also installs the _template skill', () => {
		// Verified by running it: without -s the CLI installs postey AND a skill
		// called skill-name, taken from skills/_template.
		const doc = validDoc({ body: '```\nnpx -y skills add posteyai/skills -a claude-code -y\n```' });
		assert.ok(rules(checkSetupDoc(doc)).includes('skills-add-without-agent-skill-and-yes'));
	});

	test('accepts the --list form, which never prompts', () => {
		const doc = validDoc({ body: '```\nnpx -y skills add posteyai/skills --list\n```' });
		assert.deepEqual(checkSetupDoc(doc), []);
	});

	test('catches the /plugin slash command, which opens a panel', () => {
		const doc = validDoc({ body: '```\n/plugin install postey@postey-skills\n```' });
		assert.ok(rules(checkSetupDoc(doc)).includes('plugin-slash-command'));
	});

	test('accepts the shell form of the same install', () => {
		const doc = validDoc({ body: '```\nclaude plugin install postey@postey-skills\n```' });
		assert.deepEqual(checkSetupDoc(doc), []);
	});

	test('catches postey.js setup with no --key, which prompts on stdin', () => {
		const doc = validDoc({ body: '```\nnode scripts/postey.js setup\n```' });
		assert.ok(rules(checkSetupDoc(doc)).includes('postey-setup-without-key'));
	});

	test('scans table cells too, because commands live in them', () => {
		const doc = validDoc({ body: '| Agent | Command |\n|---|---|\n| X | `/plugin install x` |' });
		assert.ok(rules(checkSetupDoc(doc)).includes('plugin-slash-command'));
	});

	test('catches an agent named in Step 0 with no row in Step 2 or Step 6', () => {
		const doc = validDoc({ step0: 'This document names Claude Code, Cursor and Windsurf.' });
		const found = checkSetupDoc(doc).filter((p) => p.rule === 'agent-missing-from-step');
		// Absent from both acting steps, so it is reported once per step.
		assert.equal(found.length, 2);
		assert.ok(found.every((p) => p.why.includes('Windsurf')));
	});

	test('fails loudly rather than passing vacuously when Step 0 parses to nothing', () => {
		const doc = validDoc({ step0: 'Work out which agent you are.' });
		assert.ok(rules(checkSetupDoc(doc)).includes('no-agents-parsed'));
	});

	test('ignores prose outside a fence or a table', () => {
		// Otherwise a sentence explaining why /plugin is wrong would trip the rule.
		const doc = validDoc({ body: 'Do not use the /plugin slash command here.' });
		assert.deepEqual(checkSetupDoc(doc), []);
	});

	test('catches a registration wrapped in a local bridge', () => {
		const doc = validDoc({
			body: '```\nnpx -y mcp-remote https://srvr.postey.ai/mcp\n```'
		});
		assert.ok(rules(checkSetupDoc(doc)).includes('bridge-wrapper'));
	});

	test('catches an mcp add that registers a command instead of the address', () => {
		const doc = validDoc({ body: '```\nhermes mcp add postey --command npx --args mcp-remote\n```' });
		assert.ok(rules(checkSetupDoc(doc)).includes('mcp-add-with-command'));
	});

	test('accepts an mcp add that passes the address', () => {
		const doc = validDoc({
			body: '```\nhermes mcp add postey --url https://srvr.postey.ai/mcp --auth oauth\n```'
		});
		assert.deepEqual(checkSetupDoc(doc), []);
	});

	test('lets prose name a bridge in order to forbid it', () => {
		const doc = validDoc({ body: 'Never register Postey through mcp-remote or supergateway.' });
		assert.deepEqual(checkSetupDoc(doc), []);
	});
});
