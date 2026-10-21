// Petir: selalu ada tanda di tanah (telegraph) sebelum menyambar.
// - zone: di zona Zeus, jatuh acak di sekitar van (skill menghindar).
// - ambient: hiasan di zona Zeus saat van di luar zona.
// - storm: mulai 20:00, memburu posisi van di seluruh map sampai van di HQ.
import { distance } from './world.js';
import { polygonBounds } from './geometry.js';
import { PHASE } from './clock.js';

export class HazardSystem {
  constructor(world, lightningCfg, stormCfg, rng, bus) {
    this.world = world;
    this.cfg = lightningCfg;
    this.storm = stormCfg;
    this.rng = rng;
    this.bus = bus;
    this.nextId = 1;
    this.zoneBounds = polygonBounds(world.regions.zeusZone);
    this.reset();
  }

  reset() {
    this.strikes = [];
    this.zoneTimer = 0;
    this.stormTimer = 0;
  }

  stormInterval(stormElapsed) {
    const t = Math.min(1, stormElapsed / this.storm.rampSeconds);
    return this.storm.startInterval + (this.storm.minInterval - this.storm.startInterval) * t;
  }

  spawn(kind, x, z, telegraph) {
    const strike = { id: this.nextId++, kind, x, z, radius: this.cfg.radius, telegraph, timeLeft: telegraph };
    this.strikes.push(strike);
    this.bus.emit('strike_warning', strike);
    return strike;
  }

  randomPointInZone() {
    const b = this.zoneBounds;
    for (let i = 0; i < 20; i++) {
      const p = { x: this.rng.range(b.minX, b.maxX), z: this.rng.range(b.minZ, b.maxZ) };
      if (this.world.inZeusZone(p.x, p.z)) return p;
    }
    return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  }

  // Titik target di sekitar van, sedikit diprediksi ke arah geraknya.
  aimAt(car, lead, telegraph, spread) {
    const angle = this.rng.range(0, Math.PI * 2);
    const r = Math.sqrt(this.rng.next()) * spread;
    return {
      x: car.x + car.vx * telegraph * lead + Math.cos(angle) * r,
      z: car.z + car.vz * telegraph * lead + Math.sin(angle) * r,
    };
  }

  // ctx: { car, phase, stormElapsed, inHQ, blessed }. Mengembalikan sambaran yang mengenai van.
  update(dt, ctx) {
    const { car } = ctx;
    const inZone = this.world.inZeusZone(car.x, car.z);

    this.zoneTimer -= dt;
    if (this.zoneTimer <= 0) {
      if (inZone) {
        const p = this.aimAt(car, this.cfg.zoneLead, this.cfg.telegraph, this.cfg.zoneTargetSpread);
        if (this.world.inZeusZone(p.x, p.z)) this.spawn('zone', p.x, p.z, this.cfg.telegraph);
        this.zoneTimer = this.rng.range(...this.cfg.zoneInterval);
      } else {
        const p = this.randomPointInZone();
        this.spawn('ambient', p.x, p.z, this.cfg.telegraph);
        this.zoneTimer = this.rng.range(...this.cfg.ambientInterval);
      }
    }

    const hunting = (ctx.phase === PHASE.STORM || ctx.phase === PHASE.LIMIT) && !ctx.inHQ;
    if (hunting) {
      this.stormTimer -= dt;
      if (this.stormTimer <= 0) {
        const p = this.aimAt(car, this.storm.lead, this.storm.telegraph, this.storm.targetSpread);
        this.spawn('storm', p.x, p.z, this.storm.telegraph);
        this.stormTimer = this.stormInterval(ctx.stormElapsed);
      }
    } else {
      this.stormTimer = 0.5; // sambaran badai pertama datang sedikit setelah keluar HQ / 20:00
    }

    const hits = [];
    for (const s of this.strikes) s.timeLeft -= dt;
    const landed = this.strikes.filter((s) => s.timeLeft <= 0);
    this.strikes = this.strikes.filter((s) => s.timeLeft > 0);
    for (const s of landed) {
      const hit = distance(s, car) <= s.radius + car.radius * 0.5;
      const blocked = hit && ctx.blessed;
      this.bus.emit('strike', { ...s, hit, blocked });
      if (hit) hits.push({ ...s, blocked });
    }
    return hits;
  }
}
