// Tampilan lalu lintas NPC: semua bagian mobil dalam satu InstancedMesh kotak berwarna,
// plus lampu depan yang menyala saat senja. Mobil yang tersambar petir hangus sebentar.
import * as THREE from 'three';
import { BoxBatch, baseMatrix } from './boxBatch.js';

const C = (hex) => new THREE.Color(hex);
const PASTEL = ['#f4a7a7', '#a7c7f4', '#f4dca7', '#b8e3b0', '#d6b8f0', '#f0f0ea', '#9fd8d8', '#f6c49a'].map(C);
const COL = {
  glass: C('#2c3a48'),
  wood: C('#9a6b3f'),
  gold: C('#e8c15a'),
  horse: C('#f1ebe0'),
  horseDark: C('#7a5638'),
  truck: C('#5f9c58'),
  veg: C('#f08a3c'),
  cabbage: C('#9bd36a'),
  rival: C('#8b5cf6'),
  rivalStripe: C('#f472b6'),
  wing: C('#fef3c7'),
  goat: C('#efe9dc'),
  dark: C('#2b2b2b'),
  wheel: C('#1f1f22'),
  lamp: C('#fff4cc'),
};
const charred = new THREE.Color('#2a2522');
const tmp = new THREE.Color();
const base = new THREE.Matrix4();
const beamLocal = new THREE.Matrix4();
const beamOut = new THREE.Matrix4();

// Bagian tiap jenis kendaraan (lokal: x = lebar, y = atas, z = depan).
function parts(car, add) {
  const w = car.width;
  const L = car.length;
  const paint = PASTEL[Math.floor(car.colorSeed * PASTEL.length)];
  switch (car.kind) {
    case 'chariot':
      add([w, 0.6, 2], [0, 0.75, -1.1], COL.gold);
      add([0.18, 1.2, 1.2], [w / 2, 0.6, -1.1], COL.wood);
      add([0.18, 1.2, 1.2], [-w / 2, 0.6, -1.1], COL.wood);
      add([0.7, 0.8, 1.6], [0, 1.15, 1.2], car.colorSeed > 0.5 ? COL.horse : COL.horseDark);
      add([0.4, 0.7, 0.55], [0, 1.65, 2.1], car.colorSeed > 0.5 ? COL.horse : COL.horseDark, [0.5, 0, 0]);
      add([0.5, 0.75, 0.4], [0, 1.4, -1.3], paint); // kusir
      return;
    case 'truck':
      add([w, 1.6, 1.6], [0, 1.1, L / 2 - 0.8], COL.truck);
      add([w * 0.9, 0.5, 0.06], [0, 1.4, L / 2 + 0.01], COL.glass);
      add([w, 0.5, L - 1.7], [0, 0.65, -0.85], COL.wood);
      add([w * 0.8, 0.7, L - 2.2], [0, 1.25, -0.9], car.colorSeed > 0.5 ? COL.veg : COL.cabbage);
      return;
    case 'rival':
      add([w, 1.7, L], [0, 1.2, 0], COL.rival);
      add([w + 0.04, 0.3, L * 0.8], [0, 1.0, -0.2], COL.rivalStripe);
      add([w * 0.86, 0.6, 0.06], [0, 1.6, L / 2 + 0.01], COL.glass);
      add([0.12, 0.5, 1.3], [w / 2 + 0.25, 2.1, -0.3], COL.wing, [0, 0, -0.6]); // sayap Iris di atap
      add([0.12, 0.5, 1.3], [-w / 2 - 0.25, 2.1, -0.3], COL.wing, [0, 0, 0.6]);
      return;
    case 'goatcart':
      add([w, 0.6, 1.8], [0, 0.65, -0.6], COL.wood);
      add([0.5, 0.6, 1.0], [0, 0.85, 1.0], COL.goat);
      add([0.35, 0.45, 0.45], [0, 1.25, 1.6], COL.goat);
      add([0.08, 0.3, 0.08], [0.1, 1.6, 1.55], COL.dark);
      add([0.08, 0.3, 0.08], [-0.1, 1.6, 1.55], COL.dark);
      return;
    default:
      add([w, 0.8, L], [0, 0.75, 0], paint);
      add([w * 0.86, 0.7, L * 0.5], [0, 1.5, -0.2], paint);
      add([w * 0.8, 0.5, 0.06], [0, 1.5, L * 0.05 + 0.01], COL.glass);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add([0.3, 0.6, 0.6], [(sx * w) / 2, 0.35, (sz * L) / 3], COL.wheel);
  }
}

export class TrafficView {
  constructor(scene, game) {
    this.game = game;
    this.bodies = new BoxBatch(scene, 400);
    this.lamps = new BoxBatch(scene, 120, { emissive: '#fff2c0', castShadow: false });
    // Genangan cahaya lampu depan di aspal (palsu & murah: bidang aditif).
    this.beams = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffe9b0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      60,
    );
    this.beams.frustumCulled = false;
    this.beams.count = 0;
    scene.add(this.beams);
    this.time = 0;
  }

  update(dt, night) {
    const { traffic, world } = this.game;
    this.time += dt;
    this.bodies.begin();
    this.lamps.begin();
    this.lamps.material.emissiveIntensity = 0.2 + night * 4;
    this.beams.material.opacity = night * 0.22;
    let beams = 0;
    for (const car of traffic.cars) {
      if (car.hidden) continue;
      const hop = car.zap > 1.4 ? Math.sin(((2 - car.zap) / 0.6) * Math.PI) * 1.2 : 0;
      const roll = car.state === 'spun' ? Math.sin(this.time * 20) * 0.08 : 0;
      baseMatrix(base, car.x, world.heightAt(car.x, car.z) + hop, car.z, car.heading, 0, roll);
      const burnt = Math.min(1, car.zap);
      parts(car, (size, at, color, tilt) => this.bodies.add(base, size, at, burnt > 0 ? tmp.copy(color).lerp(charred, burnt * 0.85) : color, tilt));
      if (car.kind !== 'chariot' && car.kind !== 'goatcart') {
        for (const sx of [-1, 1]) this.lamps.add(base, [0.45, 0.3, 0.1], [(sx * car.width) / 3, 0.85, car.length / 2 + 0.03], COL.lamp);
        if (night > 0.05 && beams < 60) {
          beamLocal.makeScale(car.width * 1.3, 1, 7).setPosition(0, 0.08, car.length / 2 + 3.6);
          this.beams.setMatrixAt(beams++, beamOut.multiplyMatrices(base, beamLocal));
        }
      }
    }
    this.bodies.end();
    this.lamps.end();
    this.beams.count = beams;
    this.beams.instanceMatrix.needsUpdate = true;
  }
}
