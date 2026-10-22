// Tanpa HP: setiap kejadian menambah tagihan repair yang baru terlihat di laporan akhir hari.
export const DAMAGE_LABELS = {
  collision: 'Tabrakan',
  lightning: 'Petir',
  storm: 'Badai Zeus',
  minotaur: 'Minotaur',
  landing: 'Terjun bebas',
  scam: 'Selundupan meledak',
};

export class DamageLedger {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.events = [];
  }

  add(source, cost, hour) {
    const rounded = Math.round(cost);
    if (!(rounded > 0)) return null; // nol, negatif, atau NaN: tidak dicatat
    const event = { source, cost: rounded, hour };
    this.events.push(event);
    return event;
  }

  get total() {
    return this.events.reduce((sum, e) => sum + e.cost, 0);
  }

  // 1 = mulus, 2 = penyok, 3 = rusak berat.
  get state() {
    const [dented, wrecked] = this.cfg.stateThresholds;
    if (this.total >= wrecked) return 3;
    if (this.total >= dented) return 2;
    return 1;
  }

  // 0..1: seberapa jauh melewati state 3, untuk tanda visual tambahan (asap, percikan).
  get overflow() {
    const wrecked = this.cfg.stateThresholds[1];
    return Math.min(1, Math.max(0, this.total - wrecked) / wrecked);
  }
}
