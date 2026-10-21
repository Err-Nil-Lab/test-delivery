import { describe, expect, it } from 'vitest';
import { newGame, stepFor, teleport, testConfig, PRESS_E } from './helpers.js';

function gameOnDay(day, config = testConfig()) {
  const game = newGame({ config });
  while (game.run.day < day) {
    game.endDay();
    game.run.lastReport.pass = true;
    game.advance();
  }
  return game;
}

function carrySmuggle(game, scamChance) {
  expect(game.packages.debugGiveSmuggle(game.car)).toBe(true);
  const pkg = game.packages.cargo.find((p) => p.type === 'smuggle');
  pkg.scamChance = scamChance;
  return pkg;
}

function deliver(game, pkg) {
  teleport(game, pkg.dest);
  game.step(1 / 60, PRESS_E);
}

describe('Paket selundupan (Chance)', () => {
  it('tidak muncul sebelum hari pertamanya (bila diatur)', () => {
    const config = testConfig();
    config.smuggle.chance = 1;
    config.smuggle.fromDay = 3;
    const game = gameOnDay(2, config);
    stepFor(game, 40);
    expect(game.packages.waiting.some((p) => p.type === 'smuggle')).toBe(false);
  });

  it('muncul di titik acak, maksimal 2 menunggu, persentase scam terlihat', () => {
    const config = testConfig();
    config.smuggle.chance = 1;
    config.curse.chance = 0;
    config.packages.zeus.chance = 0;
    const game = gameOnDay(3, config);
    stepFor(game, 40);
    const smuggles = game.packages.waiting.filter((p) => p.type === 'smuggle');
    expect(smuggles.length).toBeGreaterThan(0);
    expect(smuggles.length).toBeLessThanOrEqual(config.smuggle.maxWaiting);
    for (const p of smuggles) {
      expect(config.smuggle.scamOptions).toContain(p.scamChance);
      expect(p.pay).toBeGreaterThan(game.packages.safePay(p.pickup, p.dest));
    }
  });

  it('bayaran naik sebanding dengan risiko scam', () => {
    const game = gameOnDay(3);
    const ratio = (scam) => {
      const s = game.cfg.smuggle;
      return s.payBase + s.payPerScam * scam;
    };
    expect(ratio(0.4)).toBeGreaterThan(ratio(0.05));
  });

  it('legit: bayaran masuk, tanpa damage', () => {
    const game = gameOnDay(3);
    const pkg = carrySmuggle(game, 0);
    deliver(game, pkg);
    expect(game.packages.income).toBe(pkg.pay);
    expect(game.damage.events.some((e) => e.source === 'scam')).toBe(false);
  });

  it('scam: bayaran hangus, paket meledak (damage + van terlempar)', () => {
    const game = gameOnDay(3);
    const pkg = carrySmuggle(game, 1);
    const events = [];
    game.bus.on('smuggle_resolved', (e) => events.push(e));
    deliver(game, pkg);
    expect(events).toMatchObject([{ scam: true, pay: pkg.pay }]);
    expect(game.packages.income).toBe(0);
    expect(game.packages.cargo).toHaveLength(0);
    expect(game.damage.events.find((e) => e.source === 'scam').cost).toBe(game.cfg.smuggle.scamDamage);
    expect(game.car.speed).toBeGreaterThan(5);
    game.endDay();
    expect(game.run.lastReport.income).toBe(0);
    expect(game.run.lastReport.deliveredCount).toBe(0);
  });

  it('peluang scam yang tertulis benar-benar dipakai', () => {
    const game = gameOnDay(3);
    game.god = true;
    let scams = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const pkg = carrySmuggle(game, 0.2);
      deliver(game, pkg);
      if (pkg.scam) scams++;
      game.car.reset(game.car); // hentikan van sebelum pengantaran berikutnya
    }
    expect(scams / n).toBeGreaterThan(0.12);
    expect(scams / n).toBeLessThan(0.28);
  });
});
