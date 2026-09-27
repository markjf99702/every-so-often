// Uses the app in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// Someone sets up their list from the starter list, logs jobs done, keeps notes, adds to a calendar and backs
// it up. Then three devices save through a stand-in Google Drive (test/fake-google.mjs): turning it on, a
// second device joining, edits on both, a deletion, an expired sign-in, a sign-in from another project, and stopping.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { fakeGoogle } from './fake-google.mjs';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
});
await new Promise(ok => server.listen(+process.env.PORT || 8104, ok));
const base = `http://localhost:${server.address().port}/`;
const origin = base.slice(0, -1);

const browser = await pw.chromium.launch();
const problems = [];
const GOOGLE = /^https:\/\/(accounts\.google\.com|www\.googleapis\.com)\//;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

async function device(opts = {}, { google = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, ...opts });
  if (google) await google.install(ctx, { rewrite: { '**/js/sync.js': s => s.replace("['https://junkdrawer.works']", `['https://junkdrawer.works', '${origin}']`) } });
  // Records the home-screen badge.
  await ctx.addInitScript(() => {
    window.__badge = [];
    navigator.setAppBadge = n => { window.__badge.push(n); return Promise.resolve(); };
    navigator.clearAppBadge = () => { window.__badge.push(0); return Promise.resolve(); };
  });
  const page = await ctx.newPage();
  watch(page, !!google);
  return { ctx, page };
}
function watch(page, google) {
  page.on('pageerror', e => problems.push(e.message));
  // Chrome logs a refused request to the console; with Drive, one refusal (the expired sign-in) is expected.
  page.on('console', m => { if (m.type() === 'error' && !(google && /status of 401/.test(m.text()))) problems.push(m.text()); });
  page.on('requestfailed', r => problems.push('failed: ' + r.url()));
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('blob:') && !(google && GOOGLE.test(r.url()))) problems.push('left the site: ' + r.url()); });
}

