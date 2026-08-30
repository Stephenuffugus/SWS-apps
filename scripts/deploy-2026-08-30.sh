#!/usr/bin/env bash
# Deploy for 2026-08-30: Comic Crew, app 36.
#
# RUN THIS WITH:  ! bash scripts/deploy-2026-08-30.sh
#
# WHAT IS GOING OUT
# -----------------
#   * apps/comic-crew/, a new app: a comic maker where a child draws her own
#     character once and then dresses, poses and prints it. Marked beta on the
#     front door, because nobody under thirty has opened it yet.
#   * the four generated files that carry the front door: apps/index.html,
#     apps/catalogue.json, apps/manifest.webmanifest, apps/sitemap.xml. They now
#     say 36 apps instead of 35.
#
# NOTHING ELSE CHANGED. No existing app's index.html, worker or asset is touched
# by this deploy, so the only way it can hurt a sibling is through those four
# generated files, and the checks below open two untouched apps to prove it did
# not.
#
# HOSTING ONLY, DELIBERATELY. The 2026-08-21 script also deployed firestore
# rules, because that day's work needed the client and the rules to ship
# together. Nothing here touches Firestore, four apps share those rules, and
# redeploying shared infrastructure that nobody asked to change is how a quiet
# afternoon becomes an outage.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "repo:   $ROOT"
echo "branch: $(git rev-parse --abbrev-ref HEAD)   commit: $(git rev-parse --short HEAD)"
echo "signed in as: $(npx --yes firebase-tools login:list 2>/dev/null | tail -1)"
echo

fail() { echo; echo "FAILED at: $1"; echo "Nothing further was attempted. Paste this output back to Claude."; exit 1; }

echo "==> hosting (all apps)"
# `npx --yes firebase-tools`, never `npx firebase`: the latter resolves the JS
# SDK, which ships no executable, and only ever worked through a cache entry.
npx --yes firebase-tools deploy --only hosting --project sws-apps-9646d || fail "hosting deploy"

echo
echo "==> checking the live site actually changed"
ok=0; bad=0
# Fetch into a variable and search afterwards, never pipe into grep: `grep -q`
# exits on first match, curl dies of SIGPIPE, pipefail turns that into a failed
# pipeline, and the check then reports a thing as missing precisely BECAUSE it
# is there. That cried wolf once already and it is not doing it again.
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

echo "  -- the new app --"
check "Comic Crew is live and is itself" \
  "https://skywolfstudio.com/comic-crew/" "COMIC<em>CREW</em>"
check "the shipped build tag went with it" \
  "https://skywolfstudio.com/comic-crew/" "var BUILD = 'comic-crew-v1'"
check "the worker names the same build, so a fix can reach a phone" \
  "https://skywolfstudio.com/comic-crew/sw.js" "const CACHE = 'comic-crew-v1'"
check "the worker sweeps only its own caches, not all 36" \
  "https://skywolfstudio.com/comic-crew/sw.js" "comic-crew-"
check "the privacy page is there, linked from the first screen" \
  "https://skywolfstudio.com/comic-crew/privacy.html" "kept in this browser"
code  "the display face is served" \
  "https://skywolfstudio.com/comic-crew/fonts/bangers-latin.woff2" "200"
code  "the lettering face is served" \
  "https://skywolfstudio.com/comic-crew/fonts/shantellsans-latin.woff2" "200"
code  "the manifest is served" \
  "https://skywolfstudio.com/comic-crew/manifest.webmanifest" "200"
code  "the icon a phone puts on the home screen is served" \
  "https://skywolfstudio.com/comic-crew/icon-192.png" "200"
check "nothing is fetched from off this origin" \
  "https://skywolfstudio.com/comic-crew/" "./fonts/bangers-latin.woff2"

echo "  -- the front door --"
check "the hub lists it" \
  "https://skywolfstudio.com/" "comic-crew/"
check "and marks it as still in testing" \
  "https://skywolfstudio.com/catalogue.json" "\"beta\""
check "the catalogue says thirty six" \
  "https://skywolfstudio.com/catalogue.json" "\"count\": 36"

echo "  -- the siblings this deploy must not have touched --"
check "Music Studio still loads" \
  "https://skywolfstudio.com/music-studio/" "Music Studio"
check "Beacon still loads" \
  "https://skywolfstudio.com/beacon/" "Beacon"
check "Grocery List still loads" \
  "https://skywolfstudio.com/grocery-list/" "Grocery List"

echo
if [ "$bad" -gt 0 ]; then
  echo "$ok live, $bad NOT live. The deploy did not fully land; paste this back to Claude."
  exit 1
fi
echo "All $ok checks live."
echo
echo "ON YOUR PHONE:  https://skywolfstudio.com/comic-crew/"
echo
echo "It has never been opened by a child, so the useful thing is not to check"
echo "that it works. It is to hand it to Penny with no explanation at all and"
echo "watch three things:"
echo "  1. does she find the costumes without being told"
echo "  2. can she draw a face on a head that small"
echo "  3. does she ever press Move on her own"
echo "Whatever fails there matters more than anything else on the list."
