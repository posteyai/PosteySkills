// One run installed the skill while the server was unreachable and counted that
// as progress toward a write. It then looked for a local way to reach an effect
// the server owns. SKILL.md already says the CLI has no write command. What was
// missing is the other half: an installed skill is not a working connection.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bootstrap = readFileSync('skills/postey/bootstrap-prompt.md', 'utf8');
const skill = readFileSync('skills/postey/SKILL.md', 'utf8');

describe('tools-absent contract', () => {
	test('the bootstrap prompt handles tools absent from the session, not only an empty read', () => {
		assert.match(bootstrap, /tools are absent/i);
		assert.match(bootstrap, /\bstop\b/i);
	});

	test('the skill states that installing it is not connecting', () => {
		assert.match(skill, /installed skill is not a working setup/i);
	});

	test('the skill still states that the CLI owns no write', () => {
		// Pre-existing invariant (S9.1). Asserted here so a future edit to the
		// paragraph above cannot quietly drop it.
		assert.match(skill, /no write command/i);
	});
});
