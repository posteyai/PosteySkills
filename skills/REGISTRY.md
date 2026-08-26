# Skills Registry

Index of all skills in this repository.

| Skill | Description | Status | Version |
|-------|-------------|--------|---------|
| [postey](postey/) | Draft, schedule, and manage social media posts across every network Postey supports | stable | 2.5.2 |

## Adding a New Skill

1. Copy `_template/` to `<skill-name>/`
2. Fill in `<skill-name>/SKILL.md` frontmatter and body
3. Add `<skill-name>/.claude-plugin/plugin.json`
4. Add a plugin entry to `../../.claude-plugin/marketplace.json`
5. Add a row to this table
6. Write tests in `../../tests/<skill-name>-cli.test.js`
