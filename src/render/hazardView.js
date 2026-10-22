// Visual petir: lingkaran telegraph yang terisi, kilat bergerigi, bekas gosong,
// dan riak perisai saat sambaran ditahan blessing Zeus.
import * as THREE from 'three';
import { disposeObject } from './dispose.js';

const TELEGRAPH_COLORS = { zone: '#ffe066', ambient: '#ffe066', storm: '#ff5a4d' };

export class HazardView {
  constructor(scene, bus, heightAt) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.telegraphs = new Map();
    this.effects = [];
    this.boltMat = new THREE.MeshBasicMaterial({ color: '#fdfbff', transparent: true });
    this.scorchGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    this.scorchGeo.userData.shared = true;
    bus.on('strike', (s) => this.impact(s));
    bus.on('midnight_warning', (e) => this.createMidnightWarning(e));
    bus.on('midnight_strike', (e) => this.giantBolt(e));
    bus.on('day_start', () => this.clearMidnight());
    bus.on('smuggle_resolved', (e) => e.scam && this.explode(e));
  }

  createTelegraph(strike) {
    const color = TELEGRAPH_COLORS[strike.kind];
    const group = new THREE.Group();
    group.position.set(strike.x, this.heightAt(strike.x, strike.z) + 0.35, strike.z);
    const outline = new THREE.Mesh(
      new THREE.RingGeometry(strike.radius - 0.3, strike.radius, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(strike.radius, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    group.add(outline, fill);
    this.scene.add(group);
    return { group, fill };
  }

  impact(strike) {
    // Kilat: tabung tipis bergerigi dari langit ke tanah.
    const pts = [];
    const ground = this.heightAt(strike.x, strike.z);
    const top = ground + 45;
    for (let i = 0; i <= 7; i++) {
      const y = ground + (top - ground) * (1 - i / 7);
      const jitter = i === 0 || i === 7 ? 0 : 1.6;
      pts.push(new THREE.Vector3(strike.x + (Math.random() - 0.5) * jitter, y, strike.z + (Math.random() - 0.5) * jitter));
    }
    const bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.28, 5), this.boltMat.clone());
    this.scene.add(bolt);
    this.effects.push({ mesh: bolt, life: 0.18, maxLife: 0.18, kind: 'bolt' });

    const scorch = new THREE.Mesh(this.scorchGeo, new THREE.MeshBasicMaterial({ color: '#1f1b16', transparent: true, opacity: 0.55, depthWrite: false }));
    scorch.position.set(strike.x, ground + 0.32, strike.z);
    scorch.scale.setScalar(strike.radius * 0.8);
    this.scene.add(scorch);
    this.effects.push({ mesh: scorch, life: 1.5, maxLife: 1.5, kind: 'scorch' });

    if (strike.blocked) {
      const shield = new THREE.Mesh(
        new THREE.SphereGeometry(3.2, 24, 16),
        new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      shield.position.set(strike.x, ground + 1.4, strike.z);
      this.scene.add(shield);
      this.effects.push({ mesh: shield, life: 0.5, maxLife: 0.5, kind: 'shield' });
    }
  }

  // Tengah malam: lingkaran peringatan raksasa merah yang mengisi, dengan pilar cahaya.
  createMidnightWarning({ x, z, radius }) {
    this.clearMidnight();
    const group = new THREE.Group();
    group.position.set(x, this.heightAt(x, z) + 0.4, z);
    const mat = (opacity) => new THREE.MeshBasicMaterial({ color: '#ff3d2e', transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const outline = new THREE.Mesh(new THREE.RingGeometry(radius - 0.6, radius, 56).rotateX(-Math.PI / 2), mat(0.95));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 56).rotateX(-Math.PI / 2), mat(0.4));
    const inner = new THREE.Mesh(new THREE.RingGeometry(radius * 0.45 - 0.3, radius * 0.45, 40).rotateX(-Math.PI / 2), mat(0.7));
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.35, radius * 0.35, 60, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ff6a4d', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    pillar.position.y = 30;
    group.add(outline, fill, inner, pillar);
    this.scene.add(group);
    this.midnightWarning = { group, fill, pillar, inner, radius };
  }

  clearMidnight() {
    if (!this.midnightWarning) return;
    this.scene.remove(this.midnightWarning.group);
    disposeObject(this.midnightWarning.group);
    this.midnightWarning = null;
  }

  // Sambaran raksasa Zeus: kolom petir lebar + inti putih + cahaya aditif + gelombang kejut + bekas gosong besar.
  giantBolt({ x, z, radius }) {
    this.clearMidnight();
    const ground = this.heightAt(x, z);
    const top = ground + 90;
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const y = ground + (top - ground) * (1 - i / 14);
      const jitter = i === 0 || i === 14 ? 0 : 3.2;
      pts.push(new THREE.Vector3(x + (Math.random() - 0.5) * jitter, y, z + (Math.random() - 0.5) * jitter));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const add = (geo, color, life, kind, blending = THREE.NormalBlending, opacity = 1) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending }));
      this.scene.add(mesh);
      this.effects.push({ mesh, life, maxLife: life, kind, base: opacity });
      return mesh;
    };
    add(new THREE.TubeGeometry(curve, 48, 2.6, 8), '#8fb8ff', 0.9, 'bolt', THREE.AdditiveBlending, 0.7); // pendar biru
    add(new THREE.TubeGeometry(curve, 48, 1.1, 8), '#ffffff', 0.7, 'bolt'); // inti putih
    const glow = add(new THREE.CylinderGeometry(radius * 0.9, radius * 1.3, 90, 20, 1, true), '#bcd4ff', 0.8, 'bolt', THREE.AdditiveBlending, 0.4);
    glow.position.set(x, ground + 45, z);
    const shock = add(new THREE.RingGeometry(0.6, 1.6, 48).rotateX(-Math.PI / 2), '#ffffff', 0.9, 'shock', THREE.AdditiveBlending, 0.9);
    shock.position.set(x, ground + 0.5, z);
    const scorch = add(this.scorchGeo, '#17130f', 6, 'scorch', THREE.NormalBlending, 0.7);
    scorch.position.set(x, ground + 0.34, z);
    scorch.scale.setScalar(radius * 1.8);
  }

  // Paket selundupan scam meledak: bola api, bekas gosong.
  explode({ x, z }) {
    const ground = this.heightAt(x, z);
    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(2, 20, 14),
      new THREE.MeshBasicMaterial({ color: '#ff8a1f', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    fireball.position.set(x, ground + 2, z);
    this.scene.add(fireball);
    this.effects.push({ mesh: fireball, life: 0.6, maxLife: 0.6, kind: 'fireball' });
    const scorch = new THREE.Mesh(this.scorchGeo, new THREE.MeshBasicMaterial({ color: '#1f1b16', transparent: true, opacity: 0.55, depthWrite: false }));
    scorch.position.set(x, ground + 0.32, z);
    scorch.scale.setScalar(4);
    this.scene.add(scorch);
    this.effects.push({ mesh: scorch, life: 3, maxLife: 3, kind: 'scorch' });
  }

  update(dt, game) {
    const live = new Set();
    for (const s of game.hazards.strikes) {
      live.add(s.id);
      if (!this.telegraphs.has(s.id)) this.telegraphs.set(s.id, this.createTelegraph(s));
      const progress = 1 - s.timeLeft / s.telegraph;
      this.telegraphs.get(s.id).fill.scale.setScalar(Math.max(0.01, progress));
    }
    for (const [id, view] of this.telegraphs) {
      if (live.has(id)) continue;
      this.scene.remove(view.group);
      disposeObject(view.group);
      this.telegraphs.delete(id);
    }

    // Peringatan tengah malam: mengisi, berdenyut, dan mengikuti van yang sedang mengerem.
    const w = this.midnightWarning;
    if (w) {
      const p = game.midnight.warnProgress;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 70);
      w.fill.scale.setScalar(Math.max(0.02, p));
      w.fill.material.opacity = 0.3 + 0.35 * p;
      w.inner.scale.setScalar(1 + pulse * 0.08);
      w.pillar.material.opacity = 0.1 + 0.3 * p * (0.7 + 0.3 * pulse);
      const t = game.midnight.target;
      if (t) w.group.position.set(t.x, this.heightAt(t.x, t.z) + 0.4, t.z);
    }
    for (const fx of this.effects) {
      fx.life -= dt;
      const k = Math.max(0, fx.life / fx.maxLife);
      fx.mesh.material.opacity = fx.kind === 'scorch' ? k * (fx.base ?? 0.55) : k * (fx.base ?? 1);
      if (fx.kind === 'shock') fx.mesh.scale.setScalar(1 + (1 - k) * 22);
      if (fx.kind === 'shield') fx.mesh.scale.setScalar(1 + (1 - k) * 0.8);
      if (fx.kind === 'fireball') fx.mesh.scale.setScalar(1 + (1 - k) * 3);
    }
    for (const fx of this.effects.filter((f) => f.life <= 0)) {
      this.scene.remove(fx.mesh);
      disposeObject(fx.mesh);
    }
    this.effects = this.effects.filter((f) => f.life > 0);
  }
}
