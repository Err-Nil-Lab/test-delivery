// Struktur run: 7 hari, quota harian, gagal sekali = ulang dari Day 1.

export const RUN_STATE = {
  INTRO: 'intro',
  DAY: 'day',
  REPORT: 'report',
  WIN: 'win',
};

// Laporan akhir hari. Profit ≥ quota → lanjut, selain itu game over.
export function computeReport({ day, quota, delivered, damageEvents, carried, penaltyRate, towFee = 0, endHour, tips = 0 }) {
  const income = delivered.reduce((sum, p) => sum + p.pay, 0);
  const damageLoss = damageEvents.reduce((sum, e) => sum + e.cost, 0);
  const undelivered = carried.map((p) => ({
    id: p.id,
    type: p.type,
    dest: p.dest.name,
    pay: p.pay,
    penalty: Math.round(p.pay * penaltyRate),
  }));
  const undeliveredLoss = undelivered.reduce((sum, p) => sum + p.penalty, 0);
  const profit = income + tips - damageLoss - undeliveredLoss - towFee;
  return {
    day,
    quota,
    income,
    deliveredCount: delivered.length,
    tips,
    damageLoss,
    damageEvents: damageEvents.map((e) => ({ ...e })),
    undelivered,
    undeliveredLoss,
    towFee,
    towed: towFee > 0,
    profit,
    pass: profit >= quota,
    endHour,
  };
}

export class RunState {
  constructor(cfg) {
    this.cfg = cfg;
    this.runCount = 0;
    this.state = RUN_STATE.INTRO;
    this.day = 1;
    this.wallet = 0;
    this.savings = 0;
    this.upgrades = [];
    this.offers = [];
    this.modifier = null;
    this.lastReport = null;
    this.history = [];
  }

  get quota() {
    return this.cfg.quotas[this.day - 1] ?? this.cfg.quotas[this.cfg.quotas.length - 1];
  }

  get isFinalDay() {
    return this.day >= this.cfg.days;
  }

  // Run pertama Day 1 di-script sebagai tutorial.
  get scripted() {
    return this.runCount === 1 && this.day === 1;
  }

  start() {
    this.runCount += 1;
    this.day = 1;
    this.wallet = 0;
    this.savings = 0; // Kas bengkel: profit di atas quota, untuk membeli upgrade
    this.upgrades = [];
    this.offers = [];
    this.modifier = null;
    this.lastReport = null;
    this.history = [];
    this.state = RUN_STATE.INTRO;
  }

  beginDay() {
    this.state = RUN_STATE.DAY;
  }

  endDay(report) {
    this.wallet += report.profit;
    report.savingsGain = report.pass ? report.profit - report.quota : 0;
    this.savings += report.savingsGain;
    this.lastReport = report;
    this.history.push(report);
    this.state = RUN_STATE.REPORT;
  }

  // Dipanggil setelah layar laporan. Mengembalikan 'next', 'win', atau 'gameover'.
  advance() {
    if (!this.lastReport.pass) return 'gameover';
    if (this.isFinalDay) {
      this.state = RUN_STATE.WIN;
      return 'win';
    }
    this.day += 1;
    return 'next';
  }
}
