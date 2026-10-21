// Musik prosedural: step sequencer 16-an dengan nuansa Yunani (Dorian siang, Phrygian senja/badai).
// Suasana berubah per fase: siang riang, senja pelan & minor, badai cepat & tegang.
// Hades menggelapkan (lowpass), Dionysus membuat nada sedikit fals (detune).
import { tone, noise, midi } from './synth.js';

const MOODS = {
  day: { bpm: 112, scale: [0, 2, 3, 5, 7, 9, 10], roots: [0, 5, 0, -2], arp: 0.7, hat: true, kick: [0, 8], snare: [], bassEvery: 4 },
  dusk: { bpm: 92, scale: [0, 1, 3, 5, 7, 8, 10], roots: [0, -2, -4, -2], arp: 0.4, hat: false, kick: [0], snare: [8], bassEvery: 8 },
  storm: { bpm: 140, scale: [0, 1, 3, 5, 7, 8, 10], roots: [0, 0, 1, 0], arp: 0.8, hat: true, kick: [0, 4, 8, 12], snare: [4, 12], bassEvery: 2 },
};
const KEY = 50; // D3

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 12000;
    this.bus = ctx.createGain();
    this.bus.connect(this.filter).connect(out);
    this.mood = null;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.arpIndex = 2;
    this.drunk = false;
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.bus.gain.setTargetAtTime(mood ? 1 : 0, this.ctx.currentTime, 0.4);
  }

  setModifiers({ dark, drunk }) {
    this.filter.frequency.setTargetAtTime(dark ? 650 : 12000, this.ctx.currentTime, 0.3);
    this.drunk = drunk;
  }

  update() {
    const m = MOODS[this.mood];
    if (!m) {
      this.nextTime = this.ctx.currentTime + 0.1;
      return;
    }
    const stepDur = 60 / m.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.schedule(m, this.step, this.nextTime - this.ctx.currentTime);
      this.nextTime += stepDur;
      this.step += 1;
    }
  }

  schedule(m, step, delay) {
    const c = this.ctx;
    const o = this.bus;
    const s = step % 16;
    const root = KEY + m.roots[Math.floor(step / 16) % m.roots.length];
    const detune = this.drunk ? Math.sin(step * 0.7) * 35 : 0;
    if (m.kick.includes(s)) tone(c, o, { freq: 120, freqEnd: 45, dur: 0.12, gain: 0.25, delay });
    if (m.snare.includes(s)) noise(c, o, { dur: 0.1, gain: 0.08, filter: 'bandpass', freq: 1800, delay });
    if (m.hat && s % 2 === 1) noise(c, o, { dur: 0.03, gain: 0.03, filter: 'highpass', freq: 7000, delay });
    if (s % m.bassEvery === 0) tone(c, o, { freq: midi(root - 12 + (s === 8 ? 7 : 0)), type: 'triangle', dur: 0.18, gain: 0.12, delay, detune });
    // Arpeggio: random walk di skala, deterministik dari nomor step.
    if (s % 2 === 0 && Math.abs(Math.sin(step * 12.9898) * 43758.5453) % 1 < m.arp) {
      const move = Math.floor(Math.abs(Math.sin(step * 78.233) * 9631.3) % 3) - 1;
      this.arpIndex = Math.max(0, Math.min(m.scale.length * 2 - 1, this.arpIndex + move));
      const note = root + 12 + m.scale[this.arpIndex % m.scale.length] + 12 * Math.floor(this.arpIndex / m.scale.length);
      tone(c, o, { freq: midi(note), type: 'square', dur: 0.1, gain: 0.035, delay, detune });
    }
  }
}
