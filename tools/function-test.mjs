// NEON BAY functional test: drives the real game logic (game.update) from the
// page itself, in ?shot=play mode where no rAF loop interferes. No fake state —
// every check runs the same code paths a player triggers.
import { chromium } from '/home/hatch/workspace/tools/browser/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';

const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const server = spawn('node', ['serve.ts', '--port', '8095'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const results = [];
function check(name, ok, detail = '') { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); }

await page.goto('http://localhost:8095/?shot=play&seed=1', { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });

// Step helper injected once: runs N fixed steps with the given input.
await page.evaluate(() => {
  window.__step = (n, inp) => {
    const g = window.__nbGame;
    const base = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
    for (let i = 0; i < n; i++) g.update(1 / 60, { ...base, ...(inp || {}) });
    return { screen: g.state.screen, cash: g.state.cash, wanted: g.state.wanted, hp: g.state.hp, robberies: g.state.robberies, pickups: g.state.pickups, onFoot: g.state.player.onFoot, police: g.state.police.length };
  };
  window.__teleport = (x, z) => {
    const g = window.__nbGame;
    g.state.player.pos = { x, z };
    if (g.state.player.onFoot) g.state.player.mesh.position.set(x, 0, z);
  };
});

let s = await page.evaluate(() => window.__step(1));
check('staged play shot', s.screen === 'play' && s.cash === 1200, JSON.stringify(s));

// 1. Robbery: stand in the Casa Oro marker, hold E for 3.2 s.
await page.evaluate(() => window.__teleport(-85, -30));
s = await page.evaluate(() => window.__step(200, { holdingE: true }));
check('robbery pays + raises wanted', s.robberies === 1 && s.cash >= 1700 && s.wanted >= 2, JSON.stringify(s));

// 2. Police spawn while wanted.
s = await page.evaluate(() => window.__step(30));
check('police spawn when wanted', s.police > 0, `police=${s.police}`);

// 3. Carjack: teleport next to a traffic car, press E.
await page.evaluate(() => {
  const g = window.__nbGame;
  const c = g.state.traffic[0];
  window.__teleport(c.pos.x + 2, c.pos.z);
});
const wantedBefore = s.wanted;
s = await page.evaluate(() => window.__step(1, { pressed: new Set(['KeyE']) }));
check('carjack enters car + wanted', s.onFoot === false && s.wanted === wantedBefore + 1, JSON.stringify(s));

// 4. Drive forward 2 s, then exit with E.
s = await page.evaluate(() => window.__step(120, { axis: { x: 0, y: 1 } }));
const driving = await page.evaluate(() => Math.abs(window.__nbGame.state.player.car.speed) > 5);
check('car accelerates', driving, `speed=${(await page.evaluate(() => window.__nbGame.state.player.car.speed)).toFixed(1)}`);
s = await page.evaluate(() => window.__step(1, { pressed: new Set(['KeyE']) }));
check('exit car', s.onFoot === true, JSON.stringify(s));

// 5. Punch: teleport next to a pedestrian, press F.
await page.evaluate(() => {
  const g = window.__nbGame;
  const ped = g.state.peds.find((p) => p.fallen <= 0);
  window.__teleport(ped.pos.x + 1.5, ped.pos.z);
});
await page.evaluate(() => window.__step(1)); // let building push-out settle before the punch
s = await page.evaluate(() => window.__step(1, { pressed: new Set(['KeyF']) }));
const fallen = await page.evaluate(() => window.__nbGame.state.peds.some((p) => p.fallen > 0));
check('punch knocks ped down + wanted', fallen && s.wanted >= 4, JSON.stringify(s));

// 6. Cash-bag pickup: teleport onto an untaken bag.
await page.evaluate(() => {
  const g = window.__nbGame;
  const b = g.state.missions.pickups.find((p) => !p.taken);
  window.__teleport(b.x, b.z);
});
s = await page.evaluate(() => window.__step(2));
check('cash bag +$100', s.pickups === 1 && s.cash >= 1800, JSON.stringify(s));

// 7. Win: top cash up, rob the second target.
await page.evaluate(() => {
  const g = window.__nbGame;
  g.state.cash = 4900;
  g.state.wanted = 0; g.state.wantedTimer = 0; // clear the heat so the robbery isn't interrupted
  window.__teleport(33, -82);
});
s = await page.evaluate(() => window.__step(200, { holdingE: true }));
check('win at $5,000', s.screen === 'win' && s.cash >= 5000, JSON.stringify(s));

// 8. Busted: fresh page, wanted, police car on top of the player on foot.
await page.goto('http://localhost:8095/?shot=play&seed=1', { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__nbGame?.state.screen === 'play', { timeout: 30000 });
await page.evaluate(() => {
  const g = window.__nbGame;
  g.state.wanted = 3; g.state.wantedTimer = 20;
  // Let the spawn logic create the units, then put one on top of the player.
  for (let i = 0; i < 5; i++) g.update(1 / 60, { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() });
  const cop = g.state.police[0];
  if (cop) { cop.pos.x = g.state.player.pos.x; cop.pos.z = g.state.player.pos.z; cop.speed = 0; }
});
s = await page.evaluate(() => {
  const g = window.__nbGame;
  for (let i = 0; i < 300 && g.state.screen === 'play'; i++) g.update(1 / 60, { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() });
  return { screen: g.state.screen, cash: g.state.cash };
});
check('busted by police touch', s.screen === 'busted', JSON.stringify(s));

// 9. Wasted: HP to zero.
await page.goto('http://localhost:8095/?shot=play&seed=1', { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__nbGame?.state.screen === 'play', { timeout: 30000 });
s = await page.evaluate(() => {
  const g = window.__nbGame;
  g.state.hp = 0;
  g.update(1 / 60, { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() });
  return { screen: g.state.screen };
});
check('wasted at HP 0', s.screen === 'wasted', JSON.stringify(s));

console.log(`errors=${errors.length}` + (errors.length ? ' ' + errors.join(' | ') : ''));
const failed = results.filter((r) => !r.ok).length + errors.length;
console.log(failed === 0 ? 'FUNCTIONAL: ALL OK' : `FUNCTIONAL FAILURES: ${failed}`);
await browser.close(); server.kill();
process.exit(failed === 0 ? 0 : 1);
