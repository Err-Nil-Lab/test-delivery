// Vegetasi: pohon, semak, batu yang disebar deterministik (map selalu sama).
// Kerapatan mengikuti "noise" berkelompok supaya ada hutan kecil dan padang terbuka, bukan sebaran rata.
// Pohon punya batang (collider kecil); semak dan batu kecil hanya hiasan.
import { pointInPolygon, nearestOnPolyline, hash2, inRect } from './geometry.js';

// Value noise halus 0..1 dari hash grid.
function valueNoise(x, z, cell) {
  const gx = Math.floor(x / cell);
  const gz = Math.floor(z / cell);
  const fx = x / cell - gx;
  const fz = z / cell - gz;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash2(gx, gz);
  const b = hash2(gx + 1, gz);
  const c = hash2(gx, gz + 1);
  const d = hash2(gx + 1, gz + 1);
  const top = a + (b - a) * s(fx);
  const bottom = c + (d - c) * s(fx);
  return top + (bottom - top) * s(fz);
}

const inEllipse = (e, x, z) => ((x - e.cx) / e.rx) ** 2 + ((z - e.cz) / e.rz) ** 2 <= 1;

// ctx: { bounds, roads, isBlocked, points, hqZone, regions: { sea, hill, meadow, beach, zeusZone }, paved: [ellipse],
//        fields: [polygon], territories: [rect], heightAt, summitHeight }
export function generateVegetation(ctx) {
  const items = [];
  const step = 5;
  const b = ctx.bounds;
  const keepClear = [...ctx.points, ...ctx.extraClear];
  for (let x = b.minX + 4; x < b.maxX - 4; x += step) {
    for (let z = b.minZ + 4; z < b.maxZ - 4; z += step) {
      // Jitter supaya tidak terlihat seperti grid.
      const px = x + (hash2(x, z * 1.7) - 0.5) * step * 0.9;
      const pz = z + (hash2(x * 1.3, z) - 0.5) * step * 0.9;
      if (pointInPolygon(ctx.regions.sea, px, pz)) continue;
      if (ctx.paved.some((e) => inEllipse(e, px, pz))) continue;
      if (ctx.fields.some((f) => pointInPolygon(f, px, pz))) continue;
      if (inRect(ctx.hqZone, px, pz)) continue;
      if (keepClear.some((p) => Math.hypot(p.x - px, p.z - pz) < 7)) continue;

      let roadGap = Infinity;
      for (const r of ctx.roads) roadGap = Math.min(roadGap, nearestOnPolyline(r.points, r.closed, px, pz).dist - r.width / 2);
      if (roadGap < 2.5) continue;

      const onHill = pointInPolygon(ctx.regions.hill, px, pz);
      const onBeach = pointInPolygon(ctx.regions.beach, px, pz);
      const inMeadow = pointInPolygon(ctx.regions.meadow, px, pz);
      const inTerritory = ctx.territories.some((t) => inRect(t, px, pz));

      // Kerapatan: hutan berkelompok di rumput, jarang di lereng, sangat jarang di padang Minotaur.
      const clump = valueNoise(px, pz, 38) * 0.75 + valueNoise(px, pz, 11) * 0.25;
      let density = clump > 0.55 ? 0.85 : clump > 0.42 ? 0.3 : 0.06;
      if (onHill) density *= 0.45;
      if (inMeadow) density *= 0.25;
      if (inTerritory) density *= 0.3; // padang tetap cukup terbuka untuk serudukan
      if (onBeach) density = 0.12;
      // Pohon di pinggir jalan (barisan peneduh) sedikit lebih rapat.
      if (roadGap < 7 && !onHill) density = Math.max(density, 0.25);

      const roll = hash2(px * 3.1, pz * 2.7);
      if (roll > density) {
        // Sisa tempat kosong: kadang semak atau batu kecil supaya tanah tidak polos.
        const deco = hash2(px * 5.3, pz * 4.1);
        if (deco < (onHill ? 0.18 : 0.12) && roadGap > 1.5) {
          items.push({ kind: onHill && deco < 0.1 ? 'rock' : 'bush', x: px, z: pz, s: 0.6 + deco * 3, rot: deco * 40, collide: false });
        }
        continue;
      }

      let kind;
      const h = onHill ? ctx.heightAt(px, pz) : 0;
      if (onBeach) kind = 'palm';
      else if (onHill) kind = h > ctx.summitHeight * 0.6 ? 'pine' : hash2(px, pz * 9) < 0.15 ? 'rock' : 'olive';
      else kind = hash2(px * 7, pz) < 0.4 ? 'cypress' : 'olive';
      const s = 0.8 + hash2(px * 2, pz * 5) * 0.5;
      // Batang pohon hanya bisa ditabrak di tanah datar: di lereng, pohon + undakan bisa membentuk
      // kantong yang menjebak van, jadi di sana pohon hanya hiasan.
      const flat = [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]].every(([dx, dz]) => ctx.heightAt(px + dx, pz + dz) === 0);
      const tree = { kind, x: px, z: pz, s, rot: roll * 60, collide: flat && (kind !== 'rock' || s > 1.1) };
      // Jangan menutup sesuatu yang penting (gedung, pantai, batas map).
      if (ctx.isBlocked(px, pz, 1.2)) continue;
      items.push(tree);
    }
  }
  return items;
}
