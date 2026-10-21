import { describe, expect, it } from 'vitest';
import { DayClock, PHASE, formatHour } from '../src/sim/clock.js';
import { CONFIG } from '../src/config.js';

describe('DayClock', () => {
  it('mulai 06:00 dengan fase siang', () => {
    const clock = new DayClock(CONFIG.time);
    expect(clock.hour).toBe(6);
    expect(clock.phase).toBe(PHASE.DAY);
  });

  it('berganti fase di 18:00, 20:00, dan 24:00 dan melaporkannya sekali', () => {
    const clock = new DayClock(CONFIG.time);
    const transitions = [];
    for (let i = 0; i < 20 * 60 * CONFIG.time.realSecondsPerHour; i++) {
      const phase = clock.update(1 / 60);
      if (phase) transitions.push([phase, Math.round(clock.hour * 10) / 10]);
    }
    expect(transitions).toEqual([
      [PHASE.DUSK, 18],
      [PHASE.STORM, 20],
      [PHASE.LIMIT, 24],
    ]);
  });

  it('satu hari sampai senja ±2 menit nyata', () => {
    const { duskHour, stormHour, startHour, realSecondsPerHour } = CONFIG.time;
    expect((duskHour - startHour) * realSecondsPerHour).toBe(96);
    expect((stormHour - startHour) * realSecondsPerHour).toBe(112);
  });

  it('stormElapsed hanya berjalan setelah 20:00', () => {
    const clock = new DayClock(CONFIG.time);
    clock.setHour(19);
    expect(clock.stormElapsed).toBe(0);
    clock.setHour(21);
    expect(clock.stormElapsed).toBe(CONFIG.time.realSecondsPerHour);
  });

  it('format jam', () => {
    expect(formatHour(6)).toBe('06:00');
    expect(formatHour(18.5)).toBe('18:30');
    expect(formatHour(24)).toBe('00:00');
  });
});
