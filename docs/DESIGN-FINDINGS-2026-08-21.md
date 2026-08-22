# What nine agents saw when they actually looked at the apps

Ten agents, 1.2 million tokens, 455 tool calls. Six read four apps each with real
screenshots in both themes at phone and desktop width; three then judged the
proposals for family resemblance, for whether they could actually ship, and for
the one question the Director left open about the seating chart. Nobody was
allowed to judge from source alone, and nobody was allowed to edit a file.

This is the record of what they found. What shipped the same night is marked.

## The mechanical root of "they all feel dull and the same"

**SHIPPED.** Asking for `paper: 'warm'` pinned the page hue to one constant for
every app that wanted stationery, and twelve of the twenty four do. So half the
studio resolved to byte identical canvas, card and rule colours: #fef6ea,
#fffdfb, #e8dbc7. Every hue decision in skins.mjs was being thrown away for
those twelve, and before a single card renders, the page is the same page.

`paperTint` now pulls the paper a measured fraction toward the app's own hue,
capped at 35 degrees so cream stays cream, and refused outright where the arc is
wider than 90 degrees because that would drag the page out of warm entirely.

**An honest limit, found by measuring rather than by argument.** At the page's
lightness (0.977) sRGB can barely hold a hue at all: the tint clips, and the
canvas itself moves by one or two hex units. The visible separation arrives in
the rules, the grids and the second surfaces, which sit darker and have gamut
room. Home Inventory now has a genuinely green page and grid; Specials Planner's
rules run terracotta. Making the PAPER itself properly different needs the
canvas lightness dropped to about 0.955, which is a decision about how creamy
this stationery should be. That is the Director's call, not a session's.

Five apps are too far from cream to tint at all (sub-plans 96 degrees away,
seating-chart 128, grade-sheet 148, caregiver-log 172, signature-maker 174).
They need a different lever and they still share one page today.

## The ornament shipped the day before had missed a fifth of the fleet

**SHIPPED.** It rode on `header.app::after`. Six apps have no `header.app`:
astravault and rock-stops draw no header at all, and cross-off, hush, overload
and specials-planner use a bare `<header>`. Of those only specials-planner is
inside the design system, so the app the whole design language was reverse
engineered from was the one app that received nothing.

Two separate faults, both fixed: the row can now name its own `ornamentHost`,
and the pseudo element is `display:block`, because on a plain block header the
default inline box has auto width and no box to paint a mask into. It reported
as painted and showed nothing, which is the worst kind of wrong.

## The ornament was making two apps look MORE alike

**SHIPPED.** Seating Chart and Wedding Timeline wore the byte identical vine, at
the same weight, in the same place, and they sit next to each other in the hub.
The one thing shipped to tell apps apart was the strongest evidence those two
were the same product. The vine is the wedding's alone now. Seating Chart takes
four chairs drawn up to a table rail (the rail passes THROUGH the chairs, which
is what makes it read as seating rather than beads on a string), Specials Planner
takes the open circles it already draws for its A/B/C rotation, and Sub Plans
takes a folder tab, because that is literally the object.

## The ornament reaches paper in no app at all

**PART SHIPPED.** The print rule targeted `header.app::after`, and the header is
`display:none` in print a few lines above it. Dead in every app. The dead rule is
gone. Putting the mark on the printed page is real work: it belongs under the
document title, drawn in the print ink rather than the accent, because a hairline
in a pale accent prints as a grey ghost on a mono laser and as mud on a home
inkjet. Tracked as `printMark`.

## The wedding question, answered: option (c)

**PART SHIPPED.** Seating Chart keeps plum on screen, because it is not only a
wedding tool: its own copy sells it for "weddings and receptions, teachers
building classroom seating charts, banquets, galas, reunions, corporate
dinners". Gold on ivory is not neutral enough for a Year 4 seating plan. The
judge also checked what hue 88 does to Stephen's icon when re-hued: it becomes a
dark khaki tile that reads army green. Gold stays the timeline's.

The ceremony goes on the PAPER instead, in ink, for every event type, so nobody
has to choose a style for an artefact they cannot preview.

**A real defect found on the way, and shipped:** the entrance display laid names
into a two column grid unconditionally, so a wedding with four or five tables
never reached column two and printed with the entire right half of the sheet
blank under a centred title. That is the artefact that gets stood on an easel at
the door. It now measures whether the list fits down one column and centres it
if so.

Still to do on paper: a hairline rule and the seating motif under the entrance
title, one short rule per escort card, and nothing at all on the caterer's
sheet, which is a kitchen working document that gets splashed and thrown away.
Draw in the PDF's existing ink, never the accent. Note for whoever builds it:
pdf-lib's drawSvgPath FILLS by default, so it needs borderColor and borderWidth
with `color` left unset, or the chairs come out as solid dots.

## Rejected, with the reason, so nobody re-proposes them

- **Seating Chart follows the wedding into gold.** Three pieces of evidence
  against: the app serves classrooms and corporate dinners; the two apps sit
  adjacent in the hub so it would read as the timeline's variant; and the icon
  re-hues to army green.
- **A wedding-only gold face selectable per event.** Right instinct, wrong
  mechanism. There is no event-type concept anywhere in the app, so it needs a
  persisted field, a migration for every stored project, a picker, and a branch
  through all three PDF generators, and it asks someone seating 140 people to
  choose a look for an output that never renders on screen.
- **Seating Chart to `paper: 'cool'`.** Trades one twin for a worse one: at hue
  310 cool paper solves to #faf5fe and baby-log at 294 solves to #f8f6ff.
- **Hue 334 for Seating Chart.** Measured: it narrows the gap between the
  primary action and the destructive one from 67.8 degrees to 46.6, and in dark
  mode the two start reading as neighbours on a screen whose whole job is a list
  of guests each carrying a remove control. 326 was the counter-offer.
- **Ornament on the caterer's sheet.** No reader who is not being paid to read
  it. Decoration there is ink with no audience.
- **Print marks in the accent colour.** A 0.5pt plum hairline prints as a grey
  ghost, times ten cards to a page.

## Still open, worth a session of its own

1. The canvas lightness question above. It is the difference between paper that
   is nearly white and paper that is genuinely the app's own.
2. `printMark`, the ornament on paper, described above.
3. The five far-hue apps that cannot tint and still share one page.
4. Several apps carry dead tokens their rows pay for and nothing reads: seating
   chart's `--sel`, secret-santa's `--pine` (the note claims "cranberry and
   pine" and the pine is about 95 percent unbuilt), team-parent's `support`.
5. Grade Sheet's settings button drops onto its own line instead of sitting
   beside the title. Caught by `npm run prefs`, still failing, cosmetic.
