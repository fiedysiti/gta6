// Tiny WebAudio synth — no audio files. Engine hum, two-tone siren, blips, chime, thud.
export function createSound() {
  let ctx = null, muted = false;
  let engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenTimer = 0, sirenHigh = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 50;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineOsc.connect(engineGain); engineGain.connect(ctx.destination); engineOsc.start();
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'square'; sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(ctx.destination); sirenOsc.start();
      return true;
    } catch { return false; }
  }
  function blip(freq, dur, type = 'sine', vol = 0.15) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  }
  return {
    unlock() { ensure(); },
    toggleMute() { muted = !muted; if (engineGain) engineGain.gain.value = 0; if (sirenGain) sirenGain.gain.value = 0; return muted; },
    isMuted() { return muted; },
    update(dt, speed01, wanted) {
      if (!ctx || muted) return;
      if (engineGain) { engineGain.gain.value = 0.03 + speed01 * 0.05; engineOsc.frequency.value = 45 + speed01 * 90; }
      if (sirenGain) {
        sirenGain.gain.value = wanted > 0 ? 0.035 : 0;
        if (wanted > 0) {
          sirenTimer += dt;
          if (sirenTimer > 0.45) { sirenTimer = 0; sirenHigh = !sirenHigh; sirenOsc.frequency.value = sirenHigh ? 880 : 660; }
        }
      }
    },
    pickup() { blip(880, 0.12); setTimeout(() => blip(1320, 0.15), 70); },
    robbery() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.18), i * 90)); },
    punch() { blip(160, 0.12, 'square', 0.2); },
    crash() { blip(70, 0.25, 'sawtooth', 0.25); },
    busted() { [440, 349, 262].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.15), i * 160)); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.18), i * 110)); },
  };
}
