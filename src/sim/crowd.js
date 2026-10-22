// Pejalan kaki dan hewan. Mereka bukan collider: van tidak bisa menabrak mereka karena mereka
// SELALU sempat menghindar (lompat ke samping sambil berteriak) saat van melaju ke arahnya.
// Pejalan kaki berjalan di trotoar, kadang diam atau menyeberang; saat badai mereka lari masuk rumah.
// Hewan (domba, ayam, kambing) berkeliaran di area rumahnya dan kabur saat van mendekat.
import { buildSidewalks, samplePath, projectOnPath } from './lanes.js';
import { nearestOnPolyline, pointInPolygon } from './geometry.js';

export const NPC_STATE = {
  WALK: 'walk',
  IDLE: 'idle',
  CROSS: 'cross',
  DODGE: 'dodge',
  SIT: 'sit',
  RETURN: 'return',
  FLEE: 'flee',
  HOME: 'home',
  HIDDEN: 'hidden',
};
const S = NPC_STATE;

function centroid(poly) {
  return { x: poly.reduce((a, p) => a + p.x, 0) / poly.length, z: poly.reduce((a, p) => a + p.z, 0) / poly.length };
}

export class CrowdSystem {
  constructor(world, cfg, rng, bus) {
    this.world = world;
    this.cfg = cfg;
    this.rng = rng;
    this.bus = bus;
    this.sidewalks = buildSidewalks(world.roads, { paved: world.paved, isBlocked: world.isBlocked });
    for (const piece of this.sidewalks) piece.district = this.districtOf(samplePath(piece.path, piece.path.length / 2));
    this.homes = this.animalHomes();
    this.people = [];
    this.animals = [];
    this.flockCooldown = new Map();
    bus.on('strike', (s) => this.onStrike(s));
  }

  districtOf(p) {
    let best = null;
    for (const e of this.world.paved) {
      const v = ((p.x - e.cx) / e.rx) ** 2 + ((p.z - e.cz) / e.rz) ** 2;
      if (!best || v < best.v) best = { v, district: e.district };
    }
    return best.district;
  }

  // Area rumah tiap kawanan: domba di ladang & dekat Gubuk Gembala, ayam di perumahan & ladang,
  // kambing di teras lereng gunung.
  animalHomes() {
    const w = this.world;
    const housingN = w.roads.find((r) => r.id === 'housing-n');
    const fields = w.fields.map(centroid);
    const hillSpots = [];
    for (let x = w.bounds.minX; x < w.bounds.maxX; x += 6) {
      for (let z = w.bounds.minZ; z < w.bounds.maxZ; z += 6) {
        const h = w.heightAt(x, z);
        if (!w.inHill(x, z) || h < 5 || h > w.summitHeight * 0.75 || w.inZeusZone(x, z)) continue;
        if (w.hillRoads.some((r) => nearestOnPolyline(r.points, r.closed, x, z).dist < r.width / 2 + 6)) continue;
        hillSpots.push({ x, z });
      }
    }
    const goats = [hillSpots[Math.floor(hillSpots.length * 0.3)], hillSpots[Math.floor(hillSpots.length * 0.75)]].filter(Boolean);
    return {
      sheep: [fields[2] ?? fields[0], w.ref.shepherdHut],
      chicken: [housingN.points[Math.floor(housingN.points.length / 2)], fields[0]],
      goat: goats,
    };
  }

  get all() {
    return [...this.people, ...this.animals];
  }

  // Posisi yang dipakai lalu lintas untuk mengerem (orang & hewan yang terlihat).
  walkers() {
    return this.all.filter((a) => a.state !== S.HIDDEN);
  }

  // mult: pengali jumlah pejalan kaki hari ini (titah dewa).
  reset({ mult = 1 } = {}) {
    this.people = [];
    this.animals = [];
    this.peopleMult = mult;
    if (this.cfg.pedestrians.enabled) this.spawnPeople();
    if (this.cfg.animals.enabled) this.spawnAnimals();
  }

  spawnPeople() {
    const pc = this.cfg.pedestrians;
    for (const district of ['city', 'housing', 'palace']) {
      const pieces = this.sidewalks.filter((p) => p.district === district);
      const total = pieces.reduce((a, p) => a + p.path.length, 0);
      if (!total) continue;
      for (let i = 0; i < Math.round((pc[district] ?? 0) * (this.peopleMult ?? 1)); i++) {
        let r = this.rng.next() * total;
        const piece = pieces.find((p) => (r -= p.path.length) <= 0) ?? pieces[0];
        const person = {
          id: this.people.length,
          kind: 'person',
          district,
          piece,
          s: this.rng.range(0, piece.path.length),
          dir: this.rng.chance(0.5) ? 1 : -1,
          speed: this.rng.range(pc.walkSpeed[0], pc.walkSpeed[1]),
          state: S.WALK,
          t: 0,
          colorSeed: this.rng.next(),
          x: 0,
          z: 0,
          heading: 0,
          vx: 0,
          vz: 0,
          hop: 0,
          zap: 0,
        };
        this.placeOnPiece(person);
        this.people.push(person);
      }
    }
  }

