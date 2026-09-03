// Local visual QA: walks the new week UI and screenshots each screen.
// Not part of the uploaded Bit.
import { createRequire } from 'module';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, 'shots');
fs.mkdirSync(out, { recursive: true });
const url = 'file://' + path.join(here, 'harness.html') + (process.env.BUILT ? '?build' : '');

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

await page.goto(url);
await page.waitForFunction('window.__ready === true', null, { timeout: 15000 });
const err = await page.evaluate('window.__initError || null');
if (err) { console.log('INIT ERROR', err); await b.close(); process.exit(1); }

const pump = (ms) => page.evaluate((m) => window.__pump(m), ms);
const click = async (a, v) => {
  const ok = await page.evaluate(([x, y]) => window.__click(x, y), [a, v]);
  await page.waitForTimeout(60);
  return ok;
};
const shot = async (n) => {
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(out, n + '.png') });
  console.log('  shot', n);
};

await pump(400);
await shot('01-home');
await click('help'); await shot('02-help'); await click('closesheet');

// Monday is index 0 in the week strip
if (!await click('openday', '0')) console.log('FAIL: could not open Monday');
await shot('03-day-menu');

if (!await click('goex', '0')) console.log('FAIL: could not open exercise');
await pump(600);
await shot('04-exercise-setup');
await pump(6000);                       // into the setup reel
await shot('05-setup-mid');
await pump(6000);                       // over into the train reel
await shot('06-exercise-train');

// walk the whole day via Done
for (let i = 0; i < 7; i++) { await click('done'); await pump(500); }
await shot('07-day-complete');
await click('progress');
await shot('08-progress');

const log = await page.evaluate('window.__log');
console.log('platform events:', JSON.stringify(log));
await b.close();
process.exit(0);
