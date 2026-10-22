// Garis GPS di aspal: chevron ">" yang mengalir dari van menuju tujuan aktif, berwarna sesuai tujuan.
import * as THREE from 'three';

export const ROUTE_COLORS = { dest: '#4ade80', express: '#fb923c', zeus: '#ffd84a', hq: '#7aa7ff', pickup: '#f6f3ec' };
const SPACING = 3.2;
const SPEED = 9; // meter per detik aliran chevron
const MAX = 420;
const tmp = new THREE.Object3D();

function chevronGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.9, -0.5);
  s.lineTo(0, 0.35);
  s.lineTo(0.9, -0.5);
  s.lineTo(0.9, 0.05);
  s.lineTo(0, 0.9);
  s.lineTo(-0.9, 0.05);
  s.closePath();
  // Bentuk di bidang XY dengan ujung ke +Y → rebahkan supaya ujung menunjuk +Z (arah heading 0).
  return new THREE.ShapeGeometry(s).rotateX(Math.PI / 2);
}

export class RouteView {
  constructor(scene, game) {
    this.game = game;
    this.material = new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(chevronGeometry(), this.material, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.flow = 0;
  }

  update(dt) {
    const { nav, world, run } = this.game;
    const route = nav.route;
    this.flow = (this.flow + dt * SPEED) % SPACING;
    if (!nav.enabled || run.state !== 'day' || route.length < 2) {
      this.mesh.count = 0;
      return;
    }
    this.material.color.set(ROUTE_COLORS[nav.target?.kind] ?? ROUTE_COLORS.dest);
    // Jalan sepanjang polyline, taruh chevron tiap SPACING meter (mulai sedikit di depan van).
    let n = 0;
    let carry = this.flow + 3; // flow bertambah → chevron bergerak ke arah tujuan
    for (let i = 1; i < route.length && n < MAX; i++) {
      const a = route[i - 1];
      const b = route[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-6) continue;
      const heading = Math.atan2(b.x - a.x, b.z - a.z);
      let s = carry;
      while (s < len && n < MAX) {
        const t = s / len;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        tmp.position.set(x, world.heightAt(x, z) + 0.22, z);
        tmp.rotation.set(0, heading, 0);
        tmp.updateMatrix();
        this.mesh.setMatrixAt(n++, tmp.matrix);
        s += SPACING;
      }
      carry = s - len;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
