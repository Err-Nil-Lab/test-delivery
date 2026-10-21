// Bootstrap: game loop fixed-step 60 Hz, menyambungkan simulasi, render, dan UI.
import './ui/style.css';
import { Game } from './sim/game.js';
import { RUN_STATE } from './sim/run.js';
import { Input } from './input.js';
import { View } from './render/scene.js';
import { Hud } from './ui/hud.js';
import { Screens, downloadJSON } from './ui/screens.js';
import { createDebugPanel } from './ui/debug.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);

const app = document.getElementById('app');
const game = new Game({ seed });
const input = new Input(window);
const view = new View(app, game);
const hud = new Hud(app, game, view);
const screens = new Screens(app);
createDebugPanel(game, { visible: params.has('debug') });

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
  screens.showPause({
    onResume: togglePause,
    onRestart: restartRun,
    onDownload: downloadLog,
  });
}

game.bus.on('day_end', () => {
  screens.showReport(game.run.lastReport, game.run, {
    onContinue: () => {
      const outcome = game.advance();
      if (outcome === 'win') {
        screens.showWin(game.run, { onRestart: restartRun, onDownload: downloadLog });
      } else {
        screens.hide();
      }
    },
  });
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') togglePause();
});

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (game.run.state === RUN_STATE.DAY && !paused) {
    acc += dt * game.timeScale;
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
