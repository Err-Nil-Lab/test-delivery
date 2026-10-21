import { describe, expect, it } from 'vitest';
import { computeReport } from '../src/sim/run.js';

const pkg = (id, pay, type = 'safe') => ({ id, pay, type, dest: { name: `Tujuan ${id}` } });

describe('computeReport', () => {
  it('menghitung profit seperti contoh di GDD', () => {
    const report = computeReport({
      day: 1,
      quota: 600,
      delivered: [pkg(1, 600), pkg(2, 400)],
      damageEvents: [
        { source: 'collision', cost: 100, hour: 7 },
        { source: 'lightning', cost: 200, hour: 9 },
      ],
      carried: [],
      penaltyRate: 0.1,
      endHour: 18,
    });
    expect(report.income).toBe(1000);
    expect(report.damageLoss).toBe(300);
    expect(report.profit).toBe(700);
    expect(report.pass).toBe(true);
  });

  it('paket yang masih dibawa kena denda 10% dari bayarannya', () => {
    const report = computeReport({
      day: 2,
      quota: 100,
      delivered: [pkg(1, 200)],
      damageEvents: [],
      carried: [pkg(2, 150), pkg(3, 400, 'zeus')],
      penaltyRate: 0.1,
      endHour: 19,
    });
    expect(report.undelivered.map((p) => p.penalty)).toEqual([15, 40]);
    expect(report.undeliveredLoss).toBe(55);
    expect(report.profit).toBe(145);
  });

  it('biaya derek mengurangi profit dan bisa membuat gagal quota', () => {
    const report = computeReport({
      day: 3,
      quota: 400,
      delivered: [pkg(1, 600)],
      damageEvents: [],
      carried: [],
      penaltyRate: 0.1,
      towFee: 300,
      endHour: 24,
    });
    expect(report.towed).toBe(true);
    expect(report.profit).toBe(300);
    expect(report.pass).toBe(false);
  });

  it('profit tepat sama dengan quota dianggap lolos', () => {
    const report = computeReport({ day: 1, quota: 200, delivered: [pkg(1, 200)], damageEvents: [], carried: [], penaltyRate: 0.1, endHour: 18 });
    expect(report.pass).toBe(true);
  });
});
