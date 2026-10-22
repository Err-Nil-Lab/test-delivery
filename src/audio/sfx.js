// Resep SFX sintesis + pemetaan event bus → SFX.
// Setiap resep: (ctx, out, opts) => void. Tidak ada file aset.
import { tone, noise, arpeggio, midi } from './synth.js';

export const SFX = {
  // ---------- Paket ----------
  pickup: (c, o) => {
    tone(c, o, { freq: 380, freqEnd: 760, type: 'triangle', dur: 0.12, gain: 0.25 });
    noise(c, o, { dur: 0.08, gain: 0.12, filter: 'lowpass', freq: 600, delay: 0.02 }); // kardus
  },
  deliver: (c, o) => arpeggio(c, o, [midi(76), midi(81), midi(88)], { type: 'square', dur: 0.12, gain: 0.12, step: 0.06 }),
  cargoFull: (c, o) => tone(c, o, { freq: 140, type: 'square', dur: 0.18, gain: 0.15 }),
  expired: (c, o) => noise(c, o, { dur: 0.25, gain: 0.12, filter: 'highpass', freq: 2000, freqEnd: 600 }),

  // ---------- Benturan ----------
  bump: (c, o, { strength = 0.5 } = {}) => {
    noise(c, o, { dur: 0.15 + strength * 0.2, gain: 0.25 + strength * 0.35, filter: 'lowpass', freq: 500, freqEnd: 120 });
    tone(c, o, { freq: 110, freqEnd: 50, type: 'sine', dur: 0.18, gain: 0.3 * strength });
    if (strength > 0.6) noise(c, o, { dur: 0.25, gain: 0.12, filter: 'highpass', freq: 3500, delay: 0.02 }); // kaca/logam
  },
  driftStart: (c, o) => {
    noise(c, o, { dur: 0.3, gain: 0.12, filter: 'bandpass', freq: 2400, freqEnd: 1500, q: 8 }); // decit ban
    tone(c, o, { freq: 520, freqEnd: 880, type: 'triangle', dur: 0.12, gain: 0.06, delay: 0.05 }); // "wii!"
  },
  turbo: (c, o, { tier = 0 } = {}) => {
    noise(c, o, { dur: 0.5, gain: 0.18, filter: 'bandpass', freq: 500, freqEnd: 3000, q: 1.5 }); // whoosh
    arpeggio(c, o, (tier ? [64, 69, 73, 76] : [69, 76]).map((n) => midi(n)), { type: 'square', dur: 0.08, gain: 0.07, step: 0.045 });
  },
  // ---------- Penghuni map ----------
  honk: (c, o, { rival = false } = {}) => {
    const f = rival ? 660 : 420;
    for (const d of [0, rival ? 0.14 : 0.17]) {
      tone(c, o, { freq: f, type: 'square', dur: rival ? 0.09 : 0.13, gain: 0.07, delay: d });
      tone(c, o, { freq: f * 1.26, type: 'square', dur: rival ? 0.09 : 0.13, gain: 0.05, delay: d });
    }
    if (rival) tone(c, o, { freq: f * 1.5, type: 'square', dur: 0.09, gain: 0.06, delay: 0.28 });
  },
  angryHonk: (c, o) => {
    tone(c, o, { freq: 380, type: 'square', dur: 0.7, attack: 0.01, gain: 0.08 });
    tone(c, o, { freq: 479, type: 'square', dur: 0.7, attack: 0.01, gain: 0.06 });
  },
  scream: (c, o) => tone(c, o, { freq: 900 + Math.random() * 300, freqEnd: 420, type: 'triangle', dur: 0.45, attack: 0.02, gain: 0.09, detune: 30 }),
  baa: (c, o) => {
    const t = c.currentTime;
    const osc = c.createOscillator();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    const g = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 280 + Math.random() * 60;
    lfo.frequency.value = 24;
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain).connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    osc.connect(f).connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.6);
    lfo.stop(t + 0.6);
  },
  cluck: (c, o) => [0, 0.09, 0.2].forEach((d) => tone(c, o, { freq: 1100, freqEnd: 600, type: 'square', dur: 0.04, gain: 0.05, delay: d })),
  flap: (c, o) => [0, 0.07, 0.15, 0.24].forEach((d) => noise(c, o, { dur: 0.06, gain: 0.08, filter: 'bandpass', freq: 900, q: 1.5, delay: d })),
  takeoff: (c, o) => noise(c, o, { dur: 0.35, gain: 0.1, filter: 'bandpass', freq: 400, freqEnd: 1600, q: 2 }),
  landing: (c, o, { strength = 0.5 } = {}) => {
    tone(c, o, { freq: 90, freqEnd: 40, dur: 0.25, gain: 0.4 * strength + 0.1 });
    noise(c, o, { dur: 0.3, gain: 0.3 * strength, filter: 'lowpass', freq: 900, freqEnd: 200, delay: 0.01 });
  },

  // ---------- Petir ----------
  thunder: (c, o, { near = 1 } = {}) => {
    noise(c, o, { dur: 0.08, gain: 0.45 * near, filter: 'highpass', freq: 2500 }); // crack
    noise(c, o, { dur: 1.2, attack: 0.03, gain: 0.35 * near + 0.05, filter: 'lowpass', freq: 400, freqEnd: 60, delay: 0.03 }); // rumble
  },
  shieldDing: (c, o) => arpeggio(c, o, [midi(88), midi(95)], { type: 'sine', dur: 0.4, gain: 0.15, step: 0.04 }),

  // ---------- Blessing & curse ----------
  blessingGained: (c, o) => [60, 64, 67, 72].forEach((n, i) => tone(c, o, { freq: midi(n + 12), type: 'triangle', dur: 0.8, attack: 0.08, gain: 0.08, delay: i * 0.05 })),
  blessingLost: (c, o) => {
    [72, 67, 63, 60].forEach((n, i) => tone(c, o, { freq: midi(n), freqEnd: midi(n - 5), type: 'triangle', dur: 0.5, gain: 0.1, delay: i * 0.12 }));
    noise(c, o, { dur: 0.4, gain: 0.12, filter: 'bandpass', freq: 800, freqEnd: 200, delay: 0.45 }); // pfft
  },
  curseGained: (c, o, { curse } = {}) => CURSE_RIFF[curse]?.(c, o),
  curseLifted: (c, o) => arpeggio(c, o, [midi(72), midi(76), midi(79), midi(84)], { type: 'sine', dur: 0.35, gain: 0.12, step: 0.07 }),
  hiccup: (c, o) => tone(c, o, { freq: 300, freqEnd: 700, type: 'square', dur: 0.06, gain: 0.12 }),
  tick: (c, o) => tone(c, o, { freq: 2200, type: 'square', dur: 0.02, gain: 0.05 }),

  // ---------- Minotaur ----------
  snort: (c, o) => {
    noise(c, o, { dur: 0.25, gain: 0.25, filter: 'bandpass', freq: 300, q: 3 });
    noise(c, o, { dur: 0.15, gain: 0.15, filter: 'highpass', freq: 1800, delay: 0.3 }); // gesek kuku
  },
  stampede: (c, o) => [0, 0.12, 0.24, 0.36].forEach((d) => tone(c, o, { freq: 70, freqEnd: 45, dur: 0.08, gain: 0.25, delay: d })),
  ram: (c, o) => {
    SFX.bump(c, o, { strength: 1 });
    tone(c, o, { freq: 180, freqEnd: 120, type: 'sawtooth', dur: 0.6, attack: 0.05, gain: 0.08, delay: 0.15 }); // moo
  },
  aww: (c, o) => tone(c, o, { freq: 400, freqEnd: 900, type: 'triangle', dur: 0.4, gain: 0.12 }),
  boop: (c, o) => tone(c, o, { freq: 600, freqEnd: 400, type: 'sine', dur: 0.1, gain: 0.15 }),

  // ---------- Selundupan ----------
  jackpot: (c, o) => arpeggio(c, o, [midi(72), midi(76), midi(79), midi(84), midi(88)], { type: 'square', dur: 0.15, gain: 0.1, step: 0.05 }),
  explosion: (c, o) => {
    noise(c, o, { dur: 0.25, gain: 0.08, filter: 'highpass', freq: 4000 }); // sekring
    noise(c, o, { dur: 1.4, attack: 0.01, gain: 0.6, filter: 'lowpass', freq: 1200, freqEnd: 50, delay: 0.25 });
    tone(c, o, { freq: 80, freqEnd: 30, dur: 0.6, gain: 0.5, delay: 0.25 });
  },

  // ---------- Hari ----------
  dawn: (c, o) => arpeggio(c, o, [midi(62), midi(69), midi(74)], { type: 'triangle', dur: 0.3, gain: 0.1, step: 0.12 }),
  gong: (c, o) => [55, 110.5, 166, 221].forEach((f, i) => tone(c, o, { freq: f, dur: 2.5, attack: 0.01, gain: 0.12 / (i + 1) })),
  siren: (c, o) => [0, 0.5, 1].forEach((d) => tone(c, o, { freq: 500, freqEnd: 900, type: 'sawtooth', dur: 0.45, gain: 0.06, delay: d })),
  reportTick: (c, o) => tone(c, o, { freq: 1400, type: 'square', dur: 0.03, gain: 0.05 }),
  fanfare: (c, o) => arpeggio(c, o, [midi(67), midi(72), midi(76), midi(79)], { type: 'square', dur: 0.25, gain: 0.1, step: 0.12 }),
  sadTrombone: (c, o) => [65, 64, 63].forEach((n, i) => tone(c, o, { freq: midi(n - 12), freqEnd: midi(n - 13 - (i === 2 ? 2 : 0)), type: 'sawtooth', dur: i === 2 ? 0.9 : 0.35, gain: 0.1, delay: i * 0.4 })),
  uiClick: (c, o) => tone(c, o, { freq: 900, type: 'triangle', dur: 0.04, gain: 0.08 }),
  alert: (c, o) => tone(c, o, { freq: 1200, type: 'square', dur: 0.08, gain: 0.07 }),
};

