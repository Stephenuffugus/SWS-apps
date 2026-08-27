# Fretwork test notes, 2026-08-27, the complete chronological list

Stephen came back from testing v5 in love with the Charts room ("I'm loving this
feature", "I am really loving using this") and handed down the v6 batch, plus
the Stripe link the tip jar was waiting for. Every item he said, in the order he
said it. Status marks what shipped in v6 this session.

Legend: SHIPPED v6 = live this session. PARTIAL = a first cut shipped, more to
do. WAITING = blocked on Stephen.

1. **People need to change their perspective.** Someone locks the phone, puts the
   screen down flat, and wants the strings reversed. A left handed player just
   wants it mirrored. Never assume a right handed guitarist. SHIPPED v6: the
   Setup chip is now "reverse the strings" with both uses named, and a matching
   strings chip lives right on the Play deck. One state, every board follows:
   drills, scales, play, charts, the chord builder.

2. **A suggestion thing when people make chords: analyze what they built.**
   SHIPPED v6: the chord brain. As notes land in the builder it offers up to
   three honest names (Am7, C6/E, Cmaj7/B), computed by giving every played
   pitch a turn as the root against the everyday recipes. A missing 5th is
   forgiven because guitars drop it constantly, a bass that is not the root
   earns its slash, and a dim7 lists its other names, which is the same lesson
   the ladder teaches. Tap an offer to use it as the name, or ignore it: the
   name stays the player's. An unnamed chord saves under its best guess.

3. **Favorite chords saved, reusable in other songs.** SHIPPED v6: My chords.
   A keep button in the builder stores any chord in a library that lives
   outside every chart, and the add flow offers the library first.

4. **You should be able to move the chord.** SHIPPED v6: nudge buttons in the
   builder slide the whole shape a fret at a time. Open strings ride up to
   fret 1 like a real transposition; a shape with an open string cannot slide
   down because there is nowhere below open. Reordering inside the chart
   already existed in v5.

5. **A pre-made bank of the most popular chords, and people discover and save
   their own as they grow.** SHIPPED v6: the bank, 31 shapes, the open chords
   everyone meets first plus the barre seeds (F, B, Bm, F♯m), sevenths, maj7s,
   m7s, sus and add9 colors. One tap hears it and drops it in. The copy teaches
   the quiet truth: every barre chord is a bank shape slid up the neck, one
   nudge at a time. Non standard tunings get an honest note that the bank
   speaks standard.

6. **Make and explore ideas on the road, with no guitar around: pull up the
   fretboard while a chart plays and tap around for harmonies.** SHIPPED v6:
   the jam board, a chip in the chart editor that unfolds a playable neck
   under the progression. It holds, slides, and replucks like the Play board,
   speaks the chart's voice, and keeps working while the chart loops.

7. **Plug other instruments in and have it read them, like the MPK Mini into
   the phone.** SHIPPED v6: the midi chip on the Play deck. Web MIDI, so it
   works in Chrome and Edge, and says so honestly everywhere else. Notes from
   the keyboard play through whichever voice is selected, light their spot on
   the board when it is in view, and land in the looper like fingers do.

8. **Other sounds: the guitar we have is "very bright, is a nice way of putting
   it". Change the tone of what is played back and what is actively played.**
   SHIPPED v6: two new voices. Nylon is the steel string rounded off, and Keys
   is not a string at all, a sine with dying partials rendered by hand. Both
   live in the Play voice picker, and every chart now has its own Sound picker
   (Warm, Nylon, Steel, Keys) that colors playback, the builder, and the jam
   board together.

9. **Users select how many beats each chord is held for.** SHIPPED v6: every
   chord can carry its own beat count, 1 through 12, set in the builder. The
   chart's "beats a chord" stays the default; a chord that speaks up wears its
   count on its face in the strip.

10. **Independent, simple metronome: a couple of sounds for taste, odd time
    signatures, change time signatures whenever, totally programmable in
    blocks, and a new block keeps the settings of the one before unless you
    change it while making the chord.** SHIPPED v6: the chart player is the
    programmable metronome. Each chord is a block carrying its own beats and
    its own tempo, inherited from the previous block on creation, changeable
    in the builder. Count sounds: soft click, wood, beep, or off. A 5 beat bar
    or a tempo change mid song is just a chord that speaks up.

11. **A few more scales, especially the Messiaen.** SHIPPED v6: a new shelf,
    Messiaen and the symmetric scales. Whole tone (his mode 1), Diminished
    half whole and whole half (his mode 2 both ways), Messiaen mode 3, and the
    augmented scale. Each one renders in every form like the rest.

12. **On the scale boards it should not say flat 3, flat 7. Say minor 3rd,
    minor 7th, TT for tritone, so people see the intervals stacking against
    the root. Same in the descriptions: Aeolian has a minor 6th, not a flat
    6. And for the Messiaen scales, show that two notes can be thought of as
    the same interval, which is where the variable tension comes from.**
    SHIPPED v6: every scale dot now wears quality first labels (1, m2, 2, m3,
    3, 4, TT, 5, m6, 6, m7, 7, and A5 on the whole tone), every scale line and
    description was rewritten in interval words, the picker says "Dorian:
    minor, major 6th", and the symmetric scale descriptions teach the double
    hearing in his words: one pitch, two jobs, and the tension lives in
    leaning on one hearing or the other. Chord drills keep chord chart
    language (R, 3, 5, 7) on purpose: those match the names on real charts.

13. **The payment link for the tip jar.** SHIPPED v6: TIP_URL carries the
    Stripe link, the heart is in the footer.

14. **A feedback button that pings straight to a Discord, so bugs arrive the
    moment people find them.** SHIPPED v6: Stephen handed over the webhook the
    same day and it is wired into FEEDBACK_WEBHOOK. The footer Feedback link
    opens an in app box that posts straight to his Discord channel with the
    build tag and device line attached, asks Discord to hand back the created
    message so a sent report is provably sent, and falls back to email if the
    post fails. Verified end to end by driving the real dialog in a real
    browser: the test messages are sitting in the channel. One caution to
    remember: anyone who reads the page source can find the webhook URL and
    post spam to that channel. If that ever happens, delete the webhook in
    Discord, make a fresh one, and swap the constant.

## Waiting on Stephen

- The Suno backing track library, carried from the v5 list.
- Sprites for the celebration animation, carried, if we want to get crazy.

## Roadmap queue, carried and updated

1. Sheet music notation in and out of the fretboard, needs design first.
2. CAGED chord map for beginners.
3. More polyrhythms past 4 over 3.
4. Pattern player on the scale board.
5. Improvisation lessons layer: target notes, groupings, modes within modes.
6. Layered pentatonic teaching path.
7. Suggested fingerings on chord shapes.
8. Google Play packaging: Stephen wants Fretwork to be the first app in the
   store, because the music is his and the app earned it.
