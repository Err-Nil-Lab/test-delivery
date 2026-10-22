import { describe, expect, it } from 'vitest';
import { nearestOnPolyline } from '../src/sim/geometry.js';
import { samplePath, projectOnPath } from '../src/sim/lanes.js';
import { CAR_STATE } from '../src/sim/traffic.js';
import { NPC_STATE } from '../src/sim/crowd.js';
import { newGame, stepFor, testConfig } from './helpers.js';

// Van mulai di HQ (jauh dari jalan), kecuali tes memindahkannya.
const npcGame = (overrides = {}) => newGame({ config: testConfig({ npc: { enabled: true, ...overrides } }) });
const GAS = { throttle: 1, steer: 0 };
// Van melaju lurus ke arah (tx, tz) dari jarak tertentu dengan kecepatan awal, dari arah h.
function aimVan(game, tx, tz, dist, speed, h) {
  game.car.reset({ x: tx - Math.sin(h) * dist, z: tz - Math.cos(h) * dist, heading: h });
  game.car.vx = Math.sin(h) * speed;
  game.car.vz = Math.cos(h) * speed;
}

describe('Jalur NPC', () => {
  it('lajur mobil selalu berada di atas jalannya', () => {
    const { traffic } = npcGame();
    for (const lane of traffic.lanes) {
      for (const p of lane.path.points) {
        const d = nearestOnPolyline(lane.road.points, lane.road.closed, p.x, p.z).dist;
        expect(d, lane.id).toBeLessThanOrEqual(lane.road.width / 2 + 0.01);
      }
    }
  });

  it('trotoar tidak menembus gedung', () => {
    const { crowd, world } = npcGame();
    expect(crowd.sidewalks.length).toBeGreaterThan(20);
    for (const piece of crowd.sidewalks) for (const p of piece.path.points) expect(world.isBlocked(p.x, p.z, 0.4)).toBe(false);
  });
});

