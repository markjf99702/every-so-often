// Keeps the list in this browser's localStorage, which is the working copy. Google Drive, when it's
// on, is a copy that sync.js merges into from every device.
import * as M from './model.js';
import { sampleDoc } from './sample.js';
import { today } from './due.js';

export const KEY = 'every-so-often';
const SAMPLE = 'every-so-often.sample';
const DEVICE = 'every-so-often.device'; // this device only: sample mode, folded groups

function get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function put(k, v) {
  try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; } catch { return false; }
}

let device = { sample: false, fold: {}, ...(get(DEVICE) || {}) };
let doc = read();
const listeners = [];

function read() {
  if (device.sample) {
    const s = get(SAMPLE);
    return s ? M.cleanDoc(s) : sampleDoc(today());
  }
  return M.cleanDoc(get(KEY));
}

function write(next) {
  doc = next;
  const ok = put(device.sample ? SAMPLE : KEY, M.canon(doc));
  if (!ok) listeners.forEach(f => f('full'));
  if (!device.sample) listeners.forEach(f => f('saved'));
}

export const store = {
  get doc() { return doc; },
  get sample() { return device.sample; },
  things: () => M.live(doc),
  thing: id => (doc.items[id] && !M.gone(doc.items[id]) ? doc.items[id] : null),
  onSave(f) { listeners.push(f); },

  // Picks up what another tab or a sync wrote.
  reload() { device = { sample: false, fold: {}, ...(get(DEVICE) || {}) }; doc = read(); },

  add(fields) {
    const id = fields.id || M.newId();
    write(M.putThing(doc, { ...fields, id, created: fields.created || today() }));
    return id;
  },
  update(id, fields) { write(M.putThing(doc, { ...fields, id })); },
  remove(id) { const old = doc.items[id]; write(M.removeThing(doc, id)); return old; },
  restore(item) { write(M.restoreThing(doc, item.id)); },
  log(id, day, note = '') { const eid = M.newId(); write(M.putEntry(doc, id, eid, { day, note })); return eid; },
  editEntry(id, eid, fields) { write(M.putEntry(doc, id, eid, fields)); },
  unlog(id, eid) { write(M.removeEntry(doc, id, eid)); },
  // Several changes saved as one.
  batch(fn) { let next = doc; fn({ put: f => { next = M.putThing(next, f); }, log: (id, day, note) => { next = M.putEntry(next, id, M.newId(), { day, note }); } }); write(next); },

  get hemisphere() { return M.hemisphere(doc); },
  set hemisphere(v) { write(M.setPref(doc, 'hemisphere', v)); },

  folded: g => !!device.fold[g],
  fold(g, v) { device.fold[g] = v; put(DEVICE, device); },

  startSample() {
    device.sample = true;
    put(DEVICE, device);
    put(SAMPLE, M.canon(sampleDoc(today())));
    doc = read();
  },
  endSample() {
    device.sample = false;
    put(DEVICE, device);
    try { localStorage.removeItem(SAMPLE); } catch { /* nothing to remove */ }
    doc = read();
  },

  backup: () => JSON.stringify({ ...M.cleanDoc(doc), saved: new Date().toISOString() }, null, 1),
  // Merges a backup in, thing by thing, so nothing here is lost. Returns how many things it added or changed.
  restoreBackup(textIn) {
    let raw;
    try { raw = JSON.parse(textIn); } catch { raw = null; }
    if (raw?.app !== M.APP || typeof raw.items !== 'object') throw new Error('That file isn’t an Every So Often backup.');
    const incoming = M.cleanDoc(raw);
    const merged = M.mergeDocs(doc, incoming, { first: true });
    const changed = Object.keys(merged.items).filter(id => M.canon(merged.items[id]) !== M.canon(doc.items[id]) && !M.gone(merged.items[id])).length;
    write(merged);
    return changed;
  },
  erase() {
    try { localStorage.removeItem(device.sample ? SAMPLE : KEY); } catch { /* already gone */ }
    doc = M.blankDoc();
  },
};
