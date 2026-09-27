// Renders the README screenshots (docs/*.png) and the link preview (og.png):  node tools/screenshots.mjs
// The clock is fixed and the list is the sample household, so the same pictures come out every time.
// Needs Playwright, and upng-js from `npm install`.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const UPNG = require('upng-js');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
});
await new Promise(ok => server.listen(+process.env.PORT || 8114, ok));
const base = `http://localhost:${server.address().port}/`;
const NOW = new Date('2026-09-27T10:00:00');
const browser = await pw.chromium.launch();
await mkdir(join(root, 'docs'), { recursive: true });

// A 256-colour palette keeps the PNGs small.
async function save(shot, path) {
  const img = UPNG.decode(shot);
  await writeFile(join(root, path), Buffer.from(UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 256)));
}

// Opens the app with the sample household as the list (so there's no sample banner).
async function open(viewport, deviceScaleFactor, colorScheme = 'light') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme, timezoneId: 'America/Chicago' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(base);
  await page.evaluate(() => {
    const { M, D, sampleDoc } = window.everySoOften;
    localStorage.setItem('every-so-often', M.canon(sampleDoc(D.today())));
  });
  await page.reload();
  await page.waitForSelector('.tag');
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const idOf = (page, name) => page.evaluate(n => window.everySoOften.store.things().find(x => x.name === n).id, name);

// Phone screenshots for the README.
{
  const page = await open({ width: 390, height: 844 }, 2);
  await save(await page.screenshot(), 'docs/phone-due.png');

  await page.goto(base + '#/thing/' + await idOf(page, 'Change the furnace filter'));
  await page.waitForSelector('.tag.big');
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.back').getBoundingClientRect().top + scrollY - 70));
  await save(await page.screenshot(), 'docs/phone-thing.png');

  // The starter list as someone starting out sees it.
  await page.evaluate(() => localStorage.removeItem('every-so-often'));
  await page.goto(base + '#/start');
  await page.reload();
  await page.waitForSelector('.pick');
  for (const k of ['furnace-filter', 'alarm-batteries', 'dryer-vent', 'gutters']) await page.click(`.pick[data-key="${k}"]`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await save(await page.screenshot(), 'docs/phone-start.png');
  await page.context().close();
}

// The same list on a laptop, in the dark.
{
  const page = await open({ width: 1280, height: 800 }, 1, 'dark');
  await save(await page.screenshot(), 'docs/desktop-dark.png');
  await page.context().close();
}

// Link preview, 1200 x 630: the name and one line on the left, real tags from the app on the right.
{
  const page = await open({ width: 1200, height: 630 }, 1);
  await page.evaluate(async () => {
    const pick = name => [...document.querySelectorAll('article.tag')].find(t => t.querySelector('h3').textContent === name).outerHTML;
    const tags = [pick('Change the furnace filter'), pick('Clean the gutters'), pick('Biscuit’s flea and tick pill'), pick('Rotate the tires')];
    document.body.innerHTML = `<div class="ogcard">
      <div class="ogtext">
        <img src="icon.svg" alt="" width="84" height="84">
        <h1>Every So Often</h1>
        <p>The jobs you do every few months, and when they’re next due.</p>
        <ul><li>One tap logs it done</li><li>A starter list of typical intervals</li><li>Syncs through your own Google Drive</li></ul>
      </div>
      <div class="ogtags">
        <div class="tags">${tags[0]}${tags[1]}</div>
        <div class="tags compact">${tags[2]}${tags[3]}</div>
      </div>
    </div>`;
    const style = document.createElement('style');
    style.textContent = `
      body { width: 1200px; height: 630px; overflow: hidden; }
      .ogcard { display: grid; grid-template-columns: 490px 1fr; align-items: center; gap: 40px; height: 630px; padding: 0 44px 0 60px; }
      .ogtext img { display: block; border-radius: 18px; }
      .ogtext h1 { font-weight: 800; font-stretch: 75%; font-size: 94px; line-height: .95; letter-spacing: .01em; text-transform: uppercase; margin: 22px 0 16px; }
      .ogtext p { font-size: 29px; line-height: 1.28; font-weight: 500; color: var(--ink-2); margin: 0 0 24px; }
      .ogtext ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
      .ogtext li { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 650; color: var(--muted); }
      .ogtext li::before { content: ''; width: 12px; height: 12px; border-radius: 50%; background: var(--bg); box-shadow: 0 0 0 4px var(--ring), inset 0 1px 2px rgba(0,0,0,.35); margin: 0 4px; }
      .ogtags { display: grid; gap: 11px; transform: rotate(-1.5deg) scale(.93); }
      .ogtags .tags, .ogtags .tags.compact { grid-template-columns: 1fr; gap: 11px; margin: 0; }
      .ogtags .tag-actions .btn.quiet { display: none; }
      .ogtags .remember { display: none; }`;
    document.head.append(style);
    await document.fonts.ready;
  });
  await page.waitForTimeout(150);
  await save(await page.screenshot(), 'og.png');
  await page.context().close();
}

await browser.close();
server.close();
console.log('screenshots written');
