#!/usr/bin/env node
'use strict';

/**
 * CI: verify that SKILL.md mcp-tools.tools: matches the MCP server tool registry.
 *
 * Source-parse mode (default, offline):
 *   MCP_TOOLS_DIR=../MarqetiveBackendV2/app/core/mcp/tools \
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
const SKILL_MD = path.join(ROOT, 'skills', 'postey', 'SKILL.md');
const MCP_TOOLS_DIR = process.env.MCP_TOOLS_DIR;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
const POSTEY_API_KEY = process.env.POSTEY_API_KEY;
// Derived from MCP_TOOLS_DIR (../prompts.py) or overridden explicitly.
const MCP_PROMPTS_FILE = process.env.MCP_PROMPTS_FILE ||
  (MCP_TOOLS_DIR ? path.join(path.dirname(MCP_TOOLS_DIR), 'prompts.py') : null);

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

// mcp__claude_ai_Postey__tool_name → tool_name
function stripMcpPrefix(fullName) {
  const parts = fullName.split('__');
  return parts.length >= 3 ? parts.slice(2).join('__') : fullName;
}

// --- Source-parse mode ---

function extractToolsFromSource(toolsDir) {
  if (!fs.existsSync(toolsDir)) {
    // Mirror check-platform-sync.js: the backend repo is a sibling checkout that
    // CI does not have (runtime mode is opt-in via MCP_STAGING_URL secret), so a
    // missing source is a skip, not a failure. Drift is still enforced wherever
    // the sibling repo exists (local dev) or the secret is set.
    console.warn(`⚠ MCP_TOOLS_DIR not found: ${toolsDir} — skipping MCP tool sync check`);
    console.warn('  Set MCP_SERVER_URL/MCP_STAGING_URL (runtime mode) or check out the backend repo to enable.');
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
  // The skill manifest is an MCP resource; the easiest way to read it without
  // a full MCP client is via the MCP HTTP SSE endpoint or a minimal tools/read
  // call. We POST to /mcp/resources/read (FastMCP HTTP transport).
  const url = `${serverUrl.replace(/\/$/, '')}/mcp/resources/read`;
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  const body = JSON.stringify({ uri: 'postey://skill-manifest' });

  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const parsedUrl = new URL(url);
    const opts = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = lib.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        } else {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Invalid JSON from server: ${raw.slice(0, 200)}`));
          }
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --- Main ---

(async () => {
  const fm = extractFrontmatter(SKILL_MD);
  const skillTools = extractMcpTools(fm);
  const skillResources = extractMcpResources(fm);
  const skillPrompts = extractMcpPrompts(fm);

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
      console.error(`  ✗ Failed to fetch skill-manifest from server: ${err.message}`);
      if (!MCP_TOOLS_DIR) {
        console.error('    Set MCP_TOOLS_DIR to fall back to source-parse mode.');
        process.exit(1);
      }
      console.warn('    Falling back to source-parse mode.');
      mcpRawNames = new Set(extractToolsFromSource(MCP_TOOLS_DIR));
    }
  } else if (MCP_TOOLS_DIR) {
    console.log(`Source-parse mode: reading ${MCP_TOOLS_DIR}`);
    mcpRawNames = new Set(extractToolsFromSource(MCP_TOOLS_DIR));
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

  // ── Tools check ────────────────────────────────────────────────────────────
  console.log('\nMCP tools in server:', [...mcpRawNames].sort().join(', '));
  console.log('MCP tools in SKILL.md:', [...skillRawNames].sort().join(', '));

  // SKILL.md lists a tool that doesn't exist in the server → hard error
  for (const name of skillRawNames) {
    if (!mcpRawNames.has(name)) {
      fail(`'${name}' listed in SKILL.md mcp-tools.tools: but not found in MCP server`);
    }
  }

  // Server has a tool not listed in SKILL.md → warning (intentional omissions allowed)
  for (const name of mcpRawNames) {
    if (!skillRawNames.has(name)) {
      warn(`'${name}' registered in MCP server but missing from SKILL.md mcp-tools.tools:`);
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
