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
  // Two helpers, re-injected on every fresh page (navigation wipes them):
  // advance the simulation N fixed steps with the given input, and move
  // the player (on foot) to a map position.
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
}

await freshPlayShot();

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

// 11. Mission chain — only job 1 is robbable at the start; later
// beacons are hidden and holding E in their rings does nothing.
await freshPlayShot();
let chain = await page.evaluate(() => {
  const g = window.__nbGame;
  const m = g.state.missions;
  return {
    idx: m.currentIndex,
    jewelVisible: m.targets.find((t) => t.id === 'jewelers').group.visible,
    bankVisible: m.targets.find((t) => t.id === 'bank').group.visible,
    martVisible: m.targets.find((t) => t.id === 'mart').group.visible,
  };
});
record('mission chain starts at job 1', chain.idx === 0 && chain.jewelVisible && !chain.bankVisible && !chain.martVisible, JSON.stringify(chain));
// Hold E in the bank ring for ~1.7 s: nothing happens.
await page.evaluate(() => window.__warp(33, -82));
snap = await page.evaluate(() => window.__advance(100, { holdingE: true }));
const bankProgress = await page.evaluate(() => window.__nbGame.state.missions.targets.find((t) => t.id === 'bank').progress);
record('later jobs locked', snap.robberies === 0 && bankProgress === 0, `robberies=${snap.robberies} bankProgress=${bankProgress}`);
// Rob the jewelers: payout + $150 mission bonus, job 2 unlocks.
await page.evaluate(() => window.__warp(-85, -30));
const cashBefore = await page.evaluate(() => window.__nbGame.state.cash);
snap = await page.evaluate(() => window.__advance(200, { holdingE: true }));
chain = await page.evaluate(() => {
  const m = window.__nbGame.state.missions;
  return { idx: m.currentIndex, done0: m.chain[0].done, bankVisible: m.targets.find((t) => t.id === 'bank').group.visible };
});
record('mission 1 pays + bonus, job 2 unlocks', snap.robberies === 1 && snap.cash >= cashBefore + 950 && chain.idx === 1 && chain.done0 && chain.bankVisible, JSON.stringify({ snap, chain }));

// 12. Helicopter — spawns at 3 stars, leaves when the heat drops.
await freshPlayShot();
let heli = await page.evaluate(() => {
  const g = window.__nbGame;
  g.state.wanted = 3;
  g.state.wantedTimer = 20;
  const idle = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
  for (let i = 0; i < 5; i++) g.update(1 / 60, idle);
  return { active: g.state.heli.active, visible: g.state.heli.group.visible, y: +g.state.heli.y.toFixed(1) };
});
record('heli spawns at 3 stars', heli.active && heli.visible && heli.y > 13 && heli.y < 17, JSON.stringify(heli));
heli = await page.evaluate(() => {
  const g = window.__nbGame;
  g.state.wanted = 0;
  g.state.wantedTimer = 0;
  const idle = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
  for (let i = 0; i < 5; i++) g.update(1 / 60, idle);
  return { active: g.state.heli.active, visible: g.state.heli.group.visible };
});
record('heli leaves when heat drops', !heli.active && !heli.visible, JSON.stringify(heli));

// 13. Traffic spacing — 10 s of driving, no two traffic cars ever overlap.
await freshPlayShot();
const spacing = await page.evaluate(() => {
  const g = window.__nbGame;
  const idle = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
  let minDist = Infinity;
  for (let i = 0; i < 600; i++) {
    g.update(1 / 60, idle);
    const t = g.state.traffic;
    for (let a = 0; a < t.length; a++) {
      for (let b = a + 1; b < t.length; b++) {
        const d = Math.hypot(t[a].pos.x - t[b].pos.x, t[a].pos.z - t[b].pos.z);
        if (d < minDist) minDist = d;
      }
    }
  }
  return +minDist.toFixed(2);
});
record('traffic never overlaps', spacing > 2.5, `minDist=${spacing}`);

// 14. Traffic brakes for the player standing in its lane — the car
// never gets closer than 8 m (it stops at the ~10.3 m bumper gap).
await freshPlayShot();
const avoid = await page.evaluate(() => {
  const g = window.__nbGame;
  const car = g.state.traffic.find((c) => c.axis === 'v') || g.state.traffic[0];
  const px = car.pos.x;
  const pz = car.pos.z + car.dir * 20;
  g.state.player.pos = { x: px, z: pz };
  g.state.player.mesh.position.set(px, 0, pz);
  const idle = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
  let minD = Infinity;
  for (let i = 0; i < 240; i++) {
    g.update(1 / 60, idle);
    const d = Math.hypot(car.pos.x - g.state.player.pos.x, car.pos.z - g.state.player.pos.z);
    if (d < minD) minD = d;
  }
  return +minD.toFixed(1);
});
record('traffic stops for the player', avoid > 8, `minDist=${avoid}`);

