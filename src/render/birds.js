// Burung ambient (hiasan, tidak ada di simulasi): merpati di Alun-alun Kota dan Gerbang Istana,
// camar di pantai. Mematuk tanah, lalu berhamburan terbang saat van lewat dan mendarat lagi.
import * as THREE from 'three';
import { BoxBatch, baseMatrix } from './boxBatch.js';

const PIGEON = new THREE.Color('#8e95a3');
const PIGEON_NECK = new THREE.Color('#6f8f86');
const GULL = new THREE.Color('#f7f7f2');
const GULL_WING = new THREE.Color('#c9ced6');
const BEAK = new THREE.Color('#f3a43a');
const base = new THREE.Matrix4();

export class Birds {
  constructor(scene, game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.batch = new BoxBatch(scene, 300, { castShadow: false });
    this.birds = [];
    this.onScare = null; // dipanggil sekali per kawanan yang terbang (untuk suara kepak)
    const { world } = game;
    const square = world.points.find((p) => p.id === 'lm-square');
    const palms = world.vegetation.filter((v) => v.kind === 'palm');
    const flocks = [
      { kind: 'pigeon', at: square, n: cfg.pigeons },
      { kind: 'pigeon', at: world.zeusPickup, n: cfg.pigeons },
      { kind: 'gull', at: palms[Math.floor(palms.length / 2)], n: cfg.gulls },
    ].filter((f) => f.at);
    for (const f of flocks) {
      for (let i = 0; i < f.n; i++) {
        const spot = this.spot(f.at, 6);
        this.birds.push({ kind: f.kind, home: f.at, x: spot.x, z: spot.z, y: 0, heading: Math.random() * 6.28, state: 'ground', t: Math.random() * 3, peck: Math.random() * 6, phase: Math.random() * 6 });
      }
    }
  }

  spot(at, radius) {
    const { world } = this.game;
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const x = at.x + Math.cos(a) * r;
      const z = at.z + Math.sin(a) * r;
      if (!world.isBlocked(x, z, 0.3)) return { x, z };
    }
    return { x: at.x, z: at.z };
  }

  update(dt) {
    const { car, world, npcEnabled } = this.game;
    this.batch.begin();
    if (!npcEnabled || !this.cfg.enabled) {
      this.batch.end();
      return;
    }
    let scaredAt = null;
    for (const b of this.birds) {
      b.t -= dt;
      b.phase += dt;
      const ground = world.heightAt(b.x, b.z);
      const dist = Math.hypot(car.x - b.x, car.z - b.z);
      if (b.state === 'ground') {
        b.y = ground;
        if (dist < this.cfg.scareRadius && car.speed > 2) {
          // Berhamburan: terbang menjauhi van, naik, lalu berputar.
          const ux = (b.x - car.x) / (dist || 1);
          const uz = (b.z - car.z) / (dist || 1);
          b.state = 'fly';
          b.t = 4 + Math.random() * 4;
          b.vx = ux * 7 + (Math.random() - 0.5) * 4;
          b.vz = uz * 7 + (Math.random() - 0.5) * 4;
          b.vy = 5 + Math.random() * 3;
          scaredAt ??= b;
        } else if (b.t <= 0) {
          // Jalan-jalan kecil sambil mematuk.
          b.t = 1 + Math.random() * 3;
          b.heading += (Math.random() - 0.5) * 2;
          b.x += Math.sin(b.heading) * 0.4;
          b.z += Math.cos(b.heading) * 0.4;
          if (world.isBlocked(b.x, b.z, 0.2)) {
            b.x -= Math.sin(b.heading) * 0.4;
            b.z -= Math.cos(b.heading) * 0.4;
          }
        }
      } else if (b.state === 'fly') {
        // Naik dulu, lalu berputar di atas rumahnya.
        const cx = b.home.x - b.x;
        const cz = b.home.z - b.z;
        b.vx += (cz * 0.6 + cx * 0.3) * dt;
        b.vz += (-cx * 0.6 + cz * 0.3) * dt;
        b.vy += (ground + 9 - b.y) * dt * 1.5 - b.vy * dt;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.y += b.vy * dt;
        b.heading = Math.atan2(b.vx, b.vz);
        if (b.t <= 0) {
          b.state = 'land';
          b.target = this.spot(b.home, 6);
        }
      } else {
        // Turun ke tempat baru di dekat rumah.
        const dx = b.target.x - b.x;
        const dz = b.target.z - b.z;
        const d = Math.hypot(dx, dz);
        const targetY = world.heightAt(b.target.x, b.target.z);
        b.x += (dx / (d || 1)) * Math.min(d, 6 * dt);
        b.z += (dz / (d || 1)) * Math.min(d, 6 * dt);
        b.y += (targetY - b.y) * Math.min(1, dt * 2.5);
        b.heading = Math.atan2(dx, dz);
        if (d < 0.2 && b.y - targetY < 0.15) {
          b.state = 'ground';
          b.t = 1 + Math.random() * 2;
          // Van masih dekat: terbang lagi nanti, jangan langsung.
          b.x = b.target.x;
          b.z = b.target.z;
        }
      }
      this.draw(b);
    }
    if (scaredAt) this.onScare?.(scaredAt);
    this.batch.end();
  }

  draw(b) {
    const flying = b.state !== 'ground';
    const pigeon = b.kind === 'pigeon';
    const peck = !flying ? Math.max(0, Math.sin(b.phase * 5)) * 0.15 : 0;
    baseMatrix(base, b.x, b.y, b.z, b.heading, 0, 0, pigeon ? 1.8 : 2.2);
    const body = pigeon ? PIGEON : GULL;
    this.batch.add(base, [0.22, 0.2, 0.38], [0, 0.18, 0], body);
    this.batch.add(base, [0.14, 0.14, 0.14], [0, 0.32 - peck, 0.2], pigeon ? PIGEON_NECK : GULL);
    this.batch.add(base, [0.05, 0.04, 0.08], [0, 0.31 - peck, 0.3], BEAK);
    // Sayap: terlipat di tanah, mengepak saat terbang.
    const flap = flying ? Math.sin(b.phase * 22) * 0.9 : 0;
    const wing = pigeon ? PIGEON : GULL_WING;
    const span = flying ? 0.4 : 0.06;
    this.batch.add(base, [span, 0.03, 0.26], [0.11 + span / 2, 0.24, -0.02], wing, [0, 0, flap]);
    this.batch.add(base, [span, 0.03, 0.26], [-0.11 - span / 2, 0.24, -0.02], wing, [0, 0, -flap]);
  }
}
