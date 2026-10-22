// Tampilan pejalan kaki (berjubah ala Yunani) dan hewan: kotak-kotak kecil yang memantul saat berjalan,
// melompat saat menghindar, duduk kaget sesudahnya, dan hangus sebentar kalau tersambar petir.
import * as THREE from 'three';
import { BoxBatch, baseMatrix } from './boxBatch.js';
import { NPC_STATE as S } from '../sim/crowd.js';

const C = (hex) => new THREE.Color(hex);
const TOGA = ['#f5f5f4', '#93c5fd', '#fca5a5', '#fde68a', '#a7f3d0', '#c4b5fd', '#fdba74', '#f9a8d4'].map(C);
const SKIN = ['#f1c9a5', '#d9a47c', '#a8754f', '#7c5235'].map(C);
const HAIR = ['#2b2018', '#5a3b22', '#d8b25a', '#9a9a9a'].map(C);
const COL = {
  legs: C('#6b5a4a'),
  wool: C('#f3f1ea'),
  sheepFace: C('#2b2b2b'),
  chicken: C('#fbfaf5'),
  comb: C('#e2412f'),
  beak: C('#f3a43a'),
  goat: C('#b9a07a'),
  horn: C('#4a4038'),
};
const charred = new THREE.Color('#2a2522');
const tmp = new THREE.Color();
const base = new THREE.Matrix4();
// Sedikit lebih besar dari skala asli supaya terbaca dari kamera isometric.
const PERSON_SCALE = 1.35;
const ANIMAL_SCALE = { sheep: 1.15, chicken: 1.5, goat: 1.2 };

export class CrowdView {
  constructor(scene, game) {
    this.game = game;
    this.batch = new BoxBatch(scene, 900);
    this.time = 0;
  }

  update(dt) {
    const { crowd, world } = this.game;
    this.time += dt;
    this.batch.begin();
    for (const p of crowd.people) if (p.state !== S.HIDDEN) this.person(p, world);
    for (const a of crowd.animals) this.animal(a, world);
    this.batch.end();
  }

  color(agent, c) {
    return agent.zap > 0 ? tmp.copy(c).lerp(charred, Math.min(1, agent.zap) * 0.85) : c;
  }

  person(p, world) {
    const moving = p.state === S.WALK || p.state === S.CROSS || p.state === S.RETURN || p.state === S.HOME;
    const pace = p.state === S.HOME ? 16 : 9;
    const bob = moving ? Math.abs(Math.sin(this.time * pace + p.id)) * 0.1 : 0;
    const hop = p.state === S.DODGE ? Math.sin(p.hop * Math.PI) * 1.1 : 0;
    const lean = p.state === S.DODGE ? 0.5 : p.state === S.HOME ? 0.25 : 0;
    baseMatrix(base, p.x, world.heightAt(p.x, p.z) + bob + hop, p.z, p.heading, lean, 0, PERSON_SCALE);
    const toga = TOGA[Math.floor(p.colorSeed * TOGA.length)];
    const skin = SKIN[Math.floor(p.colorSeed * 97) % SKIN.length];
    const hair = HAIR[Math.floor(p.colorSeed * 53) % HAIR.length];
    const add = (size, at, c, tilt) => this.batch.add(base, size, at, this.color(p, c), tilt);
    if (p.state === S.SIT) {
      // Duduk kaget di tanah, kaki ke depan.
      add([0.42, 0.25, 0.6], [0, 0.13, 0.2], COL.legs);
      add([0.55, 0.6, 0.35], [0, 0.55, -0.05], toga, [-0.25, 0, 0]);
      add([0.35, 0.35, 0.35], [0, 1.0, -0.12], skin);
      add([0.37, 0.12, 0.37], [0, 1.2, -0.12], hair);
      return;
    }
    const swing = moving ? Math.sin(this.time * pace + p.id) * 0.4 : 0;
    add([0.16, 0.55, 0.2], [0.11, 0.28, 0], COL.legs, [swing, 0, 0]);
    add([0.16, 0.55, 0.2], [-0.11, 0.28, 0], COL.legs, [-swing, 0, 0]);
    add([0.55, 0.7, 0.35], [0, 0.88, 0], toga);
    add([0.35, 0.35, 0.35], [0, 1.42, 0], skin);
    add([0.37, 0.12, 0.37], [0, 1.62, 0], hair);
    // Tangan terangkat panik saat melompat atau lari pulang.
    if (p.state === S.DODGE || p.state === S.HOME) {
      add([0.12, 0.5, 0.12], [0.36, 1.45, 0], skin, [0, 0, -0.4]);
      add([0.12, 0.5, 0.12], [-0.36, 1.45, 0], skin, [0, 0, 0.4]);
    }
  }

  animal(a, world) {
    const moving = a.state === S.WALK || a.state === S.FLEE;
    const bob = moving ? Math.abs(Math.sin(this.time * (a.state === S.FLEE ? 18 : 8) + a.id)) * 0.12 : 0;
    const hop = a.state === S.DODGE || (a.kind === 'goat' && a.state === S.FLEE) ? Math.sin(a.hop * Math.PI) * (a.kind === 'goat' ? 1.4 : 0.9) : 0;
    // Saat diam: domba & kambing merumput (kepala turun), ayam mematuk.
    const graze = a.state === S.IDLE ? (a.kind === 'chicken' ? Math.max(0, Math.sin(this.time * 6 + a.id)) * 0.6 : 0.35) : 0;
    baseMatrix(base, a.x, world.heightAt(a.x, a.z) + bob + hop, a.z, a.heading, 0, 0, ANIMAL_SCALE[a.kind]);
    const add = (size, at, c, tilt) => this.batch.add(base, size, at, this.color(a, c), tilt);
    if (a.kind === 'sheep') {
      add([0.9, 0.7, 1.2], [0, 0.7, 0], COL.wool);
      add([0.38, 0.42, 0.45], [0, 0.85 - graze, 0.72], COL.sheepFace, [graze, 0, 0]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add([0.14, 0.4, 0.14], [sx * 0.28, 0.2, sz * 0.4], COL.sheepFace);
    } else if (a.kind === 'chicken') {
      add([0.34, 0.34, 0.46], [0, 0.32, 0], COL.chicken);
      add([0.24, 0.26, 0.24], [0, 0.6 - graze * 0.4, 0.2 + graze * 0.1], COL.chicken, [graze, 0, 0]);
      add([0.06, 0.12, 0.16], [0, 0.78 - graze * 0.4, 0.2], COL.comb);
      add([0.08, 0.06, 0.12], [0, 0.6 - graze * 0.45, 0.36 + graze * 0.05], COL.beak);
      add([0.05, 0.16, 0.05], [0.08, 0.08, 0], COL.beak);
      add([0.05, 0.16, 0.05], [-0.08, 0.08, 0], COL.beak);
    } else {
      add([0.6, 0.6, 1.0], [0, 0.75, 0], COL.goat);
      add([0.3, 0.38, 0.42], [0, 1.1 - graze, 0.6], COL.goat, [graze, 0, 0]);
      add([0.07, 0.28, 0.07], [0.09, 1.4 - graze, 0.55], COL.horn, [-0.4, 0, 0]);
      add([0.07, 0.28, 0.07], [-0.09, 1.4 - graze, 0.55], COL.horn, [-0.4, 0, 0]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add([0.12, 0.45, 0.12], [sx * 0.2, 0.22, sz * 0.35], COL.goat);
    }
  }
}
