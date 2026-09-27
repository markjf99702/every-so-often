// The date maths, the merge, the calendar file and the starter list, without a browser:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/due.js';
import * as M from '../js/model.js';
import { icsFor, googleLink } from '../js/cal.js';
import { CATALOG, byKey } from '../js/catalog.js';
import { sampleDoc } from '../js/sample.js';

const n = D.num;
const k = D.key;
const every = (count, unit) => ({ kind: 'every', n: count, unit });
const seasons = (...list) => ({ kind: 'seasons', list });
const months = (...list) => ({ kind: 'months', list });
const st = (rule, last, today, created = today, hemi = 'north') => D.status(rule, last && n(last), n(today), n(created), hemi);

// ---------- days ----------

test('days round-trip, and impossible dates are refused', () => {
  for (const d of ['1970-01-01', '2026-09-27', '2028-02-29', '2099-12-31']) assert.equal(k(n(d)), d);
  assert.ok(D.isKey('2028-02-29'));
  assert.ok(!D.isKey('2026-02-29'));
  assert.ok(!D.isKey('2026-13-01'));
  assert.ok(!D.isKey('26-09-27'));
  assert.equal(n('2026-03-09') - n('2026-03-07'), 2, 'a day is a day across the clocks going forward');
  assert.equal(n('2026-11-02') - n('2026-10-31'), 2, 'and across them going back');
});

test('today is the date where the person is, either side of midnight and of a clock change', () => {
  // 07:30 UTC on March 8 is 23:30 the night before in Los Angeles, just before the clocks go forward.
  assert.equal(D.today(new Date('2026-03-08T07:30:00Z'), 'America/Los_Angeles'), '2026-03-07');
  assert.equal(D.today(new Date('2026-03-08T10:30:00Z'), 'America/Los_Angeles'), '2026-03-08');
  // New Zealand's clocks go forward on September 27, 2026; half past midnight there is still the 26th in UTC.
  assert.equal(D.today(new Date('2026-09-26T12:30:00Z'), 'Pacific/Auckland'), '2026-09-27');
  assert.equal(D.today(new Date('2026-10-24T23:30:00Z'), 'Europe/London'), '2026-10-25');
  assert.equal(D.today(new Date('2026-10-24T23:30:00Z'), 'UTC'), '2026-10-24');
});

test('today follows the device time zone when none is given', () => {
  const was = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    assert.equal(D.today(new Date('2026-11-01T03:30:00Z')), '2026-10-31');
    process.env.TZ = 'Asia/Tokyo';
    assert.equal(D.today(new Date('2026-11-01T03:30:00Z')), '2026-11-01');
  } finally {
    if (was === undefined) delete process.env.TZ; else process.env.TZ = was;
  }
});

test('adding months keeps to the end of short months', () => {
  const am = (d, m) => k(D.addMonths(n(d), m));
  assert.equal(am('2026-01-31', 1), '2026-02-28');
  assert.equal(am('2028-01-31', 1), '2028-02-29', 'leap year');
  assert.equal(am('2026-03-31', 1), '2026-04-30');
  assert.equal(am('2026-08-31', 6), '2027-02-28');
  assert.equal(am('2026-10-31', 3), '2027-01-31');
  assert.equal(am('2026-12-15', 1), '2027-01-15', 'across a year');
  assert.equal(am('2026-03-31', -1), '2026-02-28', 'backwards');
  assert.equal(am('2028-02-29', 12), '2029-02-28', 'a leap day plus a year');
  assert.equal(am('2028-02-29', 48), '2032-02-29', 'plus four years lands on a leap day again');
  const ae = (d, r) => k(D.addEvery(n(d), r));
  assert.equal(ae('2026-06-22', every(90, 'day')), '2026-09-20');
  assert.equal(ae('2026-02-26', every(2, 'week')), '2026-03-12');
  assert.equal(ae('2026-05-31', every(3, 'month')), '2026-08-31');
  assert.equal(ae('2026-11-30', every(3, 'month')), '2027-02-28');
  assert.equal(ae('2028-02-29', every(1, 'year')), '2029-02-28');
  assert.equal(ae('2026-09-27', every(10, 'year')), '2036-09-27');
});

