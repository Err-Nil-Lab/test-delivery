import { describe, expect, it } from 'vitest';
import { UPGRADES, DAY_MODS } from '../src/sim/upgrades.js';
import { newGame, stepFor, teleport, testConfig } from './helpers.js';

// Selesaikan hari dengan profit tertentu (lolos quota), lalu masuk ke hari berikutnya.
function passDay(game, profit) {
  game.packages.delivered.push({ pay: profit, type: 'safe' });
  game.endDay();
}

describe('Bengkel Hephaestus', () => {
  it('profit di atas quota masuk Kas bengkel', () => {
    const game = newGame();
    passDay(game, 500);
    const r = game.run.lastReport;
    expect(r.pass).toBe(true);
    expect(game.run.savings).toBe(r.profit - r.quota);
  });

  it('menawarkan upgrade berbeda yang belum dimiliki; beli memotong Kas', () => {
    const game = newGame();
    passDay(game, 900);
    const offers = game.shopOffers();
    expect(offers).toHaveLength(game.cfg.meta.shopOffers);
    expect(new Set(offers).size).toBe(offers.length);
    const before = game.run.savings;
    const id = offers[0];
    expect(game.buyUpgrade(id)).toBe(true);
    expect(game.run.savings).toBe(before - UPGRADES[id].price);
    expect(game.buyUpgrade(id)).toBe(false); // tidak bisa dibeli dua kali
    expect(game.buyUpgrade('tidak-ada')).toBe(false);
  });

  it('tidak bisa membeli tanpa Kas cukup', () => {
    const game = newGame();
    passDay(game, game.run.quota); // tepat quota: Kas 0
    expect(game.buyUpgrade(game.shopOffers()[0])).toBe(false);
  });

  it('upgrade berlaku di hari berikutnya dan hilang saat run diulang', () => {
    const game = newGame();
    passDay(game, 900);
    game.run.offers = ['rack', 'engine'];
    game.run.offersDay = game.run.day;
    game.buyUpgrade('rack');
    game.buyUpgrade('engine');
    const baseSpeed = game.baseCfg.car.maxSpeed;
    game.advance();
    expect(game.cfg.packages.capacity).toBe(4);
    expect(game.cfg.car.maxSpeed).toBeCloseTo(baseSpeed * 1.1);
    expect(game.packages.slotsFree).toBe(4);
    // Gagal quota → ulang dari Day 1 tanpa upgrade.
    game.endDay();
    game.advance();
    game.beginDay();
    expect(game.run.upgrades).toHaveLength(0);
    expect(game.cfg.packages.capacity).toBe(3);
  });

  it('penangkal petir menahan satu sambaran per hari', () => {
    const game = newGame();
    passDay(game, 900);
    game.run.offers = ['rod'];
    game.run.offersDay = game.run.day;
    game.buyUpgrade('rod');
    game.advance();
    const blocked = [];
    game.bus.on('strike_hit', (e) => blocked.push(e));
    const strike = { kind: 'storm', x: game.car.x, z: game.car.z, radius: 3.5 };
    const realUpdate = game.hazards.update.bind(game.hazards);
    game.hazards.update = () => [strike];
    teleport(game, game.world.ref.cityRoad);
    game.step(1 / 60, { throttle: 0, steer: 0 });
    expect(blocked[0].rod).toBe(true);
    expect(game.damage.total).toBe(0);
    game.step(1 / 60, { throttle: 0, steer: 0 });
    game.hazards.update = realUpdate;
    expect(blocked[1].blocked).toBe(false);
    expect(game.damage.total).toBeGreaterThan(0);
  });
});

