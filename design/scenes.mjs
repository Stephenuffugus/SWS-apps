/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — screenshot scenes

   One entry per app, consumed by shots.mjs. A scene answers a single question:
   what does this app look like when somebody has actually been using it?

   Two ways to get there, and the choice matters:

     act    — drive the real UI: fill the field, click the button. Slower, but
              the state is real by construction and cannot drift from the app.
              Prefer this.
     store  — seed localStorage before boot. Necessary when the state would
              take twenty interactions to build, but it hard-codes that app's
              storage shape here, so it breaks silently if the shape changes.

   Each panel becomes one 1080x1920 Play screenshot. Order is the swipe order,
   and the first one carries the install decision — it should show the app
   doing its job, not a welcome screen.

   Captions are short because Play renders them small. The sub-line is the
   place for the promise the competition cannot match.

   KEEP THE CAPTION UNDER ABOUT 34 CHARACTERS. The caption band is a fixed
   300px of a 1920px panel; a caption that wraps to three lines pushes the
   sub-line down and the phone frame starts eating it. shots.mjs warns when a
   caption is long enough to be at risk.
   ═══════════════════════════════════════════════════════════════════════════ */

/* scrollIntoViewIfNeeded lands the element anywhere in the viewport, which on a
   tall page means the capture opens mid-paragraph. Panels want the card's top
   edge just under the top of the frame, so scroll deliberately. */
const toTop = async (p, sel, pad = 12) => {
  await p.evaluate(([s, o]) => {
    const el = document.querySelector(s);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: 'instant' });
  }, [sel, pad]);
};

/* Sub Plans is a single long form keyed #f-<field>. Filling it through the UI
   rather than seeding storage means the panels below show exactly what a
   teacher would see, including the live page count on the Print button. */
const SUB_PLANS_BINDER = {
  teacher: 'Ms. Rivera',
  class: '3rd grade — 24 kids',
  room: '12',
  school: 'Maple Elementary',
  plan: '8:00  Morning work — packet on my desk, they know the drill\n'
    + '8:40  Read-aloud, ch. 7 of Because of Winn-Dixie (bookmark is in it)\n'
    + '9:15  Math — pages 44-45, work in table groups\n'
    + '10:30 Recess. Take the orange whistle by the door.\n'
    + '11:00 Writing — finish the small-moment drafts\n'
    + '12:00 Lunch (they line up by the sink)\n'
    + '1:00  Science video + the worksheet in the blue tray\n'
    + '2:15  Clean-up, read silently, stack chairs at 2:50',
  bathroom: 'One at a time, with the pass hanging by the door. If two ask at once they can wait.',
  wifi: 'WiFi: MapleGuest / maple2024!\nLaptop cart code: 4417',
  office: 'Ext. 100',
  neighbor: 'Mrs. Alvarez, Rm 14 — she knows my routines and will not mind being asked.',
  helpers: 'Ava and Marcus know every routine and will tell you the truth about what comes next.',
  needs: 'Jordan sits up front (glasses). Sam leaves at 1:30 for speech and comes back at 2.',
  behavior: 'Marble jar on my desk — add for good group work. No need to take any out.',
  nurse: 'Ext. 108',
  admin: 'Mr. Okafor — ext. 103',
  drills: 'Fire: out our door, turn left, flag by the fence at the far end of the lot.\n'
    + 'Lockdown: lights off, kids behind the bookshelf, door is already locked.',
  health: 'Maya R: peanut allergy — EpiPen is in the red pouch on my desk, office has a second.\n'
    + 'Eli T: asthma inhaler in his backpack, he knows when he needs it.',
  dismissal: 'Bus riders leave at 3:05 — the list is taped inside the closet door. Walkers at 3:10.',
  note: 'Leave the room roughly standing and I will be delighted. Thank you for taking my class.',
};

const fillBinder = async (p, keys) => {
  for (const k of keys) {
    const v = SUB_PLANS_BINDER[k];
    if (v == null) continue;
    await p.fill(`#f-${k}`, v).catch(() => {});
  }
  await p.waitForTimeout(300);
};

