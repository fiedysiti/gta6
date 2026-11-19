# NEON BAY — Build Log

Open-world crime browser game for the make.fun competition (slot gta6-01).
All names, characters, places, art and sound are original. No external assets:
`game/index.html` + vendored three.js r152 only, all textures canvas-generated,
no network requests at all. Plays offline from its own static files.

## How to play

Serve `game/` over local HTTP (ES modules need it) and open it in a desktop browser:

```
node serve.ts        # http://localhost:8080
```

| Key | Action |
| --- | --- |
| Enter | Start / restart after BUSTED, WASTED or win |
| WASD | Move on foot / drive (W accelerate, S brake/reverse, A/D steer) |
| Shift | Sprint on foot |
| E | Enter or exit a car (near one); hold E in a gold `$` ring to rob |
| F | Punch a nearby pedestrian |
| Mouse drag | Orbit the camera |
| P / Esc | Pause · M mute |

## The game

Rex Marlowe, a wheelman new to the sun-soaked coastal city of Neon Bay, has to
clear **$5,000** before the NBPD catches him.

- **City** — 5×5 blocks between 6 roads each way (~40 m blocks, 12 m roads),
  buildings 8–40 m with emissive lit windows (canvas textures), neon signs
  (HOTEL, CASINO, 24/7, BAY BANK), street lamps, palm trees, beach and ocean
  along the south edge. Dusk look: purple-orange gradient sky dome, warm fog,
  low warm sun + hemisphere light. ~230 draw calls (markings, slabs, lamps and
  palms are InstancedMeshes).
- **On foot** — third-person box figure with walk-cycle animation, WASD relative
  to the camera, sprint, building collision (AABB push-out).
- **Driving** — arcade physics (accel/brake/steer, reverse), chase camera, speed
  in the HUD. 7 traffic cars drive road lanes and turn at intersections.
  4 parked cars + carjacking: E near a traffic car pulls the driver out
  (+1 wanted star).
- **Pedestrians** — 12 walk the sidewalks, wander, flee when wanted or when a
  car comes close. F punches one down (+1 star).
- **Wanted (0–5 stars)** — robbery +2, carjack +1, punch +1. 1–4 NBPD cars spawn
  and chase (flashing light bars, two-tone siren); they ram the player's car
  and run the player down on foot. Wanted decays one star per 20 s without a
  crime. Police touch on foot for ~0.9 s → **BUSTED** (lose half your cash,
  respawn at the beach, wanted reset). HP 100; crashes and rams damage it;
  HP 0 → **WASTED**. Both screens restart with Enter.
- **Missions / goal** — 3 robbery targets with floating `$` beacons and minimap
  markers (Casa Oro Jewelers $800–1,500; Bay Federal Bank $1,000–1,500;
  24/7 Mini-Mart $500–900). Hold E for 3 s in the ring to rob. 8 green cash
  bags ($100 each) scattered around the city. Reach $5,000 → **SCORE COMPLETE**
  win screen with cash / robberies / bags / crimes / time. Best cash saved in
  localStorage.
- **HUD** — cash, wanted stars, health bar, speed, objective line, robbery
  progress bar, mission toasts, controls hint, pause/mute, title screen with
  the story blurb, pause screen, BUSTED / WASTED / win screens.
- **Minimap** — 180 px top-down canvas: roads, blocks, ocean, player arrow,
  traffic (yellow), police (red/blue), mission `$` markers, cash bags (green).
- **Sound** — WebAudio synth only (no audio files): engine hum pitched by
  speed, two-tone siren while wanted, pickup blip, robbery chime, crash thud,
  busted/win jingles. M / mute button.

## Files

