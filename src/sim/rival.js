// Iris Express: van saingan ungu di lalu lintas. Saat lewat dekat paket yang menunggu, ia bisa mencurinya.
// Paket yang diincar diberi peringatan dulu (van saingan mendekat), jadi pemain bisa merebutnya lebih cepat.
// Senggol van saingan yang membawa curian = satu paket jatuh di jalan dan bisa diambil.

export class RivalSystem {
  constructor(cfg, rng, bus) {
    this.cfg = cfg;
    this.rng = rng;
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.decided = new Map(); // keputusan curi per pasangan (saingan, paket), diundi sekali
    this.stolenToday = 0;
  }

  rivals(traffic) {
    return traffic.cars.filter((c) => c.kind === 'rival' && !c.hidden && c.state === 'drive');
  }

  update(dt, { traffic, packages, van, hour }) {
    const c = this.cfg;
    if (!c.enabled) return;
    const rivals = this.rivals(traffic);
    for (const pkg of [...packages.waiting]) {
      pkg.threat = null;
      if (!c.stealable.includes(pkg.type)) continue;
      for (const r of rivals) {
        const dx = pkg.pickup.x - r.x;
        const dz = pkg.pickup.z - r.z;
        const d = Math.hypot(dx, dz);
        if (d > c.warnRadius || dx * r.dirX + dz * r.dirZ < -c.stealRadius) continue;
        pkg.threat = r;
        if (d > c.stealRadius || pkg.age < c.minAge || (r.loot?.length ?? 0) >= c.maxLoot) continue;
        if (Math.hypot(van.x - pkg.pickup.x, van.z - pkg.pickup.z) < c.playerGuard) continue;
        const key = `${r.id}:${pkg.id}`;
        if (!this.decided.has(key)) this.decided.set(key, this.rng.chance(c.stealChance));
        if (this.decided.get(key)) {
          this.steal(r, pkg, packages, hour);
          break;
        }
      }
    }
  }

  steal(r, pkg, packages, hour) {
    packages.waiting = packages.waiting.filter((p) => p !== pkg);
    pkg.threat = null;
    (r.loot ??= []).push(pkg);
    this.stolenToday += 1;
    this.bus.emit('package_stolen', { id: pkg.id, packageType: pkg.type, pay: pkg.pay, x: pkg.pickup.x, z: pkg.pickup.z, hour });
  }

  // Van saingan disenggol pemain: kalau membawa curian, satu paket jatuh di tempat.
  onBumped(r, impact, packages, hour) {
    if (!r.loot?.length || impact < this.cfg.dropImpact) return null;
    const pkg = r.loot.pop();
    pkg.pickup = { id: `drop-${pkg.id}`, name: 'Paket jatuh', district: 'road', x: r.x, z: r.z };
    pkg.age = 0;
    pkg.lifetime = this.cfg.dropLifetime;
    pkg.threat = null;
    packages.waiting.push(pkg);
    this.bus.emit('package_dropped', { id: pkg.id, packageType: pkg.type, pay: pkg.pay, x: r.x, z: r.z, hour });
    return pkg;
  }
}
