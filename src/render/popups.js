// Teks melayang di dunia: "+$120", "BONK!", "HIK!", "boop". CSS2D yang naik lalu memudar.
// Tiga tingkat: major (uang/rugi, besar), minor (aksi, sedang), ambient (celoteh NPC: kecil, samar,
// maksimal beberapa sekaligus) supaya informasi penting tidak tenggelam.
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const TIER_OF = { money: 'major', loss: 'major', tip: 'major', bonk: 'major', honk: 'ambient', scream: 'ambient', animal: 'ambient', heart: 'ambient', boop: 'ambient' };
const MAX_AMBIENT = 2;
const AMBIENT_OPACITY = 0.75;

export class Popups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spawn(text, x, y, z, kind = '', life = 1.1, tier = TIER_OF[kind.split(' ')[0]] ?? 'minor') {
    if (tier === 'ambient') {
      // Celoteh NPC dibatasi: yang paling lama dibuang.
      const ambient = this.items.filter((p) => p.tier === 'ambient');
      if (ambient.length >= MAX_AMBIENT) ambient[0].age = ambient[0].life;
    }
    // Beberapa popup sekaligus di tempat yang sama ditumpuk ke atas supaya tidak saling menimpa.
    const crowd = this.items.filter((p) => p.age < 0.6 && Math.hypot(p.x0 - x, p.z0 - z) < 3).length;
    const x0 = x;
    const z0 = z;
    y += crowd * 1.5;
    // CSS2DRenderer memakai transform elemen luar untuk posisi, jadi animasi ada di span dalam.
    const el = document.createElement('div');
    const inner = document.createElement('span');
    inner.className = `popup ${kind} t-${tier}`;
    inner.textContent = text;
    el.appendChild(inner);
    const obj = new CSS2DObject(el);
    obj.position.set(x, y, z);
    this.scene.add(obj);
    this.items.push({ obj, el, inner, life, age: 0, tier, x0, z0 });
  }

  update(dt) {
    for (const p of this.items) {
      p.age += dt;
      p.obj.position.y += dt * 3;
      const k = p.age / p.life;
      p.inner.style.opacity = String(Math.max(0, 1 - k * k) * (p.tier === 'ambient' ? AMBIENT_OPACITY : 1));
      p.inner.style.transform = `scale(${1 + Math.max(0, 0.15 - p.age) * 4})`;
    }
    for (const p of this.items.filter((q) => q.age >= q.life)) {
      this.scene.remove(p.obj);
      p.el.remove();
    }
    this.items = this.items.filter((p) => p.age < p.life);
  }
}