// ---------- every so many days, weeks, months or years ----------

test('an every-90-days job goes later, due soon, due, overdue', () => {
  const r = every(90, 'day');
  assert.equal(D.soonDays(90), 14);
  const later = st(r, '2026-06-01', '2026-07-01');
  assert.equal(later.state, 'later');
  assert.equal(k(later.due), '2026-08-30');
  assert.equal(later.left, 60);
  assert.ok(Math.abs(later.frac - 30 / 90) < 1e-9);
  assert.ok(Math.abs(later.soonAt - 76 / 90) < 1e-9);
  assert.equal(st(r, '2026-06-01', '2026-08-15').state, 'later');
  assert.equal(st(r, '2026-06-01', '2026-08-16').state, 'soon');
  assert.equal(st(r, '2026-06-01', '2026-08-29').state, 'soon');
  assert.equal(st(r, '2026-06-01', '2026-08-30').state, 'due');
  const over = st(r, '2026-06-01', '2026-09-12');
  assert.equal(over.state, 'overdue');
  assert.equal(over.left, -13);
  assert.ok(over.frac > 1);
});

test('due soon starts sooner for longer intervals, within limits', () => {
  assert.equal(D.soonDays(7), 1);
  assert.equal(D.soonDays(30), 5);
  assert.equal(D.soonDays(365), 21);
  assert.equal(D.soonDays(3650), 21);
  assert.equal(st(every(1, 'week'), '2026-09-20', '2026-09-26').state, 'soon');
  assert.equal(st(every(1, 'week'), '2026-09-20', '2026-09-25').state, 'later');
});

test('a monthly job logged on the 31st comes due at the end of the next month', () => {
  const s = st(every(1, 'month'), '2026-01-31', '2026-02-27');
  assert.equal(k(s.due), '2026-02-28');
  assert.equal(s.state, 'soon');
  assert.equal(st(every(1, 'month'), '2026-01-31', '2026-02-28').state, 'due');
  assert.equal(st(every(1, 'month'), '2026-01-31', '2026-03-01').state, 'overdue');
});

test('with no date to go on, an every-so-often job is due now', () => {
  const s = st(every(3, 'month'), null, '2026-09-27');
  assert.equal(s.state, 'due');
  assert.ok(s.unknown);
  assert.equal(D.statusText(s), 'No date yet: due now');
});

test('a date in the future (another device’s clock, a typo) doesn’t break the gauge', () => {
  const s = st(every(30, 'day'), '2026-10-05', '2026-09-27');
  assert.equal(s.state, 'later');
  assert.equal(s.frac, 0);
});

// ---------- seasons and months ----------

test('gutters each spring and fall, in the northern hemisphere', () => {
  const r = seasons('spring', 'fall');
  // Done in April: fine through the summer, due soon just before September, due in the fall.
  assert.equal(st(r, '2026-04-22', '2026-07-10').state, 'later');
  const soon = st(r, '2026-04-22', '2026-08-25');
  assert.equal(soon.state, 'soon');
  assert.equal(k(soon.due), '2026-09-01');
  assert.equal(soon.window, 'fall');
  const due = st(r, '2026-04-22', '2026-09-27');
  assert.equal(due.state, 'due');
  assert.equal(k(due.by), '2026-11-30');
  assert.equal(D.statusText(due), 'Due this fall, by Nov 30');
  assert.ok(due.frac >= due.soonAt && due.frac <= 1, 'the gauge is in the due-soon zone');
  // Not done in the fall: overdue through the winter, then due again when spring opens.
  const missed = st(r, '2026-04-22', '2026-12-05');
  assert.equal(missed.state, 'overdue');
  assert.equal(D.statusText(missed), 'Missed the fall');
  assert.equal(st(r, '2026-04-22', '2027-03-05').state, 'due');
  // Done in October: fine until spring.
  const done = st(r, '2026-10-10', '2026-12-05');
  assert.equal(done.state, 'later');
  assert.equal(k(done.due), '2027-03-01');
});

