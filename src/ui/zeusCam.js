// "Zeus LIVE": kamera reaksi Zeus di pojok layar. Muncul saat momen penting (senja, masuk wilayahnya,
// paket Zeus), dan terus siaran langsung selama badai: teriak "BALIK!", tertawa saat petir kena,
// kesal saat van lolos ke HQ. Semua kalimat dipicu dari event bus + keadaan game (UI saja).

const LINES = {
  dusk: { mood: 'smirk', lines: ['Matahari sudah turun, kurir kecil… 😏', 'Jam 8 nanti aku turun tangan. Siap-siap ya~', 'Senja yang indah. Sayang sebentar lagi badai. HEHE'] },
  storm: { mood: 'furious', lines: ['BALIK! BALIK! BALIK KE HQ!', 'SUDAH JAM 8! PULANG SANA, MORTAL!', 'WAKTUNYA BADAI! LARIII!'] },
  far: { mood: 'laugh', lines: ['Masih jauh banget dari HQ? HAHAHA', 'Lari, kurir, LARI!', 'Petir gratis untukmu! ⚡', 'Ayo dong, lebih cepat! HAHA'] },
  mid: { mood: 'angry', lines: ['Aku melihatmu… 👁️', 'Kecepatanmu payah sekali!', 'Belok kiri? Salah. HAHA', 'Van tua itu tidak akan selamat!'] },
  near: { mood: 'annoyed', lines: ['Ugh, sedikit lagi dia lolos…', 'JANGAN BERANI-BERANI MASUK HQ!', 'Tidak, tidak, TIDAK!'] },
  nearMiss: { mood: 'laugh', lines: ['HAMPIR!', 'Meleset… kali ini.', 'Ups, tanganku licin ⚡', 'Hampir gosong! HAHA'] },
  hit: { mood: 'laugh', lines: ['KENA! HAHAHAHA', 'RASAKAN!', 'Itu baru pemanasan!', 'Bayar bengkelnya ya~ 💸'] },
  blocked: { mood: 'annoyed', lines: ['Cih. Paketku melindungimu.', 'Curang… itu paketku sendiri!', 'Grr. Petirku mental.'] },
  zone: { mood: 'angry', lines: ['Siapa itu di wilayahku?!', 'Gunungku bukan jalan pintas!', 'Berani-beraninya naik ke sini!'] },
  zeusPickup: { mood: 'smirk', lines: ['Bawa paketku baik-baik. Jangan tergores.', 'Itu barang penting. HATI-HATI.', 'Kalau rusak, kau tahu akibatnya ⚡'] },
  zeusDelivered: { mood: 'smirk', lines: ['Bagus. Sekarang kau tak terlindung lagi… 😈', 'Terima kasih. Sekarang… lari.'] },
  safe: { mood: 'annoyed', lines: ['Huh. Lolos kali ini…', 'Besok aku lebih cepat.', 'Hmph. Beruntung saja.'] },
  landing: { mood: 'laugh', lines: ['Mendarat yang indah. HAHA', 'Sepuluh dari sepuluh! 🤣'] },
  ram: { mood: 'laugh', lines: ['Sapi-sapiku menyapamu!', 'MOOO! HAHAHA'] },
  stolen: { mood: 'laugh', lines: ['HAHA! Iris lebih cepat darimu!', 'Paketmu diambil saingan! 😂', 'Kalah cepat sama Iris. Memalukan~'] },
  dropped: { mood: 'smirk', lines: ['Senggolan yang bagus. Hmph.', 'Wah, kau bisa juga nakal 😏', 'Iris pasti kesal. HEHE'] },
  midnight: { mood: 'furious', lines: ['TENGAH MALAM SEBENTAR LAGI!', 'Mau diderek? HAHAHA'] },
};

// Wajah Zeus (SVG). Alis dan mulut berganti per suasana hati; mulut terbuka-tutup saat bicara.
const BROWS = {
  smirk: 'M24 30 L34 28 M46 27 L56 31',
  angry: 'M24 27 L35 32 M45 32 L56 27',
  furious: 'M23 25 L36 33 M44 33 L57 25',
  laugh: 'M24 28 Q30 24 35 28 M45 28 Q50 24 56 28',
  annoyed: 'M24 30 L35 30 M45 28 L56 31',
};
const MOUTH_OPEN = {
  smirk: 'M33 49 Q42 55 49 46',
  angry: 'M33 51 Q40 46 47 51 Q40 57 33 51',
  furious: 'M31 50 Q40 44 49 50 Q40 60 31 50',
  laugh: 'M31 47 Q40 47 49 47 Q40 60 31 47',
  annoyed: 'M34 51 Q40 49 46 51',
};
const MOUTH_SHUT = {
  smirk: 'M33 49 Q42 53 49 46',
  angry: 'M33 51 Q40 48 47 51',
  furious: 'M32 51 Q40 47 48 51',
  laugh: 'M32 48 Q40 54 48 48',
  annoyed: 'M34 51 L46 51',
};