describe('Lalu lintas', () => {
  it('ada puluhan mobil berbagai jenis, termasuk van saingan Iris Express', () => {
    const { traffic } = npcGame();
    expect(traffic.cars.length).toBeGreaterThan(20);
    expect(traffic.cars.some((c) => c.kind === 'rival')).toBe(true);
    expect(new Set(traffic.cars.map((c) => c.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it('mobil terus berjalan dan tidak saling menumpuk di lajur yang sama', () => {
    const game = npcGame();
    const start = new Map(game.traffic.cars.map((c) => [c, c.s]));
    let minGap = Infinity;
    for (let i = 0; i < 60 * 30; i++) {
      game.step(1 / 60, { throttle: 0, steer: 0 });
      if (i % 10) continue;
      const cars = game.traffic.cars.filter((c) => !c.hidden && c.state === CAR_STATE.DRIVE && c.ghost <= 0);
      for (const a of cars) for (const b of cars) if (a.id < b.id && a.lane === b.lane) minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z));
    }
    const moved = game.traffic.cars.filter((c) => c.s !== start.get(c)).length;
    expect(moved / game.traffic.cars.length).toBeGreaterThan(0.9);
    expect(minGap).toBeGreaterThan(2.5);
  });

  it('mengerem di belakang van yang diam, klakson, lalu menyalip', () => {
    const game = npcGame();
    const events = [];
    game.bus.on('npc_honk', (e) => events.push(e));
    const car = game.traffic.cars.find((c) => c.lane.road.kind === 'main' && c.kind === 'sedan') ?? game.traffic.cars[0];
    game.traffic.cars = [car];
    car.speed = car.cruise;
    // Van berhenti di lajur, 25 m di depan mobil.
    const p = samplePath(car.lane.path, car.s + 25);
    game.car.reset({ x: p.x, z: p.z, heading: Math.atan2(p.dx, p.dz) });
    let minDist = Infinity;
    let passed = false;
    for (let i = 0; i < 60 * 12 && !passed; i++) {
      game.step(1 / 60, { throttle: 0, steer: 0 });
      minDist = Math.min(minDist, Math.hypot(car.x - game.car.x, car.z - game.car.z));
      passed = (game.car.x - car.x) * car.dirX + (game.car.z - car.z) * car.dirZ < -car.length;
    }
    expect(minDist).toBeGreaterThan(game.car.radius); // tidak menabrak van
    expect(events.length).toBeGreaterThan(0);
    expect(passed).toBe(true);
  });

  it('ditabrak van: damage kecil, mobil NPC terpental, lalu kembali ke lajurnya', () => {
    const game = npcGame();
    const bumped = [];
    game.bus.on('npc_bumped', (e) => bumped.push(e));
    const car = game.traffic.cars.find((c) => c.lane.road.kind === 'main') ?? game.traffic.cars[0];
    game.traffic.cars = [car];
    car.speed = 0;
    car.cruise = 0;
    // Tabrak dari samping.
    const h = car.heading + Math.PI / 2;
    game.car.reset({ x: car.x - Math.sin(h) * 6, z: car.z - Math.cos(h) * 6, heading: h });
    game.car.vx = Math.sin(h) * 16;
    game.car.vz = Math.cos(h) * 16;
    for (let i = 0; i < 60 && !bumped.length; i++) game.step(1 / 60, GAS);
    expect(bumped).toHaveLength(1);
    expect(car.state).toBe(CAR_STATE.SPUN);
    expect(game.damage.total).toBeGreaterThan(0);
    game.car.reset(game.world.hq.spawn);
    stepFor(game, 4);
    expect(car.state).toBe(CAR_STATE.DRIVE);
    expect(projectOnPath(car.lane.path, car.x, car.z).dist).toBeLessThan(1.5);
  });

  it('badai: sebagian besar mobil pulang dan orang masuk rumah', () => {
    const game = npcGame();
    game.god = true;
    game.clock.setHour(20.1);
    stepFor(game, 12);
    const hiddenCars = game.traffic.cars.filter((c) => c.hidden).length;
    expect(hiddenCars / game.traffic.cars.length).toBeGreaterThan(0.5);
    const hidden = game.crowd.people.filter((p) => p.state === NPC_STATE.HIDDEN).length;
    expect(hidden / game.crowd.people.length).toBeGreaterThan(0.8);
  });

  it('npc dimatikan: map kosong dari NPC', () => {
    const game = newGame();
    expect(game.traffic.cars).toHaveLength(0);
    expect(game.crowd.people).toHaveLength(0);
    expect(game.crowd.animals).toHaveLength(0);
  });
});

describe('Pejalan kaki & hewan', () => {
  it('pejalan kaki selalu sempat melompat menghindar dari van yang ngebut', () => {
    const game = npcGame({ traffic: { ...testConfig().npc.traffic, enabled: false } });
    game.god = true;
    let dodges = 0;
    game.bus.on('npc_dodge', (e) => e.kind === 'person' && dodges++);
    const people = game.crowd.people.filter((_, i) => i % 5 === 0);
    for (const person of people) {
      // Van melaju sepanjang trotoar ke arah orang itu.
      const q = samplePath(person.piece.path, person.s);
      const h = Math.atan2(q.dx, q.dz);
      game.car.reset({ x: person.x - Math.sin(h) * 14, z: person.z - Math.cos(h) * 14, heading: h });
      game.car.vx = Math.sin(h) * 20;
      game.car.vz = Math.cos(h) * 20;
      let closest = Infinity;
      for (let i = 0; i < 60; i++) {
        game.step(1 / 60, GAS);
        closest = Math.min(closest, Math.hypot(person.x - game.car.x, person.z - game.car.z));
      }
      expect(closest, `orang #${person.id}`).toBeGreaterThan(game.car.radius + 0.3);
    }
    expect(dodges).toBeGreaterThan(0);
  });

  it('hewan kabur atau melompat dan tidak pernah tertabrak', () => {
    const game = npcGame({ traffic: { ...testConfig().npc.traffic, enabled: false } });
    game.god = true;
    const kinds = new Set();
    game.bus.on('npc_dodge', (e) => kinds.add(e.kind));
    for (const animal of game.crowd.animals.filter((_, i) => i % 3 === 0)) {
      aimVan(game, animal.x, animal.z, 13, 18, animal.id * 2.39996);
      let closest = Infinity;
      for (let i = 0; i < 60; i++) {
        game.step(1 / 60, GAS);
        closest = Math.min(closest, Math.hypot(animal.x - game.car.x, animal.z - game.car.z));
      }
      expect(closest, `${animal.kind} #${animal.id}`).toBeGreaterThan(game.car.radius + 0.2);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });

  it('hewan tetap di sekitar rumahnya', () => {
    const game = npcGame();
    stepFor(game, 60);
    for (const a of game.crowd.animals) {
      const area = game.cfg.npc.animals[a.kind].area;
      expect(Math.hypot(a.x - a.home.x, a.z - a.home.z), `${a.kind} #${a.id}`).toBeLessThan(area * 2.2);
    }
  });
});
