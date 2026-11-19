// Recovery note: the conductor — it wires the world together, steps the simulation, and decides when a run ends in a win, a bust, or worse.
// NEON BAY — game object: builds the world, runs the loop, owns the
// state machine (title / play / paused / busted / wasted / win) and the
// crime + wanted + bust/waste/win rules. The test harnesses drive this
// object directly (window.__nbGame), so its shape is a contract:
//   game.state  — screen, cash, wanted, wantedTimer, hp, robberies,
//                 pickups, crimes, time, player, traffic, parked,
//                 peds, police, missions, camYaw, camPitch, ...
//   game.update(dt, input?) — one fixed step; input defaults to live keys
//   game.render() — camera, renderer, HUD, minimap
//   game.start()  — (re)start a run from the beach

import { THREE } from './three-shim.js';
import { CFG, HEAT, clamp } from './config.js';
import { mulberry32 } from './random.js';
import { createInput } from './input.js';
import { createSound } from './sound.js';
import { buildCity } from './city.js';
import { createPlayer, updatePlayerOnFoot, createPedestrians, updatePedestrians } from './player.js';
import { createTraffic, createParked, updateTraffic, driveCar } from './cars.js';
import { maintainPolice, updatePolice } from './police.js';
import { createMissions, resetMissions, animateMissions, updateMissions } from './missions.js';
import { createHud } from './hud.js';
import { drawMinimap } from './minimap.js';

