// Mesh graybox dari data world: wilayah (laut, padang, gunung), jalan melengkung yang mengikuti
// medan, gedung kota/perumahan/istana/plant, dan label distrik.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { resample, polygonBounds, pointInPolygon, hash2 } from '../sim/geometry.js';

const COLORS = {
  wild: '#8d9877',
  ground: '#bdb8ac',
  grass: '#9cb883',
  sea: '#5b93a8',
  plaza: '#77787f',
  court: '#e6e0d2',
  hillLow: '#aaa572',
  rock: '#8a8478',
  wood: '#8b6844',
  thatch: '#c9a85c',
  hillHigh: '#ece9dc',
  zoneTint: '#ffd84a',
  city: ['#cfc7d9', '#c3bbd1', '#d9d1e1', '#bab2c9'],
  house: '#e6d8cb',
  roof: '#a8655a',
  palace: '#f3eee3',
  gold: '#d6b45a',
  hq: '#3b6fb6',
  plant: '#d9b84a',
  metal: '#7d8590',
};

const ROAD_STYLE = {
  ring: { color: '#4b4d55', y: 0.03, dash: '#8094d0' },
  main: { color: '#55575f', y: 0.05, dash: '#e6dfb0' },
  street: { color: '#5d5f66', y: 0.06 },
  ramp: { color: '#d8d2c4', y: 0.07 },
  mountain: { color: '#64605a', y: 0.05 },
  path: { color: '#cdc7b4', y: 0.02 },
};
const HILL_ROAD_LIFT = 0.25;

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

function shapeFrom(points) {
  return new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.z)));
}

function flatPolygon(points, color, y) {
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shapeFrom(points)).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  );
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function label(text, className) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

function roadMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
}

