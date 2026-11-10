import { describe, it, expect } from 'vitest';
import { newGame, stepFor, testConfig } from './helpers.js';
import { RUN_STATE } from '../src/sim/run.js';

function bossGame(seed = 3) {
  const game = newGame({ seed, config: testConfig() });
  game.run.day = game.cfg.charon.day;
  game.beginDay();
  return game;
}

describe('Hari boss Charon', () => {
  it('run punya 8 hari dan hari terakhir adalah Charon', () => {
    const game = newGame();
    expect(game.cfg.run.days).toBe(8);
    expect(game.cfg.charon.day).toBe(game.cfg.run.days);
  });

  it('semua paket identik (jiwa) dengan bayaran tetap, tanpa titah', () => {
    const game = bossGame();
    expect(game.isBoss).toBe(true);
    expect(game.run.modifier).toBeNull();
    expect(game.packages.waiting.length).toBeGreaterThanOrEqual(game.cfg.charon.packages.initialWaiting - 1);
    stepFor(game, 30);
    const all = [...game.packages.waiting, ...game.packages.cargo];
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) {
      expect(p.type).toBe('safe');
      expect(p.pay).toBe(game.cfg.charon.soulPay);
    }
  });

  it('Iris menambah jiwa di interval acak sampai menang', () => {
    const game = bossGame();
    const times = [];
    game.bus.on('iris_soul', () => times.push(game.runSeconds));
    stepFor(game, 90);
    expect(times.length).toBeGreaterThan(3);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    expect(new Set(gaps.map((g) => g.toFixed(1))).size).toBeGreaterThan(2);
    expect(game.race.winner).toBe('iris');
    expect(game.run.state).toBe(RUN_STATE.REPORT);
    expect(game.run.lastReport.pass).toBe(false);
    expect(game.run.lastReport.race.winner).toBe('iris');
  });

  it('Hermes menang kalau mencapai target lebih dulu', () => {
    const game = bossGame();
    game.race.iris = 0;
    game.race.timer = 9999;
    game.packages.delivered = Array.from({ length: game.cfg.charon.target }, (_, i) => ({ id: i, pay: 40 }));
    stepFor(game, 0.1);
    expect(game.run.state).toBe(RUN_STATE.REPORT);
    expect(game.run.lastReport.pass).toBe(true);
    expect(game.advance()).toBe('win');
  });

  it('hari biasa tidak punya balapan', () => {
    const game = newGame();
    expect(game.isBoss).toBe(false);
    expect(game.race.active).toBe(false);
    expect(game.packages.soulPay).toBeNull();
  });
});
