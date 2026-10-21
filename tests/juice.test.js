import { describe, expect, it } from 'vitest';
import { Juice } from '../src/render/juice.js';
import { CONFIG } from '../src/config.js';

describe('Juice', () => {
  it('guncangan mereda seiring waktu dan dibatasi 1', () => {
    const j = new Juice(CONFIG.juice);
    j.shake(5);
    expect(j.trauma).toBe(1);
    j.update(0.3);
    expect(j.trauma).toBeLessThan(1);
    j.update(5);
    expect(j.trauma).toBe(0);
    expect(Math.abs(j.offset.x) + Math.abs(j.offset.z)).toBe(0);
  });

  it('hitstop menahan simulasi lalu selesai', () => {
    const j = new Juice(CONFIG.juice);
    j.hitstop(0.1);
    expect(j.simDelta(1 / 60)).toBe(0);
    for (let i = 0; i < 10; i++) j.simDelta(1 / 60);
    expect(j.simDelta(1 / 60)).toBeCloseTo(1 / 60);
  });

  it('mode calm mematikan guncangan dan zoom', () => {
    const j = new Juice(CONFIG.juice, { calm: true });
    j.shake(1);
    j.kick(1);
    expect(j.trauma).toBe(0);
    expect(j.zoom).toBe(0);
  });
});
