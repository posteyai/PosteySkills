// The rules in scripts/check-server-card.js, driven against fixtures that
// violate each one. A green run against the live server proves the server is
// currently in agreement; it does not prove the check would notice if it were
// not (F-046).

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const { compare } = createRequire(import.meta.url)('../scripts/check-server-card.js');

const snap = (over = {}) => ({ server_version: '2.3.0', tools: ['create_post', 'get_posts'], ...over });
const card = (over = {}) => ({
	serverInfo: { name: 'Postey API Server', version: '2.3.0' },
	tools: [{ name: 'create_post' }, { name: 'get_posts' }],
	...over
});

test('agreement produces no problems', () => {
	assert.deepStrictEqual(compare(snap(), card()), []);
});

test('a version behind the server FAILS', () => {
	// The exact shape of the 2026-08-27 finding: the snapshot sat two minor
	// versions behind while everything read green.
	const [problem] = compare(snap({ server_version: '2.1.0' }), card());
	assert.match(problem, /snapshot says 2\.1\.0, the server says 2\.3\.0/);
});

test('a tool the server no longer serves FAILS', () => {
	const problems = compare(snap({ tools: ['create_post', 'get_posts', 'get_post_by_share_link'] }), card());
	assert.ok(problems.some((p) => /does not serve: get_post_by_share_link/.test(p)));
});

test('a tool the server added FAILS', () => {
	const problems = compare(snap(), card({ tools: [{ name: 'create_post' }, { name: 'get_posts' }, { name: 'link_cli' }] }));
	assert.ok(problems.some((p) => /snapshot omits: link_cli/.test(p)));
});

test('an empty server tool list FAILS rather than agreeing with everything', () => {
	const [problem] = compare(snap(), card({ tools: [] }));
	assert.match(problem, /would pass vacuously/);
});

test('a card with no version FAILS rather than skipping the comparison', () => {
	const [problem] = compare(snap(), card({ serverInfo: {} }));
	assert.match(problem, /cannot compare/);
});

test('requiring the script does not run it', () => {
	// refresh-capability-snapshot.js used to exit the process at import time via
	// its unconfigured soft-skip, which is why no test could drive its rules.
	assert.strictEqual(typeof compare, 'function');
});
