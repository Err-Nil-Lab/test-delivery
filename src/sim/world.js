// Map Olympus berdasarkan sketsa kasar (utara = atas):
// - kiri atas: Istana Zeus (ring road + plaza luas + halaman dalam + ramp "steep"), laut di utaranya
// - kanan atas: gunung; jalan berkelok naik ke Electrical Plant di puncak (zona petir)
// - tengah kiri: padang terbuka tempat Minotaur
// - bawah: Base (HQ) di kiri, perumahan di tengah, kota padat di kanan
// Koordinat ditulis dalam piksel sketsa lalu dikonversi ke unit dunia (x = timur, z = selatan).
import { boxCollider, segCollider, ColliderGrid, contact } from './collision.js';
import { chaikin, ellipsePoints, pointInPolygon, nearestOnPolyline, smoothstep, hash2, distance } from './geometry.js';

export { distance, inRect } from './geometry.js';

const SCALE = 0.25; // unit dunia per piksel sketsa
const ORIGIN = { px: 460, py: 1040 };
const P = (px, py) => ({ x: (px - ORIGIN.px) * SCALE, z: (py - ORIGIN.py) * SCALE });
const PP = (list) => list.map(([px, py]) => P(px, py));
const U = (px) => px * SCALE;

export const MAP_BOUNDS = { minX: P(5, 0).x, maxX: P(915, 0).x, minZ: P(0, 385).z, maxZ: P(0, 1690).z };

const ROAD_WIDTH = { ring: 12, main: 10, ramp: 10, mountain: 9, street: 7, path: 6 };

// ---------- Wilayah ----------
const SEA = PP([[5, 385], [690, 385], [640, 410], [560, 432], [430, 455], [330, 470], [220, 472], [120, 482], [60, 512], [5, 570]]);
const COAST = SEA.slice(1); // garis pantai (sisi laut yang bukan batas map)

const HILL = PP([
  [430, 470], [560, 445], [650, 415], [700, 388], [915, 388], [915, 1130], [800, 1118], [712, 1108], [620, 1140],
  [520, 1165], [430, 1162], [385, 1120], [300, 1075], [285, 900], [330, 875], [420, 830], [462, 760], [468, 680], [452, 560],
]);
// Kaki gunung yang melandai ke daratan (bukan batas map dan bukan tebing laut di utara).
const HILL_FOOT = [...HILL.slice(5), HILL[0]];

const MEADOW = PP([
  [10, 770], [110, 800], [160, 880], [270, 885], [285, 900], [290, 1070], [390, 1100], [385, 1150], [300, 1180], [190, 1230], [170, 1290], [10, 1300],
]);
const GRASS_SOUTH = PP([[5, 1358], [60, 1358], [65, 1520], [200, 1540], [240, 1565], [470, 1580], [520, 1690], [5, 1690]]);

// Zona petir: lereng gunung sepanjang jalan berkelok sampai plant.
const ZEUS_ZONE = PP([[520, 640], [500, 560], [560, 445], [650, 415], [700, 388], [915, 388], [915, 985], [700, 985], [560, 850]]);

// ---------- Elevasi gunung ----------
const SUMMIT = P(825, 470);
const SUMMIT_RADIUS = U(620);
const SUMMIT_HEIGHT = 16;
// Lereng berundak: teras datar setinggi LEDGE_HEIGHT dengan tebing pendek di antaranya.
// Jalan gunung memotong undakan dengan tanjakan mulus (dicampur sejauh ROAD_BLEND dari tepi jalan).
export const TERRAIN = { ledgeHeight: 2.5, ledgeEdge: 0.1, roadBlend: 8 };

// Kubah mulus: tinggi permukaan jalan gunung.
function smoothHeight(x, z) {
  if (!pointInPolygon(HILL, x, z)) return 0;
  const base = smoothstep(0, 1, 1 - Math.hypot(x - SUMMIT.x, z - SUMMIT.z) / SUMMIT_RADIUS);
  if (base <= 0) return 0;
  const foot = smoothstep(0, 8, nearestOnPolyline(HILL_FOOT, false, x, z).dist);
  return SUMMIT_HEIGHT * base * foot;
}

