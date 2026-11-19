# NEON BAY — How It Was Built

NEON BAY is a playable open-world crime game that runs entirely in the
browser for the make.fun slot gta6-01. Everything in it is original —
names, characters, places, art and sound. There are no downloads at
runtime: the game is `game/index.html` plus a vendored copy of three.js
r152, every texture is drawn on a canvas at load time, and the page
makes zero network requests. It plays offline from its own files.

## The premise

You are Rex Marlowe, a wheelman who has just arrived in Neon Bay, a
sun-soaked coastal city at dusk. The job is simple to state and hard to
pull off: collect **$5,000** before the NBPD puts you away.

## Running it

The game uses ES modules, so it needs HTTP rather than a `file://`
open. From the repo root:

```
node serve.ts        # serves game/ at http://localhost:8080
```

Then open that address in a desktop browser.

## Controls

| Input | Does |
| --- | --- |
| Enter | Start, or restart after BUSTED, WASTED or a win |
| WASD | Walk on foot; drive with W to accelerate, S to brake/reverse, A/D to steer |
| Shift | Sprint while on foot |
| E | Get in or out of a nearby car; hold E inside a gold `$` ring to rob a target |
| F | Punch the nearest pedestrian |
| Mouse drag | Orbit the camera around the player |
| P / Esc | Pause |
| M | Mute |

## The city

The map is a 5×5 grid of blocks — roughly 40 m blocks separated by
12 m roads, six roads running each way — with a beach and ocean along
the south edge. Buildings run 8–40 m tall and carry emissive lit
windows from canvas textures; neon signs read HOTEL, CASINO, 24/7 and
BAY BANK. Street lamps, palm trees, a purple-orange gradient sky dome,
warm fog and a low warm sun with hemisphere light give it the dusk
look. Road markings, pavement slabs, lamps and palms are merged into
InstancedMeshes, which keeps the scene near 230 draw calls.

## Systems

**On foot.** A third-person box figure with a walk-cycle animation,
moving relative to the camera, with sprint and AABB push-out against
building footprints.

**Driving.** Arcade handling — acceleration, braking, steering and
reverse — with a chase camera and speed shown in the HUD. Seven
traffic cars follow the road lanes and turn at intersections. Four
cars are parked. Pressing E beside a traffic car pulls its driver out
and puts you behind the wheel; that costs +1 wanted star.

**Pedestrians.** Twelve of them walk the sidewalks, wander, and flee
when the heat is on or a car gets close. Punching one down with F
costs +1 star.

**Wanted level, 0–5 stars.** Robbery adds 2 stars, carjacking 1,
punching 1. Once wanted, 1–4 NBPD cars spawn and chase, with flashing
light bars and a two-tone siren; they ram your car and run you down on
foot. One star fades per 20 s without a new crime. If a police car
stays in contact with you on foot for about 0.9 s you are **BUSTED**:
you lose half your cash and wake up at the beach with the heat reset.
Your HP is 100; crashes and rams damage it, and HP 0 means **WASTED**.
Both end screens restart with Enter.

**The score.** Three robbery targets carry floating `$` beacons and
minimap markers: Casa Oro Jewelers ($800–1,500), Bay Federal Bank
($1,000–1,500) and 24/7 Mini-Mart ($500–900). Hold E for 3 s inside
the ring to rob one. Eight green cash bags worth $100 each are
scattered around the city. Hit $5,000 and the **SCORE COMPLETE** win
screen shows cash, robberies, bags, crimes and time. Your best cash
total is kept in localStorage.

**HUD and minimap.** Cash, wanted stars, a health bar, speed, the
current objective, a robbery progress bar, mission toasts, a controls
hint, pause/mute, and title, pause, BUSTED, WASTED and win screens.
The 180 px minimap is a top-down canvas: roads, blocks, ocean, a
player arrow, traffic in yellow, police in red/blue, mission `$`
markers and cash bags in green.

**Sound.** WebAudio synthesis only — no audio files at all. The
engine hum rises with speed, a two-tone siren runs while you are
wanted, and there are blips for pickups, a chime for robberies, a
thud for crashes, and jingles for busted and win. M or the mute
button silences it.

## Source layout

