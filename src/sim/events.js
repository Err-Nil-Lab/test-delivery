// Event bus kecil yang menghubungkan simulasi dengan render, UI, dan telemetri.
export class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, payload = {}) {
    for (const fn of this.handlers.get(type) ?? []) fn(payload, type);
    for (const fn of this.handlers.get('*') ?? []) fn(payload, type);
  }
}

// Event yang dicatat untuk playtest (dipakai menguji Hipotesis 1 dan 2).
const TRACKED = new Set([
  'run_start',
  'day_start',
  'pickup',
  'deliver',
  'cargo_full',
  'package_expired',
  'blessing_gained',
  'blessing_lost',
  'phase',
  'strike_hit',
  'minotaur_hit',
  'collision',
  'early_end_requested',
  'day_end',
  'run_end',
]);

export class Telemetry {
  constructor(bus, getContext) {
    this.entries = [];
    this.startedAt = new Date().toISOString();
    bus.on('*', (payload, type) => {
      if (!TRACKED.has(type)) return;
      this.entries.push({ type, ...getContext(), ...payload });
    });
  }

  toJSON() {
    return { startedAt: this.startedAt, exportedAt: new Date().toISOString(), entries: this.entries };
  }
}