describe('Titah dewa harian', () => {
  it('mulai Day 2 ada titah, diumumkan, tidak sama dengan kemarin, dan efeknya hanya sehari', () => {
    const game = newGame();
    const announced = [];
    game.bus.on('day_modifier', (e) => announced.push(e.id));
    expect(game.run.modifier).toBeNull();
    let prev = null;
    for (let day = 2; day <= 6; day++) {
      passDay(game, 5000);
      game.advance();
      const id = game.run.modifier;
      expect(DAY_MODS[id]).toBeTruthy();
      expect(id).not.toBe(prev);
      prev = id;
      // Efek hanya untuk titah hari ini, nilai lain kembali ke aslinya.
      expect(game.cfg.time.stormHour).toBe(id === 'zeusAngry' ? game.baseCfg.time.stormHour - 1 : game.baseCfg.time.stormHour);
      expect(game.cfg.car.lateralGrip).toBeCloseTo(game.baseCfg.car.lateralGrip * (id === 'poseidon' ? 0.55 : 1));
    }
    expect(announced).toHaveLength(5);
  });

  it('pengali bayaran berlaku untuk paket baru, kecuali paket Zeus', () => {
    const game = newGame();
    game.cfg.packages.payMultiplier = 1.2;
    const p = game.world.points[0];
    const pkg = game.packages.makePackage('safe', p);
    expect(pkg.pay).toBe(Math.round((Math.round(game.packages.safePay(p, pkg.dest) / 5) * 5 * 1.2) / 5) * 5);
    expect(game.packages.makePackage('zeus', game.world.zeusPickup).pay).toBe(game.cfg.packages.zeus.pay);
  });
});

describe('Iris Express', () => {
  const rivalGame = () => {
    const config = testConfig({ npc: { enabled: true } });
    config.npc.rival.stealChance = 1;
    config.npc.pedestrians.enabled = false;
    config.npc.animals.enabled = false;
    const game = newGame({ config });
    game.god = true;
    return game;
  };

  it('ada minimal dua van saingan', () => {
    const game = rivalGame();
    expect(game.traffic.cars.filter((c) => c.kind === 'rival').length).toBeGreaterThanOrEqual(2);
  });

  it('mencuri paket di depannya (setelah diberi peringatan), lalu menjatuhkannya saat disenggol', () => {
    const game = rivalGame();
    const seen = [];
    for (const e of ['package_stolen', 'package_dropped']) game.bus.on(e, () => seen.push(e));
    const r = game.traffic.cars.find((c) => c.kind === 'rival' && c.lane.road.kind !== 'mountain');
    game.traffic.cars = [r];
    const pkg = game.packages.waiting.find((p) => game.cfg.npc.rival.stealable.includes(p.type));
    game.packages.waiting = [pkg];
    pkg.age = 20;
    // Paket tepat di depan van saingan, jauh dari van pemain.
    pkg.pickup = { id: 'test', name: 'Tes', x: r.x + r.dirX * 18, z: r.z + r.dirZ * 18 };
    game.step(1 / 60, { throttle: 0, steer: 0 });
    expect(pkg.threat).toBe(r); // peringatan dulu
    stepFor(game, 3);
    expect(seen).toContain('package_stolen');
    expect(game.packages.waiting).not.toContain(pkg);
    expect(r.loot).toContain(pkg);
    // Senggol dari samping.
    r.cruise = 0;
    r.speed = 0;
    const h = r.heading + Math.PI / 2;
    game.car.reset({ x: r.x - Math.sin(h) * 6, z: r.z - Math.cos(h) * 6, heading: h });
    game.car.vx = Math.sin(h) * 16;
    game.car.vz = Math.cos(h) * 16;
    stepFor(game, 1, { throttle: 1, steer: 0 });
    expect(seen).toContain('package_dropped');
    expect(game.packages.waiting).toContain(pkg);
    expect(pkg.pickup.name).toBe('Paket jatuh');
  });

  it('tidak mencuri paket yang sedang didekati pemain', () => {
    const game = rivalGame();
    const r = game.traffic.cars.find((c) => c.kind === 'rival');
    game.traffic.cars = [r];
    const pkg = game.packages.waiting.find((p) => game.cfg.npc.rival.stealable.includes(p.type));
    game.packages.waiting = [pkg];
    pkg.age = 20;
    pkg.pickup = { id: 'test', name: 'Tes', x: r.x + r.dirX * 4, z: r.z + r.dirZ * 4 };
    game.car.reset({ x: pkg.pickup.x + 5, z: pkg.pickup.z, heading: 0 });
    stepFor(game, 1);
    expect(game.packages.waiting).toContain(pkg);
  });
});
