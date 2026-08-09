#!/usr/bin/env bash
# Checkpoint long agent runs so an interrupted session cannot lose hours.
#
# Two separate commits, on purpose:
#
#   design/findings/  — pure artifacts. Research, focus groups, stress results,
#                       fix lists. Nothing here can break a build, so it is
#                       always safe to commit and push.
#   apps/             — real code being written by implementation agents. These
#                       are checkpoints, explicitly labelled as such, and may
#                       catch a file mid-edit. That is the trade: a messy
#                       intermediate commit is recoverable, four hours of lost
#                       agent work is not. The regression suite runs over
#                       everything before the final commit either way.
#
# Both use an explicit pathspec, so a commit here can never sweep in unrelated
# work that happens to be staged.
#
# Push is safe: there are no GitHub Actions in this repo and Firebase deploys
# are manual, so nothing downstream reacts to a checkpoint.
cd /workspaces/SWS-apps || exit 1

push_quietly() {
  git push -q origin main 2>/dev/null && echo "  pushed" || echo "  commit ok, push deferred"
}

while true; do
  if [ -n "$(git status --porcelain design/findings/)" ]; then
    git add design/findings/ 2>/dev/null
    n=$(ls design/findings/*.review.json 2>/dev/null | wc -l)
    if git commit -q -m "Findings autosave — ${n}/23 app reviews on disk" -- design/findings/ 2>/dev/null; then
      echo "saved findings (${n}/23 reviews)"
      push_quietly
    fi
  fi

  if [ -n "$(git status --porcelain apps/)" ]; then
    touched=$(git status --porcelain apps/ | awk -F/ '{print $2}' | sort -u | tr '\n' ' ')
    git add apps/ 2>/dev/null
    if git commit -q -m "WIP checkpoint — implementation in progress: ${touched}" -- apps/ 2>/dev/null; then
      echo "checkpointed apps: ${touched}"
      push_quietly
    fi
  fi

  sleep 240
done