const fits = async (page, where) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${where} scrolls sideways on a phone`);
const text = page => page.locator('main').innerText();
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await wait(100); }
  throw new Error('timed out waiting for ' + what);
}
const tag = (page, name) => page.locator('article.tag', { has: page.locator('h3', { hasText: name }) });
const group = (page, k) => page.locator(`.group.g-${k}`);
const dayAgo = (page, n) => page.evaluate(n => { const { D } = window.everySoOften; return D.key(D.num(D.today()) - n); }, n);
const niceDay = (page, key, year = true) => page.evaluate(([k, y]) => window.everySoOften.D.dayText(window.everySoOften.D.num(k), y), [key, year]);
const store = (page, fn, arg) => page.evaluate(([f, a]) => new Function('s', 'M', 'D', 'a', f)(window.everySoOften.store, window.everySoOften.M, window.everySoOften.D, a), [fn, arg]);
const names = page => store(page, 'return s.things().map(x => x.name).sort()');

// ================= On one phone, no Drive =================
const phone = await device();
let page = phone.page;
await page.goto(base);
await page.evaluate(() => document.fonts.ready);
assert.match(await text(page), /The jobs you do every few months/i);
assert.equal(await page.locator('#cloud').isHidden(), true, 'no Drive button away from junkdrawer.works');
await fits(page, 'the first screen');

// ---- the starter list ----
await page.click('text=Pick from the starter list');
await page.locator('.pick').first().waitFor();
assert.ok(await page.locator('.pick').count() >= 60, 'the starter list');
assert.match(await text(page), /typical ones, not rules/);
for (const key of ['furnace-filter', 'test-alarms', 'gutters', 'flea-tick', 'oil-change']) await page.click(`.pick[data-key="${key}"]`);
assert.equal(await page.locator('#pickCount').innerText(), '5 picked');
await page.click('.pick[data-key="oil-change"]');
assert.equal(await page.locator('#pickCount').innerText(), '4 picked', 'a second tap unpicks');
await fits(page, 'the starter list');
await page.click('#pickNext');
await page.waitForURL(/#\/start\/when$/);
await page.selectOption('li[data-key="furnace-filter"] select', '91');
await page.selectOption('li[data-key="flea-tick"] select', '0');
await page.selectOption('li[data-key="gutters"] select', 'date');
const gutterDay = await dayAgo(page, 200);
await page.fill('li[data-key="gutters"] input[type=date]', gutterDay);
await fits(page, 'when did you last');
await page.click('text=Add 4 things');
await page.waitForURL(/#\/$/);
await page.locator('.group').first().waitFor();
assert.match(await page.locator('#toast').innerText(), /Added 4 things/);
assert.equal(await group(page, 'overdue').locator('.tag').count(), 1);
assert.match(await group(page, 'overdue').innerText(), /Change the furnace filter[\s\S]*1 day overdue/);
assert.match(await group(page, 'soon').innerText(), /Test smoke and CO alarms[\s\S]*No date yet/);
assert.match(await group(page, 'later').innerText(), /Flea and tick treatment/);
assert.match(await page.locator('.summary').innerText(), /1 overdue/);
await fits(page, 'what’s due');
// The badge counts what's due now: the filter and the alarms (and the gutters if it's their season).
const dueNow = await page.locator('.group .tag.s-overdue, .group .tag.s-due').count();
assert.ok(dueNow >= 2);
assert.equal(await page.evaluate(() => window.__badge.at(-1)), dueNow, 'the home-screen badge shows how many are due');

// ---- done today, with undo ----
await tag(page, 'Change the furnace filter').locator('[data-done]').click();
await page.locator('.stamp').waitFor();
await page.locator('#toast button', { hasText: 'Undo' }).waitFor();
assert.equal(await group(page, 'overdue').count(), 0, 'nothing overdue once it’s done');
assert.match(await tag(page, 'Change the furnace filter').innerText(), /Due in 3 months/);
assert.equal(await page.evaluate(() => window.__badge.at(-1)), dueNow - 1);
await page.click('#toast button');
assert.match(await group(page, 'overdue').innerText(), /Change the furnace filter/, 'undo puts it back');
await tag(page, 'Change the furnace filter').locator('[data-done]').click();
await page.locator('#toast button').waitFor();
assert.equal(await tag(page, 'Change the furnace filter').locator('.tick').isDisabled(), true, 'one done a day');

// ---- another day, with a note ----
await tag(page, 'Test smoke and CO alarms').locator('[data-other]').click();
await page.locator('#odDay').waitFor();
await page.click('.sheet [data-ago="1"]');
assert.equal(await page.inputValue('#odDay'), await dayAgo(page, 1));
await page.fill('#odNote', 'All four beeped');
await fits(page, 'the log sheet');
await page.click('#odGo');
await page.locator('#sheet:not([open])').waitFor({ state: 'attached' });
assert.match(await group(page, 'later').innerText(), /Test smoke and CO alarms\s+Next due[\s\S]*Due in 4 weeks/i, 'done yesterday, so it’s a month away');
await tag(page, 'Test smoke and CO alarms').locator('.tag-body').click();
await page.waitForURL(/#\/thing\//);
assert.match(await page.locator('.history').innerText(), /All four beeped/);
await fits(page, 'a thing');

// ---- one thing: what to remember, the interval, the calendar, the history ----
await page.goto(base + '#/');
await tag(page, 'Change the furnace filter').locator('.tag-body').click();
await page.locator('.tag.big').waitFor();
assert.match(await page.locator('.note-card').innerText(), /size and rating/i, 'a prompt for what to remember');
await page.click('.note-card a');
await page.locator('#thingForm').waitFor();
await page.fill('textarea[name=remember]', '16×25×1 MERV 8. Spares by the furnace.');
await page.fill('input[name=n]', '60');
await page.selectOption('select[name=unit]', 'day');
await fits(page, 'the form');
await page.click('#thingForm button[type=submit]');
await page.locator('.tag.big').waitFor();
assert.match(await page.locator('.note-card').innerText(), /16×25×1 MERV 8/);
assert.match(await page.locator('.tag.big .rule').innerText(), /Every 60 days/);
const due60 = await dayAgo(page, -60);
assert.match(await page.locator('.facts').innerText(), new RegExp(await niceDay(page, due60)));
const [ics] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ics"]')]);
assert.equal(ics.suggestedFilename(), 'change-the-furnace-filter.ics');
const icsText = await readFile(await ics.path(), 'utf8');
assert.ok(icsText.includes(`DTSTART;VALUE=DATE:${due60.replace(/-/g, '')}`), 'the calendar file has the next due date');
assert.ok(icsText.replace(/\r\n /g, '').includes('Remember: 16×25×1 MERV 8'));
assert.ok((await page.getAttribute('a:has-text("Google Calendar")', 'href')).includes(`dates=${due60.replace(/-/g, '')}%2F`));
// Another entry, then change it, delete it and undo that.
await page.click('.tag.big [data-other]');
await page.fill('#odDay', await dayAgo(page, 64));
await page.fill('#odNote', '$12 at the hardware store');
await page.click('#odGo');
await until(async () => (await page.locator('.log li').count()) === 3, 'three entries: the starter-list guess, last month and today');
assert.match(await page.locator('.history .hint').innerText(), /On average every 7 weeks, against every 60 days/);
await page.locator('.log li').nth(1).locator('[data-edit-entry]').click();
assert.equal(await page.inputValue('#odNote'), '$12 at the hardware store');
await page.fill('#odNote', '$12, MERV 8');
await page.click('#odGo');
await until(async () => /\$12, MERV 8/.test(await page.locator('.history').innerText()), 'the changed note');
await page.locator('.log li').nth(1).locator('[data-del-entry]').click();
assert.equal(await page.locator('.log li').count(), 2);
await page.click('#toast button');
assert.equal(await page.locator('.log li').count(), 3, 'undo brings the entry back');
assert.match(await page.locator('.log li').nth(1).innerText(), /\$12, MERV 8/);

// ---- your own thing, in set months, in a new area ----
await page.click('a[aria-label="Add a thing"]');
await page.locator('#thingForm').waitFor();
await page.fill('input[name=name]', 'Descale the kettle');
await page.check('input[name=area][value="__new"]', { force: true });
await page.fill('input[name=newArea]', 'Kitchen');
await page.check('input[name=kind][value="months"]', { force: true });
await page.click('button[type=submit]');
assert.match(await page.locator('#formErr').innerText(), /Pick at least one month/);
await page.check('input[name=month][value="1"]', { force: true });
await page.check('input[name=month][value="7"]', { force: true });
await page.click('button[type=submit]');
await page.waitForURL(/#\/$/);
await tag(page, 'Descale the kettle').waitFor();
assert.match(await tag(page, 'Descale the kettle').innerText(), /Kitchen/);
assert.equal(await store(page, 'return s.things().find(x => x.name === "Descale the kettle").rule.list.join()'), '1,7');

// Areas filter the list.
await page.click('.areas .chip:has-text("Pets")');
assert.deepEqual(await page.locator('main .tag h3').allInnerTexts(), ['Flea and tick treatment']);
await page.click('.areas .chip:has-text("All")');
await fits(page, 'what’s due with areas');

// Delete, and undo.
await tag(page, 'Descale the kettle').locator('.tag-body').click();
await page.click('[data-act="delete"]');
await page.waitForURL(/#\/$/);
assert.equal(await tag(page, 'Descale the kettle').count(), 0);
await page.click('#toast button');
await tag(page, 'Descale the kettle').waitFor();

// Another tab on the same device sees changes as they happen.
const tab2 = await phone.ctx.newPage();
watch(tab2, false);
await tab2.goto(base);
await tag(tab2, 'Flea and tick treatment').waitFor();
await tag(page, 'Descale the kettle').locator('[data-done]').click();
await until(async () => (await tag(tab2, 'Descale the kettle').locator('.tick[disabled]').count()) === 1, 'the other tab to catch up');
await tab2.close();

// ---- settings: seasons, the calendar, a backup ----
await page.click('a[aria-label="Settings"]');
await page.locator('.choices').waitFor();
assert.equal(await page.locator('#driveCard').isHidden(), true);
await page.check('input[name=hemi][value="south"]');
assert.equal(await store(page, 'return s.hemisphere'), 'south');
await page.check('input[name=hemi][value="north"]');
const [all] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ics-all"]')]);
assert.equal(((await readFile(await all.path(), 'utf8')).match(/BEGIN:VEVENT/g) || []).length, 5, 'one event per thing');
const [bk] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup"]')]);
const backupPath = await bk.path();
const saved = JSON.parse(await readFile(backupPath, 'utf8'));
assert.equal(saved.app, 'every-so-often');
assert.equal(Object.keys(saved.items).length, 5);
await fits(page, 'settings');

// ---- sample data ----
await page.click('[data-act="sample"]');
await page.waitForURL(/#\/$/);
await page.locator('.banner').waitFor();
assert.ok(await page.locator('.tag').count() > 15, 'the sample household');
await page.click('.banner button');
await page.locator('.tag').first().waitFor();
assert.equal(await page.locator('.banner').count(), 0);
assert.equal(await page.locator('.tag').count(), 5, 'your own list is back');

// Survives a reload, and works offline once it has been opened.
await page.reload();
await tag(page, 'Change the furnace filter').waitFor();
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await phone.ctx.setOffline(true);
await page.reload();
assert.match(await text(page), /What’s due/i, 'loads offline');
await tag(page, 'Change the furnace filter').locator('.tag-body').click();
await page.locator('.tag.big').waitFor();
await phone.ctx.setOffline(false);

// A backup loads on another device.
{
  const other = await device({ serviceWorkers: 'block' });
  await other.page.goto(base + '#/settings');
  await other.page.setInputFiles('#loadBackup', backupPath);
  await until(async () => /Loaded 5 things/.test(await other.page.locator('#toast').innerText()), 'the backup to load');
  assert.equal((await names(other.page)).length, 5);
  await other.ctx.close();
}
await phone.ctx.close();

// ================= Google Drive, through the stand-in =================
const g = fakeGoogle();
const driveFile = () => g.files().find(f => f.appProperties?.everysooften === 'sync');
const driveDoc = () => JSON.parse(driveFile().body);
const liveInDrive = () => Object.values(driveDoc().items).filter(x => !(x.del && x.del >= Math.max(x.t, ...Object.values(x.log).map(e => e.t)))).map(x => x.name).sort();
const syncState = page => page.evaluate(() => JSON.parse(localStorage.getItem('every-so-often.sync') || '{}'));
const dot = page => page.getAttribute('#cloud', 'data-s');
async function syncNow(page) {
  const before = (await syncState(page)).last || 0;
  await page.click('#cloud');
  await until(async () => ((await syncState(page)).last || 0) > before && await dot(page) === 'ok', 'a sync');
}
async function turnOn(page) {
  await page.goto(base + '#/settings');
  await page.locator('#driveCard:not([hidden])').waitFor();
  await page.waitForFunction(() => !!window.google);
  await page.click('#driveCard [data-a="on"]');
  await until(async () => (await syncState(page)).last > 0 && await dot(page) === 'ok', 'the first sync');
}
const drive = (opts = {}) => device({ serviceWorkers: 'block', reducedMotion: 'reduce', ...opts }, { google: g });

// ---- turning it on ----
const laptop = await drive({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const L = laptop.page;
await L.goto(base);
await store(L, `
  const f = s.add({ key: 'furnace-filter', name: 'Change the furnace filter', area: 'House', rule: { kind: 'every', n: 90, unit: 'day' } });
  s.log(f, D.key(D.num(D.today()) - 40), 'MERV 8');
  s.add({ key: 'oil-change', name: 'Oil change', area: 'Car', rule: { kind: 'every', n: 6, unit: 'month' } });
  s.add({ key: 'gutters', name: 'Clean the gutters', area: 'House', rule: { kind: 'seasons', list: ['spring', 'fall'] } });`);
await turnOn(L);
assert.deepEqual(await L.evaluate(() => window.__prompts), [{ prompt: 'select_account' }], 'the first time, Google asks which account');
assert.equal(await L.evaluate(() => window.__cfg.scope), SCOPE, 'drive.file and nothing else');
const shared = await L.evaluate(() => JSON.parse(localStorage.getItem('junkdrawer.google')));
assert.equal(shared.token, 'tok-mark');
assert.ok(shared.scope.includes(SCOPE) && shared.exp > Date.now() + 50 * 60000);
assert.equal(shared.email, 'mark@gmail.com', 'the account is kept for next time');
assert.match(await L.locator('#driveCard').innerText(), /mark@gmail\.com/);
{
  const folders = g.files().filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  assert.equal(folders.length, 1);
  assert.equal(folders[0].name, 'Every So Often');
  assert.deepEqual(folders[0].appProperties, { everysooften: 'folder' });
  const file = driveFile();
  assert.equal(file.name, 'Every So Often.json');
  assert.deepEqual(file.parents, [folders[0].id], 'the file is in the folder');
  assert.equal(g.files().length, 2, 'nothing else in Drive');
  assert.deepEqual(liveInDrive(), ['Change the furnace filter', 'Clean the gutters', 'Oil change']);
  assert.ok(!file.body.includes('mark@gmail.com') && !file.body.includes('tok-'), 'no account details in the file');
  assert.ok(g.calls.every(c => !/[?&]q=[^&]*name/.test(c)), 'never searches by name');
}
await fits(L, 'settings with Drive');

// ---- a second device joining ----
const phone2 = await drive();
const P = phone2.page;
await P.goto(base);
await store(P, `
  const f = s.add({ key: 'furnace-filter', name: 'Change the furnace filter', area: 'House', rule: { kind: 'every', n: 90, unit: 'day' } });
  s.log(f, D.key(D.num(D.today()) - 130), '');
  s.add({ key: 'nails', name: 'Trim nails', area: 'Pets', rule: { kind: 'every', n: 4, unit: 'week' } });`);
await turnOn(P);
const everything = ['Change the furnace filter', 'Clean the gutters', 'Oil change', 'Trim nails'];
assert.deepEqual(await names(P), everything, 'the same starter job on both devices became one');
assert.equal(await store(P, 'return M.entries(s.things().find(x => x.name === "Change the furnace filter")).length'), 2, 'with both histories');
assert.deepEqual(liveInDrive(), everything);
await P.goto(base + '#/');
await tag(P, 'Oil change').waitFor();
assert.equal(await P.locator('.tag').count(), 4, 'the page shows what came from Drive');
await L.goto(base + '#/');
await syncNow(L);
assert.deepEqual(await names(L), everything);
await tag(L, 'Trim nails').waitFor();

// ---- both editing different things ----
await tag(L, 'Oil change').locator('[data-done]').click();
await P.goto(base + '#/');
await tag(P, 'Trim nails').locator('.tag-body').click();
await P.click('.note-card a');
await P.fill('textarea[name=remember]', 'Just the tips');
await P.click('#thingForm button[type=submit]');
await P.locator('.tag.big').waitFor();
// Each saves by itself shortly after the change.
await until(() => {
  const d = driveDoc();
  const oil = Object.values(d.items).find(x => x.name === 'Oil change'), nails = Object.values(d.items).find(x => x.name === 'Trim nails');
  return Object.values(oil.log).some(e => !e.del) && nails.remember === 'Just the tips';
}, 'both edits in Drive');
await syncNow(L);
await syncNow(P);
for (const pg of [L, P]) {
  assert.equal(await store(pg, 'return s.things().find(x => x.name === "Trim nails").remember'), 'Just the tips');
  assert.equal(await store(pg, 'return M.lastDone(s.things().find(x => x.name === "Oil change"))'), await store(pg, 'return D.today()'));
}

// ---- both editing the same thing ----
// The laptop logs the filter for last week and renames the gutters; the phone, later, logs the filter today
// and renames the gutters too. Both entries keep, and the later name wins.
await store(L, `const f = s.things().find(x => x.name === 'Change the furnace filter'); s.log(f.id, D.key(D.num(D.today()) - 7), 'Last week');
  const gu = s.things().find(x => x.name === 'Clean the gutters'); s.update(gu.id, { name: 'Clean the gutters and downspouts' });`);
await wait(20);
await store(P, `const f = s.things().find(x => x.name === 'Change the furnace filter'); s.log(f.id, D.today(), 'Today');
  const gu = s.things().find(x => x.name === 'Clean the gutters'); s.update(gu.id, { name: 'Gutters' });`);
// At the same time: one of them has to read, merge and try again. If both wrote at once, the one whose write
// was lost still has its changes and puts them back at its next sync.
await Promise.all([syncNow(L), syncNow(P)]);
await syncNow(L);
await syncNow(P);
await syncNow(L);
for (const pg of [L, P]) {
  assert.equal(await store(pg, 'return s.things().filter(x => /gutter/i.test(x.name)).map(x => x.name).join()'), 'Gutters');
  assert.deepEqual(await store(pg, 'return M.entries(s.things().find(x => x.name === "Change the furnace filter")).map(e => e.note || "").sort()'), ['', 'Last week', 'MERV 8', 'Today']);
}
assert.equal(await L.locator('.tag h3', { hasText: 'Gutters' }).count(), 1, 'the laptop’s page shows the new name');
{
  const f = Object.values(driveDoc().items).find(x => x.name === 'Change the furnace filter');
  assert.equal(Object.values(f.log).filter(e => !e.del).length, 4, 'Drive has all four entries');
}

// ---- a deletion ----
await P.goto(base + '#/');
await tag(P, 'Oil change').locator('.tag-body').click();
await P.click('[data-act="delete"]');
await P.waitForURL(/#\/$/);
await until(() => !liveInDrive().includes('Oil change'), 'the deletion to reach Drive');
assert.ok(Object.values(driveDoc().items).some(x => x.name === 'Oil change' && x.del), 'kept as deleted, so it can’t come back');
await syncNow(L);
assert.equal(await tag(L, 'Oil change').count(), 0, 'gone from the laptop too');
assert.deepEqual(await names(L), ['Change the furnace filter', 'Gutters', 'Trim nails']);

// ---- an expired sign-in needs a tap ----
await L.evaluate(() => localStorage.setItem('junkdrawer.google', JSON.stringify({ token: 'tok-expired', exp: Date.now() + 30 * 60000, scope: 'https://www.googleapis.com/auth/drive.file', email: 'mark@gmail.com' })));
await L.reload();
await until(async () => await dot(L) === 'tap', 'the red dot');
assert.equal(await L.evaluate(() => localStorage.getItem('junkdrawer.google')), null, 'a refused sign-in is cleared for every project');
const beforeTap = driveFile().version;
await store(L, `const n = s.things().find(x => x.name === 'Trim nails'); s.log(n.id, D.today(), 'While signed out');`);
await wait(1800);
assert.equal(driveFile().version, beforeTap, 'nothing reaches Drive while signed out');
assert.equal(await dot(L), 'tap');
await L.waitForFunction(() => !!window.google);
await L.click('#cloud');
await until(async () => await dot(L) === 'ok' && driveFile().version > beforeTap, 'signing back in to sync');
assert.deepEqual(await L.evaluate(() => window.__prompts.at(-1)), { prompt: '', login_hint: 'mark@gmail.com' }, 'straight back in, no account chooser');
assert.ok(Object.values(Object.values(driveDoc().items).find(x => x.name === 'Trim nails').log).some(e => e.note === 'While signed out'));

// ---- a sign-in reused from another junkdrawer.works project ----
const tablet = await drive({ viewport: { width: 800, height: 1100 }, deviceScaleFactor: 1 });
const T = tablet.page;
await T.goto(base);
await T.evaluate(() => localStorage.setItem('junkdrawer.google', JSON.stringify({ token: 'tok-mark', exp: Date.now() + 40 * 60000, scope: 'https://www.googleapis.com/auth/drive.file', email: 'mark@gmail.com' })));
const aboutCalls = g.calls.filter(c => c.includes('/about')).length;
await turnOn(T);
assert.equal(await T.evaluate(() => window.__prompts), undefined, 'no Google window at all');
assert.equal(g.calls.filter(c => c.includes('/about')).length, aboutCalls, 'the account came with the sign-in');
assert.deepEqual(await names(T), await names(L));
await T.goto(base + '#/');
await fits(T, 'a tablet');

// ---- stopping ----
await P.goto(base + '#/settings');
await P.locator('#driveCard [data-a="off"]').waitFor();
await P.click('#driveCard [data-a="off"]');
await P.click('#driveCard [data-a="off"]');
await P.locator('#driveCard [data-a="on"]').waitFor();
assert.equal(await P.locator('#cloud').isHidden(), true);
assert.ok(await P.evaluate(() => localStorage.getItem('junkdrawer.google')), 'the shared sign-in stays for the other projects');
assert.equal(await P.evaluate(() => window.__revoked), undefined, 'nothing revoked');
const kept = await names(P);
assert.ok(kept.length >= 3, 'the list stays on the device');
const callsBefore = g.calls.length, versionBefore = driveFile().version;
await store(P, `s.add({ name: 'Only on this phone now', area: 'House', rule: { kind: 'every', n: 1, unit: 'year' } });`);
await wait(2000);
assert.equal(g.calls.length, callsBefore, 'no more Drive calls from it');
assert.equal(driveFile().version, versionBefore);
assert.equal(g.files().length, 2, 'still one folder and one file');

// And the page never talked to Google away from junkdrawer.works (checked above, for the first phone).
for (const c of [laptop, phone2, tablet]) await c.ctx.close();

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
