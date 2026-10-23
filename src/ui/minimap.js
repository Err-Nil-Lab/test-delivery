// Minimap di pojok kanan bawah. Diputar 45° supaya arahnya sama dengan kamera isometric
// (atas layar = barat laut), jadi kiri/kanan di minimap = kiri/kanan di layar.
import { MINOTAUR_STATE } from '../sim/minotaurs.js';
import { packageLook } from '../sim/curses.js';
import { ROUTE_COLORS } from '../render/routeView.js';

const SIZE = 200;
const PAD = 8;
const COLORS = {
  sea: '#4f8399',
  hill: '#8f8a5f',
  zone: 'rgba(255, 216, 74, 0.25)',
  grass: '#7f9a6c',
  ground: '#87a172',
  beach: '#d9c79a',
  paved: '#a3a29c',
  field: '#b59a5e',
  main: '#fff1c2',
  street: '#d7d2c4',
  path: '#c2a878',
  hq: '#5b8fe0',
  plant: '#ffd84a',
  safe: '#f6f3ec',
  zeus: '#ffd84a',
  dest: '#7dd3fc',
  minotaur: '#ff4d3d',
};

export class Minimap {
  constructor(root, game) {
    this.game = game;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = SIZE * dpr;
    this.canvas.height = SIZE * dpr;
    this.canvas.style.width = `${SIZE}px`;
    this.canvas.style.height = `${SIZE}px`;
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);

    // Transformasi dunia → minimap.
    const b = game.world.bounds;
    const corners = [
      [b.minX, b.minZ],
      [b.maxX, b.minZ],
      [b.minX, b.maxZ],
      [b.maxX, b.maxZ],
    ].map(([x, z]) => this.rotate(x, z));
    this.u0 = Math.min(...corners.map((c) => c.u));
    this.v0 = Math.min(...corners.map((c) => c.v));
    const range = Math.max(Math.max(...corners.map((c) => c.u)) - this.u0, Math.max(...corners.map((c) => c.v)) - this.v0);
    this.scale = (SIZE - PAD * 2) / range;

    this.base = this.renderStatic(dpr);
  }

  rotate(x, z) {
    return { u: (x - z) / Math.SQRT2, v: (x + z) / Math.SQRT2 };
  }

  toMap(x, z) {
    const r = this.rotate(x, z);
    return { x: PAD + (r.u - this.u0) * this.scale, y: PAD + (r.v - this.v0) * this.scale };
  }

  path(ctx, points, closed) {
    ctx.beginPath();
    points.forEach((p, i) => {
      const m = this.toMap(p.x, p.z);
      if (i === 0) ctx.moveTo(m.x, m.y);
      else ctx.lineTo(m.x, m.y);
    });
    if (closed) ctx.closePath();
  }

  renderStatic(dpr) {
    const { world } = this.game;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const b = world.bounds;
    this.path(
      ctx,
      [
        { x: b.minX, z: b.minZ },
        { x: b.maxX, z: b.minZ },
        { x: b.maxX, z: b.maxZ },
        { x: b.minX, z: b.maxZ },
      ],
      true,
    );
    ctx.fillStyle = COLORS.ground;
    ctx.fill();
    for (const e of world.paved) {
      ctx.beginPath();
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const m = this.toMap(e.cx + Math.cos(a) * e.rx, e.cz + Math.sin(a) * e.rz);
        if (i === 0) ctx.moveTo(m.x, m.y);
        else ctx.lineTo(m.x, m.y);
      }
      ctx.fillStyle = COLORS.paved;
      ctx.fill();
    }
    for (const [poly, color] of [
      [world.regions.sea, COLORS.sea],
      [world.regions.beach, COLORS.beach],
      [world.regions.hill, COLORS.hill],
      [world.regions.zeusZone, COLORS.zone],
      [world.regions.meadow, COLORS.grass],
      ...world.fields.map((f) => [f, COLORS.field]),
    ]) {
      this.path(ctx, poly, true);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Hirarki jalan: jalan kecil digambar dulu, jalan utama paling atas dan paling tebal.
    const rank = { path: 0, street: 1, ramp: 1, mountain: 2, ring: 3, main: 3 };
    const roads = [...world.roads].sort((a, b) => (rank[a.kind] ?? 1) - (rank[b.kind] ?? 1));
    for (const road of roads) {
      const major = rank[road.kind] >= 2;
      this.path(ctx, road.points, road.closed);
      ctx.strokeStyle = major ? COLORS.main : road.kind === 'path' ? COLORS.path : COLORS.street;
      ctx.lineWidth = Math.max(major ? 2.4 : 1, road.width * this.scale * (major ? 1.1 : 0.7));
      ctx.stroke();
    }
    const z = world.hq.zone;
    this.path(
      ctx,
      [
        { x: z.minX, z: z.minZ },
        { x: z.maxX, z: z.minZ },
        { x: z.maxX, z: z.maxZ },
        { x: z.minX, z: z.maxZ },
      ],
      true,
    );
    ctx.fillStyle = COLORS.hq;
    ctx.fill();
    return canvas;
  }

  dot(x, z, color, r, ring = false) {
    const m = this.toMap(x, z);
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
    if (ring) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  update() {
    const { ctx, game } = this;
    const { car, packages, world, minotaurs } = game;
    ctx.clearRect(0, 0, SIZE, SIZE);
    // Kamera third person: minimap bulat berpusat di van dan diputar supaya atas = depan van.
    const follow = Boolean(this.view?.chase);
    ctx.save();
    if (follow) {
      const vm = this.toMap(car.x, car.z);
      const fwdX = Math.sin(car.heading);
      const fwdZ = Math.cos(car.heading);
      const vAngle = Math.atan2((fwdX + fwdZ) / Math.SQRT2, (fwdX - fwdZ) / Math.SQRT2);
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#242a38';
      ctx.fill();
      ctx.clip();
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.rotate(-Math.PI / 2 - vAngle);
      ctx.scale(1.35, 1.35);
      ctx.translate(-vm.x, -vm.y);
    }
    ctx.drawImage(this.base, 0, 0, SIZE, SIZE);

    // Rute GPS.
    const { nav } = game;
    if (nav.enabled && nav.route.length > 1) {
      this.path(ctx, nav.route, false);
      ctx.strokeStyle = ROUTE_COLORS[nav.target?.kind] ?? ROUTE_COLORS.dest;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.dot(world.plant.dropoff.x, world.plant.dropoff.z, COLORS.plant, 3.5);
    // Hades: paket lain dan Minotaur tidak terlihat, hanya tujuan.
    const blind = Boolean(game.effects.visionRadius);
    if (!blind) {
      for (const p of packages.waiting) this.dot(p.pickup.x, p.pickup.z, packageLook(p).color, p.type === 'safe' ? 2.5 : 3.5);
      for (const m of minotaurs.list) this.dot(m.x, m.z, COLORS.minotaur, m.state === MINOTAUR_STATE.WANDER ? 2.5 : 4);
    }
    for (const p of packages.cargo) this.dot(p.dest.x, p.dest.z, p.type === 'safe' ? COLORS.dest : packageLook(p).color, 5, true);

    // Van: segitiga putih menghadap arah gerak.
    const c = this.toMap(car.x, car.z);
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const angle = Math.atan2((fx + fz) / Math.SQRT2, (fx - fz) / Math.SQRT2);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, 4);
    ctx.lineTo(-4, -4);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore(); // putaran minimap third person
    if (follow) {
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