function terraced(h) {
  const { ledgeHeight: L, ledgeEdge: e } = TERRAIN;
  const k = Math.floor(h / L);
  return L * (k + smoothstep(1 - e, 1, h / L - k));
}

export function heightAt(x, z) {
  const h = smoothHeight(x, z);
  if (h <= 0) return 0;
  // Dekat jalan dan dekat batas map medan dibuat mulus (tidak berundak) supaya van tidak terjebak.
  const b = MAP_BOUNDS;
  let dist = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z) - 4;
  for (const r of HILL_ROADS) dist = Math.min(dist, nearestOnPolyline(r.points, r.closed, x, z).dist - r.width / 2);
  const road = 1 - smoothstep(0, TERRAIN.roadBlend, dist);
  return terraced(h) + (h - terraced(h)) * road;
}

// Kemiringan permukaan (gradien) di (x, z).
export function slopeAt(x, z, e = 0.5) {
  return {
    x: (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e),
    z: (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e),
  };
}

// ---------- Jalan ----------
function road(id, kind, points, opts = {}) {
  return { id, kind, points, closed: false, width: ROAD_WIDTH[kind], hill: false, dashed: false, ...opts };
}

const PALACE = P(255, 680);
const PALACE_RING_R = U(175);
const PALACE_COURT_R = U(100);
const CITY = P(705, 1370);
const HOUSING = P(330, 1370);

function buildRoads() {
  const serpentine = chaikin(
    PP([
      [600, 960], [650, 945], [740, 920], [820, 895], [858, 872], [872, 840], [858, 810], [820, 795], [720, 788], [620, 770],
      [575, 745], [562, 710], [580, 680], [640, 662], [740, 640], [800, 615], [812, 580], [808, 545], [805, 525],
    ]),
    2,
  );
  const plantLoop = chaikin(PP([[765, 420], [885, 420], [885, 525], [765, 525]]), 2, true);

  const roads = [
    // Istana Zeus
    road('palace-ring', 'ring', ellipsePoints(PALACE.x, PALACE.z, PALACE_RING_R, PALACE_RING_R, 72), { closed: true, dashed: true }),
    road('palace-court', 'street', ellipsePoints(PALACE.x, PALACE.z, PALACE_COURT_R, PALACE_COURT_R, 48), { closed: true }),
    road('palace-ramp', 'ramp', PP([[205, 630], [255, 680], [330, 752], [380, 790]])),
    // Base ke utara (melewati padang Minotaur) dan jalan utama timur-barat
    road('base-north', 'main', PP([[148, 1338], [148, 1100], [146, 900], [150, 800], [178, 762]])),
    road('main-ew', 'main', PP([[5, 1338], [150, 1335], [293, 1330], [510, 1322], [600, 1315], [712, 1310], [830, 1305], [915, 1300]]), {
      dashed: true,
    }),
    // Istana → kota, menyusuri kaki gunung
    road('diagonal', 'main', PP([[380, 790], [450, 840], [530, 895], [600, 960], [655, 1025], [695, 1085], [712, 1150]]), {
      hill: true,
      dashed: true,
    }),
    // Jalan berkelok naik ke plant
    road('serpentine', 'mountain', serpentine, { hill: true }),
    road('plant-loop', 'mountain', plantLoop, { closed: true, hill: true }),
    // Kota
    road('city-ring', 'ring', ellipsePoints(CITY.x, CITY.z, U(185), U(225), 72), { closed: true, dashed: true }),
    road('city-avenue', 'main', PP([[712, 1145], [712, 1595], [705, 1690]])),
    road('city-inner', 'street', ellipsePoints(CITY.x, CITY.z, U(110), U(150), 56), { closed: true }),
    road('city-diag-w', 'street', PP([[712, 1310], [600, 1185]])),
    road('city-diag-e', 'street', PP([[712, 1310], [820, 1185]])),
    road('city-south', 'street', PP([[539, 1470], [871, 1470]])),
    // Perumahan
    road('housing-ring', 'ring', ellipsePoints(HOUSING.x, HOUSING.z, U(150), U(165), 64), { closed: true, dashed: true }),
    road('housing-ns', 'street', PP([[330, 1205], [330, 1535]])),
    road('housing-n', 'street', PP([[218, 1260], [442, 1260]])),
    road('housing-s', 'street', PP([[187, 1420], [473, 1420]])),
    // Jalan setapak di tepi barat dan selatan
    road('perimeter', 'path', PP([[45, 580], [45, 1300], [45, 1480], [110, 1580], [230, 1640], [480, 1655], [560, 1640]])),
  ];
  return roads;
}

