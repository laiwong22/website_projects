/* Kaboom: original music and sound effects, synthesized with the Web Audio API (no audio files). */
(function () {
  'use strict';

  const S = (window.KBSound = {});
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let noiseBuf = null;
  let music = null;
  let muted = KB.store.get('kaboom.muted', false);
  const VOLUME = 0.9;

  const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  // Browsers only allow audio after a click or key press, so call this from one.
  S.unlock = function () {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.32;
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.8;
      sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  };

  S.isMuted = () => muted;
  S.setMuted = function (m) {
    muted = !!m;
    KB.store.set('kaboom.muted', muted);
    if (master) master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.03);
  };

  function tone(bus, o) {
    const start = o.start == null ? ctx.currentTime : o.start;
    const dur = o.dur || 0.15;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, start);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, start + dur);
    const vol = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + (o.attack || 0.005));
    if (o.hold) g.gain.setValueAtTime(vol, start + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  function noise(bus, o) {
    const start = o.start == null ? ctx.currentTime : o.start;
    const dur = o.dur || 0.1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'highpass';
    f.frequency.setValueAtTime(o.freq || 6000, start);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, start + dur);
    f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    const vol = o.vol || 0.1;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + (o.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(start, Math.random());
    src.stop(start + dur + 0.05);
  }

  // ---------- music: tiny step sequencer (16th-note steps) ----------
  const PATTERNS = {
    // Bouncy lobby loop: C - Am - F - G
    lobby: {
      bpm: 116,
      play(step, t, out, spb) {
        const chords = [
          [48, 52, 55],
          [45, 48, 52],
          [41, 45, 48],
          [43, 47, 50],
        ];
        const bar = Math.floor(step / 16) % 4;
        const s = step % 16;
        const ch = chords[bar];
        if (s === 0 || s === 6 || s === 8 || s === 14) tone(out, { freq: freq(ch[0] - 12), type: 'triangle', start: t, dur: spb * 2.2, vol: 0.5 });
        const arp = [0, 1, 2, 1];
        const note = ch[arp[s % 4]] + 24 + (s >= 8 && s % 4 === 2 ? 12 : 0);
        tone(out, { freq: freq(note), type: 'square', start: t, dur: spb * 0.9, vol: 0.07 });
        if (s === 0 || s === 8) tone(out, { freq: 140, slideTo: 45, type: 'sine', start: t, dur: 0.18, vol: 0.6 });
        if (s % 4 === 2) noise(out, { start: t, dur: 0.05, vol: 0.12, freq: 7000 });
        if (s === 4 || s === 12) noise(out, { start: t, dur: 0.12, vol: 0.12, filter: 'bandpass', freq: 1800, q: 0.8 });
        // a little hook every other pass
        if (Math.floor(step / 64) % 2 === 1) {
          const hook = { 0: 76, 3: 74, 6: 72, 8: 74, 10: 76, 12: 79 };
          if (hook[s] && bar % 2 === 0) tone(out, { freq: freq(hook[s] + (bar === 2 ? -3 : 0)), type: 'triangle', start: t, dur: spb * 2.5, vol: 0.13 });
        }
      },
    },
    // Tense question loop in A minor
    question: {
      bpm: 148,
      play(step, t, out, spb) {
        const s = step % 16;
        const bar = Math.floor(step / 16) % 2;
        if (s % 2 === 0) tone(out, { freq: freq(33), type: 'sawtooth', start: t, dur: spb * 1.6, vol: 0.18 });
        const line = bar === 0 ? [57, 64, 57, 65, 57, 64, 57, 62] : [57, 64, 57, 65, 57, 67, 65, 64];
        if (s % 2 === 0) tone(out, { freq: freq(line[s / 2] + 12), type: 'square', start: t, dur: spb * 1.2, vol: 0.06 });
        noise(out, { start: t, dur: 0.03, vol: s % 4 === 0 ? 0.09 : 0.04, freq: 8000 });
        if (s === 0 || s === 10) tone(out, { freq: 120, slideTo: 40, type: 'sine', start: t, dur: 0.16, vol: 0.55 });
      },
    },
  };

  S.music = function (name) {
    if (!ctx) return;
    if (music && music.name === name) return;
    S.stopMusic(0.15);
    const pat = PATTERNS[name];
    if (!pat) return;
    const gain = ctx.createGain();
    gain.connect(musicBus);
    const m = (music = { name, step: 0, next: ctx.currentTime + 0.08, gain });
    const spb = 60 / pat.bpm / 4;
    m.timer = setInterval(() => {
      while (m.next < ctx.currentTime + 0.15) {
        pat.play(m.step, m.next, gain, spb);
        m.step++;
        m.next += spb;
      }
    }, 25);
  };

  S.stopMusic = function (fade) {
    if (!music) return;
    const m = music;
    music = null;
    clearInterval(m.timer);
    m.gain.gain.setTargetAtTime(0, ctx.currentTime, (fade == null ? 0.3 : fade) / 3);
    setTimeout(() => m.gain.disconnect(), 1500);
  };

  // ---------- sound effects ----------
  const sfx = (fn) =>
    function () {
      if (!ctx || muted) return;
      fn.apply(null, arguments);
    };

  S.pop = sfx(() => {
    tone(sfxBus, { freq: 420 + Math.random() * 200, slideTo: 1300, type: 'sine', dur: 0.14, vol: 0.35 });
  });

  S.blip = sfx(() => {
    tone(sfxBus, { freq: 990, type: 'triangle', dur: 0.06, vol: 0.12 });
  });

  S.tick = sfx((urgent) => {
    tone(sfxBus, { freq: urgent ? 1700 : 1150, type: 'square', dur: 0.035, vol: urgent ? 0.14 : 0.07 });
    if (urgent) tone(sfxBus, { freq: 1700, type: 'square', start: ctx.currentTime + 0.12, dur: 0.03, vol: 0.08 });
  });

  S.whoosh = sfx(() => {
    noise(sfxBus, { dur: 0.45, vol: 0.25, filter: 'bandpass', freq: 300, freqTo: 3500, q: 1.2, attack: 0.15 });
  });

  S.boom = sfx(() => {
    const t = ctx.currentTime;
    noise(sfxBus, { start: t, dur: 1.6, vol: 1.0, filter: 'lowpass', freq: 5000, freqTo: 60, q: 0.5 });
    tone(sfxBus, { start: t, freq: 110, slideTo: 28, type: 'sine', dur: 1.0, vol: 0.95 });
    for (let i = 0; i < 9; i++) noise(sfxBus, { start: t + 0.15 + Math.random() * 0.9, dur: 0.04, vol: 0.15, freq: 4000 });
  });

  // Bazooka: a deep thump, then the rocket's whoosh.
  S.launch = sfx(() => {
    const t = ctx.currentTime;
    tone(sfxBus, { start: t, freq: 150, slideTo: 45, type: 'sine', dur: 0.22, vol: 0.7 });
    noise(sfxBus, { start: t, dur: 0.12, vol: 0.35, filter: 'lowpass', freq: 1200 });
    noise(sfxBus, { start: t + 0.03, dur: 0.5, vol: 0.22, filter: 'bandpass', freq: 500, freqTo: 3200, q: 1.4, attack: 0.08 });
  });

  S.smallBoom = sfx(() => {
    const t = ctx.currentTime;
    noise(sfxBus, { start: t, dur: 0.7, vol: 0.7, filter: 'lowpass', freq: 3500, freqTo: 90, q: 0.6 });
    tone(sfxBus, { start: t, freq: 95, slideTo: 35, type: 'sine', dur: 0.45, vol: 0.6 });
  });

  S.correct = sfx(() => {
    const t = ctx.currentTime;
    [72, 76, 79, 84].forEach((m, i) => tone(sfxBus, { start: t + i * 0.08, freq: freq(m), type: 'triangle', dur: 0.35, vol: 0.2 }));
  });

  S.drumroll = sfx((secs) => {
    const t = ctx.currentTime;
    const n = Math.floor((secs || 1.6) / 0.045);
    for (let i = 0; i < n; i++) noise(sfxBus, { start: t + i * 0.045, dur: 0.05, vol: 0.05 + (0.2 * i) / n, filter: 'bandpass', freq: 900, q: 0.6 });
  });

  S.reveal = sfx(() => {
    tone(sfxBus, { freq: 140, slideTo: 45, type: 'sine', dur: 0.3, vol: 0.8 });
    noise(sfxBus, { dur: 0.6, vol: 0.25, freq: 3000 });
  });

  S.fanfare = sfx(() => {
    const t = ctx.currentTime;
    const notes = [
      [67, 0, 0.16],
      [72, 0.16, 0.16],
      [76, 0.32, 0.16],
      [79, 0.48, 0.5],
      [76, 0.98, 0.16],
      [79, 1.14, 1.2],
    ];
    notes.forEach(([m, at, d]) => {
      tone(sfxBus, { start: t + at, freq: freq(m), type: 'square', dur: d + 0.1, vol: 0.12, hold: d * 0.7 });
      tone(sfxBus, { start: t + at, freq: freq(m - 12), type: 'triangle', dur: d + 0.1, vol: 0.2, hold: d * 0.7 });
    });
    [60, 64, 67].forEach((m) => tone(sfxBus, { start: t + 1.14, freq: freq(m), type: 'triangle', dur: 1.6, vol: 0.12, hold: 0.8 }));
  });
})();
