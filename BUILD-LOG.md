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
| H | Horn while driving |
| Mouse drag | Orbit the camera around the player |
| Mouse wheel | Zoom the chase camera in and out |
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
InstancedMeshes, which keeps the scene near 250 draw calls. A wooden
boardwalk pier juts 44 m out into the ocean from the south beach,
with plank decking, railings, lamps and a glowing NEON BAY PIER sign
at its end — the beach and the sea are part of normal play now, not a
corner of the map you never visit.

## Systems

**On foot.** A third-person box figure with a walk-cycle animation,
moving relative to the camera, with sprint and AABB push-out against
building footprints.

**Driving.** Arcade handling — acceleration, braking, steering and
reverse — with a chase camera and speed shown in the HUD. Seven
traffic cars follow the road lanes and turn at intersections. Four
cars are parked. Pressing E beside a traffic car pulls its driver out
and puts you behind the wheel; that costs +1 wanted star. The
traffic keeps a bumper gap to the car ahead (it slows instead of
overlapping), waits instead of piling into an occupied intersection,
and stops for the player standing in the road; lanes follow
right-hand traffic, so two cars never meet head-on in one lane. H
sounds the horn, hard steering at speed skids, and the mouse wheel
zooms the chase camera.

**Pedestrians.** Twelve of them walk the sidewalks, wander, and flee
when the heat is on or a car gets close. Punching one down with F
costs +1 star.

**Wanted level, 0–5 stars.** Robbery adds 2 stars, carjacking 1,
punching 1. Once wanted, 1–4 NBPD cars spawn and chase, with flashing
light bars and a two-tone siren; they ram your car and run you down on
foot. At 3 stars and up a police helicopter joins them: it orbits
overhead with a spotlight cone and a pool of light on the ground, and
the game toasts AIR SUPPORT. One star fades per 20 s without a new
crime. If a police car stays in contact with you on foot for about
0.9 s you are **BUSTED**: you lose half your cash and wake up at the
beach with the heat reset. Your HP is 100; crashes and rams damage
it, and HP 0 means **WASTED**. Both end screens restart with Enter.

**The score — a three-job chain.** The three robbery targets are now
one story, run in order: 1. **The Gold Touch** (Casa Oro Jewelers,
$800–1,500), 2. **The Vault Job** (Bay Federal Bank, $1,000–1,500),
3. **The Quick Score** (24/7 Mini-Mart, $500–900). Only the current
job's `$` beacon shows, and only it can be robbed; finishing a job
pays a $150 completion bonus and unlocks the next. Hold E for 3 s
inside the ring to rob one. Eight green cash bags worth $100 each
are scattered around the city. Hit $5,000 and the **SCORE COMPLETE**
win screen shows cash, robberies, bags, crimes and time. Your best
cash total is kept in localStorage.

**HUD and minimap.** Cash, a money-goal bar ($X / $5,000), a mission
tracker (MISSION 1/3 — The Gold Touch: Casa Oro Jewelers), wanted
stars, a health bar, speed, the current objective, a robbery progress
bar, mission toasts, a controls hint, pause/mute, and title, pause,
BUSTED, WASTED and win screens. Toasts now stay up for 5 s — long
enough to read while driving. The 180 px minimap is a top-down
canvas: roads, blocks, ocean, a player arrow, traffic in yellow,
police in red/blue, the active mission `$` with its job number, the
helicopter as an orange diamond, and cash bags in green.

