// Paket: spawn acak di map (model Crazy Taxi), cargo dengan slot,
// ambil/antar dengan berhenti + E, dan blessing Zeus yang ikut pergi saat paket diantar.
import { distance } from './world.js';

export class PackageSystem {
  constructor(world, cfg, rng, bus) {
    this.world = world;
    this.cfg = cfg;
    this.rng = rng;
    this.bus = bus;
    this.nextId = 1;
    this.resetDay({ scripted: false, spawnInitial: false });
  }

  resetDay({ scripted, spawnInitial = true, near = null }) {
    this.waiting = [];
    this.cargo = [];
    this.delivered = [];
    this.spawnTimer = 0;
    this.nearTimer = 0;
    this.zeusSpawnedToday = 0;
    this.scripted = scripted;
    if (!spawnInitial) return;
    if (scripted) {
      const zeus = this.makePackage('zeus', this.world.scriptedZeusPoint);
      zeus.lifetime = Infinity;
      this.waiting.push(zeus);
      this.zeusSpawnedToday += 1;
    }
    if (near) this.spawnNear(near);
    while (this.waiting.length < this.cfg.initialWaiting) {
      if (!this.spawnRandom({ allowZeus: !scripted })) break;
    }
  }

  get slotsUsed() {
    return this.cargo.reduce((sum, p) => sum + p.slots, 0);
  }

  get slotsFree() {
    return this.cfg.capacity - this.slotsUsed;
  }

  get blessed() {
    return this.cargo.some((p) => p.type === 'zeus');
  }

  get income() {
    return this.delivered.reduce((sum, p) => sum + p.pay, 0);
  }

  update(dt, car, hour) {
    for (const p of this.waiting) p.age += dt;
    const expired = this.waiting.filter((p) => p.age >= p.lifetime);
    if (expired.length) {
      this.waiting = this.waiting.filter((p) => p.age < p.lifetime);
      for (const p of expired) this.bus.emit('package_expired', { id: p.id, packageType: p.type, hour });
    }

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.cfg.spawnInterval) {
      this.spawnTimer = 0;
      if (this.waiting.length < this.cfg.maxWaiting) this.spawnRandom({ allowZeus: true });
    }

