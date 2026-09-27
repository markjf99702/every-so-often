// When things are due. Everything here counts whole calendar days ("2026-09-27"), never hours,
// so clocks going forward or back can't nudge a due date, and a date means the same on every device.
// No page code, so the tests run it in Node.

const MS = 864e5;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const SEASONS = ['spring', 'summer', 'fall', 'winter'];
// The month each season starts in. Seasons here are the usual three-month blocks.
const SEASON_START = {
  north: { spring: 3, summer: 6, fall: 9, winter: 12 },
  south: { spring: 9, summer: 12, fall: 3, winter: 6 },
};
// Done a little before a window opens counts for that window: gutters cleaned in late August count for the fall.
export const GRACE = 21;
// A seasonal or monthly job shows as due soon this many days before its window opens.
export const WINDOW_SOON = 14;

// ---------- days ----------

export const num = key => Math.round(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / MS);
export const key = n => new Date(n * MS).toISOString().slice(0, 10);
export const isKey = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && key(num(s)) === s;
const ymd = n => { const d = new Date(n * MS); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
const fromYmd = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / MS);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Today's date where the person is (or in the given time zone, for tests).
export function today(now = new Date(), timeZone) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}

// Months forward from a day. A day that doesn't exist in the new month becomes that month's last day:
// January 31 plus a month is February 28 (or 29), and February 29 plus a year is February 28.
export function addMonths(n, k) {
  const [y, m, d] = ymd(n);
  const total = (m - 1) + k, ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12 + 1;
  return fromYmd(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addEvery(n, rule) {
  const k = rule.n;
  if (rule.unit === 'day') return n + k;
  if (rule.unit === 'week') return n + 7 * k;
  if (rule.unit === 'month') return addMonths(n, k);
  return addMonths(n, 12 * k);
}

// ---------- rules ----------
// { kind: 'every', n: 90, unit: 'day' | 'week' | 'month' | 'year' }
// { kind: 'seasons', list: ['spring', 'fall'] }
// { kind: 'months', list: [4, 10] }

export function cleanRule(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.kind === 'every') {
    const n = Math.round(+r.n);
    if (!['day', 'week', 'month', 'year'].includes(r.unit) || !(n >= 1 && n <= 999)) return null;
    return { kind: 'every', n, unit: r.unit };
  }
  if (r.kind === 'seasons' && Array.isArray(r.list)) {
    const list = SEASONS.filter(s => r.list.includes(s));
    return list.length ? { kind: 'seasons', list } : null;
  }
  if (r.kind === 'months' && Array.isArray(r.list)) {
    const list = [...new Set(r.list.map(Number))].filter(m => m >= 1 && m <= 12 && m % 1 === 0).sort((a, b) => a - b);
    return list.length ? { kind: 'months', list } : null;
  }
  return null;
}

// Rough length of one round, in days: for sorting and for how far ahead "due soon" starts.
export function ruleDays(rule) {
  if (rule.kind === 'every') return rule.n * { day: 1, week: 7, month: 30.44, year: 365.25 }[rule.unit];
  return 365.25 / rule.list.length;
}

// The windows a seasonal or monthly job has in a year: [{ m: first month, len: months, name }].
export function windowsOf(rule, hemi = 'north') {
  if (rule.kind === 'seasons') return rule.list.map(s => ({ m: SEASON_START[hemi === 'south' ? 'south' : 'north'][s], len: 3, name: s }));
  if (rule.kind === 'months') return rule.list.map(m => ({ m, len: 1, name: MONTHS[m - 1] }));
  return [];
}

// Every window between two years, in order: [{ start, end, name }], as day numbers.
function occurrences(rule, hemi, fromYear, toYear) {
  const out = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (const w of windowsOf(rule, hemi)) {
      const start = fromYmd(y, w.m, 1);
      out.push({ start, end: addMonths(start, w.len) - 1, name: w.name });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// Which window a day's work counts for: the one it falls in, else the next one if it opens within
// GRACE days, else the one before (done late).
function creditOf(L, occ) {
  const inside = occ.find(o => o.start <= L && L <= o.end);
  if (inside) return inside;
  const next = occ.find(o => o.start > L);
  if (next && next.start - L <= GRACE) return next;
  return occ.filter(o => o.end < L).pop() || null;
}

// How many days before an every-N job's due date it counts as due soon: about a seventh of the
// interval, at least a day and at most three weeks.
export const soonDays = len => Math.max(1, Math.min(21, Math.round(len * 0.15)));

// ---------- status ----------
// status(rule, last, t, created, hemi) → {
//   state: 'overdue' | 'due' | 'soon' | 'later',
//   due:   day it becomes due (for a window, the day it opens),
//   by:    last day of the window, for seasonal and monthly jobs,
//   left:  days from today to due (to `by` inside or after a window); negative when overdue,
//   unknown: true when there's no date to go on,
//   window: the season or month name it's about, for seasonal and monthly jobs,
//   frac:  how far through the round today is: 0 just done, 1 at the due line, over 1 when overdue,
//   soonAt: where on that scale "due soon" starts,
// }
// last, t (today) and created are day numbers; last may be null ("not sure").
export function status(rule, last, t, created = t, hemi = 'north') {
  if (rule.kind === 'every') {
    if (last == null) return { state: 'due', due: t, left: 0, unknown: true, frac: 1, soonAt: 0.85 };
    const due = addEvery(last, rule), len = Math.max(1, due - last), soon = soonDays(len), left = due - t;
    const state = left < 0 ? 'overdue' : left === 0 ? 'due' : left <= soon ? 'soon' : 'later';
    return { state, due, left, frac: Math.max(0, (t - last) / len), soonAt: 1 - soon / len };
  }

  const y = +key(t).slice(0, 4), lo = Math.min(t, created, last ?? t);
  const occ = occurrences(rule, hemi, +key(lo).slice(0, 4) - 1, y + 2);
  const C = last == null ? null : creditOf(last, occ);
  const from = last ?? created;
  const gauge = (to, zone) => {
    const f = Math.min(from, zone), len = Math.max(1, to - f);
    return { frac: Math.max(0, (t - f) / len), soonAt: Math.max(0, (zone - f) / len) };
  };
  const upcoming = after => {
    const o = occ.find(x => x.start > after);
    const left = o.start - t;
    return { state: left <= WINDOW_SOON ? 'soon' : 'later', due: o.start, by: o.end, left, window: o.name, ...gauge(o.end, o.start) };
  };

  const cur = occ.find(o => o.start <= t && t <= o.end);
  if (cur) {
    if (C && C.start >= cur.start) return upcoming(C.start);
    return { state: 'due', due: cur.start, by: cur.end, left: cur.end - t, window: cur.name, unknown: last == null, ...gauge(cur.end, cur.start) };
  }
  const prev = occ.filter(o => o.end < t).pop();
  if (C && C.start >= prev.start) return upcoming(C.start);
  if (!C && created > prev.end) return upcoming(t);
  return { state: 'overdue', due: prev.start, by: prev.end, left: prev.end - t, window: prev.name, unknown: last == null, ...gauge(prev.end, prev.start) };
}

// Ordering on the main screen: most overdue first, then soonest due.
export const RANK = { overdue: 0, due: 1, soon: 2, later: 3 };
export function compare(a, b) {
  return RANK[a.state] - RANK[b.state] || a.left - b.left;
}

// ---------- words ----------

export function span(days) {
  const d = Math.abs(days);
  if (d === 1) return '1 day';
  if (d <= 13) return `${d} days`;
  if (d <= 56) { const w = Math.round(d / 7); return `${w} weeks`; }
  const m = Math.round(d / 30.44);
  if (m < 24) return m === 1 ? '1 month' : `${m} months`;
  const yr = Math.round(d / 365.25);
  return `${yr} years`;
}

const cap = s => s[0].toUpperCase() + s.slice(1);
const join = list => list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

export function ruleText(rule) {
  if (rule.kind === 'every') {
    const unit = rule.unit;
    if (rule.n === 1) return `Every ${unit}`;
    if (unit === 'week' && rule.n === 2) return 'Every two weeks';
    return `Every ${rule.n} ${unit}s`;
  }
  if (rule.kind === 'seasons') return rule.list.length === 4 ? 'Every season' : `Each ${join(rule.list)}`;
  return rule.list.length === 12 ? 'Every month' : `Every ${join(rule.list.map(m => MONTHS[m - 1]))}`;
}

export const dayText = (n, withYear = false) => new Date(n * MS).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
const windowText = w => SEASONS.includes(w) ? `this ${w}` : `in ${w}`;

// One plain line saying where a thing stands.
export function statusText(s, t) {
  if (s.state === 'overdue') {
    if (s.window) return `Missed ${SEASONS.includes(s.window) ? 'the ' + s.window : s.window}`;
    return `${cap(span(-s.left))} overdue`;
  }
  if (s.state === 'due') {
    if (s.window) return `Due ${windowText(s.window)}, by ${dayText(s.by)}`;
    return s.unknown ? 'No date yet: due now' : 'Due today';
  }
  if (s.window) return s.left <= 1 ? `Due from ${s.left ? 'tomorrow' : 'today'}` : `Next: ${s.window}, from ${dayText(s.due)}`;
  if (s.left === 1) return 'Due tomorrow';
  return `Due in ${span(s.left)}`;
}

// Short "last done" words: "today", "yesterday", "12 days ago", "3 months ago".
export function ago(last, t) {
  if (last == null) return 'not sure';
  const d = t - last;
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${span(d)} ago`;
}