test('done a little before the season counts for it, done a little after counts for the one before', () => {
  const r = seasons('spring', 'fall');
  const early = st(r, '2026-08-25', '2026-09-10');
  assert.equal(early.state, 'later', 'late August counts for the fall');
  assert.equal(k(early.due), '2027-03-01');
  const late = st(r, '2026-06-15', '2026-07-01');
  assert.equal(late.state, 'later', 'mid June counts for the spring, done late');
  assert.equal(k(late.due), '2026-09-01');
  // More than the grace period early doesn't count.
  assert.equal(st(r, '2026-08-01', '2026-09-10').state, 'due');
});

test('winter runs across the new year', () => {
  const r = seasons('winter');
  const s = st(r, '2026-01-15', '2026-02-20');
  assert.equal(s.state, 'later');
  assert.equal(k(s.due), '2026-12-01');
  const due = st(r, '2026-01-15', '2026-12-10');
  assert.equal(due.state, 'due');
  assert.equal(k(due.by), '2027-02-28');
  assert.equal(st(r, '2026-12-20', '2027-02-10').state, 'later', 'done in December counts for the winter that runs into February');
});

test('seasons flip in the southern hemisphere', () => {
  const r = seasons('spring');
  const south = st(r, '2025-10-05', '2026-09-27', '2025-01-01', 'south');
  assert.equal(south.state, 'due', 'spring is September to November there');
  assert.equal(k(south.by), '2026-11-30');
  const north = st(r, '2025-10-05', '2026-09-27', '2025-01-01', 'north');
  assert.equal(north.state, 'overdue', 'in the north, this spring was missed');
  assert.deepEqual(D.windowsOf(seasons('fall'), 'south').map(w => w.m), [3]);
  assert.deepEqual(D.windowsOf(seasons('fall'), 'north').map(w => w.m), [9]);
});

test('set months: batteries each April and October', () => {
  const r = months(4, 10);
  const soon = st(r, '2026-04-03', '2026-09-27');
  assert.equal(soon.state, 'soon');
  assert.equal(k(soon.due), '2026-10-01');
  assert.equal(soon.window, 'October');
  const due = st(r, '2026-04-03', '2026-10-15');
  assert.equal(due.state, 'due');
  assert.equal(D.statusText(due), 'Due in October, by Oct 31');
  const missed = st(r, '2026-04-03', '2026-11-02');
  assert.equal(missed.state, 'overdue');
  assert.equal(D.statusText(missed), 'Missed October');
  assert.equal(st(r, '2026-10-20', '2026-11-02').state, 'later');
});

test('a seasonal job with no date waits for its season rather than showing overdue', () => {
  const r = seasons('spring', 'fall');
  const midSummer = st(r, null, '2026-07-10', '2026-07-10');
  assert.equal(midSummer.state, 'later');
  assert.equal(k(midSummer.due), '2026-09-01');
  const inFall = st(r, null, '2026-09-27', '2026-09-27');
  assert.equal(inFall.state, 'due');
  assert.ok(inFall.unknown);
  // Added last year and never logged: a window has gone by, so it's overdue.
  assert.equal(st(r, null, '2026-07-10', '2025-06-01').state, 'overdue');
});

test('things sort most overdue first, then soonest due', () => {
  const list = [
    st(every(1, 'year'), '2026-01-01', '2026-09-27'), // later, Jan 1
    st(every(30, 'day'), '2026-08-01', '2026-09-27'), // overdue by 27 days
    st(every(30, 'day'), '2026-08-20', '2026-09-27'), // overdue by 8 days
    st(every(30, 'day'), '2026-08-28', '2026-09-27'), // due today
    st(every(90, 'day'), '2026-07-01', '2026-09-27'), // soon, in 2 days
    st(seasons('fall'), '2025-10-01', '2026-09-27'), // due this fall, by Nov 30
  ];
  const sorted = [...list].sort(D.compare);
  assert.deepEqual(sorted.map(s => s.state), ['overdue', 'overdue', 'due', 'due', 'soon', 'later']);
  assert.deepEqual(sorted.map(s => list.indexOf(s)), [1, 2, 3, 5, 4, 0]);
});

