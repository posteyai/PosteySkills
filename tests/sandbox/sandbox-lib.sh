#!/usr/bin/env bash
# Shared sandbox primitives for the setup.md regression harnesses.
# Isolates agent config, installed skills, and Step 6 instruction-file writes.
# Does NOT isolate the Postey account: runs hit the real team by decision.

SETUP_URL="${SETUP_URL:-https://raw.githubusercontent.com/posteyai/skills/main/setup.md}"
MCP_URL="${MCP_URL:-https://srvr.postey.ai/mcp}"

# Every artifact this harness creates carries this prefix so residue in the real
# team is identifiable and sweepable. Do not remove it.
RUN_TAG="SANDBOX-$(date -u +%Y%m%dT%H%M%SZ)"

sandbox_new() {
  SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/postey-sandbox.XXXXXX")"
  mkdir -p "$SANDBOX/.claude" "$SANDBOX/workspace"
  git -C "$SANDBOX/workspace" init -q
  export HOME="$SANDBOX"                       # ~/.codex ~/.gemini ~/.cursor ~/.config/goose
  export CLAUDE_CONFIG_DIR="$SANDBOX/.claude"  # ~/.claude.json, skills, plugins
  echo "sandbox: $SANDBOX  run_tag: $RUN_TAG"
}

# Hard gate. If isolation failed, a run reports "setup worked" when it was merely
# already set up — a false PASS. Refuse to continue rather than emit that.
sandbox_assert_clean() {
  local listing
  listing="$(claude mcp list 2>&1 || true)"
  if grep -qi postey <<<"$listing"; then
    echo "FATAL: isolation failed — sandbox already sees a postey server:" >&2
    grep -i postey <<<"$listing" >&2
    return 1
  fi
  echo "gate ok: sandbox config is clean"
}

# Guard for the account decision: a team with no connected social accounts means a
# stray draft has nothing it could publish to. Warn loudly if that is not true.
sandbox_assert_no_live_accounts() {
  local out
  out="$(claude -p 'Read the postey://accounts resource. Reply with ONLY the number of connected social accounts, as a bare integer.' 2>&1 || true)"
  if [[ "$out" =~ ^[[:space:]]*0[[:space:]]*$ ]]; then
    echo "gate ok: target team has 0 connected accounts"
  else
    echo "WARNING: target team reports connected accounts ($out)." >&2
    echo "         Drafts created here could be published by a later mistake." >&2
    [[ "${SANDBOX_ALLOW_LIVE_ACCOUNTS:-0}" == "1" ]] || {
      echo "         Set SANDBOX_ALLOW_LIVE_ACCOUNTS=1 to proceed anyway." >&2
      return 1
    }
  fi
}

sandbox_teardown() {
  if [[ "${KEEP_SANDBOX:-0}" == "1" ]]; then
    cat <<EOF
sandbox KEPT for inspection: $SANDBOX
  config written by the run : $SANDBOX/.claude/.claude.json
  skills installed          : $SANDBOX/.claude/skills/
  Step 6 instruction files  : $SANDBOX/workspace/
  logs                      : $SANDBOX/*.log

  Re-enter it (an agent here sees ONLY the sandbox config):
    cd $SANDBOX/workspace
    HOME=$SANDBOX CLAUDE_CONFIG_DIR=$SANDBOX/.claude claude

  Delete when done:  rm -rf $SANDBOX
EOF
  else
    [[ -n "${SANDBOX:-}" && -d "$SANDBOX" ]] && rm -rf "$SANDBOX"
    echo "torn down. Re-run with KEEP_SANDBOX=1 to inspect it instead."
  fi
  echo "Sweep any residue in the real team by searching drafts for: $RUN_TAG"
}
