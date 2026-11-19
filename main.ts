// Recovery note: the submission entry point — it collects the finished game and its screenshots into the dossier make.fun expects.
// NEON BAY — gta6-01 entry point (Node 22, standard library only).
//
// The game is plain static files in game/ (game/index.html plus its ES
// modules, three.js vendored under game/vendor/, zero network requests),
// so handing it in is just copying it: game/ and screenshots/ go to the
// output directory beside this file, and dossier.json — the summary the
// judge reads — is written with the vendored make.fun library.
//
// Run it locally first with `node serve.ts` (http://localhost:8080).
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });

const shotsOut = join(outDir, 'screenshots');
mkdirSync(shotsOut, { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), shotsOut, { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the rest refuse an entry the scorer would refuse — more than
// 4 screenshots or one over 256 KiB, more than 993 files in game/ or
// 48 MiB of game files in all, or a path under game/ over 1000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

// Small build summary on stdout so a local run shows what was packed.
const shotCount = existsSync(join(repoRoot, 'screenshots'))
  ? readdirSync(join(repoRoot, 'screenshots')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).length
  : 0;
console.log(`NEON BAY dossier: ${dossier.length} bytes, ${shotCount} screenshot(s) -> ${outDir}`);
