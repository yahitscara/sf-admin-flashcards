// Quick sanity check of public/data before you push: counts per file/objective,
// duplicate ids, and question cards that can't be quizzed (no options).
import { readFileSync } from 'node:fs';
const dir = new URL('../public/data/', import.meta.url);
const { files } = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
const seen = new Map();
let bad = 0;
for (const f of files) {
  let d;
  try { d = JSON.parse(readFileSync(new URL(f, dir), 'utf8')); }
  catch (e) { console.log(`✗ ${f}: ${e.message}`); bad++; continue; }
  const noOpts = d.cards.filter((c) => c.type === 'question' && !c.options).length;
  for (const c of d.cards) {
    if (seen.has(c.id)) console.log(`  duplicate id ${c.id} (${seen.get(c.id)} and ${f})`);
    seen.set(c.id, f);
  }
  console.log(`✓ ${f}: ${d.cards.length} cards${noOpts ? `, ${noOpts} questions without options (flashcard only)` : ''}`);
}
console.log(`${seen.size} unique cards`);
process.exit(bad ? 1 : 0);
