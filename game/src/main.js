// NEON BAY — open-world crime game. Rex Marlowe, wheelman new to Neon Bay.
// Rob the three targets, grab cash bags, dodge the NBPD, reach $5,000.
// All names, characters, places and art are original work for the make.fun competition.
import { THREE } from './three-shim.js';
import { BEST_KEY, CAR_CFG, GOAL_CASH, PICKUP_VALUE, PLAYER_CFG, ROBBERY, STEP, WANTED } from './config.js';
import { createRandom, pick, range } from './random.js';
import { createInput } from './input.js';
import { createSound } from './sound.js';
import { buildCity, resolveCollisions } from './city.js';
import { createPlayerMesh, createPedMesh, updateOnFoot } from './player.js';
import { driveCar, makeCar, nearestCar, spawnTraffic, updateTraffic } from './cars.js';
import { desiredPoliceCount, spawnPolice, updatePolice } from './police.js';
import { createMissions, nearestMission, updateMissions } from './missions.js';
import { createHud } from './hud.js';
import { drawMinimap } from './minimap.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false; // SwiftShader software raster: shadows cost ~10x fps; dusk look carries without them
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('gl').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const rng = createRandom(seed);
const city = buildCity(scene, rng);
const hud = createHud();
const sound = createSound();
const minimapCanvas = document.getElementById('minimap');

const state = {
  rng, city, screen: 'title', time: 0, cash: 0, hp: PLAYER_CFG.hp,
  wanted: 0, wantedTimer: 0, robberies: 0, pickups: 0, crimes: 0,
  camYaw: Math.PI, camYawOffset: 0, nearMission: null,
  player: {
    pos: { x: 0, z: 148 }, heading: Math.PI, walkPhase: 0,
    mesh: createPlayerMesh(), onFoot: true, car: null,
    punchTimer: 0, bustProgress: 0,
  },
  traffic: [], parked: [], police: [], peds: [],
  missions: null, best: 0, ramCooldown: 0,
};
scene.add(state.player.mesh);

function readBest() {
  try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; } catch { return 0; }
}
function saveBest(v) {
  try { window.localStorage.setItem(BEST_KEY, String(v)); } catch { /* private mode */ }
}
state.best = readBest();

function spawnPeds() {
  for (let i = 0; i < 12; i++) {
    const mesh = createPedMesh(rng);
    scene.add(mesh);
    const pos = { x: range(rng, -150, 150), z: range(rng, -150, 150) };
    state.peds.push({ pos, heading: range(rng, 0, Math.PI * 2), mesh, speed: 0, target: null, fallen: 0, flee: false });
  }
}
function spawnParked() {
  const spots = [
    { x: -23, z: 40, h: 0 }, { x: 29, z: -90, h: Math.PI }, { x: -75, z: 100, h: 0 }, { x: 81, z: 10, h: Math.PI / 2 },
  ];
  for (const s of spots) {
    const car = makeCar(s.x, s.z, s.h, pick(rng, [0xd94f4f, 0x4f7ad9, 0xe0c040, 0x40c060, 0xd9d9e0]));
    scene.add(car.mesh); car.mesh.position.set(s.x, 0, s.z); car.mesh.rotation.y = s.h;
    state.parked.push(car);
  }
}

function resetWorld() {
  // Clear dynamic entities from the scene, then rebuild them fresh.
  for (const c of [...state.traffic, ...state.parked, ...state.police]) scene.remove(c.mesh);
  for (const p of state.peds) scene.remove(p.mesh);
  if (state.missions) {
    for (const m of state.missions.missions) { scene.remove(m.sprite); scene.remove(m.ring); }
    for (const b of state.missions.pickups) scene.remove(b.mesh);
  }
  state.traffic = []; state.parked = []; state.police = []; state.peds = [];
  state.time = 0; state.cash = 0; state.hp = PLAYER_CFG.hp;
  state.wanted = 0; state.wantedTimer = 0; state.robberies = 0; state.pickups = 0; state.crimes = 0;
  state.camYaw = Math.PI; state.camYawOffset = 0;
  state.player.pos = { x: 0, z: 148 }; state.player.heading = Math.PI;
  state.player.onFoot = true; state.player.car = null;
  state.player.punchTimer = 0; state.player.bustProgress = 0; state.player.walkPhase = 0;
  state.missions = createMissions(scene, rng, state.city.colliders);
  state.traffic = spawnTraffic(scene, rng);
  spawnParked();
  spawnPeds();
  state.player.mesh.visible = true;
}

function addWanted(n, what) {
  state.wanted = Math.min(WANTED.maxStars, state.wanted + n);
  state.wantedTimer = WANTED.decaySeconds;
  state.crimes += 1;
  hud.toast(`+${n} ★ wanted — ${what}`);
  sound.punch();
}

