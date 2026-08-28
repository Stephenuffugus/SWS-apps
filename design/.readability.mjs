/* Flesch-Kincaid grade over every string a kid actually reads in Diamond
   Rules. Second and third graders are roughly grade 2 to 3. */
import { readFileSync } from 'node:fs';
const src = readFileSync('/workspaces/SWS-apps/apps/diamond-rules/index.html', 'utf8');

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const syll = (w) => {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return (w.match(/[aeiouy]{1,2}/g) || ['x']).length;
};
export function fk(text) {
  const t = strip(text);
  const sentences = (t.match(/[.!?]+/g) || []).length || 1;
  const words = (t.match(/[A-Za-z']+/g) || []);
  if (!words.length) return null;
  const syllables = words.reduce((n, w) => n + syll(w), 0);
  return {
    grade: +(0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59).toFixed(1),
    words: words.length, perSentence: +(words.length / sentences).toFixed(1),
    long: words.filter(w => syll(w) >= 3).length,
  };
}
const fields = ['prompt', 'why', 'tip'];
const rows = [];
for (const f of fields) {
  const re = new RegExp(f + ':\\s*(`|")([\\s\\S]*?)\\1\\s*(?=[,}])', 'g');
  let m;
  while ((m = re.exec(src))) {
    const r = fk(m[2]);
    if (r) rows.push({ f, text: strip(m[2]), ...r });
  }
}
rows.sort((a, b) => b.grade - a.grade);
const avg = (k) => +(rows.reduce((n, r) => n + r[k], 0) / rows.length).toFixed(1);
console.log(`${rows.length} strings | mean grade ${avg('grade')} | mean words ${avg('words')} | mean words/sentence ${avg('perSentence')}`);
console.log(`above grade 4: ${rows.filter(r => r.grade > 4).length}   above grade 6: ${rows.filter(r => r.grade > 6).length}`);
console.log('\nHARDEST TEN:');
for (const r of rows.slice(0, 10)) console.log(`  g${String(r.grade).padStart(5)} ${String(r.words).padStart(3)}w  ${r.text.slice(0, 108)}`);
