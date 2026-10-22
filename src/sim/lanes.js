// Jalur NPC dari jalan di map:
// - lajur mobil: tiap jalan melingkar jadi dua loop berlawanan arah; jalan terbuka jadi satu loop
//   (berangkat di satu lajur, putar balik di ujung, pulang di lajur seberang).
// - trotoar: pita di tepi jalan kota/perumahan, dipotong di tempat yang tertutup gedung.
import { resample, distance, clamp } from './geometry.js';

const LANE_KINDS = new Set(['ring', 'main', 'street', 'mountain']);
const STEP = 2;

// Polyline loop dengan panjang kumulatif dan arah per titik, untuk sampling cepat berdasarkan jarak.
export function makePath(points, closed = true) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distance(points[i - 1], points[i]));
  const length = closed ? cum[cum.length - 1] + distance(points[points.length - 1], points[0]) : cum[cum.length - 1];
  return { points, cum, length, closed };
}

// Titik dan arah di jarak s (dibungkus untuk loop, dijepit untuk polyline terbuka).
export function samplePath(path, s) {
  const { points, cum, length, closed } = path;
  const n = points.length;
  s = closed ? ((s % length) + length) % length : clamp(s, 0, length);
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = points[lo];
  const b = lo + 1 < n ? points[lo + 1] : closed ? points[0] : points[lo];
  const segEnd = lo + 1 < n ? cum[lo + 1] : length;
  const segLen = Math.max(segEnd - cum[lo], 1e-6);
  const t = clamp((s - cum[lo]) / segLen, 0, 1);
  let dx = b.x - a.x;
  let dz = b.z - a.z;
  if (dx === 0 && dz === 0 && lo > 0) {
    dx = a.x - points[lo - 1].x;
    dz = a.z - points[lo - 1].z;
  }
  const d = Math.hypot(dx, dz) || 1;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: dx / d, dz: dz / d };
}

// Jarak s titik terdekat pada path ke (x, z).
export function projectOnPath(path, x, z) {
  let best = { s: 0, dist: Infinity };
  path.points.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best.dist) best = { s: path.cum[i], dist: d };
  });
  return best;
}

// Geser polyline ke kanan arah jalannya (kanan = (dz, -dx)).
function offsetPolyline(points, offset, closed) {
  const n = points.length;
  return points.map((p, i) => {
    const prev = points[i > 0 ? i - 1 : closed ? n - 1 : 0];
    const next = points[i < n - 1 ? i + 1 : closed ? 0 : n - 1];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: p.x + (dz / d) * offset, z: p.z + (-dx / d) * offset };
  });
}

// Setengah lingkaran putar balik di ujung jalan terbuka.
function uTurn(end, dir, radius) {
  const pts = [];
  const rx = dir.dz;
  const rz = -dir.dx;
  for (let i = 1; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    pts.push({ x: end.x + rx * radius * Math.cos(a) + dir.dx * radius * Math.sin(a), z: end.z + rz * radius * Math.cos(a) + dir.dz * radius * Math.sin(a) });
  }
  return pts;
}

function dirAt(points, i, j) {
  const dx = points[j].x - points[i].x;
  const dz = points[j].z - points[i].z;
  const d = Math.hypot(dx, dz) || 1;
  return { dx: dx / d, dz: dz / d };
}

export function buildLanes(roads) {
  const lanes = [];
  for (const road of roads) {
    if (!LANE_KINDS.has(road.kind)) continue;
    const offset = road.width / 4;
    const center = resample(road.points, STEP, road.closed);
    if (road.closed) {
      lanes.push({ id: `${road.id}:a`, road, path: makePath(offsetPolyline(center, offset, true)) });
      lanes.push({ id: `${road.id}:b`, road, path: makePath(offsetPolyline([...center].reverse(), offset, true)) });
    } else {
      const n = center.length;
      const out = offsetPolyline(center, offset, false);
      const back = offsetPolyline([...center].reverse(), offset, false);
      const loop = [...out, ...uTurn(center[n - 1], dirAt(center, n - 2, n - 1), offset), ...back, ...uTurn(center[0], dirAt(center, 1, 0), offset)];
      lanes.push({ id: road.id, road, path: makePath(loop) });
    }
  }
  return lanes;
}

// Trotoar: dua sisi tiap jalan yang lewat area berpaving, dipotong jadi potongan yang bebas gedung.
export function buildSidewalks(roads, { paved, isBlocked, minLength = 10 }) {
  const inPaved = (p) => paved.some((e) => ((p.x - e.cx) / e.rx) ** 2 + ((p.z - e.cz) / e.rz) ** 2 <= 1);
  const pieces = [];
  for (const road of roads) {
    if (!LANE_KINDS.has(road.kind) || road.kind === 'mountain') continue;
    const center = resample(road.points, 1.5, road.closed);
    for (const side of [1, -1]) {
      const pts = offsetPolyline(center, (road.width / 2 + 0.7) * side, road.closed);
      let run = [];
      const flush = () => {
        if (run.length > 1) {
          const path = makePath(run, false);
          if (path.length >= minLength) pieces.push({ id: pieces.length, road, side, path });
        }
        run = [];
      };
      for (const p of pts) {
        const ok = inPaved(p) && !isBlocked(p.x, p.z, 0.45) && roads.every((r) => r === road || !onRoad(r, p));
        if (ok) run.push(p);
        else flush();
      }
      flush();
    }
  }
  return pieces;
}

const roadCache = new WeakMap();

function onRoad(road, p) {
  if (!roadCache.has(road)) roadCache.set(road, { b: boundsOf(road.points, road.width), pts: resample(road.points, 1, road.closed) });
  const { b, pts } = roadCache.get(road);
  // Cepat: cek kotak pembatas dulu.
  if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) return false;
  const r2 = (road.width / 2) ** 2;
  return pts.some((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < r2);
}

function boundsOf(points, pad) {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad };
}
