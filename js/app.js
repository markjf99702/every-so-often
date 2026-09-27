// The page: which screen goes with which address, and the screens themselves.
//   #/               what's due
//   #/thing/ID       one thing: its gauge, what to remember, the calendar, its history
//   #/thing/ID/edit  change it       #/add   a new one
//   #/start          the starter list, then #/start/when for when each was last done
//   #/settings       Drive, seasons, backup, sample data
import * as D from './due.js';
import * as M from './model.js';
import { store, KEY } from './store.js';
import { drive } from './sync.js';
import { CATALOG, byKey } from './catalog.js';
import { icsFor, googleLink, download } from './cal.js';
import { sampleDoc } from './sample.js';
import { app, esc, go, ICON, toast, sheet, on, single } from './ui.js';

const SITE = 'https://junkdrawer.works/every-so-often/';
const ui = { area: '', picks: [], screen: '' };
let T = D.today();
const tn = () => D.num(T);

// ---------- reading things ----------

function view(item, t = tn()) {
  const last = M.lastNum(item);
  return { item, last, s: D.status(item.rule, last, t, D.num(item.created), store.hemisphere) };
}
const views = () => store.things().map(x => view(x)).sort((a, b) => D.compare(a.s, b.s) || a.item.name.localeCompare(b.item.name));
const areasInUse = () => {
  const used = new Set(store.things().map(x => x.area));
  return [...M.AREAS.map(a => a.name).filter(a => used.has(a)), ...[...used].filter(a => !M.AREAS.some(b => b.name === a)).sort()];
};
const allAreas = () => [...new Set([...M.AREAS.map(a => a.name), ...areasInUse()])];

// The gauge: a track that runs to a quarter past the due line, so overdue has somewhere to go.
// The fill shows how far through the round today is; the shaded zone before the line is "due soon".
const SCALE = 1.25;
function gauge(s, big = false) {
  const pct = v => (Math.max(0, Math.min(v, SCALE)) / SCALE * 100).toFixed(1) + '%';
  const said = s.unknown && !s.window ? 'No date yet'
    : s.state === 'overdue' ? 'Past the due date'
      : `${Math.round(Math.min(s.frac, 1) * 100)}% of the way to due`;
  return `<div class="gauge${big ? ' big' : ''}${s.unknown ? ' unknown' : ''}" style="--f:${pct(s.frac)};--z:${pct(s.soonAt)}" role="img" aria-label="${said}"><i class="zone"></i><i class="fill"></i><i class="line"></i></div>`;
}

// The sticker in the corner of each tag: when it's next due, written in marker.
function dueMark(s) {
  let k = 'Next due', d = D.dayText(s.due);
  if (s.unknown && !s.window) { k = 'Due'; d = 'Now'; }
  else if (s.window && (s.state === 'due' || s.state === 'overdue')) { k = s.state === 'due' ? 'Due by' : 'Was due'; d = D.dayText(s.by); }
  else if (s.state === 'overdue') k = 'Was due';
  return `<div class="sticker"><span class="k">${k}</span><span class="d">${esc(d)}</span></div>`;
}

const area = name => `<span class="area">${M.areaIcon(name)} ${esc(name)}</span>`;
const doneToday = item => M.entries(item).some(e => e.day === T);

function tag({ item, s, last }, compact = false) {
  const done = doneToday(item);
  const body = `
      <div class="tag-top"><h3>${esc(item.name)}</h3>${dueMark(s)}</div>
      ${compact ? '' : `<p class="meta"><span class="in-area">${area(item.area)} · </span>${esc(D.ruleText(item.rule))}</p>`}
      ${gauge(s)}
      <p class="state">${esc(D.statusText(s, tn()))}${compact ? `<span class="in-area"> · ${area(item.area)}</span>` : ` <span class="ago">· last done ${esc(D.ago(last, tn()))}</span>`}</p>
      ${!compact && item.remember ? `<p class="remember"><span><b>Remember</b> ${esc(item.remember)}</span></p>` : ''}`;
  const actions = compact
    ? `<button type="button" class="tick" data-done="${item.id}" aria-label="Done today: ${esc(item.name)}"${done ? ' disabled' : ''}>${ICON.check}</button>`
    : `<div class="tag-actions">
        <button type="button" class="btn done" data-done="${item.id}"${done ? ' disabled' : ''}>${ICON.check}${done ? 'Logged today' : 'Done today'}</button>
        <button type="button" class="btn quiet" data-other="${item.id}">Another day…</button>
      </div>`;
  return `<article class="tag s-${s.state}${compact ? ' compact' : ''}" data-id="${item.id}">
    <div class="tag-end" aria-hidden="true"><i class="eyelet"></i></div>
    <div class="tag-main"><a class="tag-body" href="#/thing/${item.id}">${body}</a>${actions}</div>
  </article>`;
}

// ---------- the main screen ----------

const GROUPS = [
  ['overdue', 'Overdue', v => v.s.state === 'overdue'],
  ['soon', 'Due soon', v => v.s.state === 'due' || v.s.state === 'soon'],
  ['later', 'Later', v => v.s.state === 'later'],
];

function sampleBanner() {
  return store.sample ? `<aside class="banner" role="note"><p><b>Sample data.</b> Nothing you do here touches your own list.</p><button type="button" class="btn sm" data-act="leave-sample">Leave</button></aside>` : '';
}

