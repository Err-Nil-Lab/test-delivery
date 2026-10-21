// Helper geometri 2D di bidang (x, z): polyline jalan, polygon wilayah, smoothing.

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function inRect(rect, x, z) {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

export function pointInPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function closestOnSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0;
  const x = ax + dx * t;
  const z = az + dz * t;
  return { x, z, t, d2: (px - x) ** 2 + (pz - z) ** 2 };
}

function segmentsOf(points, closed) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) segs.push([points[i], points[i + 1]]);
  if (closed) segs.push([points[points.length - 1], points[0]]);
  return segs;
}

export function nearestOnPolyline(points, closed, px, pz) {
  let best = null;
  for (const [a, b] of segmentsOf(points, closed)) {
    const c = closestOnSegment(px, pz, a.x, a.z, b.x, b.z);
    if (!best || c.d2 < best.d2) best = c;
  }
  return { x: best.x, z: best.z, dist: Math.sqrt(best.d2) };
}

export function distanceToPolygonEdge(poly, x, z) {
  return nearestOnPolyline(poly, true, x, z).dist;
}

export function polylineLength(points, closed = false) {
  return segmentsOf(points, closed).reduce((sum, [a, b]) => sum + distance(a, b), 0);
}

// Titik-titik berjarak sama sepanjang polyline (untuk mesh jalan dan sampling).
export function resample(points, step, closed = false) {
  const out = [];
  const segs = segmentsOf(points, closed);
  let carry = 0;
  for (const [a, b] of segs) {
    const len = distance(a, b);
    let s = carry;
    while (s < len) {
      const t = s / len;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      s += step;
    }
    carry = s - len;
  }
  if (!closed) out.push({ ...points[points.length - 1] });
  return out;
}

// Chaikin corner cutting: membulatkan tikungan polyline.
export function chaikin(points, iterations = 2, closed = false) {
  let pts = points;
  for (let k = 0; k < iterations; k++) {
    const next = closed ? [] : [pts[0]];
    const n = pts.length;
    const count = closed ? n : n - 1;
    for (let i = 0; i < count; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      next.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    if (!closed) next.push(pts[n - 1]);
    pts = next;
  }
  return pts;
}

export function ellipsePoints(cx, cz, rx, rz, count = 64) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * rz });
  }
  return pts;
}

export function polygonBounds(poly) {
  const xs = poly.map((p) => p.x);
  const zs = poly.map((p) => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

// Hash deterministik 0..1 dari dua angka (variasi tinggi gedung tanpa RNG).
export function hash2(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
