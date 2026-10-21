import { describe, expect, it } from 'vitest';
import { SFX, EVENT_SFX } from '../src/audio/sfx.js';
import { Music } from '../src/audio/music.js';
import { CURSE_IDS } from '../src/sim/curses.js';
import { newGame } from './helpers.js';

// AudioContext tiruan yang cukup untuk menjalankan semua resep tanpa speaker.
function fakeContext() {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {} });
  const node = (extra = {}) => ({ connect: (n) => n, ...extra });
  const nodes = [];
  const ctx = {
    currentTime: 1,
    sampleRate: 8000,
    nodes,
    createOscillator: () => {
      const n = node({ type: '', frequency: param(), detune: param(), start() {}, stop() {} });
      nodes.push(n);
      return n;
    },
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => {
      const n = node({ buffer: null, loop: false, start() {}, stop() {} });
      nodes.push(n);
      return n;
    },
  };
  return ctx;
}

describe('SFX', () => {
  it('setiap event penting punya suara', () => {
    const important = [
      'pickup', 'deliver', 'collision', 'hard_landing', 'strike', 'blessing_lost', 'curse_gained', 'curse_lifted',
      'smuggle_resolved', 'minotaur_windup', 'minotaur_hit', 'phase',
    ];
    for (const e of important) expect(EVENT_SFX[e], e).toBeTypeOf('function');
  });

  it('pemetaan event selalu menunjuk resep yang ada', () => {
    const game = newGame();
    const samples = {
      collision: { impact: 15 },
      hard_landing: { fallSpeed: 12 },
      strike: { x: game.car.x, z: game.car.z, hit: true, blocked: false },
      curse_gained: { curse: 'hades' },
      smuggle_resolved: { scam: true },
      phase: { phase: 'storm' },
    };
    for (const [event, pick] of Object.entries(EVENT_SFX)) {
      const sfx = pick(samples[event] ?? {}, game);
      if (sfx) expect(SFX[sfx.name], `${event} → ${sfx.name}`).toBeTypeOf('function');
    }
  });

  it('semua resep bisa dimainkan tanpa error dan benar-benar membuat suara', () => {
    for (const [name, recipe] of Object.entries(SFX)) {
      const ctx = fakeContext();
      recipe(ctx, ctx.createGain(), { strength: 0.8, near: 0.5, curse: 'dionysus' });
      expect(ctx.nodes.length, name).toBeGreaterThan(0);
    }
    for (const curse of CURSE_IDS) {
      const ctx = fakeContext();
      SFX.curseGained(ctx, ctx.createGain(), { curse });
      expect(ctx.nodes.length, curse).toBeGreaterThan(0);
    }
  });

  it('musik menjadwalkan nada di tiap suasana', () => {
    for (const mood of ['day', 'dusk', 'storm']) {
      const ctx = fakeContext();
      const music = new Music(ctx, ctx.createGain());
      music.setMood(mood);
      for (let i = 0; i < 20; i++) {
        ctx.currentTime += 0.1;
        music.update();
      }
      expect(ctx.nodes.length, mood).toBeGreaterThan(5);
    }
  });
});
