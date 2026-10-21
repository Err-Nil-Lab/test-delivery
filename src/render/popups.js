// Teks melayang di dunia: "+$120", "BONK!", "HIK!", "boop". CSS2D yang naik lalu memudar.
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class Popups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spawn(text, x, y, z, kind = '', life = 1.1) {
    // CSS2DRenderer memakai transform elemen luar untuk posisi, jadi animasi ada di span dalam.
    const el = document.createElement('div');
    const inner = document.createElement('span');
    inner.className = `popup ${kind}`;
    inner.textContent = text;
    el.appendChild(inner);
    const obj = new CSS2DObject(el);
    obj.position.set(x, y, z);
    this.scene.add(obj);
    this.items.push({ obj, el, inner, life, age: 0 });
  }

  update(dt) {
    for (const p of this.items) {
      p.age += dt;
      p.obj.position.y += dt * 3;
      const k = p.age / p.life;
      p.inner.style.opacity = String(Math.max(0, 1 - k * k));
      p.inner.style.transform = `scale(${1 + Math.max(0, 0.15 - p.age) * 4})`;
    }
    for (const p of this.items.filter((q) => q.age >= q.life)) {
      this.scene.remove(p.obj);
      p.el.remove();
    }
    this.items = this.items.filter((p) => p.age < p.life);
  }
}
