// Small pieces every screen uses: escaping, icons, the toast, the sheet, and one set of event
// handlers for whichever screen is showing.

export const app = document.getElementById('app');

export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function go(path, replace = false) {
  const hash = '#' + path;
  if (replace) location.replace(hash); else location.hash = hash;
}

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
export const ICON = {
  check: svg('<path d="M4.5 12.5l5 5 10-11"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  cal: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  pencil: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
};

let toastTimer;
export function toast(message, action) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  if (action) el.querySelector('button').onclick = () => { el.hidden = true; action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 7000 : 3000);
}

// The sheet that slides up. bind(body, close) wires up what's inside once it's drawn.
export function sheet(html, bind) {
  const dlg = document.getElementById('sheet');
  const body = dlg.querySelector('.sheet-body');
  body.innerHTML = html;
  if (!dlg.open) { if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', ''); }
  const close = () => (dlg.close ? dlg.close() : dlg.removeAttribute('open'));
  bind?.(body, close);
  return close;
}
export const sheetOpen = () => document.getElementById('sheet').open;

// Tapping the dimmed backdrop closes the sheet.
document.getElementById('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') e.target.close(); });

// One set of listeners on the page; each screen says what they do.
let handlers = {};
export function on(h) { handlers = h; }
for (const type of ['click', 'input', 'change', 'submit', 'keydown']) {
  app.addEventListener(type, e => handlers[type]?.(e));
}

// The single-file copy (dist/) can't start downloads inside another page, and has no service worker.
export const single = 'single' in document.documentElement.dataset;
