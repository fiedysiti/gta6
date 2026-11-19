// DOM HUD: cash, wanted stars, health bar, speed, objective, toasts, and the
// title / pause / busted / wasted / win screens. Text is only rewritten on change.
import { GOAL_CASH } from './config.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    hud: $('hud'), cash: $('hud-cash'), stars: $('hud-stars'), hpFill: $('hud-hp-fill'), hpText: $('hud-hp'),
    speed: $('hud-speed'), objective: $('hud-objective'), toast: $('hud-toast'),
    robbery: $('hud-robbery'), robberyFill: $('hud-robbery-fill'),
    start: $('screen-start'), pause: $('screen-pause'), end: $('screen-end'),
    endTitle: $('end-title'), endLines: $('end-lines'), endPrompt: $('end-prompt'),
    best: $('start-best'), mute: $('hud-mute'),
  };
  const cache = {};
  function set(el, key, value) { if (cache[key] !== value) { cache[key] = value; el.textContent = value; } }
  let toastTimer = null;
  return {
    update(state) {
      set(els.cash, 'cash', '$' + state.cash.toLocaleString('en-US'));
      set(els.stars, 'stars', '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted));
      els.stars.style.color = state.wanted > 0 ? '#ff4040' : '#ffd23f';
      els.hpFill.style.width = Math.max(0, state.hp) + '%';
      els.hpFill.style.background = state.hp > 50 ? '#2fae5f' : state.hp > 25 ? '#e0a040' : '#d94040';
      set(els.hpText, 'hp', 'HP ' + Math.max(0, Math.ceil(state.hp)));
      const kmh = state.player.onFoot ? 0 : Math.round(Math.abs(state.player.car.speed) * 3.6);
      set(els.speed, 'speed', state.player.onFoot ? '' : kmh + ' km/h');
      const remaining = Math.max(0, GOAL_CASH - state.cash);
      const robbed = state.missions.missions.filter((m) => m.robbed).length;
      set(els.objective, 'obj',
        remaining > 0
          ? `GOAL: reach $${GOAL_CASH.toLocaleString('en-US')} — $${remaining.toLocaleString('en-US')} to go  •  Robberies ${robbed}/3`
          : 'GOAL COMPLETE!');
      const near = state.nearMission;
      if (near && !near.mission.robbed && state.player.onFoot) {
        els.robbery.style.display = 'block';
        els.robberyFill.style.width = Math.round(near.mission.progress * 100) + '%';
      } else els.robbery.style.display = 'none';
    },
    toast(msg) {
      els.toast.textContent = msg;
      els.toast.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { els.toast.style.opacity = '0'; }, 2600);
    },
    show(screen, data = {}) {
      els.hud.classList.toggle('on', screen !== 'title');
      els.start.style.display = screen === 'title' ? 'flex' : 'none';
      els.pause.style.display = screen === 'paused' ? 'flex' : 'none';
      els.end.style.display = ['busted', 'wasted', 'win'].includes(screen) ? 'flex' : 'none';
      if (screen === 'title') set(els.best, 'best', data.best > 0 ? `Best cash: $${data.best.toLocaleString('en-US')}` : '');
      if (screen === 'busted' || screen === 'wasted' || screen === 'win') {
        els.endTitle.textContent = screen === 'busted' ? 'BUSTED' : screen === 'wasted' ? 'WASTED' : 'SCORE COMPLETE';
        els.endTitle.style.color = screen === 'win' ? '#2fae5f' : '#ff4040';
        els.endLines.innerHTML = data.lines.map((l) => `<div>${l}</div>`).join('');
        els.endPrompt.textContent = 'Press Enter to play again';
      }
    },
    setMute(muted) { els.mute.textContent = muted ? '🔇 Muted (M)' : '🔊 Sound (M)'; },
  };
}
