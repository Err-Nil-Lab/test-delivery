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
});
