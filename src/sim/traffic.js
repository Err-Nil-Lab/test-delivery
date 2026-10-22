// Lalu lintas NPC: mobil warga, kereta kuda, truk sayur Demeter, van saingan "Iris Express",
// dan gerobak kambing di jalan gunung. Mobil mengikuti lajur, mengerem untuk halangan di depan,
// menyalip van yang parkir, dan terpental lucu saat ditabrak van (lalu kembali ke lajurnya).
import { boxCollider } from './collision.js';
import { buildLanes, samplePath, projectOnPath } from './lanes.js';

export const CAR_STATE = { DRIVE: 'drive', SPUN: 'spun', REJOIN: 'rejoin' };

const approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));

export class TrafficSystem {
  constructor(world, cfg, rng, bus) {
    this.world = world;
    this.cfg = cfg;
    this.rng = rng;
    this.bus = bus;
    this.lanes = buildLanes(world.roads);
    this.cars = [];
    bus.on('strike', (s) => this.onStrike(s));
  }

  get active() {
    return this.cars.filter((c) => !c.hidden);
  }

  // Sebar mobil di semua lajur. Mobil tidak muncul terlalu dekat dengan van.
  // density: pengali kepadatan hari ini (titah dewa), minRivals: jumlah minimum van saingan.
  // allowRivals: false = tanpa van saingan sama sekali (Hari Pelatihan).
  reset(van, { density = 1, minRivals = 1, allowRivals = true } = {}) {
    const c = this.cfg;
    this.cars = [];
    if (!c.enabled) return;
    const slots = [];
    for (const lane of this.lanes) {
      const exact = (lane.path.length / 100) * (c.carsPer100m[lane.road.kind] ?? 0) * density;
      const count = Math.floor(exact) + (this.rng.chance(exact % 1) ? 1 : 0);
      for (let i = 0; i < count; i++) slots.push({ lane, s: ((i + this.rng.range(0.1, 0.6)) / count) * lane.path.length });
    }
    // Kalau melebihi batas, buang secara acak (deterministik dari seed).
    while (slots.length > c.maxCars * density) slots.splice(Math.floor(this.rng.next() * slots.length), 1);
    for (const slot of slots) {
      const p = samplePath(slot.lane.path, slot.s);
      if (Math.hypot(p.x - van.x, p.z - van.z) < 14) continue;
      this.cars.push(this.makeCar(this.cars.length, slot.lane, slot.s));
    }
    if (!allowRivals) {
      for (const car of this.cars) if (car.kind === 'rival') Object.assign(car, this.makeCar(car.id, car.lane, car.s, 'sedan'));
    }
    // Selalu ada beberapa van saingan Iris Express yang berkeliaran.
    for (const sedan of this.cars.filter((car) => car.kind === 'sedan' && car.lane.road.kind !== 'mountain')) {
      if (this.cars.filter((car) => car.kind === 'rival').length >= minRivals) break;
      Object.assign(sedan, this.makeCar(sedan.id, sedan.lane, sedan.s, 'rival'));
    }
    for (const car of this.cars) {
      this.place(car);
      car.heading = Math.atan2(car.dirX, car.dirZ);
    }
  }

  makeCar(id, lane, s, forcedKind = null) {
    const c = this.cfg;
    const mountain = lane.road.kind === 'mountain';
    const kind = forcedKind ?? (mountain ? (this.rng.chance(0.6) ? 'goatcart' : 'sedan') : this.pickKind());
    const k = c.kinds[kind];
    return {
      id,
      lane,
      s,
      kind,
      length: k.length,
      width: k.width,
      cruise: c.speed[lane.road.kind] * k.speed * this.rng.range(0.9, 1.1),
      speed: 0,
      colorSeed: this.rng.next(),
      state: CAR_STATE.DRIVE,
      x: 0,
      z: 0,
      heading: 0,
      offset: 0,
      offsetTarget: 0,
      overtaking: false,
      waitVan: 0,
      waitCar: 0,
      ghost: 0,
      honked: false,
      honkCooldown: this.rng.range(2, 6),
      blocker: null,
      vx: 0,
      vz: 0,
      spin: 0,
      t: 0,
      from: null,
      zap: 0,
      leaving: false,
      hidden: false,
    };
  }

  pickKind() {
    const kinds = Object.entries(this.cfg.kinds).filter(([, k]) => k.weight > 0);
    let r = this.rng.next() * kinds.reduce((a, [, k]) => a + k.weight, 0);
    for (const [name, k] of kinds) {
      r -= k.weight;
      if (r <= 0) return name;
    }
    return kinds[0][0];
  }

  // Posisi di lajur (dengan offset lateral saat menyalip).
  place(car) {
    const p = samplePath(car.lane.path, car.s);
    car.x = p.x + p.dz * car.offset;
    car.z = p.z - p.dx * car.offset;
    car.dirX = p.dx;
    car.dirZ = p.dz;
    return p;
  }

