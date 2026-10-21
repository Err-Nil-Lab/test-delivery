import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world.js';
import { resample, nearestOnPolyline } from '../src/sim/geometry.js';
import { CONFIG } from '../src/config.js';

const world = createWorld();
const RADIUS = 1.6;
const CLIMB = CONFIG.car.maxClimbSlope;

// Flood fill berarah di grid 1 unit: van boleh pindah ke sel tetangga kalau tidak tertutup collider
// dan tanjakannya tidak melebihi batas panjat. Turun selalu boleh.
const b = world.bounds;
const W = Math.ceil(b.maxX - b.minX);
const H = Math.ceil(b.maxZ - b.minZ);
const heights = new Float32Array(W * H);
const blocked = new Uint8Array(W * H);
const onHillRoad = new Uint8Array(W * H);
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const x = b.minX + i + 0.5;
    const z = b.minZ + j + 0.5;
    const k = j * W + i;
    heights[k] = world.heightAt(x, z);
    blocked[k] = world.isBlocked(x, z, RADIUS) ? 1 : 0;
    onHillRoad[k] = world.hillRoads.some((r) => nearestOnPolyline(r.points, r.closed, x, z).dist <= r.width / 2) ? 1 : 0;
  }
}
const cellOf = (p) => Math.floor(p.z - b.minZ) * W + Math.floor(p.x - b.minX);

function flood(start, { reverse = false, avoidHillRoad = false } = {}) {
  const seen = new Uint8Array(W * H);
  const queue = [cellOf(start)];
  seen[queue[0]] = 1;
  while (queue.length) {
    const k = queue.pop();
    const i = k % W;
    const j = (k - i) / W;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nk = nj * W + ni;
      if (seen[nk] || blocked[nk] || (avoidHillRoad && onHillRoad[nk])) continue;
      const rise = reverse ? heights[k] - heights[nk] : heights[nk] - heights[k];
      if (rise > CLIMB + 0.02) continue;
      seen[nk] = 1;
      queue.push(nk);
    }
  }
  return seen;
}

const near = (seen, p) => {
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (seen[cellOf({ x: p.x + dx, z: p.z + dz })]) return true;
  return false;
};

