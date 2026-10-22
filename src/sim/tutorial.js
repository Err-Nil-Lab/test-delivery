// Hari Pelatihan (FTUE): Hestia, manajer HQ, memandu langkah demi langkah sebelum Day 1.
// Selama pelatihan jam berhenti, tanpa petir/badai, tanpa Minotaur & Iris, dan paket hanya dimunculkan
// oleh langkah tutorial. Tiap pergantian langkah memancarkan `tutorial_step` untuk UI (dialog, spotlight,
// strip objektif). Langkah dialog menunggu konfirmasi pemain (Enter) lewat confirm().
import { resample, distance } from './geometry.js';

export const TUTORIAL_QUOTA = 100;

// Titik paket terdekat dari van yang jaraknya minimal `min` dan belum dipakai paket lain.
function nearPoint(game, min) {
  const { car, packages } = game;
  const free = packages.freePoints().filter((p) => distance(p, car) >= min && (p.district === 'housing' || p.district === 'city'));
  return free.reduce((a, b) => (!a || distance(b, car) < distance(a, car) ? b : a), null);
}

function spawnLesson(game, type) {
  const { packages, cfg } = game;
  const pkg = packages.spawnAt(type, nearPoint(game, 30));
  if (!pkg) return null;
  pkg.lifetime = Infinity;
  // Tujuan latihan: titik terdekat (≥ 45 m) di kota/perumahan, bukan acak ke seberang map.
  const used = new Set([...packages.waiting, ...packages.cargo].map((p) => p.dest.id));
  const options = game.world.points.filter(
    (p) => p.id !== pkg.pickup.id && !used.has(p.id) && p.district !== 'mountain' && p.district !== 'field' && distance(p, pkg.pickup) >= 45,
  );
  const dest = options.reduce((a, b) => (!a || distance(b, pkg.pickup) < distance(a, pkg.pickup) ? b : a), null);
  if (dest) {
    pkg.dest = dest;
    const mult = type === 'safe' ? 1 : cfg.packages[type].payMultiplier;
    pkg.pay = pkg.basePay = Math.round((packages.safePay(pkg.pickup, dest) * mult) / 5) * 5;
    if (type === 'fragile') pkg.condition = 1;
  }
  if (type === 'express') {
    const e = cfg.packages.express;
    // Kilat latihan sedikit lebih longgar.
    pkg.timeLimit = Math.round((e.baseSeconds + e.secondsPerUnit * distance(pkg.pickup, pkg.dest)) * 1.5);
  }
  return pkg;
}

const delivered = (game, pkg) => pkg && game.packages.delivered.includes(pkg);
const carried = (game, pkg) => pkg && game.packages.cargo.includes(pkg);

