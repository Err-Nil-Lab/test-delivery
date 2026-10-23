// Kamera sinematik untuk main menu / mode pamer. Logika murni tanpa three.js supaya bisa dites.
// heading 0 = menghadap +z; arah depan = (sin h, cos h), kanan = (cos h, -sin h).

export const SHOTS = [
  { id: 'chase', seconds: 8 },
  { id: 'orbit', seconds: 9 },
  { id: 'heli', seconds: 9 },
  { id: 'front', seconds: 7 },
  { id: 'top', seconds: 8 },
  { id: 'roadside', seconds: 7 },
];

const TOTAL = SHOTS.reduce((s, x) => s + x.seconds, 0);

// Shot aktif pada waktu t (detik sejak mulai) beserta waktu lokalnya. Urutan berputar.
export function shotAt(time, offset = 0) {
  let t = (((time + offset) % TOTAL) + TOTAL) % TOTAL;
  for (let index = 0; index < SHOTS.length; index++) {
    const shot = SHOTS[index];
    if (t < shot.seconds) return { index, shot, local: t, progress: t / shot.seconds };
    t -= shot.seconds;
  }
  return { index: 0, shot: SHOTS[0], local: 0, progress: 0 };
}

// Titik tetap untuk shot yang tidak mengikuti van (roadside): di depan van, agak ke pinggir.
export function shotAnchor(shot, pos, heading) {
  if (shot.id !== 'roadside') return null;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  return { x: pos.x + fx * 34 + fz * 9, z: pos.z + fz * 34 - fx * 9 };
}

// Pose kamera { position, look, fov } untuk shot tertentu. heightAt menjaga kamera tetap di atas tanah.
export function showcasePose({ shot, local, progress }, car, anchor, heightAt, speedRatio = 0) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const rx = fz;
  const rz = -fx;
  const y = car.y ?? heightAt(car.x, car.z);
  let p;
  let look = { x: car.x + fx * 6, y: y + 1.4, z: car.z + fz * 6 };
  let fov = 58;
  switch (shot.id) {
    case 'orbit': {
      const a = car.heading + Math.PI * 0.75 + progress * Math.PI * 0.9;
      p = { x: car.x + Math.sin(a) * 12, y: y + 3.4 + progress * 1.5, z: car.z + Math.cos(a) * 12 };
      look = { x: car.x, y: y + 1.2, z: car.z };
      fov = 55;
      break;
    }
    case 'heli':
      p = { x: car.x - fx * 8 + rx * 22, y: y + 26, z: car.z - fz * 8 + rz * 22 };
      look = { x: car.x + fx * 6, y: y, z: car.z + fz * 6 };
      fov = 50;
      break;
    case 'front': {
      const sway = Math.sin(local * 0.5) * 3;
      p = { x: car.x + fx * 9 + rx * (6 + sway), y: y + 1.5, z: car.z + fz * 9 + rz * (6 + sway) };
      look = { x: car.x, y: y + 1.1, z: car.z };
      fov = 66;
      break;
    }
    case 'top':
      p = { x: car.x - fx * 14, y: y + 40, z: car.z - fz * 14 };
      look = { x: car.x + fx * 4, y: y, z: car.z + fz * 4 };
      fov = 46;
      break;
    case 'roadside': {
      const a = anchor ?? { x: car.x + fx * 34 + rx * 9, z: car.z + fz * 34 + rz * 9 };
      p = { x: a.x, y: heightAt(a.x, a.z) + 1.7, z: a.z };
      look = { x: car.x, y: y + 1.2, z: car.z };
      fov = 44 + 14 * Math.max(0, 1 - Math.hypot(car.x - a.x, car.z - a.z) / 40);
      break;
    }
    case 'chase':
    default:
      p = { x: car.x - fx * 9.5, y: y + 2.8, z: car.z - fz * 9.5 };
      look = { x: car.x + fx * 10, y: y + 1.2, z: car.z + fz * 10 };
      fov = 64;
  }
  // Jangan menembus tanah.
  p.y = Math.max(p.y, heightAt(p.x, p.z) + 1.4);
  return { position: p, look, fov: fov + Math.max(0, Math.min(1, speedRatio)) * 8 };
}