describe('Map Olympus', () => {
  const fromHQ = flood(world.hq.spawn);

  it('semua titik paket, Gerbang Istana, dan Electrical Plant bisa dicapai dari HQ', () => {
    const targets = [...world.points, world.zeusPickup, world.plant.dropoff];
    const unreachable = targets.filter((p) => !near(fromHQ, p)).map((p) => p.name);
    expect(unreachable).toEqual([]);
  });

  it('tidak ada tempat yang bisa dimasuki tapi tidak bisa ditinggalkan (van tidak pernah terjebak)', () => {
    const toHQ = flood(world.hq.spawn, { reverse: true });
    let trapped = 0;
    for (let k = 0; k < W * H; k++) if (fromHQ[k] && !toHQ[k]) trapped++;
    expect(trapped).toBe(0);
  });

  it('lereng gunung bisa dijelajahi', () => {
    let hill = 0;
    let reached = 0;
    for (let k = 0; k < W * H; k++) {
      if (heights[k] <= 0.5) continue;
      hill++;
      if (fromHQ[k]) reached++;
    }
    expect(reached / hill).toBeGreaterThan(0.9);
  });

  it('naik ke plant tidak bisa lewat luar jalan', () => {
    const offRoad = flood(world.ref.serpentineFoot, { avoidHillRoad: true });
    expect(near(offRoad, world.plant.dropoff)).toBe(false);
  });

  it('turun dari dekat plant ke kota bisa tanpa jalan', () => {
    const below = { x: world.plant.dropoff.x, z: world.plant.dropoff.z + 8 };
    const offRoad = flood(below, { avoidHillRoad: true });
    expect(near(offRoad, world.ref.cityRoad)).toBe(true);
  });

  it('jalan gunung tidak pernah lebih curam dari batas panjat', () => {
    for (const road of world.hillRoads) {
      const pts = resample(road.points, 0.5, road.closed);
      for (let i = 1; i < pts.length; i++) {
        const rise = Math.abs(world.heightAt(pts[i].x, pts[i].z) - world.heightAt(pts[i - 1].x, pts[i - 1].z)) / 0.5;
        expect(rise, road.id).toBeLessThan(CLIMB);
      }
    }
  });

  it('dua gubuk di open field: Gembala di zona petir, Penebang dijaga Minotaur', () => {
    const shepherd = world.points.find((p) => p.id === 'hut-shepherd');
    const woodcutter = world.points.find((p) => p.id === 'hut-woodcutter');
    expect(world.inZeusZone(shepherd.x, shepherd.z)).toBe(true);
    expect(world.heightAt(shepherd.x, shepherd.z)).toBeGreaterThan(5);
    expect(world.inZeusZone(woodcutter.x, woodcutter.z)).toBe(false);
    const guard = world.minotaurSpawns.find((m) => m.id === 'woodcutter');
    const t = guard.territory;
    expect(woodcutter.x > t.minX && woodcutter.x < t.maxX && woodcutter.z > t.minZ && woodcutter.z < t.maxZ).toBe(true);
    // Wilayah Minotaur penjaga datar.
    for (let x = t.minX; x <= t.maxX; x += 2) for (let z = t.minZ; z <= t.maxZ; z += 2) expect(world.heightAt(x, z)).toBeLessThan(0.5);
  });

  it('tidak ada titik paket yang tertutup gedung atau tebing', () => {
    const blocked = [...world.points, world.zeusPickup, world.plant.dropoff].filter((p) => world.isBlocked(p.x, p.z, RADIUS));
    expect(blocked.map((p) => p.name)).toEqual([]);
  });

  it('jalan berkelok ke plant tidak tertutup apa pun', () => {
    for (const road of world.hillRoads) {
      for (const p of resample(road.points, 2, road.closed)) {
        expect(world.isBlocked(p.x, p.z, RADIUS), `${road.id} @ ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(false);
      }
    }
  });

  it('gunung menanjak ke arah plant; kota dan padang datar', () => {
    const plant = world.heightAt(world.plant.dropoff.x, world.plant.dropoff.z);
    const top = world.heightAt(world.ref.serpentineTop.x, world.ref.serpentineTop.z);
    const foot = world.heightAt(world.ref.serpentineFoot.x, world.ref.serpentineFoot.z);
    expect(plant).toBeGreaterThan(top);
    expect(top).toBeGreaterThan(foot);
    expect(world.heightAt(world.ref.cityRoad.x, world.ref.cityRoad.z)).toBe(0);
    expect(world.heightAt(world.ref.meadow.x, world.ref.meadow.z)).toBe(0);
  });

  it('ada distrik kota, perumahan, istana, dan padang Minotaur', () => {
    const kinds = new Set(world.buildings.map((b) => b.kind));
    for (const k of ['city', 'house', 'palace', 'plant', 'hq']) expect(kinds.has(k)).toBe(true);
    const districts = new Set(world.points.map((p) => p.district));
    for (const d of ['city', 'housing', 'palace', 'meadow', 'mountain', 'field']) expect(districts.has(d)).toBe(true);
    expect(world.minotaurSpawns).toHaveLength(3);
  });

  it('gedung tidak menutupi jalan', () => {
    for (const b of world.buildings) {
      for (const road of world.roads) {
        if (road.kind === 'path') continue;
        for (const p of resample(road.points, 2, road.closed)) {
          const dx = p.x - b.cx;
          const dz = p.z - b.cz;
          const lx = dx * Math.cos(b.rot) + dz * Math.sin(b.rot);
          const lz = -dx * Math.sin(b.rot) + dz * Math.cos(b.rot);
          const inside = Math.abs(lx) < b.hw && Math.abs(lz) < b.hd;
          expect(inside, `${b.kind} menutupi ${road.id}`).toBe(false);
        }
      }
    }
  });

  it('hirarki jalan: jalan utama paling cepat, jalan kecil lebih pelan, luar jalan paling pelan', () => {
    const at = (kind) => {
      const r = world.roads.find((x) => x.kind === kind);
      const p = r.points[Math.floor(r.points.length / 2)];
      return world.speedAt(p.x, p.z);
    };
    expect(at('main')).toBeGreaterThan(at('street'));
    expect(at('street')).toBeGreaterThan(at('path'));
    const widths = Object.fromEntries(world.roads.map((r) => [r.kind, r.width]));
    expect(widths.main).toBeGreaterThan(widths.street);
    expect(widths.street).toBeGreaterThan(widths.path);
    // Rumput jauh dari jalan & kota.
    const grass = world.vegetation.find((v) => v.kind === 'olive' && world.heightAt(v.x, v.z) === 0);
    expect(world.speedAt(grass.x, grass.z)).toBeLessThan(at('street'));
  });

  it('vegetasi: banyak pohon, tidak di jalan, tidak menutupi titik paket', () => {
    const trees = world.vegetation.filter((v) => ['olive', 'cypress', 'pine', 'palm'].includes(v.kind));
    expect(trees.length).toBeGreaterThan(200);
    for (const v of world.vegetation) {
      for (const r of world.roads) expect(nearestOnPolyline(r.points, r.closed, v.x, v.z).dist).toBeGreaterThan(r.width / 2);
      for (const p of world.points) expect(Math.hypot(p.x - v.x, p.z - v.z)).toBeGreaterThan(6);
    }
  });

  it('pohon hanya bisa ditabrak di tanah datar', () => {
    for (const v of world.vegetation.filter((t) => t.collide)) expect(world.heightAt(v.x, v.z)).toBe(0);
  });
});
