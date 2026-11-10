// Hari boss Charon: balapan jiwa antara Hermes dan Iris Express.
// Semua paket sama (jiwa). Pemain menghitung jiwa yang diantar; Iris menambah jiwa di interval acak.
// Pertama yang mencapai target menang. Kalau hari berakhir sebelum itu (waktu habis / pulang), Iris menang.

export class CharonRace {
  constructor(cfg, rng, bus) {
    this.cfg = cfg;
    this.rng = rng;
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.active = false;
    this.iris = 0;
    this.hermes = 0;
    this.winner = null;
    this.timer = 0;
  }

  start() {
    this.reset();
    this.active = true;
    this.timer = this.rng.range(...this.cfg.irisStartDelay);
  }

  get target() {
    return this.cfg.target;
  }

  update(dt, hermesSouls, hour) {
    if (!this.active || this.winner) return this.winner;
    this.hermes = hermesSouls;
    this.timer -= dt;
    while (this.timer <= 0 && !this.winner) {
      this.iris += 1;
      this.bus.emit('iris_soul', { iris: this.iris, hermes: this.hermes, hour });
      // Kadang Iris langsung dapat lagi supaya terasa kejar-kejaran.
      const burst = this.rng.chance(this.cfg.irisBurstChance);
      this.timer += burst ? 0.6 : this.rng.range(...this.cfg.irisInterval);
      if (this.iris >= this.target) this.winner = 'iris';
    }
    if (!this.winner && this.hermes >= this.target) this.winner = 'hermes';
    return this.winner;
  }
}
