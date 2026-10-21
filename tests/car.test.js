import { describe, expect, it } from 'vitest';
import { Car } from '../src/sim/car.js';
import { CONFIG } from '../src/config.js';

const box = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };

describe('Car', () => {
  it('gas mempercepat sampai kecepatan maksimum', () => {
    const car = new Car(CONFIG.car);
    for (let i = 0; i < 600; i++) car.update(1 / 60, { throttle: 1, steer: 0 }, []);
    expect(car.forwardSpeed).toBeCloseTo(CONFIG.car.maxSpeed, 5);
    expect(car.z).toBeGreaterThan(0); // heading 0 = +z
  });

  it('A berbelok ke kiri van (heading bertambah)', () => {
    const car = new Car(CONFIG.car);
    car.vz = 15;
    car.update(1 / 60, { throttle: 1, steer: 1 }, []);
    expect(car.heading).toBeGreaterThan(0);
  });

  it('tidak bisa berbelok saat diam', () => {
    const car = new Car(CONFIG.car);
    car.update(1 / 60, { throttle: 0, steer: 1 }, []);
    expect(car.heading).toBe(0);
  });

  it('tabrakan mendorong van keluar dan melaporkan kecepatan tumbukan', () => {
    const car = new Car(CONFIG.car);
    car.reset({ x: 0, z: -7, heading: 0 });
    car.vz = 12;
    let impacts = [];
    for (let i = 0; i < 30 && !impacts.length; i++) impacts = car.update(1 / 60, { throttle: 0, steer: 0 }, [box]);
    expect(impacts[0]).toBeGreaterThan(10);
    expect(car.z).toBeLessThanOrEqual(box.minZ - CONFIG.car.radius + 1e-6);
    expect(car.vz).toBeLessThan(0); // memantul
  });

  it('van yang terjebak di dalam kotak didorong keluar lewat sisi terdekat', () => {
    const car = new Car(CONFIG.car);
    car.reset({ x: 4.5, z: 0, heading: 0 });
    car.resolveCollisions([box]);
    expect(car.x).toBeCloseTo(box.maxX + CONFIG.car.radius, 5);
  });
});
