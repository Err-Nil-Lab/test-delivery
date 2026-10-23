// AudioEngine: semua suara game. AudioContext baru dibuat setelah input pertama pemain
// (aturan autoplay browser). Mute dengan tombol M. SFX dipicu dari event bus simulasi.
import { SFX, EVENT_SFX } from './sfx.js';
import { EngineSound } from './engine.js';
import { loopNoise } from './synth.js';
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
    // Gumam kota: keramaian samar saat van di distrik yang ramai.
    this.murmur = loopNoise(this.ctx, this.sfx, { filter: 'bandpass', freq: 650, q: 0.8 });
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

  // opts.vol (0..1): pelankan suara ini saja (mis. suara NPC yang jauh).
  play(name, opts) {
    if (!this.ready || !SFX[name]) return;
    try {
      let out = this.sfx;
      if (opts?.vol !== undefined) {
        out = this.ctx.createGain();
        out.gain.value = opts.vol;
        out.connect(this.sfx);
      }
      SFX[name](this.ctx, out, opts);
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
    const attract = game.run.state === 'intro' && game.attractActive;
    const inDay = (game.run.state === 'day' && !paused) || attract;
    const fx = game.effects ?? game.packages.effects;
    this.engine.update(dt, { car: game.car, damageState: game.damage.state, active: inDay && !game.car.paralyzed }); // mesin mati saat lumpuh
    // Tengah malam: musik berhenti total dari sambaran sampai laporan (hanya guntur & derek).
    const hushed = game.midnight.active && ['paralyzed', 'arrive', 'hook', 'tow'].includes(game.midnight.phase);
    // Menu: musik mengikuti jam map (siang → senja), tanpa mood badai.
    const phase = attract ? game.clock.phaseAt(game.clock.hour) : game.clock.phase;
    this.music.setMood(inDay && !hushed ? (phase === 'day' ? 'day' : phase === 'dusk' || attract ? 'dusk' : 'storm') : null);
    this.music.setModifiers({ dark: Boolean(fx.visionRadius), drunk: fx.steerDelay > 0 });
    this.music.update();
    // Paket kilat: detak tiap detik di 5 detik terakhir.
    const express = game.packages.cargo.find((p) => p.type === 'express' && !p.late);
    const sec = express ? Math.ceil(express.timeLeft) : null;
    if (inDay && sec !== null && sec <= 5 && sec !== this.lastExpressSec) this.play('tick');
    this.lastExpressSec = sec;
    const { car, world } = game;
    const busy =
      inDay && game.npcEnabled && game.clock.phase !== 'storm' && world.paved.some((e) => ((car.x - e.cx) / e.rx) ** 2 + ((car.z - e.cz) / e.rz) ** 2 <= 1);
    this.murmur.gain.setTargetAtTime(busy ? 0.035 : 0, this.ctx.currentTime, 0.8);
    // Chronos: detak jam cepat selama kutukan aktif.
    this.tickTimer -= dt;
    if (inDay && fx.clockMultiplier > 1 && this.tickTimer <= 0) {
      this.tickTimer = 0.25;
      this.play('tick');
    }
  }
}
