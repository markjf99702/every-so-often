// "Add to calendar": an .ics file for Apple Calendar, Outlook and the rest, and a Google Calendar link.
// Due dates are whole days, so the events are all-day ones, with a reminder at 9 in the morning.

const compact = day => day.replace(/-/g, '');
const nextDay = day => new Date(Date.parse(day + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 octets get folded, per RFC 5545.
function fold(line) {
  const out = [], enc = new TextEncoder();
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

// events: [{ uid, title, details, day: 'YYYY-MM-DD', url }]
export function icsFor(events, now = Date.now()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//junkdrawer.works//Every So Often//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      // The same thing and date keeps the same id, so adding it again updates the event rather than doubling it.
      `UID:${ev.uid}@every-so-often`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(ev.day)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(ev.day))}`,
      `SUMMARY:${esc(ev.title)}`,
      `DESCRIPTION:${esc(ev.details)}`,
      ...(ev.url ? [`URL:${ev.url}`] : []),
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT9H', `DESCRIPTION:${esc(ev.title)}`, 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function googleLink({ title, details, day }) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${compact(day)}/${compact(nextDay(day))}`, details });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
