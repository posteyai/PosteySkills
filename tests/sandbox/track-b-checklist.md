# Track B — web connector, manual checklist

Track B cannot be automated. claude.ai, Claude Desktop and ChatGPT give an agent no
filesystem and no CLI, so there is nothing for a harness to drive. This is a human
checklist, run per release of `setup.md`.

**Isolation:** use a second claude.ai / ChatGPT account, or a fresh browser profile
signed out of Postey. An already-connected client skips the connector flow entirely
and reports success without testing anything — the same false-PASS class the Track A
and Track C harnesses gate against.

**Account decision in force:** these runs write to the real Postey team. Tag every
test draft `SANDBOX-<date>` so residue is sweepable.

## Per client

Run for each of: claude.ai (web), Claude Desktop, ChatGPT.

| # | Check | Expected |
|---|---|---|
| 1 | Paste the app's prompt verbatim: `Set up Postey by following instructions: <SETUP_DOC_URL>` | Agent identifies itself as Track B / web |
| 2 | Does it try to run shell commands? | **No.** Attempting `npx` or `claude mcp add` is a routing bug — the doc mis-classified the client |
| 3 | Does it try to install a skill? | **No.** Track B skips skill install |
| 4 | Does it direct you to add a *connector*? | Yes, with a URL that resolves |
| 5 | Add the connector, complete consent | Consent screen appears; connection succeeds |
| 6 | Ask it to read `postey://accounts` | Returns your accounts |
| 7 | Step 7 round-trip: create → read back → delete a draft tagged `SANDBOX-<date>` | All three succeed; nothing left behind |
| 8 | Sweep | No `SANDBOX-*` drafts remain in the team |

## Recording results

A Track B failure is usually a **routing** failure — the doc treating a web client as
if it had a filesystem. That is exactly the class `check-setup-doc.mjs` cannot catch,
which is why rows 2 and 3 matter more than the happy path.

File findings against `posteyai/skills`. A fix ships by pushing `setup.md`; no
frontend release is involved.
