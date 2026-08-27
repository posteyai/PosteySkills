'use strict';

// C5: `mcp-tools.tools:` is DERIVED from `capabilities:`, never hand-written.
//
// A hand-kept tool list is the same defect class as a hand-kept platform list
// (S9.5): a second list that agrees with the others until it quietly does not.
// Generating it means a skill can only reach tools for capabilities it actually
// claims — orphan grants become impossible rather than merely discouraged.

const fs = require('fs');

const isResource = provider => String(provider).startsWith('postey://');

/**
 * Tools a skill may call, given what it claims.
 *
 *  - a claimed capability whose canonical provider is a TOOL contributes that tool
 *  - a claimed capability whose provider is a RESOURCE contributes the superseded
 *    tool, if one exists, as the resource-blind fallback (C3 keeps it a fallback)
 */
function toolsFor(caps, snapshot) {
  const primary = new Set();
  const fallback = new Set();

  for (const key of [...caps.owns, ...caps.reads]) {
    const provider = snapshot.canonical[key];
    if (!provider) continue;
    if (!isResource(provider)) {
      primary.add(provider);
      continue;
    }
    for (const [tool, resource] of Object.entries(snapshot.supersededBy)) {
      if (resource === provider) fallback.add(tool);
    }
  }

  return {
    primary: [...primary].sort(),
    fallback: [...fallback].sort(),
  };
}

function renderToolsBlock(caps, snapshot, indent = '  ') {
  const { primary, fallback } = toolsFor(caps, snapshot);
  const item = indent + '  - ';
  const lines = [`${indent}tools:`];

  lines.push(`${indent}  # GENERATED from capabilities: by scripts/gen-mcp-tools.js — do not hand-edit.`);
  for (const tool of primary) lines.push(item + tool);

  if (fallback.length) {
    lines.push(`${indent}  # Fallbacks only: each is superseded by a postey:// resource this skill`);
    lines.push(`${indent}  # declares. Use them when the client cannot read MCP resources.`);
    for (const tool of fallback) lines.push(item + tool);
  }

  return lines;
}

/**
 * Replace the `tools:` sub-list of the `mcp-tools:` block in a SKILL.md.
 * Returns the new file content, or the original when there is no such block.
 */
function rewriteSkillMd(content, caps, snapshot) {
  const lines = content.split('\n');

  // Scope the search to the frontmatter. Searching the whole file meant a fenced
  // yaml example in the body containing an indented `tools:` was rewritten with
  // the generated list, and --check then reported the body stale forever.
  const fmEnd = lines.indexOf('---', lines[0] === '---' ? 1 : 0);
  const limit = fmEnd === -1 ? lines.length : fmEnd;

  const start = lines.slice(0, limit).findIndex(l => /^\s+tools:\s*$/.test(l));
  if (start === -1) {
    // A skill that owns or reads capabilities but declares no tools: block grants
    // zero tools at runtime. Reporting "matches" for that is the vacuous pass
    // this check exists to prevent.
    const { primary = [], fallback = [] } = toolsFor(caps, snapshot);
    if (primary.length + fallback.length > 0) {
      throw new Error(
        'capabilities: names tools but the frontmatter has no `  tools:` line to generate into'
      );
    }
    return content;
  }
  const indent = lines[start].match(/^(\s*)/)[1];

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() === '') { end++; continue; }
    const lineIndent = line.match(/^(\s*)/)[1].length;
    if (lineIndent <= indent.length) break; // back to a sibling key
    end++;
  }

  return [
    ...lines.slice(0, start),
    ...renderToolsBlock(caps, snapshot, indent),
    ...lines.slice(end),
  ].join('\n');
}

function rewriteFile(file, caps, snapshot, { write }) {
  const before = fs.readFileSync(file, 'utf8');
  const after = rewriteSkillMd(before, caps, snapshot);
  if (before === after) return { changed: false };
  if (write) fs.writeFileSync(file, after);
  return { changed: true, before, after };
}

module.exports = { toolsFor, renderToolsBlock, rewriteSkillMd, rewriteFile };
