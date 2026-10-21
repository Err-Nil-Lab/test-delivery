// Minotaur graybox: badan kotak bertanduk. Saat ancang-ancang: panah merah di tanah menunjukkan
// jalur serudukan + tanda "!". Saat menyeruduk: debu. Setelah itu: bintang pusing di atas kepala.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { MINOTAUR_STATE } from '../sim/minotaurs.js';

function part(geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

// Panjang jalur serudukan sampai keluar wilayah padang.
function chargeLength(m, max) {
  const t = m.territory;
  const tx = m.dirX > 0 ? (t.maxX - m.x) / m.dirX : m.dirX < 0 ? (t.minX - m.x) / m.dirX : Infinity;
  const tz = m.dirZ > 0 ? (t.maxZ - m.z) / m.dirZ : m.dirZ < 0 ? (t.minZ - m.z) / m.dirZ : Infinity;
  return Math.max(2, Math.min(max, tx, tz));
}

export class MinotaurView {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.views = new Map();
    this.dust = [];
    this.time = 0;
    this.mats = {
      fur: new THREE.MeshStandardMaterial({ color: '#6b4a3a', roughness: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: '#3f2b22' }),
      horn: new THREE.MeshStandardMaterial({ color: '#efe6d0' }),
      eye: new THREE.MeshStandardMaterial({ color: '#2a0000', emissive: '#ff2a1a', emissiveIntensity: 0 }),
      star: new THREE.MeshBasicMaterial({ color: '#ffe066' }),
      dust: new THREE.MeshBasicMaterial({ color: '#c9b79a', transparent: true, opacity: 0.7, depthWrite: false }),
    };
    this.dustGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  }

  create() {
    const { fur, dark, horn, eye, star } = this.mats;
    const eyeMat = eye.clone(); // mata menyala per Minotaur saat ancang-ancang
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    body.add(part(new THREE.BoxGeometry(1.6, 1.6, 2.6), fur, 0, 1.6, 0));
    body.add(part(new THREE.BoxGeometry(1.2, 1.2, 1.1), dark, 0, 2.3, 1.6));
    for (const s of [-1, 1]) {
      const h = part(new THREE.ConeGeometry(0.22, 1.1, 8), horn, s * 0.75, 3.0, 1.7);
      h.rotation.z = -s * 0.9;
      body.add(h);
      body.add(part(new THREE.BoxGeometry(0.18, 0.18, 0.05), eyeMat, s * 0.35, 2.45, 2.16));
    }
    for (const [x, z] of [
      [-0.55, -0.9],
      [0.55, -0.9],
      [-0.55, 0.9],
      [0.55, 0.9],
    ]) {
      body.add(part(new THREE.BoxGeometry(0.4, 0.9, 0.4), dark, x, 0.45, z));
    }

    // Panah jalur serudukan di tanah (dari Minotaur ke depan).
    const arrowPivot = new THREE.Group();
    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0.4, depthWrite: false }),
    );
    lane.position.y = 0.08;
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 3, 3).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0.7, depthWrite: false }),
    );
    head.scale.y = 0.05;
    head.position.y = 0.1;
    arrowPivot.add(lane, head);
    arrowPivot.visible = false;
    this.scene.add(arrowPivot);

    const stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), star);
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
      stars.add(s);
    }
    stars.position.y = 3.6;
    stars.visible = false;
    root.add(stars);

    const el = document.createElement('div');
    el.className = 'mino-alert';
    el.textContent = '!';
    const alert = new CSS2DObject(el);
    alert.position.y = 4.4;
    alert.visible = false;
    root.add(alert);

    this.scene.add(root);
    return { root, body, arrowPivot, lane, head, stars, alert, eyeMat };
  }

  update(dt) {
    this.time += dt;
    const { minotaurs, cfg } = this.game;
    for (const m of minotaurs.list) {
      if (!this.views.has(m.id)) this.views.set(m.id, this.create());
      const v = this.views.get(m.id);
      v.root.position.set(m.x, 0, m.z);
      v.root.rotation.y = m.heading;

      const windup = m.state === MINOTAUR_STATE.WINDUP;
      const charging = m.state === MINOTAUR_STATE.CHARGE;
      v.eyeMat.emissiveIntensity = windup ? 2 : 0;
      // Ancang-ancang: badan bergetar, mata menyala, panah jalur muncul.
      v.body.position.x = windup ? Math.sin(this.time * 60) * 0.12 : 0;
      v.body.rotation.x = windup ? 0.2 : charging ? 0.25 : 0;
      v.arrowPivot.visible = windup || charging;
      if (v.arrowPivot.visible) {
        const len = charging ? Math.max(2, cfg.minotaur.chargeDistance - m.traveled) : chargeLength(m, cfg.minotaur.chargeDistance);
        v.arrowPivot.position.set(m.x, 0, m.z);
        v.arrowPivot.rotation.y = Math.atan2(m.dirX, m.dirZ);
        v.lane.scale.z = len;
        v.head.position.z = len;
        v.lane.material.opacity = windup ? 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(this.time * 20)) : 0.2;
      }
      v.alert.visible = windup;
      v.stars.visible = m.state === MINOTAUR_STATE.DIZZY;
      v.stars.rotation.y += dt * 4;

      if (charging && Math.random() < dt * 30) {
        const mesh = new THREE.Mesh(this.dustGeo, this.mats.dust.clone());
        mesh.position.set(m.x + (Math.random() - 0.5), 0.4, m.z + (Math.random() - 0.5));
        this.scene.add(mesh);
        this.dust.push({ mesh, life: 0.6 });
      }
    }

    for (const d of this.dust) {
      d.life -= dt;
      d.mesh.position.y += dt * 1.5;
      d.mesh.scale.setScalar(1 + (0.6 - d.life) * 2);
      d.mesh.material.opacity = Math.max(0, d.life / 0.6) * 0.7;
    }
    for (const d of this.dust.filter((q) => q.life <= 0)) {
      this.scene.remove(d.mesh);
      d.mesh.material.dispose();
    }
    this.dust = this.dust.filter((d) => d.life > 0);
  }
}
