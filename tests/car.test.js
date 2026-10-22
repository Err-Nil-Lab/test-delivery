import { describe, expect, it } from 'vitest';
import { Car } from '../src/sim/car.js';
import { boxCollider, segCollider } from '../src/sim/collision.js';
import { CONFIG } from '../src/config.js';

const box = boxCollider(0, 0, 5, 5);
const only = (...cs) => ({ colliders: () => cs });

describe('Car', () => {
  it('gas mempercepat sampai kecepatan maksimum', () => {
    const car = new Car(CONFIG.car);
    for (let i = 0; i < 600; i++) car.update(1 / 60, { throttle: 1, steer: 0 });
    expect(car.forwardSpeed).toBeCloseTo(CONFIG.car.maxSpeed, 5);
    expect(car.z).toBeGreaterThan(0); // heading 0 = +z
  });

  it('A berbelok ke kiri van (heading bertambah)', () => {
    const car = new Car(CONFIG.car);
    car.vz = 15;
    car.update(1 / 60, { throttle: 1, steer: 1 });
    expect(car.heading).toBeGreaterThan(0);
  });

  it('tidak bisa berbelok saat diam', () => {
    const car = new Car(CONFIG.car);
    car.update(1 / 60, { throttle: 0, steer: 1 });
    expect(car.heading).toBe(0);
  });

  it('tabrakan mendorong van keluar dan melaporkan kecepatan tumbukan', () => {
    const car = new Car(CONFIG.car);
    car.reset({ x: 0, z: -7, heading: 0 });
    car.vz = 12;
    let impacts = [];
    for (let i = 0; i < 30 && !impacts.length; i++) impacts = car.update(1 / 60, { throttle: 0, steer: 0 }, only(box));
    expect(impacts[0].speed).toBeGreaterThan(10);
    expect(impacts[0].collider).toBe(box);
    expect(car.z).toBeLessThanOrEqual(-5 - CONFIG.car.radius + 1e-6);
    expect(car.vz).toBeLessThan(0); // memantul
  });

  it('van yang terjebak di dalam kotak didorong keluar lewat sisi terdekat', () => {
    const car = new Car(CONFIG.car);
    car.reset({ x: 4.5, z: 0, heading: 0 });
    car.resolveCollisions([box]);
    expect(car.x).toBeCloseTo(5 + CONFIG.car.radius, 5);
  });

  it('collision dengan gedung yang diputar 45°', () => {
    const rotated = boxCollider(0, 0, 5, 1, Math.PI / 4);
    const car = new Car(CONFIG.car);
    // Titik di sumbu panjang kotak (diagonal) bertabrakan; titik di samping diagonal tidak.
    car.reset({ x: 2, z: 2, heading: 0 });
    expect(car.resolveCollisions([rotated])).toHaveLength(0); // diam: tidak ada tumbukan, tapi didorong
    expect(Math.abs(car.x - car.z)).toBeGreaterThan(1);
    car.reset({ x: 5, z: -5, heading: 0 });
    expect(car.resolveCollisions([rotated])).toHaveLength(0);
    expect(car.x).toBe(5);
  });

  it('dinding kapsul (tebing/pantai) menahan van', () => {
    const wall = segCollider(-10, 0, 10, 0, 0.4);
    const car = new Car(CONFIG.car);
    car.reset({ x: 0, z: -3, heading: 0 });
    car.vz = 15;
    for (let i = 0; i < 60; i++) car.update(1 / 60, { throttle: 1, steer: 0 }, only(wall));
    expect(car.z).toBeLessThanOrEqual(-(CONFIG.car.radius + 0.4) + 1e-6);
  });

  it('tanjakan memperlambat, turunan mempercepat', () => {
    const run = (heightAt) => {
      const car = new Car(CONFIG.car);
      car.vz = 10;
      for (let i = 0; i < 60; i++) car.update(1 / 60, { throttle: 0, steer: 0 }, { heightAt });
      return car.forwardSpeed;
    };
    const flat = run(() => 0);
    const uphill = run((x, z) => z * 0.2);
    const downhill = run((x, z) => -z * 0.2);
    expect(uphill).toBeLessThan(flat);
    expect(downhill).toBeGreaterThan(flat);
  });

  it('impuls (serudukan) mendorong van dan membuatnya tergelincir', () => {
    const car = new Car(CONFIG.car);
    car.applyImpulse(20, 0, 3);
    expect(car.vx).toBe(20);
    expect(car.slide).toBeGreaterThan(0);
    car.update(1 / 60, { throttle: 0, steer: 0 });
    expect(car.x).toBeGreaterThan(0);
  });

  // Medan undakan: x < 0 tinggi 0, x >= 0 tinggi 3 (dinding setinggi 3 di x = 0).
  const step = { heightAt: (x) => (x >= 0 ? 3 : 0), slopeAt: (x) => ({ x: Math.abs(x) < 0.5 ? 3 : 0, z: 0 }) };

  it('undakan terlalu tinggi saat menanjak = menabrak tembok', () => {
    const car = new Car(CONFIG.car);
    car.reset({ x: -3, z: 0, heading: Math.PI / 2 }); // menghadap +x
    car.vx = 15;
    let impacts = [];
    for (let i = 0; i < 30 && !impacts.length; i++) impacts = car.update(1 / 60, { throttle: 1, steer: 0 }, step);
    expect(impacts[0].collider.ledge).toBe(true);
    expect(impacts[0].speed).toBeGreaterThan(10);
    expect(car.x).toBeLessThan(0);
    expect(car.y).toBe(0);
  });

  it('turun dari undakan: van melayang lalu mendarat keras', () => {
    const car = new Car(CONFIG.car);
    car.reset({ x: 3, z: 0, heading: -Math.PI / 2 }); // menghadap -x, di atas undakan
    car.vx = -15;
    const landings = [];
    let flew = false;
    for (let i = 0; i < 120; i++) {
      const impacts = car.update(1 / 60, { throttle: 0, steer: 0 }, step);
      flew ||= car.airborne;
      landings.push(...impacts.filter((h) => h.collider.landing));
    }
    expect(flew).toBe(true);
    expect(car.airborne).toBe(false);
    expect(car.y).toBe(0);
    expect(landings).toHaveLength(1);
    expect(landings[0].speed).toBeCloseTo(Math.sqrt(2 * CONFIG.car.fallGravity * 3), 0);
  });

  it('tidak bisa menyetir atau ngegas saat melayang', () => {
    const car = new Car(CONFIG.car);
    car.reset({ x: 0, z: 0, heading: 0 });
    car.y = 10;
    car.airborne = true;
    car.vz = 10;
    car.update(1 / 60, { throttle: 1, steer: 1 });
    expect(car.heading).toBe(0);
    expect(car.vz).toBe(10);
    expect(car.stopped).toBe(false);
  });

  describe('handbrake / drift', () => {
    const DT = 1 / 60;
    const atSpeed = () => {
      const car = new Car(CONFIG.car);
      for (let i = 0; i < 300; i++) car.update(DT, { throttle: 1, steer: 0 });
      return car;
    };
    // Ngepot: tahan Space + belok sambil ngegas, lalu lepas dan luruskan.
    const drift = (car, seconds) => {
      const events = [];
      let maxSlip = 0;
      for (let i = 0; i < seconds * 60; i++) {
        car.update(DT, { throttle: 1, steer: 1, handbrake: true });
        maxSlip = Math.max(maxSlip, car.slipAngle);
        events.push(...car.events.splice(0));
      }
      for (let i = 0; i < 90; i++) {
        car.update(DT, { throttle: 1, steer: 0 });
        events.push(...car.events.splice(0));
      }
      return { events, maxSlip };
    };

    it('handbrake membuat van menyamping dan berbelok lebih tajam', () => {
      const normal = atSpeed();
      const hb = atSpeed();
      for (let i = 0; i < 30; i++) {
        normal.update(DT, { throttle: 1, steer: 1 });
        hb.update(DT, { throttle: 1, steer: 1, handbrake: true });
      }
      expect(hb.heading).toBeGreaterThan(normal.heading * 1.3);
      expect(hb.slipAngle).toBeGreaterThan(normal.slipAngle + 0.2);
      expect(hb.slipAngle).toBeGreaterThan(CONFIG.car.drift.minAngle);
      expect(hb.speed).toBeLessThanOrEqual(CONFIG.car.maxSpeed + 1e-6); // ngepot tidak menambah kecepatan
    });

    it('drift lama lalu lepas = mini-turbo tingkat tertinggi', () => {
      const car = atSpeed();
      const { events } = drift(car, 2);
      const end = events.find((e) => e.type === 'drift_end');
      expect(events[0].type).toBe('drift_start');
      expect(end.tier).toBe(1);
      expect(end.seconds).toBeGreaterThan(1.6);
    });

    it('turbo benar-benar mendorong van di atas kecepatan maksimum sesaat', () => {
      const car = atSpeed();
      for (let i = 0; i < 120; i++) car.update(DT, { throttle: 1, steer: 1, handbrake: true });
      let top = 0;
      let boosted = false;
      for (let i = 0; i < 120; i++) {
        car.update(DT, { throttle: 1, steer: 0 });
        boosted ||= car.boostTime > 0;
        top = Math.max(top, car.forwardSpeed);
      }
      expect(boosted).toBe(true);
      expect(top).toBeGreaterThan(CONFIG.car.maxSpeed * 1.1);
      for (let i = 0; i < 300; i++) car.update(DT, { throttle: 1, steer: 0 });
      expect(car.forwardSpeed).toBeCloseTo(CONFIG.car.maxSpeed, 1);
    });

    it('drift pendek tidak memberi turbo', () => {
      const car = atSpeed();
      const { events } = drift(car, 0.3);
      const end = events.find((e) => e.type === 'drift_end');
      if (end) expect(end.tier).toBe(-1);
      expect(car.boostTime).toBe(0);
    });

    it('diseruduk (tanpa handbrake) tidak dihitung drift', () => {
      const car = atSpeed();
      car.applyImpulse(20, 0, 3);
      for (let i = 0; i < 120; i++) car.update(DT, { throttle: 1, steer: 0 });
      expect(car.events).toHaveLength(0);
      expect(car.boostTime).toBe(0);
    });

    it('drift dimatikan: Space tidak berpengaruh', () => {
      const off = atSpeed();
      off.driftEnabled = false;
      const normal = atSpeed();
      for (let i = 0; i < 60; i++) {
        off.update(DT, { throttle: 1, steer: 1, handbrake: true });
        normal.update(DT, { throttle: 1, steer: 1 });
      }
      expect(off.heading).toBeCloseTo(normal.heading, 6);
      expect(off.x).toBeCloseTo(normal.x, 6);
      expect(off.events).toHaveLength(0);
    });
  });
});