function face() {
  return `
  <svg viewBox="0 0 80 80" class="zeus-face" aria-hidden="true">
    <defs>
      <radialGradient id="zeus-sky" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#5b5fa8"/><stop offset="1" stop-color="#23234a"/></radialGradient>
    </defs>
    <rect width="80" height="80" fill="url(#zeus-sky)"/>
    <path class="zeus-bolt" d="M64 6 L58 18 L63 18 L56 31 L68 15 L62 15 L67 6 Z" fill="#ffd84a"/>
    <g fill="#f4f1ea">
      <circle cx="22" cy="24" r="9"/><circle cx="32" cy="16" r="10"/><circle cx="46" cy="15" r="10"/><circle cx="57" cy="23" r="9"/>
    </g>
    <ellipse cx="40" cy="36" rx="17" ry="18" fill="#f1c9a5"/>
    <g fill="#f4f1ea">
      <circle cx="25" cy="50" r="9"/><circle cx="55" cy="50" r="9"/><circle cx="31" cy="60" r="10"/><circle cx="49" cy="60" r="10"/><circle cx="40" cy="66" r="11"/>
    </g>
    <ellipse cx="40" cy="45" rx="11" ry="5" fill="#f4f1ea"/>
    <circle cx="33" cy="35" r="2.6" fill="#1d1d26"/><circle cx="47" cy="35" r="2.6" fill="#1d1d26"/>
    <path class="zeus-brows" d="" stroke="#e9e6df" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <path class="zeus-mouth" d="" stroke="#5a2a2a" stroke-width="2" fill="#7a2f2f" stroke-linejoin="round"/>
    <rect x="16" y="2" width="48" height="5" rx="2" fill="#e8c15a" opacity="0.9"/>
  </svg>`;
}

