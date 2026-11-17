import './style.css';
import {
  OBJECTIVES, objectiveLabel, loadLibrary, validateDeck, loadLocalDecks, saveLocalDecks,
  deckToJson, mergeDecks, type Card, type Deck, type Library,
} from './cards';
import {
  getMark, setMark, resetProgress, isWeak, filters, setFilters, applyFilters, filtersActive,
  EMPTY_FILTERS, type Mark,
} from './store';

const app = document.getElementById('app')!;
let lib: Library = { decks: [], cards: [], warnings: [] };

// ---------- helpers ----------

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const byId = (id: string): Card | undefined => lib.cards.find((c) => c.id === id);
const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 100) : 0);
const MARK_LABEL: Record<Mark, string> = { got: 'Got it', unsure: 'Unsure', missed: 'Missed' };

function markBadge(id: string): string {
  const m = getMark(id);
  return m ? `<span class="badge mark-${m}">${MARK_LABEL[m]}</span>` : '';
}

function cardMeta(c: Card): string {
  return `<div class="meta">
    <span class="badge obj">${esc(objectiveLabel(c.objective))}</span>
    <span class="badge">${esc(c.type)}</span>
    ${c.missed ? '<span class="badge warn">missed on exam</span>' : ''}
    ${markBadge(c.id)}
  </div>`;
}

function linkHost(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
}

function cardBack(c: Card): string {
  return `<div class="back">
    <div class="answer"><h4>Answer</h4>
      ${c.answer.length > 1 ? `<ul>${c.answer.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : `<p>${esc(c.answer[0])}</p>`}
    </div>
    <div class="why"><h4>Why</h4><p>${esc(c.why)}</p></div>
    ${c.traps ? `<div class="traps"><h4>Trap</h4><p>${esc(c.traps)}</p></div>` : ''}
    ${c.strip ? `<div class="strip"><h4>Strip</h4><p>${esc(c.strip)}</p></div>` : ''}
    ${c.translate ? `<div class="plain"><h4>In plain English</h4><dl>${([
      ['Situation', c.translate.situation], ['Salesforce calls it', c.translate.feature],
      ["What you'd see", c.translate.see], ['Not the other one', c.translate.notOther],
    ] as const).filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v!)}</dd>`).join('')}</dl></div>` : ''}
    ${c.links ? `<div class="links"><h4>Sources</h4>${c.links.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(linkHost(u))}</a>`).join(' · ')}</div>` : ''}
    <div class="src">${esc(c.source)} · ${esc(c.id)}${c.tags.length ? ' · ' + c.tags.map(esc).join(', ') : ''}</div>
  </div>`;
}

// ---------- filter bar (shared by every mode) ----------

function filterBar(deckSize: number): string {
  const sources = lib.decks.map((d) => d.source);
  const tags = [...new Set(lib.cards.flatMap((c) => c.tags))].sort();
  const opt = (v: string, label: string, cur: string) =>
    `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  const active = filtersActive();
  return `<details class="filters" ${active ? 'open' : ''}>
    <summary>Filters ${active ? '<span class="dot"></span>' : ''}<span class="count">${deckSize} cards</span></summary>
    <div class="filter-grid">
      <select data-f="objective">${opt('', 'All objectives', filters.objective)}${OBJECTIVES.map((o) => opt(o.key, o.label, filters.objective)).join('')}</select>
      <select data-f="source">${opt('', 'All sources', filters.source)}${sources.map((s) => opt(s, s, filters.source)).join('')}</select>
      <select data-f="type">${opt('', 'All types', filters.type)}${['question', 'concept', 'objective'].map((t) => opt(t, t, filters.type)).join('')}</select>
      <select data-f="tag">${opt('', 'All tags', filters.tag)}${tags.map((t) => opt(t, t, filters.tag)).join('')}</select>
      <input type="search" data-f="search" placeholder="Search prompt, answer, why…" value="${esc(filters.search)}">
      ${active ? '<button class="ghost small" data-act="clear-filters">Clear filters</button>' : ''}
    </div>
  </details>`;
}

