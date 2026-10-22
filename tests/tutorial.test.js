import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game.js';
import { STEPS } from '../src/sim/tutorial.js';
import { RUN_STATE } from '../src/sim/run.js';
import { stepFor, teleport, testConfig, IDLE, PRESS_E } from './helpers.js';

function tutorialGame(npc = false) {
  const game = new Game({ seed: 3, config: testConfig({ npc: { enabled: npc } }) });
  game.startRun();
  const steps = [];
  game.bus.on('tutorial_step', (s) => steps.push(s));
  game.beginTutorial();
  return { game, steps };
}

// Berhenti tepat di titik lalu tekan E.
function stopAndPress(game, point) {
  teleport(game, point);
  game.step(1 / 60, IDLE);
  game.step(1 / 60, PRESS_E);
  game.step(1 / 60, IDLE);
}

// Jalankan satu langkah tutorial seperti pemain.
function playStep(game) {
  const t = game.tutorial;
  const id = t.step.id;
  if (t.step.waitConfirm) t.confirm();
  else if (id === 'drive') {
    teleport(game, t.target);
    game.step(1 / 60, IDLE);
  } else if (id === 'gps') {
    teleport(game, t.pkg.pickup);
    game.step(1 / 60, IDLE);
  } else if (id === 'pickup') stopAndPress(game, t.pkg.pickup);
  else if (id === 'deliver') stopAndPress(game, t.pkg.dest);
  else if (id === 'fragile' || id === 'express') {
    stopAndPress(game, t.pkg.pickup);
    stopAndPress(game, t.pkg.dest);
  } else if (id === 'home') {
    teleport(game, game.world.ref.outsideHQ);
    game.step(1 / 60, IDLE);
    stopAndPress(game, game.world.hq.spawn);
  }
  return id;
}

describe('Hari Pelatihan', () => {
  it('semua langkah bisa diselesaikan berurutan, lalu Day 1 dimulai bersih', () => {
    const { game, steps } = tutorialGame();
    const done = [];
    game.bus.on('tutorial_done', (e) => done.push(e));
    const order = [];
    for (let i = 0; i < STEPS.length + 2 && game.mode === 'tutorial'; i++) order.push(playStep(game));
    expect(order).toEqual(STEPS.map((s) => s.id));
    expect(steps.map((s) => s.id)).toEqual(STEPS.map((s) => s.id));
    expect(done).toHaveLength(1);
    expect(game.mode).toBe('normal');
    expect(game.run.state).toBe(RUN_STATE.DAY);
    expect(game.run.day).toBe(1);
    expect(game.run.scripted).toBe(true); // Day 1 scripted (paket Zeus) seperti biasa
    expect(game.packages.income).toBe(0);
    expect(game.damage.total).toBe(0);
    expect(game.packages.waiting.some((p) => p.type === 'zeus')).toBe(true);
  });

  it('dunia tenang: jam berhenti, tanpa petir, tanpa Minotaur & Iris, tanpa spawn otomatis', () => {
    const { game } = tutorialGame(true);
    const hits = [];
    for (const e of ['strike', 'minotaur_windup', 'package_stolen', 'package_spawned']) game.bus.on(e, () => hits.push(e));
    const hour = game.clock.hour;
    teleport(game, game.world.ref.meadow); // padang Minotaur
    stepFor(game, 20);
    expect(game.clock.hour).toBe(hour);
    expect(hits).toEqual([]);
    expect(game.traffic.cars.some((c) => c.kind === 'rival')).toBe(false);
    expect(game.quota).toBe(100);
  });

  it('GPS & panah menunjuk penanda latihan', () => {
    const { game } = tutorialGame();
    game.tutorial.confirm(); // sambutan
    game.step(1 / 60, IDLE);
    expect(game.nav.target.kind).toBe('waypoint');
    expect(game.nav.target.x).toBe(game.tutorial.target.x);
  });

  it('paket rapuh pecah: diberi paket baru, langkah tetap', () => {
    const { game, steps } = tutorialGame();
    while (game.tutorial.step.id !== 'fragile') playStep(game);
    const first = game.tutorial.pkg;
    stopAndPress(game, first.pickup);
    for (let i = 0; i < 3; i++) game.packages.jolt('collision', 8);
    expect(game.tutorial.step.id).toBe('fragile');
    expect(game.tutorial.pkg).not.toBe(first);
    expect(game.packages.waiting).toContain(game.tutorial.pkg);
    expect(steps.at(-1).text).toContain('Pecah');
  });

  it('paket kilat telat tetap lulus', () => {
    const { game } = tutorialGame();
    while (game.tutorial.step.id !== 'express') playStep(game);
    const pkg = game.tutorial.pkg;
    stopAndPress(game, pkg.pickup);
    stepFor(game, pkg.timeLimit + 1);
    expect(pkg.late).toBe(true);
    stopAndPress(game, pkg.dest);
    expect(game.tutorial.step.id).toBe('zeus');
  });

  it('bisa dilewati: langsung Day 1', () => {
    const { game } = tutorialGame();
    game.finishTutorial({ skipped: true });
    expect(game.mode).toBe('normal');
    expect(game.run.scripted).toBe(true);
    expect(game.packages.autoSpawn).toBe(true);
  });
});
