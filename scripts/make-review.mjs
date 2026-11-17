// Builds a one-page answer review (right answers in green, wrong crossed out).
// Usage: node scripts/make-review.mjs public/data/exam-7.json ../exam-reviews/exam-7-review.html
import { readFileSync, writeFileSync } from 'node:fs';

const [, , src, out] = process.argv;
const d = JSON.parse(readFileSync(src, 'utf8'));
const LABELS = {
  'config-setup': 'Config & Setup', 'data-analytics': 'Data & Analytics', productivity: 'Productivity',
  service: 'Service', 'object-manager': 'Object Manager', 'sales-marketing': 'Sales & Marketing',
  automation: 'Automation', agentforce: 'Agentforce',
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

const total = d.cards.length;
const missed = d.cards.filter((c) => c.missed).length;
const byObj = {};
for (const c of d.cards) {
  byObj[c.objective] ??= { n: 0, m: 0 };
  byObj[c.objective].n++;
  if (c.missed) byObj[c.objective].m++;
}

const qs = d.cards.map((c, i) => {
  const multi = c.answer.length > 1;
  const opts = (c.options || []).map((o) => {
    const ok = c.answer.includes(o);
    return `<li class="${ok ? 'ok' : 'no'}"><span class="mk">${ok ? '✓' : '✗'}</span><span>${esc(o)}</span></li>`;
  }).join('');
  const links = (c.links || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a>`).join(' · ');
  const shots = (c.screenshots || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(u)}" alt="Screenshot" onerror="this.parentNode.textContent='Image unavailable: open link'"></a>`).join('');
  return `<section class="q ${c.missed ? 'missed' : 'right'}" data-obj="${esc(c.objective)}" id="q${i + 1}">
  <header>
    <span class="num">Q${i + 1}</span>
    <span class="tag">${esc(LABELS[c.objective] || c.objective)}</span>
    ${c.missed ? '<span class="tag bad">Missed</span>' : '<span class="tag good">Got it</span>'}
    ${multi ? `<span class="tag">Choose ${c.answer.length}</span>` : ''}
  </header>
  <p class="prompt">${esc(c.prompt)}</p>
  <ul class="opts">${opts}</ul>
  <div class="why"><b>Why:</b> ${esc(c.why)}</div>
  ${c.traps ? `<div class="trap"><b>Trap:</b> ${esc(c.traps)}</div>` : ''}
  ${c.strip ? `<div class="strip"><b>Strip:</b> ${esc(c.strip)}</div>` : ''}
  ${c.translate ? `<div class="tr"><div class="trh">In plain English</div><dl>
    ${c.translate.situation ? `<dt>Situation</dt><dd>${esc(c.translate.situation)}</dd>` : ''}
    ${c.translate.feature ? `<dt>Salesforce calls it</dt><dd>${esc(c.translate.feature)}</dd>` : ''}
    ${c.translate.see ? `<dt>What you'd see</dt><dd>${esc(c.translate.see)}</dd>` : ''}
    ${c.translate.notOther ? `<dt>Not the other one</dt><dd>${esc(c.translate.notOther)}</dd>` : ''}
  </dl></div>` : ''}
  ${links || shots ? `<details class="refs"><summary>Sources${shots ? ` &amp; ${c.screenshots.length} screenshot${c.screenshots.length > 1 ? 's' : ''}` : ''}</summary>${links ? `<p>${links}</p>` : ''}${shots ? `<div class="shots">${shots}</div>` : ''}</details>` : ''}
</section>`;
}).join('\n');

const objRows = Object.entries(byObj).map(([k, v]) =>
  `<button class="obj" data-obj="${esc(k)}">${esc(LABELS[k] || k)} <span>${v.n - v.m}/${v.n}</span></button>`).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exam 4 Review</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--ink:#1b1e24;--mut:#666e7a;--line:#e1e4e9;--ok:#178a4a;--okbg:#e5f5eb;--no:#c43c3c;--nobg:#fbeeee;--acc:#0b6bcb;--trap:#fff4dc;--strip:#eaf2fc}
@media (prefers-color-scheme:dark){:root{--bg:#111317;--card:#1b1e24;--ink:#e8eaee;--mut:#9aa1ad;--line:#2d3139;--ok:#45d283;--okbg:#14301f;--no:#ff7070;--nobg:#351a1a;--acc:#4a9eff;--trap:#33290f;--strip:#16233a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:780px;margin:0 auto;padding:16px 16px 64px}
h1{font-size:1.35rem;margin:8px 0 2px}
.sub{color:var(--mut);margin:0 0 14px}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);padding:10px 0;border-bottom:1px solid var(--line);margin-bottom:14px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
button{font:inherit;font-size:.88rem;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:99px;padding:6px 12px;cursor:pointer}
button.on{background:var(--acc);border-color:var(--acc);color:#fff}
button span{opacity:.7;margin-left:4px}
.objs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.spacer{flex:1}
.count{color:var(--mut);font-size:.88rem}
.q{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--ok);border-radius:12px;padding:14px 16px;margin:0 0 12px}
.q.missed{border-left-color:var(--no)}
.q header{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.num{font-weight:700;margin-right:2px}
.tag{font-size:.75rem;background:var(--line);color:var(--mut);border-radius:99px;padding:1px 9px}
.tag.bad{background:var(--nobg);color:var(--no);font-weight:600}
.tag.good{background:var(--okbg);color:var(--ok);font-weight:600}
.prompt{font-weight:600;font-size:1.05rem;margin:10px 0}
.opts{list-style:none;padding:0;margin:0 0 12px;display:grid;gap:6px}
.opts li{display:flex;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--line)}
.opts .mk{font-weight:800;width:1em;flex:none;text-align:center}
.opts .ok{background:var(--okbg);border-color:var(--ok);font-weight:600}
.opts .ok .mk{color:var(--ok)}
.opts .no{color:var(--mut)}
.opts .no .mk{color:var(--no)}
.opts .no span:last-child{text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--no) 55%,transparent)}
.why,.trap,.strip{font-size:.95rem;padding:8px 10px;border-radius:8px;margin-top:6px}
.trap{background:var(--trap)}
.tr{margin-top:8px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:.93rem}
.trh{font-weight:700;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:var(--acc);margin-bottom:4px}
.tr dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 12px}
.tr dt{color:var(--mut);font-weight:600;white-space:nowrap}
.tr dd{margin:0}
@media (max-width:520px){.tr dl{grid-template-columns:1fr}.tr dd{margin-bottom:6px}}
body.hide .tr{display:none}body.hide .q.show .tr{display:block}
.strip{background:var(--strip)}
.refs{margin-top:8px;font-size:.88rem;color:var(--mut)}
.refs summary{cursor:pointer;color:var(--acc)}
.refs a{color:var(--acc)}
.shots{display:grid;gap:8px;margin-top:8px}
.shots img{max-width:100%;border:1px solid var(--line);border-radius:8px;display:block}
body.hide .opts .ok{background:none;border-color:var(--line);font-weight:400}
body.hide .opts .mk{visibility:hidden}
body.hide .opts .no{color:var(--ink)}
body.hide .opts .no span:last-child{text-decoration:none}
body.hide .why,body.hide .trap,body.hide .strip,body.hide .refs{display:none}
body.hide .q.show .opts .ok{background:var(--okbg);border-color:var(--ok);font-weight:600}
body.hide .q.show .opts .mk{visibility:visible}
body.hide .q.show .opts .no{color:var(--mut)}
body.hide .q.show .opts .no span:last-child{text-decoration:line-through}
body.hide .q.show .why,body.hide .q.show .trap,body.hide .q.show .strip{display:block}
body.hide .q.show .refs{display:block}
body.hide .q{cursor:pointer}
@media print{.bar,.objs,.refs{display:none}.q{break-inside:avoid}}
</style></head>
<body><div class="wrap">
<h1>${esc(d.title)}</h1>
<p class="sub">${total - missed}/${total} correct (${Math.round(((total - missed) / total) * 100)}%) · ${missed} missed · <span style="color:var(--ok)">✓ green = right answer</span> · <span style="color:var(--no)">✗ = wrong</span></p>
<div class="objs">${objRows}</div>
<div class="bar">
  <button data-f="all" class="on">All ${total}</button>
  <button data-f="missed">Missed ${missed}</button>
  <button data-f="right">Got it ${total - missed}</button>
  <span class="spacer"></span>
  <button id="hide">Quiz me (hide answers)</button>
  <span class="count" id="count"></span>
