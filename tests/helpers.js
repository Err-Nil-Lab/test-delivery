import { CONFIG } from '../src/config.js';
import { Game } from '../src/sim/game.js';

export const IDLE = { throttle: 0, steer: 0, interact: false };
export const PRESS_E = { throttle: 0, steer: 0, interact: true };

// Salinan config yang bisa diubah per tes tanpa memengaruhi tes lain.
export function testConfig(overrides = {}) {
  const cfg = structuredClone(CONFIG);
  cfg.npc.enabled = false; // tes lama fokus ke sistem lain; tes NPC menyalakannya sendiri
  for (const [section, values] of Object.entries(overrides)) Object.assign(cfg[section], values);
  return cfg;
}

export function newGame({ seed = 1, config = testConfig() } = {}) {
  const game = new Game({ seed, config });
  game.startRun();
  game.beginDay();
  return game;
}

export function stepFor(game, seconds, controls = IDLE) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) game.step(1 / 60, controls);
}

export function teleport(game, point, heading = 0) {
  game.car.reset({ x: point.x, z: point.z, heading });
}
