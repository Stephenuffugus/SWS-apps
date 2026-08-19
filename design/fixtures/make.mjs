#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO, screenshot fixtures

   The file-transform apps cannot be photographed empty: a PDF merger with no
   PDFs in it is a picture of a button. Headless Chromium has no file picker
   and no camera, so the scenes feed real files through the app's own
   <input type=file>, and those files have to exist and be the same every run,
   or the screenshots drift between renders.

   Generated rather than committed as binaries, so the content is readable in
   the diff and easy to change.

     node design/fixtures/make.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(HERE, { recursive: true });

/* Deliberately dull, realistic paperwork, the kind of thing someone actually
   merges. Nothing here should look like lorem ipsum in a store screenshot. */
const DOCS = [
  {
    file: 'lease-agreement.pdf',
    title: 'RESIDENTIAL LEASE AGREEMENT',
    sub: '148 Oak Street, Apartment 3B',
    pages: [
      ['1. PARTIES AND PREMISES', 'This Agreement is made between the Landlord and the Tenant',
        'for the premises described above, together with the parking', 'space numbered 3B and one storage locker in the basement.'],
      ['2. TERM', 'The term begins on 1 September 2026 and ends on 31 August 2027,',
        'unless terminated earlier under the provisions of Section 9.'],
      ['3. RENT', 'Rent is payable monthly in advance on the first day of each month.',
        'Late payment after the fifth day incurs the fee stated in Schedule A.'],
      ['4. SECURITY DEPOSIT', 'The deposit is held in a separate account and returned within',
        'thirty days of the end of the tenancy, less lawful deductions.'],
      ['5. CONDITION AND REPAIRS', 'The Tenant accepts the premises in the condition recorded in the',
        'move-in report attached as Schedule B, photographs included.'],
      ['6. SIGNATURES', 'Landlord ______________________  Date ____________',
        'Tenant   ______________________  Date ____________'],
    ],
  },
  {
    file: 'renters-insurance.pdf',
    title: 'CERTIFICATE OF RENTERS INSURANCE',
    sub: 'Policy HO4-2026-88431',
    pages: [
      ['COVERAGE SUMMARY', 'Personal property           $30,000',
        'Personal liability          $100,000', 'Loss of use                 $9,000',
        'Deductible                  $500'],
      ['NAMED INSURED', 'Effective 1 September 2026 through 31 August 2027.',
        'The landlord named above is listed as an interested party and',
        'will be notified of cancellation or non-renewal.'],
      ['SCHEDULED ITEMS', 'Bicycle, road, carbon frame        $1,250',
        'Laptop, 14 inch                    $1,999', 'Jewellery, inherited, appraised     $2,200'],
    ],
  },
];

for (const doc of DOCS) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);

  doc.pages.forEach((lines, i) => {
    const page = pdf.addPage([612, 792]);           // US Letter
    page.drawText(doc.title, { x: 64, y: 716, size: 13, font: bold, color: rgb(0.1, 0.1, 0.12) });
    page.drawText(doc.sub, { x: 64, y: 698, size: 9.5, font: body, color: rgb(0.42, 0.42, 0.46) });
    page.drawLine({ start: { x: 64, y: 686 }, end: { x: 548, y: 686 }, thickness: 0.75, color: rgb(0.78, 0.78, 0.82) });

    lines.forEach((line, j) => {
      page.drawText(line, {
        x: 64, y: 640 - j * 22,
        size: j === 0 ? 11.5 : 10.5,
        font: j === 0 ? bold : body,
        color: rgb(0.13, 0.13, 0.16),
      });
    });

    page.drawText(`Page ${i + 1} of ${doc.pages.length}`,
      { x: 64, y: 56, size: 8.5, font: body, color: rgb(0.55, 0.55, 0.6) });
  });

  writeFileSync(join(HERE, doc.file), await pdf.save());
  console.log(`  ${doc.file.padEnd(26)} ${doc.pages.length} pages`);
}

console.log(`\n${DOCS.length} fixture(s) written to design/fixtures/`);