function home() {
  document.title = 'Every So Often';
  const all = views();
  if (!all.length) return hello();
  const areas = areasInUse();
  if (ui.area && !areas.includes(ui.area)) ui.area = '';
  const shown = ui.area ? all.filter(v => v.item.area === ui.area) : all;
  const count = k => all.filter(GROUPS.find(g => g[0] === k)[2]).length;
  const n = { overdue: count('overdue'), soon: count('soon'), later: count('later') };
  const next = all.find(v => v.s.state === 'later');
  const summary = n.overdue || n.soon
    ? [n.overdue && `${n.overdue} overdue`, n.soon && `${n.soon} due soon`, n.later && `${n.later} later`].filter(Boolean).join(' · ')
    : `Nothing due.${next ? ` Next up: ${esc(next.item.name)}, ${next.s.window ? `from ${D.dayText(next.s.due)}` : `in ${D.span(next.s.left)}`}.` : ''}`;

  app.innerHTML = `
    ${sampleBanner()}
    <div class="head">
      <h1>What’s due</h1>
      <p class="summary">${summary}</p>
    </div>
    ${areas.length > 1 ? `<nav class="areas" aria-label="Areas">
      <button type="button" class="chip" data-area="" aria-pressed="${!ui.area}">All <span>${all.length}</span></button>
      ${areas.map(a => `<button type="button" class="chip" data-area="${esc(a)}" aria-pressed="${ui.area === a}">${M.areaIcon(a)} ${esc(a)} <span>${all.filter(v => v.item.area === a).length}</span></button>`).join('')}
    </nav>
    <div class="viewbar" role="group" aria-label="Group by">
      <span>Group by</span>
      <button type="button" data-view="due" aria-pressed="${store.view === 'due'}">When due</button>
      <button type="button" data-view="area" aria-pressed="${store.view === 'area'}">Area</button>
    </div>` : ''}
    ${(store.view === 'area' && areas.length > 1 ? areas.map(a => [`area:${a}`, `${M.areaIcon(a)} ${esc(a)}`, v => v.item.area === a, 'area']) : GROUPS).map(([k, label, test, cls = k]) => {
      const list = shown.filter(test);
      if (!list.length) return '';
      const folded = store.folded(k);
      return `<section class="group g-${cls}">
        <h2><button type="button" class="fold" data-fold="${esc(k)}" aria-expanded="${!folded}"><span class="tape">${label}</span><span class="n">${list.length}</span><span class="chev" aria-hidden="true"></span></button></h2>
        ${folded ? '' : tagsHTML(list)}
      </section>`;
    }).join('')}
    <div class="more">
      <a class="btn" href="#/add">${ICON.plus}Add a thing</a>
      <a class="btn quiet" href="#/start">Starter list</a>
    </div>`;

  on({
    click(e) {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.done) return markDone(t.dataset.done, t.closest('.tag'));
      if (t.dataset.other) return anotherDay(t.dataset.other);
      if ('area' in t.dataset) { ui.area = t.dataset.area; return home(); }
      if (t.dataset.fold) { store.fold(t.dataset.fold, !store.folded(t.dataset.fold)); return home(); }
      if (t.dataset.view) { store.view = t.dataset.view; return home(); }
      if (t.dataset.act === 'leave-sample') return leaveSample();
    },
  });
}

// Things due now get a full tag with a big Done button; the rest get a compact one.
function tagsHTML(list) {
  const full = list.filter(v => v.s.state === 'overdue' || v.s.state === 'due'), small = list.filter(v => !full.includes(v));
  return (full.length ? `<div class="tags">${full.map(v => tag(v)).join('')}</div>` : '') +
    (small.length ? `<div class="tags compact">${small.map(v => tag(v, true)).join('')}</div>` : '');
}

function hello() {
  app.innerHTML = `
    <section class="hello">
      <div class="hello-art" aria-hidden="true">${helloArt()}</div>
      <h1>The jobs you do every few months</h1>
      <p class="lede">…and can never remember when you last did. The furnace filter, the smoke alarm batteries, the dog’s flea pills, the tires. Every So Often shows what’s due, and one tap logs it done.</p>
      <div class="stack">
        <a class="btn primary big" href="#/start">Pick from the starter list</a>
        <a class="btn big" href="#/add">${ICON.plus}Add your own</a>
        <button type="button" class="btn quiet" data-act="sample">Look around with sample data</button>
      </div>
      <p class="small">${drive.isOn() ? 'Your list is kept in this browser and saved to your Google Drive.' : `Your list stays in this browser.${drive.ready ? ' You can also keep it in your own Google Drive, to have it on every device (see Settings).' : ''}`} No account, and it works offline.</p>
    </section>`;
  on({ click(e) { if (e.target.closest('[data-act="sample"]')) { store.startSample(); render(); toast('Showing sample data'); } } });
}