export const STEPS = [
  {
    id: 'welcome',
    speaker: 'hestia',
    text: 'Selamat datang di Hermes Express! Aku Hestia, manajer HQ. Tenang, hari ini cuma latihan: tanpa jam, tanpa petir.',
    waitConfirm: true,
  },
  {
    id: 'drive',
    speaker: 'hestia',
    text: 'Pakai W untuk gas, S untuk rem atau mundur, A dan D untuk belok. Keluar dari HQ ke penanda biru di jalan.',
    objective: 'Setir ke penanda biru',
    enter(game, t) {
      // Penanda di jalan utama, ±30 m dari pintu HQ ke arah kota.
      const road = game.world.roads.find((r) => r.id === 'main-ew');
      const from = game.world.ref.outsideHQ;
      const pts = resample(road.points, 2, road.closed);
      const p = pts.find((q) => q.x > from.x && distance(q, from) >= 30) ?? from;
      t.target = { x: p.x, z: p.z, kind: 'waypoint', label: 'Penanda latihan', radius: 7 };
    },
    done: (game, t) => distance(game.car, t.target) <= t.target.radius,
  },
  {
    id: 'gps',
    speaker: 'hestia',
    text: 'Lihat panah di jalan? Itu GPS. Ikuti terus sampai ke paket yang menunggu.',
    objective: 'Ikuti panah GPS ke paket',
    spotlight: 'objective',
    enter(game, t) {
      t.pkg = spawnLesson(game, 'safe');
      t.target = null;
    },
    done: (game, t) => distance(game.car, t.pkg.pickup) <= game.cfg.packages.pickupRadius + 1,
  },
  {
    id: 'pickup',
    speaker: 'hestia',
    text: 'Berhenti di dalam lingkaran, lalu tekan E untuk mengambil paket.',
    objective: 'Berhenti, lalu tekan E',
    spotlight: 'prompt',
    done: (game, t) => carried(game, t.pkg) || delivered(game, t.pkg),
  },
  {
    id: 'deliver',
    speaker: 'hestia',
    text: 'Paketnya sudah di cargo (kanan atas). Sekarang antar ke tujuannya: ikuti panah lagi, berhenti, tekan E.',
    objective: 'Antar paket ke tujuannya',
    spotlight: 'cargo',
    done: (game, t) => delivered(game, t.pkg),
  },
  {
    id: 'profit',
    speaker: 'hestia',
    text: 'Bayarannya masuk ke bar PROFIT. Tiap hari profit harus melewati garis putih: itu quota. Tabrakan bikin biaya repair, dan itu memotong profit.',
    spotlight: 'profit',
    waitConfirm: true,
  },
  {
    id: 'fragile',
    speaker: 'hestia',
    text: 'Paket rapuh 🏺 bayarannya besar, tapi tiap benturan bikin retak dan bayarannya turun. Tiga kali kena: pecah! Ambil dan antar dengan halus.',
    objective: 'Ambil & antar paket 🏺 tanpa menabrak',
    spotlight: 'cargo',
    enter(game, t) {
      t.pkg = spawnLesson(game, 'fragile');
    },
    done: (game, t) => delivered(game, t.pkg),
  },
  {
    id: 'express',
    speaker: 'hestia',
    text: 'Paket kilat ⏱️ punya batas waktu sejak diambil; hitung mundurnya ada di slot cargo. Telat = bayarannya tinggal setengah.',
    objective: 'Ambil & antar paket ⏱️ sebelum waktunya habis',
    spotlight: 'cargo',
    enter(game, t) {
      t.pkg = spawnLesson(game, 'express');
    },
    done: (game, t) => delivered(game, t.pkg),
  },
  {
    id: 'zeus',
    speaker: 'hestia',
    text: 'Paket ⚡ Zeus selalu diambil di Gerbang Istana dan diantar ke Electrical Plant di puncak gunung. Selama membawanya kamu kebal petir. Besok pagi kamu langsung mengantarnya!',
    waitConfirm: true,
    enter(game) {
      const w = game.world;
      game.bus.emit('tutorial_cinematic', {
        shots: [
          { x: w.zeusPickup.x, z: w.zeusPickup.z, zoom: 0.9, seconds: 3, caption: 'Gerbang Istana Zeus: paket ⚡ diambil di sini' },
          { x: w.plant.dropoff.x, z: w.plant.dropoff.z, zoom: 0.9, seconds: 3, caption: 'Electrical Plant di puncak gunung: antar ke sini' },
        ],
      });
      game.bus.emit('tutorial_zeus', { mood: 'smirk', text: 'Paketku lebih penting dari paket siapa pun. Jangan terlambat… ⚡' });
    },
  },
  {
    id: 'home',
    speaker: 'hestia',
    text: 'Terakhir: lihat bar waktu di kiri atas. Senja jam 18, dan jam 20 badai Zeus memburu! Sebelum itu pulang ke HQ, berhenti, lalu tekan E.',
    objective: 'Pulang ke HQ, berhenti, tekan E',
    spotlight: 'time',
    enter(game, t) {
      const hq = game.world.hq.spawn;
      t.target = { x: hq.x, z: hq.z, kind: 'hq', label: 'HQ' };
    },
  },
];

export class TutorialDirector {
  constructor(game) {
    this.game = game;
    this.index = -1;
    this.target = null; // tujuan khusus langkah ini (dipakai GPS, panah, strip objektif, penanda)
    this.pkg = null; // paket latihan langkah ini
    this.finished = false;
    const on = (e, fn) => game.bus.on(e, (p) => game.tutorial === this && fn(p));
    // Paket rapuh pecah: beri paket baru, langkah tetap.
    on('fragile_broken', () => {
      if (this.step?.id !== 'fragile') return;
      this.pkg = spawnLesson(game, 'fragile');
      this.note('Pecah! Tidak apa-apa, ini latihan. Coba lagi dengan paket baru, pelan-pelan.');
    });
    on('express_late', () => this.step?.id === 'express' && this.note('Telat: bayarannya tinggal setengah. Tidak apa, ini latihan. Antar saja sampai selesai!'));
  }

  get step() {
    return STEPS[this.index] ?? null;
  }

  get objective() {
    const s = this.step;
    if (!s?.objective) return '';
    // Langkah paket: objektif menyesuaikan apakah paketnya sudah dibawa.
    if ((s.id === 'fragile' || s.id === 'express') && carried(this.game, this.pkg)) return s.id === 'fragile' ? 'Antar paket 🏺 tanpa menabrak' : 'Antar paket ⏱️ sebelum waktunya habis';
    return s.objective;
  }

  start() {
    this.next();
  }

  next() {
    this.index += 1;
    const s = this.step;
    if (!s) return;
    this.target = null;
    s.enter?.(this.game, this);
    this.emitStep();
  }

  emitStep(text = this.step.text) {
    const s = this.step;
    this.game.bus.emit('tutorial_step', {
      id: s.id,
      index: this.index,
      total: STEPS.length,
      speaker: s.speaker,
      text,
      objective: this.objective,
      spotlight: s.spotlight ?? null,
      waitConfirm: Boolean(s.waitConfirm),
    });
  }

  // Catatan tambahan di langkah yang sama (mis. paket pecah).
  note(text) {
    this.emitStep(text);
  }

  // Pemain menekan Enter pada langkah dialog.
  confirm() {
    if (this.step?.waitConfirm) this.next();
  }

  update() {
    const s = this.step;
    if (s?.done?.(this.game, this)) this.next();
  }

  // Pemain berhenti di HQ dan menekan E.
  atHQ() {
    if (this.step?.id !== 'home') return false;
    this.finished = true;
    return true;
  }
}