```
game/index.html            108 lines  (loads vendor/three.min.js, then src/main.js)
game/vendor/three.min.js   three.js r152 UMD, 633 KB (already vendored)
game/src/config.js          39  tuning + city layout
game/src/random.js          12  mulberry32 seeded RNG
game/src/input.js           38  keyboard + mouse-drag, edge-triggered presses
game/src/sound.js           51  WebAudio synth
game/src/city.js           202  city build, procedural textures, colliders
game/src/player.js          68  on-foot figure + movement
game/src/cars.js           137  car meshes, arcade driving, traffic AI
game/src/police.js          71  NBPD chase, rams, bust logic
game/src/missions.js        95  robbery targets, beacons, cash bags
game/src/hud.js             61  DOM HUD + screens + toasts
game/src/minimap.js         60  2D top-down minimap
game/src/shots.js           75  deterministic ?shot= staging
game/src/main.js           438  game state, loop, screens, win/busted/wasted
game/src/three-shim.js       5  re-exports window.THREE for ES modules
tools/shoot.mjs                screenshot + live playtest harness
tools/function-test.mjs        11 scripted gameplay checks (see below)
tools/fps.mjs                  headless FPS probe
```

Gate check (verified 2026-11-19): `game/` = 16 files, 712 KiB (limit 993 / 48 MiB);
`game/index.html` = 5,715 bytes (limit 1 MiB); 4 screenshots, 64–79 KiB each,
1280×720 (limit 256 KiB, long side ≤ 1280, short side ≥ 480).
`MAKEFUN_OUTPUT_DIR=/tmp/nb-out node main.ts` builds the dossier with no errors.

## Screenshots (`shots.json`, all `?shot=<name>&seed=1`)

| File | Scene |
| --- | --- |
| `screenshots/1-start.jpg` (64 KiB) | Title screen over the city at dusk |
| `screenshots/2-play.jpg` (74 KiB) | On foot at the Casa Oro `$` beacon, HUD + minimap |
| `screenshots/3-drive.jpg` (79 KiB) | Driving north up the neon avenue, 108 km/h |
| `screenshots/4-chase.jpg` (75 KiB) | 3 wanted stars, two NBPD units ramming the player |

Staging: `game/src/shots.js` `stageShot()` builds the real game from a fresh
seeded world, simulates it forward, paints twice and sets `window.__shotReady`.

## Test results (2026-11-19, headless Chromium + SwiftShader WebGL)

- `node tools/shoot.mjs` — **ALL OK**: all 4 `?shot=` pages reach `__shotReady`
  with **0 console errors, 0 page errors, 0 failed requests**; live playtest:
  title → Enter starts the game → W walks the player forward, game time
  advances, HUD cash renders. (SwiftShader renders ~1.7 fps on this VM — a
  software-renderer artifact; a single `render()` measures 2–42 ms and the
  scene is ~230 draw calls / ~12k triangles, trivial for hardware GL.)
- `node tools/function-test.mjs` — **11/11 PASS, 0 errors**: robbery pays and
  raises wanted to 2; police spawn when wanted; carjack enters the car and
  adds a star; car accelerates to 30 m/s; exit car; punch knocks a ped down
  and adds a star; cash bag +$100; win at $5,000; BUSTED by police touch
  (cash halved $1,200 → $600); WASTED at HP 0.

## Bugs found and fixed during testing

1. Mission markers were spawning inside building footprints (invisible beacon).
   Fixed: markers moved to block corners that buildings never reach; cash bags
   are rejection-sampled against building colliders.
2. Peds wandered through buildings; a ped inside a wall could not be punched
   (the player gets pushed out of the wall, out of punch range). Fixed: peds
   get the same AABB push-out as the player, and wander targets are nudged out
   of buildings.
3. Police cars overshot the on-foot player and never stayed close enough to
   bust them. Fixed: arrive behaviour — police slow down as they close in.
4. 25 point lights + shadow map + antialias made SwiftShader crawl. Fixed:
   shadows off (dusk lighting carries the look), no point lights (emissive
   lamp bulbs instead), road markings / slabs / lamps / palms merged into
   InstancedMeshes (501 → 230 draw calls).

## Known weaknesses

- No real shadow maps (dropped for performance; see above) — buildings still
  read well at dusk, but the scene is flatter than a shadowed one on a real GPU.
- Traffic AI is simple lane-following with random intersection turns; cars can
  overlap each other at intersections and never avoid the player.
- No engine/skid audio beyond the synth hum; no music.
- The start-screen camera orbit is a slow circle around downtown; the beach
  and ocean are only visible from the south side.