```
game/index.html            entry point: loads vendor/three.min.js, then src/main.js
game/vendor/three.min.js   three.js r152 UMD, 633 KB, vendored
game/src/config.js         tuning numbers + city layout
game/src/random.js         mulberry32 seeded RNG
game/src/input.js          keyboard + mouse drag, edge-triggered presses
game/src/sound.js          WebAudio synth
game/src/city.js           city construction, procedural textures, colliders
game/src/player.js         on-foot figure + movement
game/src/cars.js           car meshes, arcade driving, traffic AI
game/src/police.js         NBPD chase, rams, bust logic
game/src/missions.js       robbery targets, beacons, cash bags
game/src/hud.js            DOM HUD, screens, toasts
game/src/minimap.js        2D top-down minimap
game/src/shots.js          deterministic ?shot= staging
game/src/main.js           game state, main loop, screens, win/busted/wasted
game/src/three-shim.js     re-exports window.THREE for ES modules
tools/shoot.mjs            screenshot + live playtest harness
tools/function-test.mjs    11 scripted gameplay checks
tools/fps.mjs              headless FPS probe
```

Gate check (2026-11-19): `game/` holds 16 files totalling 712 KiB
(limits: 993 files / 48 MiB); `game/index.html` is 5,715 bytes
(limit 1 MiB); 4 screenshots at 1280×720, 64–79 KiB each
(limit 256 KiB). `MAKEFUN_OUTPUT_DIR=/tmp/nb-out node main.ts`
builds the dossier without errors.

## Screenshots

Every shot is staged by `game/src/shots.js` (`stageShot()`): it
builds the real game from a fresh seeded world, simulates it forward,
paints twice and sets `window.__shotReady`. All four use
`?shot=<name>&seed=1`.

| File | What it shows |
| --- | --- |
| `screenshots/1-start.jpg` (64 KiB) | Title screen over the city at dusk |
| `screenshots/2-play.jpg` (74 KiB) | On foot at the Casa Oro `$` beacon, HUD + minimap |
| `screenshots/3-drive.jpg` (79 KiB) | Driving north up the neon avenue, 108 km/h |
| `screenshots/4-chase.jpg` (75 KiB) | 3 wanted stars, two NBPD units ramming the player |

## Verification (2026-11-19, headless Chromium + SwiftShader WebGL)

- `node tools/shoot.mjs` — **ALL OK**. All four `?shot=` pages
  reach `__shotReady` with 0 console errors, 0 page errors and
  0 failed requests. The live playtest proves the loop runs: title
  screen → Enter starts the game → W walks the player forward,
  game time advances and HUD cash renders. (SwiftShader manages
  only ~1.7 fps on this VM — a software-renderer artifact. A single
  `render()` measures 2–42 ms and the scene is ~230 draw calls /
  ~12k triangles, trivial for hardware GL.)
- `node tools/function-test.mjs` — **11/11 PASS, 0 errors**.
  Robbery pays and raises wanted to 2; police spawn while wanted;
  carjack enters the car and adds a star; the car accelerates past
  30 m/s; exit car works; a punch knocks a ped down and adds a star;
  a cash bag pays +$100; the win fires at $5,000; BUSTED by police
  touch halves cash ($1,200 → $600); WASTED at HP 0.
- `node tools/fps.mjs` — reports an FPS number from a 5 s
  headless run after Enter starts the game.

## Problems found while testing, and the fixes

1. **Hidden beacons.** Mission markers were spawning inside building
   footprints, so the beacon was invisible. Fix: markers moved to
   block corners that buildings never reach; cash bags are
   rejection-sampled against the building colliders.
2. **Peds in walls.** Pedestrians wandered through buildings, and a
   ped inside a wall could not be punched — the player is pushed out
   of the wall, out of punch range. Fix: peds get the same AABB
   push-out as the player, and wander targets are nudged out of
   buildings.
3. **Police that never bust.** Police cars overshot the on-foot
   player and never stayed close enough to trigger a bust. Fix: an
   arrive behaviour — police slow down as they close in.
4. **SwiftShader crawl.** 25 point lights, a shadow map and
   antialiasing made the software renderer crawl. Fix: shadows off
   (the dusk lighting carries the look), no point lights (emissive
   lamp bulbs instead), and road markings, slabs, lamps and palms
   merged into InstancedMeshes — 501 down to 230 draw calls.

## Known weaknesses

- No real shadow maps — dropped for performance, as above. The scene
  is flatter than a shadowed one on a real GPU, though the buildings
  still read well at dusk.
- Traffic AI is simple lane-following with random turns at
  intersections; cars can overlap each other there and never avoid
  the player.
- No engine or skid audio beyond the synth hum; no music.
- The start-screen camera orbits downtown in a slow circle; the beach
  and ocean are only visible from the south side.
