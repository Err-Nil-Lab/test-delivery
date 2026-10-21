// Mesh graybox dari data world: wilayah (laut, padang, gunung), jalan melengkung yang mengikuti
// medan, gedung kota/perumahan/istana/plant, dan label distrik.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { resample, polygonBounds, pointInPolygon, nearestOnPolyline, hash2 } from '../sim/geometry.js';

const COLORS = {
  wild: '#8d9877',
  ground: '#bdb8ac',
  grass: '#9fb784',
  meadow: '#b3c98e',
  paved: '#c2bdb2',
  sand: '#e8d9a8',
  soil: '#9b7a52',
  crop: '#93b05a',
  curb: '#d4d0c6',
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

// Hierarki jalan: jalan utama/ring = aspal gelap, trotoar, garis tepi putih, marka tengah kuning ganda
// (ring: putus-putus putih), lampu jalan. Jalan kecil = abu terang tanpa marka. Setapak = tanah.
const ROAD_STYLE = {
  ring: { color: '#3d3f46', y: 0.03, curb: true, edge: true, center: 'dashedWhite', lamps: true },
  main: { color: '#3f4148', y: 0.05, curb: true, edge: true, center: 'doubleYellow', lamps: true },
  mountain: { color: '#4a4844', y: 0.05, edge: true, center: 'dashedYellow' },
  street: { color: '#7a7c81', y: 0.06 },
  ramp: { color: '#e2dccd', y: 0.07 },
  path: { color: '#b49a72', y: 0.02 },
};
const MARK_COLORS = { white: '#efede6', yellow: '#e9c46a' };
const VEGETATION = {
  cypress: [
    { geo: () => new THREE.CylinderGeometry(0.15, 0.2, 1, 6), color: '#6b4f35', y: 0.5 },
    { geo: () => new THREE.ConeGeometry(0.9, 5.5, 7), color: '#3f6b3a', y: 3.6 },
  ],
  olive: [
    { geo: () => new THREE.CylinderGeometry(0.2, 0.28, 1.6, 6), color: '#6b4f35', y: 0.8 },
    { geo: () => new THREE.IcosahedronGeometry(1.6, 0).scale(1, 0.75, 1), color: '#8aa36b', y: 2.3 },
  ],
  pine: [
    { geo: () => new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6), color: '#5e4430', y: 0.7 },
    { geo: () => new THREE.ConeGeometry(1.5, 3, 7), color: '#3c5e3f', y: 2.6 },
    { geo: () => new THREE.ConeGeometry(1.1, 2.4, 7), color: '#456b47', y: 4.1 },
  ],
  palm: [
    { geo: () => new THREE.CylinderGeometry(0.16, 0.24, 4.5, 6), color: '#8a6e4b', y: 2.25 },
    { geo: () => new THREE.ConeGeometry(2.3, 0.9, 7), color: '#5f8f3a', y: 4.6 },
  ],
  bush: [{ geo: () => new THREE.IcosahedronGeometry(0.8, 0).scale(1, 0.7, 1), color: '#6f9a55', y: 0.4 }],
  rock: [{ geo: () => new THREE.DodecahedronGeometry(0.8, 0).scale(1, 0.65, 1), color: '#9a948a', y: 0.3 }],
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
function ribbonGeometry(points, closed, width, lift, heightAt, offset = 0) {
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
    const p = { x: pts[i].x - tz * offset, z: pts[i].z + tx * offset };
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
    this.addVegetation();
    this.addBuildings();
    this.addLabels();
  }

  addGround() {
    const { bounds: b, regions, palace } = this.world;
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    const wild = new THREE.Mesh(new THREE.PlaneGeometry(w + 800, d + 800).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: COLORS.wild }));
    wild.position.y = -0.05;
    // Daratan = rumput; distrik kota/perumahan/istana diberi aspal sendiri.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: COLORS.grass, roughness: 1 }));
    ground.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    ground.receiveShadow = true;
    // Laut sampai cakrawala di utara.
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(w + 800, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: COLORS.sea, roughness: 0.4 }));
    ocean.position.set((b.minX + b.maxX) / 2, -0.02, b.minZ - 200);
    this.group.add(wild, ground, ocean);
    this.group.add(flatPolygon(regions.beach, COLORS.sand, 0.008));
    this.group.add(flatPolygon(regions.sea, COLORS.sea, 0.012));
    this.group.add(flatPolygon(regions.meadow, COLORS.meadow, 0.01));
    // Alas gunung (menutupi tepi grid medan yang bergerigi).
    this.group.add(flatPolygon(regions.hill, COLORS.hillLow, 0.005));

    for (const e of this.world.paved) {
      const pave = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: COLORS.paved, roughness: 1 }));
      pave.scale.set(e.rx, 1, e.rz);
      pave.position.set(e.cx, 0.012, e.cz);
      pave.receiveShadow = true;
      this.group.add(pave);
    }
    this.addFields();

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

  // Ladang: tanah dengan barisan tanaman.
  addFields() {
    const rows = [];
    for (const poly of this.world.fields) {
      this.group.add(flatPolygon(poly, COLORS.soil, 0.014));
      const bb = polygonBounds(poly);
      for (let x = bb.minX + 1.5; x < bb.maxX - 1; x += 2.2) rows.push({ x, z: (bb.minZ + bb.maxZ) / 2, len: bb.maxZ - bb.minZ - 2 });
    }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.5, 1), new THREE.MeshStandardMaterial({ color: COLORS.crop }), rows.length);
    const m = new THREE.Matrix4();
    rows.forEach((r, i) => mesh.setMatrixAt(i, m.makeScale(1, 1, r.len).setPosition(r.x, 0.25, r.z)));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
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
    const curbMat = roadMaterial(COLORS.curb);
    const marks = { white: [], yellow: [] };
    const lamps = [];
    // Apakah titik berada di jalan lain (marka & lampu tidak digambar di persimpangan).
    const onOtherRoad = (road, x, z, margin) =>
      roads.some((r) => r !== road && r.kind !== 'path' && nearestOnPolyline(r.points, r.closed, x, z).dist < r.width / 2 + margin);

    for (const road of roads) {
      const style = ROAD_STYLE[road.kind];
      materials[road.kind] ??= roadMaterial(style.color);
      const lift = style.y + (road.hill ? HILL_ROAD_LIFT : 0);
      const mesh = new THREE.Mesh(ribbonGeometry(road.points, road.closed, road.width, lift, heightAt), materials[road.kind]);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      if (style.curb) {
        for (const side of [1, -1]) {
          const curb = new THREE.Mesh(ribbonGeometry(road.points, road.closed, 1.4, 0.02, heightAt, side * (road.width / 2 + 0.7)), curbMat);
          curb.receiveShadow = true;
          this.group.add(curb);
        }
      }

      // Marka: potongan pendek sepanjang jalan; dilewati di persimpangan.
      const pts = resample(road.points, 1.6, road.closed);
      const segs = road.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segs; i++) {
        const a = pts[i];
        const c = pts[(i + 1) % pts.length];
        const mx = (a.x + c.x) / 2;
        const mz = (a.z + c.z) / 2;
        const len = Math.hypot(c.x - a.x, c.z - a.z);
        const rot = Math.atan2(c.x - a.x, c.z - a.z);
        const nx = Math.cos(rot);
        const nz = -Math.sin(rot);
        const y = lift + 0.02;
        const add = (color, off, l) => marks[color].push({ x: mx + nx * off, z: mz + nz * off, rot, len: l, y });
        if ((style.edge || style.center) && onOtherRoad(road, mx, mz, 0.5)) continue;
        if (style.edge) for (const side of [1, -1]) add('white', side * (road.width / 2 - 0.6), len);
        if (style.center === 'doubleYellow') for (const side of [1, -1]) add('yellow', side * 0.22, len);
        if (style.center === 'dashedWhite' && i % 3 === 0) add('white', 0, len * 1.2);
        if (style.center === 'dashedYellow' && i % 3 === 0) add('yellow', 0, len * 1.2);
        if (style.lamps && i % 16 === 0) {
          const side = (i / 16) % 2 ? 1 : -1;
          const off = side * (road.width / 2 + 1.5);
          const lx = mx + nx * off;
          const lz = mz + nz * off;
          if (!onOtherRoad(road, lx, lz, 1.5) && !this.world.isBlocked(lx, lz, 0.6)) lamps.push({ x: lx, z: lz });
        }
      }
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    for (const [color, list] of Object.entries(marks)) {
      const mesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.2, 1).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: MARK_COLORS[color], polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }),
        list.length,
      );
      list.forEach((mk, i) => {
        q.setFromAxisAngle(up, mk.rot);
        m.compose(pos.set(mk.x, heightAt(mk.x, mk.z) + mk.y, mk.z), q, scale.set(1, 1, mk.len));
        mesh.setMatrixAt(i, m);
      });
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // Lampu jalan: tiang + kepala yang menyala saat malam.
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 4.6, 6), new THREE.MeshStandardMaterial({ color: '#4b5058' }), lamps.length);
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0 });
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), this.lampMat, lamps.length);
    lamps.forEach((l, i) => {
      const y = heightAt(l.x, l.z);
      pole.setMatrixAt(i, m.makeTranslation(l.x, y + 2.3, l.z));
      head.setMatrixAt(i, m.makeTranslation(l.x, y + 4.7, l.z));
    });
    pole.castShadow = true;
    this.group.add(pole, head);
  }

  // Pohon, semak, batu: satu InstancedMesh per bagian per jenis.
  addVegetation() {
    const { vegetation, heightAt } = this.world;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    for (const [kind, parts] of Object.entries(VEGETATION)) {
      const items = vegetation.filter((v) => v.kind === kind);
      if (!items.length) continue;
      for (const part of parts) {
        const mesh = new THREE.InstancedMesh(part.geo(), new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.9, flatShading: true }), items.length);
        items.forEach((v, i) => {
          const y = heightAt(v.x, v.z);
          q.setFromAxisAngle(up, v.rot);
          m.compose(pos.set(v.x, y + part.y * v.s, v.z), q, scale.setScalar(v.s));
          mesh.setMatrixAt(i, m);
        });
        mesh.castShadow = kind !== 'bush' && kind !== 'rock';
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
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
    if (this.lampMat) this.lampMat.emissiveIntensity = night * 2.5;
    if (this.orb) this.orb.material.emissiveIntensity = 1.2 + Math.sin(performance.now() / 180) * 0.6;
  }
}
