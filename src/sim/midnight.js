// Tengah malam (24:00): hukuman Zeus untuk van yang masih di luar HQ.
// warn → strike (petir raksasa, pasti kena) → paralyzed (van lumpuh) → arrive (mobil derek tiba)
//      → hook → tow (van diseret ke HQ) → done (hari berakhir dengan biaya derek).
// Sim memegang urutan (deterministik, bisa dites); render & audio hanya bereaksi pada event bus.
import { buildRoadGraph, findRoute } from './navigation.js';
import { distance } from './geometry.js';

export const MIDNIGHT = { IDLE: 'idle', WARN: 'warn', PARALYZED: 'paralyzed', ARRIVE: 'arrive', HOOK: 'hook', TOW: 'tow', DONE: 'done' };

// Titik di sepanjang polyline pada jarak s, plus arah.
function along(route, s) {
  let rest = s;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const len = distance(a, b);
    if (rest <= len || i === route.length - 1) {
      const t = len > 1e-6 ? Math.min(1, rest / len) : 0;
      const d = len > 1e-6 ? { x: (b.x - a.x) / len, z: (b.z - a.z) / len } : { x: 0, z: 1 };
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: d.x, dz: d.z };
    }
    rest -= len;
  }
  return { ...route[0], dx: 0, dz: 1 };
}

const TOW_GAP = 5.4; // jarak mobil derek di depan van saat mengait
const length = (route) => route.slice(1).reduce((sum, p, i) => sum + distance(route[i], p), 0);

export class MidnightSequence {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.phase = MIDNIGHT.IDLE;
    this.t = 0;
    this.truck = null; // { x, z, heading, hooked }
    this.route = null;
    this.target = null;
    this.warnStarted = false;
  }

  get active() {
    return this.phase !== MIDNIGHT.IDLE && this.phase !== MIDNIGHT.DONE;
  }

  // 0..1 progres peringatan (untuk lingkaran yang mengisi).
  get warnProgress() {
    return this.phase === MIDNIGHT.WARN ? Math.min(1, this.t / this.cfg.warnSeconds) : this.phase === MIDNIGHT.IDLE ? 0 : 1;
  }

  start() {
    const { game } = this;
    this.phase = MIDNIGHT.WARN;
    this.t = 0;
    // Titik sambaran dikunci di posisi van saat ini (van sudah direm); pasti kena.
    this.target = { x: game.car.x, z: game.car.z };
    game.bus.emit('midnight_start', { x: this.target.x, z: this.target.z });
    game.bus.emit('midnight_warning', { x: this.target.x, z: this.target.z, radius: this.cfg.warnRadius, seconds: this.cfg.warnSeconds });
  }

  update(dt) {
    if (!this.active) return;
    const { game, cfg } = this;
    const car = game.car;
    this.t += dt;
    switch (this.phase) {
      case MIDNIGHT.WARN: {
        // Van melambat sendiri; sambaran jatuh di tempat van berada saat ini.
        this.target = { x: car.x, z: car.z };
        if (this.t >= cfg.warnSeconds) this.strike();
        break;
      }
      case MIDNIGHT.PARALYZED:
        if (this.t >= cfg.paralyzedSeconds) this.callTruck();
        break;
      case MIDNIGHT.ARRIVE: {
        const k = Math.min(1, this.t / cfg.arriveSeconds);
        const e = 1 - (1 - k) * (1 - k); // melambat saat tiba
        const p = along(this.route, TOW_GAP + (this.truckStartS - TOW_GAP) * (1 - e));
        this.truck.x = p.x;
        this.truck.z = p.z;
        this.truck.heading = Math.atan2(-p.dx, -p.dz); // menghadap van (arah berlawanan rute)
        if (k >= 1) {
          this.phase = MIDNIGHT.HOOK;
          this.t = 0;
          game.bus.emit('midnight_tow_arrive', { x: this.truck.x, z: this.truck.z });
        }
        break;
      }
      case MIDNIGHT.HOOK: {
        // Mobil derek berputar menghadap HQ sambil mengaitkan van.
        const p = along(this.route, 0);
        const want = Math.atan2(p.dx, p.dz);
        let dh = want - this.truck.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        this.truck.heading += dh * Math.min(1, dt * 6);
        this.truck.hooked = true;
        if (this.t >= cfg.hookSeconds) {
          this.phase = MIDNIGHT.TOW;
          this.t = 0;
          game.bus.emit('midnight_tow_start', {});
        }
        break;
      }
      case MIDNIGHT.TOW: {
        const k = Math.min(1, this.t / cfg.towSeconds);
        const e = k * k * (3 - 2 * k);
        const s = Math.max(0, this.routeLength - TOW_GAP) * e; // posisi van di rute; truk TOW_GAP di depannya
        const p = along(this.route, s + TOW_GAP);
        this.truck.x = p.x;
        this.truck.z = p.z;
        this.truck.heading = Math.atan2(p.dx, p.dz);
        this.hookVan(s);
        if (k >= 1) {
          this.phase = MIDNIGHT.DONE;
          game.bus.emit('midnight_done', {});
        }
        break;
      }
      default:
        break;
    }
  }

  strike() {
    const { game, cfg } = this;
    const car = game.car;
    this.phase = MIDNIGHT.PARALYZED;
    this.t = 0;
    // Hukuman Zeus: pasti kena, tidak bisa ditahan blessing atau penangkal petir.
    car.vx = 0;
    car.vz = 0;
    car.spin = 0;
    car.paralyzed = true;
    game.packages.jolt('midnight', game.clock.hour);
    game.bus.emit('midnight_strike', { x: car.x, z: car.z, radius: cfg.strikeRadius });
  }

  // Mobil derek datang dari sisi HQ lewat jalan terdekat.
  callTruck() {
    const { game, cfg } = this;
    const hq = game.world.hq.spawn;
    game.nav.graph ??= buildRoadGraph(game.world, game.cfg.gps);
    let route = findRoute(game.nav.graph, game.car, hq, { heightAt: game.world.heightAt });
    if (!route || route.length < 2) route = [{ x: game.car.x, z: game.car.z }, { x: hq.x, z: hq.z }];
    this.route = route;
    this.routeLength = Math.max(1, length(route));
    this.truckStartS = Math.min(cfg.truckDistance, this.routeLength * 0.6);
    const p = along(route, this.truckStartS);
    this.truck = { x: p.x, z: p.z, heading: Math.atan2(-p.dx, -p.dz), hooked: false };
    this.phase = MIDNIGHT.ARRIVE;
    this.t = 0;
    game.bus.emit('midnight_tow_call', { x: p.x, z: p.z });
  }

  // Van ikut terseret: tepat di jalur rute, searah gerak, TOW_GAP di belakang mobil derek.
  hookVan(s) {
    const car = this.game.car;
    const p = along(this.route, s);
    car.x = p.x;
    car.z = p.z;
    car.heading = Math.atan2(p.dx, p.dz);
    car.vx = 0;
    car.vz = 0;
  }
}