// Riff khas tiap dewa saat curse didapat.
const CURSE_RIFF = {
  dionysus: (c, o) => {
    arpeggio(c, o, [midi(64), midi(67), midi(71)], { type: 'triangle', dur: 0.2, gain: 0.1, step: 0.1, detune: 40 });
    SFX.hiccup(c, o);
  },
  chronos: (c, o) => [0, 0.15, 0.3, 0.45].forEach((d, i) => tone(c, o, { freq: i % 2 ? 1800 : 2400, type: 'square', dur: 0.03, gain: 0.08, delay: d })),
  hades: (c, o) => tone(c, o, { freq: 55, freqEnd: 40, type: 'sawtooth', dur: 1.2, attack: 0.1, gain: 0.15 }),
  aphrodite: (c, o) => arpeggio(c, o, [midi(72), midi(76), midi(79), midi(83), midi(86)], { type: 'sine', dur: 0.4, gain: 0.08, step: 0.05 }),
  ares: (c, o) => arpeggio(c, o, [midi(60), midi(60), midi(67)], { type: 'sawtooth', dur: 0.18, gain: 0.1, step: 0.15 }),
};

// Event bus → SFX. Mengembalikan { name, opts } atau null.
// Suara penghuni map hanya terdengar di dekat van; makin jauh makin pelan.
function near(e, game, sfx) {
  const r = game.cfg.npc?.soundRadius ?? 45;
  const d = Math.hypot(e.x - game.car.x, e.z - game.car.z);
  if (d > r) return null;
  return { ...sfx, opts: { ...sfx.opts, vol: 1 - (d / r) * 0.8 } };
}

