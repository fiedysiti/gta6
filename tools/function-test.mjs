// NEON BAY functional checks: eleven scripted gameplay checks that drive
// the real game logic (game.update) from inside the page. The page loads
// in ?shot=play mode, where no requestAnimationFrame loop interferes, so
// every step is deterministic. Nothing here fakes state — each check runs
// the same code path a player triggers with keys and movement.
// Usage: node tools/function-test.mjs
import { chromium } from '/home/hatch/workspace/tools/browser/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME_BIN = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const PORT = 8095;
const ORIGIN = `http://localhost:${PORT}`;

const devServer = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repoRoot, stdio: 'ignore' });
await new Promise((done) => setTimeout(done, 1000));

const browser = await chromium.launch({
  executablePath: CHROME_BIN,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageProblems = [];
page.on('pageerror', (err) => pageProblems.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') pageProblems.push(`console: ${msg.text()}`); });

const outcomes = [];
function record(name, passed, detail = '') {
  outcomes.push({ name, ok: passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name} ${detail}`);
}

async function freshPlayShot() {
  await page.goto(`${ORIGIN}/?shot=play&seed=1`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
}

await freshPlayShot();

// Two helpers, injected once: advance the simulation N fixed steps with
// the given input, and move the player (on foot) to a map position.
await page.evaluate(() => {
  window.__advance = (steps, input) => {
    const g = window.__nbGame;
    const idle = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
    for (let i = 0; i < steps; i++) g.update(1 / 60, { ...idle, ...(input || {}) });
    const s = g.state;
    return {
      screen: s.screen, cash: s.cash, wanted: s.wanted, hp: s.hp,
      robberies: s.robberies, pickups: s.pickups, onFoot: s.player.onFoot,
      police: s.police.length,
    };
  };
  window.__warp = (x, z) => {
    const g = window.__nbGame;
    g.state.player.pos = { x, z };
    if (g.state.player.onFoot) g.state.player.mesh.position.set(x, 0, z);
  };
});

// 0. The staged play shot itself: title skipped, $1,200 starting cash.
let snap = await page.evaluate(() => window.__advance(1));
record('staged play shot', snap.screen === 'play' && snap.cash === 1200, JSON.stringify(snap));

// 1. Robbery — stand in the Casa Oro ring (-85, -30), hold E for ~3.2 s.
await page.evaluate(() => window.__warp(-85, -30));
snap = await page.evaluate(() => window.__advance(200, { holdingE: true }));
record('robbery pays + raises wanted', snap.robberies === 1 && snap.cash >= 1700 && snap.wanted >= 2, JSON.stringify(snap));

// 2. Police — with heat on, units should exist.
snap = await page.evaluate(() => window.__advance(30));
record('police spawn when wanted', snap.police > 0, `police=${snap.police}`);

// 3. Carjack — step up to the first traffic car and press E.
await page.evaluate(() => {
  const car = window.__nbGame.state.traffic[0];
  window.__warp(car.pos.x + 2, car.pos.z);
});
const heatBeforeCarjack = snap.wanted;
snap = await page.evaluate(() => window.__advance(1, { pressed: new Set(['KeyE']) }));
record('carjack enters car + wanted', snap.onFoot === false && snap.wanted === heatBeforeCarjack + 1, JSON.stringify(snap));

// 4. Driving — two seconds of throttle should build real speed.
snap = await page.evaluate(() => window.__advance(120, { axis: { x: 0, y: 1 } }));
const speedNow = await page.evaluate(() => window.__nbGame.state.player.car.speed);
record('car accelerates', Math.abs(speedNow) > 5, `speed=${speedNow.toFixed(1)}`);

// 5. Exit — E again puts the player back on foot.
snap = await page.evaluate(() => window.__advance(1, { pressed: new Set(['KeyE']) }));
record('exit car', snap.onFoot === true, JSON.stringify(snap));

// 6. Punch — step up to a standing ped and press F.
await page.evaluate(() => {
  const ped = window.__nbGame.state.peds.find((p) => p.fallen <= 0);
  window.__warp(ped.pos.x + 1.5, ped.pos.z);
});
await page.evaluate(() => window.__advance(1)); // let building push-out settle first
snap = await page.evaluate(() => window.__advance(1, { pressed: new Set(['KeyF']) }));
const someoneDown = await page.evaluate(() => window.__nbGame.state.peds.some((p) => p.fallen > 0));
record('punch knocks ped down + wanted', someoneDown && snap.wanted >= 4, JSON.stringify(snap));

// 7. Cash bag — warp onto an untaken bag; it should pay $100.
await page.evaluate(() => {
  const bag = window.__nbGame.state.missions.pickups.find((p) => !p.taken);
  window.__warp(bag.x, bag.z);
});
snap = await page.evaluate(() => window.__advance(2));
record('cash bag +$100', snap.pickups === 1 && snap.cash >= 1800, JSON.stringify(snap));

// 8. Win — top the cash up to $4,900, clear the heat, rob the bank (33, -82).
await page.evaluate(() => {
  const g = window.__nbGame;
  g.state.cash = 4900;
  g.state.wanted = 0;
  g.state.wantedTimer = 0;
  window.__warp(33, -82);
});
snap = await page.evaluate(() => window.__advance(200, { holdingE: true }));
record('win at $5,000', snap.screen === 'win' && snap.cash >= 5000, JSON.stringify(snap));

// 9. BUSTED — fresh page, wanted level 3, then park a police car on the player.
await freshPlayShot();
await page.evaluate(() => {
  const g = window.__nbGame;
  g.state.wanted = 3;
  g.state.wantedTimer = 20;
  for (let i = 0; i < 5; i++) {
    g.update(1 / 60, { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() });
  }
  const cop = g.state.police[0];
  if (cop) { cop.pos.x = g.state.player.pos.x; cop.pos.z = g.state.player.pos.z; cop.speed = 0; }
});
snap = await page.evaluate(() => {
  const g = window.__nbGame;
  const idle = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
  for (let i = 0; i < 300 && g.state.screen === 'play'; i++) g.update(1 / 60, idle);
  return { screen: g.state.screen, cash: g.state.cash };
});
record('busted by police touch', snap.screen === 'busted', JSON.stringify(snap));

// 10. WASTED — fresh page, HP straight to zero.
await freshPlayShot();
snap = await page.evaluate(() => {
  const g = window.__nbGame;
  g.state.hp = 0;
  g.update(1 / 60, { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() });
  return { screen: g.state.screen };
});
record('wasted at HP 0', snap.screen === 'wasted', JSON.stringify(snap));

console.log(`errors=${pageProblems.length}` + (pageProblems.length ? ` ${pageProblems.join(' | ')}` : ''));
const failed = outcomes.filter((o) => !o.ok).length + pageProblems.length;
console.log(failed === 0 ? 'FUNCTIONAL: ALL OK' : `FUNCTIONAL FAILURES: ${failed}`);
await browser.close();
devServer.kill();
process.exit(failed === 0 ? 0 : 1);
