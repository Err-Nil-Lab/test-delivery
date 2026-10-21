// Minotaur di padang terbuka: berkeliaran, melihat van, ancang-ancang (telegraph arah),
// lalu menyeruduk lurus. Kena = van terpental (impuls fisika) + damage. Setelah itu pusing sebentar.
import { inRect } from './geometry.js';
import { circleCollider } from './collision.js';

export const MINOTAUR_STATE = {
  WANDER: 'wander',
  WINDUP: 'windup',
  CHARGE: 'charge',
  DIZZY: 'dizzy',
};

export class MinotaurSystem {
  constructor(world, cfg, rng, bus) {
    this.world = world;
    this.cfg = cfg;
    this.rng = rng;
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.list = this.world.minotaurSpawns.map((s) => ({
      id: s.id,
      x: s.x,
      z: s.z,
      heading: 0,
      territory: s.territory,
      state: MINOTAUR_STATE.WANDER,
      timer: 0,
      cooldown: 0,
      target: { x: s.x, z: s.z },
      dirX: 0,
      dirZ: 1,
      traveled: 0,
    }));
  }

  // Collider dinamis untuk van (Minotaur yang diam/berjalan bisa ditabrak).
  colliders() {
    return this.list.map((m) => circleCollider(m.x, m.z, this.cfg.radius, { minotaur: m }));
  }

  pickTarget(m) {
    const t = m.territory;
    m.target = { x: this.rng.range(t.minX + 3, t.maxX - 3), z: this.rng.range(t.minZ + 3, t.maxZ - 3) };
    m.timer = this.rng.range(2, 5);
  }

  startWindup(m, car) {
    const lead = this.cfg.aimLead;
    const tx = car.x + car.vx * lead - m.x;
    const tz = car.z + car.vz * lead - m.z;
    const d = Math.hypot(tx, tz) || 1;
    m.dirX = tx / d;
    m.dirZ = tz / d;
    m.heading = Math.atan2(m.dirX, m.dirZ);
    m.state = MINOTAUR_STATE.WINDUP;
    m.timer = this.cfg.windup;
    this.bus.emit('minotaur_windup', { id: m.id, x: m.x, z: m.z, dirX: m.dirX, dirZ: m.dirZ, length: this.cfg.chargeDistance });
  }

  // Ditabrak van saat sedang tenang: langsung marah.
  provoke(m, car) {
    if (m.state !== MINOTAUR_STATE.WANDER) return;
    this.startWindup(m, car);
  }

  // ctx: { car, active }. Mengembalikan serudukan yang mengenai van.
  update(dt, { car, active }) {
    const hits = [];
    for (const m of this.list) {
      m.cooldown = Math.max(0, m.cooldown - dt);
      m.timer -= dt;
      const toCar = Math.hypot(car.x - m.x, car.z - m.z);

      if (m.state === MINOTAUR_STATE.WANDER) {
        const sees = active && m.cooldown <= 0 && toCar <= this.cfg.detectRadius && inRect(this.expand(m.territory), car.x, car.z);
        if (sees) {
          this.startWindup(m, car);
          continue;
        }
        const dx = m.target.x - m.x;
        const dz = m.target.z - m.z;
        const d = Math.hypot(dx, dz);
        if (d < 1 || m.timer <= 0) {
          this.pickTarget(m);
        } else {
          m.x += (dx / d) * this.cfg.walkSpeed * dt;
          m.z += (dz / d) * this.cfg.walkSpeed * dt;
          m.heading = Math.atan2(dx, dz);
        }
      } else if (m.state === MINOTAUR_STATE.WINDUP) {
        if (m.timer <= 0) {
          m.state = MINOTAUR_STATE.CHARGE;
          m.traveled = 0;
          this.bus.emit('minotaur_charge', { id: m.id });
        }
      } else if (m.state === MINOTAUR_STATE.CHARGE) {
        const step = this.cfg.chargeSpeed * dt;
        const nx = m.x + m.dirX * step;
        const nz = m.z + m.dirZ * step;
        if (!inRect(m.territory, nx, nz) || m.traveled >= this.cfg.chargeDistance) {
          this.dizzy(m);
          continue;
        }
        m.x = nx;
        m.z = nz;
        m.traveled += step;
        if (Math.hypot(car.x - m.x, car.z - m.z) <= this.cfg.radius + car.radius) {
          hits.push({ minotaur: m, dirX: m.dirX, dirZ: m.dirZ });
          this.bus.emit('minotaur_hit', { id: m.id, x: m.x, z: m.z });
          this.dizzy(m);
        }
      } else if (m.state === MINOTAUR_STATE.DIZZY && m.timer <= 0) {
        m.state = MINOTAUR_STATE.WANDER;
        m.cooldown = this.cfg.cooldown;
        this.pickTarget(m);
      }
    }
    return hits;
  }

  dizzy(m) {
    m.state = MINOTAUR_STATE.DIZZY;
    m.timer = this.cfg.dizzy;
  }

  expand(rect) {
    const s = this.cfg.noticeMargin;
    return { minX: rect.minX - s, maxX: rect.maxX + s, minZ: rect.minZ - s, maxZ: rect.maxZ + s };
  }
}
