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

    for (const fx of this.effects) {
      fx.life -= dt;
      const k = Math.max(0, fx.life / fx.maxLife);
      fx.mesh.material.opacity = fx.kind === 'scorch' ? k * 0.55 : k;
      if (fx.kind === 'shield') fx.mesh.scale.setScalar(1 + (1 - k) * 0.8);
    }
    for (const fx of this.effects.filter((f) => f.life <= 0)) {
      this.scene.remove(fx.mesh);
      disposeObject(fx.mesh);
    }
    this.effects = this.effects.filter((f) => f.life > 0);
  }
}