function helloArt() {
  return `<svg viewBox="0 0 260 120" class="art">
    <g transform="rotate(-6 130 60)">
      <path d="M10 8 C 2 30, 12 58, 50 60" fill="none" stroke="var(--string)" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M58 18 H232 a8 8 0 0 1 8 8 V94 a8 8 0 0 1 -8 8 H58 L34 82 V38 Z" fill="var(--card)" stroke="var(--line-strong)" stroke-width="1.5"/>
      <path d="M58 18 H76 V102 H58 L34 82 V38 Z" fill="var(--red)"/>
      <circle cx="50" cy="60" r="9" fill="var(--ring)"/><circle cx="50" cy="60" r="5" fill="var(--bg)"/>
      <path d="M50 60 C 44 64, 36 64, 30 70" fill="none" stroke="var(--string)" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="92" y="34" width="96" height="11" rx="3" fill="var(--ink)" opacity=".85"/>
      <rect x="92" y="52" width="64" height="7" rx="3" fill="var(--muted)" opacity=".6"/>
      <rect x="92" y="72" width="130" height="10" rx="3" fill="var(--track)"/>
      <rect x="92" y="72" width="118" height="10" rx="3" fill="var(--red)"/>
      <rect x="194" y="68" width="2.5" height="18" fill="var(--ink)"/>
    </g>
  </svg>`;
}

// ---------- logging ----------

function markDone(id, tagEl) {
  const item = store.thing(id);
  if (!item) return;
  if (doneToday(item)) return toast('Already logged for today');
  const eid = store.log(id, T);
  const undo = { label: 'Undo', run: () => { store.unlog(id, eid); render(); } };
  const finish = () => { render(); toast(`${item.name}: done today`, undo); };
  if (tagEl && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    tagEl.insertAdjacentHTML('beforeend', `<span class="stamp" aria-hidden="true">Done ${esc(D.dayText(D.num(T)))}</span>`);
    tagEl.classList.add('stamped');
    setTimeout(finish, 650);
  } else finish();
}

function anotherDay(id, entry) {
  const item = store.thing(id);
  if (!item) return;
  const t = tn(), was = entry ? item.log[entry] : null;
  const quick = [[0, 'Today'], [1, 'Yesterday'], [7, 'A week ago']];
  sheet(`
    <h2>${entry ? 'Change this entry' : 'Log it'}</h2>
    <p class="sub">${esc(item.name)}</p>
    <div class="quick" role="group" aria-label="When">${quick.map(([d, l]) => `<button type="button" class="chip" data-ago="${d}">${l}</button>`).join('')}</div>
    <label class="field"><span>Date</span><input type="date" id="odDay" max="${T}" value="${was ? was.day : T}" required></label>
    <label class="field"><span>Note <i>(optional)</i></span><input id="odNote" maxlength="500" value="${esc(was?.note || '')}" placeholder="${esc(noteHint(item))}" autocomplete="off"></label>
    <p class="err" id="odErr" hidden></p>
    <div class="row end">
      <button type="button" class="btn quiet" data-x>Cancel</button>
      <button type="submit" class="btn primary" id="odGo">${entry ? 'Save' : 'Log it'}</button>
    </div>`, (body, close) => {
    const dayIn = body.querySelector('#odDay');
    const mark = () => body.querySelectorAll('[data-ago]').forEach(b => b.setAttribute('aria-pressed', String(D.key(t - +b.dataset.ago) === dayIn.value)));
    mark();
    dayIn.addEventListener('input', mark);
    body.querySelectorAll('[data-ago]').forEach(b => b.addEventListener('click', () => { dayIn.value = D.key(t - +b.dataset.ago); mark(); }));
    body.querySelector('[data-x]').addEventListener('click', close);
    body.onsubmit = e => {
      e.preventDefault();
      const day = dayIn.value, note = body.querySelector('#odNote').value;
      const err = body.querySelector('#odErr');
      if (!D.isKey(day)) { err.textContent = 'Pick a date.'; err.hidden = false; return; }
      if (day > T) { err.textContent = 'That’s in the future. Pick today or earlier.'; err.hidden = false; return; }
      if (!store.thing(id)) { close(); toast('That thing was removed on another device'); return render(); }
      if (entry) store.editEntry(id, entry, { day, note });
      else {
        const eid = store.log(id, day, note);
        toast(`${item.name}: logged ${day === T ? 'today' : D.dayText(D.num(day))}`, { label: 'Undo', run: () => { store.unlog(id, eid); render(); } });
      }
      close();
      render();
    };
  });
}

function noteHint(item) {
  if (item.key === 'furnace-filter') return 'e.g. 16×25×1 MERV 8, $12';
  if (item.area === 'Car') return 'e.g. mileage, what it cost, where';
  if (item.area === 'Pets') return 'e.g. the dose, their weight';
  return 'e.g. what you used, what it cost';
}

// ---------- one thing ----------

