// Bengkel Hephaestus (upgrade yang dibeli di antara hari, berlaku sampai run berakhir)
// dan titah dewa harian (aturan khusus satu hari). Keduanya mengubah salinan config game;
// tiap awal hari config dikembalikan ke aslinya lalu upgrade + titah hari itu diterapkan ulang.

export const UPGRADES = {
  grip: {
    icon: '🛞',
    name: 'Ban Grip Hermes',
    desc: 'Turbo drift lebih cepat terisi (−30% waktu drift).',
    price: 110,
    apply: (c) => c.car.drift.tiers.forEach((t) => (t.seconds *= 0.7)),
  },
  engine: {
    icon: '🔥',
    name: 'Mesin Tempaan Hephaestus',
    desc: 'Kecepatan maksimum +10%, akselerasi +20%.',
    price: 180,
    apply: (c) => {
      c.car.maxSpeed *= 1.1;
      c.car.accel *= 1.2;
    },
  },
  rod: {
    icon: '⚡',
    name: 'Penangkal Petir',
    desc: 'Menahan 1 sambaran petir per hari (terisi lagi tiap pagi).',
    price: 150,
    apply: (c) => (c.damage.lightningRodCharges = 1),
  },
  rack: {
    icon: '📦',
    name: 'Rak Atap',
    desc: 'Cargo +1 slot (3 → 4).',
    price: 200,
    apply: (c) => (c.packages.capacity += 1),
  },
  bumper: {
    icon: '🛡️',
    name: 'Bumper Empuk',
    desc: 'Biaya tabrakan & pendaratan −40%. Paket rapuh retak lebih pelan.',
    price: 130,
    apply: (c) => {
      c.damage.collisionCostPerSpeed *= 0.6;
      c.damage.landingCostPerSpeed *= 0.6;
      c.packages.fragile.lossPerHit = 0.25;
    },
  },
  horn: {
    icon: '📯',
    name: 'Klakson Penjinak Minotaur',
    desc: 'Minotaur lebih lambat sadar dan ancang-ancangnya lebih lama.',
    price: 100,
    apply: (c) => {
      c.minotaur.detectRadius *= 0.7;
      c.minotaur.windup *= 1.4;
    },
  },
  sandals: {
    icon: '🪽',
    name: 'Sandal Bersayap Bekas',
    desc: 'Semua tip bonus gaya ×1,5.',
    price: 160,
    apply: (c) => (c.style.tipMultiplier *= 1.5),
  },
  compass: {
    icon: '🦉',
    name: 'Kompas Athena',
    desc: 'Batas waktu paket Kilat +30%.',
    price: 90,
    apply: (c) => {
      c.packages.express.baseSeconds *= 1.3;
      c.packages.express.secondsPerUnit *= 1.3;
    },
  },
  insurance: {
    icon: '📜',
    name: 'Polis Asuransi Iris',
    desc: 'Tanpa biaya derek dan tanpa denda paket yang belum diantar.',
    price: 120,
    apply: (c) => {
      c.damage.towFee = 0;
      c.packages.undeliveredPenalty = 0;
    },
  },
};

