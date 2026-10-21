// Paket terkutuk (kategori Curse): efek buruk selama paket dibawa, hilang saat diantar.
// "The curse belonged to the package too."
// Angka tuning tiap efek ada di CONFIG.curse.effects.

export const CURSES = {
  dionysus: {
    god: 'Dionysus',
    title: 'Mabuk',
    icon: '🍷',
    desc: 'Setir telat & van oleng',
    color: '#a855f7',
    pickupName: 'Kafe Dionysus',
    destName: 'Aula Istana Zeus', // pesta para dewa
  },
  chronos: {
    god: 'Chronos',
    title: 'Waktu ngebut',
    icon: '⏳',
    desc: 'Jam berjalan lebih cepat',
    color: '#38bdf8',
  },
  hades: {
    god: 'Hades',
    title: 'Gelap',
    icon: '💀',
    desc: 'Pandangan menyempit',
    color: '#64748b',
    destName: 'Dermaga Poseidon', // menyeberang seperti di sungai Styx
  },
  aphrodite: {
    god: 'Aphrodite',
    title: 'Terpikat',
    icon: '💘',
    desc: 'Minotaur jatuh cinta & membuntutimu',
    color: '#f472b6',
    pickupName: 'Butik Aphrodite',
    destName: 'Gubuk Penebang',
  },
  ares: {
    god: 'Ares',
    title: 'Provokasi',
    icon: '⚔️',
    desc: 'Minotaur makin ganas',
    color: '#ef4444',
    pickupName: 'Gym Ares',
    destName: 'Ladang Minotaur',
  },
};

export const CURSE_IDS = Object.keys(CURSES);

// Gabungan efek dari semua paket di cargo. Mode Minotaur mengikuti curse yang diambil terakhir.
export function cargoEffects(cargo, cfg) {
  const fx = {
    lightningImmune: false,
    steerDelay: 0,
    wobble: 0,
    clockMultiplier: 1,
    visionRadius: null,
    minotaurMode: 'normal',
    curses: [],
  };
  for (const pkg of cargo) {
    if (pkg.type === 'zeus') fx.lightningImmune = true;
    if (pkg.type !== 'curse') continue;
    fx.curses.push(pkg.curse);
    const e = cfg.effects[pkg.curse];
    if (pkg.curse === 'dionysus') {
      fx.steerDelay = Math.max(fx.steerDelay, e.steerDelay);
      fx.wobble = Math.max(fx.wobble, e.wobble);
    } else if (pkg.curse === 'chronos') {
      fx.clockMultiplier *= e.clockMultiplier;
    } else if (pkg.curse === 'hades') {
      fx.visionRadius = e.visionRadius;
    } else if (pkg.curse === 'aphrodite') {
      fx.minotaurMode = 'charmed';
    } else if (pkg.curse === 'ares') {
      fx.minotaurMode = 'enraged';
    }
  }
  return fx;
}

// Tampilan paket untuk HUD, marker, dan minimap.
export function packageLook(pkg) {
  if (pkg.type === 'zeus') return { color: '#ffd84a', icon: '⚡', name: 'Zeus' };
  if (pkg.type === 'smuggle') return { color: '#dc2626', icon: '🕶️', name: `Selundupan · scam ${Math.round(pkg.scamChance * 100)}%` };
  if (pkg.type === 'curse') {
    const c = CURSES[pkg.curse];
    return { color: c.color, icon: c.icon, name: `${c.god} · ${c.title}` };
  }
  return { color: '#e9edf5', icon: '', name: 'Safe' };
}
