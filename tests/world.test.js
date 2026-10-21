import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world.js';
import { resample } from '../src/sim/geometry.js';

const world = createWorld();
const RADIUS = 1.6;

// Flood fill dari HQ di grid 1 unit: sel yang bisa ditempati van.
function reachable() {
  const b = world.bounds;
  const W = Math.ceil(b.maxX - b.minX);
  const H = Math.ceil(b.maxZ - b.minZ);
  const seen = new Uint8Array(W * H);
  const cellOf = (x, z) => Math.floor(z - b.minZ) * W + Math.floor(x - b.minX);
  const queue = [cellOf(world.hq.spawn.x, world.hq.spawn.z)];
  seen[queue[0]] = 1;
  while (queue.length) {
    const k = queue.pop();
    const i = k % W;
    const j = Math.floor(k / W);
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
      if (seen[nk]) continue;
      seen[nk] = 2;
      if (world.isBlocked(b.minX + ni + 0.5, b.minZ + nj + 0.5, RADIUS)) continue;
      seen[nk] = 1;
      queue.push(nk);
    }
  }
  return (p) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (seen[cellOf(p.x + dx, p.z + dz)] === 1) return true;
    return false;
  };
}

describe('Map Olympus', () => {
  const canReach = reachable();

  it('semua titik paket, Gerbang Istana, dan Electrical Plant bisa dicapai dari HQ', () => {
    const targets = [...world.points, world.zeusPickup, world.plant.dropoff];
    const unreachable = targets.filter((p) => !canReach(p)).map((p) => p.name);
    expect(unreachable).toEqual([]);
  });

  it('tidak ada titik paket yang tertutup gedung atau tebing', () => {
    const blocked = [...world.points, world.zeusPickup, world.plant.dropoff].filter((p) => world.isBlocked(p.x, p.z, RADIUS));
    expect(blocked.map((p) => p.name)).toEqual([]);
  });

  it('jalan berkelok ke plant bisa dilalui dari ujung ke ujung', () => {
    for (const road of world.hillRoads) {
      for (const p of resample(road.points, 2, road.closed)) {
        expect(world.isBlocked(p.x, p.z, RADIUS), `${road.id} @ ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(false);
      }
    }
  });

  it('lereng gunung di luar jalan tidak bisa dilewati', () => {
    const foot = world.ref.serpentineFoot;
    const top = world.ref.serpentineTop;
    // Titik di antara dua baris jalan berkelok.
    const between = { x: (foot.x + top.x) / 2, z: (foot.z + top.z) / 2 + 4 };
    expect(world.hillOverflow(between.x, between.z, RADIUS).over).toBeGreaterThan(0);
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
    for (const d of ['city', 'housing', 'palace', 'meadow', 'mountain']) expect(districts.has(d)).toBe(true);
    expect(world.minotaurSpawns).toHaveLength(2);
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
});
