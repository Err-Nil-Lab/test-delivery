// Suara mesin van yang terus menyala: pitch & volume ikut kecepatan, tersendat saat rusak berat,
// hampir hilang saat melayang. Plus decit ban saat van tergelincir ke samping.
import { loopNoise } from './synth.js';

export class EngineSound {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 500;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.sub = ctx.createOscillator();
    this.sub.type = 'square';
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    this.osc.connect(this.filter);
    this.sub.connect(subGain).connect(this.filter);
    this.filter.connect(this.gain).connect(out);
    this.osc.start();
    this.sub.start();
    this.skid = loopNoise(ctx, out, { filter: 'bandpass', freq: 1800, q: 6 });
    this.sputter = 0;
  }

  update(dt, { car, damageState, active }) {
    const now = this.ctx.currentTime;
    const ratio = Math.min(1, car.speed / 22) + (car.boostTime > 0 ? 0.25 : 0); // turbo: mesin meraung
    // Rusak berat: mesin sesekali tersendat.
    this.sputter = Math.max(0, this.sputter - dt);
    if (damageState === 3 && Math.random() < dt * 1.5) this.sputter = 0.12;
    const freq = 40 + ratio * 85 - (this.sputter > 0 ? 20 : 0);
    this.osc.frequency.setTargetAtTime(freq, now, 0.05);
    this.sub.frequency.setTargetAtTime(freq / 2, now, 0.05);
    this.filter.frequency.setTargetAtTime(350 + ratio * 900, now, 0.08);
    const target = !active ? 0 : car.airborne ? 0.015 : this.sputter > 0 ? 0.01 : 0.05 + ratio * 0.06;
    this.gain.gain.setTargetAtTime(target, now, 0.06);

    const lateral = Math.abs(car.vx * -Math.cos(car.heading) + car.vz * Math.sin(car.heading));
    const squeal = car.drifting || (car.handbrake && car.speed > 4) ? 0.06 : 0;
    const skid = active && !car.airborne ? Math.min(1, Math.max(0, (lateral - 4) / 8)) * 0.1 + squeal : 0;
    this.skid.gain.setTargetAtTime(skid, now, 0.04);
  }
}