function enterCar(car, carjacked) {
  const idxT = state.traffic.indexOf(car);
  if (idxT >= 0) state.traffic.splice(idxT, 1);
  const idxP = state.parked.indexOf(car);
  if (idxP >= 0) state.parked.splice(idxP, 1);
  car.player = true; car.traffic = false;
  state.player.car = car; state.player.onFoot = false;
  state.player.mesh.visible = false;
  if (carjacked) { addWanted(WANTED.carjack, 'carjacked!'); hud.toast('Carjacked! The driver fled.'); }
  else hud.toast('You are driving. W/S accelerate, A/D steer.');
  sound.unlock();
}
function exitCar() {
  const car = state.player.car;
  if (!car) return;
  car.speed = 0; car.player = false;
  state.parked.push(car);
  state.player.car = null; state.player.onFoot = true;
  state.player.mesh.visible = true;
  const h = car.heading;
  state.player.pos = { x: car.pos.x + Math.cos(h) * 2.2, z: car.pos.z - Math.sin(h) * 2.2 };
  state.player.heading = h;
}

function bustPlayer() {
  const lost = Math.floor(state.cash / 2);
  state.cash -= lost;
  state.screen = 'busted';
  exitCarIfAny();
  for (const c of state.police) scene.remove(c.mesh);
  state.police = [];
  state.wanted = 0; state.wantedTimer = 0; state.hp = PLAYER_CFG.hp;
  state.player.pos = { x: 0, z: 148 }; state.player.heading = Math.PI;
  state.player.bustProgress = 0;
  sound.busted();
  hud.show('busted', { lines: [
    `The NBPD caught Rex. They took $${lost.toLocaleString('en-US')} of your cash.`,
    `Cash now: $${state.cash.toLocaleString('en-US')} — robberies: ${state.robberies}, time: ${Math.floor(state.time)}s`,
  ] });
}
function exitCarIfAny() {
  if (!state.player.onFoot && state.player.car) {
    const car = state.player.car; car.speed = 0; car.player = false; state.parked.push(car);
    state.player.car = null; state.player.onFoot = true; state.player.mesh.visible = true;
  }
}
function wastePlayer() {
  state.screen = 'wasted';
  exitCarIfAny();
  for (const c of state.police) scene.remove(c.mesh);
  state.police = [];
  state.wanted = 0; state.wantedTimer = 0; state.hp = PLAYER_CFG.hp;
  state.player.pos = { x: 0, z: 148 }; state.player.heading = Math.PI;
  sound.busted();
  hud.show('wasted', { lines: [
    `Rex is down. Cash kept: $${state.cash.toLocaleString('en-US')}.`,
    `Robberies: ${state.robberies} — reach $${GOAL_CASH.toLocaleString('en-US')} to win.`,
  ] });
}
function winGame() {
  state.screen = 'win';
  if (state.cash > state.best) { state.best = state.cash; saveBest(state.best); }
  sound.win();
  hud.show('win', { lines: [
    `Rex cleared $${state.cash.toLocaleString('en-US')} in Neon Bay.`,
    `Robberies: ${state.robberies}  •  Cash bags: ${state.pickups}  •  Crimes: ${state.crimes}  •  Time: ${Math.floor(state.time)}s`,
    `Best cash: $${state.best.toLocaleString('en-US')}`,
  ] });
}

function updatePeds(dt) {
  const p = state.player;
  const px = p.onFoot ? p.pos.x : p.car.pos.x;
  const pz = p.onFoot ? p.pos.z : p.car.pos.z;
  for (const ped of state.peds) {
    if (ped.fallen > 0) {
      ped.fallen -= dt;
      ped.mesh.rotation.x = -Math.PI / 2;
      if (ped.fallen <= 0) { ped.mesh.rotation.x = 0; ped.flee = true; }
      continue;
    }
    let nearCar = false;
    for (const c of state.traffic) if (Math.hypot(c.pos.x - ped.pos.x, c.pos.z - ped.pos.z) < 7) { nearCar = true; break; }
    const pd = Math.hypot(px - ped.pos.x, pz - ped.pos.z);
    ped.flee = state.wanted > 0 && pd < 25 || nearCar;
    let tx, tz, speed;
    if (ped.flee) {
      const dx = ped.pos.x - px, dz = ped.pos.z - pz;
      const len = Math.hypot(dx, dz) || 1;
      tx = ped.pos.x + (dx / len) * 10; tz = ped.pos.z + (dz / len) * 10; speed = 4.2;
    } else {
      if (!ped.target || Math.hypot(ped.target.x - ped.pos.x, ped.target.z - ped.pos.z) < 2) {
        ped.target = { x: Math.max(-155, Math.min(155, ped.pos.x + range(rng, -40, 40))), z: Math.max(-155, Math.min(155, ped.pos.z + range(rng, -40, 40))) };
        // Never pick a target inside a building: nudge it out to the sidewalk.
        resolveCollisions(ped.target, 1, state.city.colliders);
      }
      tx = ped.target.x; tz = ped.target.z; speed = 1.3;
    }
    const dx = tx - ped.pos.x, dz = tz - ped.pos.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.05) {
      ped.heading = Math.atan2(dx, dz);
      ped.pos.x += (dx / len) * speed * dt; ped.pos.z += (dz / len) * speed * dt;
      ped.speed = speed;
    }
    // Peds walk on sidewalks, not through buildings.
    resolveCollisions(ped.pos, 0.6, state.city.colliders);
    ped.mesh.position.set(ped.pos.x, 0, ped.pos.z);
    ped.mesh.rotation.y = ped.heading;
    const u = ped.mesh.userData;
    const swing = Math.sin(state.time * 8 + ped.pos.x) * 0.4 * (ped.speed > 0.1 ? 1 : 0);
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
  }
}

