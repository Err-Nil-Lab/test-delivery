// Pengaturan pemain (menu di layar pause), disimpan di browser.
// Parameter URL (?drift=0, ?npc=0, ?zeus=0, ?calm=1) tetap bisa dipakai dan menimpa untuk sesi itu.
const KEY = 'hex.settings';

export const SETTINGS_FIELDS = [
  { key: 'gps', label: 'GPS: garis rute di jalan', hint: 'G', type: 'toggle' },
  { key: 'drift', label: 'Drift / handbrake (Space)', hint: 'H', type: 'toggle' },
  { key: 'npc', label: 'Penghuni map (mobil, orang, hewan)', type: 'toggle' },
  { key: 'zeus', label: 'Zeus LIVE (reaksi Zeus)', type: 'toggle' },
  { key: 'calm', label: 'Kurangi guncangan kamera', type: 'toggle' },
  { key: 'master', label: 'Volume utama', type: 'range' },
  { key: 'music', label: 'Musik', type: 'range' },
  { key: 'sfx', label: 'Efek suara', type: 'range' },
];

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    // Pilihan drift lama (tombol H) dari versi sebelumnya.
    const drift = localStorage.getItem('hex.drift');
    return drift === null ? {} : { drift: drift === '1' };
  } catch {
    return {};
  }
}

export function loadSettings(cfg, params) {
  const s = {
    gps: cfg.gps.enabled,
    drift: cfg.car.drift.enabled,
    npc: cfg.npc.enabled,
    zeus: cfg.zeusCam.enabled,
    calm: false,
    master: cfg.audio.master,
    music: cfg.audio.music,
    sfx: cfg.audio.sfx,
    ...read(),
  };
  // Nilai dari URL hanya berlaku untuk sesi ini: tidak ikut disimpan, kecuali pemain mengubahnya sendiri.
  const overridden = new Set();
  for (const key of ['drift', 'npc', 'zeus', 'calm']) {
    if (!params.has(key)) continue;
    s[key] = params.get(key) !== '0';
    overridden.add(key);
  }
  Object.defineProperty(s, 'overridden', { value: overridden, enumerable: false });
  return s;
}

export function saveSettings(s, changedKey = null) {
  s.overridden?.delete(changedKey);
  const stored = read();
  const out = { ...s };
  for (const key of s.overridden ?? []) {
    if (key in stored) out[key] = stored[key];
    else delete out[key];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    // penyimpanan diblokir: pengaturan hanya berlaku sesi ini
  }
}

export function applySettings(s, { game, view, audio, zeusCam }) {
  game.car.driftEnabled = s.drift;
  game.nav.enabled = s.gps;
  if (game.npcEnabled !== s.npc) game.setNpcEnabled(s.npc);
  zeusCam.enabled = s.zeus;
  zeusCam.calm = s.calm;
  view.setCalm(s.calm);
  for (const bus of ['master', 'music', 'sfx']) audio.setVolume(bus, s[bus]);
}