  spawnAnimals() {
    const ac = this.cfg.animals;
    for (const kind of ['sheep', 'chicken', 'goat']) {
      const c = ac[kind];
      const homes = this.homes[kind].slice(0, c.flocks);
      homes.forEach((home, flock) => {
        for (let i = 0; i < c.perFlock; i++) {
          const spot = this.randomSpot(kind, home, c.area * 0.6) ?? home;
          this.animals.push({
            id: this.animals.length,
            kind,
            flock: `${kind}-${flock}`,
            home,
            x: spot.x,
            z: spot.z,
            heading: this.rng.range(0, Math.PI * 2),
            state: S.IDLE,
            t: this.rng.range(0, 3),
            target: null,
            vx: 0,
            vz: 0,
            hop: 0,
            zap: 0,
            colorSeed: this.rng.next(),
          });
        }
      });
    }
  }

  // Titik acak di area rumah yang bisa didatangi (tidak di gedung/pohon/laut).
  randomSpot(kind, home, radius) {
    for (let tries = 0; tries < 8; tries++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(this.rng.next()) * radius;
      const x = home.x + Math.cos(a) * r;
      const z = home.z + Math.sin(a) * r;
      if (this.world.isBlocked(x, z, 0.6) || pointInPolygon(this.world.regions.sea, x, z)) continue;
      return { x, z };
    }
    return null;
  }

  placeOnPiece(p) {
    const q = samplePath(p.piece.path, p.s);
    p.x = q.x;
    p.z = q.z;
    p.heading = Math.atan2(q.dx * p.dir, q.dz * p.dir);
  }

  update(dt, { van, phase }) {
    if (phase === 'storm' && !this.stormStarted) this.startStorm(van);
    if (phase !== 'storm') this.stormStarted = false;
    for (const [k, v] of this.flockCooldown) this.flockCooldown.set(k, v - dt);
    for (const p of this.people) this.updatePerson(p, dt, van);
    for (const a of this.animals) this.updateAnimal(a, dt, van);
  }

  // Van melaju lurus ke arah agen dan akan sampai sebentar lagi? Kembalikan arah lompat (vektor samping).
  threat(agent, van) {
    const d = this.cfg.dodge;
    const speed = van.speed;
    const dx = agent.x - van.x;
    const dz = agent.z - van.z;
    const dist = Math.hypot(dx, dz);
    // Pengaman terakhir: van sudah nyaris menyentuh.
    if (dist < van.radius + 1 && speed > 1) return this.sideAway(agent, van, dx, dz, speed);
    if (speed < d.minVanSpeed || dist > d.radius) return null;
    const ux = van.vx / speed;
    const uz = van.vz / speed;
    const along = dx * ux + dz * uz;
    const lat = -dx * uz + dz * ux;
    if (along < -0.5 || Math.abs(lat) > d.lane || along / speed > d.timeToHit) return null;
    return this.sideAway(agent, van, dx, dz, speed);
  }

  sideAway(agent, van, dx, dz, speed) {
    const ux = speed > 0.1 ? van.vx / speed : dx / (Math.hypot(dx, dz) || 1);
    const uz = speed > 0.1 ? van.vz / speed : dz / (Math.hypot(dx, dz) || 1);
    const lat = -dx * uz + dz * ux;
    let side = lat >= 0 ? 1 : -1;
    // Lompat ke sisi yang tidak tertutup gedung.
    const reach = this.cfg.dodge.speed * this.cfg.dodge.seconds;
    const blocked = (s) => this.world.isBlocked(agent.x - uz * s * reach, agent.z + ux * s * reach, 0.4);
    if (blocked(side) && !blocked(-side)) side = -side;
    return { x: -uz * side, z: ux * side };
  }

  // Diklakson mobil NPC: minggir ke samping, menjauhi lajur mobil.
  scare(agent, car) {
    if (agent.state === S.DODGE || agent.state === S.HIDDEN) return;
    const lat = -(agent.x - car.x) * car.dirZ + (agent.z - car.z) * car.dirX;
    const side = lat >= 0 ? 1 : -1;
    this.startDodge(agent, { x: -car.dirZ * side, z: car.dirX * side }, false);
  }

