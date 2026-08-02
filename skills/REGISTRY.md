# Skills Registry

Index of all skills in this repository.

| Skill | Description | Status | Version |
|-------|-------------|--------|---------|
| [postey](postey/) | The hub: routing, accounts, platform truth and the shared craft layer | stable | 3.0.0 |
| [postey-studio](postey-studio/) | Content-ideation flows: trends to posts, idea to posts. Requires `postey` | stable | 1.0.0 |
| [postey-video](postey-video/) | Transcribe a video and cross-post it. Requires `postey` | stable | 1.0.0 |
| [postey-voice](postey-voice/) | Learn the user's voice from published posts and draft verdicts. Requires `postey` | stable | 1.0.0 |

## Adding a New Skill

1. Copy `_template/` to `<skill-name>/`
2. Fill in `<skill-name>/SKILL.md` frontmatter and body
3. Add `<skill-name>/.claude-plugin/plugin.json`
4. Add a plugin entry to `../../.claude-plugin/marketplace.json`
5. Add a row to this table
6. Write tests in `../../tests/<skill-name>-cli.test.js`
