# Fretboard Drill App, working name Fretwork

A guitar fretboard drill machine built by an actual guitar and theory teacher. Not a course, not a curriculum, not a subscription. One tool that does what Stephen already makes his students do by hand: where is every C, now every B, now every first inversion G major triad on the top three strings. The studio's usual posture: free, ad free, no account, works offline, tip jar.

The name Fretwork is a suggestion, not a decision. Fretwork is the word for ornamental openwork carving, which hands the fleet aesthetic directive its identity for free: an app about frets whose name is a decorative craft. Decorative border style writes itself. Check for name collisions before committing; as a PWA under skywolfstudio.com the app store namespace matters less, but do not wear a name a big incumbent owns.

## What is out there (researched 2026-08-26)

The market splits into three tiers, and there is a hole between them.

**Big subscription apps** (Yousician, Fender Play, Guitar Tricks): $10 to $20 a month, course shaped, gamified. Yousician gives one free lesson a day and wants $19.99/mo after. The loudest complaints everywhere: subscription fatigue, and mic based pitch detection that misfires and makes people distrust the app. These are courses. We are not competing with them, we are the tool they do not contain.

**Fretboard specific mobile apps:**
- **Fretonomy** (also listed as Fret Trainer) is the category leader: 4.8 stars, 30+ games, mic detection, multiple instruments. Freemium: roughly $3/mo, $25/yr, $100 lifetime, and the free tier only unlocks the first few frets. Documented complaints: navigation is confusing, fret numbers get hidden behind other graphics, and the grader is octave blind, any note with the right letter counts even in the wrong octave, which teaches the wrong thing.
- **Fret Pro / FretPro**: spaced repetition angle. Complaints center on audio recognition failing every 5th to 10th input and the app losing mic input until force closed.
- **JustinGuitar Note Trainer**: $4.99 one time, notes only, big brand attached.
- **LearnFret**: adaptive, drills what you miss. Good idea, worth stealing.

**Free web tools** (our actual competitive tier): StringKick's trainer is the best designed, four games (name the note, play it by mic, tap every instance, mental recall) in a learning path, but full levels sit behind a Game Pass, it is notes only, standard tuning only, frets 0 to 12. The triad niche lives on separate single purpose sites: guitartriadtrainer.com (CAGED triads, all inversions, string set selection), triads-guitar.com (recognition, recall, and a hands free flow mode), triads.app (drills triads inside a key so I, ii, iii, IV, V, vi, vii° connect). Douglas Niedt has 32 browser trainers including staff reading. Nobody has all of it in one place.

## The hole we fill

1. **Nothing free covers the whole ladder.** Note names, then intervals, then triads with inversions, then seventh chords with inversions, in one tool with one progression, is not a thing that exists without a paywall. The sites that drill triads do not drill notes. The apps that drill notes stop at notes.
2. **Tap first kills the number one complaint.** Mic pitch detection is the most complained about feature in this entire category. We do not build it in v1. Tapping the fretboard works silently on a couch, in a classroom, on a bus, with no guitar in hand. That is a feature, not a compromise. Tap can play the note back through Web Audio synthesis (no audio assets) so your ear learns alongside your fingers.
3. **The free tier is the whole app.** Fretonomy gates frets behind payment. StringKick gates levels. Our entire neck is free forever, which is just the studio's normal posture pointed at a market that has forgotten it is possible.
4. **A teacher designed the progression.** Every competitor is a developer's guess at pedagogy. Stephen has years of adapted and invented teaching tools from real students. That is the moat, and it is unfakeable.
5. **Left handed flip and alternate tunings from day one.** Known complaint, chronically neglected, and nearly free for us because the fretboard is data driven: a tuning array plus fret count generates the note grid, so drop D or DADGAD or a lefty mirror is configuration, not a feature.

## The drill engine

One fretboard, many drill types, all sharing the same interaction grammar so learning one mode teaches the UI for all of them.

- **Find All**: the prompt names a target, tap every instance on the neck. This is literally Stephen's current student exercise, where is every C. Targets scale up: a note, a note within a fret range, an interval from a shown root, every chord tone of a named chord.
- **Name It** (the reverse): a dot lights up, answer what it is. Note name, or interval from a marked root, or which chord tone it would be.
- **Shape drills**: given "G major, first inversion, strings 3-2-1", tap the three notes. Or the mirror: a shape lights up, name the chord and inversion. Same engine handles seventh chords with all four inversions and string set selection.
- **Progression as pedagogy, not paywall**: natural notes before accidentals, one string at a time, frets 0 to 5 before the whole neck, untimed before timed. The unlock ladder is teaching sequence, everything is skippable for players who walk in knowing things.
- **Adaptive misses**: what you get wrong comes back sooner. Steal LearnFret's idea, keep it simple, a per position miss counter is enough.
- **The heatmap**: local stats render your misses as a heat overlay on the neck, so you can see that your fretboard knowledge dies above fret 7 on the D string. Nobody else has this. It is also the shareable image that markets the app for free.
- **Octave aware where it matters**: an explicit toggle, because Fretonomy's octave blindness is a documented complaint and a real pedagogical error.

## Stephen's toolbox

This section is deliberately empty. The brief becomes real when Stephen braindumps the drills, sequences, and tricks he has invented across years of teaching, and we translate each into engine terms. Candidates he has already mentioned: the one note at a time full neck hunt. Everything else comes from him, not from me guessing.

## Architecture

Same fleet pattern as everything else: single page vanilla HTML/CSS/JS PWA in apps/, no build step, no backend, no account. The fretboard is one inline SVG generated from data (tuning array, fret count, handedness), which makes lefty mode, alternate tunings, and future instruments (bass, ukulele, mandolin) parameter changes. State and stats in localStorage. Web Audio API for tap playback, pure synthesis, zero audio files. Service worker for offline. Tip jar wired like the rest of the fleet.

## Do not build

Mic pitch detection (v1), accounts, cloud sync, a course, video, notation reading (later maybe, Niedt proves demand), song libraries, social features, streaks that guilt trip. Every incumbent that got bloated got bloated here.

## Monetization

Free, tip jar, same as the fleet. This one has a real long tail though: teachers assign tools they trust, and a teacher built free tool spreads through lessons. If any studio app eventually earns a voluntary paid tier, it is this one, but that is a later conversation and nothing in v1 should assume it.
