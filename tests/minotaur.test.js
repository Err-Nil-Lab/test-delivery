import { describe, expect, it } from 'vitest';
import { MINOTAUR_STATE } from '../src/sim/minotaurs.js';
import { newGame, stepFor, teleport, testConfig } from './helpers.js';

function setup({ config } = {}) {
  const game = newGame({ config });
  game.god = false;
  const [m] = game.minotaurs.list;
  return { game, m };
}

// Taruh van di depan Minotaur, di dalam padang.
function faceOff(game, m, gap = 12) {
  const t = m.territory;
  m.x = (t.minX + t.maxX) / 2;
  m.z = (t.minZ + t.maxZ) / 2;
  m.state = MINOTAUR_STATE.WANDER;
  teleport(game, { x: m.x, z: m.z + gap });
}

describe('Minotaur', () => {
  it('melihat van di padang lalu ancang-ancang dulu sebelum menyeruduk', () => {
    const { game, m } = setup();
    faceOff(game, m);
    game.step(1 / 60, { throttle: 0, steer: 0, interact: false });
    expect(m.state).toBe(MINOTAUR_STATE.WINDUP);
    expect(m.dirZ).toBeGreaterThan(0.9); // membidik ke arah van
    stepFor(game, game.cfg.minotaur.windup - 0.1);
    expect(m.state).toBe(MINOTAUR_STATE.WINDUP);
    stepFor(game, 0.2);
    expect(m.state).toBe(MINOTAUR_STATE.CHARGE);
  });

  it('serudukan yang kena mementalkan van dan menambah damage', () => {
    const { game, m } = setup();
    faceOff(game, m);
    const hits = [];
    game.bus.on('minotaur_hit', (h) => hits.push(h));
    // Jalan step demi step sampai kena, lalu ukur pentalan tepat sesudahnya.
    for (let i = 0; i < 120 && !hits.length; i++) game.step(1 / 60, { throttle: 0, steer: 0, interact: false });
    expect(hits).toHaveLength(1);
    game.step(1 / 60, { throttle: 0, steer: 0, interact: false });
    expect(game.car.vz).toBeGreaterThan(5); // terpental searah serudukan
    stepFor(game, 0.5);
    expect(game.damage.events.some((e) => e.source === 'minotaur')).toBe(true);
    expect(m.state).toBe(MINOTAUR_STATE.DIZZY);
  });

  it('van yang menghindar ke samping lolos', () => {
    const { game, m } = setup();
    faceOff(game, m, 16);
    stepFor(game, game.cfg.minotaur.windup * 0.5);
    // Kabur ke samping selama ancang-ancang.
    teleport(game, { x: m.x + 10, z: m.z + 16 });
    stepFor(game, 2);
    expect(game.damage.events.some((e) => e.source === 'minotaur')).toBe(false);
  });

  it('serudukan berhenti di batas padang', () => {
    const { game, m } = setup();
    faceOff(game, m);
    stepFor(game, 3);
    const t = m.territory;
    expect(m.x).toBeGreaterThanOrEqual(t.minX);
    expect(m.x).toBeLessThanOrEqual(t.maxX);
    expect(m.z).toBeGreaterThanOrEqual(t.minZ);
    expect(m.z).toBeLessThanOrEqual(t.maxZ);
  });

  it('tidak mengejar van yang jauh di luar padang', () => {
    const { game, m } = setup();
    teleport(game, game.world.ref.cityRoad);
    stepFor(game, 5);
    expect(m.state).not.toBe(MINOTAUR_STATE.WINDUP);
    expect(m.state).not.toBe(MINOTAUR_STATE.CHARGE);
  });

  it('bisa dinonaktifkan sampai hari tertentu', () => {
    const config = testConfig();
    config.minotaur.activeFromDay = 2;
    const { game, m } = setup({ config });
    faceOff(game, m);
    stepFor(game, 2);
    expect(m.state).toBe(MINOTAUR_STATE.WANDER);
  });

  it('menabrak Minotaur yang tenang membuatnya marah', () => {
    const config = testConfig();
    config.minotaur.detectRadius = 0; // tidak melihat van; hanya marah bila ditabrak
    const { game, m } = setup({ config });
    faceOff(game, m, 3.5); // jarak kontak = radius Minotaur 1,8 + van 1,6
    game.car.vz = -10;
    game.step(1 / 60, { throttle: 0, steer: 0, interact: false });
    expect(m.state).toBe(MINOTAUR_STATE.WINDUP);
  });
});