function thing(id) {
  const item = store.thing(id);
  if (!item) return message('That thing isn’t here', 'It may have been deleted, here or on another device.');
  const v = view(item), { s, last } = v, t = tn();
  document.title = `${item.name} · Every So Often`;
  const log = M.entries(item);
  const gaps = log.slice(0, -1).map((e, i) => D.num(e.day) - D.num(log[i + 1].day));
  const avg = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
  const ev = calEvent(v);
  const done = doneToday(item);

  app.innerHTML = `
    ${sampleBanner()}
    <a class="back" href="#/">${ICON.back}What’s due</a>
    <article class="tag big s-${s.state}">
      <div class="tag-end" aria-hidden="true"><i class="eyelet"></i></div>
      <div class="tag-main"><div class="tag-body">
        <div class="tag-top"><div><p class="meta">${area(item.area)}</p><h1>${esc(item.name)}</h1><p class="rule">${esc(D.ruleText(item.rule))}</p></div>${dueMark(s)}</div>
        ${gauge(s, true)}
        <p class="state">${esc(D.statusText(s, t))}</p>
        <dl class="facts">
          <div><dt>Last done</dt><dd>${last == null ? 'Not sure' : `${esc(D.dayText(last, true))} <span>(${esc(D.ago(last, t))})</span>`}</dd></div>
          <div><dt>${s.window ? (s.state === 'overdue' ? 'Missed window' : 'Window') : s.state === 'overdue' ? 'Was due' : 'Next due'}</dt><dd>${s.window ? `${esc(D.dayText(s.due))} to ${esc(D.dayText(s.by))}` : s.unknown ? 'Now' : esc(D.dayText(s.due, true))}</dd></div>
        </dl>
      </div>
      <div class="tag-actions">
        <button type="button" class="btn done" data-done="${item.id}"${done ? ' disabled' : ''}>${ICON.check}${done ? 'Logged today' : 'Done today'}</button>
        <button type="button" class="btn quiet" data-other="${item.id}">Another day…</button>
      </div></div>
    </article>

    <section class="note-card${item.remember ? '' : ' empty'}">
      <h2>Remember</h2>
      ${item.remember ? `<p>${esc(item.remember).replace(/\n/g, '<br>')}</p>` : `<p class="hint">The thing you always forget: ${esc((item.key && byKey[item.key]?.hint) || 'the size, which battery, the dose, who to call').replace(/^./, c => c.toLowerCase())}.</p>`}
      <a class="link" href="#/thing/${item.id}/edit">${item.remember ? 'Change' : 'Add it'}</a>
    </section>

    <section class="card cal">
      <h2>${ICON.cal}Put it on your calendar</h2>
      <p>${calWords(s, ev.day)}</p>
      <div class="row">
        ${single ? '' : '<button type="button" class="btn" data-act="ics">Calendar file (.ics)</button>'}
        <a class="btn" href="${esc(googleLink(ev))}" target="_blank" rel="noopener">Google Calendar</a>
      </div>
    </section>

    <section class="card history">
      <h2>History${log.length ? ` <span class="n">${log.length}</span>` : ''}</h2>
      ${avg ? `<p class="hint">On average every ${esc(D.span(avg))}${item.rule.kind === 'every' ? `, against ${esc(D.ruleText(item.rule).toLowerCase())}` : ''}.</p>` : ''}
      ${log.length ? `<ol class="log">${log.map((e, i) => `
        <li>
          <div class="when"><b>${esc(D.dayText(D.num(e.day), true))}</b>${gaps[i] ? `<span>${esc(D.span(gaps[i]))} after the one before</span>` : ''}</div>
          ${e.note ? `<p>${esc(e.note)}</p>` : ''}
          <div class="entry-acts">
            <button type="button" class="icon-btn sm" data-edit-entry="${e.id}" aria-label="Change the entry for ${esc(D.dayText(D.num(e.day), true))}">${ICON.pencil}</button>
            <button type="button" class="icon-btn sm" data-del-entry="${e.id}" aria-label="Delete the entry for ${esc(D.dayText(D.num(e.day), true))}">${ICON.trash}</button>
          </div>
        </li>`).join('')}</ol>` : '<p class="hint">Nothing logged yet. Tap Done today when you do it, or Another day if you did it recently.</p>'}
    </section>

    <div class="row foot-acts">
      <a class="btn" href="#/thing/${item.id}/edit">${ICON.pencil}Change it</a>
      <button type="button" class="btn quiet danger" data-act="delete">${ICON.trash}Delete</button>
    </div>`;

  on({
    click(e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.done) return markDone(id, b.closest('.tag'));
      if (b.dataset.other) return anotherDay(id);
      if (b.dataset.editEntry) return anotherDay(id, b.dataset.editEntry);
      if (b.dataset.delEntry) {
        const eid = b.dataset.delEntry, old = item.log[eid];
        store.unlog(id, eid);
        render();
        return toast(`Deleted the entry for ${D.dayText(D.num(old.day), true)}`, { label: 'Undo', run: () => { store.editEntry(id, eid, { day: old.day, note: old.note || '' }); render(); } });
      }
      if (b.dataset.act === 'ics') return download(icsFor([ev]), `${slug(item.name)}.ics`, 'text/calendar;charset=utf-8');
      if (b.dataset.act === 'delete') return removeWithUndo(id);
      if (b.dataset.act === 'leave-sample') return leaveSample();
    },
  });
}

function calWords(s, day) {
  const d = `<b>${esc(D.dayText(D.num(day), true))}</b>`;
  if (s.state === 'overdue') return `${d}, today, since it’s overdue. Once it’s done, come back here for the next date.`;
  if (s.state === 'due' && s.window) return `${d}, when the ${esc(s.window)} window closes.`;
  if (s.state === 'due') return `${d}, today, since it’s due now. Once it’s done, come back here for the next date.`;
  if (s.window) return `${d}, when the ${esc(s.window)} window opens. After you do it, add the next one the same way.`;
  return `${d}, when it’s next due. After you do it, add the next one the same way.`;
}

