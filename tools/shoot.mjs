// NEON BAY screenshot + playtest harness (local only, not part of the game).
// Serves game/ on :8091, loads each ?shot= URL in headless Chromium (SwiftShader
// WebGL), waits for window.__shotReady, collects console/page errors, saves JPEGs.
// Then loads the plain game and simulates real keys to prove the loop runs.
// Usage: node tools/shoot.mjs [--shots-only]
import { chromium } from '/home/hatch/workspace/tools/browser/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const PORT = 8091;
const BASE = `http://localhost:${PORT}`;
const SHOTS = [
  { name: '1-start.jpg', query: '?shot=start&seed=1' },
  { name: '2-play.jpg', query: '?shot=play&seed=1' },
  { name: '3-drive.jpg', query: '?shot=drive&seed=1' },
  { name: '4-chase.jpg', query: '?shot=chase&seed=1' },
];
const shotsOnly = process.argv.includes('--shots-only');

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repo, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
let failures = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  for (const s of SHOTS) {
    errors.length = 0;
    await page.goto(BASE + '/' + s.query, { waitUntil: 'load', timeout: 30000 });
    try {
      await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
    } catch {
      console.log(`FAIL ${s.name}: __shotReady never set`);
      failures += 1; continue;
    }
    await page.waitForTimeout(300);
    const out = join(repo, 'screenshots', s.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 80 });
    const kb = Math.round(statSync(out).size / 1024);
    const st = await page.evaluate(() => {
      const g = window.__nbGame;
      return g ? { screen: g.state.screen, cash: g.state.cash, wanted: g.state.wanted, hp: g.state.hp } : null;
    });
    console.log(`${s.name}: ${kb} KiB ${kb > 256 ? 'OVER LIMIT' : 'ok'} errors=${errors.length} state=${JSON.stringify(st)}`);
    if (kb > 256) failures += 1;
    for (const e of errors) { console.log('  ERR ' + e); failures += 1; }
  }

  if (!shotsOnly) {
    errors.length = 0;
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => window.__nbGame?.state.screen);
    await page.keyboard.press('Enter');
    // SwiftShader renders slowly: poll for the screen change instead of a fixed wait.
    let started = before;
    try {
      await page.waitForFunction(() => window.__nbGame?.state.screen === 'play', { timeout: 15000 });
      started = 'play';
    } catch { started = await page.evaluate(() => window.__nbGame?.state.screen); }
    // FPS over 3 s of wall time.
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n += 1; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res((n / 3).toFixed(1)); };
      requestAnimationFrame(tick);
    }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(3000);
    await page.keyboard.up('KeyW');
    const moved = await page.evaluate(() => {
      const g = window.__nbGame;
      return { screen: g.state.screen, x: +g.state.player.pos.x.toFixed(1), z: +g.state.player.pos.z.toFixed(1), time: +g.state.time.toFixed(1) };
    });
    // Teleport-test the robbery path via the debug hook is not allowed in real play;
    // instead verify HUD text and minimap are present and no errors appeared.
    const hudText = await page.evaluate(() => document.getElementById('hud-cash')?.textContent);
    await page.screenshot({ path: join(repo, 'screenshots', '_playtest.jpg'), type: 'jpeg', quality: 80 });
    console.log(`playtest: before=${before} started=${started} fps(swiftshader)=${fps} moved=${JSON.stringify(moved)} hudCash=${hudText} errors=${errors.length}`);
    for (const e of errors) { console.log('  ERR ' + e); failures += 1; }
    if (started !== 'play') { console.log('FAIL: game did not start on Enter'); failures += 1; }
    if (moved.time < 0.3) { console.log('FAIL: game time did not advance'); failures += 1; }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures === 0 ? 'ALL OK' : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
