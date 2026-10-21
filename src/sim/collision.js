// Collider 2D untuk van: kotak berotasi (gedung), kapsul (tebing, pantai, batas map),
// dan lingkaran (Minotaur). Plus grid spasial supaya pengecekan tetap murah.
import { clamp, closestOnSegment } from './geometry.js';

// rot = sudut sumbu-x lokal kotak di bidang (x, z). Di three.js: mesh.rotation.y = -rot.
export function boxCollider(cx, cz, hw, hd, rot = 0, extra = {}) {
  return { type: 'box', cx, cz, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), bound: Math.hypot(hw, hd), ...extra };
}

export function segCollider(ax, az, bx, bz, r = 0.3, extra = {}) {
  return {
    type: 'seg',
    ax,
    az,
    bx,
    bz,
    r,
    cx: (ax + bx) / 2,
    cz: (az + bz) / 2,
    bound: Math.hypot(bx - ax, bz - az) / 2 + r,
    ...extra,
  };
}

export function circleCollider(cx, cz, r, extra = {}) {
  return { type: 'circle', cx, cz, r, bound: r, ...extra };
}

// Kontak lingkaran (x, z, radius) dengan collider: { nx, nz, depth } atau null.
export function contact(x, z, radius, c) {
  if (c.type === 'box') {
    const dx = x - c.cx;
    const dz = z - c.cz;
    const lx = dx * c.cos + dz * c.sin;
    const lz = -dx * c.sin + dz * c.cos;
    const qx = clamp(lx, -c.hw, c.hw);
    const qz = clamp(lz, -c.hd, c.hd);
    let lnx = lx - qx;
    let lnz = lz - qz;
    const d2 = lnx * lnx + lnz * lnz;
    let depth;
    if (d2 > 1e-10) {
      if (d2 >= radius * radius) return null;
      const d = Math.sqrt(d2);
      lnx /= d;
      lnz /= d;
      depth = radius - d;
    } else {
      // Pusat di dalam kotak: keluar lewat sisi terdekat.
      const exits = [
        [c.hw - lx, 1, 0],
        [c.hw + lx, -1, 0],
        [c.hd - lz, 0, 1],
        [c.hd + lz, 0, -1],
      ];
      const [pen, ex, ez] = exits.reduce((a, b) => (b[0] < a[0] ? b : a));
      lnx = ex;
      lnz = ez;
      depth = radius + pen;
    }
    return { nx: lnx * c.cos - lnz * c.sin, nz: lnx * c.sin + lnz * c.cos, depth };
  }

  let px;
  let pz;
  let r;
  if (c.type === 'seg') {
    const q = closestOnSegment(x, z, c.ax, c.az, c.bx, c.bz);
    px = q.x;
    pz = q.z;
    r = c.r;
  } else {
    px = c.cx;
    pz = c.cz;
    r = c.r;
  }
  const dx = x - px;
  const dz = z - pz;
  const d2 = dx * dx + dz * dz;
  const min = radius + r;
  if (d2 >= min * min) return null;
  const d = Math.sqrt(d2);
  if (d < 1e-6) return { nx: 0, nz: 1, depth: min };
  return { nx: dx / d, nz: dz / d, depth: min - d };
}

// Grid spasial untuk collider statis.
export class ColliderGrid {
  constructor(colliders, cell = 12) {
    this.cell = cell;
    this.buckets = new Map();
    this.stamp = 0;
    for (const c of colliders) {
      const minI = Math.floor((c.cx - c.bound) / cell);
      const maxI = Math.floor((c.cx + c.bound) / cell);
      const minJ = Math.floor((c.cz - c.bound) / cell);
      const maxJ = Math.floor((c.cz + c.bound) / cell);
      for (let i = minI; i <= maxI; i++) {
        for (let j = minJ; j <= maxJ; j++) {
          const key = `${i},${j}`;
          if (!this.buckets.has(key)) this.buckets.set(key, []);
          this.buckets.get(key).push(c);
        }
      }
    }
  }

  query(x, z, r) {
    const out = [];
    const stamp = ++this.stamp;
    const minI = Math.floor((x - r) / this.cell);
    const maxI = Math.floor((x + r) / this.cell);
    const minJ = Math.floor((z - r) / this.cell);
    const maxJ = Math.floor((z + r) / this.cell);
    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        for (const c of this.buckets.get(`${i},${j}`) ?? []) {
          if (c._stamp === stamp) continue;
          c._stamp = stamp;
          out.push(c);
        }
      }
    }
    return out;
  }
}
