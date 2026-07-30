# setup.md execution sandbox

`scripts/check-setup-doc.mjs` checks that `setup.md` is *parseable* and internally
consistent. It cannot check that following the doc actually works. These harnesses
execute it against a throwaway agent config and assert the observable result.

Not run by `npm test` — `node --test` only discovers `*.test.js` / `*.test.mjs`.
These are invoked directly, per release of `setup.md`.

| File | Track | Automatable |
|---|---|---|
| `sandbox-lib.sh` | shared primitives + gates | — |
| `track-c-headless.sh` | C — headless / `pat_` token | yes, CI-able |
| `track-a-oauth.sh` | A — local / OAuth | partly; consent needs a human |
| `track-b-checklist.md` | B — web connector | no; manual checklist |

## The failure mode these exist to prevent

All three tracks share one: **a false PASS from pre-existing state.**

- A leaked config makes an already-registered server look like a successful registration.
- A signed-in browser makes OAuth look like it worked when consent was never shown.
- An already-connected web client skips the flow entirely and still reports success.

Every harness gates on that first, because it is the one condition that makes every
other assertion meaningless. `sandbox_assert_clean` refuses to continue rather than
emit a pass it cannot stand behind.

## Isolation

`HOME` and `CLAUDE_CONFIG_DIR` are redirected at a `mktemp -d`, which covers the config
roots in the doc's Step 2 table (`~/.claude.json`, `~/.codex`, `~/.gemini`, `~/.cursor`,
`~/.config/goose`) plus installed skills and plugins. Step 6 instruction files land in a
throwaway git repo at `$SANDBOX/workspace`.

Process-level, not a container — deliberately. Track A's OAuth needs a real browser that
a container would not have.

## Account writes are NOT isolated

Step 7 does a real create → read → delete draft. Dev shares the production database, so
there is no environment-level escape; runs hit the real team by decision. Two guards:

- Every artifact is tagged `SANDBOX-<utc-timestamp>` (`$RUN_TAG`) so residue is sweepable.
- `sandbox_assert_no_live_accounts` blocks if the target team has connected social
  accounts, so a stray draft has nothing it could publish to. Override with
  `SANDBOX_ALLOW_LIVE_ACCOUNTS=1` once you accept that risk.

Running `track-c-headless.sh` in CI therefore writes to the real team on every run.

## Usage

```sh
# Track C — needs a pat_ token
POSTEY_TEST_PAT=... tests/sandbox/track-c-headless.sh

# Track A — opens a signed-out browser profile for consent
tests/sandbox/track-a-oauth.sh

# Keep the sandbox afterwards to inspect what the run produced
KEEP_SANDBOX=1 tests/sandbox/track-a-oauth.sh
```

`SETUP_URL` and `MCP_URL` are overridable to test a branch of the doc or a non-prod server.