/* Home Inventory opens on a list of inventories, so every panel has to create
   one first: "Start an inventory" → name it → the fast-capture screen. Photos
   need a real camera, which headless Chromium does not have, so the items are
   captured without one — the panels that matter are the list, the room
   breakdown and the export, none of which depend on the image. */
/* Grouped by room on purpose: the "room by room" panel is a lie if every item
   lands in Living room and the other rooms read "0 items". */
const HI_BY_ROOM = [
  ['Living room', [['65-inch TV', '1', '900'], ['Sofa — three seat', '1', '1400'], ['Rug — wool 8x10', '1', '620']]],
  ['Kitchen', [['Espresso machine', '1', '480'], ['Stand mixer', '1', '390'], ['Dining table + 6 chairs', '1', '860']]],
  ['Bedroom', [['MacBook Pro 14"', '1', '1999'], ['Jewellery — inherited', '1', '2200']]],
  ['Garage', [['Road bike', '1', '1250'], ['Washer / dryer', '1', '1100'], ['Mitre saw', '1', '340']]],
];

const hiStart = async (p, name = 'Our house — 2026') => {
  await p.getByRole('button', { name: /start an inventory/i }).click();
  await p.waitForTimeout(400);
  await p.fill('#askField', name);
  await p.getByRole('button', { name: /^create$/i }).click();
  await p.waitForTimeout(700);
};

const hiCapture = async (p) => {
  for (const [room, items] of HI_BY_ROOM) {
    /* The room select sits on the capture card and carries no id; it is the
       only select visible on this screen. A room not already in the list has
       to be added on the Rooms tab first, so fall back to leaving the current
       room selected rather than throwing the whole panel away. */
    await p.locator('select:visible').first()
      .selectOption({ label: room }).catch(() => {});
    await p.waitForTimeout(150);
    for (const [n, q, v] of items) {
      await p.fill('#capName', n).catch(() => {});
      await p.fill('#capQty', q).catch(() => {});
      await p.fill('#capValue', v).catch(() => {});
      await p.getByRole('button', { name: /save & next/i }).click().catch(() => {});
      await p.waitForTimeout(240);
    }
  }
};

const hiTab = async (p, name) => {
  await p.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).click().catch(() => {});
  await p.waitForTimeout(600);
};

/* Seating Chart opens on a list of events, so every panel names one first
   through #nameDlg. Guests go in through the bulk-paste box, which lives
   inside a <details> that must be opened first. Paste format is:
   Name, party, meal, dietary flags. */
const SC_GUESTS = [
  'Ann Alvarez, Alvarez family, Beef',
  'Ben Alvarez, Alvarez family, Fish, nut allergy',
  'Cara Chen, Chen party, Veg',
  'Dev Patel, Patel family, Beef',
  'Elena Rossi, Rossi party, Fish, gluten-free',
  'Frank Moore, College friends, Beef',
  'Grace Kim, College friends, Veg',
  'Henry Osei, College friends, Beef',
  'Iris Chen, Chen party, Fish',
  'Jon Baker, Work, Beef',
  'Kira Novak, Work, Veg, gluten-free',
  'Liam Walsh, Work, Beef',
  'Maya Roy, Roy family, Fish',
  'Noah Park, Roy family, Beef, shellfish allergy',
  'Olive Grant, Neighbours, Veg',
  'Pia Sandhu, Neighbours, Beef',
  'Quinn Reilly, Cousins, Fish',
  'Rosa Bianchi, Cousins, Veg',
  'Sam Okafor, Cousins, Beef',
  'Tess Lindqvist, Work, Fish, nut allergy',
].join('\n');

const scStart = async (p) => {
  await p.getByRole('button', { name: /new event/i }).click();
  await p.waitForTimeout(400);
  await p.fill('#nameField', 'Jessie & Sam — 14 June');
  await p.getByRole('button', { name: /^create$/i }).click();
  await p.waitForTimeout(600);
};

const scAddGuests = async (p) => {
  await p.locator('details summary').first().click().catch(() => {});
  await p.waitForTimeout(250);
  await p.locator('textarea').first().fill(SC_GUESTS);
  await p.waitForTimeout(250);
  await p.getByRole('button', { name: /add them all/i }).click().catch(() => {});
  await p.waitForTimeout(700);
};

