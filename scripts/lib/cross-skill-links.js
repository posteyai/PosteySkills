'use strict';

// Cross-skill link gate.
//
// Once skills are split, a reference to a file that moved to a different skill is
// the dominant failure mode: the prose still reads fine, and the file is simply not
// installed. This finds both forms the repo actually uses.
//
//   1. markdown links   [x](references/y.md)      — explicit; must resolve and must
//                                                   not land inside another skill.
//   2. backtick refs    `caption-playbook.md`     — how the content flows cite the
//                                                   craft layer. A basename that
//                                                   lives in ANOTHER skill but not
//                                                   in this one has moved away.
//
// A backtick naming a file that exists in no skill at all is not a cross-skill
// problem — CHANGELOG.md cites `skills/SKILLS.md` from a repo that no longer
// exists here, and that is history, not leakage.
//
// THE HUB IS A GUARANTEED DEPENDENCY. The pillar skills are optional add-ons to
// `postey`, which is not optional: it carries the routing, the auth and the craft
// layer every flow cites. So a spoke may name a hub file — that file is always
// installed alongside it. Spoke-to-spoke is still forbidden, because two optional
// packs have no such guarantee about each other.
//
// This applies to BACKTICK names only. A markdown link into another skill's
// directory stays forbidden regardless: the relative path between two installed
// skills is not knowable at authoring time, so the link would not resolve.

const fs = require('fs');
const path = require('path');

const { discoverSkills } = require('./skills');

// The hub. Every spoke depends on it, so a spoke may name its files.
const HUB = 'postey';

const MD_LINK = /\]\(([^)\s]+?\.md)(?:#[^)\s]*)?\)/g;
const BACKTICK_MD = /`([A-Za-z0-9_./-]+\.md)`/g;

function markdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// Which skill, if any, owns this absolute path.
function owningSkill(skills, absPath) {
  return skills.find(s => absPath === s.dir || absPath.startsWith(s.dir + path.sep)) || null;
}

function findCrossSkillLinkProblems(skillsDir) {
  const skills = discoverSkills(skillsDir);
  const problems = [];

  // basename -> set of skills shipping a file with that basename
  const byBasename = new Map();
  for (const skill of skills) {
    for (const file of markdownFiles(skill.dir)) {
      const base = path.basename(file);
      if (!byBasename.has(base)) byBasename.set(base, new Set());
      byBasename.get(base).add(skill.name);
    }
  }

  for (const skill of skills) {
    for (const file of markdownFiles(skill.dir)) {
      const rel = path.relative(skill.dir, file);
      const text = fs.readFileSync(file, 'utf8');

      for (const [, ref] of text.matchAll(MD_LINK)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) continue; // http:, mailto:, …
        const target = path.resolve(path.dirname(file), ref);
        const owner = owningSkill(skills, target);
        if (owner && owner.name !== skill.name) {
          problems.push({
            skill: skill.name, file: rel, ref, kind: 'link',
            reason: `resolves into skill "${owner.name}"; it will not be installed with "${skill.name}"`,
          });
        } else if (!fs.existsSync(target)) {
          problems.push({
            skill: skill.name, file: rel, ref, kind: 'link',
            reason: 'target does not exist',
          });
        }
      }

      for (const [, ref] of text.matchAll(BACKTICK_MD)) {
        const base = path.basename(ref);
        const owners = byBasename.get(base);
        if (!owners || owners.has(skill.name)) continue; // ours, or in no skill at all
        if (skill.name !== HUB && owners.has(HUB)) continue; // hub file: always installed
        problems.push({
          skill: skill.name, file: rel, ref, kind: 'backtick',
          reason: `only skill(s) "${[...owners].join(', ')}" ship ${base}`,
        });
      }
    }
  }

  return problems;
}

module.exports = { findCrossSkillLinkProblems };
