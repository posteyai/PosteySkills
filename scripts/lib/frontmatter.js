'use strict';

// Minimal YAML-ish frontmatter reader. The repo has zero runtime dependencies and
// the shapes it needs are two levels deep, so a parser is not warranted.
//
// NOTE: check-mcp-tool-sync.js still carries its own copy of this logic for
// `mcp-tools:`. S1.5 rewrites that script and folds it onto this module; until
// then the duplication is deliberate rather than overlooked.

const fs = require('fs');

function extractFrontmatter(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const match = fs.readFileSync(filePath, 'utf8').match(/^---\s*\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

// Items of `block:` → `subKey:` → "- value". Returns [] when either key is absent
// or the list is empty. Comment lines are skipped; the sub-section ends at the
// first line indented no deeper than the sub-key itself.
function blockList(frontmatter, block, subKey) {
  const blockMatch = frontmatter.match(
    new RegExp(`^${block}:\\s*\\n((?:[ \\t]+[^\\n]*\\n?)*)`, 'm')
  );
  if (!blockMatch) return [];

  const body = blockMatch[1];
  const subMatch = body.match(new RegExp(`^(\\s+)${subKey}:\\s*$`, 'm'));
  if (!subMatch) return [];

  const subIndent = subMatch[1].length;
  const after = body.slice(body.indexOf(subMatch[0]) + subMatch[0].length);
  const items = [];

  for (const line of after.split('\n')) {
    if (line.trim() === '') continue;
    if (line.trim().startsWith('#')) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= subIndent) break; // back to the parent level
    const item = line.match(/^\s+-\s+(\S+)/);
    if (item) items.push(item[1]);
  }

  return items;
}

module.exports = { extractFrontmatter, blockList };
