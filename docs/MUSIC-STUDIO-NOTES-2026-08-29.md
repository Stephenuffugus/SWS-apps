# Music Studio, brought across from the arcade, 2026-08-29

App 35. Live at `skywolfstudio.com/music-studio/`, no badge.

A step sequencer that runs in a browser tab: drums, bass, melody, chords, a
circle-of-fifths helper, euclidean rhythms, WAV and video export, and songs kept
on the device. One 228KB file, no build step, no server, no account.

## Where it came from, and what "as well" means

It already lives at `lucidwinds.com/studio.html`, where it has been shipped as
v2.2 for a while. Stephen asked for it here **as well**, not instead, so this is
deliberately a second copy rather than a move.

Before copying anything, the deployed file and the local one in
`/workspaces/lucid-winds` were compared: byte for byte identical, 228,043 bytes,
both v2.2. No drift to reconcile, which is the check that was skipped once
before and cost a day.

**Two live copies of one app will drift, and this is the second time.** Hush was
moved home on 2026-08-20 and `lucidwinds.com/hush` has been a stale mirror ever
since. The difference here is that the drift has already started, because three
things had to change for this copy to be honest (below). Whichever copy stops
being edited is the one that rots, and right now that is likely the arcade one,
since deploys to it cannot be made from this codespace's normal workflow.

The honest options, for a decision later: make this the canonical copy and
redirect `studio.html` on the arcade, or accept a knowing mirror and write the
divergences down. This file is the second half of that second option.

## What was changed, and nothing else

The app's code is untouched. Only the head, the tail, and three specific lines
differ from the arcade copy.

**Branding.** The title dropped "Lucid Winds", the byline under the logo says
"by Sky Wolf Studio", and the footer's "Back to Lucid Winds" became the fleet's
own footer: a link to the hub, a Feedback address, a hidden tip jar seam, an
install button and a build tag.

**The PadLab button now leaves the site on purpose.** It pointed at `/padlab/`,
which does not exist here. PadLab is an arcade app and is staying there, so the
button is an explicit external link to `lucidwinds.com/padlab/` with
`target="_blank"` and `rel="noopener"`, rather than being quietly deleted: it is
a real companion to this app and the two were built together. A browser test
asserts that it is the only link off to the arcade and that nothing in the
visible text tells a visitor they are on the arcade.

**The export watermark named the wrong site.** `drawShow()` burns
`made in Music Studio · lucidwinds.com` into the artwork the player exports and
shares. That is correct on the arcade and wrong here, and it matters more than
the other two put together, because a shared export is the one piece of this app
that travels on its own. It now says `skywolfstudio.com`. The browser test
caught this rather than a human noticing it.

## One real fix, which should go back to the arcade

`design/guards.mjs` failed the app on a tap target: every range slider was a
6px-tall element. The fix is one property, `height:28px` on the base
`input[type=range]` rule. The track is still drawn 6px and the thumb is
unchanged, so it renders exactly as before; what changes is that the thing you
have to hit with a thumb on a phone is 28px instead of 6.

What gave it away is that two rules further down, `.gs-bpm` and `.gs-euclid`,
had already set `height:28px` individually. The sliders somebody had actually
used on a phone had been fixed one at a time, and the rest never were.

**This one is not SWS-specific and the arcade copy still has the 6px sliders.**
The watermark change must NOT be backported; this one should be.

## What is tested

`test/smoke.browser.mjs`. The music itself is deliberately not under test: it
works, it has been shipped, and re-deriving a sequencer's behaviour here would
be theatre. What is tested is that porting it did not break it, plus every line
the port changed.

Three of those tests were wrong before they were right, and each was the test's
fault rather than the app's, which is worth recording because all three are the
same mistake in different clothes:

- **The audio check reached for `GS.ac`, which does not exist.** The context is
  closure-scoped. Rather than assert on a property that is always `null` and
  call the app broken, the test now wraps `AudioContext` before the page loads
  and asserts the studio really opens audio hardware and reaches `running`.
- **The autosave check waited 1.2 seconds.** The app's autosave is a 4-second
  tick that only fires when the state is dirty, so the test reported the app as
  losing a player's work when it was the test that had not waited. It now edits
  through the real grid cells and waits out the app's own tick.
- **The arcade-reference check counted raw source text.** A comment in the file
  explaining why the arcade domain was replaced contains that domain, so the
  note about the fix read as the fix being absent. It asks the DOM now.

That is three for three: every "the app is broken" from a new test in this port
was the test. Worth remembering next time one fires.

## Still needed from Stephen

- `marketing/stripe-thumbnail.png` at 1254x1254. He asked for a different
  thumbnail from the arcade's and that is the right call: the arcade's
  `portal-assets/music-thumb.png` is art for the **soundtrack player**, not for
  this app. Until then the hub falls back to `icon.svg`, and the icons in this
  folder are placeholders I drew from its own sequencer grid.
- A Stripe link for `TIP_URL`. This app and Beacon are the two newest without
  one.
- A decision on the two copies, per the top of this file.
- Whether to backport the slider fix to the arcade. The repo is at
  `/workspaces/lucid-winds` and its remote is reachable from here, but nothing
  was pushed to it: he asked for the app to come across, not for the arcade to
  be edited.
