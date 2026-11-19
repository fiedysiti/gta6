// Quick FPS probe: loads the plain game, starts it, counts rAF for N seconds.
import { chromium } from '/home/hatch/workspace/tools/browser/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const server = spawn('node', ['serve.ts', '--port', '8092'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:8092/', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__nbGame?.state.screen === 'play', { timeout: 15000 });
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n += 1; if (performance.now() - t0 < 5000) requestAnimationFrame(tick); else res((n / 5).toFixed(1)); };
  requestAnimationFrame(tick);
}));
const t = await page.evaluate(() => +window.__nbGame.state.time.toFixed(1));
console.log(`fps=${fps} gameTimeAfter5s=${t}`);
await browser.close(); server.kill();
