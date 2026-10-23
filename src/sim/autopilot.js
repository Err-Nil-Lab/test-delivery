// Autopilot untuk main menu (mode pamer): van menyetir sendiri keliling map memakai fisika van yang sama.
// Rute dari graf jalan (A*), dikejar dengan pure pursuit; mengerem sebelum tikungan, sesekali handbrake
// di tikungan cepat supaya drift, menghindari mobil NPC di depan, dan tidak pernah tersangkut lama.
import { buildRoadGraph, findRoute } from './navigation.js';
import { distance } from './geometry.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// Titik di sepanjang rute pada jarak s dari awal, plus arah.
function alongRoute(route, cum, s) {
  const total = cum[cum.length - 1];
  const d = clamp(s, 0, total);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = route[i - 1];
  const b = route[i];
  const len = Math.max(1e-6, cum[i] - cum[i - 1]);
  const t = clamp((d - cum[i - 1]) / len, 0, 1);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dir: Math.atan2(b.x - a.x, b.z - a.z) };
}

export class Autopilot {
  constructor(game, rng) {
    this.game = game;
    this.rng = rng;
    this.graph = null;
    this.reset();
  }

  reset() {
    this.route = null;
    this.cum = null;
    this.s = 0; // jarak van di rute
    this.dest = null;
    this.recent = [];
    this.stuck = 0;
    this.handbrake = 0;
    this.handbrakeCooldown = 3;
    this.distance = 0; // total jarak tempuh (untuk tes/statistik)
    this.drifts = 0;
    this.reroutes = 0;
    this.lastPos = null;
  }

  // Tempat-tempat menarik untuk didatangi bergantian (kota, istana, gunung, plant, pantai).
  destinations() {
    const w = this.game.world;
    const byId = (id) => w.points.find((p) => p.id === id);
    const list = [byId('lm-square'), w.zeusPickup, byId('lm-shrine'), w.plant.dropoff, byId('lm-housing'), byId('lm-hall'), w.ref.serpentineFoot, w.ref.cityRoad, byId('lm-harbor'), w.hq.spawn];
    // Beberapa titik kota/perumahan acak supaya rute bervariasi.
    const city = w.points.filter((p) => p.district === 'city' || p.district === 'housing');
    for (let i = 0; i < 3 && city.length; i++) list.push(city[Math.floor(this.rng.next() * city.length)]);
    return list.filter(Boolean);
  }

  pickRoute() {
    const { game } = this;
    const car = game.car;
    this.graph ??= buildRoadGraph(game.world, game.cfg.gps);
    const options = this.destinations().filter((p) => distance(p, car) > 60 && !this.recent.includes(p.id));
    for (let attempt = 0; attempt < 6; attempt++) {
      const dest = options[Math.floor(this.rng.next() * options.length)] ?? this.destinations()[0];
      const route = findRoute(this.graph, car, dest, { heightAt: game.world.heightAt });
      if (!route || route.length < 3) continue;
      this.dest = dest;
      this.recent.push(dest.id);
      if (this.recent.length > 4) this.recent.shift();
      this.setRoute(route);
      return true;
    }
    return false;
  }

  setRoute(route) {
    this.route = route;
    this.cum = [0];
    for (let i = 1; i < route.length; i++) this.cum.push(this.cum[i - 1] + distance(route[i - 1], route[i]));
    this.s = 0;
  }

  // Van dikembalikan ke jalur (tersangkut atau terlalu jauh dari rute).
  recover() {
    const { game } = this;
    const p = alongRoute(this.route, this.cum, this.s + 6);
    game.car.reset({ x: p.x, z: p.z, heading: p.dir });
    game.car.vx = Math.sin(p.dir) * 8;
    game.car.vz = Math.cos(p.dir) * 8;
    this.s += 6;
    this.stuck = 0;
    this.reroutes += 1;
  }

