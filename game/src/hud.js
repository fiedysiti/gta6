// Recovery note: everything the player reads on screen — cash, stars, health, prompts and the end screens — is drawn by this module.
// DOM HUD: cash, wanted stars, health, speed, objective, robbery
// progress, toasts, and the title / pause / BUSTED / WASTED / win screens.
// The game updates this from render(), so staged screenshots show the
// same HUD a live player sees.

import { CFG } from './config.js';

const CSS = `
#nb-hud { position: fixed; inset: 0; pointer-events: none; font-family: Arial, Helvetica, sans-serif; color: #fff; z-index: 5; }
#nb-hud > div, #nb-hud > canvas { position: absolute; }
#nb-hud .panel { position: absolute; background: rgba(12, 8, 24, 0.62); border: 1px solid rgba(255, 210, 61, 0.35); border-radius: 10px; padding: 8px 12px; }
#hud-cash { top: 14px; left: 14px; font-size: 26px; font-weight: bold; color: #7dff8a; text-shadow: 0 2px 6px #000; }
#hud-stars { top: 58px; left: 14px; font-size: 20px; letter-spacing: 3px; color: #ffd23d; text-shadow: 0 2px 6px #000; }
#hud-hp { top: 92px; left: 14px; width: 170px; height: 12px; background: rgba(0,0,0,0.55); border-radius: 6px; overflow: hidden; }
#hud-hp-fill { height: 100%; width: 100%; background: linear-gradient(90deg, #37d67a, #7dff8a); }
#hud-speed { top: 112px; left: 14px; font-size: 15px; color: #cfe8ff; text-shadow: 0 1px 4px #000; }
#hud-objective { top: 14px; left: 50%; transform: translateX(-50%); font-size: 15px; text-align: center; color: #ffe9a8; text-shadow: 0 1px 4px #000; }
#hud-rob { top: 150px; left: 50%; transform: translateX(-50%); width: 260px; height: 14px; background: rgba(0,0,0,0.6); border: 1px solid #ffd23d; border-radius: 7px; overflow: hidden; display: none; }
#hud-rob-fill { height: 100%; width: 0%; background: #ffd23d; }
#hud-hint { bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 12px; color: rgba(255,255,255,0.75); text-shadow: 0 1px 3px #000; white-space: nowrap; }
#hud-toasts { bottom: 44px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; }
#hud-toasts .toast { background: rgba(12, 8, 24, 0.8); border: 1px solid rgba(255,210,61,0.5); border-radius: 8px; padding: 6px 14px; font-size: 15px; }
#hud-mute { position: absolute; top: 14px; right: 204px; pointer-events: auto; cursor: pointer; background: rgba(12,8,24,0.62); color: #fff; border: 1px solid rgba(255,210,61,0.35); border-radius: 8px; padding: 6px 10px; font-size: 14px; }
#minimap { position: absolute; top: 14px; right: 14px; width: 180px; height: 180px; border: 2px solid rgba(255,210,61,0.55); border-radius: 10px; background: #14101f; }
.nb-screen { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; flex-direction: column; text-align: center; background: rgba(8, 4, 20, 0.72); z-index: 10; color: #fff; font-family: Arial, Helvetica, sans-serif; }
.nb-screen h1 { font-size: 64px; margin: 0 0 8px; letter-spacing: 4px; color: #ff5da2; text-shadow: 0 0 24px #ff5da2, 0 4px 0 #000; }
.nb-screen h2 { font-size: 40px; margin: 0 0 10px; letter-spacing: 3px; }
.nb-screen p { font-size: 17px; line-height: 1.55; max-width: 560px; margin: 6px 0; color: #e8e2f5; }
.nb-screen .keys { font-size: 14px; color: #ffd23d; }
.nb-screen .big { font-size: 22px; color: #7dff8a; font-weight: bold; }
`;