**Sound.** WebAudio synthesis only — no audio files at all. A
procedural music loop (112 BPM, Am–F–C–G pad and bass with a
fifth-walk melody) plays while you are in the game, the engine hum
rises with speed, a two-tone siren runs while you are wanted, and
there are blips for pickups, a chime for robberies, a thud for
crashes, a skid scrape, a horn, footsteps on foot, and jingles for
busted and win. M or the mute button silences it.

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
tools/function-test.mjs    20 scripted gameplay checks
tools/fps.mjs              headless FPS probe
```

Gate check (2026-11-19, round 4): `game/` holds 18 files and
directories totalling 747,633 bytes (limits: 993 / 48 MiB);
`game/index.html` is 2,023 bytes (limit 1 MiB); 4 screenshots at
1280×720, 74–108 KiB each (limit 256 KiB, long side ≤ 1280,
short side ≥ 480); the dossier `out/dossier.json` is 576,172 bytes
(limit 1.5 MiB) with a 115,363-byte text outline (limit 163,840).
`MAKEFUN_OUTPUT_DIR=out node main.ts` builds the dossier without
errors. The sealed gate scorer is not published in the kit, so
`grade-local` cannot run it locally — it prints that the house
grades it from its competition directory; the limits above were
checked against the built dossier by hand and all pass.

## Screenshots

Every shot is staged by `game/src/shots.js` (`stageShot()`): it
builds the real game from a fresh seeded world, simulates it forward,
paints twice and sets `window.__shotReady`. All four use
`?shot=<name>&seed=1`.

| File | What it shows |
| --- | --- |
| `screenshots/1-start.jpg` (108 KiB) | Cover: heli chase at dusk — the NBPD helicopter overhead with its spotlight, 3 wanted stars, two police cars flanking the player's car, mission tracker and $2,400 / $5,000 goal bar |
| `screenshots/2-play.jpg` (74 KiB) | Mid-robbery on the first mission: Rex in the gold ring at Casa Oro, robbery bar ~55%, mission tracker, goal bar, minimap with mission "1" |
| `screenshots/3-drive.jpg` (78 KiB) | Driving up the neon avenue at 96 km/h with traffic ahead to thread through |
| `screenshots/4-chase.jpg` (75 KiB) | On foot on the NEON BAY PIER boardwalk, ocean on both sides, sign lit |

## Verification (2026-11-19, headless Chromium + SwiftShader WebGL)

Round 3 baseline (kept): `node tools/shoot.mjs` — **ALL OK**. All
four `?shot=` pages reach `__shotReady` with 0 console errors,
0 page errors and 0 failed requests. The live playtest proves the
loop runs: title screen → Enter starts the game → W walks the
player forward, game time advances and HUD cash renders.
(SwiftShader manages only ~1.7 fps on this VM — a software-renderer
artifact. A single `render()` measures 2–42 ms and the scene is
~230 draw calls / ~12k triangles, trivial for hardware GL.)

### Round 4 (2026-11-19)

- `node tools/shoot.mjs` — **ALL OK**. All four shots are
  1280×720, 74–108 KiB, 0 errors, and the harness now asserts the
  JPEG dimensions from the file and that the mission tracker and
  goal bar are on screen in every shot (1-start: MISSION 1/3 — The
  Gold Touch, $2,400 / $5,000; 2-play: robbery in progress;
  3-drive: 96 km/h with traffic; 4-chase: on the pier). The
  playtest still passes (title → play, W walks, time advances,
  HUD cash `$0` renders).
- `node tools/function-test.mjs` — **20/20 PASS, 0 errors**. The
  11 round-3 checks still pass, plus 9 new ones: the mission chain
  gates robbery to the current job only (the bank ring does nothing
  while job 1 is open) and pays the $150 bonus on completion
  (cash $2,740 after the jewelers job); the helicopter spawns at
  3 stars and leaves at 0; traffic keeps its spacing over 600
  steps (min pairwise 26.82 m) and stops for the player in the road
  (min centre distance 10.2 m); Rex walks the pier from z 150 to
  z 197; the HUD goal bar reads "$1,200 / $5,000" at 24% with the
  mission tracker beside it; the mouse wheel zooms and the wheel
  delta clears each frame; sound is headless-safe and footsteps
  fire 6 times while walking, 0 times idle; toasts show their text.
- `node tools/fps.mjs` — fps 1.6 in SwiftShader, game clock
  0.4 s over 5 s of wall time, single `render()` 8.4 ms. The
  per-frame render cost is low; the headless number is the software
  rasterizer, not the game.
- `MAKEFUN_OUTPUT_DIR=out node main.ts` — dossier builds cleanly
  (576,164 bytes, cover 1-start.jpg, 4 JPEGs, 15 source files +
  vendored three.js); every gate limit in
  `competition.yaml`'s reference/gate.json passes (see above).
  `grade-local` cannot run the sealed gate locally — the kit
  states the scorer is not published and the house grades it from
  its competition directory — so the gate was verified against the
  built dossier instead, and the judge heats run on the server
  after submission.

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

### Round 4

5. **Toasts rendered empty.** `hud.toast()` had lost its
   `textContent` assignment in an earlier edit, so toasts showed as
   empty boxes. Fix: the line restored; a function-test now asserts
   a toast's text is really in the DOM.
6. **Ocean invisible.** The ocean plane sat under the ground plane,
   so the whole south side read as a black void. Fix: ocean raised
   above the ground plane, still below the sand.
7. **Helicopter out of frame.** At 30 m altitude the heli sat above
   the chase camera's top edge — only the beam showed. Fix:
   altitude 15 m, and the camera-pitch clamp lowered so a staged
   level camera is not overridden. A screen-projection probe
   confirmed the airframe now sits clear of the mission panel.
8. **Spotlight too dominant.** The beam cone and ground pool were
   wide and bright enough to wash the frame out from the low
   camera. Fix: cone slimmed (0.3 → 3.5 m, opacity 0.12), pool
   4 m / 0.25.
9. **Pier sign clipped.** "NEON BAY PIER" at bold 40 px was wider
   than its 256 px canvas, so the N and R were cut in the texture
   itself. Fix: the sign texture shrinks its font until the text
   fits, and the sign posts moved outside the sign's width.
10. **Cover composition.** Police cars placed behind the player
    ended up dead-centre in front of the camera, blocking the frame,
    and a traffic car sat right behind it. Fix: cops flank wide,
    traffic and parked cars moved far up-map in the `start` staging.
11. **Traffic head-on deadlock.** Lanes were drawn independently of
    direction, so two cars could face each other in one lane and
    stall forever. Fix: right-hand-traffic lanes derived from axis
    and direction, on spawn, on turns and on edge U-turns.
12. **Toast expiry vs slow renders.** The AIR SUPPORT toast fired
    at heli spawn, two slow SwiftShader renders before the
    screenshot, and expired in between. Fix: toasts last 5 s
    instead of 3.2 s, and the `start` staging tops the toast up only
    if it is gone, so the cover shows it exactly once.

## Known weaknesses

- No real shadow maps — dropped for performance, as above. The scene
  is flatter than a shadowed one on a real GPU, though the buildings
  still read well at dusk.
- The helicopter is visual only: it orbits and spotlights the
  player but never rams, busts or damages — the ground units still
  do the catching.
- The music loop is a simple four-chord sequencer; it sets the mood
  but does not react to chases or robberies.
- The only save is the best-cash total in localStorage; there is no
  mid-run save or load.