  // Mobil NPC di depan van? Mengembalikan jarak bersih terdekat (Infinity bila bebas).
  gapAhead() {
    const car = this.game.car;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let best = Infinity;
    for (const c of this.game.traffic.cars) {
      if (c.hidden) continue;
      const dx = c.x - car.x;
      const dz = c.z - car.z;
      const along = dx * fx + dz * fz;
      if (along < 0 || along > 26) continue;
      const lat = Math.abs(-dx * fz + dz * fx);
      if (lat < car.radius + c.width / 2 + 0.8) best = Math.min(best, along - c.length / 2 - car.radius);
    }
    return best;
  }

  // Mengembalikan kontrol { throttle, steer, handbrake } untuk Car.update.
  update(dt) {
    const { game } = this;
    const car = game.car;
    if (!this.route || this.s >= this.cum[this.cum.length - 1] - 10) {
      if (!this.pickRoute()) return { throttle: 0, steer: 0, handbrake: false };
    }
    // Statistik jarak tempuh.
    if (this.lastPos) this.distance += Math.hypot(car.x - this.lastPos.x, car.z - this.lastPos.z);
    this.lastPos = { x: car.x, z: car.z };

    // Kemajuan di rute: titik terdekat di depan posisi sebelumnya.
    let best = this.s;
    let bestD = Infinity;
    for (let s = Math.max(0, this.s - 4); s <= Math.min(this.cum[this.cum.length - 1], this.s + 30); s += 2) {
      const p = alongRoute(this.route, this.cum, s);
      const d = Math.hypot(p.x - car.x, p.z - car.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    this.s = Math.max(this.s, best);
    if (bestD > 22) {
      this.recover();
      return { throttle: 0, steer: 0, handbrake: false };
    }

    // Tersangkut: hampir diam terlalu lama.
    this.stuck = car.speed < 1.2 && !car.airborne ? this.stuck + dt : 0;
    if (this.stuck > 2.6) {
      this.recover();
      return { throttle: 0, steer: 0, handbrake: false };
    }

    // Pure pursuit: kejar titik di depan.
    const speed = car.speed;
    const look = clamp(7 + speed * 0.5, 9, 22);
    const target = alongRoute(this.route, this.cum, this.s + look);
    const want = Math.atan2(target.x - car.x, target.z - car.z);
    const err = angleDiff(car.heading, want);
    const steer = clamp(err * 1.7, -1, 1);

    // Kecepatan dari kelengkungan rute di depan.
    const here = alongRoute(this.route, this.cum, this.s + 4);
    const ahead = alongRoute(this.route, this.cum, this.s + 14 + speed * 1.1);
    const turn = Math.abs(angleDiff(here.dir, ahead.dir));
    const cruise = game.cfg.car.maxSpeed * 0.86;
    let targetSpeed = Math.max(7.5, cruise * (1 - clamp(turn / 1.3, 0, 1) * 0.68));
    const gap = this.gapAhead();
    if (gap < 20) targetSpeed = Math.min(targetSpeed, Math.max(2, gap * 0.9));
    let throttle = 0;
    if (speed < targetSpeed - 0.8) throttle = 1;
    else if (speed > targetSpeed + 4) throttle = -1;

    // Gaya: handbrake sebentar di tikungan cepat supaya drift (dan turbo).
    this.handbrakeCooldown -= dt;
    if (this.handbrake > 0) this.handbrake -= dt;
    else if (this.handbrakeCooldown <= 0 && speed > 12 && turn > 0.45 && Math.abs(err) > 0.18 && gap > 25 && !car.airborne && this.rng.chance(0.8)) {
      this.handbrake = 0.55 + this.rng.next() * 0.5;
      this.handbrakeCooldown = 3 + this.rng.next() * 4;
      this.drifts += 1;
    } else if (this.handbrakeCooldown <= 0 && turn > 0.55) this.handbrakeCooldown = 1.5;
    if (this.handbrake > 0) throttle = Math.max(throttle, 0.4);

    return { throttle, steer, handbrake: this.handbrake > 0 };
  }
}