// Potret Zeus statis dengan ekspresi tertentu (dipakai cutscene & dialog).
export function zeusPortrait(mood = 'angry') {
  return face().replace('class="zeus-brows" d=""', `class="zeus-brows" d="${BROWS[mood]}"`).replace('class="zeus-mouth" d=""', `class="zeus-mouth" d="${MOUTH_OPEN[mood]}"`);
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class ZeusCam {
  constructor(root, game, { cfg, calm = false, onSpeak = null } = {}) {
    this.game = game;
    this.cfg = cfg;
    this.calm = calm;
    this.onSpeak = onSpeak;
    this.enabled = cfg.enabled;
    this.el = document.createElement('div');
    this.el.className = 'zeus-cam hidden';
    this.el.innerHTML = `
      <div class="zeus-frame">${face()}<span class="zeus-live">● LIVE</span></div>
      <div class="zeus-side"><div class="zeus-name">ZEUS ⚡ <small>Raja Olympus</small></div><div class="zeus-bubble"></div></div>`;
    root.appendChild(this.el);
    this.bubble = this.el.querySelector('.zeus-bubble');
    this.brows = this.el.querySelector('.zeus-brows');
    this.mouth = this.el.querySelector('.zeus-mouth');
    this.text = '';
    this.shown = 0; // jumlah huruf yang sudah diketik
    this.hold = 0; // detik kalimat tetap terlihat
    this.priority = 0;
    this.mood = 'smirk';
    this.cooldown = 0; // jeda antar reaksi kecil (petir meleset, dsb.)
    this.tauntTimer = 2;
    this.time = 0;
    this.wasZone = false;
    this.wasHQ = true;
    this.midnightSaid = false;
    this.setMood('smirk');

    const on = (event, fn) => game.bus.on(event, fn);
    const storm = () => game.clock.phase === 'storm';
    on('day_start', () => {
      this.hide();
      this.midnightSaid = false;
      this.wasHQ = true;
    });
    on('day_end', () => this.hide());
    on('phase', ({ phase }) => {
      if (phase === 'dusk') this.say('dusk', 2);
      if (phase === 'storm') this.say('storm', 3, 4);
    });
    on('strike', (s) => {
      if (s.hit || s.kind === 'ambient') return;
      const d = Math.hypot(s.x - game.car.x, s.z - game.car.z);
      if (d < cfg.nearMissRadius) this.react('nearMiss');
    });
    on('strike_hit', ({ blocked }) => this.say(blocked ? 'blocked' : 'hit', 2));
    on('blessing_gained', () => this.say('zeusPickup', 2));
    on('blessing_lost', () => this.say('zeusDelivered', 2));
    on('hard_landing', () => storm() && this.react('landing'));
    on('minotaur_hit', () => storm() && this.react('ram'));
    on('package_stolen', () => this.say('stolen', 2));
    on('package_dropped', () => this.say('dropped', 2));
    // Titah dewa harian diumumkan Zeus sendiri.
    on('day_modifier', ({ icon, zeus }) => this.sayText('smirk', `${icon} ${zeus}`, 3, 4.5));
  }

  setMood(mood) {
    this.mood = mood;
    this.el.dataset.mood = mood;
    this.brows.setAttribute('d', BROWS[mood]);
    this.mouth.setAttribute('d', MOUTH_SHUT[mood]);
  }

  // Reaksi kecil (sering terjadi): dibatasi cooldown supaya tidak cerewet.
  react(key) {
    if (this.cooldown > 0) return;
    this.say(key, 1);
  }

  say(key, priority = 1, hold = this.cfg.holdSeconds) {
    const { mood, lines } = LINES[key];
    this.sayText(mood, pick(lines), priority, hold);
  }

  sayText(mood, text, priority = 1, hold = this.cfg.holdSeconds) {
    if (!this.enabled || this.game.run.state !== 'day') return;
    // Kalimat penting tidak dipotong kalimat yang kurang penting.
    if (this.hold > 0 && priority < this.priority) return;
    this.text = text;
    this.shown = 0;
    this.hold = hold;
    this.priority = priority;
    this.cooldown = this.cfg.cooldown;
    this.setMood(mood);
    this.bubble.textContent = '';
    this.el.classList.remove('hidden');
    this.el.classList.remove('pop');
    void this.el.offsetWidth; // ulang animasi masuk
    this.el.classList.add('pop');
    this.el.classList.toggle('shake', !this.calm && (mood === 'furious' || mood === 'angry'));
    this.onSpeak?.(mood, this.text);
  }

  hide() {
    this.el.classList.add('hidden');
    this.hold = 0;
    this.priority = 0;
  }

  update(dt, { paused = false } = {}) {
    const { game } = this;
    if (!this.enabled || game.run.state !== 'day') {
      this.el.classList.add('hidden');
      return;
    }
    if (paused) return;
    this.time += dt;
    this.cooldown -= dt;
    const storm = game.clock.phase === 'storm';
    const inHQ = game.inHQ;

    // Masuk wilayah petir di siang hari.
    const inZone = !storm && game.inZeusZone;
    if (inZone && !this.wasZone) this.say('zone', 2);
    this.wasZone = inZone;

    if (storm) {
      if (inHQ && !this.wasHQ) this.say('safe', 3, 3.5);
      // Ejekan berkala menurut jarak ke HQ.
      this.tauntTimer -= dt;
      if (!inHQ && this.tauntTimer <= 0 && this.hold <= 0) {
        this.tauntTimer = this.cfg.tauntEvery[0] + Math.random() * (this.cfg.tauntEvery[1] - this.cfg.tauntEvery[0]);
        const hq = game.world.hq.spawn;
        const d = Math.hypot(game.car.x - hq.x, game.car.z - hq.z);
        this.say(d > 120 ? 'far' : d > 40 ? 'mid' : 'near', 1);
      }
      if (game.clock.hour >= 23.4 && !this.midnightSaid && !inHQ) {
        this.midnightSaid = true;
        this.say('midnight', 3);
      }
    }
    this.wasHQ = inHQ;

    // Mengetik kalimat + mulut bergerak.
    if (this.shown < this.text.length) {
      this.shown = Math.min(this.text.length, this.shown + dt * 38);
      this.bubble.textContent = this.text.slice(0, Math.ceil(this.shown));
      const open = Math.floor(this.time * 9) % 2 === 0;
      this.mouth.setAttribute('d', open ? MOUTH_OPEN[this.mood] : MOUTH_SHUT[this.mood]);
    } else {
      // Tertawa: mulut tetap terbuka lebar.
      this.mouth.setAttribute('d', this.mood === 'laugh' ? MOUTH_OPEN.laugh : MOUTH_SHUT[this.mood]);
      this.hold -= dt;
    }
    if (this.hold <= 0 && this.shown >= this.text.length) {
      this.priority = 0;
      this.el.classList.remove('shake');
      // Selama badai kamera tetap siaran (tanpa gelembung); di luar badai menghilang.
      if (storm && !inHQ) {
        this.bubble.textContent = '';
        this.el.classList.add('idle');
      } else this.el.classList.add('hidden');
    } else this.el.classList.remove('idle');
  }
}
