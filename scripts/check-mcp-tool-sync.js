#!/usr/bin/env node
'use strict';

/**
 * CI: verify that SKILL.md mcp-tools.tools: matches the MCP server tool registry.
 *
 * Source-parse mode (default, offline):
 *   MCP_TOOLS_DIR=../postey-backend/app/core/mcp/tools \
 *   node scripts/check-mcp-tool-sync.js
 *
 * Runtime mode (requires live server):
 *   MCP_SERVER_URL=https://srvr.postey.ai \
 *   POSTEY_API_KEY=mk_... \
 *   node scripts/check-mcp-tool-sync.js
 *
 * Exit codes: 0 = in sync, 1 = drift detected or error.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
// Every skill's SKILL.md, not just the hub's. With several skills each holding a
// SUBSET of the registry, equality is the wrong assertion: the union must cover
// the registry, and no skill may name a tool outside it (S1.5).
const { discoverSkills } = require('./lib/skills');
const { loadSnapshot } = require('./lib/capabilities');
const { UNCLAIMED_ALLOWLIST } = require('./lib/capability-contract');
const SKILL_MDS = () =>
  discoverSkills(path.join(ROOT, 'skills')).map(s => ({
    name: s.name,
    file: path.join(s.dir, 'SKILL.md'),
  }));
const MCP_TOOLS_DIR = process.env.MCP_TOOLS_DIR;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
const POSTEY_API_KEY = process.env.POSTEY_API_KEY;
// Derived from MCP_TOOLS_DIR (../prompts.py) or overridden explicitly.
const MCP_PROMPTS_FILE = process.env.MCP_PROMPTS_FILE ||
  (MCP_TOOLS_DIR ? path.join(path.dirname(MCP_TOOLS_DIR), 'prompts.py') : null);
// file_manager / list_files / read_file come from FastMCP's file-upload
// integration, not from @mcp.tool in tools/*.py, so scanning that directory alone
// cannot see them. The backend records them in file_tool_metadata.py — a second
// source, handled the same way prompts.py already is.
const MCP_FILE_TOOLS_FILE = process.env.MCP_FILE_TOOLS_FILE ||
  (MCP_TOOLS_DIR ? path.join(path.dirname(MCP_TOOLS_DIR), 'file_tool_metadata.py') : null);

/**
 * Tools deliberately NOT granted in SKILL.md `mcp-tools.tools:`.
 *
 * A tool absent from that key is a tool the skill cannot call, so silence is not
 * a safe default — `configure_auto_dm` was missing for an unknown length of time
 * and this script reported it as a warning and exited 0. Omission must now be
 * declared with a reason, exactly as S9.6 does for capability overlap.
 */
const INTENTIONALLY_UNGRANTED = {
  file_manager: 'Hosted-server upload widget — the skill uploads from disk via the CLI.',
  list_files: 'Hosted-server session file list; no meaning for a local CLI run.',
  read_file: 'Hosted-server session file metadata; no meaning for a local CLI run.',
};

let errors = 0;
let warnings = 0;

function fail(msg) { console.error(`  ✗ ${msg}`); errors++; }
function warn(msg) { console.warn(`  ⚠ ${msg}`); warnings++; }

// --- SKILL.md parsing ---

function extractFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

function extractMcpSubSection(frontmatter, subKey) {
  // Locate the mcp-tools: block (indented content after the key)
  const blockMatch = frontmatter.match(/^mcp-tools:\s*\n((?:[ \t]+[^\n]*\n?)*)/m);
  if (!blockMatch) return [];

  const block = blockMatch[1];

  // Find the sub-key (e.g. "tools:" or "resources:") and collect its list items.
  // List items are indented lines starting with "- "; comments (#) are skipped.
  // The sub-section ends when a line at the same or lower indent level appears.
  const subKeyMatch = block.match(new RegExp(`^(\\s+)${subKey}:\\s*$`, 'm'));
  if (!subKeyMatch) return [];

  const subKeyIndent = subKeyMatch[1].length;
  const afterSubKey = block.slice(block.indexOf(subKeyMatch[0]) + subKeyMatch[0].length);
  const items = [];

  for (const line of afterSubKey.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= subKeyIndent) break; // back to parent level — sub-section ended
    const itemMatch = line.match(/^\s+-\s+(\S+)/);
    if (itemMatch) items.push(itemMatch[1]);
  }

  return items;
}

function extractMcpTools(frontmatter) {
  return extractMcpSubSection(frontmatter, 'tools');
}

function extractMcpResources(frontmatter) {
  return extractMcpSubSection(frontmatter, 'resources');
}

function extractMcpPrompts(frontmatter) {
  return extractMcpSubSection(frontmatter, 'prompts');
}

// mcp__claude_ai_postey__tool_name → tool_name
function stripMcpPrefix(fullName) {
  const parts = fullName.split('__');
  return parts.length >= 3 ? parts.slice(2).join('__') : fullName;
}

// --- Source-parse mode ---

