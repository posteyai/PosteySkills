# Security

## Reporting a vulnerability

Email **support@postey.ai**. Do not open a public issue for a security problem.

Include what you found, how to reproduce it, and what an attacker could do with it.
You will get an acknowledgement; if you do not hear back within a few days, send a
follow-up rather than assuming it was received.

## What is in scope

This repo ships skill definitions and a CLI that agents run on a user's machine, and
that talks to the Postey API. Relevant classes of problem:

| Area | Example |
|---|---|
| Credential handling | The CLI writing an API key somewhere world-readable, or logging one |
| Prompt injection | A skill instructing an agent to exfiltrate data or act without approval |
| Path handling | A skill or script reading or writing outside its intended directory |
| Supply chain | A dependency or install path that could be substituted |

The Postey API and the MCP server live elsewhere. Report those to the same address —
we will route it.

## Credentials

The CLI resolves auth in this order: `POSTEY_API_KEY`, `POSTEY_AUTH_TOKEN`, an OAuth
session in the global config, `./.postey/config.json`, then
`~/.config/postey/config.json`.

`.postey/` is in `.gitignore`. It holds a real key — do not commit it, and do not
paste one into an issue, a PR, or a skill file.

`scripts/check-leaks.js` runs in CI over the whole repo and scans for secret-shaped
strings and a committed hashed denylist. It is a backstop. It will not catch every
shape of secret, and passing it is not evidence that a change is safe.

## If a key is exposed

**Rotate first, then clean up.** A key that reached a public repo must be treated as
compromised even if the commit was removed minutes later — GitHub retains unreferenced
objects, forks keep their own copies, and mirrors may have already pulled.

1. Revoke the key in Postey and issue a new one.
2. Remove it from the working tree and from history.
3. Only then worry about how it got there.

Rewriting history does not un-expose a secret. It reduces who stumbles across it next.

## What these skills can do on a user's machine

A skill is instructions plus, in some packs, a CLI the agent may run. `allowed-tools`
in each `SKILL.md` scopes what the agent is permitted to execute — for example
`Bash(${CLAUDE_SKILL_DIR}/scripts/postey.js:*)` permits that script and nothing else.

Widening `allowed-tools` widens what an agent can run on someone's machine. Treat any
change to that field as a security change and say so in the PR.