export const DAY_MODS = {
  festival: {
    icon: '🍷',
    name: 'Festival Dionysus',
    desc: 'Jalanan ramai sekali, paket terkutuk 2× lebih sering.',
    zeus: 'Dionysus berpesta lagi. Jalanan penuh pemabuk… HAHA',
    apply: (c, mods) => {
      c.curse.chance = Math.min(0.9, c.curse.chance * 2);
      c.curse.maxPerDay += 2;
      mods.trafficMult = 1.7;
      mods.crowdMult = 1.5;
    },
  },
  hermesOff: {
    icon: '🪽',
    name: 'Hermes Cuti',
    desc: 'Kurir lain libur: semua bayaran paket +20%.',
    zeus: 'Hermes asli sedang cuti. Kesempatanmu, palsu.',
    apply: (c) => (c.packages.payMultiplier *= 1.2),
  },
  poseidon: {
    icon: '🌊',
    name: 'Poseidon Ngambek',
    desc: 'Jalanan licin: grip ban berkurang, gampang tergelincir.',
    zeus: 'Kakakku Poseidon sedang ngambek. Hati-hati licin~',
    apply: (c, mods) => {
      c.car.lateralGrip *= 0.55;
      mods.wet = true;
    },
  },
  zeusAngry: {
    icon: '⚡',
    name: 'Zeus Pemarah',
    desc: 'Badai datang jam 19:00 (1 jam lebih awal), tapi bayaran +25%.',
    zeus: 'Aku sedang kesal. Badai datang LEBIH CEPAT hari ini!',
    apply: (c) => {
      c.time.stormHour -= 1;
      c.packages.payMultiplier *= 1.25;
    },
  },
  ares: {
    icon: '⚔️',
    name: 'Ares Ngamuk',
    desc: 'Semua Minotaur beringas, tapi tip OLÉ! ×3.',
    zeus: 'Anakku Ares sedang mengamuk. Sapi-sapinya ikut gila!',
    apply: (c) => {
      c.minotaur.detectRadius *= 1.6;
      c.minotaur.windup *= 0.65;
      c.minotaur.chargeSpeed *= 1.2;
      c.style.ole.value *= 3;
    },
  },
  chronos: {
    icon: '⏳',
    name: 'Chronos Terburu-buru',
    desc: 'Hari berjalan 25% lebih cepat, tapi bayaran +30%.',
    zeus: 'Chronos memutar jam lebih cepat. Tik tok, kurir!',
    apply: (c) => {
      c.time.realSecondsPerHour *= 0.75;
      c.packages.payMultiplier *= 1.3;
    },
  },
  demeter: {
    icon: '🌾',
    name: 'Panen Demeter',
    desc: 'Banyak paket rapuh berisi hasil panen, bayarannya +30%.',
    zeus: 'Musim panen! Bawa guci-guci Demeter dengan hati-hati.',
    apply: (c) => {
      c.packages.fragile.chance = 0.5;
      c.packages.fragile.maxWaiting = 3;
      c.packages.fragile.payMultiplier *= 1.3;
    },
  },
  hermesRush: {
    icon: '⏱️',
    name: 'Hari Kilat',
    desc: 'Paket kilat di mana-mana, bayarannya +30%.',
    zeus: 'Semua orang terburu-buru hari ini. Cepat, cepat!',
    apply: (c) => {
      c.packages.express.chance = 0.5;
      c.packages.express.maxWaiting = 3;
      c.packages.express.payMultiplier *= 1.3;
    },
  },
};

// Bagian config yang boleh diubah upgrade/titah (dan dikembalikan tiap pagi).
// Bagian lain (audio, npc, gps, zeusCam, juice) sengaja tidak disentuh supaya pengaturan pemain tetap.
export const MUTABLE_SECTIONS = ['car', 'damage', 'packages', 'style', 'minotaur', 'curse', 'time'];

// Salin nilai `src` ke `dst` tanpa mengganti objeknya (sistem lain memegang referensi ke objek ini).
export function restoreInPlace(dst, src) {
  for (const key of Object.keys(dst)) if (!(key in src)) delete dst[key];
  for (const [key, value] of Object.entries(src)) {
    if (value && typeof value === 'object' && dst[key] && typeof dst[key] === 'object' && !Array.isArray(value)) restoreInPlace(dst[key], value);
    else if (Array.isArray(value) && Array.isArray(dst[key]) && value.every((v) => v && typeof v === 'object')) {
      value.forEach((v, i) => (dst[key][i] ? restoreInPlace(dst[key][i], v) : (dst[key][i] = structuredClone(v))));
      dst[key].length = value.length;
    } else dst[key] = structuredClone(value);
  }
}