const scTab = async (p, name) => {
  await p.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).click().catch(() => {});
  await p.waitForTimeout(700);
};

/* The Tables tab carries an inline label/shape/seats row rather than a dialog,
   so tables go in the same way a user would add them. Without this the floor
   plan is empty and "Seat the room" shows nothing but an unseated pile. */
const scAddTables = async (p) => {
  await scTab(p, 'Tables');
  const rows = [['Head table', 'head', '6'], ['Table 1', 'round', '8'], ['Table 2', 'round', '8'],
    ['Table 3', 'round', '8'], ['Table 4', 'round', '8']];
  for (const [label, shape, seats] of rows) {
    const card = p.locator('section.card').filter({ hasText: 'Add a table' }).first();
    await card.locator('input[type="text"]').fill(label).catch(() => {});
    await card.locator('select').selectOption(shape).catch(() => {});
    await card.locator('input[type="number"]').fill(seats).catch(() => {});
    await card.getByRole('button', { name: /^add$/i }).click().catch(() => {});
    await p.waitForTimeout(260);
  }
};

/* Seating is tap-a-party then tap-a-table. Seat most of the room but leave a
   couple of parties out — a finished chart with nothing left to do hides the
   thing the app is actually for. */
const scSeatSome = async (p) => {
  await scTab(p, 'Seat people');
  for (let i = 0; i < 4; i++) {
    const chip = p.getByRole('button', { name: /whole party/i }).first();
    if (!(await chip.count())) break;
    await chip.click().catch(() => {});
    await p.waitForTimeout(220);
    const table = p.locator('.floor .table, .floor [data-table], .tablechip').nth(i);
    if (await table.count()) await table.click().catch(() => {});
    else await p.getByRole('button', { name: new RegExp(`^Table ${i + 1}$`, 'i') }).click().catch(() => {});
    await p.waitForTimeout(320);
  }
};

/* PDF Tools has no state to seed — its whole job is the files you hand it — so
   the scene feeds real PDFs through the app's own <input type=file>. The
   fixtures are generated by design/fixtures/make.mjs so every render gets the
   same pages; a merger photographed empty is a picture of a button. */
const FIXTURES = '/workspaces/SWS-apps/design/fixtures';

const pdfLoad = async (p, files) => {
  await p.setInputFiles('#fileInput', files.map((f) => `${FIXTURES}/${f}`));
  await p.waitForTimeout(1200);
};

const ssDraw = async (p) => {
  await p.fill('#eventInput', 'Family Christmas 2026').catch(() => {});
  await p.fill('#budgetInput', '$25').catch(() => {});
  await p.fill('#names', ['Mom', 'Dad', 'Jessie', 'Stephen', 'Aunt Rae', 'Uncle Pete',
    'Cousin Mia', 'Cousin Theo'].join('\n')).catch(() => {});
  await p.waitForTimeout(400);
};

/* Baby Log is all one-tap buttons, so a scene is just a plausible night: a
   couple of feeds, a nap, a nappy or two. The buttons carry emoji labels, so
   they are matched on the word rather than the glyph. */
const blLog = async (p, taps) => {
  await p.fill('#nameInput', 'Rosie').catch(() => {});
  for (const t of taps) {
    if (t === 'sleep') await p.click('#sleepBtn').catch(() => {});
    else await p.getByRole('button', { name: new RegExp(t, 'i') }).first().click().catch(() => {});
    await p.waitForTimeout(420);
  }
  await p.waitForTimeout(500);
};

