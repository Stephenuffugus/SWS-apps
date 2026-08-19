/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO, the 23 skins

   Every app is one row here. The row is small on purpose: if identity needed
   fifty knobs, the apps would drift apart and stop looking like one studio.

   Five axes carry all the variation:

     hue      where the app sits on the colour wheel
     chroma   how saturated it is, a muted app and a vivid app 15° apart
              still read as different products
     paper    'warm' pulls the page toward cream regardless of accent hue, so
              the app feels like stationery; 'cool' tints the page with its own
              hue and feels like glass. This is the single biggest "these are
              different apps" lever after hue.
     voice    which typeface heads the page: editorial (serif), technical
              (grotesk), or plain (system, for the apps where a neutral face
              is genuinely the right answer)
     texture  one background signature from a fixed vocabulary

   Hue crowding is unavoidable at 23 apps, the wheel only has 360°. Where two
   sit close, they are pushed apart on the other four axes instead, and apps
   from the same hub category are always far apart on hue.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Hue used for "warm paper" canvases, the cream of good stationery. */
export const PAPER_HUE = 78;

export const SKINS = {
  /* ── School ───────────────────────────────────────────────────────────── */

  'specials-planner': {
    hue: 38, chroma: 0.13, paper: 'warm', voice: 'editorial', texture: 'wash',
    r: 14, wrap: '66rem', support: 190,
    // Terracotta on cream. This app already had a real identity and teachers
    // responded to it; the system inherits it rather than overwriting it.
    note: 'terracotta on cream, the app the whole design language was reverse-engineered from',
  },

  'sub-plans': {
    hue: 174, chroma: 0.095, paper: 'warm', voice: 'editorial', texture: 'rule',
    r: 12, wrap: '48rem', support: 38,
    extra: { 'line-strong': { role: 'line', l: 0.62, c: 0.02, dl: 0.52 } },
    note: 'muted pine on cream, a binder left on a desk for someone else to pick up',
  },

  'grade-sheet': {
    hue: 226, chroma: 0.08, paper: 'warm', voice: 'editorial', texture: 'grid',
    r: 10, wrap: '72rem', support: 86,
    // Blue-black ink on cream ledger paper, which is literally the artifact.
    // Chroma is deliberately the lowest in School: this app gets projected in
    // front of children and opened in front of principals, and something
    // saturated holding other people's children's marks reads wrong.
    // `support` is pinned to honey rather than the default complement, which
    // for hue 226 would compute to ~16, a red. Red must never turn up as
    // ambient decoration on a screen full of grades; --neg is solved
    // separately and is what carries the Missing marker.
    note: 'deep blue-black ink on cream ledger paper, quiet enough to project, adult enough for a principal',
  },

  /* ── Family & Home ────────────────────────────────────────────────────── */

  'sitter-sheet': {
    hue: 86, chroma: 0.12, paper: 'warm', voice: 'editorial', texture: 'wash',
    r: 16, wrap: '44rem',  support: 12,
    note: 'honey on cream, you are handing a stranger your house and your kids; warmth is the job',
  },

  'baby-log': {
    hue: 294, chroma: 0.10, paper: 'cool', voice: 'plain', texture: 'none',
    r: 20, wrap: '34rem',
    // 3am, one hand, dark room. Soft rounded geometry, oversized targets, and
    // a dark mode that goes genuinely dark rather than dark-grey.
    darkCanvasL: 0.155,
    scale: 1.06,
    // These three are button fills, and the audit found the old sleep button
    // shipped white-on-#60a5fa in the dark (2.54:1), unreadable in exactly
    // the condition the app exists for. role:'fill' makes the build emit a
    // contrast-solved --<name>-ink to sit on each one.
    extra: {
      feed:   { role: 'fill', l: 0.52, c: 0.11, h: 178, dl: 0.72 },
      sleep:  { role: 'fill', l: 0.52, c: 0.12, h: 262, dl: 0.72 },
      diaper: { role: 'fill', l: 0.52, c: 0.11, h: 62,  dl: 0.72 },
    },
    note: 'twilight violet, the only light in the room at 3am should not be a white screen',
  },

  'pill-schedule': {
    hue: 234, chroma: 0.115, paper: 'cool', voice: 'plain', texture: 'none',
    r: 10, wrap: '52rem',
    // Research is blunt about this category: an older-adult test panel rejected
    // 17 of the medication apps they tried, and the quoted complaint is "teeny
    // tiny icons not suitable for the eyes of an older adult". Legibility beats
    // personality here by a wide margin, so the whole scale runs up 14%, // roughly 18px body, and the app should ship a real type-size control on
    // top of that rather than shrugging at browser zoom.
    scale: 1.14,
    note: 'clear blue, crisp corners, reads like a chart because it becomes one',
  },

  'caregiver-log': {
    hue: 250, chroma: 0.035, paper: 'warm', voice: 'editorial', texture: 'grain',
    r: 12, wrap: '46rem',
    // Deliberately the least colourful app in the portfolio. Families use this
    // while someone they love is declining; cheerfulness would be an insult.
    extra: { mine: { role: 'tint', l: 0.94, c: 0.02, dl: 0.30 } },
    note: 'near-neutral slate on linen, quiet on purpose',
  },

  'grocery-list': {
    hue: 158, chroma: 0.14, paper: 'cool', voice: 'plain', texture: 'none',
    r: 16, wrap: '38rem',
    // Used standing in an aisle holding something in the other hand.
    scale: 1.06,
    note: 'grass green, generous targets, a list you can hit while holding a melon',
  },

  /* ── Events & Groups ──────────────────────────────────────────────────── */

  'signup-sheets': {
    hue: 58, chroma: 0.155, paper: 'warm', voice: 'technical', texture: 'band',
    r: 12, wrap: '46rem', support: 200,
    extra: { mine: { role: 'tint', l: 0.93, c: 0.045, dl: 0.32 } },
    note: 'marigold, the flagship; an open invitation, not a form to fill in',
  },

  'team-parent': {
    hue: 258, chroma: 0.15, paper: 'cool', voice: 'technical', texture: 'band',
    r: 12, wrap: '46rem', support: 58,
    extra: { mine: { role: 'tint', l: 0.93, c: 0.045, dl: 0.32 } },
    note: 'royal blue with a marigold band, team colours without picking a team',
  },

  'secret-santa': {
    hue: 8, chroma: 0.145, paper: 'warm', voice: 'editorial', texture: 'grain',
    r: 14, wrap: '42rem', support: 152,
    extra: { pine: { role: 'fill', l: 0.44, c: 0.10, h: 152, dl: 0.72 } },
    note: 'cranberry and pine on paper, christmas without the tinsel gradient',
  },

  'wedding-timeline': {
    hue: 336, chroma: 0.085, paper: 'warm', voice: 'editorial', texture: 'wash',
    r: 18, wrap: '46rem', support: 86,
    note: 'dusty rose on cream, the invitation-suite register, not the bridal-app register',
  },

  'seating-chart': {
    hue: 310, chroma: 0.115, paper: 'warm', voice: 'editorial', texture: 'wash',
    r: 14, wrap: '64rem', support: 174,
    extra: { sel: { role: 'tint', l: 0.93, c: 0.05, dl: 0.32 } },
    note: 'plum on cream, deeper and more formal than the wedding timeline it sits beside',
  },

  'bracket-maker': {
    // Was hue 104, which is where yellow has already turned toward green, it
    // read olive rather than trophy, and had done since the palette landed.
    // 86 is the yellow-gold band, and `fill: bright` keeps the button a
    // saturated gold with dark ink on it instead of dragging the hue down to
    // a dark enough value to carry white text, which is what muddies a gold.
    hue: 86, chroma: 0.155, paper: 'warm', voice: 'technical', texture: 'band',
    fill: 'bright',
    r: 8, wrap: '64rem',
    extra: { win: { role: 'fill', l: 0.48, c: 0.12, h: 152, dl: 0.72 } },
    note: 'trophy gold, hard corners, a bracket is a diagram, so it should look drawn',
  },

  'wheel-picker': {
    hue: 350, chroma: 0.175, paper: 'cool', voice: 'technical', texture: 'wash',
    r: 22, wrap: '38rem', support: 58,
    note: 'hot magenta, very round, the one app in the portfolio allowed to be loud',
  },

  /* ── Paper & Files ────────────────────────────────────────────────────── */

  'scan-to-pdf': {
    hue: 202, chroma: 0.12, paper: 'cool', voice: 'technical', texture: 'grid',
    r: 10, wrap: '44rem',
    note: 'scanner cyan on a faint grid, looks like a device, which is the promise',
  },

  'pdf-tools': {
    hue: 276, chroma: 0.135, paper: 'cool', voice: 'technical', texture: 'none',
    r: 10, wrap: '48rem',
    note: 'indigo, crisp, a workbench, no decoration',
  },

  'image-compressor': {
    /* Was magenta at chroma 0.145 behind a `wash` texture. The research called
       it and the review agent agreed: this is the one app whose entire job is
       judging whether a photograph still looks right, and a saturated coloured
       wash behind the photograph corrupts exactly that judgement, simultaneous
       contrast shifts the apparent colour of anything sitting on it.

       Cool graphite at very low chroma instead. It stays distinct in the
       portfolio by VALUE and NEUTRALITY rather than hue, which is the correct
       axis here: no other app is this desaturated. Texture off for the same
       reason, a photo needs a plain ground. */
    hue: 258, chroma: 0.038, paper: 'cool', voice: 'technical', texture: 'none',
    r: 12, wrap: '44rem', support: 158,
    note: 'cool graphite, no texture, a photo can only be judged against a neutral ground',
  },

  'signature-maker': {
    hue: 264, chroma: 0.022, paper: 'warm', voice: 'editorial', texture: 'grain',
    r: 12, wrap: '40rem',
    // Almost achromatic on purpose. The app is ink on paper; anything else
    // competes with the thing the user is drawing.
    note: 'blue-black ink on laid paper, restraint is the identity here',
  },

  'qr-maker': {
    hue: 142, chroma: 0.13, paper: 'cool', voice: 'technical', texture: 'grid',
    r: 8, wrap: '40rem',
    note: 'signal green on a module grid, the page echoes the thing it makes',
  },

  /* ── Moving & Travel ──────────────────────────────────────────────────── */

  'moving-boxes': {
    hue: 72, chroma: 0.105, paper: 'warm', voice: 'technical', texture: 'grid',
    r: 10, wrap: '44rem', support: 258,
    note: 'kraft cardboard and packing-tape geometry',
  },

  'packing-list': {
    hue: 188, chroma: 0.12, paper: 'cool', voice: 'plain', texture: 'none',
    r: 16, wrap: '38rem',
    note: 'travel teal, checked off at 6am in an airport with one hand',
  },

  'home-inventory': {
    hue: 124, chroma: 0.085, paper: 'warm', voice: 'technical', texture: 'grid',
    r: 10, wrap: '52rem', support: 38,
    // Opened either in dull anticipation of a disaster or in the middle of one.
    note: 'olive-green ledger, this is a record, and it should look like evidence',
  },

  /* ── Money ────────────────────────────────────────────────────────────── */

  'bill-splitter': {
    hue: 218, chroma: 0.10, paper: 'cool', voice: 'technical', texture: 'none',
    r: 12, wrap: '44rem', support: 152,
    note: 'steady slate-blue, money apps earn trust by being boring',
  },
};

