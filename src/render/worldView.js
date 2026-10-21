// Mesh graybox dari data world: jalan, blok gedung, HQ, Electrical Plant, zona Zeus.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ROAD_LINES, ROAD_HALF_WIDTH, BOUNDS } from '../sim/world.js';

const BUILDING_COLORS = ['#d9d4cb', '#cfc9bf', '#e2ddd3', '#c7c2b8'];

function flat(width, depth, color, y, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 1, ...opts }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function label(text, className) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const rayDir = new THREE.Vector3();
const RAY_OFFSETS = [
  [0, 0],
  [2, 0],
  [-2, 0],
  [0, 2],
  [0, -2],
];

export class WorldView {
  constructor(scene, world) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.windowMaterials = [];
    // Gedung yang menutupi van dari sudut kamera dibuat transparan.
    this.occluders = [];

    const size = BOUNDS * 2;
    const ground = flat(size + 400, size + 400, '#8f9a7a', -0.02);
    this.group.add(ground);
    this.group.add(flat(size, size, '#c9c3b8', 0));

    // Jalan + marka tengah putus-putus.
    const roadMat = new THREE.MeshStandardMaterial({ color: '#4a4d55', roughness: 0.95 });
    const dashes = [];
    for (const line of ROAD_LINES) {
      const h = flat(size, ROAD_HALF_WIDTH * 2, '#4a4d55', 0.01);
      h.material = roadMat;
      h.position.z = line;
      const v = flat(ROAD_HALF_WIDTH * 2, size, '#4a4d55', 0.012);
      v.material = roadMat;
      v.position.x = line;
      this.group.add(h, v);
      for (let s = -BOUNDS + 3; s < BOUNDS; s += 6) {
        if (ROAD_LINES.some((l) => Math.abs(l - s) < ROAD_HALF_WIDTH + 1)) continue;
        dashes.push([s, line, 0], [line, s, Math.PI / 2]);
      }
    }
    const dashMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(3, 0.3).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#e6dfb0', roughness: 0.8 }),
      dashes.length,
    );
    const m = new THREE.Matrix4();
    dashes.forEach(([x, z, rot], i) => {
      m.makeRotationY(rot).setPosition(x, 0.02, z);
      dashMesh.setMatrixAt(i, m);
    });
    dashMesh.receiveShadow = true;
    this.group.add(dashMesh);

    // Zona Zeus: lantai kekuningan + garis batas.
    const zone = world.zeusZone;
    const zw = zone.maxX - zone.minX;
    const zd = zone.maxZ - zone.minZ;
    const zoneTint = flat(zw, zd, '#ffd84a', 0.03, { transparent: true, opacity: 0.16, depthWrite: false });
    zoneTint.position.set((zone.minX + zone.maxX) / 2, 0.03, (zone.minZ + zone.maxZ) / 2);
    this.group.add(zoneTint);
    const borderMat = new THREE.MeshBasicMaterial({ color: '#ffcc00' });
    const borderW = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, zd), borderMat);
    borderW.position.set(zone.minX, 0.08, (zone.minZ + zone.maxZ) / 2);
    const borderS = new THREE.Mesh(new THREE.BoxGeometry(zw, 0.15, 0.5), borderMat);
    borderS.position.set((zone.minX + zone.maxX) / 2, 0.08, zone.maxZ);
    this.group.add(borderW, borderS);
    const zoneLabel = label('⚡ ZONA ZEUS', 'world-label zone');
    zoneLabel.position.set(zone.minX + 10, 0.5, zone.maxZ - 3);
    this.group.add(zoneLabel);

    for (const [i, block] of world.blocks.entries()) {
      if (block.kind === 'normal') this.addBuilding(block, BUILDING_COLORS[i % BUILDING_COLORS.length]);
      if (block.kind === 'hq') this.addHQ(block, world.hq);
      if (block.kind === 'plant') this.addPlant(block);
    }

    // Pagar batas map.
    const wallMat = new THREE.MeshStandardMaterial({ color: '#9b9488' });
    for (const [w, d, x, z] of [
      [size + 4, 2, 0, -BOUNDS - 1],
      [size + 4, 2, 0, BOUNDS + 1],
      [2, size, -BOUNDS - 1, 0],
      [2, size, BOUNDS + 1, 0],
    ]) {
      const wall = box(w, 1.6, d, wallMat);
      wall.position.set(x, 0.8, z);
      this.group.add(wall);
    }

    // Gunung Olympus di kejauhan (latar, di luar map).
    const rock = new THREE.MeshStandardMaterial({ color: '#8a8378', flatShading: true });
    const snow = new THREE.MeshStandardMaterial({ color: '#f4f4f4', flatShading: true });
    for (const [x, z, r, h] of [
      [-190, -190, 70, 110],
      [-120, -230, 45, 70],
      [-240, -110, 45, 75],
    ]) {
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rock);
      mountain.position.set(x, h / 2 - 1, z);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.32, 7), snow);
      cap.position.set(x, h - h * 0.16 - 1, z);
      this.group.add(mountain, cap);
    }
  }

  addBuilding(block, color) {
    const { footprint: f, height } = block;
    const w = f.maxX - f.minX;
    const d = f.maxZ - f.minZ;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: '#ffcf73', emissiveIntensity: 0 });
    const body = box(w, height, d, mat);
    body.position.set(block.cx, height / 2, block.cz);
    // Cornice ala kuil Yunani di atap.
    const cornice = box(w + 1, 0.8, d + 1, new THREE.MeshStandardMaterial({ color: '#f1ede4' }));
    cornice.position.set(block.cx, height + 0.4, block.cz);
    this.group.add(body, cornice);
    this.addOccluder(body, [body, cornice]);
    this.windowMaterials.push(body.material);
    const name = label(block.name, 'world-label block');
    name.position.set(block.cx, height + 1.5, block.cz);
    this.group.add(name);
  }

  addHQ(block, hq) {
    const f = block.footprint;
    const w = f.maxX - f.minX;
    const d = f.maxZ - f.minZ;
    const building = box(w, block.height, d, new THREE.MeshStandardMaterial({ color: '#3b6fb6' }));
    building.position.set((f.minX + f.maxX) / 2, block.height / 2, (f.minZ + f.maxZ) / 2);
    this.group.add(building);
    this.addOccluder(building, [building]);
    const z = hq.zone;
    const lot = flat(z.maxX - z.minX, z.maxZ - z.minZ, '#8fb3e0', 0.025);
    lot.position.set((z.minX + z.maxX) / 2, 0.025, (z.minZ + z.maxZ) / 2);
    this.group.add(lot);
    const sign = label('HERMES EXPRESS HQ', 'world-label hq');
    sign.position.set(building.position.x, block.height + 3, building.position.z);
    this.group.add(sign);
  }

  addPlant(block) {
    const f = block.footprint;
    const w = f.maxX - f.minX;
    const d = f.maxZ - f.minZ;
    const yellow = new THREE.MeshStandardMaterial({ color: '#d9b84a' });
    const metal = new THREE.MeshStandardMaterial({ color: '#7d8590', metalness: 0.3, roughness: 0.6 });
    const body = box(w, block.height, d, yellow);
    body.position.set(block.cx, block.height / 2, block.cz);
    this.group.add(body);
    const plantParts = [body];
    for (const [dx, dz] of [
      [-6, 4],
      [-1, 4],
    ]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 10, 12), metal);
      stack.castShadow = true;
      stack.position.set(block.cx + dx, block.height + 5, block.cz + dz);
      this.group.add(stack);
      plantParts.push(stack);
    }
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 16, 8), metal);
    tower.castShadow = true;
    tower.position.set(block.cx + 5, block.height + 8, block.cz - 4);
    this.orb = new THREE.Mesh(
      new THREE.SphereGeometry(2, 16, 12),
      new THREE.MeshStandardMaterial({ color: '#fff3a0', emissive: '#ffd84a', emissiveIntensity: 1.5 }),
    );
    this.orb.position.set(block.cx + 5, block.height + 17, block.cz - 4);
    this.group.add(tower, this.orb);
    plantParts.push(tower, this.orb);
    this.addOccluder(body, plantParts);
    const sign = label('⚡ ELECTRICAL PLANT', 'world-label plant');
    sign.position.set(block.cx, block.height + 22, block.cz);
    this.group.add(sign);
  }

  addOccluder(hitMesh, parts) {
    // Material dibuat unik per bagian supaya bisa di-fade sendiri-sendiri.
    for (const part of parts) {
      part.material = part.material.clone();
      part.material.transparent = true;
    }
    this.occluders.push({ hitMesh, parts, opacity: 1 });
  }

  updateOcclusion(dt, car, cameraOffset) {
    rayDir.copy(cameraOffset).normalize();
    const hit = new Set();
    const meshes = this.occluders.map((o) => o.hitMesh);
    for (const [ox, oz] of RAY_OFFSETS) {
      raycaster.set(rayOrigin.set(car.x + ox, 1.2, car.z + oz), rayDir);
      for (const h of raycaster.intersectObjects(meshes, false)) hit.add(h.object);
    }
    for (const o of this.occluders) {
      const target = hit.has(o.hitMesh) ? 0.22 : 1;
      o.opacity += (target - o.opacity) * (1 - Math.exp(-10 * dt));
      for (const part of o.parts) {
        part.material.opacity = o.opacity;
        part.material.depthWrite = o.opacity > 0.95;
        part.castShadow = o.opacity > 0.5;
      }
    }
  }

  update(dt, night, car, cameraOffset) {
    this.updateOcclusion(dt, car, cameraOffset);
    // Jendela gedung menyala saat malam.
    for (const mat of this.windowMaterials) mat.emissiveIntensity = night * 0.06;
    if (this.orb) this.orb.material.emissiveIntensity = 1.2 + Math.sin(performance.now() / 180) * 0.6;
  }
}
