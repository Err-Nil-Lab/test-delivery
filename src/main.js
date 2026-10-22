// Bootstrap: game loop fixed-step 60 Hz, menyambungkan simulasi, render, dan UI.
import './ui/style.css';
import { Game } from './sim/game.js';
import { RUN_STATE } from './sim/run.js';
import { Input } from './input.js';
import { View } from './render/scene.js';
import { Hud } from './ui/hud.js';
import { Screens, downloadJSON } from './ui/screens.js';
import { createDebugPanel } from './ui/debug.js';
import { AudioEngine } from './audio/audio.js';
import { ZeusCam } from './ui/zeusCam.js';
import { loadSettings, saveSettings, applySettings } from './ui/settings.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);

const app = document.getElementById('app');
const game = new Game({ seed });
const input = new Input(window);
const view = new View(app, game, { calm: params.has('calm') });
const audio = new AudioEngine(game, game.cfg.audio);
// Browser baru mengizinkan suara setelah interaksi pertama pemain.
const unlockAudio = () => audio.unlock();
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
document.addEventListener('click', (e) => {
  if (e.target.closest('.card button')) audio.play('uiClick');
});
view.birds.onScare = (b) => {
  const d = Math.hypot(b.x - game.car.x, b.z - game.car.z);
  audio.play('flap', { vol: Math.max(0.2, 1 - d / 30) });
};
const hud = new Hud(app, game, view);
const zeusCam = new ZeusCam(app, game, {
  cfg: game.cfg.zeusCam,
  calm: params.has('calm'),
  onSpeak: (mood, text) => audio.play('zeusTalk', { mood, syllables: Math.min(10, 3 + Math.round(text.length / 6)) }),
});
const screens = new Screens(app);
// Pengaturan pemain (menu di layar pause, disimpan di browser; parameter URL menimpa untuk sesi ini).
const settings = loadSettings(game.cfg, params);
const applyAll = () => applySettings(settings, { game, view, audio, zeusCam });
applyAll();
const setSetting = (key, value) => {
  settings[key] = value;
  saveSettings(settings, key);
  applyAll();
};
createDebugPanel(game, { visible: params.has('debug'), audio, zeusCam });

let paused = false;

const downloadLog = () => downloadJSON({ seed, ...game.telemetry.toJSON() }, `hermes-express-playtest-${seed}.json`);

function showIntro() {
  screens.showIntro({
    onStart: () => {
      screens.hide();
      game.beginDay();
    },
  });
}

function restartRun() {
  paused = false;
  screens.hide();
  game.bus.emit('run_end', { result: 'restart', wallet: game.run.wallet });
  game.startRun();
  if (game.run.state === RUN_STATE.INTRO) showIntro();
}

function togglePause() {
  if (game.run.state !== RUN_STATE.DAY) return;
  paused = !paused;
  if (!paused) {
    screens.hide();
    return;
  }
  showPauseMenu();
}

function showPauseMenu() {
  screens.showPause({
    onResume: togglePause,
    onRestart: restartRun,
    onDownload: downloadLog,
    onSettings: () => screens.showSettings(settings, { onChange: setSetting, onBack: showPauseMenu }),
  });
}

game.bus.on('day_end', () => {
  const advance = () => {
    const outcome = game.advance();
    if (outcome === 'win') {
      screens.showWin(game.run, { onRestart: restartRun, onDownload: downloadLog });
    } else {
      screens.hide();
    }
  };
  screens.showReport(game.run.lastReport, game.run, {
    onContinue: () => {
      // Lolos dan masih ada hari berikutnya: mampir ke Bengkel Hephaestus dulu.
      if (game.run.lastReport.pass && !game.run.isFinalDay) {
        screens.showShop(game, { onDone: advance });
        return;
      }
      advance();
    },
  });
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') hud.toast(audio.toggleMute() ? '🔇 Suara mati (M)' : '🔊 Suara nyala (M)', '', 1.5);
  if (e.code === 'KeyH') {
    setSetting('drift', !settings.drift);
    hud.toast(settings.drift ? '🛞 Drift nyala: tahan Space (H)' : '🚐 Drift mati: setir normal (H)', '', 1.8);
  }
  if (e.code === 'KeyG') {
    setSetting('gps', !settings.gps);
    hud.toast(settings.gps ? '🧭 GPS nyala (G)' : '🧭 GPS mati (G)', '', 1.5);
  }
});

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (game.run.state === RUN_STATE.DAY && !paused) {
    acc += view.juice.simDelta(dt) * game.timeScale; // hitstop: simulasi berhenti sesaat
    while (acc >= STEP && game.run.state === RUN_STATE.DAY) {
      game.step(STEP, input.controls());
      acc -= STEP;
    }
  } else {
    acc = 0;
    input.clearPresses();
  }
  view.update(dt);
  hud.update(dt);
  zeusCam.update(dt, { paused });
  audio.update(dt, { paused });
  view.render();
  requestAnimationFrame(frame);
}

game.startRun();
showIntro();
requestAnimationFrame(frame);

// Hook untuk smoke test dan debugging dari console.
window.__hex = {
  game,
  view,
  audio,
  zeusCam,
  state: () => ({
    run: game.run.state,
    day: game.run.day,
    hour: game.clock.hour,
    phase: game.clock.phase,
    car: { x: game.car.x, z: game.car.z, speed: game.car.speed },
    cargo: game.packages.cargo.map((p) => p.type),
    blessed: game.packages.blessed,
    strikes: game.hazards.strikes.length,
    screen: screens.current,
  }),
  jumpTo: (hour) => game.clock.setHour(hour),
  giveZeus: () => game.packages.debugGiveZeus(game.car),
  endDay: () => game.endDay(),
};