export function createHud() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.id = 'nb-hud';
  hud.innerHTML = `
    <div class="panel" id="hud-cash">$0</div>
    <div id="hud-stars"></div>
    <div id="hud-hp"><div id="hud-hp-fill"></div></div>
    <div id="hud-speed"></div>
    <div class="panel" id="hud-objective"></div>
    <div id="hud-rob"><div id="hud-rob-fill"></div></div>
    <div id="hud-toasts"></div>
    <div id="hud-hint">WASD move &middot; Shift sprint &middot; E enter car / hold to rob &middot; F punch &middot; Drag mouse to look &middot; P pause &middot; M mute</div>
    <button id="hud-mute">Sound: on</button>
    <canvas id="minimap" width="180" height="180"></canvas>`;
  document.body.appendChild(hud);

  function screen(id, inner) {
    const el = document.createElement('div');
    el.className = 'nb-screen';
    el.id = id;
    el.innerHTML = inner;
    document.body.appendChild(el);
    return el;
  }
  const title = screen('screen-title', `
    <h1>NEON BAY</h1>
    <p>Rex Marlowe, wheelman new to the sun-soaked coastal city of Neon Bay,
    has to clear <b>$5,000</b> before the NBPD catches him. Rob the jewelers,
    the bank and the mini-mart, grab the cash bags — and mind the stars.</p>
    <p class="keys">WASD move / drive &middot; Shift sprint &middot; E enter car, hold E to rob &middot; F punch &middot; Mouse drag camera &middot; P pause &middot; M mute</p>
    <p class="big">Press ENTER to start</p>
    <p id="title-best"></p>`);
  const pause = screen('screen-pause', `
    <h2>PAUSED</h2><p>Take a breath, Rex. The city waits.</p>
    <p class="keys">P / Esc to resume &middot; M mute</p>`);
  const busted = screen('screen-busted', `
    <h2>BUSTED</h2><p id="busted-text">The NBPD got you.</p>
    <p class="keys">Press ENTER to try again</p>`);
  const wasted = screen('screen-wasted', `
    <h2>WASTED</h2><p>Rex went down in Neon Bay.</p>
    <p class="keys">Press ENTER to try again</p>`);
  const win = screen('screen-win', `
    <h2>SCORE COMPLETE</h2><p class="big" id="win-cash"></p>
    <p id="win-stats"></p>
    <p class="keys">Press ENTER to play again</p>`);

  const el = (id) => document.getElementById(id);
  const muteBtn = el('hud-mute');

  function fmt(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }

  return {
    minimapCanvas: el('minimap'),
    onMuteClick: null,
    toast(msg) {
      const box = el('hud-toasts');
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = msg;
      box.appendChild(t);
      setTimeout(() => t.remove(), 3200);
      while (box.children.length > 3) box.firstChild.remove();
    },
    update(s) {
      el('hud-cash').textContent = fmt(s.cash);
      el('hud-stars').textContent = '★'.repeat(s.wanted) + '☆'.repeat(CFG.maxWanted - s.wanted);
      el('hud-hp-fill').style.width = Math.max(0, s.hp) + '%';
      el('hud-hp-fill').style.background = s.hp > 40
        ? 'linear-gradient(90deg,#37d67a,#7dff8a)'
        : 'linear-gradient(90deg,#d63737,#ff7a7a)';
      const kmh = s.player.onFoot ? 0 : Math.abs(s.player.car.speed) * 3.6;
      el('hud-speed').textContent = s.player.onFoot
        ? (s.nearCar ? 'Press E to get in the car' : 'On foot')
        : `Driving — ${Math.round(kmh)} km/h`;
      const toGo = Math.max(0, CFG.goalCash - s.cash);
      el('hud-objective').textContent = toGo > 0
        ? `Score $${CFG.goalCash.toLocaleString('en-US')} — ${fmt(toGo)} to go`
        : 'Score complete!';
      const rob = el('hud-rob');
      if (s.robTarget && s.robTarget.progress > 0.01) {
        rob.style.display = 'block';
        el('hud-rob-fill').style.width = Math.round(s.robTarget.progress * 100) + '%';
      } else {
        rob.style.display = 'none';
      }
      muteBtn.textContent = s.muted ? 'Sound: off' : 'Sound: on';
      title.style.display = s.screen === 'title' ? 'flex' : 'none';
      pause.style.display = s.screen === 'paused' ? 'flex' : 'none';
      busted.style.display = s.screen === 'busted' ? 'flex' : 'none';
      wasted.style.display = s.screen === 'wasted' ? 'flex' : 'none';
      win.style.display = s.screen === 'win' ? 'flex' : 'none';
      const best = el('title-best');
      if (best) best.textContent = s.best > 0 ? `Best score so far: ${fmt(s.best)}` : '';
      if (s.screen === 'busted') {
        el('busted-text').textContent = `The NBPD got you — they took ${fmt(s.bustedLost || 0)} of your cash.`;
      }
      if (s.screen === 'win') {
        el('win-cash').textContent = `You cleared ${fmt(s.cash)}!`;
        el('win-stats').textContent =
          `Robberies: ${s.robberies} · Cash bags: ${s.pickups} · Crimes: ${s.crimes} · Time: ${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`;
      }
    },
    bindMute(fn) { muteBtn.addEventListener('click', fn); },
  };
}
