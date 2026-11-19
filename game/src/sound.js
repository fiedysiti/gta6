// WebAudio synth sound — no audio files anywhere. Everything is an
// oscillator or a filtered noise burst built on the fly. The context is
// created lazily on the first user gesture (browsers block audio before
// one) and every method is a no-op until then, so headless runs and the
// screenshot stager never throw here.

export function createSound() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ensure() || !ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, cutoff) {
    if (!ensure() || !ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filt).connect(gain).connect(master);
    src.start();
  }

  return {
    unlock() { ensure(); },
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      if (master && ctx) master.gain.value = m ? 0 : 0.5;
    },
    // Continuous engine hum; pitch follows speed. Call every frame.
    engine(speed, driving) {
      if (!ensure() || !ctx) return;
      if (!driving) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.05;
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 500;
        engineOsc.connect(filt).connect(engineGain).connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + Math.abs(speed) * 4.2;
      engineGain.gain.value = 0.045 + Math.min(0.05, Math.abs(speed) * 0.0012);
    },
    // Two-tone siren while wanted. Call every frame with dt.
    siren(on, dt) {
      if (!ensure() || !ctx) return;
      if (!on) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.035;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
      }
      sirenTimer += dt;
      if (sirenTimer > 0.38) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 880 : 660;
      }
      sirenGain.gain.value = 0.035;
    },
    blip() { tone(920, 0.12, 'sine', 0.25, 0, 1400); },
    chime() {
      tone(660, 0.18, 'sine', 0.25);
      tone(880, 0.22, 'sine', 0.25, 0.12);
      tone(1320, 0.3, 'sine', 0.22, 0.24);
    },
    thud() { noiseBurst(0.22, 0.5, 320); tone(70, 0.2, 'sine', 0.4, 0, 40); },
    punch() { noiseBurst(0.1, 0.35, 900); },
    busted() { tone(392, 0.25, 'triangle', 0.3); tone(311, 0.4, 'triangle', 0.3, 0.25); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.28, i * 0.14));
    },
    wasted() { tone(220, 0.5, 'sawtooth', 0.25, 0, 110); tone(165, 0.7, 'sawtooth', 0.22, 0.3, 82); },
  };
}
