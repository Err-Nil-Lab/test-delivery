// Van arcade: gas/rem/mundur, belokan bergantung kecepatan, grip lateral, tanjakan,
// collision dengan gedung/tebing/Minotaur, dan impuls (serudukan Minotaur).
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
    return this.speed < this.cfg.stopSpeed;
  }

  // controls: { throttle: -1..1, steer: -1..1 (positif = kiri) }.
  // env: { heightAt, colliders: (x, z, r) => [], hillOverflow, dynamic: [] }.
  // Mengembalikan daftar tumbukan { speed, collider }.
  update(dt, controls, env = {}) {
    const c = this.cfg;
    let fx = Math.sin(this.heading);
    let fz = Math.cos(this.heading);
    let fwd = this.vx * fx + this.vz * fz;
    let lat = this.vx * -fz + this.vz * fx;

    const throttle = controls.throttle;
    if (throttle > 0) {
      fwd = fwd < -0.1 ? Math.min(fwd + c.brake * dt, 0) : Math.min(fwd + c.accel * dt * throttle, Math.max(fwd, c.maxSpeed));
    } else if (throttle < 0) {
      fwd = fwd > 0.1 ? Math.max(fwd - c.brake * dt, 0) : Math.max(fwd - c.reverseAccel * dt, -c.maxReverse);
    } else {
      fwd = approach(fwd, 0, c.coastDrag * dt);
    }
    if (fwd > c.maxSpeed) fwd = approach(fwd, c.maxSpeed, c.coastDrag * dt);

    // Tanjakan: menanjak melambat, menurun bertambah cepat.
    if (env.heightAt) {
      const slope = (env.heightAt(this.x + fx, this.z + fz) - env.heightAt(this.x - fx, this.z - fz)) / 2;
      fwd -= c.gravity * slope * dt;
    }

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

    const nearby = env.colliders ? env.colliders(this.x, this.z, this.radius + 1) : [];
    const impacts = this.resolveCollisions([...nearby, ...(env.dynamic ?? [])]);
    if (env.hillOverflow) impacts.push(...this.stayOnHillRoad(env.hillOverflow));
    return impacts;
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

  // Lereng gunung terlalu curam: van didorong kembali ke tepi jalan.
  stayOnHillRoad(hillOverflow) {
    const impacts = [];
    const o = hillOverflow(this.x, this.z, this.radius);
    if (!o || o.over <= 0) return impacts;
    const d = Math.max(o.dist, 1e-6);
    this.push(-(this.x - o.x) / d, -(this.z - o.z) / d, o.over, { cliff: true }, impacts);
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
