#!/usr/bin/env bash
# Deploy everything from 2026-08-21.
#
# RUN THIS WITH:  ! bash scripts/deploy-2026-08-21.sh
#
# It prints a clear PASS or FAIL at the end and checks the live site itself, so
# a deploy that did not happen cannot look like one that did. An earlier run of
# this script left no trace on the live site and no output here, which is why
# it now reports every step.
#
# WHY HOSTING AND RULES GO TOGETHER, IN THAT ORDER
# ------------------------------------------------
# Adding an item to a shared list now writes the row and the counter together,
# and each half names the other so a link-holder can no longer pump the counter
# without adding anything (past 500 that bricked the list for everyone). The
# client and the rules therefore depend on each other:
#
#   old app + new rules  = adds refused
#   new app + old rules  = adds refused
#
# So they ship back to back and anyone with a list already open reloads once.
# Four apps share those rules, so all four clients ride in the same hosting
# deploy: grocery-list, signup-sheets, caregiver-log, team-parent.
#
# WHAT ELSE IS IN THIS DEPLOY
# ---------------------------
#   * the comfort panel stops scrolling itself out of its own box, in all 24
#     apps that carry it (the bug Stephen reported from his phone)
#   * three apps stop deleting every sibling app's offline cache on activation
#   * Overload: a crafted backup file can no longer put live markup on the page
#   * Cross Off: the midnight page-flip, a visible storage failure, and backup
#   * privacy pages across the fleet stop claiming things that are not true
#   * every app gets its own ornament, and the wedding turns white and gold

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "repo: $ROOT"
echo "signed in as: $(npx firebase login:list 2>/dev/null | tail -1)"
echo

fail() { echo; echo "FAILED at: $1"; echo "Nothing further was attempted. Paste this output back to Claude."; exit 1; }

echo "==> 1/2  hosting (all apps)"
npx firebase deploy --only hosting --project sws-apps-9646d || fail "hosting deploy"

echo
echo "==> 2/2  firestore rules"
# The repo root config declares hosting only; the firestore config lives here.
cd "$ROOT/apps/signup-sheets" || fail "cd to apps/signup-sheets"
npx firebase deploy --only firestore:rules --project sws-apps-9646d || fail "rules deploy"
cd "$ROOT"

echo
echo "==> checking the live site actually changed"
ok=0; bad=0
check() { # name, url, pattern
  if curl -s --max-time 30 "$2" | grep -q -- "$3"; then
    echo "  PASS  $1"; ok=$((ok+1))
  else
    echo "  FAIL  $1  (still serving the old copy)"; bad=$((bad+1))
  fi
}
check "grocery client writes the coupled counter" \
  "https://skywolfstudio.com/grocery-list/data.js" "lastEntryId"
check "comfort panel fix is live" \
  "https://skywolfstudio.com/grocery-list/" "Load-bearing, and it looks like nothing"
check "cross off stops deleting sibling caches" \
  "https://skywolfstudio.com/cross-off/sw.js" "startsWith('cross-off-')"
check "overload coerces a hostile backup" \
  "https://skywolfstudio.com/overload/" "cleanId"
check "privacy page tells the truth about sign-in" \
  "https://skywolfstudio.com/grocery-list/privacy.html" "Only the person who starts a list signs in"

echo
if [ "$bad" -gt 0 ]; then
  echo "$ok live, $bad NOT live. The deploy did not fully land; paste this back to Claude."
  exit 1
fi
echo "All $ok checks live."
echo
echo "NOW DO THESE TWO THINGS ON YOUR PHONE:"
echo "  1. Fully close and reopen the grocery list on both phones (do not just"
echo "     background it), then add one item on each. If it shows up on the"
echo "     other phone, the migration landed."
echo "  2. Open any app, tap the display settings icon, and step the text size"
echo "     all the way up. The title and the X must stay put the whole time."
