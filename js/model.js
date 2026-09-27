// The list of things and how two copies of it merge. No page code, so the tests run it in Node.
//
// A thing: { id, name, area, rule, remember, created: 'YYYY-MM-DD', key?, t, del?, log: { entryId: entry } }
//   t    when its name, area, interval or note last changed (milliseconds)
//   del  when it was deleted. It stays deleted unless it changes, or is logged, after that. Deleted things keep
//        their details, so a deletion on one device reaches the others instead of the thing coming back from
//        their copy, and merges come out the same whatever order devices sync in.
//   key  which starter job it came from, if any
// A log entry: { day: 'YYYY-MM-DD', note?, t }, or { del: 1, t } once removed.
// Merging goes part by part: the newer details win, log entries merge one by one (the newer version of
// each wins), and the later deletion time is kept.
import { cleanRule, isKey, num } from './due.js';

export const APP = 'every-so-often';
export const AREAS = [
  { name: 'House', icon: '🏠' },
  { name: 'Pets', icon: '🐾' },
  { name: 'Car', icon: '🚗' },
  { name: 'Workshop', icon: '🪚' },
  { name: 'Garden', icon: '🌱' },
  { name: 'Health', icon: '🩺' },
];
export const areaIcon = name => (AREAS.find(a => a.name === name) || { icon: '📦' }).icon;

const str = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (s, max) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const idOk = id => typeof id === 'string' && /^[\w-]{1,40}$/.test(id);
const tOk = t => (Number.isFinite(+t) && +t >= 0 ? Math.floor(+t) : 0);

export function newId() {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  return [...b].map(x => (x % 36).toString(36)).join('') + Date.now().toString(36).slice(-3);
}

// A change time that sorts after the last one, even if this device's clock is behind.
export const stamp = old => Math.max(Date.now(), (old?.t || 0) + 1);

export const blankDoc = () => ({ app: APP, v: 1, items: {}, prefs: {} });

export function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const t = tOk(e.t);
  if (e.del) return { del: 1, t };
  if (!isKey(e.day)) return null;
  const out = { day: e.day, t };
  const note = text(e.note, 500);
  if (note) out.note = note;
  return out;
}

export function cleanItem(x, id = x?.id) {
  if (!x || typeof x !== 'object' || !idOk(id)) return null;
  const name = str(x.name, 80), rule = cleanRule(x.rule);
  if (!name || !rule) return null;
  const item = { id, name, area: str(x.area, 30) || 'House', rule, remember: text(x.remember, 500), created: isKey(x.created) ? x.created : '2000-01-01', t: tOk(x.t), log: {} };
  if (x.key && typeof x.key === 'string') item.key = str(x.key, 40);
  if (tOk(x.del)) item.del = tOk(x.del);
  if (x.log && typeof x.log === 'object') {
    for (const [eid, e] of Object.entries(x.log)) {
      const c = idOk(eid) && cleanEntry(e);
      if (c) item.log[eid] = c;
    }
  }
  return item;
}

export function cleanDoc(raw) {
  const doc = blankDoc();
  if (!raw || typeof raw !== 'object') return doc;
  const items = raw.items && typeof raw.items === 'object' ? raw.items : {};
  for (const [id, x] of Object.entries(items)) {
    const c = cleanItem(x, id);
    if (c) doc.items[id] = c;
  }
  const h = raw.prefs?.hemisphere;
  if (h && ['north', 'south'].includes(h.v)) doc.prefs.hemisphere = { v: h.v, t: tOk(h.t) };
  return doc;
}

// JSON with the keys sorted, so the same data always gives the same text.
export function canon(x) {
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
  return JSON.stringify(x ?? null);
}

// ---------- reading a thing ----------

// The last time anything about it changed, its log included.
export const touched = item => Math.max(item.t, ...Object.values(item.log).map(e => e.t));
export const gone = item => !!item.del && item.del >= touched(item);
export const live = doc => Object.values(doc.items).filter(x => !gone(x));

// The same job logged twice for the same day with the same note (say, on the phone and then on the laptop
// before it had synced) is one job. Both entries stay in the data, so merging stays simple; the history
// shows one, and changing or deleting it changes or deletes both.
const sameEntry = (a, b) => a.day === b.day && (a.note || '').toLowerCase() === (b.note || '').toLowerCase();
export function entries(item) {
  const out = [];
  for (const id of Object.keys(item.log).sort()) {
    const e = item.log[id];
    if (!e.del && !out.some(x => sameEntry(x, e))) out.push({ id, ...e });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day) || b.t - a.t);
}
const twins = (item, eid) => Object.keys(item.log).filter(id => id !== eid && !item.log[id].del && sameEntry(item.log[id], item.log[eid]));

export function lastDone(item) {
  let best = null;
  for (const e of Object.values(item.log)) if (!e.del && (best === null || e.day > best)) best = e.day;
  return best;
}
export const lastNum = item => { const l = lastDone(item); return l ? num(l) : null; };

// ---------- merging ----------

