// Deterministic screenshot scenes behind ?shot=start|play|drive|chase (with &seed=N).
// Each stages the real game state, simulates it forward a little, paints twice and
// sets window.__shotReady — the frame is what real play looks like.
import { STEP } from './config.js';
import { makeCar } from './cars.js';
import { spawnPolice } from './police.js';

function simulate(game, seconds, inp) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    game.update(STEP, inp);
    if (game.state.screen !== 'play' && game.state.screen !== 'title') break;
  }
}

const IDLE = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
const DRIVE = { axis: { x: 0, y: 1 }, sprint: false, holdingE: false, pressed: new Set() };

export function stageShot(name, game) {
  const { state, scene } = game;
  game.resetWorld();
  state.screen = 'play';

  if (name === 'start') {
    state.screen = 'title';
    // Camera low over the beach looking up the neon avenue at dusk.
    game.camera.position.set(40, 14, 175);
    game.camera.lookAt(-20, 10, -60);
    simulate(game, 2, IDLE);
    game.camera.position.set(40, 14, 175);
    game.camera.lookAt(-20, 10, -60);
    return;
  }

  if (name === 'play') {
    // Rex on foot at the Casa Oro Jewelers $ beacon, HUD + minimap live.
    state.player.pos = { x: -85, z: -30 };
    state.player.heading = Math.PI;
    state.cash = 1200;
    state.player.mesh.position.set(-85, 0, -30);
    simulate(game, 1.5, IDLE);
    return;
  }

  if (name === 'drive') {
    // Rex driving a red car north up the neon avenue, through downtown.
    const car = makeCar(-26, 80, Math.PI, 0xd94f4f);
    scene.add(car.mesh);
    game.enterCar(car, false);
    state.cash = 2400;
    simulate(game, 3.2, DRIVE);
    return;
  }

  if (name === 'chase') {
    // Wanted 3 stars: Rex speeding away with three NBPD units in pursuit.
    const car = makeCar(-26, 40, 0, 0x4f7ad9);
    scene.add(car.mesh);
    game.enterCar(car, false);
    state.cash = 3650;
    state.wanted = 3; state.wantedTimer = 20;
    for (let i = 0; i < 3; i++) {
      const cop = spawnPolice(scene, -26 + (i - 1) * 7, 40 + 14 + i * 6, 0);
      state.police.push(cop);
    }
    // One unit coming the other way, visible ahead of the player in the frame.
    state.police.push(spawnPolice(scene, -23, -70, 0));
    simulate(game, 1.6, DRIVE);
    return;
  }

  // Unknown shot name: fall back to the title scene.
  state.screen = 'title';
  simulate(game, 2, IDLE);
}
