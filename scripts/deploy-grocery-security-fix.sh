#!/usr/bin/env bash
# Deploy the 2026-08-21 shared-link security fix.
#
# RUN THIS WITH:  ! bash scripts/deploy-grocery-security-fix.sh
#
# WHY IT IS ONE SCRIPT AND NOT TWO STEPS
# --------------------------------------
# The client and the rules now depend on each other on purpose. Adding an item
# writes the row and the counter together, and each half names the other so a
# link-holder can no longer pump the counter without adding anything (past 500
# that bricked the list for everyone). That means:
#
#   old app + new rules  = adds refused
#   new app + old rules  = adds refused
#
# So hosting and rules go out together, back to back, and anyone with the app
# already open reloads once afterwards. Four apps share these rules, so all four
# clients ship in the same hosting deploy.
#
# AFTER IT FINISHES: open the grocery list on your phone and your partner's,
# pull to refresh (or close and reopen), then add one item on each. If an item
# adds and shows up on the other phone, the migration is done. If an add fails,
# the phone is still on the old cached copy: fully close the app and reopen.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/2  hosting (new client for grocery-list, signup-sheets, caregiver-log, team-parent)"
npx firebase deploy --only hosting --project sws-apps-9646d

echo
echo "==> 2/2  firestore rules (the coupled counter, grocery-only done, locked deletes, orphan reads)"
# The rules deploy runs from apps/signup-sheets, which is where the firebase
# config that knows about firestore lives. The repo root config only has hosting.
cd apps/signup-sheets
npx firebase deploy --only firestore:rules --project sws-apps-9646d
cd ../..

echo
echo "Done. Now reload the app on every phone that had it open, then add one item to check."
