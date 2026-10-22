// Efek visual per event simulasi: partikel, teks melayang, camera shake, hitstop.
// Juga efek per frame: debu ban saat drift, deteksi van lepas landas, cegukan Dionysus.
import { CURSES } from '../sim/curses.js';
import { SkidMarks } from './skidmarks.js';

const GOLD = '#ffd84a';
const DRIFT_WORDS = ['SKRRT!', 'WHEEE!', 'NGEPOT!', 'YIHAA!', 'BRRRT!', 'WUSHH!'];
const TIER_COLORS = ['#7cc4ff', '#ff9f3d']; // percikan ban: biru = turbo kecil, oranye = turbo besar
const ANGRY = ['WOI!', 'PAKAI MATA!', 'DEMI ZEUS!', 'ASTAGA!', 'HEI HEI HEI!', 'SIM-MU DARI MANA?!'];
const DODGE_WORDS = {
  person: ['AAAH!', 'ASTAGA ZEUS!', 'MAMAAA!', 'WAAA!', 'HAMPIR!'],
  sheep: ['MBEEE!', 'BAAA!'],
  chicken: ['PETOK!', 'KOKOK!'],
  goat: ['MBEK!', 'MEEEH!'],
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class EventFx {
  constructor({ game, particles, popups, juice, carView }) {
    this.game = game;
    this.particles = particles;
    this.popups = popups;
    this.juice = juice;
    this.carView = carView;
    this.wasAirborne = false;
    this.hiccupTimer = 3;
    this.dustTimer = 0;
    this.skids = new SkidMarks(carView.scene);
    const hs = game.cfg.juice.hitstop;
    const on = (event, fn) => game.bus.on(event, fn);
    const at = () => this.carPos();

    on('pickup', () => {
      const c = at();
      this.particles.burst(8, { ...c, y: c.y + 1, speed: 3, up: 3, life: 0.5, size: 0.4, color: '#c9b79a', gravity: 6 });
      this.carView.bounce = 1;
      this.juice.kick(0.02);
    });
    on('deliver', ({ pay }) => {
      const c = at();
      this.particles.burst(18, { ...c, y: c.y + 2, speed: 5, up: 9, life: 1, size: 0.45, color: GOLD, gravity: 18 });
      this.popups.spawn(`+$${pay}`, c.x, c.y + 4, c.z, 'money');
      this.juice.kick(0.03);
    });
    on('drift_start', () => {
      const c = at();
      this.popups.spawn(pick(DRIFT_WORDS), c.x, c.y + 3.5, c.z, 'drift', 0.7);
    });
    on('drift_boost', ({ tier }) => {
      const c = at();
      const color = TIER_COLORS[tier];
      this.popups.spawn(tier ? 'MEGA TURBO!!' : 'TURBO!', c.x, c.y + 4, c.z, tier ? 'turbo mega' : 'turbo', 0.9);
      this.particles.burst(tier ? 22 : 12, { ...c, y: c.y + 0.6, speed: 7, up: 3, life: 0.45, size: 0.35, color, gravity: 10 });
      this.juice.kick(tier ? 0.05 : 0.03);
      this.juice.shake(tier ? 0.3 : 0.15);
    });
    on('day_start', () => this.skids.clear());
    // Bonus gaya dan paket rapuh.
    // Beberapa aksi sekaligus: teks ditumpuk ke atas supaya tidak saling menimpa.
    this.trickStack = { t: -1, n: 0 };
    on('style_trick', ({ name, value, mult }) => {
      const c = at();
      const now = performance.now() / 1000;
      this.trickStack.n = now - this.trickStack.t < 0.6 ? this.trickStack.n + 1 : 0;
      this.trickStack.t = now;
      this.popups.spawn(`${name} +$${value}${mult > 1 ? ` ×${mult}` : ''}`, c.x, c.y + 4.5 + this.trickStack.n * 1.6, c.z, 'trick', 0.9);
    });
    on('style_banked', ({ tip }) => {
      const c = at();
      this.popups.spawn(`+$${tip} TIP!`, c.x, c.y + 5, c.z, 'tip', 1.2);
      this.particles.burst(Math.min(30, 8 + Math.round(tip / 5)), { ...c, y: c.y + 2, speed: 4, up: 8, life: 0.9, size: 0.4, color: GOLD, gravity: 16 });
      this.juice.kick(0.025);
    });
    on('style_dropped', () => {
      const c = at();
      this.popups.spawn('COMBO HANGUS', c.x, c.y + 4.5, c.z, 'loss', 1);
    });
    on('package_stolen', (e) => {
      if (!near(e)) return;
      const y = groundY(e);
      this.popups.spawn('DICURI IRIS! 😜', e.x, y + 4, e.z, 'angry', 1.2);
      this.particles.burst(12, { x: e.x, y: y + 1.5, z: e.z, speed: 4, up: 4, life: 0.6, size: 0.35, color: '#a78bfa', gravity: 10 });
    });
    on('package_dropped', (e) => {
      const y = groundY(e);
      this.popups.spawn('PAKETNYA JATUH!', e.x, y + 4, e.z, 'tip', 1.2);
      this.particles.burst(14, { x: e.x, y: y + 2, z: e.z, speed: 4, up: 6, life: 0.7, size: 0.35, color: '#c9b79a', gravity: 14 });
    });
    on('fragile_cracked', () => {
      const c = at();
      this.popups.spawn('KRAK!', c.x, c.y + 3.8, c.z, 'warn', 0.8);
      this.particles.burst(8, { ...c, y: c.y + 2.4, speed: 3, up: 3, life: 0.5, size: 0.2, color: '#bfe8ff', gravity: 14 });
    });
    on('fragile_broken', () => {
      const c = at();
      this.popups.spawn('PRANG!!', c.x, c.y + 4, c.z, 'loss', 1.1);
      this.particles.burst(22, { ...c, y: c.y + 2.4, speed: 6, up: 5, life: 0.7, size: 0.25, color: '#bfe8ff', gravity: 16 });
      this.juice.shake(0.25);
    });
    // Penghuni map: hanya diberi efek kalau dekat van (di layar).
    const near = (e, r = 45) => Math.hypot(e.x - this.game.car.x, e.z - this.game.car.z) < r;
    const groundY = (e) => this.game.world.heightAt(e.x, e.z);
    on('npc_bumped', (e) => {
      const y = groundY(e);
      this.popups.spawn(pick(ANGRY), e.x, y + 3.5, e.z, 'angry', 1.1);
      this.particles.burst(10, { x: e.x, y: y + 1, z: e.z, speed: 5, up: 4, life: 0.4, size: 0.25, color: '#ffb347', gravity: 15 });
    });
    on('npc_honk', (e) => {
      if (near(e, 35)) this.popups.spawn(e.kind === 'rival' ? 'TIN TIN TIN!' : 'TIN!', e.x, groundY(e) + 3, e.z, 'honk', 0.7);
    });
    on('npc_dodge', (e) => {
      if (!near(e)) return;
      this.popups.spawn(pick(DODGE_WORDS[e.kind] ?? DODGE_WORDS.person), e.x, groundY(e) + 2.6, e.z, e.kind === 'person' ? 'scream' : 'animal', 0.8);
    });
    on('npc_zapped', (e) => {
      if (!near(e)) return;
      const y = groundY(e);
      this.popups.spawn(e.kind === 'sheep' ? 'BAAA?' : 'ZAP!', e.x, y + 2.5, e.z, 'zap', 0.8);
      this.particles.burst(6, { x: e.x, y: y + 1, z: e.z, speed: 1.5, up: 2, life: 1, size: 0.6, grow: 1.5, color: '#4a4a4a', drag: 2 });
    });
    on('cargo_full', () => {
      const c = at();
      this.popups.spawn('PENUH!', c.x, c.y + 4, c.z, 'warn', 0.8);
    });
    on('collision', ({ impact }) => {
      const c = at();
      const s = Math.min(1, impact / 18);
      this.particles.burst(Math.round(4 + s * 14), { ...c, y: c.y + 1, speed: 6 * s + 2, up: 4, life: 0.4, size: 0.25, color: '#ffb347', gravity: 15 });
      this.juice.shake(0.25 + s * 0.4);
      if (impact > 12) {
        this.juice.hitstop(hs.bump);
        this.popups.spawn('BONK!', c.x, c.y + 3, c.z, 'bonk', 0.8);
      }
    });
    on('hard_landing', ({ fallSpeed }) => {
      const c = at();
      const s = Math.min(1, fallSpeed / 16);
      this.ring(c, '#c9b79a', 16, 6 * s + 2);
      this.juice.shake(0.3 + s * 0.4);
      this.carView.squash = 1;
    });
    on('strike', (s) => {
      const d = Math.hypot(s.x - this.game.car.x, s.z - this.game.car.z);
      const y = this.game.world.heightAt(s.x, s.z);
      this.particles.burst(s.blocked ? 14 : 10, { x: s.x, y: y + 0.5, z: s.z, speed: 5, up: 6, life: 0.5, size: 0.3, color: s.blocked ? GOLD : '#e0f2ff', gravity: 12 });
      if (s.hit && !s.blocked) {
        this.juice.shake(0.6);
        this.popups.spawn('ZAP!', s.x, y + 4, s.z, 'zap', 0.8);
      } else if (d < 40) {
        this.juice.shake(0.25 * (1 - d / 40));
      }
    });
    on('blessing_gained', () => this.ring(at(), GOLD, 20, 5));
    on('blessing_lost', () => {
      const c = at();
      // Aura blessing pecah jadi serpihan emas yang jatuh.
      this.particles.burst(40, { ...c, y: c.y + 3, speed: 4, up: 5, life: 1.6, size: 0.35, color: GOLD, gravity: 6, drag: 1 });
      this.juice.hitstop(hs.blessingLost);
      this.juice.shake(0.35);
      document.body.classList.add('desaturate');
      setTimeout(() => document.body.classList.remove('desaturate'), 900);
    });
    on('curse_gained', ({ curse }) => {
      const c = at();
      this.particles.burst(24, { ...c, y: c.y + 1, speed: 3, up: 3, life: 1.2, size: 0.7, grow: 1.5, color: CURSES[curse].color, drag: 2 });
    });
    on('curse_lifted', ({ curse }) => {
      const c = at();
      this.particles.burst(30, { ...c, y: c.y + 2, speed: 7, up: 8, life: 0.9, size: 0.4, color: CURSES[curse].color, gravity: 10 });
      this.popups.spawn('Lega!', c.x, c.y + 4, c.z, 'relief');
    });
    on('smuggle_resolved', ({ scam, pay }) => {
      const c = at();
      if (!scam) {
        this.particles.burst(30, { ...c, y: c.y + 2, speed: 6, up: 11, life: 1.2, size: 0.5, color: GOLD, gravity: 18 });
        this.popups.spawn(`+$${pay}`, c.x, c.y + 4, c.z, 'money');
        return;
      }
      this.particles.burst(30, { ...c, y: c.y + 2, speed: 10, up: 10, life: 1.2, size: 0.5, color: '#3b2a1a', gravity: 20 }); // serpihan
      this.particles.burst(20, { ...c, y: c.y + 2, speed: 3, up: 4, life: 2, size: 1.2, grow: 2, color: '#4b4b4b', drag: 2 }); // asap
      this.popups.spawn(`−$${pay}`, c.x, c.y + 5, c.z, 'loss', 1.4);
      this.juice.shake(1);
      this.juice.hitstop(hs.scam);
    });
    on('minotaur_windup', ({ x, z, dirX, dirZ }) => {
      // Napas dengus di depan moncong.
      for (let i = 0; i < 6; i++) this.particles.emit({ x: x + dirX * 1.8, y: 2.2, z: z + dirZ * 1.8, vx: dirX * 2 + (Math.random() - 0.5), vy: 0.5, vz: dirZ * 2 + (Math.random() - 0.5), life: 0.6, size: 0.4, grow: 1.5, color: '#e5e7eb', drag: 2 });
    });
    on('minotaur_hit', ({ x, z }) => {
      this.particles.burst(20, { x, y: 1.5, z, speed: 8, up: 6, life: 0.6, size: 0.35, color: '#ffffff', gravity: 15 });
      this.popups.spawn('BONK!', x, 4, z, 'bonk');
      this.juice.shake(0.8);
      this.juice.hitstop(hs.ram);
    });
    on('minotaur_charmed', ({ id }) => {
      const m = this.game.minotaurs.list.find((q) => q.id === id);
      if (m) this.popups.spawn('💕', m.x, 4.5, m.z, 'heart', 1.4);
    });
    on('minotaur_nudge', () => {
      const c = at();
      this.popups.spawn('boop', c.x, c.y + 3, c.z, 'boop', 0.7);
    });
    on('package_expired', ({ x, z }) => {
      if (x === undefined) return;
      const y = this.game.world.heightAt(x, z);
      this.particles.burst(10, { x, y: y + 1, z, speed: 2, up: 2, life: 0.8, size: 0.6, grow: 1, color: '#9ca3af', drag: 2 });
    });
  }

  carPos() {
    const { car, world } = this.game;
    return { x: car.x, y: car.y ?? world.heightAt(car.x, car.z), z: car.z };
  }

  ring(c, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.particles.emit({ x: c.x, y: c.y + 0.3, z: c.z, vx: Math.cos(a) * speed, vy: 0.6, vz: Math.sin(a) * speed, life: 0.7, size: 0.6, grow: 1, color, drag: 3 });
    }
  }

  update(dt) {
    const { game } = this;
    if (game.run.state !== 'day') return;
    const { car } = game;
    const c = this.carPos();

    // Lepas landas dari undakan.
    if (car.airborne && !this.wasAirborne) game.bus.emit('takeoff', {});
    this.wasAirborne = car.airborne;

    // Ban belakang: debu saat tergelincir, asap + bekas ban + percikan saat ngepot.
    const lateral = Math.abs(car.vx * -Math.cos(car.heading) + car.vz * Math.sin(car.heading));
    const sx = Math.sin(car.heading);
    const sz = Math.cos(car.heading);
    const rear = [-1, 1].map((side) => ({ x: c.x - sx * 1.3 + -sz * 1.1 * side, y: c.y, z: c.z - sz * 1.3 + sx * 1.1 * side }));
    const skidding = !car.airborne && (car.drifting || (car.handbrake && car.speed > 4) || lateral > 6);
    this.skids.update(skidding ? rear : null);
    this.dustTimer -= dt;
    if (!car.airborne && (lateral > 5 || car.drifting) && this.dustTimer <= 0) {
      this.dustTimer = car.drifting ? 0.025 : 0.04;
      const d = game.cfg.car.drift;
      let tier = -1;
      if (car.drifting) d.tiers.forEach((t, i) => (car.driftTime >= t.seconds ? (tier = i) : 0));
      for (const w of rear) {
        const smoke = car.drifting ? '#e9e6df' : '#c9b79a';
        this.particles.emit({ x: w.x, y: w.y + 0.3, z: w.z, vx: (Math.random() - 0.5) * 1.5, vy: 0.9, vz: (Math.random() - 0.5) * 1.5, life: 0.7, size: car.drifting ? 0.7 : 0.5, grow: 1.8, color: smoke, drag: 2 });
        if (tier >= 0) this.particles.emit({ x: w.x, y: w.y + 0.25, z: w.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 6, life: 0.25, size: 0.18, color: TIER_COLORS[tier], gravity: 12 });
      }
    }
    // Jalan licin (Poseidon ngambek): cipratan air di belakang ban.
    if (game.dayMods?.wet && !car.airborne && car.speed > 8 && Math.random() < 0.6) {
      for (const w of rear) this.particles.emit({ x: w.x, y: w.y + 0.2, z: w.z, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.45, size: 0.3, color: '#a5d8ff', gravity: 12 });
    }
    // Turbo: api kecil dari knalpot.
    if (car.boostTime > 0 && Math.random() < 0.7) {
      this.particles.emit({ x: c.x - sx * 2.2, y: c.y + 0.6, z: c.z - sz * 2.2, vx: -sx * 4, vy: 0.5, vz: -sz * 4, life: 0.25, size: 0.45, grow: -1, color: car.boostMultiplier > 1.3 ? '#ff9f3d' : '#7cc4ff' });
    }

    // Dionysus: cegukan acak.
    if (game.effects?.steerDelay > 0) {
      this.hiccupTimer -= dt;
      if (this.hiccupTimer <= 0) {
        this.hiccupTimer = 2.5 + Math.random() * 3;
        this.popups.spawn('HIK!', c.x, c.y + 4, c.z, 'hik', 0.8);
        game.bus.emit('hiccup', {});
      }
    }
  }
}
