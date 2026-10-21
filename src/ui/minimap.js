// Minimap di pojok kanan bawah. Diputar 45° supaya arahnya sama dengan kamera isometric
// (atas layar = barat laut), jadi kiri/kanan di minimap = kiri/kanan di layar.
import { MINOTAUR_STATE } from '../sim/minotaurs.js';
import { packageLook } from '../sim/curses.js';

const SIZE = 200;
const PAD = 8;
const COLORS = {
  sea: '#4f8399',
  hill: '#8f8a5f',
  zone: 'rgba(255, 216, 74, 0.25)',
  grass: '#7f9a6c',
  road: '#d7d2c4',
  ring: '#aeb6d6',
  hq: '#5b8fe0',
  plant: '#ffd84a',
  safe: '#f6f3ec',
  zeus: '#ffd84a',
  dest: '#4ade80',
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
    ctx.fillStyle = '#6f6c66';
    ctx.fill();
    for (const [poly, color] of [
      [world.regions.sea, COLORS.sea],
      [world.regions.hill, COLORS.hill],
      [world.regions.zeusZone, COLORS.zone],
      [world.regions.meadow, COLORS.grass],
      [world.regions.grassSouth, COLORS.grass],
    ]) {
      this.path(ctx, poly, true);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of world.roads) {
      this.path(ctx, road.points, road.closed);
      ctx.strokeStyle = road.kind === 'ring' ? COLORS.ring : COLORS.road;
      ctx.lineWidth = Math.max(1.2, road.width * this.scale * 0.8);
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
    ctx.drawImage(this.base, 0, 0, SIZE, SIZE);

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
  }
}
