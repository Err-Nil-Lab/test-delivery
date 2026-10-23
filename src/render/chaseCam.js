// Kamera third person (di belakang van, ala GTA). Logika murni tanpa three.js supaya bisa dites.
// heading 0 = menghadap +z; arah depan = (sin h, cos h).

export const CHASE = {
  distance: 13, // jarak kamera di belakang van
  height: 6.5, // tinggi kamera di atas van
  lookAhead: 8, // titik yang dilihat, di depan van
  lookHeight: 1.6,
  fov: 62,
  fovSpeed: 10, // tambahan FOV pada kecepatan penuh
  yawRate: 3.5, // seberapa cepat kamera menyusul arah van (per detik)
  driftFollow: 0.35, // sebagian sudut slip yang ikut diikuti kamera saat drift
  maxSlipFollow: 0.6,
};

// Selisih sudut terpendek a → b dalam (-π, π].
export function angleDiff(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

// Yaw yang dituju kamera: arah hadap van, sedikit condong ke arah gerak saat drift maju.
export function targetYaw(car, cfg = CHASE) {
  const speed = Math.hypot(car.vx, car.vz);
  const forward = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
  if (speed < 6 || forward <= 0) return car.heading;
  const slip = angleDiff(car.heading, Math.atan2(car.vx, car.vz));
  return car.heading + Math.max(-cfg.maxSlipFollow, Math.min(cfg.maxSlipFollow, slip)) * cfg.driftFollow;
}

// Yaw kamera menyusul target dengan halus lewat jalur terpendek (aman di batas ±π).
export function smoothYaw(current, target, dt, cfg = CHASE) {
  return current + angleDiff(current, target) * (1 - Math.exp(-cfg.yawRate * dt));
}

// Pose kamera: posisi di belakang van, titik lihat di depan van, dan FOV (melebar seiring kecepatan).
export function chasePose(pos, yaw, speedRatio = 0, cfg = CHASE) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return {
    position: { x: pos.x - fx * cfg.distance, y: pos.y + cfg.height, z: pos.z - fz * cfg.distance },
    look: { x: pos.x + fx * cfg.lookAhead, y: pos.y + cfg.lookHeight, z: pos.z + fz * cfg.lookAhead },
    fov: cfg.fov + Math.max(0, Math.min(1, speedRatio)) * cfg.fovSpeed,
  };
}
