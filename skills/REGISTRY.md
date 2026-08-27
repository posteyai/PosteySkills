# Skills Registry

Index of all skills in this repository.

> External distribution — where Postey is registered so agents can find it — is tracked in
> [`DISTRIBUTION.md`](../DISTRIBUTION.md), not here.

| Skill | Description | Status | Version |
|-------|-------------|--------|---------|
| [postey](postey/) | The hub: routing, accounts, platform truth and the shared craft layer | stable | 3.1.0 |
| [postey-ideas](postey-ideas/) | Content-ideation flows: trends to posts, idea to posts. Requires `postey` | stable | 1.0.0 |
| [postey-video](postey-video/) | Transcribe a video and cross-post it. Requires `postey` | stable | 1.0.0 |
| [postey-voice](postey-voice/) | Learn the user's voice from published posts and draft verdicts. Requires `postey` | stable | 1.1.0 |
| [postey-engagement](postey-engagement/) | Comment triage, replies and auto-DM funnels. Requires `postey` | stable | 1.0.0 |
| [postey-analytics](postey-analytics/) | Performance reading and content recommendations. Requires `postey` | stable | 1.0.0 |
| [postey-ops](postey-ops/) | Publish-status checks, failure triage and queue health. Requires `postey` | stable | 1.0.0 |
| [postey-teams](postey-teams/) | Review workflow, internal comments and share links. Requires `postey` | stable | 1.0.0 |

## Adding a New Skill

1. Copy `_template/` to `<skill-name>/`
2. Fill in `<skill-name>/SKILL.md` frontmatter and body
3. Add `<skill-name>/.claude-plugin/plugin.json`
4. Add a plugin entry to `../../.claude-plugin/marketplace.json`
5. Add a row to this table
6. Write tests in `../../tests/<skill-name>-cli.test.js`