export function createGame(seed) {
  const rng = mulberry32(seed);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  document.body.appendChild(renderer.domElement);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const city = buildCity(scene, rng);
  const colliders = city.colliders;
  const player = createPlayer(scene);
  const traffic = createTraffic(scene, rng);
  const parked = createParked(scene, rng);
  const peds = createPedestrians(scene, rng, colliders);
  const missions = createMissions(scene, rng, colliders);
  const police = [];
  const sound = createSound();
  const hud = createHud();
  const input = createInput(renderer.domElement);

  let best = 0;
  try { best = Number(localStorage.getItem('neonbay-best') || 0) || 0; } catch { best = 0; }
  function saveBest() {
    if (state.cash > best) {
      best = state.cash;
      try { localStorage.setItem('neonbay-best', String(best)); } catch { /* private mode */ }
    }
  }

  const state = {
    screen: 'title',
    cash: 0,
    wanted: 0,
    wantedTimer: 0,
    hp: CFG.maxHp,
    robberies: 0,
    pickups: 0,
    crimes: 0,
    time: 0,
    best,
    bustedLost: 0,
    robTarget: null,
    nearCar: false,
    muted: false,
    camYaw: 0,
    camPitch: 0.38,
    orbit: 0.6,
    ramCooldown: 0,
    punchCooldown: 0,
    player, traffic, parked, peds, police, missions,
  };

  function clearPolice() { maintainPolice(police, scene, player.pos, 0, rng); }

  function parkPlayerCar() {
    if (player.car) {
      player.car.speed = 0;
      player.car.kind = 'parked';
      parked.push(player.car);
      player.car = null;
    }
  }

  function respawn() {
    parkPlayerCar();
    player.onFoot = true;
    player.pos.x = CFG.spawn.x;
    player.pos.z = CFG.spawn.z;
    player.angle = Math.PI;
    player.mesh.visible = true;
    player.mesh.position.set(player.pos.x, 0, player.pos.z);
    player.mesh.rotation.y = player.angle;
    state.camYaw = 0;
  }

  function doBusted() {
    state.bustedLost = Math.floor(state.cash / 2);
    state.cash -= state.bustedLost;
    state.wanted = 0;
    state.wantedTimer = 0;
    clearPolice();
    respawn();
    state.screen = 'busted';
    sound.busted();
    saveBest();
  }

  function doWasted() {
    state.screen = 'wasted';
    sound.wasted();
    saveBest();
  }

  function doWin() {
    state.screen = 'win';
    sound.win();
    saveBest();
  }

  function startGame() {
    respawn();
    state.cash = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.hp = CFG.maxHp;
    state.robberies = 0;
    state.pickups = 0;
    state.crimes = 0;
    state.time = 0;
    state.bustedLost = 0;
    state.robTarget = null;
    state.ramCooldown = 0;
    state.punchCooldown = 0;
    clearPolice();
    resetMissions(missions);
    state.camYaw = 0;
    state.camPitch = 0.38;
    state.screen = 'play';
    sound.unlock();
  }

  function toggleMute() {
    state.muted = !state.muted;
    sound.setMuted(state.muted);
  }
  hud.bindMute(toggleMute);

  function nearestCar(maxDist) {
    let bestCar = null, bestD = maxDist;
    for (const c of [...traffic, ...parked]) {
      const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
      if (d < bestD) { bestD = d; bestCar = c; }
    }
    return bestCar;
  }

  function enterCar(car) {
    const wasTraffic = traffic.includes(car);
    if (wasTraffic) {
      traffic.splice(traffic.indexOf(car), 1);
      state.wanted = Math.min(CFG.maxWanted, state.wanted + HEAT.carjack);
      state.wantedTimer = CFG.decaySeconds;
      state.crimes += 1;
      hud.toast('Carjacked! The NBPD is onto you. +1★');
    } else {
      parked.splice(parked.indexOf(car), 1);
      hud.toast('You took the parked car.');
    }
    car.kind = 'player';
    player.car = car;
    player.onFoot = false;
    player.mesh.visible = false;
    // The camera and minimap follow player.pos, so it rides with the car.
    player.pos.x = car.pos.x;
    player.pos.z = car.pos.z;
    player.angle = car.angle;
  }

  function exitCar() {
    const car = player.car;
    car.speed = 0;
    car.kind = 'parked';
    parked.push(car);
    player.car = null;
    player.onFoot = true;
    // Step out to the car's left so the player never lands inside it.
    player.pos.x = car.pos.x + Math.cos(car.angle) * 2.6;
    player.pos.z = car.pos.z - Math.sin(car.angle) * 2.6;
    player.mesh.visible = true;
    player.mesh.position.set(player.pos.x, 0, player.pos.z);
  }

  function update(dt, inputOverride) {
    const s = state;
    const input = inputOverride || input.snapshot();
    const pressed = input.pressed || new Set();
    if (pressed.has('KeyM')) toggleMute();

    if (s.screen === 'title') {
      s.orbit += dt * 0.05;
      updateTraffic(traffic, dt, rng);
      updatePedestrians(peds, dt, colliders, rng, null, 0);
      if (pressed.has('Enter')) startGame();
      return;
    }
    if (s.screen === 'paused') {
      if (pressed.has('KeyP') || pressed.has('Escape') || pressed.has('Enter')) s.screen = 'play';
      return;
    }
    if (s.screen === 'busted' || s.screen === 'wasted' || s.screen === 'win') {
      if (pressed.has('Enter')) startGame();
      return;
    }

    // --- play ---
    s.time += dt;
    s.camYaw -= (input.dragDX || 0) * 0.005;
    s.camPitch = clamp(s.camPitch + (input.dragDY || 0) * 0.002, 0.12, 0.9);
    if (pressed.has('KeyP') || pressed.has('Escape')) {
      s.screen = 'paused';
      return;
    }
    s.punchCooldown = Math.max(0, s.punchCooldown - dt);
    s.ramCooldown = Math.max(0, s.ramCooldown - dt);

    // Wanted decay: one star per quiet stretch.
    if (s.wanted > 0) {
      s.wantedTimer -= dt;
      if (s.wantedTimer <= 0) {
        s.wanted -= 1;
        s.wantedTimer = s.wanted > 0 ? CFG.decaySeconds : 0;
      }
    }

    s.nearCar = player.onFoot && nearestCar(CFG.carjackRange) !== null;
    if (pressed.has('KeyE')) {
      if (player.onFoot) {
        const car = nearestCar(CFG.carjackRange);
        if (car) enterCar(car);
      } else {
        exitCar();
      }
    }
    if (pressed.has('KeyF') && player.onFoot && s.punchCooldown <= 0) {
      let victim = null, victimD = CFG.punchRange;
      for (const p of peds) {
        if (p.fallen > 0) continue;
        const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
        if (d < victimD) { victimD = d; victim = p; }
      }
      if (victim) {
        victim.fallen = 5;
        s.punchCooldown = CFG.punchCooldown;
        s.wanted = Math.min(CFG.maxWanted, s.wanted + HEAT.punch);
        s.wantedTimer = CFG.decaySeconds;
        s.crimes += 1;
        sound.punch();
        hud.toast('You knocked a pedestrian down. +1★');
      }
    }

    if (player.onFoot) {
      updatePlayerOnFoot(player, input, dt, colliders, s.camYaw);
    } else {
      const res = driveCar(player.car, input, dt, colliders);
      player.pos.x = player.car.pos.x;
      player.pos.z = player.car.pos.z;
      player.angle = player.car.angle;
      if (res.crashed) {
        const dmg = Math.round(res.impact * 0.8);
        s.hp -= dmg;
        sound.thud();
        hud.toast(`Crash! -${dmg} HP`);
      }
    }

    updateTraffic(traffic, dt, rng);
    updatePedestrians(peds, dt, colliders, rng, player.pos, s.wanted);

    maintainPolice(police, scene, player.pos, s.wanted, rng);
    updatePolice(police, player, dt, colliders, {
      onBust: doBusted,
      onRam: (impact) => {
        if (s.ramCooldown > 0) return;
        s.ramCooldown = 1;
        const dmg = Math.min(12, Math.round(impact * 0.5));
        s.hp -= dmg;
        sound.thud();
        hud.toast(`NBPD rammed you! -${dmg} HP`);
      },
    });
    if (s.screen !== 'play') return; // busted mid-frame

    const { events, active } = updateMissions(missions, player, !!input.holdingE, dt, rng, s);
    s.robTarget = active;
    for (const ev of events) {
      if (ev.type === 'robbed') {
        s.cash += ev.payout;
        s.robberies += 1;
        s.crimes += 1;
        s.wanted = Math.min(CFG.maxWanted, s.wanted + HEAT.robbery);
        s.wantedTimer = CFG.decaySeconds;
        sound.chime();
        hud.toast(`${ev.target.name} robbed! +$${ev.payout.toLocaleString('en-US')}`);
      } else if (ev.type === 'bag') {
        s.cash += ev.payout;
        s.pickups += 1;
        sound.blip();
        hud.toast('Cash bag! +$100');
      }
    }
    animateMissions(missions, s.time);

    if (s.cash >= CFG.goalCash) { doWin(); return; }
    if (s.hp <= 0) { s.hp = 0; doWasted(); return; }

    sound.engine(player.onFoot ? 0 : player.car.speed, !player.onFoot);
    sound.siren(s.wanted > 0, dt);
  }

  function render() {
    const s = state;
    if (s.screen === 'title') {
      camera.position.set(Math.cos(s.orbit) * 95, 42, Math.sin(s.orbit) * 95);
      camera.lookAt(0, 10, 0);
    } else {
      const dist = s.player.onFoot ? 9 : 12.5;
      const hd = dist * Math.cos(s.camPitch);
      camera.position.set(
        s.player.pos.x + Math.sin(s.camYaw) * hd,
        2.2 + dist * Math.sin(s.camPitch),
        s.player.pos.z + Math.cos(s.camYaw) * hd,
      );
      camera.lookAt(s.player.pos.x, 1.8, s.player.pos.z);
    }
    renderer.render(scene, camera);
    hud.update(s);
    drawMinimap(hud.minimapCanvas, s);
  }

  return {
    state, rng, input,
    update, render,
    start: startGame,
    enterCar, exitCar,
    sound, hud,
  };
}

// ---- boot ---------------------------------------------------------------

const params = new URLSearchParams(location.search);
const seedParam = parseInt(params.get('seed') || '', 10);
const seed = Number.isFinite(seedParam) ? seedParam : (Math.random() * 1e9) | 0;
const shot = params.get('shot');
const game = createGame(seed);
window.__nbGame = game;

if (shot) {
  // Staged screenshot mode: no animation loop — shots.js drives the
  // simulation itself and sets window.__shotReady when the frame is set.
  const { stageShot } = await import('./shots.js');
  stageShot(game, shot);
} else {
  let last = performance.now();
  const loop = (t) => {
    const dt = Math.min(0.05, Math.max(0.001, (t - last) / 1000));
    last = t;
    const snap = game.input.snapshot();
    game.update(dt, snap);
    game.input.endFrame();
    game.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