let searchTimer = 0;
function wireFilters(): void {
  app.querySelectorAll<HTMLSelectElement>('select[data-f]').forEach((el) =>
    el.addEventListener('change', () => {
      setFilters({ [el.dataset.f!]: el.value });
      render();
    }),
  );
  const search = app.querySelector<HTMLInputElement>('input[data-f="search"]');
  search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      setFilters({ search: search.value });
      render();
      // Re-rendering replaces the input; put the cursor back.
      const again = app.querySelector<HTMLInputElement>('input[data-f="search"]');
      if (again) {
        again.focus();
        again.setSelectionRange(again.value.length, again.value.length);
      }
    }, 300);
  });
  app.querySelector('[data-act="clear-filters"]')?.addEventListener('click', () => {
    setFilters(EMPTY_FILTERS);
    render();
  });
}

// ---------- dashboard ----------

let confirmReset = false;

function viewDashboard(): string {
  const all = lib.cards;
  const count = (m: Mark) => all.filter((c) => getMark(c.id) === m).length;
  const weak = all.filter(isWeak).length;
  const quizzable = all.filter((c) => c.options).length;

  const rows = OBJECTIVES.map((o) => {
    const cs = all.filter((c) => c.objective === o.key);
    const got = cs.filter((c) => getMark(c.id) === 'got').length;
    const uns = cs.filter((c) => getMark(c.id) === 'unsure').length;
    const mis = cs.filter((c) => getMark(c.id) === 'missed').length;
    const n = cs.length || 1;
    return `<button class="obj-row" data-obj="${o.key}">
      <div class="obj-head"><span>${esc(o.label)}</span><span class="weight">${o.weight}%</span></div>
      <div class="bar" title="Got ${got} · Unsure ${uns} · Missed ${mis}">
        <i class="got" style="width:${(got / n) * 100}%"></i><i class="unsure" style="width:${(uns / n) * 100}%"></i><i class="missed" style="width:${(mis / n) * 100}%"></i>
      </div>
      <div class="obj-foot">${got} / ${cs.length} got it${cs.filter(isWeak).length ? ` · ${cs.filter(isWeak).length} weak` : ''}</div>
    </button>`;
  }).join('');

  return `<section class="dash">
    <div class="stats">
      <div class="stat"><b>${all.length}</b><span>cards</span></div>
      <div class="stat got"><b>${count('got')}</b><span>got it</span></div>
      <div class="stat unsure"><b>${count('unsure')}</b><span>unsure</span></div>
      <div class="stat missed"><b>${count('missed')}</b><span>missed</span></div>
    </div>
    <div class="quick">
      <a class="btn" href="#/flash">Flashcards</a>
      <a class="btn" href="#/quiz">Quiz <small>${quizzable}</small></a>
      <a class="btn" href="#/strip">Strip drill</a>
      <a class="btn warn" href="#/weak">Weak spots <small>${weak}</small></a>
    </div>
    <h2>By objective</h2>
    <p class="hint">Tap an objective to study just that one. Exam: 60 Qs · 105 min · 68% to pass.</p>
    <div class="objs">${rows}</div>
    <h2>Sources</h2>
    <ul class="sources">${lib.decks.map((d) => `<li><b>${esc(d.title)}</b> <span class="muted">${esc(d.source)} · ${d.cards.length} cards${d.local ? ' · local' : ''}</span>${d.note ? `<div class="muted small">${esc(d.note)}</div>` : ''}</li>`).join('')}</ul>
    ${lib.warnings.length ? `<details class="warnings"><summary>${lib.warnings.length} load warning(s)</summary><ul>${lib.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
    <div class="reset">
      ${confirmReset
        ? '<span>Erase all Got it / Unsure / Missed marks on this device?</span><button class="danger" data-act="reset-yes">Yes, reset</button><button class="ghost" data-act="reset-no">Cancel</button>'
        : '<button class="ghost small" data-act="reset">Reset progress</button>'}
    </div>
  </section>`;
}

function wireDashboard(): void {
  app.querySelectorAll<HTMLButtonElement>('.obj-row').forEach((el) =>
    el.addEventListener('click', () => {
      setFilters({ ...EMPTY_FILTERS, objective: el.dataset.obj! });
      location.hash = '#/flash';
    }),
  );
  app.querySelector('[data-act="reset"]')?.addEventListener('click', () => { confirmReset = true; render(); });
  app.querySelector('[data-act="reset-no"]')?.addEventListener('click', () => { confirmReset = false; render(); });
  app.querySelector('[data-act="reset-yes"]')?.addEventListener('click', () => {
    resetProgress();
    confirmReset = false;
    render();
  });
}

// ---------- flashcards + weak spots ----------

interface FlashSession { key: string; ids: string[]; i: number; flipped: boolean; }
let flash: FlashSession | null = null;

function flashDeck(weak: boolean): Card[] {
  const cs = applyFilters(lib.cards);
  return weak ? cs.filter(isWeak) : cs;
}

function ensureFlash(weak: boolean): FlashSession {
  const deck = flashDeck(weak);
  const key = (weak ? 'weak|' : 'flash|') + JSON.stringify(filters);
  if (!flash || flash.key !== key) {
    // Exam-missed cards float to the front of a fresh shuffle.
    const ids = shuffle(deck).sort((a, b) => Number(b.missed) - Number(a.missed)).map((c) => c.id);
    flash = { key, ids, i: 0, flipped: false };
  }
  return flash;
}

function viewFlash(weak: boolean): string {
  const s = ensureFlash(weak);
  const head = `<h1>${weak ? 'Weak spots' : 'Flashcards'}</h1>${filterBar(s.ids.length)}`;
  if (!s.ids.length) {
    return head + `<div class="empty">${weak ? 'No weak spots in this filter. Nice. Cards land here when you mark them Missed or Unsure.' : 'No cards match these filters.'}</div>`;
  }
  if (s.i >= s.ids.length) {
    return head + `<div class="empty"><p>End of deck: ${s.ids.length} cards.</p><button data-act="restart">Shuffle and go again</button> <a class="btn ghost" href="#/">Dashboard</a></div>`;
  }
  const c = byId(s.ids[s.i])!;
  return head + `<div class="progress-line">${s.i + 1} / ${s.ids.length}</div>
    <article class="card ${s.flipped ? 'flipped' : ''}" data-act="flip" tabindex="0">
      ${cardMeta(c)}
      <p class="prompt">${esc(c.prompt)}</p>
      ${c.options && !s.flipped ? `<ul class="opts-preview">${c.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
      ${s.flipped ? cardBack(c) : '<div class="tap">Tap to flip</div>'}
    </article>
    <div class="marks">
      <button class="m-missed" data-mark="missed">Missed <kbd>1</kbd></button>
      <button class="m-unsure" data-mark="unsure">Unsure <kbd>2</kbd></button>
      <button class="m-got" data-mark="got">Got it <kbd>3</kbd></button>
    </div>
    <div class="nav-row">
      <button class="ghost" data-act="prev" ${s.i === 0 ? 'disabled' : ''}>← Prev</button>
      <button class="ghost" data-act="shuffle">Shuffle</button>
      <button class="ghost" data-act="next">Skip →</button>
    </div>`;
}

function wireFlash(weak: boolean): void {
  const s = flash!;
  app.querySelector('[data-act="flip"]')?.addEventListener('click', () => { s.flipped = !s.flipped; render(); });
  app.querySelectorAll<HTMLButtonElement>('[data-mark]').forEach((b) =>
    b.addEventListener('click', () => markAndNext(b.dataset.mark as Mark)),
  );
  app.querySelector('[data-act="prev"]')?.addEventListener('click', () => go(-1));
  app.querySelector('[data-act="next"]')?.addEventListener('click', () => go(1));
  const reshuffle = () => { flash = null; ensureFlash(weak); render(); };
  app.querySelector('[data-act="shuffle"]')?.addEventListener('click', reshuffle);
  app.querySelector('[data-act="restart"]')?.addEventListener('click', reshuffle);
}

function go(delta: number): void {
  if (!flash) return;
  flash.i = Math.max(0, Math.min(flash.ids.length, flash.i + delta));
  flash.flipped = false;
  render();
}

function markAndNext(m: Mark): void {
  if (!flash || flash.i >= flash.ids.length) return;
  setMark(flash.ids[flash.i], m);
  // In weak-spots mode the deck key stays the same, so the session continues even
  // though a card marked "got" is no longer weak; it drops out next session.
  go(1);
}

// ---------- quiz ----------

interface QuizAnswer { id: string; chosen: string[]; correct: boolean; }
interface QuizSession { ids: string[]; i: number; options: string[]; answers: QuizAnswer[]; submitted: boolean; }
let quiz: QuizSession | null = null;
let quizLen = 20;

function quizPool(): Card[] {
  return applyFilters(lib.cards).filter((c) => c.options);
}

function startQuiz(): void {
  const pool = shuffle(quizPool());
  const ids = (quizLen > 0 ? pool.slice(0, quizLen) : pool).map((c) => c.id);
  quiz = { ids, i: 0, options: [], answers: [], submitted: false };
  loadQuizOptions();
}

function loadQuizOptions(): void {
  if (!quiz || quiz.i >= quiz.ids.length) return;
  quiz.options = shuffle(byId(quiz.ids[quiz.i])!.options!);
  quiz.submitted = false;
}

function viewQuiz(): string {
  if (!quiz) {
    const pool = quizPool();
    const lens = [10, 20, 30, 60, 0];
    return `<h1>Quiz</h1>${filterBar(pool.length)}
      <div class="panel">
        <p>${pool.length} multiple-choice questions match your filters.</p>
        <p class="hint">Only cards with answer options can be quizzed. Wrong answers mark the card Missed; right ones mark it Got it.</p>
        <div class="seg">${lens.map((n) => `<button class="${quizLen === n ? 'on' : ''}" data-len="${n}">${n || 'All'}</button>`).join('')}</div>
        <button class="primary" data-act="start" ${pool.length ? '' : 'disabled'}>Start quiz</button>
      </div>`;
  }
  if (quiz.i >= quiz.ids.length) return viewQuizResults();
  const c = byId(quiz.ids[quiz.i])!;
  const n = c.answer.length;
  const multi = n > 1;
  const last = quiz.answers[quiz.i];
  const optHtml = quiz.options.map((o, k) => {
    let cls = '';
    if (quiz!.submitted) {
      const isAns = c.answer.includes(o);
      const chosen = last?.chosen.includes(o);
      cls = isAns ? 'right' : chosen ? 'wrong' : '';
    }
    return `<label class="opt ${cls}">
      <input type="${multi ? 'checkbox' : 'radio'}" name="q" value="${k}" ${quiz!.submitted ? 'disabled' : ''} ${last?.chosen.includes(o) ? 'checked' : ''}>
      <span>${esc(o)}</span></label>`;
  }).join('');
  return `<h1>Quiz</h1>
    <div class="progress-line">Question ${quiz.i + 1} / ${quiz.ids.length} · ${quiz.answers.filter((a) => a.correct).length} right so far</div>
    <article class="card">
      ${cardMeta(c)}
      <p class="prompt">${esc(c.prompt)}</p>
      ${multi ? `<p class="choose">Choose ${n}</p>` : ''}
      <form class="opts">${optHtml}</form>
      ${quiz.submitted ? `<div class="verdict ${last.correct ? 'right' : 'wrong'}">${last.correct ? 'Correct' : 'Not quite'}</div>${cardBack(c)}` : ''}
    </article>
    <div class="nav-row">
      <button class="ghost" data-act="quit">End quiz</button>
      ${quiz.submitted
        ? `<button class="primary" data-act="qnext">${quiz.i + 1 < quiz.ids.length ? 'Next →' : 'See score'}</button>`
        : '<button class="primary" data-act="submit">Submit</button>'}
    </div>`;
}

function viewQuizResults(): string {
  const q = quiz!;
  const total = q.answers.length;
  const right = q.answers.filter((a) => a.correct).length;
  // Weighted like the real exam: each objective's % correct counts by its exam weight,
  // normalized over the objectives this quiz actually covered.
  let wSum = 0, wScore = 0;
  const rows = OBJECTIVES.map((o) => {
    const as = q.answers.filter((a) => byId(a.id)?.objective === o.key);
    if (!as.length) return '';
    const r = as.filter((a) => a.correct).length;
    wSum += o.weight;
    wScore += o.weight * (r / as.length);
    return `<tr><td>${esc(o.label)}</td><td>${o.weight}%</td><td>${r}/${as.length}</td><td><b>${pct(r, as.length)}%</b></td></tr>`;
  }).join('');
  const weighted = wSum ? Math.round((wScore / wSum) * 100) : 0;
  const verdict = weighted >= 95 ? 'At the 95% practice target.' : weighted >= 68 ? 'Passing (68%), but under the 95% practice target.' : 'Below the 68% pass line.';
  const missed = q.answers.filter((a) => !a.correct);
  return `<h1>Quiz results</h1>
    <div class="score ${weighted >= 95 ? 'great' : weighted >= 68 ? 'ok' : 'low'}">
      <div><b>${weighted}%</b><span>weighted</span></div>
      <div><b>${right}/${total}</b><span>raw (${pct(right, total)}%)</span></div>
    </div>
    <p class="center">${verdict}</p>
    <table class="results"><thead><tr><th>Objective</th><th>Weight</th><th>Score</th><th>%</th></tr></thead><tbody>${rows}</tbody></table>
    ${missed.length ? `<h2>Missed (${missed.length})</h2><div class="review">${missed.map((a) => {
      const c = byId(a.id)!;
      return `<details class="card"><summary>${esc(c.prompt)}</summary><p class="muted">You chose: ${a.chosen.map(esc).join('; ') || '(nothing)'}</p>${cardBack(c)}</details>`;
    }).join('')}</div>` : ''}
    <div class="nav-row"><button class="primary" data-act="again">New quiz</button><a class="btn ghost" href="#/weak">Weak spots</a></div>`;
}

function wireQuiz(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-len]').forEach((b) =>
    b.addEventListener('click', () => { quizLen = Number(b.dataset.len); render(); }),
  );
  app.querySelector('[data-act="start"]')?.addEventListener('click', () => { startQuiz(); render(); });
  app.querySelector('[data-act="again"]')?.addEventListener('click', () => { quiz = null; render(); });
  app.querySelector('[data-act="quit"]')?.addEventListener('click', () => {
    if (!quiz) return;
    // End early: score what was answered so far.
    if (quiz.submitted) quiz.i++;
    quiz.ids = quiz.ids.slice(0, quiz.answers.length);
    quiz.i = quiz.ids.length;
    if (!quiz.answers.length) quiz = null;
    render();
  });
  app.querySelector('[data-act="submit"]')?.addEventListener('click', submitQuiz);
  app.querySelector('[data-act="qnext"]')?.addEventListener('click', () => {
    quiz!.i++;
    loadQuizOptions();
    render();
    window.scrollTo(0, 0);
  });
}