// Pita jalan sepanjang polyline; tepi kiri/kanan mengikuti tinggi medan.
function ribbonGeometry(points, closed, width, lift, heightAt) {
  const pts = resample(points, 1.5, closed);
  const n = pts.length;
  const positions = [];
  const indices = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const px = -tz * (width / 2);
    const pz = tx * (width / 2);
    const p = pts[i];
    for (const s of [1, -1]) {
      const x = p.x + px * s;
      const z = p.z + pz * s;
      positions.push(x, Math.max(heightAt(x, z), heightAt(p.x, p.z)) + lift, z);
    }
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class WorldView {
  constructor(scene, world) {
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.occluders = [];
    this.nightMaterials = [];

    this.addGround();
    this.addTerrain();
    this.addRoads();
    this.addBuildings();
    this.addLabels();
  }

  addGround() {
    const { bounds: b, regions, palace } = this.world;
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    const wild = new THREE.Mesh(new THREE.PlaneGeometry(w + 600, d + 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: COLORS.wild }));
    wild.position.y = -0.05;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }));
    ground.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    ground.receiveShadow = true;
    // Laut sampai cakrawala di utara.
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(w + 600, 300).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: COLORS.sea, roughness: 0.4 }));
    ocean.position.set((b.minX + b.maxX) / 2, -0.02, b.minZ - 150);
    this.group.add(wild, ground, ocean);
    this.group.add(flatPolygon(regions.sea, COLORS.sea, 0.01));
    this.group.add(flatPolygon(regions.meadow, COLORS.grass, 0.01));
    this.group.add(flatPolygon(regions.grassSouth, COLORS.grass, 0.01));
    // Alas gunung (menutupi tepi grid medan yang bergerigi).
    this.group.add(flatPolygon(regions.hill, COLORS.hillLow, 0.005));

    // Lot parkir HQ.
    const z = this.world.hq.zone;
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(z.maxX - z.minX, z.maxZ - z.minZ).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8fb3e0' }));
    lot.position.set((z.minX + z.maxX) / 2, 0.025, (z.minZ + z.maxZ) / 2);
    lot.receiveShadow = true;
    this.group.add(lot);

    // Plaza istana yang luas + halaman dalam dari marmer.
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(palace.ringRadius + 8, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: COLORS.plaza }));
    plaza.position.set(palace.center.x, 0.015, palace.center.z);
    plaza.receiveShadow = true;
    const court = new THREE.Mesh(new THREE.CircleGeometry(palace.courtRadius - 3, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: COLORS.court }));
    court.position.set(palace.center.x, 0.02, palace.center.z);
    court.receiveShadow = true;
    this.group.add(plaza, court);
  }

  // Gunung: grid bertinggi dipotong sesuai polygon gunung, warna makin terang ke puncak,
  // dan sedikit kekuningan di zona petir.
  addTerrain() {
    const { regions, heightAt, slopeAt, inZeusZone } = this.world;
    const bb = polygonBounds(regions.hill);
    const cell = 1;
    const nx = Math.ceil((bb.maxX - bb.minX) / cell) + 1;
    const nz = Math.ceil((bb.maxZ - bb.minZ) / cell) + 1;
    const positions = [];
    const colors = [];
    const low = new THREE.Color(COLORS.hillLow);
    const high = new THREE.Color(COLORS.hillHigh);
    const tint = new THREE.Color(COLORS.zoneTint);
    const rock = new THREE.Color(COLORS.rock);
    const c = new THREE.Color();
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = bb.minX + i * cell;
        const z = bb.minZ + j * cell;
        const h = heightAt(x, z);
        positions.push(x, h + 0.01, z);
        c.copy(low).lerp(high, Math.min(1, (h / 16) ** 1.5));
        // Sisi undakan yang curam berwarna batu.
        const s = h > 0 ? slopeAt(x, z) : { x: 0, z: 0 };
        c.lerp(rock, Math.min(1, Math.max(0, Math.hypot(s.x, s.z) - 0.3) * 1.5));
        if (inZeusZone(x, z)) c.lerp(tint, 0.12);
        colors.push(c.r, c.g, c.b);
      }
    }
    const indices = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const cx = bb.minX + (i + 0.5) * cell;
        const cz = bb.minZ + (j + 0.5) * cell;
        if (!pointInPolygon(regions.hill, cx, cz)) continue;
        indices.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    this.group.add(terrain);
  }

  addRoads() {
    const { roads, heightAt } = this.world;
    const materials = {};
    const dashes = {};
    for (const road of roads) {
      const style = ROAD_STYLE[road.kind];
      materials[road.kind] ??= roadMaterial(style.color);
      const lift = style.y + (road.hill ? HILL_ROAD_LIFT : 0);
      const mesh = new THREE.Mesh(ribbonGeometry(road.points, road.closed, road.width, lift, heightAt), materials[road.kind]);
      mesh.receiveShadow = true;
      this.group.add(mesh);

      if (!road.dashed || !style.dash) continue;
      dashes[style.dash] ??= [];
      const pts = resample(road.points, 5, road.closed);
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i];
        const b = pts[i + 1];
        dashes[style.dash].push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, rot: Math.atan2(b.x - a.x, b.z - a.z), y: lift + 0.02 });
      }
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (const [color, list] of Object.entries(dashes)) {
      const mesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.35, 2.2).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }),
        list.length,
      );
      list.forEach((dsh, i) => {
        q.setFromAxisAngle(up, dsh.rot);
        m.compose(new THREE.Vector3(dsh.x, heightAt(dsh.x, dsh.z) + dsh.y, dsh.z), q, one);
        mesh.setMatrixAt(i, m);
      });
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  addBuildings() {
    const { heightAt } = this.world;
    const cityMats = COLORS.city.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: '#ffcf73', emissiveIntensity: 0 }));
    const houseMat = new THREE.MeshStandardMaterial({ color: COLORS.house, roughness: 0.9, emissive: '#ffcf73', emissiveIntensity: 0 });
    this.nightMaterials.push(...cityMats, houseMat);
    const mats = {
      roof: new THREE.MeshStandardMaterial({ color: COLORS.roof }),
      palace: new THREE.MeshStandardMaterial({ color: COLORS.palace, roughness: 0.6 }),
      gold: new THREE.MeshStandardMaterial({ color: COLORS.gold, metalness: 0.3, roughness: 0.5 }),
      hq: new THREE.MeshStandardMaterial({ color: COLORS.hq }),
      plant: new THREE.MeshStandardMaterial({ color: COLORS.plant }),
      metal: new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.3, roughness: 0.6 }),
      cityTop: new THREE.MeshStandardMaterial({ color: '#efeaf3' }),
    };

    for (const b of this.world.buildings) {
      const group = new THREE.Group();
      group.position.set(b.cx, heightAt(b.cx, b.cz), b.cz);
      group.rotation.y = -b.rot;
      const parts = [];
      const add = (mesh, x, y, z) => {
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        parts.push(mesh);
        return mesh;
      };
      const w = b.hw * 2;
      const d = b.hd * 2;

      if (b.kind === 'city') {
        const mat = cityMats[Math.floor(hash2(b.cx, b.cz) * cityMats.length)];
        add(new THREE.Mesh(new THREE.BoxGeometry(w, b.height, d), mat), 0, b.height / 2, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), mats.cityTop), 0, b.height + 0.25, 0);
      } else if (b.kind === 'house') {
        add(new THREE.Mesh(new THREE.BoxGeometry(w, b.height, d), houseMat), 0, b.height / 2, 0);
        const roof = add(new THREE.Mesh(new THREE.ConeGeometry(b.hw * 1.5, 1.6, 4), mats.roof), 0, b.height + 0.8, 0);
        roof.rotation.y = Math.PI / 4;
      } else if (b.kind === 'palace') {
        add(new THREE.Mesh(new THREE.BoxGeometry(w, b.height, d), mats.palace), 0, b.height / 2, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.8, d + 1), mats.gold), 0, b.height + 0.4, 0);
        // Barisan kolom di kedua sisi panjang.
        const colGeo = new THREE.CylinderGeometry(0.45, 0.5, b.height, 10);
        for (let x = -b.hw + 1.5; x <= b.hw - 1.5; x += 3) {
          for (const s of [1, -1]) add(new THREE.Mesh(colGeo, mats.palace), x, b.height / 2, s * (b.hd + 0.9));
        }
      } else if (b.kind === 'hq') {
        add(new THREE.Mesh(new THREE.BoxGeometry(w, b.height, d), mats.hq), 0, b.height / 2, 0);
        const sign = label('HERMES EXPRESS · BASE', 'world-label hq');
        sign.position.set(0, b.height + 3, 0);
        group.add(sign);
      } else if (b.kind === 'plant') {
        add(new THREE.Mesh(new THREE.BoxGeometry(w, b.height, d), mats.plant), 0, b.height / 2, 0);
        for (const [dx, dz] of [
          [-4.5, 2.5],
          [-0.5, 2.5],
        ]) {
          add(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.7, 9, 12), mats.metal), dx, b.height + 4.5, dz);
        }
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 14, 8), mats.metal), 4.5, b.height + 7, -2.5);
        this.orb = add(
          new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 12), new THREE.MeshStandardMaterial({ color: '#fff3a0', emissive: '#ffd84a', emissiveIntensity: 1.5 })),
          4.5,
          b.height + 15,
          -2.5,
        );
        const sign = label('⚡ ELECTRICAL PLANT', 'world-label plant');
        sign.position.set(0, b.height + 20, 0);
        group.add(sign);
      } else if (b.kind === 'hut') {
        const wood = new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 1 });
        add(new THREE.Mesh(new THREE.BoxGeometry(w, b.height, d), wood), 0, b.height / 2, 0);
        const roof = add(new THREE.Mesh(new THREE.ConeGeometry(Math.max(b.hw, b.hd) * 1.6, 1.8, 4), new THREE.MeshStandardMaterial({ color: COLORS.thatch })), 0, b.height + 0.9, 0);
        roof.rotation.y = Math.PI / 4;
        add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.1), new THREE.MeshStandardMaterial({ color: '#3d2b1c' })), 0, 0.8, b.hd + 0.05);
      } else if (b.kind === 'shrine') {
        add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), mats.palace), 0, 0.3, 0);
        const colGeo = new THREE.CylinderGeometry(0.3, 0.35, b.height, 8);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.Mesh(colGeo, mats.palace), sx * (b.hw - 0.6), b.height / 2 + 0.6, sz * (b.hd - 0.6));
        const roof = add(new THREE.Mesh(new THREE.ConeGeometry(b.hw * 1.6, 2, 4), mats.gold), 0, b.height + 1.6, 0);
        roof.rotation.y = Math.PI / 4;
      }
      this.group.add(group);
      for (const p of parts) p.userData.baseMaterial = p.material;
      this.occluders.push({ x: b.cx, z: b.cz, parts, opacity: 1 });
    }
  }

  addLabels() {
    for (const l of this.world.labels) {
      const obj = label(l.text, 'world-label district');
      obj.position.set(l.x, this.world.heightAt(l.x, l.z) + 2, l.z);
      this.group.add(obj);
    }
  }

  // Gedung yang menutupi van dari sudut kamera dibuat transparan.
  updateOcclusion(dt, car, cameraOffset) {
    const carY = (car.y ?? this.world.heightAt(car.x, car.z)) + 1.2;
    rayDir.copy(cameraOffset).normalize();
    const near = this.occluders.filter((o) => Math.abs(o.x - car.x) < 45 && Math.abs(o.z - car.z) < 45);
    const meshes = near.flatMap((o) => o.parts);
    const hit = new Set();
    for (const [ox, oz] of RAY_OFFSETS) {
      raycaster.set(rayOrigin.set(car.x + ox, carY, car.z + oz), rayDir);
      for (const h of raycaster.intersectObjects(meshes, false)) hit.add(h.object);
    }
    for (const o of this.occluders) {
      const target = o.parts.some((p) => hit.has(p)) ? 0.22 : 1;
      if (target === 1 && o.opacity === 1) continue;
      o.opacity += (target - o.opacity) * (1 - Math.exp(-10 * dt));
      if (target === 1 && o.opacity > 0.99) o.opacity = 1;
      for (const part of o.parts) {
        if (o.opacity === 1) {
          // Kembali ke material bersama yang opaque.
          part.material.dispose();
          part.material = part.userData.baseMaterial;
          part.castShadow = true;
          continue;
        }
        if (part.material === part.userData.baseMaterial) {
          part.material = part.userData.baseMaterial.clone();
          part.material.transparent = true;
          part.material.depthWrite = false;
        }
        part.material.opacity = o.opacity;
        part.castShadow = o.opacity > 0.5;
      }
    }
  }

  update(dt, night, car, cameraOffset) {
    this.updateOcclusion(dt, car, cameraOffset);
    // Jendela gedung menyala saat malam.
    for (const mat of this.nightMaterials) mat.emissiveIntensity = night * 0.08;
    if (this.orb) this.orb.material.emissiveIntensity = 1.2 + Math.sin(performance.now() / 180) * 0.6;
  }
}
