# Fretwork test notes, 2026-08-26, the complete chronological list

Stephen came back from testing v4 with a full braindump. Every item he said, in the
order he said it, so nothing gets lost, forgotten, or truncated. Status marks what
shipped in v5 this session; everything else is on the roadmap with his reasoning
kept intact.

Legend: SHIPPED v5 = live this session. PARTIAL = a first cut shipped, more to do.
ROADMAP = designed and queued, not built yet. WAITING = blocked on Stephen.

1. **Sheet music in and out of the guitar.** A way to input or notate sheet music and
   see it played on the fretboard, hear it and see it at the same time. Even notate ON
   the guitar and watch it play back. Transcribe and simplify. He knows the idea is
   fuzzy ("I don't know how to make this good... but I feel like there's something
   there") and that a lot of people could use it. ROADMAP: needs a design conversation
   before code. The looper (item 3) is the first stepping stone.

2. **Make the Play instrument easier to actually play.** PARTIAL:
   - Loops: record what you play and loop it. SHIPPED v5 (record, play, clear).
   - Change the instrumentation, like an electric guitar, different sounds.
     SHIPPED v5: five voices (steel, warm, bass, drive, mute).
   - Zoom in on chunks of the neck for fast or percussive parts, funky bass lines,
     lots of tapping; optimized and comfortable for people building stuff.
     SHIPPED v5: from fret and to fret pickers, small windows draw big cells.
   - Full screen when you play, with a button to go in and out, because there is no
     reason it should be smaller than it has to be. SHIPPED v5.

3. **Free empty chord charts.** People make their own chord charts, call the chords
   whatever they want, organize them in any order, and hear them played in that order
   in whatever meter they choose, to test progressions. SHIPPED v5: the Charts tab.
   Backing tracks are deliberately NOT in yet: he wants a high quality library made
   with Suno first. WAITING on Stephen's library.

4. **CAGED for beginners.** Not teaching CAGED as the system here, but the shapes are
   good for beginners, and physically playing guitar is unergonomic and brain-splitting
   (patting your head and rubbing your belly, one hand picking while the other frets,
   perfectly in sync, completely different jobs). ROADMAP: a CAGED chord map module.

5. **Rhythm training, his actual teaching sequence.** SHIPPED v5 as The Rhythm Room:
   - 3 over 2 taught by the phrase first: "together, right, left, right". The student
     creates the polyrhythm before they can hear it as one.
   - Then two different notes on screen so they finally HEAR it.
   - Then count one hand out loud (1 2 3 with the right, then 1 2 with the left) while
     both hands keep going. Separating the brain is the hard part.
   - Then 4 over 3 with "pass the gosh dang butter", which lines up perfectly.
   - More polyrhythms beyond that later. This applies to every instrument, and almost
     nobody teaches it in a guitar app. ROADMAP for the further patterns.

6. **Compile all notes into one chronological list so nothing is lost.** This file.

7. **Kill the Stats page.** Tapping a screen is not a real fretboard, so the mistake
   heatmap just shows people dumb mistakes from days ago that they cannot prevent, and
   leaves them feeling put down. Simply Piano has the listen-and-grade field covered.
   Streamline the UI instead. SHIPPED v5: Stats tab, heatmap, and weak spots removed.

8. **Celebrate completion.** Big celebratory CSS animation, music notes and happiness,
   when people complete challenging stuff. Sprites from Stephen later if we want to get
   crazy. The tap-every-C hunt was great but ended on a blank screen: no celebration,
   no end, no "do another?", no "want something harder?". SHIPPED v5: note burst
   celebration plus Go Harder and New Note offers at the end of a hunt, celebrations
   on clean runs and completed climbs and ladders. Sprites WAITING on Stephen.

9. **Modes taught in a window, not a wall.** A whole fretboard of dots teaches no
   context. Give them a chunk, four or five frets tall, about two octaves, with a
   chord vamping behind it. Show where the notes are, then take the map away so they
   test themselves. SHIPPED v5: One Position form is now the default, with a Hide The
   Map chip.

10. **Stacked positions, color coded.** When positions stack on the neck, each
    position gets its own color (G A B on the E string, then C D E on the A string,
    etc., all one color; the next position another color) so players can see the seams
    where they can slide between positions. That concept is an evolution point for a
    lot of players. SHIPPED v5: the Stacked form, seven positions, seven colors, and
    notes shared by two positions wear both (fill plus ring).

11. **Three notes per string should not be stuck rooting on the A string.** Offer the
    form rooted on the 6th string and the 5th string. And never make people think they
    must learn C Dorian and G Dorian separately: you learn Dorian once and it applies
    anywhere. SHIPPED v5: a Start picker (auto, 6th, 5th) and the movable-shape line
    in the copy.

12. **Melodic patterns on the scale map.** Up a third, down a step, and the hundreds of
    great-sounding common patterns that become easy once you think the pattern.
    ROADMAP: a pattern player on the scale board.

13. **Improvisation thinking.** Groupings and target notes: odd groupings (threes)
    start off the target, even groupings can start on it. Later, modes within modes:
    Phrygian into Phrygian dominant, Lydian dominant, melodic minor up and down, the
    bebop context of where and how. ROADMAP: an advanced lessons layer.

14. **Take the testing tag off.** The app looks well done, so drop the In Testing
    label. SHIPPED v5: hub card tag removed.

15. **The thumbnail should show when texting the link.** SHIPPED v5: og:image and
    twitter card tags with the real art.

16. **More scales than the seven modes.** Pentatonics (taught as a seven note scale
    minus two, and which two), unique and foreign variations, Japanese scales, Middle
    Eastern scales. Two notes per string for pentatonic forms. His own approach: root
    yourself in where minor pentatonic lives, then layer the variations (Dorian sharp
    6, harmonic minor over the 5 chord because the dominant chord hands you that sharp
    7 naturally). Teach how to move between them safely. The hard part is keeping it
    short and direct without overwhelming. PARTIAL: v5 ships pentatonic major and
    minor, blues, harmonic minor, melodic minor, Phrygian dominant, Lydian dominant,
    Hirajoshi, In sen, and double harmonic, each with a one line recipe and a vamp.
    The layered teaching (pentatonic first, variations on top) is ROADMAP.

17. **Add to home screen button, and the tip jar.** SHIPPED v5: install button plus
    iOS instructions, manifest, service worker, offline. Tip jar seam is wired and
    WAITING on Stephen's Stripe payment link (TIP_URL at the top of index.html).

18. **The chord drills teach nothing and "drop 2" has to go.** He hates the jargon.
    Give people a choice of how much help: walk them through it completely (tap the
    shown chord, hear it), then give them all but one note, then all but two, then
    just the name, hardest last. Maybe fingerings someday. This is the difference
    between fun and the app kicking their ass and making them hate guitar. We are
    spoon feeding his entire college education in a small free app. SHIPPED v5: a
    help picker on triads, sevenths, the climb and the ladder, defaulting to Walk Me
    Through It; the words "drop 2" removed from every drill; fingerings ROADMAP.

19. **Start seventh chords where he starts teaching them: root on the low E, skip the
    A string.** A minor 7 is 5th fret low E, mute the A, bar the D G and B strings at
    the 5th. That shape is home base, then invert: the root climbs to the 3rd, the 7th
    to the root, and so on. Slow it down, fade things in and out, talk them through it,
    let them pause and move at their own pace. SHIPPED v5: strings 6 4 3 2 is now the
    first and default string set on sevenths, the climb and the ladder, computed
    honestly from interval math, with the walk-through help level narrating.

20. **The vamp sound is horrible.** Harsh strummed quarter notes; needs a softer tone
    that sustains four or eight beats so you hear how the mode resonates over a held
    chord. SHIPPED v5: soft sustained pad, slow roll, gentle lowpass, four beat cycle.

21. **Numbers over note names while learning scales.** Do not make anyone compute
    "this A sharp is my sharp 6". Colored circles with numbers on every scale note,
    root and altered tone in different colors so Dorian visibly IS minor with a sharp
    6. SHIPPED v5: every scale note wears its degree number, root and character tones
    in distinct colors, the numbers chip still switches to letters for whoever wants
    them back.

## Waiting on Stephen

- Stripe payment link for the Fretwork tip jar (drop into TIP_URL in index.html and
  bump the sw.js cache version).
- The Suno backing track library, when it is ready.
- Sprites for the celebration animation, if we want to get crazy.

## Roadmap queue, in his priority order as spoken

1. Sheet music notation in and out of the fretboard (item 1), needs design first.
2. CAGED chord map for beginners (item 4).
3. More polyrhythms past 4 over 3 (item 5).
4. Pattern player on the scale board (item 12).
5. Improvisation lessons layer: target notes, groupings, modes within modes (item 13).
6. Layered pentatonic teaching path (item 16).
7. Suggested fingerings on chord shapes (item 18).
