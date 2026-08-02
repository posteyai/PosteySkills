'use strict';

// Shared skill discovery for the CI checks and the test suite. One definition of
// "what counts as a skill" so a new skill dir is picked up everywhere at once.

const fs = require('fs');
const path = require('path');

// A skill is a directory under skills/ that holds a SKILL.md. Underscore-prefixed
// directories (_template) are scaffolding, not skills.
function discoverSkills(skillsDir) {
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_'))
    .map(e => ({ name: e.name, dir: path.resolve(skillsDir, e.name) }))
    .filter(s => fs.existsSync(path.join(s.dir, 'SKILL.md')))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { discoverSkills };
