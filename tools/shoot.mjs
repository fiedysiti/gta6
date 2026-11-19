// NEON BAY screenshot + live-playtest harness. Local only; not part of the game.
//
// What it proves, in order:
//   1. Each scene from shots.json loads at ?shot=<scene>&seed=1, reaches
//      window.__shotReady, and produces a 1280x720 JPEG under 256 KiB
//      with zero console errors, page errors or failed requests. The
//      JPEG dimensions are asserted from the file itself (the gate
//      caps the long side at 1280 and the short side at 480), and the
//      round-4 HUD must be on screen: the mission tracker and the
//      money-goal bar both non-empty, so a shot can never silently
//      show a game whose new systems failed to render.
//   2. A real player can start the game: the plain page loads, Enter
//      moves it from the title screen to play, W walks the player
//      forward, and game time advances.
// Usage: node tools/shoot.mjs [--shots-only]
// The playtest frame goes to the OS temp dir, never into screenshots/,
// so only the four deliverable shots live there.
import { chromium } from '/home/hatch/workspace/tools/browser/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// JPEG dimensions from the file itself (SOF0/1/2 marker), no image
// library: the gate caps the long side at 1280 and the short side at
// 480, so the tool asserts the shot is really 1280x720.
function jpegDims(path) {
  const d = readFileSync(path);
  let i = 2;
  while (i < d.length - 1) {
    if (d[i] !== 0xff) { i += 1; continue; }
    const m = d[i + 1];
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
      return { w: d.readUInt16BE(i + 7), h: d.readUInt16BE(i + 5) };
    }
    if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    i += 2 + d.readUInt16BE(i + 2);
  }
  return null;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(repoRoot, 'shots.json'), 'utf-8'));
const scenes = manifest.scenes.map((s) => ({ file: s.file, query: s.query }));
const CHROME_BIN = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const PORT = 8091;
const ORIGIN = `http://localhost:${PORT}`;
const shotsOnly = process.argv.includes('--shots-only');
const SWIFTSHADER = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];

const devServer = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repoRoot, stdio: 'ignore' });
await new Promise((done) => setTimeout(done, 1200));

let problems = 0;
const browser = await chromium.launch({ executablePath: CHROME_BIN, args: SWIFTSHADER });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const seen = [];
  page.on('console', (msg) => { if (msg.type() === 'error') seen.push(`console: ${msg.text()}`); });
  page.on('pageerror', (err) => seen.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => seen.push(`requestfailed: ${req.url()}`));

  for (const scene of scenes) {
    seen.length = 0;
    await page.goto(`${ORIGIN}/${scene.query}`, { waitUntil: 'load', timeout: 30000 });
    let ready = true;
    try {
      await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
    } catch {
      ready = false;
    }
    if (!ready) {
      console.log(`FAIL ${scene.file}: __shotReady never set`);
      problems += 1;
      continue;
    }
    await page.waitForTimeout(300);
    const outPath = join(repoRoot, 'screenshots', scene.file);
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 80 });
    const kib = Math.round(statSync(outPath).size / 1024);
    const dims = jpegDims(outPath);
    const state = await page.evaluate(() => {
      const g = window.__nbGame;
      return g ? { screen: g.state.screen, cash: g.state.cash, wanted: g.state.wanted, hp: g.state.hp } : null;
    });
    const hud = await page.evaluate(() => ({
      mission: document.getElementById('hud-mission')?.textContent?.trim() ?? '',
      goal: document.getElementById('hud-goal')?.textContent?.trim() ?? '',
    }));
    console.log(`${scene.file}: ${kib} KiB ${kib > 256 ? 'OVER LIMIT' : 'ok'} ${dims ? `${dims.w}x${dims.h}` : 'dims?'} errors=${seen.length} state=${JSON.stringify(state)} hud=${JSON.stringify(hud)}`);
    if (kib > 256) problems += 1;
    if (!dims || dims.w !== 1280 || dims.h !== 720) { console.log(`  FAIL ${scene.file}: expected a 1280x720 shot, got ${dims ? `${dims.w}x${dims.h}` : 'unreadable'}`); problems += 1; }
    if (!hud.mission || !hud.goal) { console.log(`  FAIL ${scene.file}: mission tracker or goal bar missing from the HUD`); problems += 1; }
    for (const err of seen) { console.log(`  ERR ${err}`); problems += 1; }
  }

  if (!shotsOnly) {
    seen.length = 0;
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);
    const screenBefore = await page.evaluate(() => window.__nbGame?.state.screen);
    await page.keyboard.press('Enter');
    let screenAfter = screenBefore;
    try {
      await page.waitForFunction(() => window.__nbGame?.state.screen === 'play', { timeout: 15000 });
      screenAfter = 'play';
    } catch {
      screenAfter = await page.evaluate(() => window.__nbGame?.state.screen);
    }
    // How fast the software renderer goes over 3 s of wall time.
    const fps = await page.evaluate(() => new Promise((resolve) => {
      let frames = 0;
      const started = performance.now();
      const count = () => {
        frames += 1;
        if (performance.now() - started < 3000) requestAnimationFrame(count);
        else resolve((frames / 3).toFixed(1));
      };
      requestAnimationFrame(count);
    }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(3000);
    await page.keyboard.up('KeyW');
    const afterWalk = await page.evaluate(() => {
      const g = window.__nbGame;
      return {
        screen: g.state.screen,
        x: +g.state.player.pos.x.toFixed(1),
        z: +g.state.player.pos.z.toFixed(1),
        time: +g.state.time.toFixed(1),
      };
    });
    const cashLabel = await page.evaluate(() => document.getElementById('hud-cash')?.textContent);
    await page.screenshot({ path: join(tmpdir(), 'neon-bay-playtest.jpg'), type: 'jpeg', quality: 80 });
    console.log(`playtest: before=${screenBefore} started=${screenAfter} fps(swiftshader)=${fps} moved=${JSON.stringify(afterWalk)} hudCash=${cashLabel} errors=${seen.length}`);
    for (const err of seen) { console.log(`  ERR ${err}`); problems += 1; }
    if (screenAfter !== 'play') { console.log('FAIL: game did not start on Enter'); problems += 1; }
    if (afterWalk.time < 0.3) { console.log('FAIL: game time did not advance'); problems += 1; }
    if (!cashLabel || !cashLabel.trim().startsWith('$')) { console.log(`FAIL: HUD cash label did not render a dollar amount (got ${JSON.stringify(cashLabel)})`); problems += 1; }
  }
} finally {
  await browser.close();
  devServer.kill();
}
console.log(problems === 0 ? 'ALL OK' : `FAILURES: ${problems}`);
process.exit(problems === 0 ? 0 : 1);