    this.nearTimer += dt;
    if (this.nearTimer >= this.cfg.nearCheckInterval) {
      this.nearTimer = 0;
      const hasNear = this.waiting.some((p) => distance(p.pickup, car) <= this.cfg.nearRadius);
      if (!hasNear) {
        // Batas maksimum tetap dijaga: paket Safe terjauh "dipindahkan" ke dekat van.
        if (this.waiting.length >= this.cfg.maxWaiting) this.retireFarthestSafe(car, hour);
        if (this.waiting.length < this.cfg.maxWaiting) this.spawnNear(car);
      }
    }
  }

  retireFarthestSafe(car, hour) {
    // Paket yang baru muncul tidak dipindahkan, supaya target pemain tidak tiba-tiba hilang.
    const safes = this.waiting.filter((p) => p.type === 'safe' && p.age >= this.cfg.minAgeBeforeRetire);
    if (!safes.length) return;
    const farthest = safes.reduce((a, b) => (distance(b.pickup, car) > distance(a.pickup, car) ? b : a));
    this.waiting = this.waiting.filter((p) => p !== farthest);
    this.bus.emit('package_expired', { id: farthest.id, packageType: farthest.type, hour });
  }

  // Titik yang tidak sedang dipakai paket lain (sebagai pickup maupun tujuan).
  freePoints() {
    const used = new Set();
    for (const p of this.waiting) used.add(p.pickup.id);
    for (const p of [...this.waiting, ...this.cargo]) used.add(p.dest.id);
    return this.world.points.filter((pt) => !used.has(pt.id));
  }

  canSpawnZeus() {
    const active = [...this.waiting, ...this.cargo].some((p) => p.type === 'zeus');
    return !active && this.zeusSpawnedToday < this.cfg.zeus.maxPerDay;
  }

  spawnRandom({ allowZeus }) {
    const candidates = this.freePoints();
    if (!candidates.length) return null;
    const point = this.rng.pick(candidates);
    const type = allowZeus && this.canSpawnZeus() && this.rng.chance(this.cfg.zeus.chance) ? 'zeus' : 'safe';
    return this.spawnAt(type, point);
  }

  spawnNear(car) {
    const candidates = this.freePoints().filter((pt) => {
      const d = distance(pt, car);
      return d >= this.cfg.nearMinDistance && d <= this.cfg.nearRadius;
    });
    if (!candidates.length) return null;
    return this.spawnAt('safe', this.rng.pick(candidates));
  }

  spawnAt(type, point) {
    const pkg = this.makePackage(type, point);
    if (!pkg) return null;
    if (type === 'zeus') this.zeusSpawnedToday += 1;
    this.waiting.push(pkg);
    this.bus.emit('package_spawned', { id: pkg.id, packageType: type });
    return pkg;
  }

  makePackage(type, pickup) {
    let dest;
    let pay;
    if (type === 'zeus') {
      dest = this.world.plant.dropoff;
      pay = this.cfg.zeus.pay;
    } else {
      const used = new Set([...this.waiting, ...this.cargo].map((p) => p.dest.id));
      const options = this.world.points.filter(
        (pt) => pt.name !== pickup.name && !used.has(pt.id) && distance(pt, pickup) >= this.cfg.minTripDistance,
      );
      if (!options.length) return null;
      dest = this.rng.pick(options);
      const { basePay, payPerUnit, maxPay } = this.cfg.safe;
      const raw = Math.min(maxPay, basePay + payPerUnit * distance(pickup, dest));
      pay = Math.round(raw / 5) * 5;
    }
    return {
      id: this.nextId++,
      type,
      slots: this.cfg[type].slots,
      pay,
      pickup,
      dest,
      age: 0,
      lifetime: this.cfg.waitingLifetime,
    };
  }

  findPickup(car) {
    let best = null;
    let bestDist = this.cfg.pickupRadius;
    for (const p of this.waiting) {
      const d = distance(p.pickup, car);
      if (d <= bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }

  findDeliverable(car) {
    return this.cargo.filter((p) => distance(p.dest, car) <= this.cfg.dropoffRadius);
  }

  // Apa yang bisa dilakukan tombol E di posisi van sekarang (untuk prompt HUD).
  available(car) {
    const deliverable = this.findDeliverable(car);
    if (deliverable.length) return { kind: 'deliver', packages: deliverable };
    const pickup = this.findPickup(car);
    if (pickup) {
      return pickup.slots <= this.slotsFree ? { kind: 'pickup', pkg: pickup } : { kind: 'full', pkg: pickup };
    }
    return null;
  }

  // Tombol E ditekan. Mengembalikan hasil, atau null bila tidak ada paket di dekat van.
  interact(car, hour) {
    const action = this.available(car);
    if (!action) return null;
    if (!car.stopped) return { kind: 'moving', action };

    if (action.kind === 'deliver') {
      for (const pkg of action.packages) {
        this.cargo = this.cargo.filter((p) => p !== pkg);
        this.delivered.push(pkg);
        this.bus.emit('deliver', { id: pkg.id, packageType: pkg.type, pay: pkg.pay, dest: pkg.dest.name, hour });
        if (pkg.type === 'zeus') this.bus.emit('blessing_lost', { x: car.x, z: car.z, hour });
      }
      return action;
    }
    if (action.kind === 'full') {
      this.bus.emit('cargo_full', { id: action.pkg.id, packageType: action.pkg.type, hour });
      return action;
    }
    const pkg = action.pkg;
    this.waiting = this.waiting.filter((p) => p !== pkg);
    this.cargo.push(pkg);
    this.bus.emit('pickup', { id: pkg.id, packageType: pkg.type, pay: pkg.pay, dest: pkg.dest.name, hour });
    if (pkg.type === 'zeus') this.bus.emit('blessing_gained', { hour });
    return action;
  }

  // Panel debug: langsung masukkan paket Zeus ke cargo bila slot cukup.
  debugGiveZeus(car) {
    if (this.blessed || this.slotsFree < this.cfg.zeus.slots) return false;
    const pkg = this.makePackage('zeus', { id: 'debug', name: 'Debug', x: car.x, z: car.z });
    this.cargo.push(pkg);
    this.bus.emit('blessing_gained', { debug: true });
    return true;
  }
}
