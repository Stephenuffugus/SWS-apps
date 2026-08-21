#!/usr/bin/env bash
# Deploy everything from 2026-08-21.
#
# RUN THIS WITH:  ! bash scripts/deploy-2026-08-21.sh
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
#
# AFTER IT FINISHES
# -----------------
#   1. Open the grocery list on your phone and your partner's, close it fully
#      and reopen (not just background it), then add one item on each. If the
#      item appears on the other phone, the migration landed. If an add fails,
#      that phone is still on the old cached copy: force it closed and reopen.
#   2. Open any app, tap the display settings icon, and step the text size all
#      the way up. The title and the X must stay put the whole time. That is
#      the bug you reported, and this is the twenty second check for it.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/2  hosting (all apps)"
npx firebase deploy --only hosting --project sws-apps-9646d

echo
echo "==> 2/2  firestore rules"
# Run from apps/signup-sheets: that is where the firebase config that knows
# about firestore lives. The repo root config only declares hosting.
cd apps/signup-sheets
npx firebase deploy --only firestore:rules --project sws-apps-9646d
cd ../..

echo
echo "Done. Now do the two checks above."