test('words', () => {
  assert.equal(D.span(1), '1 day');
  assert.equal(D.span(13), '13 days');
  assert.equal(D.span(14), '2 weeks');
  assert.equal(D.span(56), '8 weeks');
  assert.equal(D.span(57), '2 months');
  assert.equal(D.span(400), '13 months');
  assert.equal(D.span(800), '2 years');
  assert.equal(D.ruleText(every(90, 'day')), 'Every 90 days');
  assert.equal(D.ruleText(every(1, 'month')), 'Every month');
  assert.equal(D.ruleText(every(2, 'week')), 'Every two weeks');
  assert.equal(D.ruleText(seasons('spring', 'fall')), 'Each spring and fall');
  assert.equal(D.ruleText(seasons('spring', 'summer', 'fall')), 'Each spring, summer and fall');
  assert.equal(D.ruleText(months(4, 10)), 'Every April and October');
  assert.equal(D.statusText(st(every(7, 'day'), '2026-09-21', '2026-09-27')), 'Due tomorrow');
  assert.equal(D.statusText(st(every(30, 'day'), '2026-08-01', '2026-09-27')), '4 weeks overdue');
  assert.equal(D.ago(n('2026-09-26'), n('2026-09-27')), 'yesterday');
  assert.equal(D.ago(null, 0), 'not sure');
});

test('rules are checked', () => {
  assert.deepEqual(D.cleanRule({ kind: 'every', n: '3', unit: 'month' }), every(3, 'month'));
  assert.equal(D.cleanRule({ kind: 'every', n: 0, unit: 'month' }), null);
  assert.equal(D.cleanRule({ kind: 'every', n: 3, unit: 'fortnight' }), null);
  assert.deepEqual(D.cleanRule({ kind: 'seasons', list: ['fall', 'spring', 'monsoon'] }), seasons('spring', 'fall'));
  assert.equal(D.cleanRule({ kind: 'seasons', list: [] }), null);
  assert.deepEqual(D.cleanRule({ kind: 'months', list: [10, 4, 4, 13] }), months(4, 10));
});

// ---------- merging ----------

const thing = (id, extra = {}) => ({ id, name: 'Thing ' + id, area: 'House', rule: every(1, 'month'), remember: '', created: '2026-01-01', t: 100, log: {}, ...extra });
const doc = (...items) => M.cleanDoc({ app: M.APP, items: Object.fromEntries(items.map(x => [x.id, x])) });
const same = (a, b) => assert.equal(M.canon(a), M.canon(b));

test('a doc is cleaned of anything malformed', () => {
  const d = M.cleanDoc({ app: M.APP, items: {
    a: thing('a'),
    b: { id: 'b', name: '', rule: every(1, 'month') },
    c: { id: 'c', name: 'No rule' },
    'd d': thing('d d'),
    e: thing('e', { log: { x1: { day: '2026-02-30', t: 1 }, x2: { day: '2026-02-01', t: 1, note: '  fine  ' }, x3: { del: 1, t: 5 } } }),
    f: thing('f', { del: 200 }),
    g: { id: 'g', del: 1, t: 9 },
  }, prefs: { hemisphere: { v: 'south', t: 3 }, junk: 1 } });
  assert.deepEqual(Object.keys(d.items).sort(), ['a', 'e', 'f']);
  assert.deepEqual(M.live(d).map(x => x.id).sort(), ['a', 'e']);
  assert.deepEqual(d.items.e.log, { x2: { day: '2026-02-01', t: 1, note: 'fine' }, x3: { del: 1, t: 5 } });
  assert.deepEqual(d.prefs, { hemisphere: { v: 'south', t: 3 } });
  assert.deepEqual(M.cleanDoc('nonsense'), M.blankDoc());
});