function extractToolsFromSource(toolsDir) {
  if (!fs.existsSync(toolsDir)) {
    // Mirror check-platform-sync.js: the backend repo is a sibling checkout that
    // CI does not have (runtime mode is opt-in via MCP_STAGING_URL secret), so a
    // missing source is a skip, not a failure — but ONLY when runtime mode was
    // never configured. A configured runtime check that failed must not degrade
    // into a green skip, so that path hard-fails before ever reaching here.
    console.log(`⚠ MCP_TOOLS_DIR not found: ${toolsDir} — skipping MCP tool sync check`);
    console.log('  Set MCP_SERVER_URL/MCP_STAGING_URL (runtime mode) or check out the backend repo to enable.');
    process.exit(0);
  }
  const pyFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith('.py'));
  const names = [];
  for (const file of pyFiles) {
    const src = fs.readFileSync(path.join(toolsDir, file), 'utf8');
    // Match @mcp.tool( on one line, name="..." on the next
    const matches = [...src.matchAll(/@mcp\.tool\(\s*\n\s*name=["']([^"']+)["']/g)];
    for (const m of matches) names.push(m[1]);
  }
  return names.sort();
}

// Keys of the FILE_TOOL_METADATA mapping — tools the server registers through
// FastMCP rather than through the @mcp.tool decorator.
function extractFileToolsFromSource(metadataFile) {
  if (!metadataFile || !fs.existsSync(metadataFile)) return [];
  const src = fs.readFileSync(metadataFile, 'utf8');
  return [...src.matchAll(/^\s{4}["']([a-z_]+)["']:\s*\{/gm)].map(m => m[1]).sort();
}

function extractPromptsFromSource(promptsFile) {
  if (!promptsFile || !fs.existsSync(promptsFile)) {
    return null; // not available — caller decides whether to skip or warn
  }
  const src = fs.readFileSync(promptsFile, 'utf8');
  // Match @mcp.prompt( on one line, name="..." on the next
  const matches = [...src.matchAll(/@mcp\.prompt\(\s*\n\s*name=["']([^"']+)["']/g)];
  return matches.map(m => m[1]).sort();
}

// --- Runtime mode ---

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        } else {
          resolve(body);
        }
      });
    }).on('error', reject);
  });
}

