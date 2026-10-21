// Pool partikel instanced: satu InstancedMesh untuk semua debu, percikan, koin, asap, dan serpihan.
// Partikel "memudar" dengan mengecil (InstancedMesh tidak punya opacity per instance).
import * as THREE from 'three';

const dummy = new THREE.Object3D();
const color = new THREE.Color();

export class ParticlePool {
  constructor(scene, max = 700) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, color.set('#ffffff'));
    this.items = new Array(max).fill(null);
    this.cursor = 0;
    scene.add(this.mesh);
    this.hideAll();
  }

  hideAll() {
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // p: { x, y, z, vx, vy, vz, life, size, color, gravity, drag, grow }
  emit(p) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.items[i] = { gravity: 0, drag: 0, grow: 0, spin: (Math.random() - 0.5) * 8, ...p, age: 0 };
    this.mesh.setColorAt(i, color.set(p.color));
    this.mesh.instanceColor.needsUpdate = true;
  }

  // Semburan n partikel ke segala arah.
  burst(n, { x, y, z, speed = 6, up = 4, ...rest }) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit({ x, y, z, vx: Math.cos(a) * s, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s, ...rest });
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      if (!p) continue;
      p.age += dt;
      if (p.age >= p.life) {
        this.items[i] = null;
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      p.vy -= p.gravity * dt;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = 1 - p.age / p.life;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.age * p.spin, p.age * p.spin * 0.7, 0);
      dummy.scale.setScalar(Math.max(0.001, p.size * (p.grow ? 1 + p.grow * (1 - k) : k)));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