test('done on the phone and done on the laptop: both entries keep', () => {
  const phone = doc(thing('a', { log: { p1: { day: '2026-09-20', t: 200 } } }));
  const laptop = doc(thing('a', { log: { l1: { day: '2026-06-18', t: 150, note: 'MERV 8' } } }));
  const m = M.mergeDocs(phone, laptop);
  assert.deepEqual(M.entries(m.items.a).map(e => e.day), ['2026-09-20', '2026-06-18']);
  assert.equal(M.lastDone(m.items.a), '2026-09-20');
});

test('the same day logged on two devices with the same note shows as one entry', () => {
  const a = doc(thing('a', { log: { zz: { day: '2026-09-27', t: 300 } } }));
  const b = doc(thing('a', { log: { aa: { day: '2026-09-27', t: 310 } } }));
  const m = M.mergeDocs(a, b);
  assert.deepEqual(M.entries(m.items.a).map(e => e.id), ['aa'], 'one entry, the smaller id');
  // A different note means a different entry.
  const c = doc(thing('a', { log: { cc: { day: '2026-09-27', t: 320, note: 'the other car' } } }));
  assert.equal(M.entries(M.mergeDocs(m, c).items.a).length, 2);
  // Deleting it deletes both copies, here and wherever they merge.
  const gone = M.removeEntry(m, 'a', 'aa');
  assert.equal(M.entries(gone.items.a).length, 0);
  assert.equal(M.entries(M.mergeDocs(gone, a).items.a).length, 0);
  assert.equal(M.entries(M.mergeDocs(b, gone).items.a).length, 0);
  // Moving it to another day moves it once, rather than leaving the other copy behind.
  const moved = M.putEntry(m, 'a', 'aa', { day: '2026-09-25' });
  assert.deepEqual(M.entries(moved.items.a).map(e => e.day), ['2026-09-25']);
  assert.deepEqual(M.entries(M.mergeDocs(moved, a).items.a).map(e => e.day), ['2026-09-25']);
});

test('the newer change to a thing wins, and its history still merges', () => {
  const a = doc(thing('a', { name: 'Furnace filter', t: 500, log: { e1: { day: '2026-01-02', t: 100 } } }));
  const b = doc(thing('a', { name: 'Change the furnace filter', remember: '16×25×1', t: 600, log: { e2: { day: '2026-04-02', t: 610 } } }));
  const m = M.mergeDocs(a, b);
  assert.equal(m.items.a.name, 'Change the furnace filter');
  assert.equal(m.items.a.remember, '16×25×1');
  assert.equal(M.entries(m.items.a).length, 2);
});

test('a removal reaches the other device, unless the thing changed after it', () => {
  const a = doc(thing('a', { t: 100 }), thing('b', { t: 100 }));
  const gone = M.removeThing(a, 'a');
  assert.ok(M.gone(M.mergeDocs(a, gone).items.a));
  assert.ok(M.gone(M.mergeDocs(gone, a).items.a));
  assert.deepEqual(M.live(M.mergeDocs(gone, a)).map(x => x.id), ['b']);
  // Logged on another device after the removal: it stays.
  const later = doc(thing('a', { t: 100, log: { x: { day: '2026-09-27', t: gone.items.a.del + 1000 } } }));
  assert.ok(!M.gone(M.mergeDocs(gone, later).items.a));
  // A removed log entry stays removed.
  const logged = M.putEntry(a, 'b', 'e1', { day: '2026-09-01' });
  const unlogged = M.removeEntry(logged, 'b', 'e1');
  assert.equal(M.entries(M.mergeDocs(logged, unlogged).items.b).length, 0);
});