export const EVENT_SFX = {
  pickup: () => ({ name: 'pickup' }),
  deliver: () => ({ name: 'deliver' }),
  cargo_full: () => ({ name: 'cargoFull' }),
  package_expired: () => ({ name: 'expired' }),
  collision: ({ impact }) => ({ name: 'bump', opts: { strength: Math.min(1, impact / 18) } }),
  hard_landing: ({ fallSpeed }) => ({ name: 'landing', opts: { strength: Math.min(1, fallSpeed / 16) } }),
  strike: (s, game) => {
    const d = Math.hypot(s.x - game.car.x, s.z - game.car.z);
    if (s.blocked) return { name: 'shieldDing' };
    if (d > 70) return null;
    return { name: 'thunder', opts: { near: s.hit ? 1 : Math.max(0.15, 1 - d / 70) } };
  },
  blessing_gained: () => ({ name: 'blessingGained' }),
  blessing_lost: () => ({ name: 'blessingLost' }),
  curse_gained: ({ curse }) => ({ name: 'curseGained', opts: { curse } }),
  curse_lifted: () => ({ name: 'curseLifted' }),
  smuggle_resolved: ({ scam }) => ({ name: scam ? 'explosion' : 'jackpot' }),
  minotaur_windup: () => ({ name: 'snort' }),
  minotaur_charge: () => ({ name: 'stampede' }),
  minotaur_hit: () => ({ name: 'ram' }),
  minotaur_charmed: () => ({ name: 'aww' }),
  minotaur_nudge: () => ({ name: 'boop' }),
  day_start: () => ({ name: 'dawn' }),
  phase: ({ phase }) => (phase === 'dusk' ? { name: 'gong' } : phase === 'storm' ? { name: 'siren' } : null),
  early_end_requested: () => ({ name: 'alert' }),
  hiccup: () => ({ name: 'hiccup' }),
  takeoff: () => ({ name: 'takeoff' }),
  drift_start: () => ({ name: 'driftStart' }),
  npc_honk: (e, game) => near(e, game, { name: 'honk', opts: { rival: e.kind === 'rival' } }),
  npc_bumped: (e, game) => near(e, game, { name: 'angryHonk' }),
  npc_dodge: (e, game) => near(e, game, { name: { person: 'scream', sheep: 'baa', goat: 'baa', chicken: 'cluck' }[e.kind] ?? 'scream' }),
  npc_zapped: (e, game) => (e.kind === 'sheep' || e.kind === 'goat' ? near(e, game, { name: 'baa' }) : null),
  drift_boost: ({ tier }) => ({ name: 'turbo', opts: { tier } }),
};
