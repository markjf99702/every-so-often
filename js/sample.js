// A made-up household with a year and a half of history, for looking around and for screenshots.
// Everything is placed relative to today, so it always has something overdue, something due soon
// and plenty that's fine. It lives in its own storage and never syncs.
import { key, num } from './due.js';
import { byKey } from './catalog.js';
import { APP } from './model.js';

// [catalog key or null, name, area, rule, remember, days ago it was done (newest first), { daysAgo: note }]
const every = (n, unit) => ({ kind: 'every', n, unit });
const THINGS = [
  ['furnace-filter', null, null, null, '16×25×1 MERV 8. Two spares on the shelf by the furnace.', [97, 186, 279, 371], { 97: 'MERV 8, $12 at the hardware store', 279: 'Was very grey' }],
  ['test-alarms', null, null, null, 'Hallway, kitchen, basement stairs, and the CO alarm by the furnace', [27, 58, 90, 121]],
  ['alarm-batteries', null, null, null, '9V in the hallway and basement ones, AA in the kitchen one', [303], { 303: 'All four, and the CO alarm' }],
  ['dryer-vent', null, null, null, 'Vent comes out on the side of the house by the AC unit', [402], { 402: 'Used the brush kit. Lots of lint at the elbow' }],
  ['gutters', null, null, null, '', [158, 340], { 158: 'Downspout by the garage was blocked' }],
  ['dishwasher-filter', null, null, null, 'Bottom rack out, twist the cylinder a quarter turn', [11, 44, 76]],
  ['softener-salt', null, null, null, 'Two 40 lb bags of pellets, not crystals', [36, 80, 125]],
  ['flea-tick', 'Biscuit’s flea and tick pill', 'Pets', null, 'NexGard 10.1–24 lb, the orange box', [30, 60, 91, 121]],
  ['heartworm', 'Biscuit’s heartworm pill', 'Pets', null, 'Heartgard Plus, blue box, with dinner', [12, 43, 73]],
  ['nails', 'Trim Biscuit’s nails', 'Pets', null, 'Just the tips; the dew claws too', [20, 47, 75]],
  ['vet-visit', 'Biscuit’s checkup', 'Pets', null, 'Dr. Ortiz, Maple Street Vets, 555-0142', [201], { 201: 'Weighed 21 lb. Rabies booster good for 3 years' }],
  ['oil-change', null, null, null, '0W-20, 4.4 quarts. Next at 48,500 miles', [150, 330], { 150: 'At 43,610 miles, $64' }],
  ['tire-rotation', null, null, null, '', [150, 330]],
  ['tire-pressure', null, null, null, '35 psi front and back (door sticker)', [41, 75]],
  ['wipers', null, null, null, '24 in driver, 18 in passenger', [335]],
  ['chisels', null, null, null, '1000 then 6000 grit, 30° microbevel', [62, 150]],
  ['saw-table', null, null, null, 'Paste wax, not the silicone spray', [96, 190]],
  [null, 'Clean the router table fence', 'Workshop', every(6, 'month'), '', [40]],
  ['toothbrush', null, null, null, 'Sonicare W2 heads, the white ones', [82, 173]],
  ['dentist', null, null, null, 'Dr. Park. Ask about the night guard', [171, 355], { 171: 'No cavities' }],
  ['flu-shot', null, null, null, '', [360], { 360: 'At the pharmacy on 5th' }],
];

export function sampleDoc(todayKey) {
  const t = num(todayKey), made = Date.now() - 3 * 864e5;
  const items = {};
  THINGS.forEach(([k, name, area, rule, remember, days, notes = {}], i) => {
    const c = k ? byKey[k] : {};
    const id = 'sample' + String(i).padStart(2, '0');
    const log = {};
    days.forEach((d, j) => {
      const e = { day: key(t - d), t: made };
      if (notes[d]) e.note = notes[d];
      log[`${id}e${j}`] = e;
    });
    items[id] = {
      id, name: name || c.name, area: area || c.area, rule: rule || c.rule, remember,
      created: key(t - Math.max(...days) - 30), t: made, log, ...(k ? { key: k } : {}),
    };
  });
  return { app: APP, v: 1, items, prefs: {} };
}
