import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game.js';
import { RUN_STATE } from '../src/sim/run.js';
import { testConfig } from './helpers.js';
import { nearestOnPolyline } from '../src/sim/geometry.js';
import { SHOTS, shotAt, shotAnchor, showcasePose } from '../src/render/showcaseCam.js';
import { nearestLabel } from '../src/ui/mainmenu.js';

function attractGame(seed = 1) {
  const cfg = testConfig();
  cfg.npc.enabled = true;
  const game = new Game({ seed, config: cfg });
  game.startRun();
  game.beginAttract();
  return game;
}

function drive(game, seconds) {
  const stats = { maxOff: 0, off: 0, frames: 0, nan: false, dests: new Set(), start: { x: game.car.x, z: game.car.z } };
  for (let i = 0; i < seconds * 60; i++) {
    game.updateAttract(1 / 60);
    const c = game.car;
    if (![c.x, c.z, c.heading, c.speed].every(Number.isFinite)) stats.nan = true;
    const d = Math.min(...game.world.roads.map((r) => nearestOnPolyline(r.points, r.closed, c.x, c.z).dist - r.width / 2));
    stats.maxOff = Math.max(stats.maxOff, d);
    if (d > 4) stats.off++;
    stats.frames++;
    if (game.attract.dest) stats.dests.add(game.attract.dest.id);
  }
  return stats;
}

describe('Autopilot main menu', () => {
  it('menyetir sendiri jauh, tanpa NaN, hampir selalu di jalan, dan ke beberapa tujuan', () => {
    const game = attractGame(1);
    const s = drive(game, 90);
    expect(s.nan).toBe(false);
    expect(game.attract.distance).toBeGreaterThan(600);
    expect(s.dests.size).toBeGreaterThan(1);
    expect(s.off / s.frames).toBeLessThan(0.1);
  });

  it('tidak macet permanen di beberapa seed', () => {
    for (const seed of [2, 3, 5]) {
      const game = attractGame(seed);
      drive(game, 60);
      const before = game.attract.distance;
      drive(game, 30);
      expect(game.attract.distance - before).toBeGreaterThan(100);
    }
  });

  it('drift (handbrake) muncul di sela perjalanan', () => {
    const game = attractGame(1);
    let drifts = 0;
    game.bus.on('drift_start', () => drifts++);
    drive(game, 180);
    expect(drifts).toBeGreaterThan(0);
  });

  it('jam bergulir pagi → malam lalu kembali (wrap)', () => {
    const game = attractGame(1);
    let wraps = 0;
    game.bus.on('attract_wrap', () => wraps++);
    const cycle = game.cfg.attract.cycleSeconds;
    drive(game, cycle * 0.5);
    expect(game.clock.hour).toBeGreaterThan(game.cfg.attract.startHour + 3);
    drive(game, cycle * 0.6);
    expect(wraps).toBe(1);
    expect(game.clock.hour).toBeLessThan(game.cfg.attract.startHour + 3);
  });

  it('attract tidak menyentuh run: uang, damage, paket; Mulai menghasilkan Day 1 bersih', () => {
    const game = attractGame(1);
    const wallet = game.run.wallet;
    drive(game, 40);
    expect(game.run.state).toBe(RUN_STATE.INTRO);
    expect(game.run.wallet).toBe(wallet);
    expect(game.damage.total ?? 0).toBe(0);
    expect(game.packages.cargo.length).toBe(0);
    game.beginDay();
    expect(game.attractActive).toBe(false);
    expect(game.run.state).toBe(RUN_STATE.DAY);
    expect(game.clock.hour).toBeLessThan(9);
    expect(game.style.active).toBe(true);
  });

  it('parkAtHq mengembalikan van ke HQ dan menghentikan attract', () => {
    const game = attractGame(1);
    drive(game, 10);
    game.parkAtHq();
    expect(game.attractActive).toBe(false);
    expect(Math.hypot(game.car.x - game.world.hq.spawn.x, game.car.z - game.world.hq.spawn.z)).toBeLessThan(1);
  });
});

describe('showcaseCam', () => {
  const flat = () => 0;
  const car = { x: 10, z: -5, y: 0, heading: 1.2 };

  it('shot berganti sesuai jadwal dan berputar', () => {
    const seen = new Set();
    for (let t = 0; t < 120; t += 1) seen.add(shotAt(t).shot.id);
    expect(seen.size).toBe(SHOTS.length);
    expect(shotAt(0).shot.id).toBe(SHOTS[0].id);
    const total = SHOTS.reduce((s, x) => s + x.seconds, 0);
    expect(shotAt(total + 1).shot.id).toBe(shotAt(1).shot.id);
    for (const s of SHOTS) expect(s.seconds).toBeGreaterThanOrEqual(7);
  });

  it('pose selalu terhingga dan di atas tanah (termasuk medan tinggi)', () => {
    const hill = (x, z) => 12 + Math.sin(x * 0.2) * 6 + Math.cos(z * 0.3) * 5;
    for (const heightAt of [flat, hill]) {
      for (let t = 0; t < 70; t += 0.5) {
        const s = shotAt(t);
        const c = { ...car, y: heightAt(car.x, car.z), heading: car.heading + t * 0.1 };
        const pose = showcasePose(s, c, shotAnchor(s.shot, c, c.heading), heightAt, 0.7);
        for (const v of [pose.position.x, pose.position.y, pose.position.z, pose.look.x, pose.look.y, pose.look.z, pose.fov]) expect(Number.isFinite(v)).toBe(true);
        expect(pose.position.y).toBeGreaterThanOrEqual(heightAt(pose.position.x, pose.position.z) + 1);
        expect(pose.fov).toBeGreaterThan(30);
        expect(pose.fov).toBeLessThan(90);
      }
    }
  });

  it('shot roadside memakai titik tetap di depan van', () => {
    const shot = SHOTS.find((s) => s.id === 'roadside');
    const a = shotAnchor(shot, car, car.heading);
    expect(Math.hypot(a.x - car.x, a.z - car.z)).toBeGreaterThan(20);
    expect(shotAnchor(SHOTS[0], car, car.heading)).toBeNull();
  });
});

describe('Caption lokasi menu', () => {
  it('memilih label terdekat dan kosong bila jauh dari semuanya', () => {
    const game = attractGame(1);
    const l = game.world.labels[0];
    expect(nearestLabel(game.world, l.x + 5, l.z)).toBe(l.text);
    expect(nearestLabel(game.world, 1e6, 1e6)).toBeNull();
  });
});
