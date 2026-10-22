import { describe, expect, it } from 'vitest';
import { RUN_STATE } from '../src/sim/run.js';
import { newGame, stepFor, teleport, IDLE } from './helpers.js';

const outside = (game) => {
  teleport(game, game.world.ref.cityRoad);
  game.packages.cargo = [];
};
const record = (game) => {
  const seen = [];
  for (const e of ['midnight_start', 'midnight_warning', 'midnight_strike', 'midnight_tow_call', 'midnight_tow_arrive', 'midnight_tow_start', 'midnight_done', 'strike_hit', 'day_end'])
    game.bus.on(e, (p) => seen.push({ e, ...p }));
  return seen;
};

describe('Tengah malam', () => {
  it('di luar HQ: urutan peringatan → petir raksasa → lumpuh → derek → laporan diderek', () => {
    const game = newGame();
    game.god = true;
    outside(game);
    const seen = record(game);
    game.clock.setHour(23.99);
    stepFor(game, 3);
    expect(game.run.state).toBe(RUN_STATE.DAY); // hari belum berakhir langsung
    expect(game.midnight.active).toBe(true);
    stepFor(game, 25);
    const order = seen.map((s) => s.e).filter((e) => e.startsWith('midnight') || e === 'day_end');
    expect(order).toEqual(['midnight_start', 'midnight_warning', 'midnight_strike', 'midnight_tow_call', 'midnight_tow_arrive', 'midnight_tow_start', 'midnight_done', 'day_end']);
    expect(game.run.state).toBe(RUN_STATE.REPORT);
    expect(game.run.lastReport.towed).toBe(true);
    expect(game.run.lastReport.towFee).toBe(game.cfg.damage.towFee);
  });

  it('kontrol dikunci, jam berhenti, dan sambaran pasti kena meski ada blessing & penangkal petir', () => {
    const game = newGame();
    outside(game);
    game.packages.debugGiveZeus(game.car); // blessing aktif
    game.rodCharges = 3;
    game.clock.setHour(23.99);
    const gas = { throttle: 1, steer: 1, interact: false };
    stepFor(game, 0.2, gas);
    const hour = game.clock.hour;
    stepFor(game, 2.5, gas); // lewat masa peringatan → sambaran
    expect(game.car.paralyzed).toBe(true);
    expect(game.car.speed).toBeLessThan(1);
    expect(game.rodCharges).toBe(3); // penangkal petir tidak terpakai
    expect(game.clock.hour).toBeCloseTo(hour, 1); // jam berhenti
    const x = game.car.x;
    stepFor(game, 0.5, gas);
    expect(Math.abs(game.car.x - x)).toBeLessThan(0.5); // gas tidak berpengaruh
  });

  it('van diseret mobil derek menuju HQ dan berakhir di sana', () => {
    const game = newGame();
    game.god = true;
    outside(game);
    const start = Math.hypot(game.car.x - game.world.hq.spawn.x, game.car.z - game.world.hq.spawn.z);
    game.clock.setHour(23.99);
    stepFor(game, 3);
    let towing = false;
    for (let i = 0; i < 60 * 14 && game.midnight.phase !== 'done'; i++) {
      game.step(1 / 60, IDLE);
      if (game.midnight.phase === 'tow') towing = true;
    }
    expect(towing).toBe(true);
    const end = Math.hypot(game.car.x - game.world.hq.spawn.x, game.car.z - game.world.hq.spawn.z);
    expect(end).toBeLessThan(Math.max(15, start * 0.15));
    expect(game.midnight.truck.hooked).toBe(true);
  });

  it('sudah di HQ saat 24:00: aman, hari berakhir normal tanpa sambaran dan derek', () => {
    const game = newGame();
    teleport(game, game.world.ref.outsideHQ);
    game.step(1 / 60, IDLE);
    teleport(game, game.world.hq.spawn);
    const seen = record(game);
    game.clock.setHour(23.99);
    stepFor(game, 2);
    expect(game.run.state).toBe(RUN_STATE.REPORT);
    expect(game.run.lastReport.towed).toBe(false);
    expect(game.run.lastReport.towFee).toBe(0);
    expect(seen.some((s) => s.e === 'midnight_start')).toBe(false);
  });

  it('paket yang masih dibawa tetap kena denda belum diantar', () => {
    const game = newGame();
    game.god = true;
    outside(game);
    game.packages.debugGiveVariant(game.car, 'express');
    game.clock.setHour(23.99);
    stepFor(game, 30);
    expect(game.run.lastReport.undelivered.length).toBeGreaterThan(0);
  });

  it('hari berikutnya bersih: van tidak lagi lumpuh dan urutan di-reset', () => {
    const game = newGame();
    game.god = true;
    outside(game);
    game.clock.setHour(23.99);
    stepFor(game, 30);
    game.run.lastReport.pass = true;
    game.advance();
    expect(game.car.paralyzed).toBe(false);
    expect(game.midnight.phase).toBe('idle');
    expect(game.run.state).toBe(RUN_STATE.DAY);
  });

  it('bisa dimatikan lewat config: kembali ke derek instan', () => {
    const game = newGame();
    game.cfg.midnight.enabled = false;
    outside(game);
    game.clock.setHour(23.99);
    stepFor(game, 2);
    expect(game.run.lastReport.towed).toBe(true);
    expect(game.midnight.phase).toBe('idle');
  });
});
