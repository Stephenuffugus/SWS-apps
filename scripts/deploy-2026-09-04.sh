#!/usr/bin/env bash
# Deploy for 2026-09-04: Bracket Maker live links, arrange mode, scores.
#
# ALREADY RUN by the session on 2026-09-04, both halves verified live.
# Kept so the checks can be re-run any time:  bash scripts/deploy-2026-09-04.sh check
#
# WHAT WENT OUT
# -------------
#   1. firestore:rules, FIRST, via the granted command from apps/signup-sheets:
#        npx firebase deploy --only firestore:rules --project sws-apps-9646d
#      One additive block, brackets/{id}: readable by any signed-in holder of
#      the id, writable and deletable only by its owner, owners may be
#      anonymous, payload capped at 8000 chars. 25 attack tests in
#      apps/signup-sheets/test/bracket-rules.test.mjs, and the 90 Engine-1
#      rules tests plus the 23 data tests still pass untouched.
#   2. hosting, the whole apps/ tree: the reworked bracket-maker (live links,
#      arrange matchups, per-game scores, honest privacy page, sw bracket-v35,
#      new live.js and firebase-config.js) and the four regenerated front-door
#      files whose only change is the bracket card's line and search keywords.
#
# The firebase binary resolves from apps/signup-sheets/node_modules; a symlink
# in the root node_modules/.bin lets the granted root-level hosting command
# find it. Re-make it after a wipe:
#   ln -sf ../../apps/signup-sheets/node_modules/.bin/firebase node_modules/.bin/firebase

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "${1:-}" != "check" ]; then
  echo "This deploy already ran on 2026-09-04. To re-deploy, run the two"
  echo "granted commands yourself; to re-verify the live site, pass 'check'."
  exit 0
fi

ok=0; bad=0
check() { # name, url, pattern
  local body try
  for try in 1 2 3; do
    body="$(curl -s --max-time 30 "$2" || true)"
    case "$body" in
      *"$3"*) echo "  PASS  $1"; ok=$((ok+1)); return ;;
    esac
    sleep 5
  done
  echo "  FAIL  $1  (not in the live copy after 3 tries)"; bad=$((bad+1))
}
code() { # name, url, expected status
  local got try
  for try in 1 2 3; do
    got="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$2" || true)"
    [ "$got" = "$3" ] && { echo "  PASS  $1  ($got)"; ok=$((ok+1)); return; }
    sleep 5
  done
  echo "  FAIL  $1  (got $got, wanted $3)"; bad=$((bad+1))
}

echo "  -- bracket maker --"
check "the live share button is there" \
  "https://skywolfstudio.com/bracket-maker/" 'id="liveBtn"'
check "arrange mode is there" \
  "https://skywolfstudio.com/bracket-maker/" 'id="arrangeBtn"'
check "the score dialog is there" \
  "https://skywolfstudio.com/bracket-maker/" 'id="scoreDlg"'
check "the trust copy tells the truth about Go live" \
  "https://skywolfstudio.com/bracket-maker/" 'Go live</b> is the one exception'
check "the worker names bracket-v35 so phones update" \
  "https://skywolfstudio.com/bracket-maker/sw.js" "bracket-v35"
code  "live.js is served" \
  "https://skywolfstudio.com/bracket-maker/live.js" "200"
code  "firebase-config.js is served" \
  "https://skywolfstudio.com/bracket-maker/firebase-config.js" "200"
check "the privacy page carries the Go live section" \
  "https://skywolfstudio.com/bracket-maker/privacy.html" "Go live, the one exception"

echo "  -- the front door --"
check "the hub card reads any matchup, live" \
  "https://skywolfstudio.com/" "Any matchup, settled properly, live"
check "the catalogue agrees" \
  "https://skywolfstudio.com/catalogue.json" "Any matchup, settled properly, live"
check "the catalogue still says thirty six" \
  "https://skywolfstudio.com/catalogue.json" '"count": 36'

echo "  -- siblings this deploy must not have touched --"
check "Grocery List still loads" \
  "https://skywolfstudio.com/grocery-list/" "Grocery List"
check "Comic Crew is still gated and live" \
  "https://skywolfstudio.com/comic-crew/" "if(!gateOpen())showGate();"
check "Diamond Rules still loads" \
  "https://skywolfstudio.com/diamond-rules/" "Diamond"

echo
if [ "$bad" -gt 0 ]; then
  echo "$ok live, $bad NOT live. Paste this output back to Claude."
  exit 1
fi
echo "All $ok checks live."