test('a first sync takes the union: nothing is removed, and the same thing set up twice becomes one', () => {
  const phone = M.cleanDoc({ app: M.APP, items: {
    p1: thing('p1', { key: 'furnace-filter', name: 'Change the furnace filter', log: { a: { day: '2026-06-01', t: 5 } } }),
    p2: thing('p2', { name: 'Walk the  fence line', area: 'garden' }),
    p3: thing('p3', { name: 'Only on the phone' }),
    gone: thing('gone', { del: 999 }),
  } });
  const drive = M.cleanDoc({ app: M.APP, items: {
    d1: thing('d1', { key: 'furnace-filter', name: 'Furnace filter', log: { b: { day: '2026-03-01', t: 5 } } }),
    d2: thing('d2', { name: 'Walk the fence line', area: 'Garden' }),
    gone: thing('gone'),
  } });
  const m = M.mergeDocs(phone, drive, { first: true });
  assert.deepEqual(M.live(m).map(x => x.id).sort(), ['d1', 'd2', 'gone', 'p3']);
  assert.deepEqual(M.entries(m.items.d1).map(e => e.day), ['2026-06-01', '2026-03-01']);
  // Not on a later sync: then the removal counts.
  assert.ok(M.gone(M.mergeDocs(phone, drive).items.gone));
});

test('merging is order-free and repeatable, across many random edits', () => {
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rand() * a.length)];
  const ids = ['a', 'b', 'c', 'd', 'e'], days = ['2026-01-05', '2026-03-05', '2026-06-05', '2026-09-05'];
  const randomDoc = () => {
    const items = {};
    for (const id of ids) {
      if (rand() < 0.2) continue;
      const log = {};
      for (let i = 0; i < 3; i++) if (rand() < 0.6) log[pick(['x', 'y', 'z', 'w'])] = rand() < 0.2 ? { del: 1, t: Math.floor(rand() * 50) } : { day: pick(days), t: Math.floor(rand() * 50), ...(rand() < 0.3 ? { note: pick(['a', 'b']) } : {}) };
      items[id] = thing(id, { name: pick(['One', 'Two']), t: Math.floor(rand() * 50), log, ...(rand() < 0.3 ? { del: Math.floor(rand() * 60) } : {}) });
    }
    return M.cleanDoc({ app: M.APP, items, prefs: rand() < 0.5 ? { hemisphere: { v: pick(['north', 'south']), t: Math.floor(rand() * 50) } } : {} });
  };
  for (let i = 0; i < 400; i++) {
    const a = randomDoc(), b = randomDoc(), c = randomDoc();
    const ab = M.mergeDocs(a, b);
    same(ab, M.mergeDocs(b, a));
    same(M.mergeDocs(ab, b), ab);
    same(M.mergeDocs(ab, ab), ab);
    same(M.mergeDocs(M.mergeDocs(a, b), c), M.mergeDocs(a, M.mergeDocs(b, c)));
  }
});

test('changes stamp a newer time even when the clock is behind', () => {
  let d = M.putThing(M.blankDoc(), { id: 'a', name: 'X', area: 'House', rule: every(1, 'year'), created: '2026-09-27' });
  d = { ...d, items: { a: { ...d.items.a, t: Date.now() + 1e7 } } }; // made on a device whose clock runs ahead
  const next = M.putThing(d, { id: 'a', name: 'Y' });
  assert.ok(next.items.a.t > d.items.a.t);
  assert.equal(next.items.a.name, 'Y');
  assert.throws(() => M.putThing(M.blankDoc(), { id: 'b', name: '', rule: every(1, 'year') }));
  const removed = M.removeThing(next, 'a');
  assert.ok(M.gone(removed.items.a));
  const back = M.restoreThing(removed, 'a');
  assert.ok(!M.gone(back.items.a) && back.items.a.name === 'Y');
  assert.ok(!M.gone(M.mergeDocs(back, removed).items.a), 'the undo wins over the deletion it undid');
});

test('the hemisphere comes from the setting, or a guess from the time zone', () => {
  assert.equal(M.hemisphere(M.blankDoc(), 'Australia/Sydney'), 'south');
  assert.equal(M.hemisphere(M.blankDoc(), 'America/Argentina/Buenos_Aires'), 'south');
  assert.equal(M.hemisphere(M.blankDoc(), 'America/Chicago'), 'north');
  assert.equal(M.hemisphere(M.setPref(M.blankDoc(), 'hemisphere', 'south'), 'America/Chicago'), 'south');
});

