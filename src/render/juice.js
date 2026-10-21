// Juice: camera shake berbasis "trauma", hitstop (simulasi berhenti sesaat), dan zoom kick.
// Tidak bergantung pada three.js supaya bisa dites.

export class Juice {
  constructor(cfg, { calm = false } = {}) {
    this.cfg = cfg;
    this.calm = calm;
    this.trauma = 0;
    this.freeze = 0;
    this.zoom = 0;
    this.time = 0;
  }

  shake(amount) {
    if (this.calm) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  hitstop(seconds) {
    this.freeze = Math.max(this.freeze, seconds);
  }

  kick(amount) {
    if (this.calm) return;
    this.zoom = Math.min(this.cfg.maxZoomKick, this.zoom + amount);
  }

  update(dt) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * this.cfg.traumaDecay);
    this.zoom *= Math.exp(-8 * dt);
  }

  // Berapa detik simulasi yang boleh berjalan di frame ini (0 selama hitstop).
  simDelta(dt) {
    if (this.freeze <= 0) return dt;
    this.freeze -= dt;
    return 0;
  }

  // Offset kamera: kuadrat trauma supaya guncangan kecil tetap halus.
  get offset() {
    const s = this.trauma * this.trauma * this.cfg.maxShake;
    const t = this.time * 30;
    return {
      x: s * (Math.sin(t * 1.1) * 0.6 + Math.sin(t * 2.3 + 1) * 0.4),
      z: s * (Math.sin(t * 1.7 + 2) * 0.6 + Math.sin(t * 2.9) * 0.4),
    };
  }
}
