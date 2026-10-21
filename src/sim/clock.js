// Jam in-game satu hari dan fasenya.
export const PHASE = {
  DAY: 'day',
  DUSK: 'dusk', // 18:00, peringatan pulang
  STORM: 'storm', // 20:00, badai Zeus memburu
  LIMIT: 'limit', // batas akhir malam, van diderek
};

export class DayClock {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.phase = PHASE.DAY;
  }

  get hour() {
    return this.cfg.startHour + this.elapsed / this.cfg.realSecondsPerHour;
  }

  // Detik nyata sejak badai mulai (0 sebelum 20:00).
  get stormElapsed() {
    return Math.max(0, (this.hour - this.cfg.stormHour) * this.cfg.realSecondsPerHour);
  }

  phaseAt(hour) {
    if (hour >= this.cfg.limitHour) return PHASE.LIMIT;
    if (hour >= this.cfg.stormHour) return PHASE.STORM;
    if (hour >= this.cfg.duskHour) return PHASE.DUSK;
    return PHASE.DAY;
  }

  setHour(hour) {
    this.elapsed = Math.max(0, (hour - this.cfg.startHour) * this.cfg.realSecondsPerHour);
  }

  // Mengembalikan fase baru bila berganti di tick ini, selain itu null.
  update(dt) {
    this.elapsed += dt;
    const next = this.phaseAt(this.hour);
    if (next === this.phase) return null;
    this.phase = next;
    return next;
  }
}

export function formatHour(hour) {
  const minutes = Math.floor(hour * 60);
  const hh = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
