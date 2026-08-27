#!/usr/bin/env node
'use strict';

/**
 * Assert capability-snapshot.json still agrees with the live server, using a
 * source that needs no credential.
 *
 * refresh-capability-snapshot.js reads postey://skill-manifest, which is behind
 * auth. With no key it soft-skips and exits 0. That skip is not a hypothetical:
 * on 2026-08-27 the snapshot was found at server_version 2.1.0 while production
 * served 2.3.0, naming four tools that had been renamed away and missing seven
 * that existed -- and every check in this repo had stayed green the whole time,
 * because the only thing that could have caught it never ran.
 *
 * The server card at /.well-known/mcp/server-card.json is PUBLIC and derives its
 * tool list from the server's own registry, so it cannot drift from the server
 * and cannot be skipped for want of a secret. It carries less than the manifest
 * -- no resources, no prompts, no capability mapping -- so it does not replace
 * the refresh. It checks the two fields that go stale first.
 *
 *   node scripts/check-server-card.js
 *   SERVER_CARD_URL=https://dev.srvr.postey.ai/... node scripts/check-server-card.js
 *
 * Exit codes: 0 = agrees, 1 = drift or unreachable. There is no skip path, and
 * adding one would restore the failure this script exists to prevent.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT = path.join(ROOT, 'skills', 'postey', 'capability-snapshot.json');
const CARD_URL =
	process.env.SERVER_CARD_URL || 'https://srvr.postey.ai/.well-known/mcp/server-card.json';

/** Pure, so the tests can drive it against fixtures (F-046). */
function compare(snapshot, card) {
	const problems = [];

	const cardVersion = card?.serverInfo?.version;
	if (!cardVersion) {
		problems.push('server card carries no serverInfo.version — cannot compare');
	} else if (snapshot.server_version !== cardVersion) {
		problems.push(
			`server_version drift: snapshot says ${snapshot.server_version}, the server says ${cardVersion}`
		);
	}

	const cardTools = Array.isArray(card?.tools) ? card.tools.map((t) => t.name).filter(Boolean) : null;
	if (!cardTools || cardTools.length === 0) {
		// An empty list must fail. Comparing against nothing agrees with anything.
		problems.push('server card lists no tools — the comparison would pass vacuously');
		return problems;
	}

	const inSnapshot = new Set(snapshot.tools ?? []);
	const onServer = new Set(cardTools);

	const gone = [...inSnapshot].filter((t) => !onServer.has(t)).sort();
	const missing = [...onServer].filter((t) => !inSnapshot.has(t)).sort();

	if (gone.length) problems.push(`snapshot names tools the server does not serve: ${gone.join(', ')}`);
	if (missing.length) problems.push(`server serves tools the snapshot omits: ${missing.join(', ')}`);

	return problems;
}

module.exports = { compare };

if (require.main !== module) return;

(async () => {
	try {
		const res = await fetch(CARD_URL);
		if (!res.ok) throw new Error(`${CARD_URL} returned ${res.status} ${res.statusText}`);
		const problems = compare(JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')), await res.json());

		if (problems.length === 0) {
			console.log('✓ capability-snapshot.json agrees with the live server card');
			return;
		}
		for (const p of problems) console.error(`✗ ${p}`);
		console.error('  refresh with: node scripts/refresh-capability-snapshot.js');
		process.exit(1);
	} catch (err) {
		console.error(`✗ ${err.message}`);
		process.exit(1);
	}
})();
