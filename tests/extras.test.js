import { describe, expect, it } from 'vitest';
import { buildRoadGraph, findRoute, routeLength } from '../src/sim/navigation.js';
import { nearestOnPolyline } from '../src/sim/geometry.js';
import { newGame, stepFor, teleport, IDLE, PRESS_E } from './helpers.js';

const collect = (game, ...names) => {
  const seen = [];
  for (const n of names) game.bus.on(n, (p) => seen.push({ e: n, ...p }));
  return seen;
};

describe('Paket Rapuh', () => {
  it('retak tiap benturan (bayaran turun), pecah setelah 3 kali', () => {
    const game = newGame();
    const seen = collect(game, 'fragile_cracked', 'fragile_broken');
    game.packages.debugGiveVariant(game.car, 'fragile');
    const pkg = game.packages.cargo[0];
    const base = pkg.basePay;
    game.packages.jolt('collision', 8);
    expect(pkg.pay).toBeLessThan(base);
    expect(seen[0].e).toBe('fragile_cracked');
    game.packages.jolt('collision', 8);
    game.packages.jolt('landing', 8);
    expect(game.packages.cargo).toHaveLength(0);
    expect(seen.at(-1).e).toBe('fragile_broken');
  });

  it('tabrakan sungguhan membuat paket rapuh retak', () => {
    const game = newGame();
    const seen = collect(game, 'fragile_cracked');
    game.packages.debugGiveVariant(game.car, 'fragile');
    const b = game.world.buildings.find((q) => q.kind === 'city');
    teleport(game, { x: b.cx, z: b.cz + b.hd + 4 }, Math.PI);
    game.car.vz = -20;
    stepFor(game, 1);
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('Paket Kilat', () => {
  it('telat = bayaran tinggal setengah', () => {
    const game = newGame();
    const seen = collect(game, 'express_late');
    game.packages.debugGiveVariant(game.car, 'express');
    const pkg = game.packages.cargo[0];
    expect(pkg.timeLimit).toBeGreaterThan(10);
    stepFor(game, pkg.timeLimit - 1);
    expect(pkg.late).toBeFalsy();
    stepFor(game, 2);
    expect(pkg.late).toBe(true);
    expect(pkg.pay).toBe(Math.round((pkg.basePay * game.cfg.packages.express.latePay) / 5) * 5);
    expect(seen).toHaveLength(1);
  });

  it('diantar tepat waktu = bayaran penuh', () => {
    const game = newGame();
    game.packages.debugGiveVariant(game.car, 'express');
    const pkg = game.packages.cargo[0];
    teleport(game, pkg.dest);
    game.step(1 / 60, PRESS_E);
    expect(game.packages.delivered[0].pay).toBe(pkg.basePay);
  });

  it('rapuh dan kilat ada sejak awal hari dan terus muncul sesudahnya', () => {
    const game = newGame({ seed: 4 });
    const start = new Set(game.packages.waiting.map((p) => p.type));
    expect(start.has('fragile') && start.has('express')).toBe(true);
    let later = 0;
    game.bus.on('package_spawned', (p) => (p.packageType === 'fragile' || p.packageType === 'express') && later++);
    game.god = true;
    // Ambil paket rapuh & kilat supaya slot varian kosong lagi.
    game.packages.waiting = game.packages.waiting.filter((p) => p.type !== 'fragile' && p.type !== 'express');
    stepFor(game, 90);
    expect(later).toBeGreaterThan(0);
  });
});

describe('Bonus gaya', () => {
  it('aksi beruntun menaikkan pengali, dibayar setelah jendela combo habis', () => {
    const game = newGame();
    const seen = collect(game, 'style_trick', 'style_banked');
    game.bus.emit('drift_end', { seconds: 1.5, tier: 0 });
    game.bus.emit('minotaur_miss', { closest: 3 });
    expect(game.style.multiplier).toBe(1.5);
    stepFor(game, game.cfg.style.comboWindow + 0.2);
    const banked = seen.find((s) => s.e === 'style_banked');
    expect(banked.tip).toBe(Math.round((15 + game.cfg.style.ole.value) * 1.5));
    expect(game.style.tips).toBe(banked.tip);
  });

  it('kena damage saat combo berjalan = combo hangus', () => {
    const game = newGame();
    const seen = collect(game, 'style_dropped', 'style_banked');
    game.bus.emit('drift_end', { seconds: 2, tier: 1 });
    game.bus.emit('collision', { impact: 10, cost: 30 });
    stepFor(game, 4);
    expect(seen.map((s) => s.e)).toEqual(['style_dropped']);
    expect(game.style.tips).toBe(0);
  });

  it('terbang dari undakan dan nyalip tipis dihitung', () => {
    const game = newGame();
    const seen = collect(game, 'style_trick');
    const car = { x: 0, z: 0, speed: 20, radius: 1.6, airborne: true };
    for (let i = 0; i < 40; i++) game.style.update(1 / 60, { car });
    car.airborne = false;
    game.style.update(1 / 60, { car });
    const npc = { x: 3.5, z: 0, width: 1.9, length: 3.8, state: 'drive', hidden: false };
    game.style.update(1 / 60, { car, npcCars: [npc] });
    game.style.update(1 / 60, { car, npcCars: [npc] }); // cooldown: tidak dihitung dua kali
    expect(seen.map((s) => s.kind)).toEqual(['air', 'closePass']);
  });

  it('tip masuk laporan akhir hari dan menambah profit', () => {
    const game = newGame();
    game.bus.emit('drift_end', { seconds: 2, tier: 1 });
    game.endDay();
    const report = game.run.lastReport;
    expect(report.tips).toBe(20);
    expect(report.profit).toBe(report.income + 20 - report.damageLoss - report.undeliveredLoss - report.towFee);
  });
});

describe('GPS', () => {
  const game = newGame();
  const { world } = game;
  const graph = buildRoadGraph(world, game.cfg.gps);

  it('ada rute dari HQ ke semua titik paket, istana, dan plant, lewat jalan', () => {
    for (const p of [...world.points, world.zeusPickup, world.plant.dropoff]) {
      const route = findRoute(graph, world.hq.spawn, p, { heightAt: world.heightAt });
      expect(route, p.name).not.toBeNull();
      // Titik di tengah rute berada di atas jalan.
      for (const q of route.slice(1, -1)) {
        const onRoad = world.roads.some((r) => nearestOnPolyline(r.points, r.closed, q.x, q.z).dist <= r.width / 2);
        expect(onRoad, p.name).toBe(true);
      }
    }
  });

  it('rute ke plant lewat jalan berkelok (lebih panjang dari garis lurus)', () => {
    const route = findRoute(graph, world.hq.spawn, world.plant.dropoff, { heightAt: world.heightAt });
    const straight = Math.hypot(world.plant.dropoff.x - world.hq.spawn.x, world.plant.dropoff.z - world.hq.spawn.z);
    expect(routeLength(route)).toBeGreaterThan(straight * 1.3);
  });

  it('gubuk di lereng didekati dari jalan yang tidak lebih rendah', () => {
    const hut = world.points.find((p) => p.id === 'hut-shepherd');
    const route = findRoute(graph, world.hq.spawn, hut, { heightAt: world.heightAt });
    const last = route.at(-2);
    expect(world.heightAt(last.x, last.z)).toBeGreaterThanOrEqual(world.heightAt(hut.x, hut.z) - 0.5);
  });

  it('memilih tujuan: kilat dulu, badai = pulang ke HQ, GPS mati = tanpa rute', () => {
    const g = newGame();
    g.packages.debugGiveVariant(g.car, 'fragile');
    g.packages.debugGiveVariant(g.car, 'express');
    teleport(g, g.world.ref.cityRoad);
    g.step(1 / 60, IDLE);
    expect(g.nav.target.kind).toBe('express');
    expect(g.nav.route.length).toBeGreaterThan(2);
    g.clock.setHour(20.2);
    stepFor(g, 1);
    expect(g.nav.target.kind).toBe('hq');
    g.nav.enabled = false;
    g.step(1 / 60, IDLE);
    expect(g.nav.route).toHaveLength(0);
  });
});
