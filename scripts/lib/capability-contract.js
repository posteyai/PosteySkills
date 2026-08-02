'use strict';

// C1 Cover and C2 Exclusive — the repo-wide half of the capability contract.
// Per-skill schema validation lives in ./capabilities.js.
//
// See docs/skills-mcp-contract.md § "Ownership is capability-keyed".

// Capabilities the server exposes that no skill documents yet. Each entry names
// the stage that clears it; the list reaching EMPTY is the completion test for
// the split. An entry that becomes claimed fails the build as stale, so this
// cannot rot into a permanent exemption.
const UNCLAIMED_ALLOWLIST = [
  // S4.1 — postey-engagement
  'comment.platform.list',
  'comment.platform.reply',
  'comment.internal.list',
  'automation.list',
  'schedule.auto_dm',
  // S4.2 — postey-analytics
  'analytics.overview',
  'analytics.top_posts',
  'post.analytics',
  // S4.3 — postey-ops
  'notification.list',
  'post.publish_status',
  // S4.4 — postey-teams
  'team.list',
  'team.info',
  'team.read',
  'post.resolve',
];

// MCP prompts no skill routes to yet. Same discipline as UNCLAIMED_ALLOWLIST:
// each entry names the stage that adopts it, and a claimed entry fails as stale.
const PROMPT_ALLOWLIST = [
  'generate-captions-from-transcript', // S2.3 — postey-video
  'generate-captions-batch',           // S2.3 — postey-video
  'improve-post',                      // S3.5 — postey-voice
  'analyze-engagement',                // S4.2 — postey-analytics
];

// C1: every canonical key is claimed by some skill, as owner or reader.
function checkCover(skills, snapshot, allowlist) {
  const failures = [];
  const deferred = [];

  const claimed = new Set();
  for (const { caps } of skills) {
    for (const key of [...caps.owns, ...caps.reads]) claimed.add(key);
  }

  const allowed = new Set(allowlist);

  for (const key of allowlist) {
    if (!(key in snapshot.canonical)) {
      failures.push({ key, check: 'c1', reason: `allowlisted "${key}" is not a canonical key` });
    } else if (claimed.has(key)) {
      failures.push({
        key, check: 'c1',
        reason: `allowlist entry "${key}" is stale — a skill now claims it; remove it from UNCLAIMED_ALLOWLIST`,
      });
    }
  }

  for (const key of Object.keys(snapshot.canonical)) {
    if (claimed.has(key)) continue;
    if (allowed.has(key)) { deferred.push(key); continue; }
    failures.push({
      key, check: 'c1',
      reason: `"${key}" is claimed by no skill — give it an owner, or allowlist it with the stage that will`,
    });
  }

  return { failures, deferred: deferred.sort() };
}

// C2: at most one owner per key. Readers are unrestricted.
function checkExclusive(skills) {
  const owners = new Map();
  for (const { name, caps } of skills) {
    for (const key of caps.owns) {
      if (!owners.has(key)) owners.set(key, []);
      owners.get(key).push(name);
    }
  }

  const failures = [];
  for (const [key, names] of owners) {
    if (names.length > 1) {
      failures.push({
        key, check: 'c2',
        reason: `owned by ${names.join(' and ')} — exactly one skill may own a capability`,
      });
    }
  }

  return { failures };
}

// C3: reads are resource-first. Where a resource supersedes a tool, a skill that
// claims that capability may keep the tool only as a declared fallback — the
// resource must be listed too. A superseded tool for a capability the skill does
// NOT claim is an orphan tool entry, which is C5's business, not C3's.
function checkResourceFirst(skills, snapshot) {
  const failures = [];

  for (const { name, caps, mcp } of skills) {
    const claimed = new Set([...caps.owns, ...caps.reads]);
    const resources = new Set(mcp.resources);

    for (const tool of mcp.tools) {
      const resource = snapshot.supersededBy[tool];
      if (!resource) continue;

      const servesAClaimedCapability = [...claimed]
        .some(key => snapshot.canonical[key] === resource);
      if (!servesAClaimedCapability) continue;

      if (!resources.has(resource)) {
        failures.push({
          key: tool, skill: name, check: 'c3',
          reason: `"${tool}" is superseded by ${resource}, which this skill does not declare — ` +
                  `the resource is the path, the tool is only the fallback`,
        });
      }
    }
  }

  return { failures };
}

// C4: every prompt the server declares is routed to by some skill. Unlike
// capabilities, prompts are not exclusive — several skills may use one.
function checkPromptsOwned(skills, snapshot, allowlist) {
  const failures = [];
  const deferred = [];

  const claimed = new Set();
  for (const { caps } of skills) for (const p of caps.prompts) claimed.add(p);
  const allowed = new Set(allowlist);

  for (const prompt of allowlist) {
    if (!snapshot.prompts.includes(prompt)) {
      failures.push({ key: prompt, check: 'c4', reason: `allowlisted "${prompt}" is not a server prompt` });
    } else if (claimed.has(prompt)) {
      failures.push({
        key: prompt, check: 'c4',
        reason: `prompt allowlist entry "${prompt}" is stale — a skill now routes to it; remove it from PROMPT_ALLOWLIST`,
      });
    }
  }

  for (const prompt of snapshot.prompts) {
    if (claimed.has(prompt)) continue;
    if (allowed.has(prompt)) { deferred.push(prompt); continue; }
    failures.push({
      key: prompt, check: 'c4',
      reason: `prompt "${prompt}" is routed to by no skill — declared by the server and unreachable`,
    });
  }

  return { failures, deferred: deferred.sort() };
}

module.exports = {
  UNCLAIMED_ALLOWLIST,
  PROMPT_ALLOWLIST,
  checkCover,
  checkExclusive,
  checkResourceFirst,
  checkPromptsOwned,
};
