// NEON BAY FPS probe: loads the plain game in headless Chromium, starts
// it with Enter, then counts requestAnimationFrame callbacks for five
// seconds and prints the rate. On this VM the renderer is SwiftShader
// (software WebGL), so the number is a floor, not a hardware result —
// a single render() is only a few milliseconds and the scene is light.
// Usage: node tools/fps.mjs
import { chromium } from '/home/hatch/workspace/tools/browser/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME_BIN = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const PORT = 8092;

const devServer = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repoRoot, stdio: 'ignore' });
await new Promise((done) => setTimeout(done, 1000));

const browser = await chromium.launch({
  executablePath: CHROME_BIN,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (err) => console.log('pageerror:', err.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__nbGame?.state.screen === 'play', { timeout: 15000 });

  // Count frames for exactly 5 s of wall time.
  const framesPerSecond = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const startedAt = performance.now();
    const count = () => {
      frames += 1;
      if (performance.now() - startedAt < 5000) requestAnimationFrame(count);
      else resolve((frames / 5).toFixed(1));
    };
    requestAnimationFrame(count);
  }));
  const gameTime = await page.evaluate(() => +window.__nbGame.state.time.toFixed(1));
  console.log(`fps=${framesPerSecond} gameTimeAfter5s=${gameTime}`);
} finally {
  await browser.close();
  devServer.kill();
}
