import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world.js';
import { newGame, stepFor, teleport, PRESS_E } from './helpers.js';

const world = createWorld();
const ZONE_POINT = world.ref.serpentineTop; // jalan gunung di dalam zona Zeus
const CITY_POINT = world.ref.cityRoad; // jalan utama di luar zona

function strikeOnCar(game, kind = 'zone') {
  const s = game.hazards.spawn(kind, game.car.x, game.car.z, 0.1);
  game.hazards.strikes = [s];
  return s;
}

describe('Petir dan badai', () => {
  it('titik acuan berada di dalam / di luar zona', () => {
    expect(world.inZeusZone(ZONE_POINT.x, ZONE_POINT.z)).toBe(true);
    expect(world.inZeusZone(CITY_POINT.x, CITY_POINT.z)).toBe(false);
  });

  it('petir di zona Zeus memberi damage bila van tidak membawa blessing', () => {
    const game = newGame();
    teleport(game, ZONE_POINT);
    strikeOnCar(game);
    game.hazards.zoneTimer = 99;
    stepFor(game, 0.2);
    expect(game.damage.events.map((e) => e.source)).toEqual(['lightning']);
  });

  it('blessing Zeus membuat van kebal petir', () => {
    const game = newGame();
    const zeus = game.packages.waiting.find((p) => p.type === 'zeus');
    teleport(game, zeus.pickup);
    game.step(1 / 60, PRESS_E);
    const hits = [];
    game.bus.on('strike_hit', (h) => hits.push(h));
    teleport(game, ZONE_POINT);
    strikeOnCar(game);
    game.hazards.zoneTimer = 99;
    stepFor(game, 0.2);
    expect(hits).toEqual([{ kind: 'zone', blocked: true }]);
    expect(game.damage.total).toBe(0);
  });

  it('petir zona hanya mengincar van saat van berada di zona', () => {
    const game = newGame();
    teleport(game, CITY_POINT);
    stepFor(game, 10);
    const kinds = new Set();
    game.bus.on('strike_warning', (s) => kinds.add(s.kind));
    stepFor(game, 10);
    expect(kinds.has('zone')).toBe(false);
    expect(kinds.has('ambient')).toBe(true);
    teleport(game, ZONE_POINT);
    stepFor(game, 3);
    expect(kinds.has('zone')).toBe(true);
  });

  it('badai baru memburu setelah 20:00, dan berhenti di HQ', () => {
    const game = newGame();
    const storm = [];
    game.bus.on('strike_warning', (s) => s.kind === 'storm' && storm.push(s));
    teleport(game, CITY_POINT);
    game.clock.setHour(19.5);
    stepFor(game, 3);
    expect(storm).toHaveLength(0);
    game.clock.setHour(20);
    stepFor(game, 5);
    expect(storm.length).toBeGreaterThan(1);
    // Sambaran badai diarahkan ke posisi van.
    expect(Math.hypot(storm[0].x - CITY_POINT.x, storm[0].z - CITY_POINT.z)).toBeLessThan(game.cfg.storm.targetSpread + 0.01);

    const count = storm.length;
    teleport(game, game.world.hq.spawn, Math.PI);
    stepFor(game, 5);
    expect(storm.length).toBe(count);
  });

  it('jeda badai makin rapat seiring waktu', () => {
    const game = newGame();
    expect(game.hazards.stormInterval(0)).toBe(game.cfg.storm.startInterval);
    expect(game.hazards.stormInterval(game.cfg.storm.rampSeconds)).toBe(game.cfg.storm.minInterval);
  });

  it('setiap sambaran selalu didahului telegraph', () => {
    const game = newGame();
    teleport(game, ZONE_POINT);
    const warned = new Set();
    let unwarned = 0;
    game.bus.on('strike_warning', (s) => warned.add(s.id));
    game.bus.on('strike', (s) => {
      if (!warned.has(s.id)) unwarned += 1;
    });
    stepFor(game, 10);
    expect(warned.size).toBeGreaterThan(5);
    expect(unwarned).toBe(0);
  });
});
