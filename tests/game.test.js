import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game.js';
import { RUN_STATE } from '../src/sim/run.js';
import { newGame, stepFor, teleport, IDLE, PRESS_E, testConfig } from './helpers.js';

function returnToHQ(game) {
  teleport(game, game.world.ref.outsideHQ);
  game.step(1 / 60, IDLE);
  teleport(game, game.world.hq.spawn, Math.PI);
}

describe('Alur run', () => {
  it('run pertama dimulai dari intro, lalu Day 1 yang di-script', () => {
    const game = new Game({ seed: 1, config: testConfig() });
    game.startRun();
    expect(game.run.state).toBe(RUN_STATE.INTRO);
    game.beginDay();
    expect(game.run.state).toBe(RUN_STATE.DAY);
    expect(game.run.scripted).toBe(true);
    expect(game.run.quota).toBe(game.cfg.run.quotas[0]);
  });

  it('E di HQ tidak mengakhiri hari sebelum van sempat keluar', () => {
    const game = newGame();
    expect(game.interact()).toBeNull();
    expect(game.run.state).toBe(RUN_STATE.DAY);
  });

  it('pulang sebelum senja butuh konfirmasi E dua kali', () => {
    const game = newGame();
    returnToHQ(game);
    game.step(1 / 60, PRESS_E);
    expect(game.run.state).toBe(RUN_STATE.DAY);
    expect(game.earlyEndPending).toBe(true);
    game.step(1 / 60, PRESS_E);
    expect(game.run.state).toBe(RUN_STATE.REPORT);
  });

  it('konfirmasi pulang awal kedaluwarsa', () => {
    const game = newGame();
    returnToHQ(game);
    game.step(1 / 60, PRESS_E);
    stepFor(game, game.cfg.time.earlyEndConfirmSeconds + 0.5);
    game.step(1 / 60, PRESS_E);
    expect(game.run.state).toBe(RUN_STATE.DAY);
  });

  it('setelah senja, satu E di HQ langsung mengakhiri hari', () => {
    const game = newGame();
    returnToHQ(game);
    game.clock.setHour(18.5);
    game.step(1 / 60, PRESS_E);
    expect(game.run.state).toBe(RUN_STATE.REPORT);
    expect(game.run.lastReport.towed).toBe(false);
  });

  it('tidak pulang sampai 24:00 → diderek, biaya derek masuk laporan', () => {
    const game = newGame();
    teleport(game, game.world.ref.outsideHQ);
    game.god = true;
    game.clock.setHour(23.9);
    stepFor(game, 2);
    expect(game.midnight.active).toBe(true); // petir raksasa dulu, baru diderek
    stepFor(game, 20);
    expect(game.run.state).toBe(RUN_STATE.REPORT);
    expect(game.run.lastReport.towFee).toBe(game.cfg.damage.towFee);
  });

  it('lolos quota → hari berikutnya dengan quota lebih tinggi', () => {
    const game = newGame();
    const zeus = game.packages.waiting.find((p) => p.type === 'zeus');
    teleport(game, zeus.pickup);
    game.step(1 / 60, PRESS_E);
    teleport(game, game.world.plant.dropoff);
    game.step(1 / 60, PRESS_E);
    game.god = true;
    returnToHQ(game);
    game.clock.setHour(18.5);
    game.step(1 / 60, PRESS_E);
    expect(game.run.lastReport.income).toBe(zeus.pay);
    expect(game.run.lastReport.pass).toBe(true);
    expect(game.advance()).toBe('next');
    expect(game.run.day).toBe(2);
    expect(game.run.quota).toBeGreaterThan(game.cfg.run.quotas[0]);
    expect(game.run.scripted).toBe(false);
    expect(game.run.wallet).toBe(zeus.pay);
  });

  it('gagal quota → ulang dari Day 1 tanpa skrip tutorial', () => {
    const game = newGame();
    game.endDay();
    expect(game.run.lastReport.pass).toBe(false);
    expect(game.advance()).toBe('gameover');
    expect(game.run.state).toBe(RUN_STATE.DAY);
    expect(game.run.day).toBe(1);
    expect(game.run.runCount).toBe(2);
    expect(game.run.scripted).toBe(false);
    // Paket Zeus tutorial (tidak pernah kedaluwarsa) hanya ada di Day 1 run pertama.
    expect(game.packages.waiting.some((p) => p.type === 'zeus' && p.lifetime === Infinity)).toBe(false);
  });

  it('lolos 7 hari → menang', () => {
    const game = newGame();
    for (let day = 1; day <= 7; day++) {
      expect(game.run.day).toBe(day);
      game.endDay();
      game.run.lastReport.pass = true;
      const outcome = game.advance();
      expect(outcome).toBe(day === 7 ? 'win' : 'next');
    }
    expect(game.run.state).toBe(RUN_STATE.WIN);
  });

  it('tabrakan keras menambah damage, dan damage tidak terlihat sampai laporan', () => {
    const game = newGame();
    // Van melaju ke utara menabrak sebuah gedung kota dari sisi selatannya.
    const b = game.world.buildings.find((q) => q.kind === 'city');
    teleport(game, { x: b.cx, z: b.cz + b.hd + 3 }, Math.PI);
    game.car.vz = -18;
    stepFor(game, 1);
    expect(game.damage.events.some((e) => e.source === 'collision')).toBe(true);
    game.endDay();
    expect(game.run.lastReport.damageLoss).toBe(game.damage.total);
  });

  it('telemetri mencatat pickup, deliver, dan blessing hilang', () => {
    const game = newGame();
    const zeus = game.packages.waiting.find((p) => p.type === 'zeus');
    teleport(game, zeus.pickup);
    game.step(1 / 60, PRESS_E);
    teleport(game, game.world.plant.dropoff);
    game.step(1 / 60, PRESS_E);
    const types = game.telemetry.entries.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['run_start', 'day_start', 'pickup', 'blessing_gained', 'deliver', 'blessing_lost']));
    const deliver = game.telemetry.entries.find((e) => e.type === 'deliver');
    expect(deliver).toMatchObject({ day: 1, packageType: 'zeus', pay: zeus.pay });
  });
});

describe('Drift', () => {
  it('ngepot lama di jalan memancarkan drift_start, drift_end, dan drift_boost', () => {
    const game = newGame();
    game.god = true;
    const seen = [];
    for (const e of ['drift_start', 'drift_end', 'drift_boost']) game.bus.on(e, (p) => seen.push({ e, ...p }));
    // Lapangan datar & kosong: padang Minotaur dimatikan supaya tidak diganggu.
    game.run.day = 0;
    teleport(game, game.world.ref.meadow, 0);
    game.car.vz = game.cfg.car.maxSpeed;
    for (let i = 0; i < 120; i++) game.step(1 / 60, { throttle: 1, steer: 1, handbrake: true });
    for (let i = 0; i < 60; i++) game.step(1 / 60, { throttle: 1, steer: 0 });
    expect(seen[0].e).toBe('drift_start');
    const end = seen.find((s) => s.e === 'drift_end');
    expect(end.tier).toBeGreaterThanOrEqual(0);
    expect(seen.some((s) => s.e === 'drift_boost')).toBe(true);
  });
});
