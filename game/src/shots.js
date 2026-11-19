// Recovery note: stages each screenshot scene from the real running game, then raises the flag the harness waits for.
// Deterministic screenshot staging for ?shot=<name>&seed=1.
// Builds on the real game (a fresh seeded world from main.js), puts it
// in the scene each shot needs, simulates it forward a few seconds so
// traffic, beacons and police are alive in the frame, paints twice, and
// sets window.__shotReady. No animation loop runs in shot mode — the
// harness drives everything from here, which is also what lets the
// functional tests step the same game by hand.
//
//   start — cover: helicopter chase at dusk, 3 wanted stars, NBPD cars
//           closing in under the heli beam, HUD + minimap + mission
//           tracker in frame
//   play  — mid-robbery at the Casa Oro `$` beacon, hold-E bar filling
//   drive — driving north up the neon avenue through traffic
//   chase — on foot on the Neon Bay pier, boardwalk + sign + ocean

import { CFG } from './config.js';
import { updateHeli } from './police.js';

const IDLE = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
const FOOT_DOWN = { axis: { x: 0, y: 1 }, sprint: false, holdingE: false, pressed: new Set() };
const HOLD_E = { axis: { x: 0, y: 0 }, sprint: false, holdingE: true, pressed: new Set() };

function step(game, n, input) {
  for (let i = 0; i < n; i++) game.update(1 / 60, input);
}

function paint(game) {
  game.render();
  game.render();
}

// Put the player in a parked car (no heat — it is empty) at the given
// spot, heading north, already rolling.
function stageDriving(game, x, z, speed) {
  const s = game.state;
  const car = s.parked[0];
  game.enterCar(car);
  car.pos.x = x;
  car.pos.z = z;
  car.angle = Math.PI; // forward (sin PI, cos PI) = (0, -1): north
  car.speed = speed;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = Math.PI;
  s.camYaw = 0; // camera behind, looking north up the avenue
}

// Park the helicopter due north of the player — ahead of the camera,
// high in the frame — and re-aim it there without advancing the orbit.
// Guarded: state.heli only exists once main.js wires it.
function anchorHeliNorth(game) {
  const s = game.state;
  if (s.heli) {
    s.heli.orbitAngle = -Math.PI / 2;
    updateHeli(s.heli, s.player.pos, s.wanted, 0, s.time);
  }
}

