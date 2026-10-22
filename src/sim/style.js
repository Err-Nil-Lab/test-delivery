// Bonus gaya: aksi berani dibayar sebagai tip.
// - DRIFT (drift cukup lama), NYARIS! (petir jatuh dekat tapi meleset), NYALIP TIPIS (lewat dekat mobil NPC
//   dengan kecepatan tinggi), TERBANG (melayang dari undakan), OLÉ! (seruduk Minotaur meleset tipis).
// Aksi beruntun dalam comboWindow detik menaikkan pengali. Combo dibayar saat jendela habis,
// dan HANGUS kalau van kena damage sebelum itu (risiko vs hadiah).

const NAMES = { drift: 'DRIFT', nearMiss: 'NYARIS!', closePass: 'NYALIP TIPIS', air: 'TERBANG', ole: 'OLÉ!' };

export class StyleSystem {
  constructor(cfg, bus) {
    this.cfg = cfg;
    this.bus = bus;
    this.reset();
    const on = (e, fn) => bus.on(e, (p) => this.cfg.enabled && this.active && fn(p));
    on('drift_end', ({ seconds }) => {
      if (seconds >= cfg.drift.minSeconds) this.trick('drift', Math.round(seconds * cfg.drift.perSecond));
    });
    on('strike', (s) => {
      if (s.hit || s.kind === 'ambient' || !this.car || this.car.speed < cfg.nearMiss.minSpeed) return;
      if (Math.hypot(s.x - this.car.x, s.z - this.car.z) <= cfg.nearMiss.radius + (s.radius ?? 0)) this.trick('nearMiss', cfg.nearMiss.value);
    });
    on('minotaur_miss', ({ closest }) => {
      if (closest <= cfg.ole.radius) this.trick('ole', cfg.ole.value);
    });
    // Kena damage: combo hangus.
    for (const e of ['collision', 'hard_landing', 'minotaur_hit', 'smuggle_resolved', 'strike_hit']) {
      on(e, (p) => {
        if (e === 'strike_hit' && p.blocked) return;
        if (e === 'smuggle_resolved' && !p.scam) return;
        this.drop();
      });
    }
  }

  reset() {
    this.tips = 0; // total tip hari ini (sudah dibayar)
    this.combo = null; // { tricks: [{ kind, name, value }], total, timer }
    this.passCooldown = new Map();
    this.airTime = 0;
    this.active = true;
  }

  get multiplier() {
    if (!this.combo) return 1;
    return Math.min(this.cfg.maxMult, 1 + this.cfg.multStep * (this.combo.tricks.length - 1));
  }

  trick(kind, value) {
    if (value <= 0) return;
    if (!this.combo) this.combo = { tricks: [], total: 0, timer: 0 };
    this.combo.tricks.push({ kind, name: NAMES[kind], value });
    this.combo.total += value;
    this.combo.timer = this.cfg.comboWindow;
    this.bus.emit('style_trick', { kind, name: NAMES[kind], value, count: this.combo.tricks.length, mult: this.multiplier });
  }

  bank() {
    if (!this.combo) return 0;
    const tip = Math.round(this.combo.total * this.multiplier);
    this.tips += tip;
    this.bus.emit('style_banked', { tip, count: this.combo.tricks.length, mult: this.multiplier });
    this.combo = null;
    return tip;
  }

  drop() {
    if (!this.combo) return;
    const lost = Math.round(this.combo.total * this.multiplier);
    this.bus.emit('style_dropped', { lost, count: this.combo.tricks.length });
    this.combo = null;
  }

  // ctx: { car, npcCars }
  update(dt, { car, npcCars = [] }) {
    this.car = car;
    if (!this.cfg.enabled) return;
    // Terbang: dihitung saat mendarat.
    if (car.airborne) this.airTime += dt;
    else if (this.airTime > 0) {
      if (this.airTime >= this.cfg.air.minSeconds) this.trick('air', Math.round(this.airTime * this.cfg.air.perSecond));
      this.airTime = 0;
    }
    // Lewat tipis di samping mobil NPC dengan kecepatan tinggi.
    const cp = this.cfg.closePass;
    for (const [k, v] of this.passCooldown) {
      if (v <= dt) this.passCooldown.delete(k);
      else this.passCooldown.set(k, v - dt);
    }
    if (car.speed >= cp.minSpeed && !car.airborne) {
      for (const npc of npcCars) {
        if (npc.hidden || npc.state !== 'drive' || this.passCooldown.has(npc)) continue;
        const gap = Math.hypot(npc.x - car.x, npc.z - car.z) - Math.min(npc.width, npc.length) / 2 - car.radius;
        if (gap <= cp.radius - car.radius && gap > -0.2) {
          this.passCooldown.set(npc, cp.cooldown);
          this.trick('closePass', cp.value);
        }
      }
    }
    if (this.combo) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) this.bank();
    }
  }
}