function submitQuiz(): void {
  const q = quiz!;
  const c = byId(q.ids[q.i])!;
  const chosen = [...app.querySelectorAll<HTMLInputElement>('.opts input:checked')].map((el) => q.options[Number(el.value)]);
  if (!chosen.length) return;
  const correct = chosen.length === c.answer.length && chosen.every((x) => c.answer.includes(x));
  q.answers[q.i] = { id: c.id, chosen, correct };
  q.submitted = true;
  setMark(c.id, correct ? 'got' : 'missed');
  render();
}

// ---------- strip drill ----------

interface StripSession { key: string; ids: string[]; i: number; revealed: boolean; draft: string; }
let strip: StripSession | null = null;
let stripOnly = true;

function viewStrip(): string {
  const deck = applyFilters(lib.cards).filter((c) => !stripOnly || c.strip);
  const key = JSON.stringify(filters) + stripOnly;
  if (!strip || strip.key !== key) strip = { key, ids: shuffle(deck).map((c) => c.id), i: 0, revealed: false, draft: '' };
  const s = strip;
  const head = `<h1>Strip drill</h1>${filterBar(s.ids.length)}
    <label class="toggle"><input type="checkbox" data-act="strip-only" ${stripOnly ? 'checked' : ''}> Only cards with a strip line</label>`;
  if (!s.ids.length) return head + '<div class="empty">No cards match.</div>';
  if (s.i >= s.ids.length) return head + '<div class="empty"><p>Done with this set.</p><button data-act="sagain">Go again</button></div>';
  const c = byId(s.ids[s.i])!;
  return head + `<div class="progress-line">${s.i + 1} / ${s.ids.length}</div>
    <article class="card">
      ${cardMeta(c)}
      <p class="prompt">${esc(c.prompt)}</p>
      <p class="hint">Strip it: <b>subject</b> · <b>verb</b> · <b>condition</b> · <b>traps</b>. What is it really asking?</p>
      <textarea data-act="draft" rows="4" placeholder="Your strip…" ${s.revealed ? 'readonly' : ''}>${esc(s.draft)}</textarea>
      ${s.revealed ? `${c.strip ? `<div class="strip big"><h4>Card's strip</h4><p>${esc(c.strip)}</p></div>` : '<p class="muted">This card has no strip line yet.</p>'}
        <details><summary>Show full answer</summary>${cardBack(c)}</details>` : ''}
    </article>
    <div class="nav-row">
      ${s.revealed ? '<button class="primary" data-act="snext">Next →</button>' : '<button class="primary" data-act="reveal">Reveal</button>'}
    </div>`;
}