export function stageShot(game, name) {
  const s = game.state;
  if (name === 'start') {
    // Cover: the heli chase. Level camera (camPitch 0): the horizon
    // sits near the top of the frame, so the heli airframe at 18 m
    // altitude, 26 m north of the car (~22° elevation), sits ~7°
    // inside the top edge instead of clipped by it.
    game.start();
    s.cash = 2400;
    stageDriving(game, 26, 30, 16);
    s.wanted = 3;
    s.wantedTimer = CFG.decaySeconds;
    s.camPitch = 0;
    // Clear the camera corridor: move every traffic/parked car far up
    // the map so none of them sits right behind the camera.
    s.traffic.forEach((c, i) => {
      const road = CFG.roadCenters[i % CFG.roadCenters.length];
      c.pos.x = road - 3; c.pos.z = -60 - i * 10;
      c.axis = 'v'; c.road = road; c.lane = -3; c.dir = 1;
      c.angle = 0; c.speed = 9;
      c.mesh.position.set(c.pos.x, 0, c.pos.z); c.mesh.rotation.y = 0;
    });
    s.parked.forEach((c, i) => {
      const road = CFG.roadCenters[(i + 2) % CFG.roadCenters.length];
      c.pos.x = road + 5.4; c.pos.z = -50 - i * 15;
      c.mesh.position.set(c.pos.x, 0, c.pos.z);
    });
    step(game, 5, IDLE); // let the force spawn its three units + heli
    anchorHeliNorth(game);
    // Two units flanking wide so they close in from the sides and
    // frame the player's car instead of piling up dead-centre behind
    // it (where they block the camera).
    const cops = s.police;
    if (cops[0]) {
      cops[0].pos.x = 16; cops[0].pos.z = 28;
      cops[0].angle = Math.PI; cops[0].speed = 14;
    }
    if (cops[1]) {
      cops[1].pos.x = 36; cops[1].pos.z = 32;
      cops[1].angle = Math.PI; cops[1].speed = 14;
    }
    step(game, 120, IDLE); // coast while the NBPD closes in and rams
    anchorHeliNorth(game); // the coast orbits it ~0.7 rad away
    // The AIR SUPPORT toast fired at spawn, two slow renders ago, and
    // may have expired by now — top it up only if it is gone, so the
    // shot shows the message exactly once.
    const hasAirToast = [...document.querySelectorAll('#hud-toasts .toast')]
      .some((t) => t.textContent.includes('AIR SUPPORT'));
    if (!hasAirToast) game.hud.toast('AIR SUPPORT — NBPD helicopter overhead');
    paint(game);
  } else if (name === 'play') {
    game.start();
    s.cash = 1200;
    s.player.pos.x = -79;
    s.player.pos.z = -30;
    s.player.mesh.position.set(-79, 0, -30);
    s.player.angle = -Math.PI / 2; // facing west, at the beacon
    s.camYaw = Math.PI / 2; // camera east of Rex, looking west
    step(game, 30, IDLE);
    // Step into the ring and hold E: 100 steps fills the robbery bar
    // to ~55%, so the shot shows the robbery itself happening — the
    // bar, the beacon, the mission tracker and the goal bar together.
    // The robbery is left unfinished on purpose: the functional tests
    // rob this same target right after the staged shot.
    s.player.pos.x = -85;
    s.player.pos.z = -30;
    s.player.mesh.position.set(-85, 0, -30);
    step(game, 100, HOLD_E);
    paint(game);
  } else if (name === 'drive') {
    game.start();
    s.cash = 1200;
    stageDriving(game, 26, 40, 24);
    // Two traffic cars ahead on the same avenue so the shot shows the
    // traffic the player threads through: one southbound in the
    // oncoming lane (a close pass), one northbound ahead to catch.
    // Lane matches direction (right-hand traffic, see cars.js).
    const t0 = s.traffic[0], t1 = s.traffic[1];
    if (t0) {
      t0.pos.x = 23; t0.pos.z = 10;
      t0.axis = 'v'; t0.road = 26; t0.lane = -3; t0.dir = 1;
      t0.angle = 0; t0.speed = 9;
      t0.mesh.position.set(23, 0, 10); t0.mesh.rotation.y = 0;
    }
    if (t1) {
      t1.pos.x = 29; t1.pos.z = -12;
      t1.axis = 'v'; t1.road = 26; t1.lane = 3; t1.dir = -1;
      t1.angle = Math.PI; t1.speed = 10;
      t1.mesh.position.set(29, 0, -12); t1.mesh.rotation.y = Math.PI;
    }
    step(game, 90, FOOT_DOWN); // accelerate up the avenue
    paint(game);
  } else if (name === 'chase') {
    game.start();
    s.cash = 800;
    // On foot on the pier: Rex mid-boardwalk facing south, the NEON
    // BAY PIER sign and the ocean ahead, the deck and rails leading
    // the eye there. Camera north of Rex, looking south. Rex stands
    // at z 170 (not the platform at 190) so the 12 m sign, 26 m
    // ahead of the camera, fits the frame whole.
    s.player.pos.x = 0;
    s.player.pos.z = 170;
    s.player.mesh.position.set(0, 0, 170);
    s.player.angle = 0; // facing south (+z), toward the sign and ocean
    s.camYaw = Math.PI;
    s.camPitch = 0.3;
    step(game, 60, IDLE);
    paint(game);
  } else {
    // Anything unknown: the title screen over the city.
    step(game, 30, IDLE);
    paint(game);
  }
  window.__shotReady = true;
}