function updatePoliceSpawns() {
  const want = desiredPoliceCount(state.wanted);
  while (state.police.length < want) {
    const p = state.player;
    const px = p.onFoot ? p.pos.x : p.car.pos.x;
    const pz = p.onFoot ? p.pos.z : p.car.pos.z;
    const angle = range(rng, 0, Math.PI * 2);
    const x = Math.max(-160, Math.min(160, px + Math.sin(angle) * 60));
    const z = Math.max(-160, Math.min(160, pz + Math.cos(angle) * 60));
    state.police.push(spawnPolice(scene, x, z, Math.atan2(px - x, pz - z)));
  }
  while (state.police.length > want) {
    const c = state.police.pop(); scene.remove(c.mesh);
  }
}

// One fixed simulation step. `inp` = {axis:{x,y}, sprint, holdingE, pressed:Set}.
function update(dt, inp) {
  state.time += dt;
  const p = state.player;
  if (p.punchTimer > 0) p.punchTimer -= dt;
  state.ramCooldown -= dt;

  // --- Wanted decay ---
  if (state.wanted > 0) {
    state.wantedTimer -= dt;
    if (state.wantedTimer <= 0) {
      state.wanted -= 1;
      state.wantedTimer = state.wanted > 0 ? WANTED.decaySeconds : 0;
      if (state.wanted === 0) hud.toast('You lost the heat. Wanted clear.');
    }
  }
  updatePoliceSpawns();

  // --- Movement ---
  if (p.onFoot) {
    updateOnFoot(state, inp.axis, inp.sprint, dt);
  } else {
    driveCar(p.car, inp.axis, dt, state.city.colliders, (impact) => {
      state.hp -= Math.max(0, (impact - 8)) * 0.9;
      sound.crash();
      hud.toast('Crash!');
    });
  }
  updateTraffic(state.traffic, dt, rng);
  updatePeds(dt);

  // --- Police chase ---
  if (state.police.length > 0) {
    const { ram } = updatePolice(state, dt);
    if (ram > 0 && state.ramCooldown <= 0) {
      state.hp -= 5; state.ramCooldown = 0.6; sound.crash(); hud.toast('NBPD rammed you!');
    }
    if (p.bustProgress >= 1) { bustPlayer(); return; }
  } else p.bustProgress = 0;

  // --- Missions / pickups ---
  state.nearMission = nearestMission(state);
  const ev = updateMissions(state, inp.holdingE, dt);
  if (ev.robbed) {
    const amount = Math.floor(range(rng, ev.robbed.amount[0], ev.robbed.amount[1]));
    state.cash += amount; state.robberies += 1;
    addWanted(WANTED.robbery, `robbed ${ev.robbed.name}!`);
    hud.toast(`Robbed ${ev.robbed.name}: +$${amount.toLocaleString('en-US')}`);
    sound.robbery();
  }
  if (ev.picked > 0) {
    state.cash += ev.picked * PICKUP_VALUE; state.pickups += ev.picked;
    hud.toast(`Cash bag: +$${(ev.picked * PICKUP_VALUE).toLocaleString('en-US')}`);
    sound.pickup();
  }

  // --- E: enter/exit car (edge) ---
  if (inp.pressed.has('KeyE')) {
    if (!p.onFoot) exitCar();
    else if (!(state.nearMission && state.nearMission.dist < ROBBERY.radius)) {
      const car = nearestCar([...state.parked, ...state.traffic], p.pos.x, p.pos.z, 4);
      if (car) enterCar(car, state.traffic.includes(car));
    }
  }
  // --- F: punch ---
  if (inp.pressed.has('KeyF') && p.onFoot && p.punchTimer <= 0) {
    let best = null, bd = PLAYER_CFG.punchRange;
    for (const ped of state.peds) {
      if (ped.fallen > 0) continue;
      const d = Math.hypot(ped.pos.x - p.pos.x, ped.pos.z - p.pos.z);
      if (d < bd) { bd = d; best = ped; }
    }
    if (best) {
      best.fallen = 3; p.punchTimer = PLAYER_CFG.punchCooldown;
      addWanted(WANTED.punch, 'assault!');
      hud.toast('You knocked a pedestrian down!');
    }
  }

  // --- HP / win ---
  if (state.hp <= 0) { wastePlayer(); return; }
  if (state.cash >= GOAL_CASH && state.screen === 'play') { winGame(); return; }

  // --- Camera + light follow ---
  const target = p.onFoot ? p : p.car;
  const heading = p.onFoot ? p.heading : p.car.heading;
  state.camYaw += (heading - state.camYaw) * Math.min(1, dt * 1.2);
  const yaw = state.camYaw + state.camYawOffset;
  const dist = p.onFoot ? 9 : 12.5;
  const height = p.onFoot ? 4.2 : 5.2;
  const tx = p.onFoot ? p.pos.x : p.car.pos.x;
  const tz = p.onFoot ? p.pos.z : p.car.pos.z;
  camera.position.set(
    tx - Math.sin(yaw) * dist, height,
    tz - Math.cos(yaw) * dist,
  );
  camera.lookAt(tx + Math.sin(yaw) * 4, 1.6, tz + Math.cos(yaw) * 4);
  city.sun.position.set(tx - 120, 90, tz - 160);
  city.sun.target.position.set(tx, 0, tz);
  city.sun.target.updateMatrixWorld();

  sound.update(dt, p.onFoot ? 0 : Math.abs(p.car.speed) / CAR_CFG.maxSpeed, state.wanted);
  hud.update(state);
  drawMinimap(minimapCanvas, state);
}

