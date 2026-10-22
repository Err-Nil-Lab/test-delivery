// Mobil derek tengah malam: truk oranye dengan lampu kuning berkedip, bak datar, dan tiang pengait.
// Posisinya dikendalikan oleh urutan tengah malam di sim (game.midnight.truck).
import * as THREE from 'three';
import { BoxBatch, baseMatrix } from './boxBatch.js';

const C = (hex) => new THREE.Color(hex);
const COL = { body: C('#f08a1c'), cab: C('#f5a33b'), glass: C('#24323f'), bed: C('#4a4a50'), wheel: C('#1b1b1e'), arm: C('#cfd3da'), cable: C('#1b1b1e'), stripe: C('#fff5d6') };
const base = new THREE.Matrix4();

export class TowView {
  constructor(scene, game) {
    this.game = game;
    this.body = new BoxBatch(scene, 40);
    this.lights = new BoxBatch(scene, 8, { emissive: '#ffc400', castShadow: false });
    this.time = 0;
  }

  update(dt) {
    const { midnight, world } = this.game;
    this.time += dt;
    this.body.begin();
    this.lights.begin();
    const t = midnight.truck;
    if (t && midnight.active) {
      const y = world.heightAt(t.x, t.z);
      baseMatrix(base, t.x, y, t.z, t.heading, 0, 0, 1.15);
      const add = (size, at, c, tilt) => this.body.add(base, size, at, c, tilt);
      add([2.4, 0.6, 7], [0, 0.7, -0.6], COL.bed); // bak datar
      add([2.5, 0.8, 2.6], [0, 1.2, 2.4], COL.body); // kabin bawah
      add([2.3, 0.9, 1.7], [0, 2.0, 2.1], COL.cab); // atap kabin
      add([2.1, 0.55, 0.08], [0, 2.05, 3.0], COL.glass); // kaca depan
      add([2.55, 0.18, 6.6], [0, 1.05, -0.6], COL.stripe); // garis
      for (const sx of [-1, 1]) for (const sz of [2.2, -0.8, -3]) add([0.35, 0.9, 0.9], [sx * 1.2, 0.45, sz], COL.wheel);
      // Tiang pengait di belakang + kabel ke depan bumper van.
      add([0.35, 1.6, 0.35], [0, 1.9, -3.4], COL.arm, [0.35, 0, 0]);
      if (t.hooked) add([0.12, 0.12, 2.6], [0, 1.2, -5.1], COL.cable);
      // Lampu kuning berkedip di atap.
      const on = Math.floor(this.time * 7) % 2 === 0;
      for (const sx of [-1, 1]) {
        const lit = on === (sx > 0);
        this.lights.add(base, [0.5, 0.3, 0.5], [sx * 0.7, 2.6, 2.0], lit ? C('#ffd24a') : C('#7a5a00'));
      }
      this.lights.material.emissiveIntensity = 3;
    }
    this.body.end();
    this.lights.end();
  }
}
