// Renders every exercise x good/bad x phases into one contact sheet.
// Builds a dev-only copy of main.js that exports its internals, so the
// shipped source stays clean.
import { createRequire } from 'module';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'main.js'), 'utf8');
const marker = '  window.plethoraBit = {';
if (!src.includes(marker)) throw new Error('marker not found');
const dev = src.replace(marker,
  '  window.__GT = { EX: EX, WEEK: WEEK, solve: solve, sampleTrack: sampleTrack,\n' +
  '    drawFigureInPanel: drawFigureInPanel, drawBackground: drawBackground, panelFrame: panelFrame,\n' +
  '    IDLE_EX: IDLE_EX, CHEER_EX: CHEER_EX, C: C };\n' + marker);
fs.writeFileSync(path.join(here, '_main.dev.js'), dev);

const phases = (process.argv[3] || '0,0.5,1').split(',').map(Number);
const only = process.argv[4] || null;

const page = await (await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }))
  .newPage({ viewport: { width: 1180, height: 1400 }, deviceScaleFactor: 1.5 });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

await page.goto('file://' + path.join(here, 'grid.html'));
await page.waitForFunction('window.__GT !== undefined', null, { timeout: 10000 });
await page.evaluate(([ph, o]) => window.__drawGrid(ph, o), [phases, only]);
await page.waitForTimeout(200);
const out = process.argv[2] || path.join(here, 'shots', 'posegrid.png');
await page.screenshot({ path: out, fullPage: true });
console.log('wrote', out);
process.exit(0);