function render() { renderer.render(scene, camera); }

resetWorld();

const game = {
  state, scene, camera, renderer, resetWorld, update, render,
  enterCar, exitCar, spawnPolice, addWanted,
  setScreen(s) { state.screen = s; },
};

function runShot(name) {
  stageShot(name, game);
  hud.show(state.screen === 'title' ? 'title' : 'play', { best: state.best });
  hud.update(state);
  drawMinimap(minimapCanvas, state);
  let painted = 0;
  function paint() {
    render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput();
  let accumulator = 0;
  let last = performance.now();
  hud.show('title', { best: state.best });

  function frame(now) {
    requestAnimationFrame(frame);
    const dtMs = Math.min(now - last, 250);
    last = now;
    const pressed = input.takePressed();
    state.camYawOffset += input.takeDrag() * 0.004;

    if (pressed.has('KeyM')) hud.setMute(sound.toggleMute());
    if (pressed.has('Enter')) {
      sound.unlock();
      if (state.screen === 'title' || state.screen === 'busted' || state.screen === 'wasted' || state.screen === 'win') {
        resetWorld(); state.screen = 'play'; hud.show('play');
        hud.toast('Reach $5,000 — rob the $ targets, grab green cash bags.');
      }
    }
    if ((pressed.has('KeyP') || pressed.has('Escape'))) {
      if (state.screen === 'play') { state.screen = 'paused'; hud.show('paused'); }
      else if (state.screen === 'paused') { state.screen = 'play'; hud.show('play'); }
    }
    if (state.screen === 'title') {
      // Ambient backdrop: traffic + peds move, camera orbits downtown.
      updateTraffic(state.traffic, dtMs / 1000, rng);
      updatePeds(dtMs / 1000);
      const t = now / 1000;
      camera.position.set(Math.sin(t * 0.05) * 130, 55, Math.cos(t * 0.05) * 130);
      camera.lookAt(0, 8, 0);
      render();
      return;
    }
    if (state.screen !== 'play') { render(); return; }
    accumulator += dtMs / 1000;
    const inp = {
      axis: input.axis(), sprint: input.sprint(),
      holdingE: input.held('KeyE'), pressed,
    };
    let guard = 0;
    while (accumulator >= STEP && state.screen === 'play' && guard++ < 8) {
      update(STEP, inp);
      inp.pressed = new Set(); // edge keys fire once
      accumulator -= STEP;
    }
    if (guard >= 8) accumulator = 0;
    render();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'play') { state.screen = 'paused'; hud.show('paused'); }
  });
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// Debug/test hook (read-only state for the local screenshot harness).
window.__nbGame = game;