async function fetchManifestFromServer(serverUrl, apiKey) {
  // Read the manifest the way the server actually serves it: a JSON-RPC
  // `resources/read` POSTed to /mcp, answered as SSE.
  //
  // The previous implementation POSTed a bespoke body to `/mcp/resources/read`,
  // an endpoint that does not exist — it returned 404 against a live server, so
  // runtime mode had never once worked. It went unnoticed because CI only ever
  // runs source-parse mode, which soft-skips without a sibling backend checkout.
  // Between the two, this script has been incapable of checking anything in CI.
  const res = await fetch(new URL('/mcp', serverUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'postey://skill-manifest' },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const body = await res.text();
  // SSE opens with an `event:` line, so the body does not start with `data:`.
  const dataLine = body.split('\n').find((l) => l.startsWith('data:'));
  const payload = JSON.parse(dataLine ? dataLine.slice(5).trim() : body);
  if (payload.error) throw new Error(`manifest read failed: ${payload.error.message}`);

  return JSON.parse(payload.result.contents[0].text);
}

// --- Main ---

(async () => {
  const skills = SKILL_MDS();
  const skillTools = [];
  const skillPromptsBySkill = [];
  const toolOwner = new Map();
  for (const { name, file } of skills) {
    const skillFm = extractFrontmatter(file);
    for (const t of extractMcpTools(skillFm)) {
      skillTools.push(t);
      if (!toolOwner.has(t)) toolOwner.set(t, []);
      toolOwner.get(t).push(name);
    }
    skillPromptsBySkill.push(...extractMcpPrompts(skillFm));
  }
  const fm = extractFrontmatter(skills[0].file);
  const skillResources = extractMcpResources(fm);
  const skillPrompts = [...new Set(skillPromptsBySkill)];

  if (skillTools.length === 0) {
    console.log('⚠ mcp-tools.tools: empty in SKILL.md — nothing to verify');
    process.exit(0);
  }

  const skillRawNames = new Set(skillTools.map(stripMcpPrefix));

  let mcpRawNames;
  let mcpPromptNames = null;

  if (MCP_SERVER_URL) {
    console.log(`Runtime mode: fetching manifest from ${MCP_SERVER_URL}`);
    try {
      const resp = await fetchManifestFromServer(MCP_SERVER_URL, POSTEY_API_KEY);
      // resp may be wrapped in MCP response envelope or raw JSON
      const manifest = resp.data ?? resp;
      if (!manifest.tools) throw new Error('manifest.tools missing in response');
      mcpRawNames = new Set(manifest.tools.map(t => t.name));
      if (manifest.prompts) {
        mcpPromptNames = new Set(manifest.prompts.map(p => p.name));
      }
    } catch (err) {
      // Runtime mode was explicitly configured (MCP_SERVER_URL set): a failed
      // fetch is a failed check, full stop. Falling back to source-parse here
      // would silently skip in CI (no sibling backend checkout) and turn a
      // staging outage or missing POSTEY_API_KEY into a green no-op.
      console.error(`  ✗ Failed to fetch skill-manifest from server: ${err.message}`);
      console.error('    Runtime verification was configured but could not run; failing rather than skipping.');
      console.error('    Check MCP_SERVER_URL and POSTEY_API_KEY, or unset them to use source-parse mode.');
      process.exit(1);
    }
  } else if (MCP_TOOLS_DIR) {
    console.log(`Source-parse mode: reading ${MCP_TOOLS_DIR}`);
    mcpRawNames = new Set([
      ...extractToolsFromSource(MCP_TOOLS_DIR),
      ...extractFileToolsFromSource(MCP_FILE_TOOLS_FILE),
    ]);
  } else {
    console.error('Set MCP_TOOLS_DIR (source-parse) or MCP_SERVER_URL (runtime) to run this check.');
    process.exit(1);
  }

  // In source-parse mode, extract prompts from prompts.py alongside the tools dir.
  if (!mcpPromptNames) {
    const parsed = extractPromptsFromSource(MCP_PROMPTS_FILE);
    if (parsed) {
      mcpPromptNames = new Set(parsed);
    } else if (MCP_PROMPTS_FILE) {
      warn(`MCP_PROMPTS_FILE not found: ${MCP_PROMPTS_FILE} — skipping prompt sync check`);
    }
  }

  // Tools whose only capability is still unclaimed (C1 allowlist). They are
  // permitted to be ungranted until the pillar that owns them ships.
  const snap = loadSnapshot(ROOT);
  const unclaimedTools = new Set();
  for (const key of UNCLAIMED_ALLOWLIST) {
    const provider = snap.canonical[key];
    if (provider && !String(provider).startsWith('postey://')) unclaimedTools.add(provider);
    for (const [tool, resource] of Object.entries(snap.supersededBy)) {
      if (resource === provider) unclaimedTools.add(tool);
    }
  }

  // ── Tools check ────────────────────────────────────────────────────────────
  console.log('\nMCP tools in server:', [...mcpRawNames].sort().join(', '));
  console.log(`MCP tools across ${skills.length} skill(s):`, [...skillRawNames].sort().join(', '));

  // SKILL.md lists a tool that doesn't exist in the server → hard error
  for (const name of skillRawNames) {
    if (!mcpRawNames.has(name)) {
      fail(`'${name}' listed in SKILL.md mcp-tools.tools: but not found in MCP server`);
    }
  }

  // Server has a tool not listed in SKILL.md → warning (intentional omissions allowed)
  for (const name of mcpRawNames) {
    if (!skillRawNames.has(name)) {
      // A missing grant means the skill CANNOT CALL the tool. That is an error,
      // not an observation — unless the omission is declared on purpose.
      if (INTENTIONALLY_UNGRANTED[name]) {
        console.log(`  · '${name}' ungranted on purpose: ${INTENTIONALLY_UNGRANTED[name]}`);
      } else if (unclaimedTools.has(name)) {
        // The capability this tool serves is owned by no skill yet, and that gap
        // is already tracked by C1's allowlist. Failing here too would report one
        // gap twice and force skills to grant tools they do not document.
        console.log(`  · '${name}' serves a capability still on C1's unclaimed allowlist`);
      } else {
        fail(`'${name}' is registered on the MCP server but missing from SKILL.md ` +
             `mcp-tools.tools: — the skill cannot call it. Grant it, or declare the ` +
             `omission in INTENTIONALLY_UNGRANTED with a reason.`);
      }
    }
  }

  // ── Prompts check ───────────────────────────────────────────────────────────
  if (mcpPromptNames && skillPrompts.length > 0) {
    console.log('\nMCP prompts in server:', [...mcpPromptNames].sort().join(', '));
    console.log('MCP prompts in SKILL.md:', [...skillPrompts].sort().join(', '));

    for (const name of skillPrompts) {
      if (!mcpPromptNames.has(name)) {
        fail(`'${name}' listed in SKILL.md mcp-tools.prompts: but not found in MCP server`);
      }
    }
    for (const name of mcpPromptNames) {
      if (!skillPrompts.includes(name)) {
        warn(`'${name}' registered in MCP server but missing from SKILL.md mcp-tools.prompts:`);
      }
    }
  } else if (skillPrompts.length === 0) {
    console.log('\n⚠ mcp-tools.prompts: empty in SKILL.md — skipping prompt sync check');
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (errors > 0) {
    console.error(`\n✗ MCP sync failed (${errors} error(s), ${warnings} warning(s)).`);
    console.error('  Update SKILL.md mcp-tools sections to match the server registry.');
    process.exit(1);
  }

  if (warnings > 0) {
    console.log(`\n⚠ ${warnings} item(s) in server not listed in SKILL.md (may be intentional).`);
  } else {
    console.log('\n✓ MCP tools and prompts in sync.');
  }
})().catch(err => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