  // Halangan terdekat di depan mobil: { gap, who }.
  scanAhead(car, van, walkers) {
    const c = this.cfg;
    const fx = car.dirX;
    const fz = car.dirZ;
    const rx = fz;
    const rz = -fx;
    const reach = c.lookAhead + car.length / 2;
    let best = { gap: Infinity, who: null };
    const consider = (x, z, halfWidth, who) => {
      const dx = x - car.x;
      const dz = z - car.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > reach + halfWidth) return;
      const lat = dx * rx + dz * rz;
      if (Math.abs(lat) > car.width / 2 + halfWidth + 0.4) return;
      const gap = along - car.length / 2 - halfWidth;
      if (gap < best.gap) best = { gap, who };
    };
    if (!(car.overtaking && van.speed < 1)) consider(van.x, van.z, van.radius, 'van');
    if (car.ghost <= 0) {
      for (const o of this.cars) {
        if (o === car || o.hidden) continue;
        // Mobil dari arah berlawanan di jalur yang sama tidak dihitung (sudah beda lajur).
        if (o.dirX * fx + o.dirZ * fz < -0.7 && !o.overtaking && !car.overtaking) continue;
        consider(o.x, o.z, Math.min(o.width, o.length) / 2, o);
      }
    }
    for (const w of walkers) consider(w.x, w.z, 0.5, w);
    return best;
  }

  // Lajur seberang kosong untuk menyalip?
  oppositeClear(car) {
    const off = -car.lane.road.width / 2;
    const tx = car.x + car.dirZ * off;
    const tz = car.z - car.dirX * off;
    return this.cars.every((o) => {
      if (o === car || o.hidden) return true;
      const dx = o.x - tx;
      const dz = o.z - tz;
      const along = dx * car.dirX + dz * car.dirZ;
      const lat = dx * car.dirZ - dz * car.dirX;
      return !(along > -6 && along < 28 && Math.abs(lat) < 3);
    });
  }

  // scare(agent, car): minta pejalan kaki/hewan yang menghalangi untuk minggir (diklakson).
  update(dt, { van, phase, walkers = [], scare = null }) {
    if (!this.cfg.enabled) return;
    if (phase === 'storm' && !this.stormStarted) this.startStorm();
    if (phase !== 'storm') this.stormStarted = false;
    const scans = new Map();
    for (const car of this.cars) {
      if (car.hidden || car.state !== CAR_STATE.DRIVE) continue;
      scans.set(car, this.scanAhead(car, van, walkers));
    }
    for (const car of this.cars) {
      if (car.hidden) continue;
      if (car.leaving && Math.hypot(car.x - van.x, car.z - van.z) > 70) {
        car.hidden = true;
        continue;
      }
      car.zap = Math.max(0, car.zap - dt);
      car.honkCooldown -= dt;
      if (car.state === CAR_STATE.SPUN) this.updateSpun(car, dt);
      else if (car.state === CAR_STATE.REJOIN) this.updateRejoin(car, dt);
      else this.updateDrive(car, dt, scans, van, scare);
    }
  }

  updateDrive(car, dt, scans, van, scare) {
    const c = this.cfg;
    let { gap, who } = scans.get(car);
    const isCar = (o) => o && typeof o === 'object' && o.lane !== undefined;
    // Dua mobil saling menunggu di simpang: id lebih kecil jalan duluan.
    if (isCar(who)) {
      const theirs = scans.get(who);
      if (theirs?.who === car && car.id < who.id) ({ gap, who } = { gap: Infinity, who: null });
    }
    car.blocker = who;

    // Tikungan tajam di depan (termasuk putar balik): melambat.
    const ahead = samplePath(car.lane.path, car.s + 8);
    const turn = Math.acos(Math.max(-1, Math.min(1, ahead.dx * car.dirX + ahead.dz * car.dirZ)));
    let target = car.zap > 0 ? 0 : turn > c.turnSlowAngle ? Math.min(car.cruise, c.turnSpeed) : car.cruise;
    if (who) target = Math.min(target, Math.sqrt(2 * c.brake * Math.max(0, gap - c.minGap)));
    car.speed = approach(car.speed, target, (target < car.speed ? c.brake : c.accel) * dt);

    // Menunggu van yang menghalangi: klakson, lalu menyalip lewat lajur seberang.
    const stuck = car.speed < 0.5;
    if (who === 'van' && stuck && van.speed < 1) {
      car.waitVan += dt;
      if (car.waitVan > c.honkWait && !car.honked) {
        car.honked = true;
        this.honk(car);
      }
      if (car.waitVan > c.overtakeWait && this.oppositeClear(car)) {
        car.overtaking = true;
        car.offsetTarget = -car.lane.road.width / 2;
      }
    } else if (who !== 'van') {
      car.waitVan = 0;
      car.honked = false;
    }
    if (car.overtaking) {
      const along = (van.x - car.x) * car.dirX + (van.z - car.z) * car.dirZ;
      if (along < -car.length || Math.hypot(van.x - car.x, van.z - car.z) > 16 || van.speed > 3) {
        car.overtaking = false;
        car.offsetTarget = 0;
      }
    }
    // Orang/hewan diam di jalan: tunggu sebentar, klakson, mereka minggir.
    if (who && typeof who === 'object' && !isCar(who) && stuck) {
      car.waitWalker = (car.waitWalker ?? 0) + dt;
      if (car.waitWalker > c.honkWait) {
        car.waitWalker = 0;
        this.honk(car);
        scare?.(who, car);
      }
    } else car.waitWalker = 0;
    // Macet di simpang dengan mobil lain terlalu lama: nekat jalan sebentar.
    car.ghost = Math.max(0, car.ghost - dt);
    if (isCar(who) && stuck) {
      car.waitCar += dt;
      if (car.waitCar > c.ghostAfter) {
        car.ghost = 2.5;
        car.waitCar = 0;
      }
    } else car.waitCar = 0;

    // Van saingan suka mengklakson van pemain.
    if (car.kind === 'rival' && car.honkCooldown <= 0 && Math.hypot(van.x - car.x, van.z - car.z) < 14) {
      car.honkCooldown = this.rng.range(4, 8);
      this.honk(car);
    }

    car.offset = approach(car.offset, car.offsetTarget, 3 * dt);
    car.s = (car.s + car.speed * dt) % car.lane.path.length;
    const p = this.place(car);
    const h = Math.atan2(p.dx, p.dz);
    let dh = h - car.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    car.heading += dh * Math.min(1, dt * 10);
  }

  updateSpun(car, dt) {
    const nx = car.x + car.vx * dt;
    const nz = car.z + car.vz * dt;
    if (this.world.isBlocked(nx, nz, car.width / 2)) {
      car.vx = 0;
      car.vz = 0;
    } else {
      car.x = nx;
      car.z = nz;
    }
    const damp = Math.exp(-2 * dt);
    car.vx *= damp;
    car.vz *= damp;
    car.heading += car.spin * dt;
    car.spin *= Math.exp(-2 * dt);
    car.t -= dt;
    if (car.t > 0) return;
    // Kembali ke lajur: cari titik terdekat, lalu meluncur pelan ke sana.
    car.s = projectOnPath(car.lane.path, car.x, car.z).s;
    car.state = CAR_STATE.REJOIN;
    car.t = this.cfg.rejoinSeconds;
    car.from = { x: car.x, z: car.z, heading: car.heading };
    car.speed = 0;
    car.offset = 0;
    car.offsetTarget = 0;
    car.overtaking = false;
  }

  updateRejoin(car, dt) {
    car.t -= dt;
    const k = 1 - Math.max(0, car.t) / this.cfg.rejoinSeconds;
    const e = k * k * (3 - 2 * k);
    const p = samplePath(car.lane.path, car.s);
    const h = Math.atan2(p.dx, p.dz);
    let dh = h - car.from.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    car.x = car.from.x + (p.x - car.from.x) * e;
    car.z = car.from.z + (p.z - car.from.z) * e;
    car.heading = car.from.heading + dh * e;
    car.dirX = p.dx;
    car.dirZ = p.dz;
    if (car.t <= 0) car.state = CAR_STATE.DRIVE;
  }

  honk(car) {
    this.bus.emit('npc_honk', { x: car.x, z: car.z, kind: car.kind });
  }

  // Ditabrak van: terdorong searah tumbukan, berputar, lalu kembali ke lajur.
  bump(car, van, impact) {
    const c = this.cfg;
    if (impact < c.bumpMinImpact || car.hidden) return;
    let dx = car.x - van.x;
    let dz = car.z - van.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const push = impact * c.bumpImpulse;
    car.vx = dx * push;
    car.vz = dz * push;
    car.spin = (this.rng.chance(0.5) ? 1 : -1) * c.bumpSpin * Math.min(1, impact / 12);
    car.state = CAR_STATE.SPUN;
    car.t = c.spunSeconds;
    car.speed = 0;
    this.bus.emit('npc_bumped', { x: car.x, z: car.z, kind: car.kind, impact: Math.round(impact * 100) / 100 });
  }

  // Petir ambient menyambar mobil: mobil berhenti sebentar dan hangus (hiasan, tanpa damage).
  onStrike(s) {
    for (const car of this.cars) {
      if (car.hidden || Math.hypot(car.x - s.x, car.z - s.z) > (s.radius ?? 3.5) + 1) continue;
      car.zap = 2;
      this.bus.emit('npc_zapped', { x: car.x, z: car.z, kind: car.kind });
    }
  }

  // Badai Zeus: sebagian besar mobil pulang (hilang saat jauh dari van), kota jadi sepi.
  startStorm() {
    this.stormStarted = true;
    for (const car of this.cars) car.leaving = !this.rng.chance(this.cfg.stormKeep);
  }

  colliders() {
    const out = [];
    for (const car of this.cars) {
      if (!car.hidden) out.push(boxCollider(car.x, car.z, car.width / 2, car.length / 2, -car.heading, { npcCar: car }));
    }
    return out;
  }
}
