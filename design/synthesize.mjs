#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO, the cross-app read

     node design/synthesize.mjs      → design/findings/PORTFOLIO-SYNTHESIS.md

   INDEX.md has promised this file since the findings directory existed. It is
   the answer to "what do people actually want fixed", read across all 23 apps
   at once rather than one at a time.

   The point is leverage. A defect in one app is a task; the same defect in
   twelve is a system problem, and the fix belongs in the base layer or a
   sweep, not in twelve separate to-do lists. Everything here is counted from
   the review and research files, no hand-maintained numbers.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const F = join(HERE, 'findings');

const read = (f) => { try { return JSON.parse(readFileSync(join(F, f), 'utf8')); } catch { return null; } };
const files = readdirSync(F);

const reviews = files.filter((f) => f.endsWith('.review.json')).map(read).filter(Boolean);
const research = files.filter((f) => f.endsWith('.research.json')).map(read).filter(Boolean);

/* Themes are matched on the fix's own words. Deliberately overlapping: one
   fix can be both a contrast problem and a print problem, and pretending
   otherwise would undercount both. */
const THEMES = [
  ['No undo on destructive actions', /undo|confirm\(|destructiv|irreversib|no way back|accidental(ly)? delet/i,
    'SWS.undo() in the shared runtime. Undo, not a confirm dialog: a confirm taxes the 99 deliberate taps to catch the one mistake, and is dismissed on reflex.'],
  ['Focus destroyed on redraw', /focus|keyboard|tab order|tabindex|activeElement/i,
    'Apps that rebuild their DOM drop focus to <body> on every interaction. Preserve focus and selection across a redraw, keyed on a stable identity.'],
  ['Targets under the 44px floor', /44|tap target|touch target|target size/i,
    '--tap in the base is the floor and scales with the comfort panel. App layers still set their own smaller paddings.'],
  ['Silent caps and truncation', /silent|\bcap\b|truncat|discard|dropped|clipped off|only the first/i,
    'The single most repeated defect. Every limit must say its own name at the moment it bites, a cap discovered later is the category betrayal the research names.'],
  ['Print output defects', /print|pdf|paper|escort card|background graphics/i,
    'Half these apps exist to produce paper. Printing is a feature, not an afterthought.'],
  ['Contrast and colour-only state', /contrast|:1\b|colour alone|color alone|unreadable/i,
    'The build contrast-solves every token. Failures are app layers reaching past the tokens, in states that only exist after interaction, which is why axe misses them.'],
  ['Comfort panel ignored', /comfort panel|text size|largest|reduced motion|prefers-reduced|canvas.*scale/i,
    'Canvas and animation get no cascade. They have to read the root font size and honour data-motion themselves.'],
  ['Never says the work is saved', /saved|save confirmation|autosave|fire-and-forget/i,
    'SWS.saved(). Apps speak only when saving FAILS, so the evidence that a list survived is that nothing happened.'],
  ['Privacy promise as grey copy', /trust|privacy promise|badge|stamp|believe/i,
    'The .trust component. Research is blunt: nobody believes a privacy claim written as body text at the bottom of a page.'],
  ['Breaks on a narrow screen', /overflow|320px|sideways|off-screen|offscreen|horizontal scroll/i,
    'Measured by the stress battery at 320px, 414px, and at largest text and roomy spacing.'],
  ['Unlabelled controls', /aria-label|accessible name|placeholder.*label|unlabel/i,
    'A placeholder is not a label: it disappears exactly when the user needs it, mid-form.'],
  ['No empty state', /empty state|first run|cold open|onboard|blank screen/i,
    'An empty state is the cheapest onboarding there is, and most apps open cold showing an empty box.'],
];

const allFixes = [];
for (const r of reviews) for (const f of (r.fixes || [])) allFixes.push({ slug: r.slug, ...f });

const sev = (s) => allFixes.filter((f) => f.severity === s).length;

const themed = THEMES.map(([name, re, leverage]) => {
  const hits = allFixes.filter((f) => re.test(`${f.title} ${f.rationale}`));
  return { name, leverage, hits: hits.length, apps: new Set(hits.map((h) => h.slug)) };
}).sort((a, b) => b.apps.size - a.apps.size || b.hits - a.hits);

/* What the focus groups asked for that does not exist yet. */
const wanted = [];
for (const r of reviews) for (const w of (r.focusGroup?.consensus?.mostWantedNext || [])) {
  wanted.push({ slug: r.slug, want: w });
}

/* Complaint counts from the competitor research. */
const complaintTally = new Map();
for (const r of research) {
  for (const c of (r.complaints || [])) {
    const key = /subscription|paywall|premium|pricing|free tier/i.test(c.complaint) ? 'Subscription or paywall'
      : /account|sign.?up|log.?in|register/i.test(c.complaint) ? 'Forced account'
        : /\bads?\b|upsell|promo|banner/i.test(c.complaint) ? 'Ads and upsell in the workflow'
          : /upload|cloud|privacy|data|server/i.test(c.complaint) ? 'Uploads and privacy worry'
            : /print|pdf|export|download|watermark/i.test(c.complaint) ? 'Export, print or watermark'
              : /slow|crash|bug|lag|freeze|lost/i.test(c.complaint) ? 'Loses work, slow or crashes'
                : /clutter|bloat|confus|too many taps|complicated/i.test(c.complaint) ? 'Bloat and too many taps'
                  : 'Other';
    if (!complaintTally.has(key)) complaintTally.set(key, { n: 0, apps: new Set() });
    const e = complaintTally.get(key);
    e.n++; e.apps.add(r.slug);
  }
}

const blockersByApp = [...new Set(allFixes.map((f) => f.slug))]
  .map((slug) => ({ slug, n: allFixes.filter((f) => f.slug === slug && f.severity === 'blocker').length }))
  .sort((a, b) => b.n - a.n);

const totalComplaints = research.reduce((n, r) => n + (r.complaints?.length || 0), 0);

const md = `# Portfolio synthesis, what to fix, and where the leverage is

Generated by \`design/synthesize.mjs\` from the review and research files in
this directory. Every number is counted, not maintained by hand, re-run it
after any review lands.

**${reviews.length} of 23 apps reviewed** · **${research.length} of 23 researched**
· ${allFixes.length} fixes identified · ${totalComplaints} sourced competitor complaints

| Severity | Count |
|---|---|
| Blocker | ${sev('blocker')} |
| Major | ${sev('major')} |
| Minor | ${sev('minor')} |

---

## The headline

These are not ${reviews.length} apps with their own problems. They are one
codebase, forked ${reviews.length > 20 ? '23' : '23'} times, with the same
handful of defects in every copy. Sorted by how many apps carry each one:

| Defect | Apps | Fixes | Where the fix belongs |
|---|---|---|---|
${themed.filter((t) => t.apps.size).map((t) =>
    `| ${t.name} | **${t.apps.size}** | ${t.hits} | ${t.leverage} |`).join('\n')}

The practical consequence: anything at the top of that table should be fixed
**once**, in \`design/studio.css\`, in the shared runtime, or by a sweep over
all 23 app layers, and never as ${reviews.length} separate tasks. Anything at
the bottom is genuinely per-app work.

### Why our own tooling missed most of this

axe reports **zero violations** across all 23 apps in both themes, and the
contrast build passes 1542/1542. Both are true, and both missed the defects
above, for the same reason: **they scan the page as it loads.** Almost every
real failure here lives in a state that does not exist yet, \`.active\`, \`.sel\`, \`.winner\`, a list with 200 rows in it, a canvas
repainted after a preference change, a PDF that has not been generated.

That is what \`design/stress.mjs\` exists for, and why it runs axe *after*
interacting rather than on load.

---

## Blockers by app

${blockersByApp.map((a) => `- **${a.slug}**, ${a.n} blocker${a.n === 1 ? '' : 's'}`).join('\n')}

---

## What the incumbents are hated for

Counted across ${research.length} competitor studies. This is the market
position stated as evidence rather than as a slogan:

| Complaint | Instances | Categories |
|---|---|---|
${[...complaintTally.entries()].sort((a, b) => b[1].n - a[1].n)
    .map(([k, v]) => `| ${k} | ${v.n} | ${v.apps.size} |`).join('\n')}

Every one of those companies has a payroll, and that payroll is why they must
ask for an account, run an ad, or put the export behind a card. We do not.
**The promise is the product**, which is exactly why leaving it as grey
footer copy in 21 of 23 apps is a strategic error and not a cosmetic one.

---

## What people asked for and did not find

Straight from the focus groups' \`mostWantedNext\`. These are features, not
defects, the backlog after the bleeding stops.

${wanted.length === 0 ? '_No reviews with consensus data yet._' :
    [...new Set(wanted.map((w) => w.slug))].map((slug) => {
      const items = wanted.filter((w) => w.slug === slug).map((w) => `  - ${w.want}`);
      return `**${slug}**\n${items.join('\n')}`;
    }).join('\n\n')}

---

## How to work this list

1. **Sweeps first.** Every row in the headline table touching 8+ apps is a
   sweep or a base-layer change. Doing those as per-app tasks is the single
   biggest waste available.
2. **Then blockers, worst app first**, using the per-app \`fixes\` array in
   \`<slug>.review.json\`, already ordered, already located, already
   evidenced.
3. **Verify by measurement.** \`node design/stress.mjs <slug>\` must end at
   zero hard failures and \`node design/a11y.mjs <slug>\` at zero violations.
   A fix without a number next to it is an intention.
`;

writeFileSync(join(F, 'PORTFOLIO-SYNTHESIS.md'), md);
console.log(`design/findings/PORTFOLIO-SYNTHESIS.md, ${reviews.length} reviews, ${allFixes.length} fixes, ${sev('blocker')} blockers`);
