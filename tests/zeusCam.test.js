import { describe, expect, it, beforeAll } from 'vitest';
import { ZeusCam } from '../src/ui/zeusCam.js';
import { newGame, stepFor } from './helpers.js';

// DOM tiruan minimal: cukup untuk ZeusCam (class, dataset, atribut, teks).
function fakeElement() {
  const classes = new Set();
  const children = {};
  const el = {
    dataset: {},
    textContent: '',
    offsetWidth: 0,
    attrs: {},
    set innerHTML(_) {},
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    set className(v) {
      classes.clear();
      v.split(' ').forEach((c) => c && classes.add(c));
    },
    querySelector: (sel) => (children[sel] ??= fakeElement()),
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    appendChild: () => {},
  };
  return el;
}

beforeAll(() => {
  globalThis.document = { createElement: () => fakeElement() };
});

function setup() {
  const game = newGame();
  game.god = true;
  const spoken = [];
  const cam = new ZeusCam(fakeElement(), game, { cfg: game.cfg.zeusCam, calm: true, onSpeak: (mood, text) => spoken.push({ mood, text }) });
  const tick = (seconds) => {
    for (let i = 0; i < seconds * 30; i++) {
      game.step(1 / 30, { throttle: 0, steer: 0 });
      cam.update(1 / 30);
    }
  };
  return { game, cam, spoken, tick };
}

describe('Zeus LIVE', () => {
  it('diam di siang hari, menyindir saat senja', () => {
    const { game, cam, spoken, tick } = setup();
    expect(cam.el.classList.contains('hidden')).toBe(true);
    game.clock.setHour(17.98);
    tick(1);
    expect(spoken[0].mood).toBe('smirk');
    expect(cam.el.classList.contains('hidden')).toBe(false);
    tick(6);
    expect(cam.el.classList.contains('hidden')).toBe(true); // di luar badai menghilang lagi
  });

  it('badai: teriak BALIK, lalu terus mengejek selama van belum di HQ', () => {
    const { game, cam, spoken, tick } = setup();
    game.car.reset(game.world.ref.cityRoad);
    game.clock.setHour(19.99);
    tick(1);
    expect(spoken.at(-1).mood).toBe('furious');
    tick(20);
    const taunts = spoken.filter((s) => ['laugh', 'angry', 'annoyed'].includes(s.mood));
    expect(taunts.length).toBeGreaterThanOrEqual(2);
    // Di antara kalimat kamera tetap "siaran" (tidak hilang).
    expect(cam.el.classList.contains('hidden')).toBe(false);
  });

  it('van sampai di HQ saat badai: Zeus kesal lalu kamera mati', () => {
    const { game, cam, spoken, tick } = setup();
    game.car.reset(game.world.ref.cityRoad);
    game.clock.setHour(20.05);
    tick(6);
    game.car.reset(game.world.hq.spawn);
    tick(1);
    expect(spoken.at(-1).mood).toBe('annoyed');
    tick(6);
    expect(cam.el.classList.contains('hidden')).toBe(true);
  });

  it('kalimat penting tidak dipotong reaksi kecil', () => {
    const { game, cam, spoken, tick } = setup();
    game.car.reset(game.world.ref.cityRoad);
    game.clock.setHour(19.99);
    tick(0.5);
    const before = spoken.length;
    game.bus.emit('strike_hit', { kind: 'storm', blocked: false, cost: 0 });
    expect(spoken.length).toBe(before);
    expect(cam.mood).toBe('furious');
  });

  it('bisa dimatikan', () => {
    const { game, cam, spoken, tick } = setup();
    cam.enabled = false;
    game.clock.setHour(19.99);
    tick(3);
    expect(spoken).toHaveLength(0);
  });
});