const DETAILS = ['name', 'area', 'rule', 'remember', 'created', 'key', 't'];
const details = x => Object.fromEntries(DETAILS.map(k => [k, x[k]]));
// Of two versions, the newer; on a tie, the one that sorts last, so every device picks the same.
const newer = (x, y, view = v => v) => x.t > y.t || (x.t === y.t && canon(view(x)) > canon(view(y)));

function mergeItem(x, y) {
  const base = newer(x, y, details) ? x : y;
  const log = {};
  for (const id of new Set([...Object.keys(x.log), ...Object.keys(y.log)])) {
    const a = x.log[id], b = y.log[id];
    log[id] = !a ? b : !b ? a : newer(a, b) ? a : b;
  }
  const del = Math.max(x.del || 0, y.del || 0);
  return { ...details(base), id: x.id, log, ...(del ? { del } : {}) };
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sameThing = (a, b) => (a.key && b.key ? a.key === b.key : norm(a.name) === norm(b.name) && norm(a.area) === norm(b.area));

// Merges two copies of the list. Order doesn't matter and merging again changes nothing, so every
// device that syncs ends up with the same list.
// first: this device's first merge with that copy. Then nothing counts as removed on either side,
// and a thing set up separately on both (the same starter job, or the same name in the same area)
// becomes one, with both histories.
export function mergeDocs(local, remote, { first = false } = {}) {
  const a = { ...local.items }, b = remote.items;
  if (first) {
    const taken = new Set();
    for (const [id, x] of Object.entries(a)) {
      if (gone(x) || b[id]) continue;
      const match = Object.values(b).find(y => !gone(y) && !a[y.id] && !taken.has(y.id) && sameThing(x, y));
      if (!match) continue;
      taken.add(match.id);
      delete a[id];
      a[match.id] = { ...x, id: match.id };
    }
  }
  const items = {};
  for (const id of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const x = a[id], y = b[id];
    let m = !x ? y : !y ? x : mergeItem(x, y);
    // On a first merge, a deletion on one side doesn't take away what the other side still has.
    if (first && x && y && gone(m) && (!gone(x) || !gone(y))) { m = { ...m }; delete m.del; }
    items[id] = m;
  }
  const prefs = {};
  for (const k of new Set([...Object.keys(local.prefs || {}), ...Object.keys(remote.prefs || {})])) {
    const x = local.prefs?.[k], y = remote.prefs?.[k];
    prefs[k] = !x ? y : !y ? x : newer(x, y) ? x : y;
  }
  return { app: APP, v: 1, items, prefs };
}

// ---------- changing things (each returns the new doc; the old one is left alone) ----------

export function putThing(doc, fields) {
  const old = doc.items[fields.id];
  const base = old && !gone(old) ? old : { log: {} };
  const item = cleanItem({ ...base, ...fields, t: Math.max(stamp(old), old?.del ? old.del + 1 : 0) }, fields.id);
  if (!item) throw new Error('A thing needs a name and how often.');
  if (!old || gone(old)) delete item.del;
  return { ...doc, items: { ...doc.items, [item.id]: item } };
}

export function removeThing(doc, id) {
  const old = doc.items[id];
  if (!old || gone(old)) return doc;
  return { ...doc, items: { ...doc.items, [id]: { ...old, del: Math.max(Date.now(), touched(old) + 1) } } };
}

// Brings back a deleted thing as it was (for Undo).
export function restoreThing(doc, id) {
  const cur = doc.items[id];
  if (!cur || !gone(cur)) return doc;
  return { ...doc, items: { ...doc.items, [id]: { ...cur, t: Math.max(Date.now(), cur.del + 1) } } };
}

export function putEntry(doc, id, eid, fields) {
  const item = doc.items[id];
  if (!item || gone(item)) return doc;
  const old = item.log[eid];
  const e = cleanEntry({ ...(old && !old.del ? old : {}), ...fields, t: stamp(old) });
  if (!e) throw new Error('That date doesn’t look right.');
  const log = { ...item.log };
  if (old && !old.del) for (const tw of twins(item, eid)) log[tw] = { del: 1, t: stamp(log[tw]) };
  log[eid] = e;
  return { ...doc, items: { ...doc.items, [id]: { ...item, log } } };
}

export function removeEntry(doc, id, eid) {
  const item = doc.items[id];
  const old = item?.log[eid];
  if (!old || old.del) return doc;
  const log = { ...item.log };
  for (const x of [eid, ...twins(item, eid)]) log[x] = { del: 1, t: stamp(log[x]) };
  return { ...doc, items: { ...doc.items, [id]: { ...item, log } } };
}

export function setPref(doc, k, v) {
  return { ...doc, prefs: { ...doc.prefs, [k]: { v, t: stamp(doc.prefs[k]) } } };
}

// Where the seasons fall: the saved choice, or a guess from the time zone.
const SOUTH = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate)|^America\/(Argentina|Santiago|Montevideo|Asuncion|Sao_Paulo|La_Paz|Lima)|^Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Blantyre|Lubumbashi)|^Indian\/(Mauritius|Reunion|Antananarivo)/;
export function hemisphere(doc, zone = safeZone()) {
  return doc.prefs.hemisphere?.v || (SOUTH.test(zone) ? 'south' : 'north');
}
function safeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } }
