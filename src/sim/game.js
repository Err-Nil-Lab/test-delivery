// Orkestrator simulasi. Tidak meng-import three, jadi bisa dijalankan headless di tes.
import { CONFIG } from '../config.js';
import { createRng } from '../rng.js';
import { EventBus, Telemetry } from './events.js';
import { createWorld, inRect } from './world.js';
import { Car } from './car.js';
import { DayClock, PHASE } from './clock.js';
import { DamageLedger } from './damage.js';
import { PackageSystem } from './packages.js';
import { HazardSystem } from './hazards.js';
import { MinotaurSystem } from './minotaurs.js';
import { RunState, RUN_STATE, computeReport } from './run.js';

const round2 = (v) => Math.round(v * 100) / 100;

export class Game {
  constructor({ config = CONFIG, seed = 1 } = {}) {
    this.cfg = config;
    this.seed = seed;
    this.bus = new EventBus();
    this.rng = createRng(seed);
    this.world = createWorld();
    this.car = new Car(config.car);
    this.clock = new DayClock(config.time);
    this.damage = new DamageLedger(config.damage);
    this.packages = new PackageSystem(this.world, config.packages, this.rng, this.bus, config.curse, config.smuggle);
    this.hazards = new HazardSystem(this.world, config.lightning, config.storm, this.rng, this.bus);
    this.minotaurs = new MinotaurSystem(this.world, config.minotaur, this.rng, this.bus, config.curse.effects);
    this.run = new RunState(config.run);
    this.telemetry = new Telemetry(this.bus, () => ({
      run: this.run.runCount,
      day: this.run.day,
      hour: round2(this.clock.hour),
      t: round2(this.runSeconds),
    }));
    this.god = false;
    this.timeScale = 1;
    this.runSeconds = 0;
    this.collisionCooldown = 0;
    this.earlyEndUntil = -Infinity;
    this.pendingHints = [];
    this.leftHQ = false;
    this.steerHistory = [];
    this.effects = this.packages.effects;
    this.curseHintShown = false;
    this.car.reset(this.world.hq.spawn);
  }

  get inHQ() {
    return inRect(this.world.hq.zone, this.car.x, this.car.z);
  }

  get inZeusZone() {
    return this.world.inZeusZone(this.car.x, this.car.z);
  }

  get earlyEndPending() {
    return this.clock.elapsed <= this.earlyEndUntil;
  }

  hint(text, delay = 0) {
    this.pendingHints.push({ at: this.clock.elapsed + delay, text });
    this.pendingHints.sort((a, b) => a.at - b.at);
  }

  startRun() {
    this.run.start();
    this.runSeconds = 0;
    this.bus.emit('run_start', { runCount: this.run.runCount, seed: this.seed });
    if (this.run.runCount > 1) this.beginDay();
  }

  beginDay() {
    const { run } = this;
    run.beginDay();
    this.car.reset(this.world.hq.spawn);
    this.clock.reset();
    this.damage.reset();
    this.hazards.reset();
    this.minotaurs.reset();
    this.packages.resetDay({ scripted: run.scripted, day: run.day, near: this.car });
    this.steerHistory = [];
    this.collisionCooldown = 0;
    this.earlyEndUntil = -Infinity;
    this.pendingHints = [];
    this.leftHQ = false;
    this.bus.emit('day_start', { quota: run.quota, scripted: run.scripted });

    if (run.scripted) {
      this.hint(this.car.driftEnabled ? 'W/S: gas & rem · A/D: belok · Space: ngepot (drift) · H: drift on/off' : 'W/S: gas & rem · A/D: belok');
      this.hint('Paket ⚡ Zeus menunggu di Gerbang Istana Zeus. Ikuti panah ⚡ ke utara, berhenti di penanda, lalu tekan E.', 4);
      this.hint('Hati-hati: Minotaur di padang menyeruduk van yang lewat. Lihat arah ancang-ancangnya, lalu menghindar!', 12);
    } else if (run.runCount === 1 && run.day === 2) {
      this.hint('Paket kini muncul acak di seluruh kota. Van punya 3 slot; paket Zeus memakan 2.');
    }
  }

  // Dionysus: setir tertunda + oleng pelan. Kontrol asli tidak diubah, van menerima versi "mabuk".
  drunkControls(controls) {
    const fx = this.effects;
    if (!fx.steerDelay && !fx.wobble) return controls;
    const now = this.runSeconds;
    this.steerHistory.push({ t: now, steer: controls.steer });
    while (this.steerHistory.length > 1 && this.steerHistory[1].t <= now - fx.steerDelay) this.steerHistory.shift();
    const delayed = this.steerHistory[0].t <= now - fx.steerDelay ? this.steerHistory[0].steer : 0;
    const hz = this.cfg.curse.effects.dionysus.wobbleHz;
    const wobble = fx.wobble * Math.sin(now * hz * Math.PI * 2);
    return { ...controls, steer: Math.max(-1, Math.min(1, delayed + wobble)) };
  }

  step(dt, controls) {
    if (this.run.state !== RUN_STATE.DAY) return;
    this.runSeconds += dt;
    const hour = this.clock.hour;

    this.effects = this.packages.effects;
    const impacts = this.car.update(dt, this.drunkControls(controls), {
      heightAt: this.world.heightAt,
      slopeAt: this.world.slopeAt,
      speedAt: this.world.speedAt,
      colliders: this.world.nearbyColliders,
      dynamic: this.minotaurs.colliders(),
    });
    for (const e of this.car.events) {
      if (e.type === 'drift_start') this.bus.emit('drift_start', {});
      else {
        this.bus.emit('drift_end', { seconds: round2(e.seconds), tier: e.tier });
        if (e.tier >= 0) this.bus.emit('drift_boost', { tier: e.tier });
      }
    }
    this.car.events.length = 0;
    this.collisionCooldown -= dt;
    for (const { speed, collider } of impacts) {
      if (collider.landing) {
        this.land(speed, hour);
        continue;
      }
      if (collider.minotaur) this.minotaurs.provoke(collider.minotaur, this.car);
      if (speed < this.cfg.damage.collisionMinImpact || this.collisionCooldown > 0) continue;
      this.collisionCooldown = this.cfg.damage.collisionCooldown;
      const cost = this.god ? 0 : speed * this.cfg.damage.collisionCostPerSpeed;
      this.damage.add('collision', cost, hour);
      this.bus.emit('collision', { impact: round2(speed), cost: Math.round(cost) });
    }

    if (!this.inHQ) this.leftHQ = true;

    const phase = this.clock.update(dt * this.effects.clockMultiplier); // Chronos
    if (phase) this.bus.emit('phase', { phase });

    this.packages.update(dt, this.car, hour);

    const hits = this.hazards.update(dt, {
      car: this.car,
      phase: this.clock.phase,
      stormElapsed: this.clock.stormElapsed,
      inHQ: this.inHQ,
      blessed: this.effects.lightningImmune,
    });
    for (const hit of hits) {
      if (hit.blocked) {
        this.bus.emit('strike_hit', { kind: hit.kind, blocked: true });
        continue;
      }
      if (this.inHQ) continue; // HQ selalu aman
      this.car.applyHit(this.cfg.lightning.hitSpeedMultiplier, (this.rng.chance(0.5) ? 1 : -1) * this.cfg.lightning.hitSpin);
      const source = hit.kind === 'storm' ? 'storm' : 'lightning';
      const cost = this.god ? 0 : this.cfg.damage[source];
      this.damage.add(source, cost, hour);
      this.bus.emit('strike_hit', { kind: hit.kind, blocked: false, cost });
    }

    const mcfg = this.cfg.minotaur;
    const rams = this.minotaurs.update(dt, {
      car: this.car,
      active: this.run.day >= mcfg.activeFromDay,
      mode: this.effects.minotaurMode,
    });
    for (const ram of rams) {
      if (ram.nudge) {
        // Sundulan sayang Aphrodite: mendorong pelan, tanpa damage.
        const n = this.cfg.curse.effects.aphrodite.nudgeSpeed;
        this.car.applyImpulse(ram.dirX * n, ram.dirZ * n, 0);
        continue;
      }
      const side = this.rng.chance(0.5) ? 1 : -1;
      this.car.applyImpulse(ram.dirX * mcfg.knockback, ram.dirZ * mcfg.knockback, side * mcfg.knockSpin);
      this.damage.add('minotaur', this.god ? 0 : this.cfg.damage.minotaur, hour);
    }

    while (this.pendingHints.length && this.pendingHints[0].at <= this.clock.elapsed) {
      this.bus.emit('hint', { text: this.pendingHints.shift().text });
    }

    if (controls.interact) this.interact();

    if (this.clock.phase === PHASE.LIMIT && this.run.state === RUN_STATE.DAY) this.endDay({ towed: true });
  }