</div>
${qs}
</div>
<script>
let f='all', obj='';
const qs=[...document.querySelectorAll('.q')];
function apply(){let n=0;qs.forEach(q=>{const show=(f==='all'||q.classList.contains(f))&&(!obj||q.dataset.obj===obj);q.hidden=!show;if(show)n++});document.getElementById('count').textContent=n+' shown';}
document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{f=b.dataset.f;document.querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x===b));apply()});
document.querySelectorAll('.obj').forEach(b=>b.onclick=()=>{obj=obj===b.dataset.obj?'':b.dataset.obj;document.querySelectorAll('.obj').forEach(x=>x.classList.toggle('on',x.dataset.obj===obj));apply()});
const hb=document.getElementById('hide');
hb.onclick=()=>{const on=document.body.classList.toggle('hide');hb.classList.toggle('on',on);hb.textContent=on?'Show all answers':'Quiz me (hide answers)';qs.forEach(q=>q.classList.remove('show'))};
qs.forEach(q=>q.addEventListener('click',e=>{if(document.body.classList.contains('hide')&&!e.target.closest('a,summary'))q.classList.toggle('show')}));
apply();
</script>
</body></html>`;
writeFileSync(out, html);
console.log(`wrote ${out}: ${total} questions, ${missed} missed`);
