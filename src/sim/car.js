// Van arcade: gas/rem/mundur, belokan bergantung kecepatan, grip lateral,
// dan collision lingkaran-vs-AABB terhadap gedung serta pagar map.
// heading 0 = menghadap +z; forward = (sin h, cos h).

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

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
  // Mengembalikan daftar kecepatan tumbukan (untuk damage).
  update(dt, controls, colliders) {
    const c = this.cfg;
    let fx = Math.sin(this.heading);
    let fz = Math.cos(this.heading);
    let fwd = this.vx * fx + this.vz * fz;
    let lat = this.vx * -fz + this.vz * fx;

    const throttle = controls.throttle;
    if (throttle > 0) {
      fwd = fwd < -0.1 ? Math.min(fwd + c.brake * dt, 0) : Math.min(fwd + c.accel * dt * throttle, c.maxSpeed);
    } else if (throttle < 0) {
      fwd = fwd > 0.1 ? Math.max(fwd - c.brake * dt, 0) : Math.max(fwd - c.reverseAccel * dt, -c.maxReverse);
    } else {
      fwd = approach(fwd, 0, c.coastDrag * dt);
    }
    lat *= Math.exp(-c.lateralGrip * dt);

    const steerFactor = Math.min(Math.abs(fwd) / c.steerFullSpeed, 1) * Math.sign(fwd);
    this.heading += (controls.steer * c.steerRate * steerFactor + this.spin) * dt;
    this.spin *= Math.exp(-c.spinDamping * dt);

    fx = Math.sin(this.heading);
    fz = Math.cos(this.heading);
    this.vx = fx * fwd - fz * lat;
    this.vz = fz * fwd + fx * lat;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    return this.resolveCollisions(colliders);
  }

  resolveCollisions(colliders) {
    const impacts = [];
    const r = this.cfg.radius;
    for (const box of colliders) {
      const px = clamp(this.x, box.minX, box.maxX);
      const pz = clamp(this.z, box.minZ, box.maxZ);
      const dx = this.x - px;
      const dz = this.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;

      let nx;
      let nz;
      let push;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
        push = r - d;
      } else {
        // Pusat van di dalam kotak: dorong keluar lewat sisi terdekat.
        const exits = [
          { depth: this.x - box.minX, nx: -1, nz: 0 },
          { depth: box.maxX - this.x, nx: 1, nz: 0 },
          { depth: this.z - box.minZ, nx: 0, nz: -1 },
          { depth: box.maxZ - this.z, nx: 0, nz: 1 },
        ];
        const exit = exits.reduce((a, b) => (b.depth < a.depth ? b : a));
        nx = exit.nx;
        nz = exit.nz;
        push = r + exit.depth;
      }
      this.x += nx * push;
      this.z += nz * push;

      const vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        const tx = this.vx - vn * nx;
        const tz = this.vz - vn * nz;
        const bounce = -vn * this.cfg.wallBounce;
        this.vx = tx * this.cfg.wallFriction + nx * bounce;
        this.vz = tz * this.cfg.wallFriction + nz * bounce;
        impacts.push(-vn);
      }
    }
    return impacts;
  }

  // Disambar petir: kecepatan dipotong dan van sedikit berputar.
  applyHit(speedMultiplier, spin) {
    this.vx *= speedMultiplier;
    this.vz *= speedMultiplier;
    this.spin += spin;
  }
}