/* ── Typographic voices ─────────────────────────────────────────────────── */
/* One text face across all 23 (the system stack, it renders instantly, costs
   nothing, and is the through-line). Only the DISPLAY face changes, and only
   three exist, because a studio with 23 typefaces is not a studio. */

export const SYSTEM_STACK =
  'ui-sans-serif,system-ui,-apple-system,"Segoe UI Variable Text","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

/* Self-hosted, latin subset, headings only. They live in design/fonts/ and are
   copied into each app that needs one, because a shared path would sit outside
   that app's service-worker scope and break offline. */
export const FONT_FILES = {
  fraunces: {
    family: 'Fraunces', file: 'fraunces-latin.woff2', weights: '500 700',
  },
  'space-grotesk': {
    family: 'Space Grotesk', file: 'space-grotesk-latin.woff2', weights: '400 700',
  },
};

export const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,' +
  'U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

export const VOICES = {
  editorial: {
    display: `"Fraunces",Georgia,"Iowan Old Style",serif`,
    weight: 600,
    tracking: '-0.014em',
    font: 'fraunces',
  },
  technical: {
    display: `"Space Grotesk",${SYSTEM_STACK}`,
    weight: 600,
    tracking: '-0.022em',
    font: 'space-grotesk',
  },
  plain: {
    display: SYSTEM_STACK,
    weight: 700,
    tracking: '-0.021em',
    font: null,
  },
};

