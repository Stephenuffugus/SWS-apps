#!/usr/bin/env bash
# Commit and push new review/research findings every few minutes.
#
# Scoped to design/findings/ with an explicit pathspec, so it commits ONLY
# those files even when other work is staged or half-edited elsewhere. A long
# agent run should never be able to lose hours of findings to an interrupted
# session, and the findings are pure artifacts — nothing here can break a build.
cd /workspaces/SWS-apps || exit 1
while true; do
  if [ -n "$(git status --porcelain design/findings/)" ]; then
    git add design/findings/ 2>/dev/null
    n=$(ls design/findings/*.review.json 2>/dev/null | wc -l)
    git commit -q -m "Findings autosave — ${n}/23 app reviews on disk" -- design/findings/ 2>/dev/null \
      && echo "saved ${n}/23 reviews" \
      && (git push -q origin main 2>/dev/null && echo "pushed" || echo "commit ok, push deferred")
  fi
  sleep 180
done
