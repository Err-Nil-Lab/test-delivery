// Layout map Olympus versi graybox: grid jalan 5×5, 16 blok gedung,
// HQ di pojok barat daya, Electrical Plant di pojok timur laut di dalam zona Zeus.
// Koordinat: x = timur, z = selatan, y = atas.

export const ROAD_LINES = [-80, -40, 0, 40, 80];
export const ROAD_HALF_WIDTH = 6;
export const BOUNDS = 92;
export const BLOCK_CENTERS = [-60, -20, 20, 60];
export const BLOCK_HALF = 14; // blok mengisi ruang di antara tepi jalan
const BUILDING_INSET = 2; // trotoar di sekeliling gedung
const CURB_OFFSET = BLOCK_HALF + 2.5; // titik pickup/drop-off di lajur terdekat

const HQ_BLOCK = { cx: -60, cz: 60 };
const PLANT_BLOCK = { cx: 60, cz: -60 };

// Nama tujuan per blok, baris z = -60 → 60, kolom x = -60 → 60.
const BLOCK_NAMES = [
  ['Perpustakaan Athena', 'Gym Ares', 'Arena Nike', null],
  ['Kafe Dionysus', 'Butik Aphrodite', 'Bengkel Hephaestus', 'Studio Apollo'],
  ['Apotek Asclepius', 'Toko Bunga Demeter', 'Spa Poseidon', 'Laundry Hestia'],
  [null, 'Kantor Pos Iris', 'Warung Pan', 'Kebun Persephone'],
];

const SIDES = [
  { name: 'north', dx: 0, dz: -1 },
  { name: 'south', dx: 0, dz: 1 },
  { name: 'west', dx: -1, dz: 0 },
  { name: 'east', dx: 1, dz: 0 },
];

export function inRect(rect, x, z) {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function rectAround(cx, cz, half) {
  return { minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half };
}

export function createWorld() {
  const blocks = [];
  const colliders = [];
  const points = [];

  BLOCK_CENTERS.forEach((cz, row) => {
    BLOCK_CENTERS.forEach((cx, col) => {
      const index = row * 4 + col;
      // Tinggi gedung deterministik supaya map selalu sama.
      const height = 5 + ((index * 37) % 7);
      if (cx === HQ_BLOCK.cx && cz === HQ_BLOCK.cz) {
        blocks.push({ kind: 'hq', name: 'Hermes Express HQ', cx, cz, height: 6 });
        return;
      }
      if (cx === PLANT_BLOCK.cx && cz === PLANT_BLOCK.cz) {
        const footprint = rectAround(cx, cz, BLOCK_HALF - BUILDING_INSET);
        blocks.push({ kind: 'plant', name: 'Electrical Plant', cx, cz, height: 8, footprint });
        colliders.push(footprint);
        return;
      }
      const name = BLOCK_NAMES[row][col];
      const footprint = rectAround(cx, cz, BLOCK_HALF - BUILDING_INSET);
      blocks.push({ kind: 'normal', name, cx, cz, height, footprint });
      colliders.push(footprint);
      for (const side of SIDES) {
        points.push({
          id: `${name}:${side.name}`,
          name,
          x: cx + side.dx * CURB_OFFSET,
          z: cz + side.dz * CURB_OFFSET,
        });
      }
    });
  });

  // HQ: gedung di sisi selatan blok, lot parkir terbuka di sisi utara.
  const hqBlock = blocks.find((b) => b.kind === 'hq');
  hqBlock.footprint = { minX: -72, maxX: -48, minZ: 63, maxZ: 72 };
  colliders.push(hqBlock.footprint);
  const hq = {
    zone: { minX: -74, maxX: -46, minZ: 46, maxZ: 62 },
    spawn: { x: -60, z: 55, heading: Math.PI }, // menghadap utara
  };

  // Drop-off plant di sisi selatan supaya tidak tertutup gedung dari sudut kamera isometric.
  const plant = {
    dropoff: { id: 'plant', name: 'Electrical Plant', x: PLANT_BLOCK.cx + 6, z: PLANT_BLOCK.cz + CURB_OFFSET + 1.5 },
  };

  // Zona Zeus: kuadran timur laut, termasuk jalan menuju plant.
  const zeusZone = { minX: 0, maxX: BOUNDS, minZ: -BOUNDS, maxZ: 0 };

  // Pagar batas map.
  const wall = 4;
  colliders.push(
    { minX: -BOUNDS - wall, maxX: BOUNDS + wall, minZ: -BOUNDS - wall, maxZ: -BOUNDS },
    { minX: -BOUNDS - wall, maxX: BOUNDS + wall, minZ: BOUNDS, maxZ: BOUNDS + wall },
    { minX: -BOUNDS - wall, maxX: -BOUNDS, minZ: -BOUNDS, maxZ: BOUNDS },
    { minX: BOUNDS, maxX: BOUNDS + wall, minZ: -BOUNDS, maxZ: BOUNDS },
  );

  // Day 1 (tutorial): paket Zeus menunggu tepat di seberang jalan dari lot HQ.
  const scriptedZeusPoint = points.find((p) => p.id === 'Apotek Asclepius:south');

  return { blocks, colliders, points, hq, plant, zeusZone, scriptedZeusPoint, bounds: BOUNDS };
}
