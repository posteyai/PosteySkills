#!/usr/bin/env node
'use strict';

/**
 * Regenerate skills/postey/capability-snapshot.json from a live MCP server.
 *
 * The skill used to keep the same platform/tool list in four hand-maintained
 * places. "Parity" then only proved the copies agreed with each other — which is
 * how the SKILL.md body drifted to seven platforms while the frontmatter said
 * nine and every check stayed green (S9.4's gate passed vacuously).
 *
 * There is now one generated artifact and everything derives from it. This script
 * is the only thing allowed to write it.
 *
 *   MCP_SERVER_URL=https://srvr.postey.ai POSTEY_API_KEY=mk_... \
 *     node scripts/refresh-capability-snapshot.js
 *
 * Add --check to fail instead of writing when the server has moved — that is the
 * drift gate CI runs; the offline tests can only prove internal consistency.
 *
 * Exit codes: 0 = written (or already current), 1 = drift under --check, or error.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT = path.join(ROOT, 'skills', 'postey', 'capability-snapshot.json');
const CHECK_ONLY = process.argv.includes('--check');

const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
const POSTEY_API_KEY = process.env.POSTEY_API_KEY;

if (!MCP_SERVER_URL) {
  // Unconfigured (fork PRs have no secrets) soft-skips; CONFIGURED never degrades
  // into a green skip — a fetch failure below is a hard failure. The offline tests
  // still hold the snapshot internally consistent, so only server drift goes
  // unchecked here, never repo drift.
  console.log('⚠ MCP_SERVER_URL unset — skipping live snapshot check');
  process.exit(0);
}

// `ui://` renderer prefabs are client-side UI, not Postey capability. Including
// them would put an opaque hash in the snapshot that churns on every deploy.
const isCapabilityResource = (uri) => uri.startsWith('postey://');

async function readManifest() {
  const res = await fetch(new URL('/mcp', MCP_SERVER_URL), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(POSTEY_API_KEY ? { authorization: `Bearer ${POSTEY_API_KEY}` } : {})
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'postey://skill-manifest' }
    })
  });

  if (!res.ok) throw new Error(`server returned ${res.status} ${res.statusText}`);

  const body = await res.text();
  // The transport may answer as SSE even for a single response.
  const payload = body.startsWith('data:')
    ? JSON.parse(body.split('\n').find((l) => l.startsWith('data:')).slice(5).trim())
    : JSON.parse(body);

  if (payload.error) throw new Error(`manifest read failed: ${payload.error.message}`);
  return JSON.parse(payload.result.contents[0].text);
}

function build(manifest) {
  const canonical = {};
  const supersededBy = {};

  for (const tool of manifest.tools) {
    if (!tool.capability) continue;
    if (tool.canonical) canonical[tool.capability] = tool.name;
    if (tool.superseded_by) supersededBy[tool.name] = tool.superseded_by;
  }
  // Resources win ties: where a resource and a tool serve one capability, the
  // resource is canonical. That is the resource-first rule, applied as data.
  for (const resource of manifest.resources) {
    if (!resource.capability || !isCapabilityResource(resource.uri)) continue;
    canonical[resource.capability] = resource.uri;
  }

  const sortObj = (o) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

  return {
    _note:
      'GENERATED — do not hand-edit. Refresh with `node scripts/refresh-capability-snapshot.js` ' +
      'against a live server. This file is the single source the skill, the CLI and CI all derive ' +
      'capability from; a literal platform/tool list anywhere else is a regression (S9.5).',
    generated_from: 'postey://skill-manifest',
    server_version: manifest.server_version,
    platforms: manifest.platforms,
    tools: manifest.tools.map((t) => t.name).sort(),
    resources: manifest.resources
      .map((r) => r.uri)
      .filter(isCapabilityResource)
      .sort(),
    prompts: manifest.prompts.map((p) => p.name).sort(),
    canonical: sortObj(canonical),
    superseded_by: sortObj(supersededBy)
  };
}

(async () => {
  try {
    const next = JSON.stringify(build(await readManifest()), null, 2) + '\n';
    const current = fs.existsSync(SNAPSHOT) ? fs.readFileSync(SNAPSHOT, 'utf8') : '';

    if (next === current) {
      console.log('✓ capability-snapshot.json is current');
      return;
    }
    if (CHECK_ONLY) {
      console.error('✗ capability-snapshot.json is stale — run without --check to refresh');
      process.exit(1);
    }
    fs.writeFileSync(SNAPSHOT, next);
    console.log('✓ capability-snapshot.json refreshed');
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
})();
