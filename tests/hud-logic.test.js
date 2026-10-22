import { describe, expect, it } from 'vitest';
import { newGame, stepFor, teleport, PRESS_E } from './helpers.js';

describe('Profit hidup (bar profit di HUD)', () => {
  it('sama persis dengan profit di laporan akhir hari', () => {
    const game = newGame();
    game.packages.delivered.push({ pay: 240, type: 'safe' });
    game.bus.emit('drift_end', { seconds: 2, tier: 1 });
    stepFor(game, game.cfg.style.comboWindow + 0.2); // tip dibayar
    game.damage.add('collision', 45, 7);
    game.packages.debugGiveVariant(game.car, 'fragile'); // dibawa sampai akhir hari = denda
    const live = game.liveProfit;
    expect(live.income).toBe(240);
    expect(live.tips).toBe(20);
    expect(live.repair).toBe(45);
    expect(live.penalty).toBeGreaterThan(0);
    teleport(game, game.world.hq.spawn);
    game.endDay();
    expect(game.run.lastReport.profit).toBe(live.profit);
  });
});

describe('Hint kontekstual', () => {
  const hints = (game) => {
    const out = [];
    game.bus.on('hint', ({ text }) => out.push(text));
    return out;
  };

  it('muncul sekali saat mekanik pertama kali ditemui, tidak diulang setelah run diulang', () => {
    const game = newGame();
    const seen = hints(game);
    game.packages.debugGiveVariant(game.car, 'express');
    const pkg = game.packages.cargo[0];
    game.packages.cargo = [];
    game.packages.waiting.push({ ...pkg, pickup: { id: 'x', name: 'X', x: game.car.x, z: game.car.z } });
    game.step(1 / 60, PRESS_E);
    stepFor(game, 0.1);
    expect(seen.some((t) => t.includes('Paket kilat'))).toBe(true);
    // Run diulang: hint yang sama tidak muncul lagi.
    game.startRun();
    game.beginDay();
    expect(game.teach('express', 'lagi')).toBe(false);
  });

  it('aksi gaya pertama menjelaskan combo; drift dijelaskan saat van sudah melaju', () => {
    const game = newGame();
    const seen = hints(game);
    game.bus.emit('drift_end', { seconds: 1, tier: 0 });
    game.leftHQ = true;
    game.car.vx = 18;
    game.step(1 / 60, { throttle: 1, steer: 0 });
    stepFor(game, 1.2);
    expect(seen.some((t) => t.includes('combo'))).toBe(true);
    expect(seen.some((t) => t.includes('Space'))).toBe(true);
  });
});

describe('Tujuan aktif (strip objektif)', () => {
  it('tetap dihitung walau garis GPS dimatikan', () => {
    const game = newGame();
    game.nav.enabled = false;
    game.packages.debugGiveVariant(game.car, 'fragile');
    game.step(1 / 60, { throttle: 0, steer: 0 });
    expect(game.nav.target.kind).toBe('dest');
    expect(game.nav.target.pkg.type).toBe('fragile');
    expect(game.nav.route).toHaveLength(0);
  });
});
