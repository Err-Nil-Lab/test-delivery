// Minotaur di padang terbuka: berkeliaran, melihat van, ancang-ancang (telegraph arah),
// lalu menyeruduk lurus. Kena = van terpental (impuls fisika) + damage. Setelah itu pusing sebentar.
// Curse yang dibawa van mengubah perilakunya:
// - Ares (enraged): melihat lebih jauh, ancang-ancang lebih singkat, menyeruduk lebih jauh, mengejar keluar padang.
// - Aphrodite (charmed): tidak menyeruduk; membuntuti van dan menyundul pelan kalau van berhenti.
import { inRect } from './geometry.js';
import { circleCollider } from './collision.js';

export const MINOTAUR_STATE = {
  WANDER: 'wander',
  FOLLOW: 'follow',
  WINDUP: 'windup',
  CHARGE: 'charge',
  DIZZY: 'dizzy',
};

export class MinotaurSystem {
  constructor(world, cfg, rng, bus, curseEffects) {
    this.world = world;
    this.cfg = cfg;
    this.curse = curseEffects;
    this.mode = 'normal';
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
      nudgeTimer: 0,
    }));
  }

  // Parameter efektif sesuai mode curse.
  params() {
    const c = this.cfg;
    if (this.mode !== 'enraged') return { detectRadius: c.detectRadius, windup: c.windup, chargeDistance: c.chargeDistance, margin: 0, cooldown: c.cooldown };
    const a = this.curse.ares;
    return {
      detectRadius: c.detectRadius * a.detectMultiplier,
      windup: c.windup * a.windupMultiplier,
      chargeDistance: c.chargeDistance * a.chargeMultiplier,
      margin: a.chaseMargin,
      cooldown: 0,
    };
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
    m.timer = this.params().windup;
    this.bus.emit('minotaur_windup', { id: m.id, x: m.x, z: m.z, dirX: m.dirX, dirZ: m.dirZ, length: this.params().chargeDistance });
  }

  // Ditabrak van saat sedang tenang: langsung marah.
  provoke(m, car) {
    if (m.state !== MINOTAUR_STATE.WANDER || this.mode === 'charmed') return;
    this.startWindup(m, car);
  }

  // Aphrodite: membuntuti van selama van tidak terlalu jauh dari padangnya.
  follow(dt, m, car, toCar, hits) {
    const a = this.curse.aphrodite;
    const stillCharmed = this.mode === 'charmed' && toCar <= a.followRadius * 1.5 && inRect(this.expand(m.territory, a.leash), car.x, car.z);
    if (!stillCharmed) {
      m.state = MINOTAUR_STATE.WANDER;
      this.pickTarget(m);
      return;
    }
    m.heading = Math.atan2(car.x - m.x, car.z - m.z);
    const close = this.cfg.radius + car.radius + 1;
    if (toCar > close) {
      const step = Math.min(a.followSpeed * dt, toCar - close);
      m.x += ((car.x - m.x) / toCar) * step;
      m.z += ((car.z - m.z) / toCar) * step;
    }
    m.nudgeTimer -= dt;
    if (toCar <= close + 0.5 && car.stopped && m.nudgeTimer <= 0) {
      m.nudgeTimer = a.nudgeInterval;
      hits.push({ minotaur: m, dirX: (car.x - m.x) / toCar, dirZ: (car.z - m.z) / toCar, nudge: true });
      this.bus.emit('minotaur_nudge', { id: m.id });
    }
  }

  // ctx: { car, active, mode }. Mengembalikan serudukan (dan sundulan, nudge: true) yang mengenai van.
  update(dt, { car, active, mode = 'normal' }) {
    this.mode = mode;
    const p = this.params();
    const hits = [];
    for (const m of this.list) {
      m.cooldown = Math.max(0, m.cooldown - dt);
      m.timer -= dt;
      const toCar = Math.hypot(car.x - m.x, car.z - m.z);

      if (m.state === MINOTAUR_STATE.FOLLOW) {
        this.follow(dt, m, car, toCar, hits);
        continue;
      }

      if (m.state === MINOTAUR_STATE.WANDER) {
        if (active && mode === 'charmed' && toCar <= this.curse.aphrodite.followRadius && inRect(this.expand(m.territory), car.x, car.z)) {
          m.state = MINOTAUR_STATE.FOLLOW;
          this.bus.emit('minotaur_charmed', { id: m.id });
          continue;
        }
        const sees =
          active && mode !== 'charmed' && m.cooldown <= 0 && toCar <= p.detectRadius && inRect(this.expand(m.territory, this.cfg.noticeMargin + p.margin), car.x, car.z);
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
        if (!inRect(this.expand(m.territory, p.margin), nx, nz) || m.traveled >= p.chargeDistance) {
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
        m.cooldown = p.cooldown;
        this.pickTarget(m);
      }
    }
    return hits;
  }

  dizzy(m) {
    m.state = MINOTAUR_STATE.DIZZY;
    m.timer = this.cfg.dizzy;
  }

  expand(rect, s = this.cfg.noticeMargin) {
    return { minX: rect.minX - s, maxX: rect.maxX + s, minZ: rect.minZ - s, maxZ: rect.maxZ + s };
  }
}