export const SCENES = {
  'baby-log': {
    panels: [
      {
        slug: 'onetap',
        caption: 'One thumb, in the dark',
        sub: 'Big buttons, no menus, no typing. Tap and it is logged with the time.',
        act: async (p) => {
          await blLog(p, ['left', 'wet', 'bottle']);
          await toTop(p, '#log', 90);
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'timeline',
        caption: 'The night, as it actually went',
        sub: 'Every feed, nap and nappy stamped with the time it happened.',
        act: async (p) => {
          await blLog(p, ['left', 'wet', 'sleep', 'bottle', 'dirty', 'right', 'both']);
          await toTop(p, '#timelineCard', 90);
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'handover',
        caption: 'The summary you paste at shift change',
        sub: 'Copy it to your partner, or print the log for the paediatrician.',
        act: async (p) => {
          await blLog(p, ['left', 'wet', 'sleep', 'bottle', 'dirty']);
          await p.evaluate(() => {
            const h = [...document.querySelectorAll('h2')].find((e) => /summary/i.test(e.textContent));
            if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 120, behavior: 'instant' });
          });
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'private',
        caption: 'No cloud, no account',
        sub: 'Nobody mining your baby’s data. Every entry stays in this browser, on this phone.',
        dark: true,
        act: async (p) => {
          await blLog(p, ['left', 'wet', 'sleep', 'bottle', 'dirty', 'right']);
          await toTop(p, '#log', 90);
          await p.waitForTimeout(400);
        },
      },
    ],
  },

  'secret-santa': {
    panels: [
      {
        slug: 'names',
        caption: 'Draw names without anyone seeing the hat',
        sub: 'Type everyone in, set the budget, and nobody has to sign up for anything.',
        act: async (p) => {
          await ssDraw(p);
          await toTop(p, '#names', 220);
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'rules',
        caption: 'Keep couples from drawing each other',
        sub: 'Set the no-match rules first. The draw respects them, or tells you it cannot.',
        act: async (p) => {
          await ssDraw(p);
          await p.evaluate(() => {
            const h = [...document.querySelectorAll('h2')].find((e) => /no-match/i.test(e.textContent));
            if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 130, behavior: 'instant' });
          });
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'links',
        caption: 'Everyone gets their own private link',
        sub: 'Send one each. The organiser can run it and still be surprised on the day.',
        act: async (p) => {
          await ssDraw(p);
          await p.click('#drawBtn').catch(() => {});
          await p.waitForTimeout(1000);
          await p.evaluate(() => {
            const h = [...document.querySelectorAll('h2')].find((e) => /private l/i.test(e.textContent));
            if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 130, behavior: 'instant' });
          });
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'print',
        caption: 'Or print fold-over slips and use a hat',
        sub: 'For the family that would rather do it at the table. Free, no account, no ads.',
        dark: true,
        act: async (p) => {
          await ssDraw(p);
          await p.click('#drawBtn').catch(() => {});
          await p.waitForTimeout(1000);
          await toTop(p, '#printBtn', 300);
          await p.waitForTimeout(400);
        },
      },
    ],
  },

  'scan-to-pdf': {
    panels: [
      {
        slug: 'pages',
        caption: 'Photos of paper into one PDF',
        /* Do NOT claim de-skew or clean-up here: the app's own "what this
           can't do" card says plainly that there is no edge detection and no
           perspective correction. A caption that contradicts the app's own
           honesty is worse than a dull one, and it is the kind of thing a
           reviewer checks against screenshot three. */
        sub: 'Shoot the pages, order them, name it. One file, made on your phone.',
        act: async (p) => {
          await p.setInputFiles('#libInput', [1, 2, 3].map((n) => `${FIXTURES}/photo-receipt-${n}.jpg`));
          await p.waitForTimeout(2200);
          await toTop(p, '#pagesCard', 60);
          await p.waitForTimeout(500);
        },
      },
      {
        slug: 'presets',
        caption: 'Named for what it is, not IMG_4471',
        sub: 'Tap Receipt, Insurance or Tax and the file names itself with today’s date.',
        act: async (p) => {
          await p.setInputFiles('#libInput', [1, 2].map((n) => `${FIXTURES}/photo-receipt-${n}.jpg`));
          await p.waitForTimeout(1800);
          await p.getByRole('button', { name: /^receipt$/i }).click().catch(() => {});
          await p.waitForTimeout(500);
          await toTop(p, '#fileName', 220);
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'honest',
        caption: 'It tells you what it cannot do',
        sub: 'No fake OCR, no “AI enhancement”. The limits are written on the page.',
        act: async (p) => {
          await p.setInputFiles('#libInput', [`${FIXTURES}/photo-receipt-1.jpg`]);
          await p.waitForTimeout(1600);
          await p.evaluate(() => {
            const h = [...document.querySelectorAll('h2')].find((e) => /can.?t do/i.test(e.textContent));
            if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 130, behavior: 'instant' });
          });
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'private',
        caption: 'Your documents never leave the phone',
        sub: 'Adobe Scan and CamScanner upload to make an account worth having. This one has none.',
        dark: true,
        act: async (p) => {
          await p.setInputFiles('#libInput', [1, 2, 3].map((n) => `${FIXTURES}/photo-receipt-${n}.jpg`));
          await p.waitForTimeout(2200);
          await toTop(p, '#pagesCard', 60);
          await p.waitForTimeout(500);
        },
      },
    ],
  },

  'bill-splitter': {
    panels: [
      {
        slug: 'even',
        caption: 'Split it evenly, to the cent',
        sub: 'Tax and tip included, and the rounding is shown rather than quietly given to one person.',
        act: async (p) => {
          for (const name of ['Alex', 'Bea', 'Chris', 'Dana']) {
            await p.fill('#personInput', name).catch(() => {});
            await p.click('#personAdd').catch(() => {});
            await p.waitForTimeout(160);
          }
          await p.fill('#billAmt', '186.40').catch(() => {});
          await p.fill('#taxAmt', '16.32').catch(() => {});
          await p.fill('#tipAmt', '20').catch(() => {});
          await p.waitForTimeout(600);
          await toTop(p, '#dinnerResults', 240);
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'items',
        caption: 'Or by what each person actually ate',
        sub: 'Assign the steak to the person who ordered it. Tax and tip follow the same shares.',
        act: async (p) => {
          for (const name of ['Alex', 'Bea', 'Chris', 'Dana']) {
            await p.fill('#personInput', name).catch(() => {});
            await p.click('#personAdd').catch(() => {});
            await p.waitForTimeout(160);
          }
          await p.click('#segItems').catch(() => {});
          await p.waitForTimeout(300);
          for (const [label, amt] of [['Ribeye', '42'], ['Sea bass', '34'], ['Mushroom risotto', '26'],
            ['Bottle of malbec', '48'], ['Two desserts', '18']]) {
            await p.fill('#itemLabel', label).catch(() => {});
            await p.fill('#itemAmt', amt).catch(() => {});
            await p.click('#itemAdd').catch(() => {});
            await p.waitForTimeout(200);
          }
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'whopays',
        caption: 'Who owes whom, settled',
        sub: 'Say who paid and it works out the transfers — no app to install, no account to join.',
        act: async (p) => {
          for (const name of ['Alex', 'Bea', 'Chris', 'Dana']) {
            await p.fill('#personInput', name).catch(() => {});
            await p.click('#personAdd').catch(() => {});
            await p.waitForTimeout(160);
          }
          await p.fill('#billAmt', '186.40').catch(() => {});
          await p.fill('#taxAmt', '16.32').catch(() => {});
          await p.fill('#tipAmt', '20').catch(() => {});
          await p.waitForTimeout(500);
          const paidBy = p.locator('#paidBy');
          const opts = await paidBy.locator('option').count().catch(() => 0);
          if (opts > 1) await paidBy.selectOption({ index: 1 }).catch(() => {});
          await p.waitForTimeout(500);
          await toTop(p, '#dinnerResults', 200);
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'private',
        caption: 'No account, no ads, no sign-up',
        sub: 'Splitwise wants everyone at the table to install it. This is a web page you both open.',
        dark: true,
        act: async (p) => {
          for (const name of ['Alex', 'Bea', 'Chris', 'Dana']) {
            await p.fill('#personInput', name).catch(() => {});
            await p.click('#personAdd').catch(() => {});
            await p.waitForTimeout(160);
          }
          await p.fill('#billAmt', '186.40').catch(() => {});
          await p.fill('#taxAmt', '16.32').catch(() => {});
          await p.fill('#tipAmt', '20').catch(() => {});
          await p.waitForTimeout(600);
          await toTop(p, '#dinnerResults', 240);
          await p.waitForTimeout(400);
        },
      },
    ],
  },

  'pdf-tools': {
    panels: [
      {
        slug: 'merge',
        caption: 'Merge without uploading',
        sub: 'iLovePDF and Smallpdf send your document to a server. This one never does.',
        act: async (p) => {
          await pdfLoad(p, ['lease-agreement.pdf', 'renters-insurance.pdf']);
          await toTop(p, '#addCard', 40);
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'reorder',
        caption: 'Every page, in the order you want',
        sub: 'Drag to reorder, rotate, or drop a page. Nine pages here, no limit anywhere.',
        act: async (p) => {
          await pdfLoad(p, ['lease-agreement.pdf', 'renters-insurance.pdf']);
          await p.evaluate(() => {
            const h = [...document.querySelectorAll('h2')].find((e) => /pages/i.test(e.textContent));
            if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 130, behavior: 'instant' });
          });
          await p.waitForTimeout(500);
        },
      },
      {
        slug: 'split',
        caption: 'Split out just the pages you need',
        sub: 'One file per page, a range, or every N pages — as separate PDFs or a zip.',
        act: async (p) => {
          await pdfLoad(p, ['lease-agreement.pdf']);
          await toTop(p, '#outCard', 60);
          await p.waitForTimeout(500);
        },
      },
      {
        slug: 'nolimits',
        caption: 'No task limit, no watermark, no account',
        sub: 'The free tiers everywhere else stop at two files a day. This one has no meter.',
        dark: true,
        act: async (p) => {
          await pdfLoad(p, ['lease-agreement.pdf', 'renters-insurance.pdf']);
          await toTop(p, '#outCard', 60);
          await p.waitForTimeout(500);
        },
      },
    ],
  },

  'seating-chart': {
    panels: [
      {
        slug: 'paste',
        caption: 'Nobody retypes 140 names',
        sub: 'Paste the list straight out of your spreadsheet — parties, meals and allergies with it.',
        act: async (p) => {
          await scStart(p);
          await scAddGuests(p);
          await p.evaluate(() => {
            const h = [...document.querySelectorAll('h2')].find((e) => /guests?\s*·|guests \u00b7|expected/i.test(e.textContent));
            if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 150, behavior: 'instant' });
          });
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'rules',
        caption: 'Say who cannot sit together',
        sub: 'Declare the rules once. Change the guest list later and it shows you exactly what broke.',
        act: async (p) => {
          await scStart(p);
          await scAddGuests(p);
          await scAddTables(p);
          await scTab(p, 'Rules');
          await p.getByRole('button', { name: /add a rule/i }).click().catch(() => {});
          await p.waitForTimeout(700);
        },
      },
      {
        slug: 'floor',
        caption: 'Lay the room out',
        sub: 'Round, rectangle or head table. Drag them where they really are, or use the keyboard.',
        act: async (p) => {
          await scStart(p);
          await scAddGuests(p);
          await scAddTables(p);
          /* The floor plan lives under the add-table row on the Tables tab, so
             framing the top of the tab shows the form and not the room. */
          await p.evaluate(() => {
            const h = [...document.querySelectorAll('h2')].find((e) => /floor plan/i.test(e.textContent));
            if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 150, behavior: 'instant' });
          });
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'print',
        caption: 'PDFs that look like you hired someone',
        sub: 'Escort cards, a table-by-table plan and a caterer’s meal count. No watermark, ever.',
        act: async (p) => {
          await scStart(p);
          await scAddGuests(p);
          await scAddTables(p);
          await scSeatSome(p);
          await scTab(p, 'Print & export');
        },
      },
      {
        slug: 'private',
        caption: 'Your guest list is nobody else’s business',
        sub: 'Allergies and who is not speaking to whom stay on your phone. No account, no upload.',
        dark: true,
        act: async (p) => {
          await scStart(p);
          await scAddGuests(p);
          await toTop(p, 'section.card', 60);
          await p.waitForTimeout(400);
        },
      },
    ],
  },

  'home-inventory': {
    panels: [
      {
        slug: 'capture',
        caption: 'Point, shoot, name, next',
        sub: 'One room at a time. The photo is compressed as it is taken and never uploaded.',
        act: async (p) => {
          await hiStart(p);
          await p.fill('#capName', 'Espresso machine').catch(() => {});
          await p.fill('#capValue', '480').catch(() => {});
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'items',
        caption: 'The list your insurer asks for',
        sub: 'Every item with what it cost, what it would cost to replace, and where it lives.',
        act: async (p) => {
          await hiStart(p);
          await hiCapture(p);
          await hiTab(p, 'Items');
        },
      },
      {
        slug: 'rooms',
        caption: 'Room by room, so nothing is missed',
        sub: 'Walk the house once. The rooms you have not started are the ones still listed empty.',
        act: async (p) => {
          await hiStart(p);
          await hiCapture(p);
          await hiTab(p, 'Rooms');
        },
      },
      {
        slug: 'export',
        caption: 'A PDF claim exhibit, made on your phone',
        sub: 'Full report, an items-by-value exhibit, and a CSV your carrier can actually read.',
        act: async (p) => {
          await hiStart(p);
          await hiCapture(p);
          await hiTab(p, 'Export');
        },
      },
      {
        slug: 'private',
        caption: 'Photographs of everything you own, kept by nobody',
        sub: 'No account, no cloud, no subscription. Sortly and Encircle cannot say that.',
        dark: true,
        act: async (p) => {
          await hiStart(p);
          await hiCapture(p);
          await hiTab(p, 'Items');
        },
      },
    ],
  },

  'sub-plans': {
    panels: [
      {
        slug: 'today',
        caption: 'The binder writes itself',
        sub: 'Fill it once in August. On the sick morning you only have to press print.',
        act: async (p) => {
          await fillBinder(p, Object.keys(SUB_PLANS_BINDER));
          await p.click('#viewToday').catch(() => {});
          await p.waitForTimeout(300);
          await toTop(p, '#form', 90);
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'plan',
        caption: 'The day, hour by hour',
        sub: 'Written in your words, not squeezed into somebody else’s template.',
        act: async (p) => {
          await fillBinder(p, Object.keys(SUB_PLANS_BINDER));
          await p.click('#viewAll').catch(() => {});
          await p.waitForTimeout(300);
          await toTop(p, '#f-plan', 150);
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'emergency',
        caption: 'Allergies and drills, printed where they get read',
        sub: 'Health alerts sit in a heavy black box on page one, tuned for a school photocopier.',
        act: async (p) => {
          await fillBinder(p, Object.keys(SUB_PLANS_BINDER));
          await p.click('#viewAll').catch(() => {});
          await p.waitForTimeout(300);
          await toTop(p, '#f-health', 190);
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'preview',
        caption: 'Read it as your sub would',
        sub: 'Black and white, exactly as it lands on the desk — before you print a page.',
        act: async (p) => {
          await fillBinder(p, Object.keys(SUB_PLANS_BINDER));
          await p.click('#previewBtn').catch(() => {});
          await p.waitForTimeout(900);
        },
      },
      {
        slug: 'free',
        caption: 'Free, offline, nothing uploaded',
        sub: 'No account, no ads, no subscription. Your class list never leaves this device.',
        dark: true,
        act: async (p) => {
          await fillBinder(p, Object.keys(SUB_PLANS_BINDER));
          await p.click('#viewAll').catch(() => {});
          await p.waitForTimeout(300);
          await toTop(p, '#f-teacher', 150);
          await p.waitForTimeout(400);
        },
      },
    ],
  },

  'packing-list': {
    panels: [
      {
        slug: 'presets',
        caption: 'Pack once, forget nothing',
        sub: 'Tap the trip you are taking. The presets combine, and nothing is added twice.',
        act: async (p) => {
          await p.fill('#tripName', 'Tahoe long weekend');
          for (const label of [/essentials/i, /camping/i, /with kids/i]) {
            await p.getByRole('button', { name: label }).click();
            await p.waitForTimeout(180);
          }
          await toTop(p, '#presets', 120);   // the chips are the hook, not the hint above them
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'list',
        caption: 'Grouped the way you pack',
        sub: 'Tick as you go. It saves itself on this phone, with no account anywhere.',
        act: async (p) => {
          await p.fill('#tripName', 'Tahoe long weekend');
          for (const label of [/essentials/i, /camping/i]) {
            await p.getByRole('button', { name: label }).click();
            await p.waitForTimeout(180);
          }
          const boxes = p.locator('#list input[type="checkbox"]');
          const n = Math.min(5, await boxes.count());
          for (let i = 0; i < n; i++) { await boxes.nth(i).check().catch(() => {}); await p.waitForTimeout(90); }
          await toTop(p, '#listCard');
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'custom',
        caption: 'Add the things only you take',
        sub: 'Retainer, dog food, the good charger — they stay for next time.',
        act: async (p) => {
          await p.fill('#tripName', 'Tahoe long weekend');
          await p.getByRole('button', { name: /essentials/i }).click();
          await p.waitForTimeout(200);
          for (const item of ['Dog food', 'The good charger', 'Retainer case']) {
            await p.fill('#customItem', item);
            await p.click('#addBtn');
            await p.waitForTimeout(220);
          }
          /* The point of this panel is the custom items, and they land at the
             bottom of the list — framing the top of the card would show only
             the preset rows the previous panel already showed. */
          await p.evaluate(() => {
            const hit = [...document.querySelectorAll('#list li')]
              .find((li) => /dog food/i.test(li.textContent));
            if (hit) window.scrollTo({ top: hit.getBoundingClientRect().top + window.scrollY - 260, behavior: 'instant' });
          });
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'share',
        caption: 'Send the list to whoever else is packing',
        sub: 'The whole list rides inside the link. Nothing is uploaded to share it.',
        act: async (p) => {
          await p.fill('#tripName', 'Tahoe long weekend');
          await p.getByRole('button', { name: /essentials/i }).click();
          await p.waitForTimeout(250);
          await p.click('#qrBtn').catch(() => {});
          await p.waitForTimeout(700);
        },
      },
      {
        slug: 'dark',
        caption: 'Free, and it stays that way',
        sub: 'No ads, no account, no subscription, and it works with the plane on airplane mode.',
        dark: true,
        act: async (p) => {
          await p.fill('#tripName', 'Tahoe long weekend');
          for (const label of [/essentials/i, /beach/i]) {
            await p.getByRole('button', { name: label }).click();
            await p.waitForTimeout(180);
          }
          await toTop(p, '#listCard');
          await p.waitForTimeout(400);
        },
      },
    ],
  },

  'qr-maker': {
    panels: [
      {
        slug: 'link',
        caption: 'Codes that never expire',
        sub: 'No account, no subscription, no company that can switch your code off',
        act: async (p) => {
          await p.fill('#fields input[type="url"]', 'skywolf.example/menu');
          await p.waitForTimeout(500);
        },
      },
      {
        slug: 'wifi',
        caption: 'Share the WiFi, not the password',
        sub: 'Guests scan and join. The password never leaves this phone.',
        act: async (p) => {
          await p.getByRole('button', { name: /wifi/i }).click();
          await p.waitForTimeout(250);
          const net = p.locator('#fields input').first();
          await net.fill('The Back Garden');
          const pw = p.locator('#fields input').nth(1);
          await pw.fill('sunflower-42');
          await p.waitForTimeout(500);
        },
      },
      {
        slug: 'print',
        caption: 'Sized for what you print on',
        sub: 'It states the real pixel count and DPI, instead of a number it cannot keep',
        act: async (p) => {
          await p.fill('#fields input[type="url"]', 'skywolf.example/menu');
          await p.waitForTimeout(500);
          await toTop(p, '#outputOpts', 60);
          await p.waitForTimeout(300);
        },
      },
      {
        slug: 'batch',
        caption: 'A whole sheet, one paste',
        sub: 'One line each. Every code is named after the line that made it.',
        act: async (p) => {
          await p.fill('#batchIn', [
            'skywolf.example/menu', 'skywolf.example/wine', 'skywolf.example/hours',
            'skywolf.example/book', 'skywolf.example/events', 'skywolf.example/parking',
            'skywolf.example/allergens', 'skywolf.example/feedback',
          ].join('\n'));
          await p.waitForTimeout(700);
          await toTop(p, '#batchCard');
          await p.waitForTimeout(400);
        },
      },
      {
        slug: 'offline',
        caption: 'Works with the WiFi off',
        sub: 'Built on your device, by this page. Nothing you type is ever sent anywhere.',
        dark: true,
        act: async (p) => {
          await p.fill('#fields input[type="url"]', 'skywolf.example/menu');
          await p.waitForTimeout(500);
        },
      },
    ],
  },
};
