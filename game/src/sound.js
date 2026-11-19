// Recovery note: every sound in the game is synthesized here in code — engine, siren, chimes — with no audio files at all.
// WebAudio synth sound — no audio files anywhere. Everything is an
// oscillator or a filtered noise burst built on the fly. The context is
// created lazily on the first user gesture (browsers block audio before
// one) and every method is a no-op until then, so headless runs and the
// screenshot stager never throw here.

import { CFG } from './config.js';

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
  // Procedural music loop state (see music()).
  let musicGain = null;
  let musicNextTime = 0;
  let musicStep = 0;
  let musicWasOn = false;
  let lastSkidTime = -1;

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

  // ---- Procedural music ------------------------------------------------
  // Am – F – C – G, one bar per chord. Roots: A2 110, F2 87.31,
  // C3 130.81, G2 98 Hz; chord tones are the root + third + fifth.
  const MUSIC_CHORDS = [
    { root: 110.00, tones: [110.00, 130.81, 164.81] }, // Am
    { root: 87.31, tones: [87.31, 110.00, 130.81] }, // F
    { root: 130.81, tones: [130.81, 164.81, 196.00] }, // C
    { root: 98.00, tones: [98.00, 123.47, 146.83] }, // G
  ];

  // One music note scheduled at an absolute ctx time, routed through
  // the music bus so muting the loop silences already-queued notes too.
  function musicTone(freq, dur, type, vol, t0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(musicGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // One 8th-note step: a soft pad on steps 0 and 4, the root bass on
  // step 0, and a short walk up to the fifth on step 6.
  function scheduleMusicStep(step, t0, stepDur) {
    const chord = MUSIC_CHORDS[Math.floor(step / 8) % MUSIC_CHORDS.length];
    const s = step % 8;
    if (s === 0 || s === 4) {
      for (const f of chord.tones) musicTone(f, stepDur * 3.4, 'triangle', 0.5, t0);
    }
    if (s === 0) musicTone(chord.root, stepDur * 3.5, 'sine', 0.8, t0);
    if (s === 6) musicTone(chord.root * 1.5, stepDur * 1.5, 'sine', 0.5, t0);
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
    // Quiet procedural loop (Am–F–C–G) at CFG.musicBpm. Call every
    // frame; a lookahead scheduler queues 8th-note steps slightly ahead
    // of ctx.currentTime. Off ramps the music bus to 0 and schedules
    // nothing more, so already-queued notes fade out.
    music(on, dt) {
      if (!ensure() || !ctx) return;
      if (!musicGain) {
        musicGain = ctx.createGain();
        musicGain.gain.value = 0;
        musicGain.connect(master);
      }
      if (!on) {
        if (musicWasOn) {
          musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
          musicWasOn = false;
        }
        return;
      }
      musicGain.gain.setTargetAtTime(CFG.musicVolume, ctx.currentTime, 0.1);
      if (!musicWasOn) {
        // (Re)starting: schedule from now, never a backlog of missed steps.
        musicNextTime = ctx.currentTime + 0.05;
        musicWasOn = true;
      }
      const stepDur = 60 / CFG.musicBpm / 2;
      while (musicNextTime < ctx.currentTime + 0.12) {
        scheduleMusicStep(musicStep, musicNextTime, stepDur);
        musicStep += 1;
        musicNextTime += stepDur;
      }
    },
    // Short filtered tyre squeal; throttled to at most once per 0.4 s.
    skid() {
      if (!ensure() || !ctx) return;
      if (ctx.currentTime - lastSkidTime < 0.4) return;
      lastSkidTime = ctx.currentTime;
      noiseBurst(0.18, 0.2, 1200);
    },
    // Two-tone car horn: 370 Hz + 466 Hz square waves, 0.25 s.
    // 0.12 each so the pair sits just above the engine, not over it.
    horn() {
      if (!ensure() || !ctx) return;
      tone(370, 0.25, 'square', 0.12);
      tone(466, 0.25, 'square', 0.12);
    },
    // Very short low thud for a walking footstep.
    footstep() {
      if (!ensure() || !ctx) return;
      noiseBurst(0.05, 0.12, 400);
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
