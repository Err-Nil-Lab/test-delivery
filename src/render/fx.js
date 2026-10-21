// Efek visual per event simulasi: partikel, teks melayang, camera shake, hitstop.
// Juga efek per frame: debu ban saat drift, deteksi van lepas landas, cegukan Dionysus.
import { CURSES } from '../sim/curses.js';

const GOLD = '#ffd84a';

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

    // Debu ban saat drift.
    const lateral = Math.abs(car.vx * -Math.cos(car.heading) + car.vz * Math.sin(car.heading));
    this.dustTimer -= dt;
    if (!car.airborne && lateral > 5 && this.dustTimer <= 0) {
      this.dustTimer = 0.04;
      const bx = c.x - Math.sin(car.heading) * 1.6;
      const bz = c.z - Math.cos(car.heading) * 1.6;
      this.particles.emit({ x: bx, y: c.y + 0.3, z: bz, vx: 0, vy: 0.8, vz: 0, life: 0.6, size: 0.5, grow: 1.5, color: '#c9b79a', drag: 2 });
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