  startDodge(agent, dir, announce = true) {
    const d = this.cfg.dodge;
    agent.state = S.DODGE;
    agent.t = d.seconds;
    agent.vx = dir.x * d.speed;
    agent.vz = dir.z * d.speed;
    agent.heading = Math.atan2(dir.x, dir.z);
    if (announce) this.bus.emit('npc_dodge', { x: agent.x, z: agent.z, kind: agent.kind });
  }

  // Gerak bebas (menghindar/kabur): berhenti di depan gedung/pohon, tidak menembus.
  moveFree(agent, dt) {
    const nx = agent.x + agent.vx * dt;
    const nz = agent.z + agent.vz * dt;
    if (!this.world.isBlocked(nx, nz, 0.3)) {
      agent.x = nx;
      agent.z = nz;
    } else {
      agent.vx = 0;
      agent.vz = 0;
    }
  }

  updatePerson(p, dt, van) {
    const pc = this.cfg.pedestrians;
    const d = this.cfg.dodge;
    p.zap = Math.max(0, p.zap - dt);
    if (p.state === S.HIDDEN) return;
    if (p.state !== S.DODGE && p.state !== S.HOME) {
      const dir = this.threat(p, van);
      if (dir) this.startDodge(p, dir);
    }
    p.t -= dt;
    switch (p.state) {
      case S.WALK: {
        p.s += p.dir * p.speed * dt;
        if (p.s <= 0 || p.s >= p.piece.path.length) {
          p.s = Math.max(0, Math.min(p.piece.path.length, p.s));
          p.dir = -p.dir;
        }
        this.placeOnPiece(p);
        if (this.rng.chance(pc.idleChance * dt)) {
          p.state = S.IDLE;
          p.t = this.rng.range(2, 5);
        } else if (this.rng.chance(pc.crossChance * dt)) this.tryCross(p);
        break;
      }
      case S.IDLE:
        if (p.t <= 0) p.state = S.WALK;
        break;
      case S.CROSS: {
        const dx = p.cross.x - p.x;
        const dz = p.cross.z - p.z;
        const dist = Math.hypot(dx, dz);
        const step = p.speed * 1.2 * dt;
        if (dist <= step) {
          p.piece = p.cross.piece;
          p.s = p.cross.s;
          p.cross = null;
          p.state = S.WALK;
          this.placeOnPiece(p);
        } else {
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          p.heading = Math.atan2(dx, dz);
        }
        break;
      }
      case S.DODGE:
        this.moveFree(p, dt);
        p.hop = 1 - Math.max(0, p.t) / d.seconds;
        if (p.t <= 0) {
          p.state = S.SIT;
          p.t = d.sitSeconds;
          p.hop = 0;
          p.vx = 0;
          p.vz = 0;
        }
        break;
      case S.SIT:
        if (p.t <= 0) {
          p.state = S.RETURN;
          p.s = projectOnPath(p.piece.path, p.x, p.z).s;
        }
        break;
      case S.RETURN: {
        const q = samplePath(p.piece.path, p.s);
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const dist = Math.hypot(dx, dz);
        const step = p.speed * 1.2 * dt;
        if (dist <= step) {
          p.state = S.WALK;
          this.placeOnPiece(p);
        } else {
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          p.heading = Math.atan2(dx, dz);
        }
        break;
      }
      case S.HOME: {
        const dx = p.target.x - p.x;
        const dz = p.target.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < p.target.r || p.t <= 0) {
          p.state = S.HIDDEN;
          break;
        }
        p.heading = Math.atan2(dx, dz);
        p.vx = (dx / dist) * 3.2;
        p.vz = (dz / dist) * 3.2;
        const bx = p.x;
        const bz = p.z;
        this.moveFree(p, dt);
        // Tersangkut di pojok gedung = sudah sampai pintu.
        if (bx === p.x && bz === p.z) p.state = S.HIDDEN;
        break;
      }
      default:
        break;
    }
  }

  // Menyeberang ke trotoar seberang jalan yang sama (kalau ada).
  tryCross(p) {
    const road = p.piece.road;
    const n = nearestOnPolyline(road.points, road.closed, p.x, p.z);
    const tx = n.x + (n.x - p.x);
    const tz = n.z + (n.z - p.z);
    let best = null;
    for (const piece of this.sidewalks) {
      if (piece.road !== road || piece.side === p.piece.side) continue;
      const proj = projectOnPath(piece.path, tx, tz);
      if (proj.dist < 2.5 && (!best || proj.dist < best.dist)) best = { piece, ...proj };
    }
    if (!best) return;
    const q = samplePath(best.piece.path, best.s);
    p.state = S.CROSS;
    p.cross = { piece: best.piece, s: best.s, x: q.x, z: q.z };
  }

  updateAnimal(a, dt, van) {
    const c = this.cfg.animals[a.kind];
    const d = this.cfg.dodge;
    a.zap = Math.max(0, a.zap - dt);
    if (a.state !== S.DODGE) {
      const dir = this.threat(a, van);
      if (dir) {
        this.startDodge(a, dir);
        return;
      }
    }
    a.t -= dt;
    const vanDist = Math.hypot(van.x - a.x, van.z - a.z);
    if (a.state !== S.DODGE && a.state !== S.FLEE && vanDist < c.fleeRadius && van.speed > 2) {
      // Kabur menjauhi van; ayam zig-zag.
      const ux = (a.x - van.x) / (vanDist || 1);
      const uz = (a.z - van.z) / (vanDist || 1);
      const j = this.rng.range(-0.6, 0.6);
      a.state = S.FLEE;
      a.t = this.rng.range(1.2, 1.9);
      a.vx = (ux - uz * j) * c.fleeSpeed;
      a.vz = (uz + ux * j) * c.fleeSpeed;
      a.heading = Math.atan2(a.vx, a.vz);
      if ((this.flockCooldown.get(a.flock) ?? 0) <= 0) {
        this.flockCooldown.set(a.flock, 3);
        this.bus.emit('npc_dodge', { x: a.x, z: a.z, kind: a.kind });
      }
    }
    switch (a.state) {
      case S.IDLE:
        if (a.t <= 0) {
          a.target = this.randomSpot(a.kind, a.home, c.area);
          a.state = a.target ? S.WALK : S.IDLE;
          a.t = this.rng.range(1.5, 4.5);
        }
        break;
      case S.WALK: {
        const dx = a.target.x - a.x;
        const dz = a.target.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.3 || a.t <= -8) {
          a.state = S.IDLE;
          a.t = this.rng.range(1.5, 5);
          break;
        }
        a.vx = (dx / dist) * c.speed;
        a.vz = (dz / dist) * c.speed;
        a.heading = Math.atan2(dx, dz);
        this.moveFree(a, dt);
        break;
      }
      case S.FLEE:
        if (a.kind === 'chicken') {
          const wob = Math.sin(a.t * 18) * 0.5;
          a.vx += -a.vz * wob * dt * 4;
          a.vz += a.vx * wob * dt * 4;
        }
        // Jangan lari terlalu jauh dari rumah.
        if (Math.hypot(a.x - a.home.x, a.z - a.home.z) > c.area * 1.8) {
          a.vx = (a.home.x - a.x) * 0.5;
          a.vz = (a.home.z - a.z) * 0.5;
        }
        this.moveFree(a, dt);
        a.hop = a.kind === 'goat' ? (a.t % 0.5) / 0.5 : 0;
        if (a.t <= 0) {
          a.state = S.IDLE;
          a.hop = 0;
          a.t = this.rng.range(1, 3);
        }
        break;
      case S.DODGE:
        this.moveFree(a, dt);
        a.hop = 1 - Math.max(0, a.t) / d.seconds;
        if (a.t <= 0) {
          a.state = S.IDLE;
          a.hop = 0;
          a.t = this.rng.range(1, 2);
        }
        break;
      default:
        break;
    }
  }

  // Badai: orang lari masuk ke gedung terdekat. Hewan tetap di luar (kasihan).
  startStorm() {
    this.stormStarted = true;
    const homes = this.world.buildings.filter((b) => b.kind === 'city' || b.kind === 'house' || b.kind === 'palace');
    for (const p of this.people) {
      if (p.state === S.HIDDEN) continue;
      let best = null;
      for (const b of homes) {
        const dist = Math.hypot(b.cx - p.x, b.cz - p.z);
        if (!best || dist < best.dist) best = { dist, b };
      }
      p.state = S.HOME;
      p.t = 8;
      p.target = { x: best.b.cx, z: best.b.cz, r: Math.max(best.b.hw, best.b.hd) + 0.6 };
    }
  }

  onStrike(s) {
    for (const a of this.all) {
      if (a.state === S.HIDDEN || Math.hypot(a.x - s.x, a.z - s.z) > (s.radius ?? 3.5) + 1) continue;
      a.zap = 1.5;
      this.bus.emit('npc_zapped', { x: a.x, z: a.z, kind: a.kind });
    }
  }
}