// 15. Pier — the player can walk the boardwalk to its end (no push-out).
await freshPlayShot();
const pier = await page.evaluate(() => {
  const g = window.__nbGame;
  // Walk south from the beach onto the pier. The staged play shot
  // leaves camYaw at PI/2 (camera east, looking west), so reset it
  // to 0 (camera south, looking north): backward (axis y -1) then
  // walks south (+z).
  g.state.camYaw = 0;
  g.state.player.pos = { x: 0, z: 150 };
  g.state.player.mesh.position.set(0, 0, 150);
  const south = { axis: { x: 0, y: -1 }, sprint: false, holdingE: false, pressed: new Set() };
  for (let i = 0; i < 600; i++) g.update(1 / 60, south);
  return { x: +g.state.player.pos.x.toFixed(1), z: +g.state.player.pos.z.toFixed(1) };
});
record('pier walkable to its end', pier.z > 190 && Math.abs(pier.x) < 2, JSON.stringify(pier));

// 16. HUD — goal bar shows $1,200 / $5,000 at the staged cash.
await freshPlayShot();
const goal = await page.evaluate(() => ({
  text: document.getElementById('hud-goal-text')?.textContent,
  fill: document.getElementById('hud-goal-fill')?.style.width,
  mission: document.getElementById('hud-mission')?.textContent,
}));
record('goal bar + mission tracker', goal.text === '$1,200 / $5,000' && goal.fill === '24%' && /MISSION 1\/3/.test(goal.mission || ''), JSON.stringify(goal));

// 17. Wheel zoom — a wheel event feeds wheelDY, endFrame clears it.
const wheel = await page.evaluate(() => {
  const g = window.__nbGame;
  const canvas = document.querySelector('canvas');
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
  const before = g.input.snapshot().wheelDY;
  g.input.endFrame();
  const after = g.input.snapshot().wheelDY;
  return { before, after };
});
record('wheel zoom feeds snapshot', wheel.before === -120 && wheel.after === 0, JSON.stringify(wheel));

// 18. Sound — music/skid/horn/footstep never throw headless; walking
// actually triggers footsteps (spied on sound.footstep, since main.js
// consumes the stepped flag inside update()).
const snd = await page.evaluate(() => {
  const g = window.__nbGame;
  const idle = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
  for (let i = 0; i < 100; i++) g.sound.music(true, 0.016);
  g.sound.music(false, 0.016);
  g.sound.skid(); g.sound.horn(); g.sound.footstep();
  let stepped = 0;
  const origFootstep = g.sound.footstep.bind(g.sound);
  g.sound.footstep = () => { stepped += 1; origFootstep(); };
  const fwd = { axis: { x: 0, y: 1 }, sprint: false, holdingE: false, pressed: new Set() };
  for (let i = 0; i < 120; i++) g.update(1 / 60, fwd);
  const idleBefore = stepped;
  for (let i = 0; i < 60; i++) g.update(1 / 60, idle);
  return { stepped, idleSteps: stepped - idleBefore };
});
record('sound safe headless + footsteps', snd.stepped > 0 && snd.idleSteps === 0, JSON.stringify(snd));

// 19. Toasts — the message text actually shows (regression: the
// textContent line was once lost in an edit and toasts came out empty).
const toastText = await page.evaluate(() => {
  const g = window.__nbGame;
  g.hud.toast('TEST TOAST 123');
  return document.getElementById('hud-toasts')?.textContent || '';
});
record('toast shows its text', toastText.includes('TEST TOAST 123'), JSON.stringify(toastText));

console.log(`errors=${pageProblems.length}` + (pageProblems.length ? ` ${pageProblems.join(' | ')}` : ''));
const failed = outcomes.filter((o) => !o.ok).length + pageProblems.length;
console.log(failed === 0 ? 'FUNCTIONAL: ALL OK' : `FUNCTIONAL FAILURES: ${failed}`);
await browser.close();
devServer.kill();
process.exit(failed === 0 ? 0 : 1);
