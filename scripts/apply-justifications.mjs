// Merge justification patches into the deck files.
// Usage: node scripts/apply-justifications.mjs patch1.json [patch2.json ...]
//
// A patch is { "<card id>": { why?, wrong?: {<option text>: note}, traps?, strip?, links?,
//                             prompt?, options?, answer?, flag? } }.
// prompt/options/answer are only accepted for cards that had no options (they turn a
// flashcard-only card into a quizzable one). The answer key of existing quiz cards is
// never changed; `flag` is printed for review and not stored.
import { readFileSync, writeFileSync } from 'node:fs';

const DATA = new URL('../public/data/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', DATA), 'utf8'));
const decks = Object.fromEntries(manifest.files.map((f) => [f, JSON.parse(readFileSync(new URL(f, DATA), 'utf8'))]));
const byId = new Map();
for (const [f, d] of Object.entries(decks)) for (const c of d.cards) byId.set(c.id, { f, c });

const problems = [];
const flags = [];
const touched = new Set();
let applied = 0;
const str = (v) => typeof v === 'string' && v.trim() !== '';

for (const path of process.argv.slice(2)) {
  const patch = JSON.parse(readFileSync(path, 'utf8'));
  for (const [id, p] of Object.entries(patch)) {
    const hit = byId.get(id);
    if (!hit) { problems.push(`${path}: unknown id ${id}`); continue; }
    const { f, c } = hit;
    if (p.flag) flags.push(`${id}: ${p.flag}`);

    if (p.options || p.prompt || p.answer) {
      if (c.options) { problems.push(`${id}: patch tries to change an existing quiz card's question; ignored`); }
      else if (!Array.isArray(p.options) || p.options.length < 2 || !Array.isArray(p.answer) || !p.answer.length
        || !p.answer.every((a) => p.options.includes(a)) || !str(p.prompt)) {
        problems.push(`${id}: new prompt/options/answer incomplete or answer not in options; skipped card`);
        continue;
      } else {
        c.prompt = p.prompt;
        c.options = p.options;
        c.answer = p.answer;
      }
    }
    if (str(p.why)) c.why = p.why;
    if (str(p.traps)) c.traps = p.traps;
    if (str(p.strip)) c.strip = p.strip;
    if (Array.isArray(p.links)) {
      // Reference links are appended (existing ones kept first), https only, no duplicates.
      const add = p.links.filter((u) => str(u) && u.startsWith('https://'));
      c.links = [...new Set([...(c.links || []), ...add])];
    }
    if (p.wrong && c.options) {
      const wrong = {};
      for (const [opt, note] of Object.entries(p.wrong)) {
        if (!c.options.includes(opt)) problems.push(`${id}: wrong-note key is not an option: "${opt.slice(0, 60)}"`);
        else if (c.answer.includes(opt)) problems.push(`${id}: wrong-note given for a correct answer: "${opt.slice(0, 60)}"`);
        else if (str(note)) wrong[opt] = note;
      }
      const missing = c.options.filter((o) => !c.answer.includes(o) && !wrong[o]);
      if (missing.length) problems.push(`${id}: ${missing.length} wrong option(s) without a note`);
      if (Object.keys(wrong).length) c.wrong = wrong;
    }
    touched.add(f);
    applied++;
  }
}

for (const f of touched) writeFileSync(new URL(f, DATA), JSON.stringify(decks[f], null, 2) + '\n');
console.log(`applied ${applied} card patches across ${touched.size} file(s)`);
if (problems.length) console.log(`\n${problems.length} problem(s):\n- ` + problems.join('\n- '));
if (flags.length) console.log(`\n${flags.length} flag(s) to review:\n- ` + flags.join('\n- '));
