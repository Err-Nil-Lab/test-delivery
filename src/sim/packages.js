// Paket: spawn acak di map (model Crazy Taxi), cargo dengan slot,
// ambil/antar dengan berhenti + E. Paket dewa membawa efek yang ikut pergi saat paket diantar:
// blessing Zeus (kebal petir) dan kategori Curse (Dionysus, Chronos, Hades, Aphrodite, Ares).
import { distance } from './world.js';
import { CURSES, CURSE_IDS, cargoEffects } from './curses.js';

const round5 = (v) => Math.round(v / 5) * 5;

export class PackageSystem {
  constructor(world, cfg, rng, bus, curseCfg, smuggleCfg) {
    this.world = world;
    this.cfg = cfg;
    this.curseCfg = curseCfg;
    this.smuggleCfg = smuggleCfg;
    this.rng = rng;
    this.bus = bus;
    this.nextId = 1;
    this.resetDay({ scripted: false, spawnInitial: false });
  }

  resetDay({ scripted, day = 1, spawnInitial = true, near = null }) {
    this.waiting = [];
    this.cargo = [];
    this.delivered = [];
    this.scammed = [];
    this.spawnTimer = 0;
    this.nearTimer = 0;
    this.zeusSpawnedToday = 0;
    this.cursesSpawnedToday = 0;
    this.day = day;
    this.scripted = scripted;
    if (!spawnInitial) return;
    if (scripted) {
      const zeus = this.makePackage('zeus', this.world.zeusPickup);
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

  // Efek gabungan dari paket dewa yang sedang dibawa.
  get effects() {
    return cargoEffects(this.cargo, this.curseCfg);
  }

  get income() {
    return this.delivered.reduce((sum, p) => sum + p.pay, 0);
  }

  update(dt, car, hour) {
    for (const p of this.waiting) p.age += dt;
    for (const p of this.cargo) p.held = (p.held ?? 0) + dt;
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

  canSpawnCurse() {
    const c = this.curseCfg;
    if (!c || this.day < c.fromDay || this.cursesSpawnedToday >= c.maxPerDay) return false;
    return this.waiting.filter((p) => p.type === 'curse').length < c.maxWaiting;
  }

  // Paket curse diambil di tempat bertema dewanya bila ada dan kosong, selain itu di titik acak.
  spawnCurse(curse = this.rng.pick(CURSE_IDS)) {
    const free = this.freePoints();
    const themed = free.find((pt) => pt.name === CURSES[curse].pickupName);
    const point = themed ?? this.rng.pick(free);
    if (!point) return null;
    return this.spawnAt('curse', point, curse);
  }

  // Paket Zeus selalu diambil di Gerbang Istana Zeus; paket Safe di titik acak.
  spawnRandom({ allowZeus }) {
    if (allowZeus && this.canSpawnZeus() && this.rng.chance(this.cfg.zeus.chance)) return this.spawnAt('zeus', this.world.zeusPickup);
    if (allowZeus && this.canSpawnCurse() && this.rng.chance(this.curseCfg.chance)) {
      const pkg = this.spawnCurse();
      if (pkg) return pkg;
    }
    const candidates = this.freePoints();
    if (!candidates.length) return null;
    if (allowZeus && this.canSpawnSmuggle() && this.rng.chance(this.smuggleCfg.chance)) {
      const pkg = this.spawnAt('smuggle', this.rng.pick(candidates));
      if (pkg) return pkg;
    }
    return this.spawnAt('safe', this.rng.pick(candidates));
  }

  canSpawnSmuggle() {
    const s = this.smuggleCfg;
    if (!s || this.day < s.fromDay) return false;
    return this.waiting.filter((p) => p.type === 'smuggle').length < s.maxWaiting;
  }

  spawnNear(car) {
    const candidates = this.freePoints().filter((pt) => {
      const d = distance(pt, car);
      return d >= this.cfg.nearMinDistance && d <= this.cfg.nearRadius;
    });
    if (!candidates.length) return null;
    return this.spawnAt('safe', this.rng.pick(candidates));
  }

  spawnAt(type, point, curse = null) {
    const pkg = this.makePackage(type, point, curse);
    if (!pkg) return null;
    if (type === 'zeus') this.zeusSpawnedToday += 1;
    if (type === 'curse') this.cursesSpawnedToday += 1;
    this.waiting.push(pkg);
    this.bus.emit('package_spawned', { id: pkg.id, packageType: type, curse });
    return pkg;
  }

  pickDestination(pickup, minTrip, preferredName) {
    const used = new Set([...this.waiting, ...this.cargo].map((p) => p.dest.id));
    const options = this.world.points.filter((pt) => pt.name !== pickup.name && !used.has(pt.id) && distance(pt, pickup) >= minTrip);
    return options.find((pt) => pt.name === preferredName) ?? (options.length ? this.rng.pick(options) : null);
  }

  safePay(pickup, dest) {
    const { basePay, payPerUnit, maxPay } = this.cfg.safe;
    return Math.min(maxPay, basePay + payPerUnit * distance(pickup, dest));
  }

  makePackage(type, pickup, curse = null) {
    let dest;
    let pay;
    let slots;
    if (type === 'zeus') {
      dest = this.world.plant.dropoff;
      pay = this.cfg.zeus.pay;
      slots = this.cfg.zeus.slots;
    } else if (type === 'smuggle') {
      const s = this.smuggleCfg;
      dest = this.pickDestination(pickup, this.cfg.minTripDistance);
      if (!dest) return null;
      const scamChance = this.rng.pick(s.scamOptions);
      pay = round5(Math.min(s.maxPay, this.safePay(pickup, dest) * (s.payBase + s.payPerScam * scamChance)));
      slots = s.slots;
      return { ...this.basePackage(type, pickup, dest, pay, slots), scamChance };
    } else if (type === 'curse') {
      const c = this.curseCfg;
      dest = this.pickDestination(pickup, c.minTripDistance, CURSES[curse].destName);
      if (!dest) return null;
      pay = round5(Math.min(c.maxPay, (this.cfg.safe.basePay + this.cfg.safe.payPerUnit * distance(pickup, dest)) * c.payMultiplier));
      slots = c.slots;
    } else {
      dest = this.pickDestination(pickup, this.cfg.minTripDistance);
      if (!dest) return null;
      pay = round5(this.safePay(pickup, dest));
      slots = this.cfg.safe.slots;
    }
    return { ...this.basePackage(type, pickup, dest, pay, slots), curse };
  }

  basePackage(type, pickup, dest, pay, slots) {
    return { id: this.nextId++, type, curse: null, slots, pay, pickup, dest, age: 0, lifetime: this.cfg.waitingLifetime };
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
        // Selundupan diundi saat diantar: scam = bayaran hangus.
        if (pkg.type === 'smuggle') {
          pkg.scam = this.rng.chance(pkg.scamChance);
          this.bus.emit('smuggle_resolved', { id: pkg.id, scamChance: pkg.scamChance, scam: pkg.scam, pay: pkg.pay, x: car.x, z: car.z, hour });
          if (pkg.scam) {
            this.scammed.push(pkg);
            continue;
          }
        }
        this.delivered.push(pkg);
        this.bus.emit('deliver', { id: pkg.id, packageType: pkg.type, curse: pkg.curse, pay: pkg.pay, dest: pkg.dest.name, hour });
        if (pkg.type === 'zeus') this.bus.emit('blessing_lost', { x: car.x, z: car.z, hour });
        if (pkg.type === 'curse') this.bus.emit('curse_lifted', { curse: pkg.curse, heldSeconds: pkg.held, hour });
      }
      return action;
    }
    if (action.kind === 'full') {
      this.bus.emit('cargo_full', { id: action.pkg.id, packageType: action.pkg.type, hour });
      return action;
    }
    const pkg = action.pkg;
    this.waiting = this.waiting.filter((p) => p !== pkg);
    pkg.held = 0;
    this.cargo.push(pkg);
    this.bus.emit('pickup', { id: pkg.id, packageType: pkg.type, curse: pkg.curse, pay: pkg.pay, dest: pkg.dest.name, hour });
    if (pkg.type === 'zeus') this.bus.emit('blessing_gained', { hour });
    if (pkg.type === 'curse') this.bus.emit('curse_gained', { curse: pkg.curse, hour });
    return action;
  }

  // Panel debug: langsung masukkan paket selundupan ke cargo bila slot cukup.
  debugGiveSmuggle(car) {
    if (this.slotsFree < this.smuggleCfg.slots) return false;
    const pkg = this.makePackage('smuggle', { id: 'debug', name: 'Debug', x: car.x, z: car.z });
    if (!pkg) return false;
    pkg.held = 0;
    this.cargo.push(pkg);
    return true;
  }

  // Panel debug: langsung masukkan paket curse ke cargo bila slot cukup.
  debugGiveCurse(car, curse) {
    if (this.slotsFree < this.curseCfg.slots) return false;
    const pkg = this.makePackage('curse', { id: 'debug', name: 'Debug', x: car.x, z: car.z }, curse);
    if (!pkg) return false;
    pkg.held = 0;
    this.cargo.push(pkg);
    this.bus.emit('curse_gained', { curse, debug: true });
    return true;
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
