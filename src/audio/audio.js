// AudioEngine: semua suara game. AudioContext baru dibuat setelah input pertama pemain
// (aturan autoplay browser). Mute dengan tombol M. SFX dipicu dari event bus simulasi.
import { SFX, EVENT_SFX } from './sfx.js';
import { EngineSound } from './engine.js';
import { Music } from './music.js';

export class AudioEngine {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.ctx = null;
    this.muted = !cfg.enabled;
    this.tickTimer = 0;
    for (const [event, pick] of Object.entries(EVENT_SFX)) {
      game.bus.on(event, (payload) => {
        const sfx = pick(payload, game);
        if (sfx) this.play(sfx.name, sfx.opts);
      });
    }
    game.bus.on('day_end', ({ pass }) => this.reportJingle(pass));
  }

  get ready() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  unlock() {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return;
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    this.ctx = new Ctor();
    const bus = (volume, out) => {
      const g = this.ctx.createGain();
      g.gain.value = volume;
      g.connect(out);
      return g;
    };
    this.master = bus(this.muted ? 0 : this.cfg.master, this.ctx.destination);
    this.sfx = bus(this.cfg.sfx, this.master);
    this.musicBus = bus(this.cfg.music, this.master);
    this.engineBus = bus(this.cfg.engine, this.master);
    this.engine = new EngineSound(this.ctx, this.engineBus);
    this.music = new Music(this.ctx, this.musicBus);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : this.cfg.master, this.ctx.currentTime, 0.05);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setVolume(bus, value) {
    this.cfg[bus] = value;
    const node = { master: this.master, sfx: this.sfx, music: this.musicBus, engine: this.engineBus }[bus];
    if (node && !(bus === 'master' && this.muted)) node.gain.value = value;
  }

  play(name, opts) {
    if (!this.ready || !SFX[name]) return;
    try {
      SFX[name](this.ctx, this.sfx, opts);
    } catch (err) {
      console.warn('SFX gagal', name, err);
    }
  }

  // Laporan akhir hari: tick saat angka bergulir, lalu fanfare atau trombon sedih.
  reportJingle(pass) {
    for (let i = 0; i < 8; i++) setTimeout(() => this.play('reportTick'), 100 * i);
    setTimeout(() => this.play(pass ? 'fanfare' : 'sadTrombone'), 950);
  }

  update(dt, { paused }) {
    if (!this.ready) return;
    const { game } = this;
    const inDay = game.run.state === 'day' && !paused;
    const fx = game.effects ?? game.packages.effects;
    this.engine.update(dt, { car: game.car, damageState: game.damage.state, active: inDay });
    this.music.setMood(inDay ? (game.clock.phase === 'day' ? 'day' : game.clock.phase === 'dusk' ? 'dusk' : 'storm') : null);
    this.music.setModifiers({ dark: Boolean(fx.visionRadius), drunk: fx.steerDelay > 0 });
    this.music.update();
    // Chronos: detak jam cepat selama kutukan aktif.
    this.tickTimer -= dt;
    if (inDay && fx.clockMultiplier > 1 && this.tickTimer <= 0) {
      this.tickTimer = 0.25;
      this.play('tick');
    }
  }
}
