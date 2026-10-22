// Panel debug (tombol ` atau ?debug=1): percepat waktu, lompat jam, beri paket Zeus, god mode.
import GUI from 'three/addons/libs/lil-gui.module.min.js';

export function createDebugPanel(game, { visible, audio }) {
  const gui = new GUI({ title: 'Debug (`)' });
  const teleport = (p) => game.car.reset({ x: p.x, z: p.z, heading: Math.PI });
  const state = {
    get info() {
      return `seed ${game.seed} · run ${game.run.runCount}`;
    },
    'Lompat 17:30': () => game.clock.setHour(17.5),
    'Lompat 18:00 (senja)': () => game.clock.setHour(18),
    'Lompat 20:00 (badai)': () => game.clock.setHour(20),
    'Lompat 23:45': () => game.clock.setHour(23.75),
    'Beri paket Zeus': () => game.packages.debugGiveZeus(game.car),
    'Teleport: HQ': () => game.car.reset(game.world.hq.spawn),
    'Teleport: Gerbang Istana': () => teleport(game.world.zeusPickup),
    'Teleport: Padang Minotaur': () => teleport(game.world.ref.meadow),
    'Teleport: kaki gunung': () => teleport(game.world.ref.serpentineFoot),
    'Teleport: plant': () => teleport(game.world.plant.dropoff),
    'Teleport: Gubuk Gembala': () => teleport(game.world.ref.shepherdHut),
    'Teleport: Gubuk Penebang': () => teleport(game.world.ref.woodcutterHut),
    'Beri paket selundupan 🕶️': () => game.packages.debugGiveSmuggle(game.car),
    'Curse: Dionysus 🍷': () => game.packages.debugGiveCurse(game.car, 'dionysus'),
    'Curse: Chronos ⏳': () => game.packages.debugGiveCurse(game.car, 'chronos'),
    'Curse: Hades 💀': () => game.packages.debugGiveCurse(game.car, 'hades'),
    'Curse: Aphrodite 💘': () => game.packages.debugGiveCurse(game.car, 'aphrodite'),
    'Curse: Ares ⚔️': () => game.packages.debugGiveCurse(game.car, 'ares'),
    'Akhiri hari sekarang': () => game.endDay(),
  };
  gui.add(state, 'info').name('Info').disable().listen();
  gui.add(game, 'timeScale', 0.25, 8, 0.25).name('Time scale');
  gui.add(game, 'god').name('God mode (tanpa damage)');
  gui.add(game.car, 'driftEnabled').name('Drift / handbrake (H)').listen();
  const npc = gui.addFolder('Penghuni map (NPC)');
  npc.add(game, 'npcEnabled').name('Semua NPC').onChange((on) => game.setNpcEnabled(on));
  const c = game.cfg.npc;
  npc.add(c.traffic, 'enabled').name('Lalu lintas').onChange(() => game.resetNpcs());
  npc.add(c.pedestrians, 'enabled').name('Pejalan kaki').onChange(() => game.resetNpcs());
  npc.add(c.animals, 'enabled').name('Hewan').onChange(() => game.resetNpcs());
  npc.add(c.birds, 'enabled').name('Burung');
  npc.close();
  for (const key of Object.keys(state)) if (key !== 'info') gui.add(state, key);
  if (audio) {
    const sound = gui.addFolder('Suara (M = mute)');
    for (const bus of ['master', 'sfx', 'music', 'engine']) {
      sound.add(audio.cfg, bus, 0, 1, 0.05).name(bus).onChange((v) => audio.setVolume(bus, v));
    }
    sound.close();
  }
  gui.domElement.classList.add('debug-gui');
  gui.show(visible);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') gui.show(gui._hidden);
  });
  return gui;
}