// ---------- the calendar ----------

test('the .ics file has all-day events and is well formed', () => {
  const ics = icsFor([{ uid: 'abc-2026-10-14', title: 'Change the furnace filter; again, really', details: 'Every 90 days.\nRemember: 16×25×1 MERV 8', day: '2026-10-14', url: 'https://junkdrawer.works/every-so-often/' },
    { uid: 'def-2026-12-31', title: 'Year end', details: '', day: '2026-12-31' }], Date.UTC(2026, 8, 27, 12));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261014\r\nDTEND;VALUE=DATE:20261015\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n/, 'the last day of the year ends on the first of the next');
  assert.ok(ics.includes('SUMMARY:Change the furnace filter\\; again\\, really\r\n'));
  assert.ok(ics.includes('UID:abc-2026-10-14@every-so-often'));
  assert.ok(ics.includes('TRIGGER:PT9H'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `folded: ${line}`);
  assert.ok(ics.replace(/\r\n /g, '').includes('Remember: 16×25×1 MERV 8'), 'unfolded, the text is whole');
  assert.match(googleLink({ title: 'x', details: 'y', day: '2026-02-28' }), /dates=20260228%2F20260301/);
});

// ---------- the starter list and the sample ----------

test('every starter job is valid and has its own key', () => {
  const keys = new Set();
  for (const g of CATALOG) {
    assert.ok(M.AREAS.some(a => a.name === g.area), g.area);
    for (const [key, name, rule] of g.items) {
      assert.ok(!keys.has(key), 'duplicate ' + key);
      keys.add(key);
      assert.deepEqual(D.cleanRule(rule), rule, key);
      assert.ok(name.length <= 80 && name === name.trim(), key);
    }
  }
  assert.ok(keys.size >= 60);
  assert.equal(byKey['furnace-filter'].rule.n, 90);
  assert.deepEqual(byKey.gutters.rule, seasons('spring', 'fall'));
});

test('the sample has something in every state, whatever the date', () => {
  for (const today of ['2026-09-27', '2027-01-15', '2027-04-02', '2027-07-20']) {
    const s = sampleDoc(today);
    same(M.cleanDoc(s), s);
    const states = new Set(M.live(s).map(x => D.status(x.rule, M.lastNum(x), n(today), n(x.created), 'north').state));
    for (const want of ['overdue', 'soon', 'later']) assert.ok(states.has(want), `${today}: nothing ${want}`);
  }
});

// ---------- the store ----------

test('the store saves to localStorage, keeps sample data apart, and merges backups', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: key => (mem.has(key) ? mem.get(key) : null), setItem: (key, v) => mem.set(key, String(v)), removeItem: key => mem.delete(key) };
  const { store, KEY } = await import('../js/store.js');
  const id = store.add({ name: 'Flush the water heater', area: 'House', rule: every(1, 'year') });
  const eid = store.log(id, '2026-09-01', 'Drained until clear');
  assert.equal(M.lastDone(store.thing(id)), '2026-09-01');
  assert.ok(JSON.parse(mem.get(KEY)).items[id]);

  store.startSample();
  assert.ok(store.sample && store.things().length > 10);
  store.add({ name: 'Sample-only thing', area: 'House', rule: every(1, 'year') });
  store.endSample();
  assert.deepEqual(store.things().map(x => x.name), ['Flush the water heater'], 'the sample never touched the real list');

  const backup = store.backup();
  store.unlog(id, eid);
  assert.equal(M.lastDone(store.thing(id)), null);
  const other = JSON.parse(backup);
  other.items.zz = thing('zz', { name: 'From the backup' });
  assert.equal(store.restoreBackup(JSON.stringify(other)), 1);
  assert.equal(store.things().length, 2);
  assert.equal(M.lastDone(store.thing(id)), null, 'the undo is newer than the backup, so it stays undone');
  assert.throws(() => store.restoreBackup('{"app":"something-else"}'), /isn’t an Every So Often backup/);
  delete globalThis.localStorage;
});
