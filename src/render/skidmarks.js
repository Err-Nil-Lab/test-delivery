// Bekas ban di aspal/tanah saat van ngepot: segmen gelap tipis per roda belakang,
// disimpan di ring buffer InstancedMesh (yang paling lama ditimpa).
import * as THREE from 'three';

const MAX = 1200;
const WIDTH = 0.38;
const tmp = new THREE.Object3D();

export class SkidMarks {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#1b1b1d', transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.next = 0;
    this.last = [null, null]; // posisi terakhir roda kiri/kanan belakang
  }

  // wheels: [{x, y, z}, {x, y, z}] atau null saat tidak ngepot (memutus jejak).
  update(wheels) {
    if (!wheels) {
      this.last = [null, null];
      return;
    }
    wheels.forEach((w, i) => {
      const prev = this.last[i];
      if (prev) {
        const dx = w.x - prev.x;
        const dz = w.z - prev.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.35) return; // tunggu sampai segmen cukup panjang
        if (len < 4) this.add(prev, w, len);
      }
      this.last[i] = { ...w };
    });
  }

  add(a, b, len) {
    tmp.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.06, (a.z + b.z) / 2);
    tmp.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
    tmp.scale.set(WIDTH, 1, len + 0.05);
    tmp.updateMatrix();
    this.mesh.setMatrixAt(this.next, tmp.matrix);
    this.next = (this.next + 1) % MAX;
    this.mesh.count = Math.min(MAX, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.mesh.count = 0;
    this.next = 0;
    this.last = [null, null];
  }
}