function wireStrip(): void {
  app.querySelector('[data-act="strip-only"]')?.addEventListener('change', (e) => {
    stripOnly = (e.target as HTMLInputElement).checked;
    render();
  });
  app.querySelector<HTMLTextAreaElement>('[data-act="draft"]')?.addEventListener('input', (e) => {
    strip!.draft = (e.target as HTMLTextAreaElement).value;
  });
  app.querySelector('[data-act="reveal"]')?.addEventListener('click', () => { strip!.revealed = true; render(); });
  app.querySelector('[data-act="snext"]')?.addEventListener('click', () => {
    Object.assign(strip!, { i: strip!.i + 1, revealed: false, draft: '' });
    render();
    app.querySelector<HTMLTextAreaElement>('[data-act="draft"]')?.focus();
  });
  app.querySelector('[data-act="sagain"]')?.addEventListener('click', () => { strip = null; render(); });
}

// ---------- import / export ----------

let importText = '';
let importPreview: { deck: Deck; skipped: string[]; dupes: string[] } | null = null;
let importMsg = '';

function viewImport(): string {
  const locals = loadLocalDecks();
  const p = importPreview;
  const counts = p ? OBJECTIVES.map((o) => [o.label, p.deck.cards.filter((c) => c.objective === o.key).length] as const).filter(([, n]) => n) : [];
  return `<h1>Import cards</h1>
    <p class="hint">Paste an <code>exam-N.json</code> file (same format as the seed files). It's saved in this browser and shows up right away. To get it on every device, export it, drop it in <code>public/data/</code>, add it to <code>manifest.json</code>, and push.</p>
    <textarea class="json" data-act="itext" rows="10" placeholder='{"source": "exam-3", "title": "...", "cards": [ ... ]}'>${esc(importText)}</textarea>
    <div class="nav-row">
      <label class="btn ghost file">Load file…<input type="file" accept=".json,application/json" data-act="ifile" hidden></label>
      <button data-act="validate">Validate</button>
    </div>
    ${importMsg ? `<div class="msg">${esc(importMsg)}</div>` : ''}
    ${p ? `<div class="panel">
      <h3>${esc(p.deck.title)} <span class="muted">(${esc(p.deck.source)})</span></h3>
      <p><b>${p.deck.cards.length}</b> valid cards${p.skipped.length ? `, <b class="bad">${p.skipped.length} skipped</b>` : ''}.</p>
      <ul>${counts.map(([l, n]) => `<li>${esc(l)}: ${n}</li>`).join('')}</ul>
      ${p.skipped.length ? `<details><summary>Skipped cards</summary><ul>${p.skipped.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}
      ${p.dupes.length ? `<p class="warnbox">These ids already exist; the imported version will win: ${p.dupes.map(esc).join(', ')}</p>` : ''}
      ${locals.some((d) => d.source === p.deck.source) ? `<p class="warnbox">Replaces your existing local deck "${esc(p.deck.source)}".</p>` : ''}
      <button class="primary" data-act="save" ${p.deck.cards.length ? '' : 'disabled'}>Save deck</button>
    </div>` : ''}
    <h2>Local decks on this device</h2>
    ${locals.length ? `<ul class="sources">${locals.map((d) => `<li><b>${esc(d.title)}</b> <span class="muted">${esc(d.source)} · ${d.cards.length} cards</span>
        <button class="ghost small" data-export="${esc(d.source)}">Export</button>
        <button class="ghost small danger-text" data-remove="${esc(d.source)}">Remove</button></li>`).join('')}</ul>
      <button data-act="export-all">Export all local decks</button>` : '<p class="muted">None yet.</p>'}`;
}

function download(name: string, data: object): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function wireImport(): void {
  const ta = app.querySelector<HTMLTextAreaElement>('[data-act="itext"]')!;
  ta.addEventListener('input', () => { importText = ta.value; });
  app.querySelector<HTMLInputElement>('[data-act="ifile"]')?.addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    importText = await f.text();
    doValidate();
  });
  app.querySelector('[data-act="validate"]')?.addEventListener('click', doValidate);
  app.querySelector('[data-act="save"]')?.addEventListener('click', async () => {
    if (!importPreview) return;
    const locals = loadLocalDecks().filter((d) => d.source !== importPreview!.deck.source);
    try {
      saveLocalDecks([...locals, importPreview.deck]);
      importMsg = `Saved "${importPreview.deck.source}" with ${importPreview.deck.cards.length} cards.`;
      importPreview = null;
      importText = '';
      await reload();
    } catch (err) {
      importMsg = (err as Error).message;
      render();
    }
  });
  app.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((b) =>
    b.addEventListener('click', () => {
      const d = loadLocalDecks().find((x) => x.source === b.dataset.export);
      if (d) download(`${d.source}.json`, deckToJson(d));
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (b.dataset.confirm !== '1') {
        b.dataset.confirm = '1';
        b.textContent = 'Tap again to remove';
        return;
      }
      saveLocalDecks(loadLocalDecks().filter((x) => x.source !== b.dataset.remove));
      importMsg = `Removed "${b.dataset.remove}".`;
      await reload();
    }),
  );
  app.querySelector('[data-act="export-all"]')?.addEventListener('click', () => {
    loadLocalDecks().forEach((d, i) => setTimeout(() => download(`${d.source}.json`, deckToJson(d)), i * 300));
  });
}

function doValidate(): void {
  importMsg = '';
  importPreview = null;
  let raw: unknown;
  try {
    raw = JSON.parse(importText);
  } catch (e) {
    importMsg = `Not valid JSON: ${(e as Error).message}`;
    render();
    return;
  }
  const r = validateDeck(raw, 'pasted file');
  if (!r.deck) {
    importMsg = r.skipped.join('; ');
  } else {
    // Ids that collide with cards from *other* decks (replacing the same local deck isn't a dupe).
    const others = lib.decks.filter((d) => !(d.local && d.source === r.deck!.source));
    const existing = new Set(mergeDecks(others).cards.map((c) => c.id));
    const dupes = r.deck.cards.filter((c) => existing.has(c.id)).map((c) => c.id);
    importPreview = { deck: r.deck, skipped: r.skipped, dupes };
  }
  render();
}

// ---------- router ----------

const ROUTES = [
  { hash: '#/', label: 'Home', icon: '◧' },
  { hash: '#/flash', label: 'Cards', icon: '❐' },
  { hash: '#/quiz', label: 'Quiz', icon: '✓' },
  { hash: '#/strip', label: 'Strip', icon: '✎' },
  { hash: '#/weak', label: 'Weak', icon: '⚑' },
  { hash: '#/import', label: 'Import', icon: '⇪' },
];

function route(): string {
  const h = location.hash || '#/';
  return ROUTES.some((r) => r.hash === h) ? h : '#/';
}

function render(): void {
  const r = route();
  const nav = `<nav class="tabs">${ROUTES.map((x) => `<a href="${x.hash}" class="${x.hash === r ? 'on' : ''}"><span>${x.icon}</span>${x.label}</a>`).join('')}</nav>`;
  let body = '';
  switch (r) {
    case '#/flash': body = viewFlash(false); break;
    case '#/weak': body = viewFlash(true); break;
    case '#/quiz': body = viewQuiz(); break;
    case '#/strip': body = viewStrip(); break;
    case '#/import': body = viewImport(); break;
    default: body = viewDashboard();
  }
  app.innerHTML = `<header class="top"><a href="#/" class="brand">SF Admin Flashcards</a></header>${nav}<main>${body}</main>`;
  if (r !== '#/' && r !== '#/import') wireFilters();
  switch (r) {
    case '#/flash': wireFlash(false); break;
    case '#/weak': wireFlash(true); break;
    case '#/quiz': wireQuiz(); break;
    case '#/strip': wireStrip(); break;
    case '#/import': wireImport(); break;
    default: wireDashboard();
  }
}

async function reload(): Promise<void> {
  lib = await loadLibrary();
  flash = null;
  strip = null;
  render();
}

// Keyboard shortcuts for laptop study: space/enter flip, 1-3 mark, arrows move.
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.matches('input, textarea, select')) return;
  const r = route();
  if (r !== '#/flash' && r !== '#/weak') return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (flash) { flash.flipped = !flash.flipped; render(); } }
  else if (e.key === '1') markAndNext('missed');
  else if (e.key === '2') markAndNext('unsure');
  else if (e.key === '3') markAndNext('got');
  else if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
});

window.addEventListener('hashchange', () => { confirmReset = false; render(); window.scrollTo(0, 0); });

app.innerHTML = '<p class="loading">Loading cards…</p>';
reload();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[sw] register failed', e));
}
