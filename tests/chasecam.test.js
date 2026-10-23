import { describe, expect, it, beforeEach } from 'vitest';
import { angleDiff, chasePose, smoothYaw, targetYaw, CHASE } from '../src/render/chaseCam.js';
import { loadSettings, saveSettings, SETTINGS_FIELDS } from '../src/ui/settings.js';
import { CONFIG } from '../src/config.js';

describe('Kamera third person', () => {
  it('berada di belakang van dan melihat ke depan van', () => {
    for (const yaw of [0, 1, Math.PI / 2, 3, -2]) {
      const pos = { x: 10, y: 2, z: -5 };
      const pose = chasePose(pos, yaw);
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      // Posisi kamera: jarak CHASE.distance di belakang van, dan lebih tinggi.
      expect((pose.position.x - pos.x) * fx + (pose.position.z - pos.z) * fz).toBeCloseTo(-CHASE.distance, 5);
      expect(pose.position.y).toBeCloseTo(pos.y + CHASE.height);
      // Titik lihat: di depan van.
      expect((pose.look.x - pos.x) * fx + (pose.look.z - pos.z) * fz).toBeCloseTo(CHASE.lookAhead, 5);
    }
  });

  it('FOV melebar seiring kecepatan dan dijepit', () => {
    const p = { x: 0, y: 0, z: 0 };
    expect(chasePose(p, 0, 0).fov).toBe(CHASE.fov);
    expect(chasePose(p, 0, 1).fov).toBe(CHASE.fov + CHASE.fovSpeed);
    expect(chasePose(p, 0, 5).fov).toBe(CHASE.fov + CHASE.fovSpeed);
  });

  it('yaw menyusul lewat jalur terpendek (tidak berputar balik di batas ±π)', () => {
    expect(angleDiff(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6, 5); // sedikit saja, bukan -6
    let yaw = 3.0;
    for (let i = 0; i < 60; i++) {
      const next = smoothYaw(yaw, -3.0, 1 / 60);
      expect(Math.abs(angleDiff(yaw, next))).toBeLessThan(0.3);
      yaw = next;
    }
    expect(Math.abs(angleDiff(yaw, -3.0))).toBeLessThan(0.1);
  });

  it('target yaw: ikut arah hadap; condong sedikit ke arah gerak saat drift; mundur tidak membalik kamera', () => {
    const car = { heading: 0, vx: 0, vz: 0 };
    expect(targetYaw(car)).toBe(0);
    // Melaju lurus.
    expect(targetYaw({ heading: 0, vx: 0, vz: 20 })).toBeCloseTo(0, 5);
    // Drift: gerak menyamping ke +x (slip 90°) → kamera condong, tapi dibatasi.
    const drift = targetYaw({ heading: 0, vx: 20, vz: 10 });
    expect(drift).toBeGreaterThan(0);
    expect(drift).toBeLessThan(CHASE.maxSlipFollow * CHASE.driftFollow + 1e-6);
    // Mundur: tetap menghadap arah van.
    expect(targetYaw({ heading: 0, vx: 0, vz: -10 })).toBe(0);
  });
});

describe('Pengaturan perspektif', () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  });

  it('default isometric, ada di menu Pengaturan dengan tombol V', () => {
    expect(loadSettings(CONFIG, new URLSearchParams()).chase).toBe(false);
    expect(SETTINGS_FIELDS.find((f) => f.key === 'chase').hint).toBe('V');
  });

  it('tersimpan dan dimuat; ?view=chase hanya untuk sesi itu', () => {
    const s = loadSettings(CONFIG, new URLSearchParams());
    s.chase = true;
    saveSettings(s, 'chase');
    expect(loadSettings(CONFIG, new URLSearchParams()).chase).toBe(true);
    // Override URL tidak menimpa pilihan tersimpan.
    const iso = loadSettings(CONFIG, new URLSearchParams('view=iso'));
    expect(iso.chase).toBe(false);
    saveSettings(iso);
    expect(loadSettings(CONFIG, new URLSearchParams()).chase).toBe(true);
  });
});
