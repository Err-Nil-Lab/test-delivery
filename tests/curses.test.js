import { describe, expect, it } from 'vitest';
import { CURSE_IDS, CURSES } from '../src/sim/curses.js';
import { MINOTAUR_STATE } from '../src/sim/minotaurs.js';
import { distance } from '../src/sim/world.js';
import { newGame, stepFor, teleport, testConfig, IDLE, PRESS_E } from './helpers.js';

// Lompat ke hari tertentu (lewat laporan yang dipaksa lolos).
function gameOnDay(day, config = testConfig()) {
  const game = newGame({ config });
  while (game.run.day < day) {
    game.endDay();
    game.run.lastReport.pass = true;
    game.advance();
  }
  return game;
}

function carry(game, curse) {
  expect(game.packages.debugGiveCurse(game.car, curse)).toBe(true);
  return game.packages.cargo.find((p) => p.curse === curse);
}

function deliver(game, pkg) {
  teleport(game, pkg.dest);
  game.step(1 / 60, PRESS_E);
}

describe('Kategori Curse', () => {
  it('belum muncul sebelum hari pertamanya', () => {
    const config = testConfig();
    config.curse.chance = 1;
    config.curse.fromDay = 2;
    const game = newGame({ config });
    stepFor(game, 60);
    expect(game.packages.waiting.some((p) => p.type === 'curse')).toBe(false);
  });

  it('muncul mulai hari pertamanya, maksimal 1 menunggu, bayaran lebih tinggi dari Safe', () => {
    const config = testConfig();
    config.curse.chance = 1;
    config.packages.zeus.chance = 0;
    const game = gameOnDay(2, config);
    stepFor(game, 30);
    const curses = game.packages.waiting.filter((p) => p.type === 'curse');
    expect(curses).toHaveLength(1);
    const c = curses[0];
    expect(CURSE_IDS).toContain(c.curse);
    expect(c.slots).toBe(1);
    expect(distance(c.pickup, c.dest)).toBeGreaterThanOrEqual(config.curse.minTripDistance);
    expect(c.pay).toBeGreaterThan(game.packages.safePay(c.pickup, c.dest));
  });

  it('diambil di tempat bertema dewanya bila tersedia', () => {
    const game = gameOnDay(2);
    for (const id of ['dionysus', 'aphrodite', 'ares']) {
      game.packages.waiting = [];
      const pkg = game.packages.spawnCurse(id);
      expect(pkg.pickup.name).toBe(CURSES[id].pickupName);
      expect(pkg.dest.name).toBe(CURSES[id].destName);
    }
  });

  it.each(CURSE_IDS)('efek %s aktif selama dibawa dan hilang saat diantar', (id) => {
    const game = gameOnDay(2);
    const lifted = [];
    game.bus.on('curse_lifted', (e) => lifted.push(e.curse));
    const pkg = carry(game, id);
    game.step(1 / 60, IDLE);
    expect(game.effects.curses).toEqual([id]);
    deliver(game, pkg);
    game.step(1 / 60, IDLE);
    expect(game.effects.curses).toEqual([]);
    expect(lifted).toEqual([id]);
  });

  it('Chronos: jam berjalan 2× selama paket dibawa', () => {
    const game = gameOnDay(2);
    const before = game.clock.elapsed;
    stepFor(game, 1);
    const normal = game.clock.elapsed - before;
    carry(game, 'chronos');
    const mid = game.clock.elapsed;
    stepFor(game, 1);
    expect(game.clock.elapsed - mid).toBeCloseTo(normal * game.cfg.curse.effects.chronos.clockMultiplier, 1);
  });

  it('Hades: pandangan menyempit', () => {
    const game = gameOnDay(2);
    carry(game, 'hades');
    game.step(1 / 60, IDLE);
    expect(game.effects.visionRadius).toBe(game.cfg.curse.effects.hades.visionRadius);
  });

  describe('Dionysus', () => {
    const drive = (config, steerAfter) => {
      const game = gameOnDay(2, config);
      teleport(game, game.world.ref.cityRoad, Math.PI / 2);
      carry(game, 'dionysus');
      game.car.vx = 15;
      const start = game.car.heading;
      stepFor(game, steerAfter, { throttle: 1, steer: 0, interact: false });
      const beforeSteer = game.car.heading;
      stepFor(game, 0.15, { throttle: 1, steer: 1, interact: false });
      return { game, start, beforeSteer, after: game.car.heading };
    };

    it('setir tertunda', () => {
      const config = testConfig();
      config.curse.effects.dionysus.wobble = 0;
      const { beforeSteer, after } = drive(config, 0.1);
      // 0,15 detik setelah setir ditekan van belum berbelok (delay 0,25 detik).
      expect(after).toBeCloseTo(beforeSteer, 5);
    });

    it('van oleng sendiri walau setir lurus', () => {
      const config = testConfig();
      config.curse.effects.dionysus.steerDelay = 0;
      const { start, beforeSteer } = drive(config, 0.5);
      expect(Math.abs(beforeSteer - start)).toBeGreaterThan(0.01);
    });
  });

  describe('Minotaur di bawah curse', () => {
    const setup = (curse) => {
      const game = gameOnDay(2);
      const m = game.minotaurs.list.find((q) => q.id === 'east');
      const t = m.territory;
      m.x = (t.minX + t.maxX) / 2;
      m.z = (t.minZ + t.maxZ) / 2;
      m.state = MINOTAUR_STATE.WANDER;
      m.cooldown = 0;
      if (curse) carry(game, curse);
      return { game, m };
    };

    it('Ares: melihat van dari jauh dan ancang-ancang lebih singkat', () => {
      const far = (game, m) => teleport(game, { x: m.x, z: m.z + game.cfg.minotaur.detectRadius + 8 });
      const calm = setup(null);
      far(calm.game, calm.m);
      calm.game.step(1 / 60, IDLE);
      expect(calm.m.state).toBe(MINOTAUR_STATE.WANDER);

      const angry = setup('ares');
      far(angry.game, angry.m);
      angry.game.step(1 / 60, IDLE);
      expect(angry.m.state).toBe(MINOTAUR_STATE.WINDUP);
      expect(angry.m.timer).toBeLessThan(angry.game.cfg.minotaur.windup);
    });

    it('Aphrodite: Minotaur membuntuti tanpa menyeruduk, menyundul pelan saat van berhenti', () => {
      const { game, m } = setup('aphrodite');
      teleport(game, { x: m.x, z: m.z + 10 });
      const hits = [];
      game.bus.on('minotaur_hit', (h) => hits.push(h));
      stepFor(game, 3);
      expect(m.state).toBe(MINOTAUR_STATE.FOLLOW);
      expect(hits).toHaveLength(0);
      expect(distance(m, game.car)).toBeLessThan(game.cfg.minotaur.radius + game.car.radius + 2);
      expect(game.damage.events.some((e) => e.source === 'minotaur')).toBe(false);

      // Van menjauh keluar padang: Minotaur ikut keluar wilayahnya.
      teleport(game, { x: m.territory.maxX + 20, z: m.z });
      stepFor(game, 3);
      expect(m.x).toBeGreaterThan(m.territory.maxX);
    });

    it('Aphrodite: setelah paket diantar Minotaur kembali normal', () => {
      const { game, m } = setup('aphrodite');
      teleport(game, { x: m.x, z: m.z + 10 });
      stepFor(game, 1);
      expect(m.state).toBe(MINOTAUR_STATE.FOLLOW);
      const pkg = game.packages.cargo.find((p) => p.curse === 'aphrodite');
      deliver(game, pkg);
      stepFor(game, 0.1);
      expect(m.state).not.toBe(MINOTAUR_STATE.FOLLOW);
    });
  });

  it('telemetri mencatat curse didapat dan terangkat beserta lama dibawa', () => {
    const game = gameOnDay(2);
    const pkg = carry(game, 'chronos');
    stepFor(game, 2);
    deliver(game, pkg);
    const lifted = game.telemetry.entries.find((e) => e.type === 'curse_lifted');
    expect(lifted.curse).toBe('chronos');
    expect(lifted.heldSeconds).toBeGreaterThan(1.9);
  });
});
