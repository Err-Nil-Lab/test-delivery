import { describe, expect, it } from 'vitest';
import { distance } from '../src/sim/world.js';
import { newGame, stepFor, teleport, IDLE, PRESS_E, testConfig } from './helpers.js';

describe('Paket dan cargo', () => {
  it('Day 1 run pertama: paket Zeus dijamin menunggu di Gerbang Istana Zeus', () => {
    const game = newGame();
    const zeus = game.packages.waiting.find((p) => p.type === 'zeus');
    expect(zeus).toBeDefined();
    expect(zeus.pickup).toBe(game.world.zeusPickup);
    expect(zeus.dest).toBe(game.world.plant.dropoff);
  });

  it('paket Zeus selalu diambil di Gerbang Istana Zeus', () => {
    const config = testConfig();
    config.packages.zeus.chance = 1;
    const game = newGame({ seed: 9, config });
    game.endDay();
    game.run.lastReport.pass = true;
    game.advance();
    const zeus = game.packages.waiting.find((p) => p.type === 'zeus');
    expect(zeus.pickup).toBe(game.world.zeusPickup);
  });

  it('harus berhenti dulu untuk mengambil paket', () => {
    const game = newGame();
    const zeus = game.packages.waiting.find((p) => p.type === 'zeus');
    teleport(game, zeus.pickup);
    game.car.vz = 10;
    expect(game.interact().kind).toBe('moving');
    expect(game.packages.cargo).toHaveLength(0);
  });

  it('paket Zeus memakan 2 slot dan memberi blessing selama dibawa', () => {
    const game = newGame();
    const zeus = game.packages.waiting.find((p) => p.type === 'zeus');
    teleport(game, zeus.pickup);
    game.step(1 / 60, PRESS_E);
    expect(game.packages.cargo).toEqual([zeus]);
    expect(game.packages.slotsUsed).toBe(2);
    expect(game.packages.slotsFree).toBe(1);
    expect(game.packages.blessed).toBe(true);
  });

  it('blessing hilang tepat saat paket Zeus diantar di Electrical Plant', () => {
    const game = newGame();
    const events = [];
    game.bus.on('blessing_lost', () => events.push('blessing_lost'));
    const zeus = game.packages.waiting.find((p) => p.type === 'zeus');
    teleport(game, zeus.pickup);
    game.step(1 / 60, PRESS_E);
    teleport(game, game.world.plant.dropoff);
    game.step(1 / 60, PRESS_E);
    expect(game.packages.blessed).toBe(false);
    expect(game.packages.income).toBe(zeus.pay);
    expect(events).toEqual(['blessing_lost']);
  });

  it('menolak paket bila slot tidak cukup', () => {
    const game = newGame();
    const zeus = game.packages.waiting.find((p) => p.type === 'zeus');
    // Isi 2 slot dengan paket 1-slot, sisakan 1 slot: Zeus (2 slot) harus ditolak.
    const safes = game.packages.waiting.filter((p) => p.type !== 'zeus' && p.slots === 1).slice(0, 2);
    expect(safes).toHaveLength(2);
    game.packages.waiting = game.packages.waiting.filter((p) => !safes.includes(p));
    game.packages.cargo.push(...safes);
    teleport(game, zeus.pickup);
    const result = game.interact();
    expect(result.kind).toBe('full');
    expect(game.packages.waiting).toContain(zeus);
  });

  it('jumlah paket menunggu tidak pernah melewati batas, dan selalu ada paket dekat van', () => {
    const game = newGame({ seed: 3 });
    const { maxWaiting, nearRadius, nearCheckInterval } = game.cfg.packages;
    for (let t = 0; t < 90; t += 1) {
      // Pindahkan van ke titik acak di jalan setiap detik.
      teleport(game, game.rng.pick(game.world.points));
      stepFor(game, 1);
      expect(game.packages.waiting.length).toBeLessThanOrEqual(maxWaiting);
    }
    stepFor(game, nearCheckInterval + 0.1);
    expect(game.packages.waiting.some((p) => distance(p.pickup, game.car) <= nearRadius)).toBe(true);
  });

  it('paket Zeus paling banyak muncul sekali per hari', () => {
    const config = testConfig();
    config.packages.zeus.chance = 1;
    const game = newGame({ seed: 5, config });
    let zeusSpawns = 0;
    game.bus.on('package_spawned', ({ packageType }) => {
      if (packageType === 'zeus') zeusSpawns += 1;
    });
    stepFor(game, 100);
    expect(zeusSpawns).toBe(0); // Zeus hari ini sudah dipakai oleh skrip Day 1
    game.endDay();
    game.run.lastReport.pass = true;
    game.advance();
    stepFor(game, 100);
    expect(game.packages.zeusSpawnedToday).toBe(1);
  });

  it('bayaran paket Safe naik dengan jarak dan dibulatkan ke $5', () => {
    const game = newGame();
    for (const p of game.packages.waiting.filter((q) => q.type === 'safe')) {
      expect(p.pay % 5).toBe(0);
      expect(p.pay).toBeLessThanOrEqual(game.cfg.packages.safe.maxPay);
      expect(distance(p.pickup, p.dest)).toBeGreaterThanOrEqual(game.cfg.packages.minTripDistance);
    }
  });

  it('paket menunggu kedaluwarsa setelah lifetime (kecuali Zeus tutorial)', () => {
    const game = newGame();
    const safe = game.packages.waiting.find((p) => p.type === 'safe');
    stepFor(game, game.cfg.packages.waitingLifetime + 0.5, IDLE);
    expect(game.packages.waiting).not.toContain(safe);
    expect(game.packages.waiting.some((p) => p.type === 'zeus')).toBe(true);
  });

  it('sejak Day 1 semua jenis paket langsung ada di map', () => {
    const game = newGame();
    const types = new Set(game.packages.waiting.map((p) => p.type));
    expect([...types].sort()).toEqual(['curse', 'safe', 'smuggle', 'zeus']);
  });
});
