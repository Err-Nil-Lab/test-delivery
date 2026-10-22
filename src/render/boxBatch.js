// Banyak kotak berwarna dalam satu InstancedMesh: dipakai untuk mobil NPC, orang, hewan, dan burung.
// Tiap frame: begin(), add(...) per bagian, end().
import * as THREE from 'three';

const local = new THREE.Matrix4();
const out = new THREE.Matrix4();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler();

export class BoxBatch {
  constructor(scene, max, { emissive = null, castShadow = true } = {}) {
    const material = emissive
      ? new THREE.MeshStandardMaterial({ color: '#ffffff', emissive, emissiveIntensity: 0 })
      : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.castShadow = castShadow;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.max = max;
    this.n = 0;
    scene.add(this.mesh);
  }

  get material() {
    return this.mesh.material;
  }

  begin() {
    this.n = 0;
  }

  // base: matriks objek (posisi + arah). size/at: [x, y, z] lokal. tilt: rotasi lokal opsional [x, y, z].
  add(base, size, at, color, tilt = null) {
    if (this.n >= this.max) return;
    pos.set(at[0], at[1], at[2]);
    scl.set(size[0], size[1], size[2]);
    if (tilt) quat.setFromEuler(euler.set(tilt[0], tilt[1], tilt[2]));
    else quat.identity();
    local.compose(pos, quat, scl);
    out.multiplyMatrices(base, local);
    this.mesh.setMatrixAt(this.n, out);
    this.mesh.setColorAt(this.n, color);
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// Matriks dasar objek di dunia: posisi, arah hadap (heading), dan miring opsional.
const baseQuat = new THREE.Quaternion();
const baseEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const baseScale = new THREE.Vector3();
export function baseMatrix(target, x, y, z, heading, pitch = 0, roll = 0, scale = 1) {
  baseQuat.setFromEuler(baseEuler.set(pitch, heading, roll));
  return target.compose(pos.set(x, y, z), baseQuat, baseScale.setScalar(scale));
}