  // Terjun dari undakan: biaya repair sesuai kecepatan jatuh di atas batas aman.
  land(fallSpeed, hour) {
    const { landingSafeSpeed, landingCostPerSpeed } = this.cfg.damage;
    if (fallSpeed <= landingSafeSpeed) return;
    const cost = this.god ? 0 : (fallSpeed - landingSafeSpeed) * landingCostPerSpeed;
    this.damage.add('landing', cost, hour);
    this.bus.emit('hard_landing', { fallSpeed: round2(fallSpeed), cost: Math.round(cost) });
  }

  // Selundupan scam meledak saat diantar: van terlempar sedikit dan ada tagihan repair.
  explodeScams(result, hour) {
    for (let i = result.packages.filter((p) => p.scam).length; i > 0; i--) {
      const s = this.cfg.smuggle;
      const angle = this.rng.range(0, Math.PI * 2);
      this.car.applyImpulse(Math.cos(angle) * s.scamKnockback, Math.sin(angle) * s.scamKnockback, this.rng.chance(0.5) ? 3 : -3);
      this.damage.add('scam', this.god ? 0 : s.scamDamage, hour);
    }
  }

  interact() {
    const hour = this.clock.hour;
    const result = this.packages.interact(this.car, hour);
    if (result) {
      if (result.kind === 'deliver') this.explodeScams(result, hour);
      if (result.kind === 'pickup' && result.pkg.type === 'smuggle' && !this.smuggleHintShown) {
        this.smuggleHintShown = true;
        this.hint('Paket selundupan: bayaran besar, tapi bisa saja scam dan meledak saat diantar. Persentasenya tertulis di label.');
      }
      if (result.kind === 'pickup' && result.pkg.type === 'curse' && !this.curseHintShown) {
        this.curseHintShown = true;
        this.hint('Paket terkutuk! Efeknya ikut pergi begitu paket ini diantar.');
      }
      if (result.kind === 'pickup' && result.pkg.type === 'zeus' && this.run.scripted) {
        this.hint('Selama membawa paket Zeus kamu kebal petir. Antar ke Electrical Plant di puncak gunung (ikuti panah ⚡).');
      }
      if (result.kind === 'deliver' && result.packages.some((p) => p.type === 'zeus') && this.run.scripted) {
        this.hint('Petir kini bisa mengenaimu. Turuni gunung dengan hati-hati!', 2.5);
      }
      this.bus.emit('interact', result);
      return result;
    }
    // HQ baru bisa dipakai mengakhiri hari setelah van sempat keluar.
    if (!this.inHQ || !this.leftHQ) return null;
    if (!this.car.stopped) {
      const res = { kind: 'moving' };
      this.bus.emit('interact', res);
      return res;
    }
    if (hour < this.cfg.time.duskHour && !this.earlyEndPending) {
      this.earlyEndUntil = this.clock.elapsed + this.cfg.time.earlyEndConfirmSeconds;
      this.bus.emit('early_end_requested', {});
      return { kind: 'confirm-end' };
    }
    this.endDay({ towed: false });
    return { kind: 'end-day' };
  }

  endDay({ towed = false } = {}) {
    if (this.run.state !== RUN_STATE.DAY) return null;
    const report = computeReport({
      day: this.run.day,
      quota: this.run.quota,
      delivered: this.packages.delivered,
      damageEvents: this.damage.events,
      carried: this.packages.cargo,
      penaltyRate: this.cfg.packages.undeliveredPenalty,
      towFee: towed ? this.cfg.damage.towFee : 0,
      endHour: this.clock.hour,
    });
    this.run.endDay(report);
    this.bus.emit('day_end', {
      income: report.income,
      damageLoss: report.damageLoss,
      undeliveredLoss: report.undeliveredLoss,
      towFee: report.towFee,
      profit: report.profit,
      quota: report.quota,
      pass: report.pass,
      endHour: round2(report.endHour),
      deliveredCount: report.deliveredCount,
    });
    return report;
  }

  // Setelah layar laporan: hari berikutnya, menang, atau ulang dari Day 1.
  advance() {
    const outcome = this.run.advance();
    if (outcome === 'next') {
      this.beginDay();
    } else {
      this.bus.emit('run_end', { result: outcome, wallet: this.run.wallet });
      if (outcome === 'gameover') this.startRun();
    }
    return outcome;
  }
}