function removeWithUndo(id) {
  const old = store.remove(id);
  go('/', true);
  toast(`Deleted “${old.name}”`, { label: 'Undo', run: () => { store.restore(old); render(); } });
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'every-so-often';

function calEvent({ item, s }) {
  const t = tn();
  const day = s.unknown && !s.window ? T : D.key(s.state === 'overdue' || s.state === 'due' ? (s.window ? Math.max(s.by, t) : t) : s.due);
  const last = M.lastDone(item);
  const details = [
    D.ruleText(item.rule) + '.',
    last ? `Last done ${D.dayText(D.num(last), true)}.` : '',
    item.remember ? `Remember: ${item.remember}` : '',
    SITE,
  ].filter(Boolean).join('\n');
  return { uid: `${item.id}-${day}`, title: item.name, details, day, url: SITE };
}

// ---------- adding and changing ----------

function form(id) {
  const item = id ? store.thing(id) : null;
  if (id && !item) return message('That thing isn’t here', 'It may have been deleted, here or on another device.');
  document.title = `${item ? 'Change' : 'Add'} · Every So Often`;
  const rule = item?.rule || { kind: 'every', n: 3, unit: 'month' };
  const hemi = store.hemisphere;
  const areaList = allAreas();
  const cur = item?.area || (ui.area || 'House');
  const hint = (item?.key && byKey[item.key]?.hint) || 'The thing you always forget: filter size, which battery, the dose';
  const seasonMonths = s => D.windowsOf({ kind: 'seasons', list: [s] }, hemi)[0].m;
  const monthShort = m => D.MONTHS[(m - 1 + 12) % 12].slice(0, 3);

  app.innerHTML = `
    ${sampleBanner()}
    <a class="back" href="${item ? `#/thing/${item.id}` : '#/'}">${ICON.back}${item ? 'Back' : 'What’s due'}</a>
    <h1 class="page-h">${item ? 'Change it' : 'Add a thing'}</h1>
    <form id="thingForm" class="form" novalidate>
      <label class="field"><span>What needs doing</span>
        <input name="name" required maxlength="80" value="${esc(item?.name || '')}" placeholder="e.g. Change the furnace filter" autocomplete="off"></label>

      <fieldset class="field"><legend>Area</legend>
        <div class="chips">${areaList.map(a => `<label class="chip radio"><input type="radio" name="area" value="${esc(a)}"${a === cur ? ' checked' : ''}><span>${M.areaIcon(a)} ${esc(a)}</span></label>`).join('')}
          <label class="chip radio"><input type="radio" name="area" value="__new"><span>Other…</span></label></div>
        <input name="newArea" class="new-area" maxlength="30" placeholder="Name the area, e.g. Boat" hidden autocomplete="off">
      </fieldset>

      <fieldset class="field"><legend>How often</legend>
        <div class="seg" role="radiogroup">
          ${[['every', 'Every so often'], ['seasons', 'By season'], ['months', 'In set months']].map(([k, l]) => `<label><input type="radio" name="kind" value="${k}"${rule.kind === k ? ' checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
        <div class="kind-every" ${rule.kind === 'every' ? '' : 'hidden'}>
          <div class="every-row"><span>Every</span>
            <input name="n" type="number" inputmode="numeric" min="1" max="999" value="${rule.kind === 'every' ? rule.n : 3}" aria-label="How many">
            <select name="unit" aria-label="Days, weeks, months or years">${['day', 'week', 'month', 'year'].map(u => `<option value="${u}"${(rule.unit || 'month') === u ? ' selected' : ''}>${u}${(rule.kind === 'every' ? rule.n : 3) === 1 ? '' : 's'}</option>`).join('')}</select>
          </div>
          <p class="help">Counted from the last time you did it.</p>
        </div>
        <div class="kind-seasons" ${rule.kind === 'seasons' ? '' : 'hidden'}>
          <div class="chips">${D.SEASONS.map(s => { const m = seasonMonths(s); return `<label class="chip check"><input type="checkbox" name="season" value="${s}"${rule.kind === 'seasons' && rule.list.includes(s) ? ' checked' : ''}><span>${s[0].toUpperCase() + s.slice(1)} <small>${monthShort(m)}–${monthShort(m + 2)}</small></span></label>`; }).join('')}</div>
          <p class="help">Due once in each season you pick. Seasons follow the ${hemi}ern hemisphere; change that in <a href="#/settings">Settings</a>.</p>
        </div>
        <div class="kind-months" ${rule.kind === 'months' ? '' : 'hidden'}>
          <div class="chips months">${D.MONTHS.map((m, i) => `<label class="chip check"><input type="checkbox" name="month" value="${i + 1}"${rule.kind === 'months' && rule.list.includes(i + 1) ? ' checked' : ''}><span>${m.slice(0, 3)}</span></label>`).join('')}</div>
          <p class="help">Due once in each month you pick, e.g. April and October for the clocks changing.</p>
        </div>
      </fieldset>

      <label class="field"><span>Remember <i>(optional)</i></span>
        <textarea name="remember" rows="2" maxlength="500" placeholder="${esc(hint)}">${esc(item?.remember || '')}</textarea></label>

      ${item ? '' : `<label class="field"><span>Last done <i>(optional)</i></span>
        <input name="last" type="date" max="${T}">
        <p class="help">Leave it empty if you’re not sure, and it’ll show as due.</p></label>`}

      <p class="err" id="formErr" hidden></p>
      <div class="row">
        <button type="submit" class="btn primary">${item ? 'Save' : 'Add it'}</button>
        <a class="btn quiet" href="${item ? `#/thing/${item.id}` : '#/'}">Cancel</a>
        ${item ? `<button type="button" class="btn quiet danger push" data-act="delete">${ICON.trash}Delete</button>` : ''}
      </div>
    </form>`;

  const f = document.getElementById('thingForm');
  const sync = () => {
    const kind = f.kind.value;
    for (const k of ['every', 'seasons', 'months']) f.querySelector('.kind-' + k).hidden = kind !== k;
    const na = f.querySelector('.new-area');
    na.hidden = f.area.value !== '__new';
  };
  if (!item) f.name.focus();

  on({
    change(e) { if (['kind', 'area'].includes(e.target.name)) { sync(); if (e.target.value === '__new') f.newArea.focus(); } },
    // "Every 1 year", "Every 2 years".
    input(e) { if (e.target.name === 'n') for (const o of f.unit.options) o.textContent = o.value + (+e.target.value === 1 ? '' : 's'); },
    click(e) {
      if (e.target.closest('[data-act="delete"]')) removeWithUndo(item.id);
      if (e.target.closest('[data-act="leave-sample"]')) leaveSample();
    },
    submit(e) {
      e.preventDefault();
      const err = f.querySelector('#formErr');
      const fail = m => { err.textContent = m; err.hidden = false; };
      const name = f.name.value.trim();
      if (!name) { f.name.focus(); return fail('Say what needs doing.'); }
      let areaName = f.area.value === '__new' ? f.newArea.value.trim() : f.area.value;
      if (!areaName) { f.newArea.focus(); return fail('Name the new area.'); }
      areaName = allAreas().find(a => a.toLowerCase() === areaName.toLowerCase()) || areaName;
      const kind = f.kind.value;
      let r;
      if (kind === 'every') r = { kind, n: +f.n.value, unit: f.unit.value };
      else if (kind === 'seasons') r = { kind, list: [...f.querySelectorAll('[name=season]:checked')].map(x => x.value) };
      else r = { kind, list: [...f.querySelectorAll('[name=month]:checked')].map(x => +x.value) };
      if (!D.cleanRule(r)) return fail(kind === 'every' ? 'How often: a whole number from 1 to 999.' : kind === 'seasons' ? 'Pick at least one season.' : 'Pick at least one month.');
      const fields = { name, area: areaName, rule: D.cleanRule(r), remember: f.remember.value };
      if (item) {
        store.update(item.id, fields);
        go(`/thing/${item.id}`);
      } else {
        const last = f.last.value;
        if (last && (!D.isKey(last) || last > T)) return fail('Last done: pick today or a date before it.');
        const nid = store.add(fields);
        if (last) store.log(nid, last);
        go('/', false);
        toast(`Added “${name}”`);
      }
    },
  });
}

// ---------- the starter list ----------

function start() {
  document.title = 'Starter list · Every So Often';
  const have = new Set(store.things().map(x => x.key).filter(Boolean));
  ui.picks = ui.picks.filter(k => !have.has(k));
  const picked = new Set(ui.picks);
  app.innerHTML = `
    ${sampleBanner()}
    <a class="back" href="#/">${ICON.back}What’s due</a>
    <h1 class="page-h">Starter list</h1>
    <p class="lede">Tap the jobs you do. The intervals are typical ones, not rules: the manual, the vet or the dentist may say otherwise, and you can change any of them later.</p>
    <nav class="areas jump" aria-label="Jump to an area">${CATALOG.map(g => `<button type="button" class="chip" data-jump="${g.area}">${M.areaIcon(g.area)} ${g.area}</button>`).join('')}</nav>
    ${CATALOG.map(g => `
      <section class="cat" id="cat-${g.area}">
        <h2>${M.areaIcon(g.area)} ${g.area}</h2>
        <p class="hint">${esc(g.note)}</p>
        <ul class="picks">${g.items.map(([k, name, rule]) => `
          <li><button type="button" class="pick" data-key="${k}" aria-pressed="${picked.has(k)}"${have.has(k) ? ' disabled' : ''}>
            <i class="box" aria-hidden="true">${ICON.check}</i><span class="n">${esc(name)}</span><span class="r">${have.has(k) ? 'On your list' : esc(D.ruleText(rule))}</span>
          </button></li>`).join('')}
        </ul>
      </section>`).join('')}
    <div class="next-bar">
      <span id="pickCount">${countText(picked.size)}</span>
      <a class="btn primary" id="pickNext" href="#/start/when" aria-disabled="${!picked.size}">Next</a>
    </div>`;

  const refresh = () => {
    document.getElementById('pickCount').textContent = countText(ui.picks.length);
    document.getElementById('pickNext').setAttribute('aria-disabled', String(!ui.picks.length));
  };
  on({
    click(e) {
      const p = e.target.closest('.pick');
      if (p && !p.disabled) {
        const k = p.dataset.key, sel = !ui.picks.includes(k);
        ui.picks = sel ? [...ui.picks, k] : ui.picks.filter(x => x !== k);
        p.setAttribute('aria-pressed', String(sel));
        return refresh();
      }
      const j = e.target.closest('[data-jump]');
      if (j) document.getElementById('cat-' + j.dataset.jump).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      if (e.target.closest('#pickNext') && !ui.picks.length) { e.preventDefault(); toast('Tap at least one job first'); }
      if (e.target.closest('[data-act="leave-sample"]')) leaveSample();
    },
  });
}
const countText = n => n ? `${n} picked` : 'None picked yet';

const AGO = [['', 'Not sure'], ['0', 'Today'], ['7', 'About a week ago'], ['30', 'About a month ago'], ['91', 'About 3 months ago'], ['182', 'About 6 months ago'], ['365', 'About a year ago'], ['730', 'Two years or more'], ['date', 'On a date…']];

function when() {
  if (!ui.picks.length) return go('/start', true);
  document.title = 'Starter list · Every So Often';
  const list = ui.picks.map(k => byKey[k]);
  app.innerHTML = `
    ${sampleBanner()}
    <a class="back" href="#/start">${ICON.back}Starter list</a>
    <h1 class="page-h">When did you last do these?</h1>
    <p class="lede">A rough guess is fine, and you can change it later. Anything you’re not sure about shows as due now, apart from seasonal jobs, which wait for their season.</p>
    <ul class="when">${list.map(c => `
      <li data-key="${c.key}">
        <div><span class="n">${M.areaIcon(c.area)} ${esc(c.name)}</span><span class="r">${esc(D.ruleText(c.rule))}</span></div>
        <div class="pickers">
          <select aria-label="When did you last: ${esc(c.name)}">${AGO.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          <input type="date" max="${T}" hidden aria-label="Date for ${esc(c.name)}">
        </div>
      </li>`).join('')}
    </ul>
    <div class="next-bar">
      <a class="btn quiet" href="#/start">Back</a>
      <button type="button" class="btn primary" data-act="save">Add ${list.length} thing${list.length === 1 ? '' : 's'}</button>
    </div>`;

  on({
    change(e) {
      if (e.target.tagName === 'SELECT') {
        const d = e.target.parentElement.querySelector('input');
        d.hidden = e.target.value !== 'date';
        if (!d.hidden) { d.value ||= D.key(tn() - 30); d.focus(); }
      }
    },
    click(e) {
      if (e.target.closest('[data-act="leave-sample"]')) return leaveSample();
      if (!e.target.closest('[data-act="save"]')) return;
      const t = tn();
      store.batch(b => {
        for (const li of app.querySelectorAll('.when li')) {
          const c = byKey[li.dataset.key], sel = li.querySelector('select').value, d = li.querySelector('input').value;
          const id = M.newId();
          b.put({ id, key: c.key, name: c.name, area: c.area, rule: c.rule, remember: '', created: T });
          const day = sel === 'date' ? (D.isKey(d) && d <= T ? d : '') : sel === '' ? '' : D.key(t - +sel);
          if (day) b.log(id, day, '');
        }
      });
      const n = ui.picks.length;
      ui.picks = [];
      go('/');
      toast(`Added ${n} thing${n === 1 ? '' : 's'}`);
    },
  });
}

// ---------- settings ----------

function backupNote() {
  if (store.sample) return 'This is the sample list. Leave the sample to back up your own.';
  if (drive.isOn()) return 'Your list is kept in this browser and saved to your Google Drive, so it’s on every device where you’ve turned Drive on. A backup file is an extra copy you keep yourself. Loading one merges it with what’s here, so nothing is lost.';
  return `Your list is kept only in this browser. Save a backup file to keep a copy or to move it to another device${drive.ready ? ', or save to Google Drive above' : ''}. Loading one merges it with what’s here, so nothing is lost.`;
}

function eraseNote() {
  return drive.isOn()
    ? 'This removes your list from this browser and stops saving to Google Drive here. The copy in your Drive stays.'
    : 'This removes your list from this browser. Save a backup first if you want to keep it.';
}

function settings() {
  document.title = 'Settings · Every So Often';
  const hemi = store.hemisphere;
  app.innerHTML = `
    ${sampleBanner()}
    <a class="back" href="#/">${ICON.back}What’s due</a>
    <h1 class="page-h">Settings</h1>
    <section class="card" id="driveCard" hidden></section>
    <section class="card">
      <h2>Seasons</h2>
      <p>Seasonal jobs, like the gutters each spring and fall, go by where you live.</p>
      <div class="choices">
        <label class="choice"><input type="radio" name="hemi" value="north"${hemi === 'north' ? ' checked' : ''}><span><b>Northern hemisphere</b> Spring is March to May</span></label>
        <label class="choice"><input type="radio" name="hemi" value="south"${hemi === 'south' ? ' checked' : ''}><span><b>Southern hemisphere</b> Spring is September to November</span></label>
      </div>
    </section>
    ${single ? '' : `<section class="card">
      <h2>Calendar</h2>
      <p>One calendar file with the next due date of everything on your list, for Apple Calendar, Outlook or Google Calendar. Import it again after a while to add the newer dates; it updates the events it added before.</p>
      <div class="row"><button type="button" class="btn" data-act="ics-all"${store.things().length ? '' : ' disabled'}>${ICON.cal}Calendar file (.ics)</button></div>
    </section>
    <section class="card">
      <h2>Backup</h2>
      <p id="backupNote">${backupNote()}</p>
      <div class="row"><button type="button" class="btn" data-act="backup"${store.sample ? ' disabled' : ''}>Save a backup</button>
      <label class="btn file${store.sample ? ' off' : ''}">Load a backup<input type="file" id="loadBackup" accept=".json,application/json"${store.sample ? ' disabled' : ''}></label></div>
    </section>`}
    <section class="card">
      <h2>Sample data</h2>
      ${store.sample
    ? '<p>You’re looking at sample data. Your own list is kept safe and comes back when you leave.</p><div class="row"><button type="button" class="btn" data-act="leave-sample">Leave the sample</button></div>'
    : '<p>Look around with a made-up house, dog and car and a year of history. Your own list is kept safe while you do, and nothing you do there touches it.</p><div class="row"><button type="button" class="btn" data-act="sample">Look around with sample data</button></div>'}
    </section>
    ${store.sample ? '' : `<section class="card">
      <h2>Erase this device’s list</h2>
      <p id="eraseNote">${eraseNote()}</p>
      <div class="row"><button type="button" class="btn quiet danger" data-act="erase"${store.things().length || drive.isOn() ? '' : ' disabled'}>Erase</button></div>
    </section>`}
    <p class="foot">Every So Often is part of <a href="https://junkdrawer.works/">junkdrawer.works</a>. No account, no tracking, and it works offline. <a href="https://junkdrawer.works/privacy.html">Privacy</a> · <a href="https://github.com/markjf99702/every-so-often">Source</a></p>`;
  drive.card(document.getElementById('driveCard'));
  // The notes below say where the list is kept, so they follow Drive being turned on or off.
  drive.watch(() => {
    const b = document.getElementById('backupNote'), e = document.getElementById('eraseNote');
    if (!b?.isConnected && !e?.isConnected) return false;
    if (b) b.textContent = backupNote();
    if (e) e.textContent = eraseNote();
  });

  let armed = false;
  on({
    change(e) {
      if (e.target.name === 'hemi') { store.hemisphere = e.target.value; toast(`Seasons now follow the ${e.target.value}ern hemisphere`); }
      if (e.target.id === 'loadBackup' && e.target.files[0]) {
        e.target.files[0].text().then(text => {
          try {
            const n = store.restoreBackup(text);
            toast(n ? `Loaded ${n} thing${n === 1 ? '' : 's'} from the backup` : 'Nothing new in that backup');
            settings();
          } catch (err) { toast(err.message); }
        });
      }
    },
    click(e) {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'ics-all') {
        const evs = views().map(calEvent);
        download(icsFor(evs), 'every-so-often.ics', 'text/calendar;charset=utf-8');
      } else if (a === 'backup') {
        download(store.backup(), `every-so-often-${T}.json`, 'application/json');
      } else if (a === 'sample') {
        store.startSample(); go('/'); toast('Showing sample data');
      } else if (a === 'leave-sample') {
        leaveSample();
      } else if (a === 'erase') {
        if (!armed) { armed = true; b.textContent = 'Tap again to erase'; return; }
        if (drive.isOn()) drive.stop();
        store.erase();
        go('/');
        toast('Erased this device’s list');
      }
    },
  });
}

function leaveSample() {
  store.endSample();
  ui.area = '';
  go('/');
  render();
  toast('Back to your own list');
}

function message(title, text) {
  document.title = 'Every So Often';
  app.innerHTML = `<div class="card empty"><h1 class="page-h">${esc(title)}</h1><p>${esc(text)}</p><a class="btn" href="#/">What’s due</a></div>`;
  on({});
}

// ---------- routing ----------

let lastPath = null;
function route() {
  T = D.today();
  const path = location.hash.replace(/^#\/?/, '');
  const [head, a, b] = path.split('/');
  if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
  ui.screen = head === 'thing' ? (b === 'edit' ? 'form' : 'thing') : head === 'add' ? 'form' : head === 'start' ? (a === 'when' ? 'when' : 'start') : head || 'home';
  document.body.dataset.screen = ui.screen;
  if (head === 'thing' && b === 'edit') form(a);
  else if (head === 'thing') thing(a);
  else if (head === 'add') form(null);
  else if (head === 'start') { if (a === 'when') when(); else start(); }
  else if (head === 'settings') settings();
  else home();
  badge();
}

// Redraws what's showing, except forms, which would lose what's being typed.
function render() {
  badge();
  if (['form', 'when'].includes(ui.screen)) return;
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
}

// While the installed app is open, its home-screen icon shows how many things are due.
function badge() {
  if (!('setAppBadge' in navigator) || store.sample) return;
  const n = views().filter(v => v.s.state === 'overdue' || v.s.state === 'due').length;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

// ---------- wiring ----------

store.onSave(kind => {
  if (kind === 'full') return toast('This browser is out of room to save. Save a backup from Settings.');
  drive.changed();
  badge();
});
drive.onUpdate(() => { store.reload(); render(); });
drive.chip(document.getElementById('cloud'));
// Another tab changed the list (or synced it): pick it up here.
window.addEventListener('storage', e => {
  if (e.key === KEY || (e.key || '').startsWith('every-so-often.') && e.key !== 'every-so-often.sync') { store.reload(); render(); }
});
// A new day while the page stays open.
const tick = () => { if (D.today() !== T) render(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
setInterval(tick, 60000);
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && !single && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// For the screenshot tool and tests: set things up without tapping through.
window.everySoOften = { store, D, M, sampleDoc };
