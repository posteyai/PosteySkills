#!/usr/bin/env bash
# Track A harness — local / OAuth. Semi-automated: the consent step needs a human.
# Config is isolated; the browser is not, so this script forces a fresh profile.
set -euo pipefail
source "$(dirname "$0")/sandbox-lib.sh"

sandbox_new
trap sandbox_teardown EXIT
sandbox_assert_clean || exit 1

# Second false-PASS trap, the browser twin of the config leak: if you are already
# signed in to Postey, OAuth completes silently and the consent screen — the part
# users actually hit — is never exercised. Force a throwaway browser profile.
BROWSER_PROFILE="$SANDBOX/chrome-profile"
mkdir -p "$BROWSER_PROFILE"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ -x "$CHROME" ]]; then
  echo "opening a signed-out Chrome profile for the consent step..."
  "$CHROME" --user-data-dir="$BROWSER_PROFILE" --no-first-run \
    --no-default-browser-check "https://app.postey.ai" >/dev/null 2>&1 &
  echo "NOTE: complete OAuth in THAT window, not your normal browser."
else
  echo "WARNING: Chrome not found. Use a private window and confirm you are signed OUT" >&2
  echo "         of Postey first, or the consent screen will be skipped." >&2
fi

cd "$SANDBOX/workspace"
cat <<EOF

Sandbox ready. Run the onboarding prompt exactly as the app emits it:

  cd $SANDBOX/workspace
  HOME=$SANDBOX CLAUDE_CONFIG_DIR=$SANDBOX/.claude \\
    claude "Set up Postey by following instructions: $SETUP_URL"

Then check by hand, in order:
  1. Step 2 registered the server        -> claude mcp list shows postey
  2. Step 4 OAuth showed a CONSENT screen (not a silent pass-through)
  3. Step 5 installed the skill          -> ls $SANDBOX/.claude/skills/
     ^ and ONLY postey. A '_template' directory here is the known install bug.
  4. Step 6 wrote instructions           -> ls $SANDBOX/workspace/
  5. Step 7 round-trip tagged $RUN_TAG, and deleted what it created

Everything above lives under $SANDBOX and dies with it.
EOF
