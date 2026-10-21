// Penanda paket: pilar cahaya di titik pickup (warna = tipe, label = bayaran + tujuan,
// panah di tanah = arah tujuan) dan pilar tujuan untuk paket yang sedang dibawa.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { disposeObject } from './dispose.js';
import { packageLook } from '../sim/curses.js';

const COLORS = { dest: '#4ade80', zeusDest: '#ffe066' };

function beam(color, height, radius) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
  );
  mesh.position.y = height / 2;
  return mesh;
}

function ring(color, radius) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.35, radius, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  mesh.position.y = 0.06;
  return mesh;
}

function tag(html, className) {
  const el = document.createElement('div');
  el.className = `tag ${className}`;
  el.innerHTML = html;
  return new CSS2DObject(el);
}

export class MarkersView {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.pickups = new Map();
    this.dests = new Map();
    this.time = 0;
    this.crateMats = {
      safe: new THREE.MeshStandardMaterial({ color: '#b98b55' }),
      zeus: new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffb800', emissiveIntensity: 0.7 }),
    };
    this.arrowGeo = new THREE.ConeGeometry(0.9, 2.2, 3).rotateX(Math.PI / 2);
    this.arrowGeo.userData.shared = true;
    for (const mat of Object.values(this.crateMats)) mat.userData.shared = true;
  }

  createPickup(pkg) {
    const group = new THREE.Group();
    group.position.set(pkg.pickup.x, this.game.world.heightAt(pkg.pickup.x, pkg.pickup.z) + 0.3, pkg.pickup.z);
    const look = packageLook(pkg);
    const color = look.color;
    const special = pkg.type !== 'safe';
    group.add(beam(color, special ? 18 : 10, special ? 1.1 : 0.8));
    group.add(ring(color, this.game.cfg.packages.pickupRadius));
    const crateMat = this.crateMats[pkg.type] ?? new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
    crate.castShadow = true;
    crate.position.y = 1.2;
    group.add(crate);

    // Panah di tanah menunjuk ke tujuan.
    const arrowPivot = new THREE.Group();
    arrowPivot.rotation.y = Math.atan2(pkg.dest.x - pkg.pickup.x, pkg.dest.z - pkg.pickup.z);
    const arrow = new THREE.Mesh(this.arrowGeo, new THREE.MeshBasicMaterial({ color }));
    arrow.position.set(0, 0.15, 3.2);
    arrow.scale.y = 0.25;
    arrowPivot.add(arrow);
    group.add(arrowPivot);

    const icon = look.icon ? `${look.icon} ` : '';
    const slots = pkg.slots > 1 ? ` · ${pkg.slots} slot` : '';
    const curse = pkg.type === 'curse' ? `<small class="curse-name">${look.name}</small>` : '';
    const label = tag(`<b>${icon}$${pkg.pay}</b>${curse}<small>→ ${pkg.dest.name}${slots}</small>`, pkg.type);
    if (pkg.type === 'curse') label.element.style.background = color;
    label.position.y = special ? 6 : 4.5;
    group.add(label);

    this.scene.add(group);
    return { group, crate, label };
  }

  createDest(pkg) {
    const group = new THREE.Group();
    group.position.set(pkg.dest.x, this.game.world.heightAt(pkg.dest.x, pkg.dest.z) + 0.3, pkg.dest.z);
    const color = pkg.type === 'zeus' ? COLORS.zeusDest : pkg.type === 'curse' ? packageLook(pkg).color : COLORS.dest;
    group.add(beam(color, 22, 1.3));
    group.add(ring(color, this.game.cfg.packages.dropoffRadius));
    const label = tag(`<b>Antar: ${pkg.dest.name}</b><small>$${pkg.pay}</small>`, `dest ${pkg.type}`);
    label.position.y = 5;
    group.add(label);
    this.scene.add(group);
    return { group };
  }

  sync(map, items, create) {
    const live = new Set(items.map((p) => p.id));
    for (const [id, view] of map) {
      if (!live.has(id)) {
        this.scene.remove(view.group);
        disposeObject(view.group);
        map.delete(id);
      }
    }
    for (const pkg of items) if (!map.has(pkg.id)) map.set(pkg.id, create(pkg));
  }

  update(dt) {
    this.time += dt;
    const { packages } = this.game;
    this.sync(this.pickups, packages.waiting, (p) => this.createPickup(p));
    this.sync(this.dests, packages.cargo, (p) => this.createDest(p));

    for (const pkg of packages.waiting) {
      const view = this.pickups.get(pkg.id);
      view.crate.rotation.y += dt * 1.5;
      view.crate.position.y = 1.2 + Math.sin(this.time * 3 + pkg.id) * 0.25;
      // Berkedip saat hampir kedaluwarsa.
      const remaining = pkg.lifetime - pkg.age;
      view.group.visible = remaining > 8 || Math.sin(this.time * 14) > -0.3;
      view.label.visible = view.group.visible;
    }
  }
}
