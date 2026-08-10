#!/usr/bin/env bash
# Checkpoint long agent runs so an interrupted session cannot lose hours.
#
# Two separate commits, on purpose:
#
#   design/findings/  — pure artifacts. Research, focus groups, stress results,
#                       fix lists. Nothing here can break a build, so it is
#                       always safe to commit and push.
#   apps/             — real code being written by implementation agents. These
#                       are checkpoints, explicitly labelled, and may catch a
#                       file mid-edit. That is the trade: a messy intermediate
#                       commit is recoverable, four hours of lost agent work is
#                       not. The regression suite runs over everything before
#                       the final commit either way.
#
# Both use an explicit pathspec, so a commit here can never sweep in unrelated
# work that happens to be staged.
#
# QUIET BY DESIGN. It commits on every cycle but only PRINTS when something
# genuinely new happened — a review landed, or an app was touched that had not
# been touched before. Each printed line becomes a notification, and a stream
# of "checkpointed the same two apps again" costs attention while adding no
# safety.
#
# Push is safe: no GitHub Actions in this repo and Firebase deploys are manual,
# so nothing downstream reacts to a checkpoint.
cd /workspaces/SWS-apps || exit 1

last_reviews=-1
seen_apps=" "

while true; do
  if [ -n "$(git status --porcelain design/findings/)" ]; then
    git add design/findings/ 2>/dev/null
    n=$(ls design/findings/*.review.json 2>/dev/null | wc -l | tr -d ' ')
    if git commit -q -m "Findings autosave — ${n}/23 app reviews on disk" -- design/findings/ 2>/dev/null; then
      git push -q origin main 2>/dev/null
      # Only announce a change in the count, not every save.
      if [ "$n" != "$last_reviews" ]; then
        echo "reviews: ${n}/23"
        last_reviews="$n"
      fi
    fi
  fi

  if [ -n "$(git status --porcelain apps/)" ]; then
    touched=$(git status --porcelain apps/ | awk -F/ '{print $2}' | sort -u | tr '\n' ' ')
    git add apps/ 2>/dev/null
    if git commit -q -m "WIP checkpoint — implementation in progress: ${touched}" -- apps/ 2>/dev/null; then
      git push -q origin main 2>/dev/null
      # Announce only apps not previously reported.
      fresh=""
      for a in $touched; do
        case "$seen_apps" in
          *" $a "*) ;;
          *) fresh="$fresh $a"; seen_apps="$seen_apps$a " ;;
        esac
      done
      [ -n "$fresh" ] && echo "implemented:${fresh}"
    fi
  fi

  sleep 300
done
