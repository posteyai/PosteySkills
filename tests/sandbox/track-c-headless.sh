#!/usr/bin/env bash
# Track C regression harness — headless / agent-token. CI-able: no browser.
# Requires: POSTEY_TEST_PAT (a pat_ token). Run from anywhere.
set -euo pipefail
source "$(dirname "$0")/sandbox-lib.sh"

: "${POSTEY_TEST_PAT:?set POSTEY_TEST_PAT to a pat_ token}"
FAILED=0
check() { if "$@"; then echo "PASS: $*"; else echo "FAIL: $*"; FAILED=1; fi; }

sandbox_new
trap sandbox_teardown EXIT
sandbox_assert_clean || exit 1
cd "$SANDBOX/workspace"

# --- Assertion 1: the sanctioned pause -------------------------------------
# A headless run with no credential must STOP and ask for a token. It must not
# attempt OAuth and hang. Static doc parsing cannot verify this; only a run can.
echo "--- assertion 1: headless run without a credential pauses, does not hang"
set +e
run_with_timeout 120 claude -p "Set up Postey by following instructions: $SETUP_URL
You are headless: no browser, no interactive input. Do not attempt OAuth." \
  >"$SANDBOX/pause.log" 2>&1
rc=$?
set -e
if [[ $rc -eq 127 ]]; then
  # Distinguish a missing tool from a verdict. Reporting 127 as "did not ask for a
  # token" is how a broken harness looks identical to a broken product.
  echo "ERROR: could not launch the agent (rc=127). Harness problem, not a result."; FAILED=1
elif [[ $rc -eq $TIMEOUT_EXIT ]]; then
  echo "FAIL: headless run hung (timeout). The pause is not working."; FAILED=1
elif grep -qiE 'pat_|agent token|api key|token' "$SANDBOX/pause.log"; then
  echo "PASS: run terminated asking for a token (rc=$rc)"
else
  echo "FAIL: run terminated (rc=$rc) without requesting a token. See $SANDBOX/pause.log"; FAILED=1
fi

# --- Assertion 2: token registration + resource reads ----------------------
echo "--- assertion 2: header-auth registration and resource reads"
check claude mcp add --transport http postey "$MCP_URL" \
  --header "Authorization: Bearer $POSTEY_TEST_PAT" --scope user
check claude mcp list
sandbox_assert_no_live_accounts || FAILED=1

# --- Assertion 3: Step 7 round-trip (writes to the REAL team) --------------
echo "--- assertion 3: create -> read back -> delete draft"
claude -p "Using the Postey MCP tools: create a draft post whose text is exactly
'$RUN_TAG harness check'. Read it back by id to confirm it persisted, then delete it.
Report one line: CREATED <id> / READBACK ok|bad / DELETED ok|bad." \
  2>&1 | tee "$SANDBOX/roundtrip.log"
grep -q "DELETED ok" "$SANDBOX/roundtrip.log" \
  && echo "PASS: round-trip clean" \
  || { echo "FAIL: round-trip left residue — search drafts for $RUN_TAG"; FAILED=1; }

echo; echo "=== Track C: $([[ $FAILED -eq 0 ]] && echo ALL PASS || echo FAILURES) ==="
exit $FAILED