const ROADS = buildRoads();
const HILL_ROADS = ROADS.filter((r) => r.hill);

function nearestRoad(roads, x, z) {
  let best = null;
  for (const r of roads) {
    const n = nearestOnPolyline(r.points, r.closed, x, z);
    if (!best || n.dist < best.dist) best = { ...n, road: r };
  }
  return best;
}

// Titik di tepi jalan terdekat, di sisi yang menghadap (x, z).
function curbPoint(roads, { x, z }) {
  const n = nearestRoad(roads, x, z);
  const off = n.road.width / 2 - 1.8;
  const d = Math.max(n.dist, 1e-6);
  return { x: n.x + ((x - n.x) / d) * off, z: n.z + ((z - n.z) / d) * off };
}

function clearOfRoads(roads, x, z, radius) {
  return roads.every((r) => nearestOnPolyline(r.points, r.closed, x, z).dist > r.width / 2 + radius);
}

// Kavling kotak di dalam elips: diisi rapat (besar dulu, lalu kecil untuk celah) tanpa menyentuh jalan.
function generateLots({ center, rx, rz, sizes, gap, roads, kind, height }) {
  const lots = [];
  for (const half of sizes) {
    for (let x = center.x - rx; x <= center.x + rx; x += 1.5) {
      for (let z = center.z - rz; z <= center.z + rz; z += 1.5) {
        if (((x - center.x) / rx) ** 2 + ((z - center.z) / rz) ** 2 > 1) continue;
        if (lots.some((l) => Math.max(Math.abs(l.cx - x), Math.abs(l.cz - z)) < l.hw + half + gap)) continue;
        if (!clearOfRoads(roads, x, z, half * Math.SQRT2 + 0.6)) continue;
        lots.push({ kind, cx: x, cz: z, hw: half, hd: half, rot: 0, height: height(hash2(x, z)) });
      }
    }
  }
  return lots;
}

function thinPoints(candidates, spacing) {
  const kept = [];
  for (const c of candidates) if (kept.every((k) => distance(k, c) >= spacing)) kept.push(c);
  return kept;
}

function rectPx(x0, y0, x1, y1) {
  const a = P(x0, y0);
  const c = P(x1, y1);
  return { minX: a.x, minZ: a.z, maxX: c.x, maxZ: c.z };
}

const CITY_NAMES = [
  'Kafe Dionysus', 'Gym Ares', 'Butik Aphrodite', 'Apotek Asclepius', 'Bengkel Hephaestus', 'Toko Bunga Demeter',
  'Studio Apollo', 'Perpustakaan Athena', 'Spa Poseidon', 'Laundry Hestia', 'Kantor Pos Iris', 'Arena Nike',
  'Warung Pan', 'Bank Plutus', 'Bioskop Muses', 'Toko Musik Orpheus', 'Salon Narcissus', 'Kedai Kopi Morpheus',
  'Toko Jam Chronos', 'Rental Pegasus',
];

