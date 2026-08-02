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

module.exports = { UNCLAIMED_ALLOWLIST, checkCover, checkExclusive };
