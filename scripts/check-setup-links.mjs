// Verifies every URL in setup.md points at a live host. Prose cannot be
// unit-tested; an unreachable host is the one failure mode that can be.
//
// Deliberately NOT a 200-check. The MCP endpoint answers 405 to HEAD because it
// is POST-only, and the app's settings routes are client-rendered, so they 404
// on a HEAD too. Both prove DNS, TLS and reachability — which is what a setup
// doc's links actually need. Only a network error or a 5xx means something is
// really wrong. Do not "fix" this into a 200-check; it will fail on healthy infra.
import { readFileSync } from 'node:fs';

const md = readFileSync(new URL('../setup.md', import.meta.url), 'utf8');
const urls = [...md.matchAll(/https?:\/\/[^\s)<>"'`\]]+/g)].map((m) => m[0]);
const unique = [...new Set(urls)];

let failed = 0;
for (const url of unique) {
	const res = await fetch(url, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
	if (!res) {
		console.error(`UNREACHABLE  ${url}`);
		failed++;
	} else if (res.status >= 500) {
		console.error(`SERVER ERROR ${res.status}  ${url}`);
		failed++;
	} else {
		console.log(`ok ${String(res.status).padEnd(3)}  ${url}`);
	}
}
console.log(`${unique.length - failed}/${unique.length} URLs reachable`);
process.exit(failed > 0 ? 1 : 0);