export function createWorld() {
  const roads = ROADS;
  const byId = Object.fromEntries(roads.map((r) => [r.id, r]));
  const cityRoads = ['city-ring', 'city-avenue', 'city-inner', 'city-diag-w', 'city-diag-e', 'city-south', 'main-ew'].map((id) => byId[id]);
  const housingRoads = ['housing-ring', 'housing-ns', 'housing-n', 'housing-s', 'main-ew'].map((id) => byId[id]);
  const hillRoads = HILL_ROADS;

  // ---------- Gedung ----------
  const buildings = [];

  // Istana: dua sayap di kiri-kanan ramp, aula panjang di plaza barat laut.
  const gate = P(205, 630);
  const rampEnd = P(380, 790);
  const rampLen = distance(gate, rampEnd);
  const dir = { x: (rampEnd.x - gate.x) / rampLen, z: (rampEnd.z - gate.z) / rampLen };
  const rampRot = Math.atan2(dir.z, dir.x);
  for (const side of [1, -1]) {
    buildings.push({ kind: 'palace', cx: PALACE.x + dir.z * 12 * side, cz: PALACE.z - dir.x * 12 * side, hw: 12, hd: 5, rot: rampRot, height: 9 });
  }
  const hallAngle = (-130 * Math.PI) / 180;
  const hallR = U(133);
  buildings.push({
    kind: 'palace',
    cx: PALACE.x + Math.cos(hallAngle) * hallR,
    cz: PALACE.z + Math.sin(hallAngle) * hallR,
    hw: 17,
    hd: 3.5,
    rot: hallAngle + Math.PI / 2,
    height: 7,
  });

  const hqCenter = P(130, 1485);
  buildings.push({ kind: 'hq', cx: hqCenter.x, cz: hqCenter.z, hw: U(110) / 2, hd: U(50) / 2, rot: 0, height: 6 });

  const plantCenter = P(825, 472);
  buildings.push({ kind: 'plant', cx: plantCenter.x, cz: plantCenter.z, hw: 8, hd: 6.5, rot: 0, height: 8 });

  const shrineCenter = P(512, 700);
  buildings.push({ kind: 'shrine', cx: shrineCenter.x, cz: shrineCenter.z, hw: 3.5, hd: 3.5, rot: 0, height: 4 });

  // Gubuk di lereng (open field), di luar jalan:
  // - Gembala: teras di zona petir, dicapai dengan turun dari baris jalan berkelok di atasnya.
  // - Penebang: dataran rendah yang dijaga Minotaur ketiga.
  const shepherdHut = P(800, 697);
  const woodcutterHut = P(440, 1010);
  buildings.push(
    { kind: 'hut', cx: shepherdHut.x, cz: shepherdHut.z, hw: 2.2, hd: 2.2, rot: 0, height: 2.6 },
    { kind: 'hut', cx: woodcutterHut.x, cz: woodcutterHut.z, hw: 2.6, hd: 2.2, rot: 0, height: 2.8 },
  );

  const cityLots = generateLots({
    center: CITY,
    rx: U(185),
    rz: U(225),
    sizes: [3.4, 2.2],
    gap: 1.2,
    roads: cityRoads,
    kind: 'city',
    height: (h) => 4 + h * 7,
  });
  const houseLots = generateLots({
    center: HOUSING,
    rx: U(150),
    rz: U(165),
    sizes: [2.2],
    gap: 1.4,
    roads: housingRoads,
    kind: 'house',
    height: (h) => 2.4 + h * 0.8,
  });
  buildings.push(...cityLots, ...houseLots);

  // ---------- Titik pickup / drop-off ----------
  const points = [];
  thinPoints(
    cityLots.map((l) => curbPoint(cityRoads, { x: l.cx, z: l.cz })),
    14,
  )
    .slice(0, CITY_NAMES.length)
    .forEach((p, i) => points.push({ id: `city-${i}`, name: CITY_NAMES[i], district: 'city', ...p }));
  thinPoints(
    houseLots.map((l) => curbPoint(housingRoads, { x: l.cx, z: l.cz })),
    16,
  ).forEach((p, i) => points.push({ id: `house-${i}`, name: `Perumahan Arcadia No. ${i + 1}`, district: 'housing', ...p }));

  const hallFront = { x: PALACE.x + Math.cos(hallAngle) * U(160), z: PALACE.z + Math.sin(hallAngle) * U(160) };
  points.push(
    { id: 'lm-hall', name: 'Aula Istana Zeus', district: 'palace', ...hallFront },
    { id: 'lm-harbor', name: 'Dermaga Poseidon', district: 'palace', ...P(110, 520) },
    { id: 'lm-meadow', name: 'Ladang Minotaur', district: 'meadow', ...P(205, 930) },
    { id: 'lm-housing', name: 'Pos Perumahan', district: 'housing', ...curbPoint([byId['main-ew']], P(300, 1350)) },
    { id: 'lm-square', name: 'Alun-alun Kota', district: 'city', ...curbPoint([byId['main-ew']], P(760, 1330)) },
    { id: 'lm-shrine', name: 'Kuil Gunung', district: 'mountain', ...curbPoint([byId.serpentine], shrineCenter) },
    { id: 'hut-shepherd', name: 'Gubuk Gembala', district: 'field', ...P(770, 697) },
    { id: 'hut-woodcutter', name: 'Gubuk Penebang', district: 'field', ...P(440, 1040) },
  );

  const zeusPickup = { id: 'palace-gate', name: 'Gerbang Istana Zeus', district: 'palace', ...P(212, 636) };
  const plant = { dropoff: { id: 'plant', name: 'Electrical Plant', district: 'mountain', ...P(825, 525) } };

  // ---------- HQ ----------
  const hq = {
    zone: { minX: P(70, 0).x, maxX: P(190, 0).x, minZ: P(0, 1360).z, maxZ: P(0, 1452).z },
    spawn: { ...P(130, 1410), heading: Math.PI }, // menghadap utara ke jalan utama
  };

  // ---------- Collider ----------
  const colliders = buildings.map((bd) => boxCollider(bd.cx, bd.cz, bd.hw, bd.hd, bd.rot, { building: bd }));
  const b = MAP_BOUNDS;
  colliders.push(
    segCollider(b.minX, b.minZ, b.maxX, b.minZ, 1),
    segCollider(b.minX, b.maxZ, b.maxX, b.maxZ, 1),
    segCollider(b.minX, b.minZ, b.minX, b.maxZ, 1),
    segCollider(b.maxX, b.minZ, b.maxX, b.maxZ, 1),
  );
  for (let i = 0; i < COAST.length - 1; i++) colliders.push(segCollider(COAST[i].x, COAST[i].z, COAST[i + 1].x, COAST[i + 1].z, 0.5));
  // Tebing laut: sisi utara gunung langsung jatuh ke laut.
  for (let i = 0; i < 3; i++) colliders.push(segCollider(HILL[i].x, HILL[i].z, HILL[i + 1].x, HILL[i + 1].z, 0.5, { seaCliff: true }));

  const grid = new ColliderGrid(colliders);

  const minotaurSpawns = [
    { id: 'west', ...P(80, 1010), territory: rectPx(15, 820, 170, 1250) },
    { id: 'east', ...P(215, 1000), territory: rectPx(128, 880, 280, 1170) },
    { id: 'woodcutter', ...P(480, 990), territory: rectPx(360, 950, 520, 1095) },
  ];

  return {
    bounds: MAP_BOUNDS,
    roads,
    buildings,
    points,
    zeusPickup,
    plant,
    hq,
    colliders,
    grid,
    hillRoads,
    minotaurSpawns,
    regions: { sea: SEA, hill: HILL, meadow: MEADOW, grassSouth: GRASS_SOUTH, zeusZone: ZEUS_ZONE },
    palace: { center: PALACE, ringRadius: PALACE_RING_R, courtRadius: PALACE_COURT_R },
    labels: [
      { text: 'ISTANA ZEUS', ...P(255, 555) },
      { text: 'GUNUNG OLYMPUS', ...P(700, 860) },
      { text: 'PADANG MINOTAUR', ...P(215, 1080) },
      { text: 'PERUMAHAN ARCADIA', ...P(330, 1188) },
      { text: 'KOTA', ...P(705, 1128) },
      { text: 'LAUT AEGEA', ...P(300, 425) },
    ],
    // Posisi acuan untuk debug dan tes.
    ref: {
      outsideHQ: P(130, 1338),
      serpentineFoot: P(650, 945),
      serpentineTop: P(740, 640),
      cityRoad: P(600, 1315),
      meadow: P(215, 1000),
      shepherdHut: P(770, 697),
      woodcutterHut: P(440, 1040),
    },
    heightAt,
    slopeAt,
    inZeusZone: (x, z) => pointInPolygon(ZEUS_ZONE, x, z),
    inHill: (x, z) => pointInPolygon(HILL, x, z),
    nearbyColliders: (x, z, r) => grid.query(x, z, r),
    // Tertutup gedung / pantai / batas map (tinggi medan ditangani terpisah oleh fisika van).
    isBlocked: (x, z, radius) => grid.query(x, z, radius + 1).some((c) => contact(x, z, radius, c)),
  };
}
