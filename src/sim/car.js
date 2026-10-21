// Van arcade: gas/rem/mundur, belokan bergantung kecepatan, grip lateral, tanjakan,
// collision dengan gedung/pantai/Minotaur, impuls (serudukan Minotaur), dan medan berundak:
// undakan terlalu tinggi = tembok saat menanjak; saat menurun van melayang lalu mendarat.
// heading 0 = menghadap +z; forward = (sin h, cos h).
import { contact } from './collision.js';

function approach(value, target, delta) {
  if (value < target) return Math.min(value + delta, target);
  return Math.max(value - delta, target);
}

export class Car {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset({ x: 0, z: 0, heading: 0 });
  }

  reset({ x, z, heading }) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.spin = 0;
    this.slide = 0; // detik grip berkurang setelah kena impuls
    this.y = null; // diisi dari tinggi medan pada update berikutnya
    this.vy = 0;
    this.airborne = false;
  }

  get radius() {
    return this.cfg.radius;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  get forwardSpeed() {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }

  get stopped() {
    return !this.airborne && this.speed < this.cfg.stopSpeed;
  }

  // controls: { throttle: -1..1, steer: -1..1 (positif = kiri) }.
  // env: { heightAt, slopeAt, colliders: (x, z, r) => [], dynamic: [] }.
  // Mengembalikan daftar tumbukan { speed, collider }.
  update(dt, controls, env = {}) {
    const ground = env.heightAt ?? (() => 0);
    if (this.y === null) this.y = ground(this.x, this.z);
    const prevX = this.x;
    const prevZ = this.z;
    const prevY = this.y;
    if (this.airborne) this.fly(dt);
    else this.drive(dt, controls, ground, env.speedAt ? env.speedAt(this.x, this.z) : 1);

    const nearby = env.colliders ? env.colliders(this.x, this.z, this.radius + 1) : [];
    const impacts = this.resolveCollisions([...nearby, ...(env.dynamic ?? [])]);
    this.followTerrain(ground, env.slopeAt, prevX, prevZ, prevY, impacts);
    return impacts;
  }

  // Di udara: tidak bisa menyetir atau ngegas, hanya jatuh.
  fly(dt) {
    this.vy -= this.cfg.fallGravity * dt;
    this.y += this.vy * dt;
    this.heading += this.spin * dt;
    this.spin *= Math.exp(-this.cfg.spinDamping * dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }

  // speedFactor: pengali kecepatan maksimum menurut permukaan (jalan utama > jalan kecil > luar jalan).
  drive(dt, controls, ground, speedFactor = 1) {
    const c = this.cfg;
    const maxSpeed = c.maxSpeed * speedFactor;
    let fx = Math.sin(this.heading);
    let fz = Math.cos(this.heading);
    let fwd = this.vx * fx + this.vz * fz;
    let lat = this.vx * -fz + this.vz * fx;

    const throttle = controls.throttle;
    if (throttle > 0) {
      fwd = fwd < -0.1 ? Math.min(fwd + c.brake * dt, 0) : Math.min(fwd + c.accel * dt * throttle, Math.max(fwd, maxSpeed));
    } else if (throttle < 0) {
      fwd = fwd > 0.1 ? Math.max(fwd - c.brake * dt, 0) : Math.max(fwd - c.reverseAccel * dt, -c.maxReverse);
    } else {
      fwd = approach(fwd, 0, c.coastDrag * dt);
    }
    if (fwd > maxSpeed) fwd = approach(fwd, maxSpeed, c.offroadDrag * dt);

    // Tanjakan: menanjak melambat, menurun bertambah cepat.
    const slope = (ground(this.x + fx, this.z + fz) - ground(this.x - fx, this.z - fz)) / 2;
    fwd -= c.gravity * slope * dt;

    this.slide = Math.max(0, this.slide - dt);
    const grip = this.slide > 0 ? c.lateralGrip * c.slideGrip : c.lateralGrip;
    lat *= Math.exp(-grip * dt);

    const steerFactor = Math.min(Math.abs(fwd) / c.steerFullSpeed, 1) * Math.sign(fwd);
    this.heading += (controls.steer * c.steerRate * steerFactor + this.spin) * dt;
    this.spin *= Math.exp(-c.spinDamping * dt);

    fx = Math.sin(this.heading);
    fz = Math.cos(this.heading);
    this.vx = fx * fwd - fz * lat;
    this.vz = fz * fwd + fx * lat;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }

  followTerrain(ground, slopeAt, prevX, prevZ, prevY, impacts) {
    const c = this.cfg;
    const g = ground(this.x, this.z);
    const tolerance = c.maxClimbSlope * Math.hypot(this.x - prevX, this.z - prevZ) + 0.02;

    // Undakan terlalu tinggi untuk dinaiki: seperti menabrak tembok, van bisa menyusurinya.
    // (Saat melayang dibandingkan dengan tinggi sebelum jatuh di frame ini, supaya mendarat tidak dikira menabrak.)
    if (g > prevY + tolerance) {
      let nx = prevX - this.x;
      let nz = prevZ - this.z;
      if (slopeAt) {
        const s = slopeAt(this.x, this.z);
        nx = -s.x;
        nz = -s.z;
      }
      const d = Math.hypot(nx, nz) || 1;
      this.x = prevX;
      this.z = prevZ;
      if (!this.airborne) this.y = ground(prevX, prevZ);
      this.push(nx / d, nz / d, 0, { ledge: true }, impacts);
      return;
    }

    if (this.airborne) {
      if (this.y > g) return;
      // Mendarat: makin tinggi jatuhnya, makin keras.
      const fall = -this.vy;
      this.y = g;
      this.vy = 0;
      this.airborne = false;
      this.vx *= c.landingFriction;
      this.vz *= c.landingFriction;
      if (fall > 0) impacts.push({ speed: fall, collider: { landing: true } });
      return;
    }

    // Tanah turun lebih curam daripada yang bisa diikuti roda: van melayang.
    if (g < this.y - tolerance) {
      this.airborne = true;
      this.vy = 0;
      return;
    }
    this.y = g;
  }

  push(nx, nz, depth, collider, impacts) {
    this.x += nx * depth;
    this.z += nz * depth;
    const vn = this.vx * nx + this.vz * nz;
    if (vn >= 0) return;
    const tx = this.vx - vn * nx;
    const tz = this.vz - vn * nz;
    const bounce = -vn * this.cfg.wallBounce;
    this.vx = tx * this.cfg.wallFriction + nx * bounce;
    this.vz = tz * this.cfg.wallFriction + nz * bounce;
    impacts.push({ speed: -vn, collider });
  }

  resolveCollisions(colliders) {
    const impacts = [];
    for (const collider of colliders) {
      const hit = contact(this.x, this.z, this.radius, collider);
      if (hit) this.push(hit.nx, hit.nz, hit.depth, collider, impacts);
    }
    return impacts;
  }

  // Disambar petir: kecepatan dipotong dan van sedikit berputar.
  applyHit(speedMultiplier, spin) {
    this.vx *= speedMultiplier;
    this.vz *= speedMultiplier;
    this.spin += spin;
  }

  // Diseruduk: kecepatan tambahan ke satu arah, van berputar dan tergelincir sebentar.
  applyImpulse(ix, iz, spin) {
    this.vx += ix;
    this.vz += iz;
    this.spin += spin;
    this.slide = this.cfg.slideSeconds;
  }
}