/* ── Texture vocabulary ─────────────────────────────────────────────────── */
/* Each returns a `background-image` value. Kept deliberately faint: texture
   should be something you notice only if you look for it. */

export const TEXTURES = {
  none: () => 'none',

  /** Two soft colour washes at opposite corners. */
  wash: ({ a, b }) =>
    `radial-gradient(70rem 40rem at 8% -10%, ${a}, transparent 60%),` +
    `radial-gradient(60rem 36rem at 96% 2%, ${b}, transparent 55%)`,

  /** Faint graph paper, for tools that produce a diagram or a record.
      Must be translucent, not a solid hairline: at full --line strength the
      page reads as squared maths paper and competes with the content. */
  grid: ({ rule }) =>
    `linear-gradient(${rule} 1px, transparent 1px),` +
    `linear-gradient(90deg, ${rule} 1px, transparent 1px)`,

  /** Paper tooth. An SVG turbulence tile, painted almost invisibly, at
      anything above about 4% this stops reading as paper and starts reading
      as a broken screen. */
  grain: ({ dark }) => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">` +
      `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>` +
      `<feColorMatrix type="saturate" values="0"/></filter>` +
      `<rect width="140" height="140" filter="url(#n)" opacity="${dark ? 0.055 : 0.035}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  },

  /** A solid accent band across the top of the page. */
  band: ({ a }) => `linear-gradient(${a}, ${a})`,

  /** A single hairline of accent under the header. */
  rule: ({ a }) => `linear-gradient(${a}, ${a})`,
};

/** Extra background-* declarations a texture needs beyond the image itself. */
export const TEXTURE_SUPPORT = {
  none: '',
  wash: '',
  grain: 'background-repeat:repeat;background-size:140px 140px;',
  grid: 'background-size:26px 26px;background-position:-1px -1px;',
  band: 'background-repeat:no-repeat;background-size:100% 4px;background-position:0 0;',
  rule: 'background-repeat:no-repeat;background-size:100% 2px;background-position:0 0;',
};
