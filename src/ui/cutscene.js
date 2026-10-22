// Cutscene: kamera sinematik + letterbox + caption ber-potret. Simulasi berhenti selama diputar.
// Enter = lanjut ke shot berikutnya (atau selesaikan ketikan), Esc / tombol "Lewati" = lewati semua.
import { Dialogue } from './dialogue.js';

// Cutscene pembuka: kenapa Hermes jadi kurir van tua, siapa Hestia, dan tur map singkat.
export function openingShots(world) {
  const label = (text) => world.labels.find((l) => l.text === text) ?? world.hq.spawn;
  const palace = world.zeusPickup;
  return [
    { at: palace, zoom: 0.55, seconds: 3, speaker: 'narrator', text: 'Gunung Olympus. Dulu, Hermes adalah kurir paling cepat para dewa…' },
    { at: palace, zoom: 1.15, seconds: 3, speaker: 'zeus', mood: 'furious', text: 'HERMES! Kado ulang tahun Hera… kau kirim ke HADES?!' },
    { at: palace, zoom: 1.3, seconds: 3.2, speaker: 'zeus', mood: 'angry', text: 'Sandal bersayapmu kusita. Statusmu kucabut. Mulai hari ini kau… MANUSIA BIASA.' },
    { at: world.hq.spawn, zoom: 0.9, seconds: 3, speaker: 'narrator', text: 'Satu-satunya yang mau menerimamu: Hermes Express. Jasa antar paket… dengan van tua.' },
    { at: world.hq.spawn, zoom: 1.2, seconds: 3, speaker: 'hestia', text: 'Tenang, sayang. Aku Hestia, manajer HQ. Di sini kita mulai dari nol.' },
    { at: label('KOTA'), zoom: 0.75, seconds: 1.6, speaker: 'narrator', text: 'Kota: gedung rapat, jalan ramai, banyak pelanggan.' },
    { at: label('PERUMAHAN ARCADIA'), zoom: 0.75, seconds: 1.6, speaker: 'narrator', text: 'Perumahan Arcadia: dekat dengan HQ.' },
    { at: label('PADANG MINOTAUR'), zoom: 0.75, seconds: 1.8, speaker: 'narrator', text: 'Padang Minotaur: jangan berdiri di depan banteng itu.' },
    { at: world.plant.dropoff, zoom: 0.7, seconds: 2, speaker: 'narrator', text: 'Dan di puncak gunung: Electrical Plant milik Zeus.' },
    { at: world.hq.spawn, zoom: 1, seconds: 2.6, speaker: 'hestia', text: 'Penuhi quota selama 7 hari… dan mungkin Zeus memaafkanmu. Ayo latihan dulu!' },
  ];
}

export class Cutscene {
  constructor(root, view, { onSpeak = null } = {}) {
    this.view = view;
    this.el = document.createElement('div');
    this.el.className = 'cutscene hidden';
    this.el.innerHTML = '<div class="bar top"></div><div class="bar bottom"></div><button class="skip">Lewati ▸ (Esc)</button>';
    root.appendChild(this.el);
    this.caption = new Dialogue(this.el, { onSpeak, className: 'dialogue caption' });
    this.el.querySelector('.skip').addEventListener('click', () => this.skip());
    this.shots = [];
    this.index = -1;
    this.timer = 0;
    this.resolve = null;
    window.addEventListener('keydown', (e) => {
      if (!this.playing) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.skip();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (this.caption.typing) this.caption.finish();
        else this.nextShot();
      }
    });
  }

  get playing() {
    return this.resolve !== null;
  }

  // shots: [{ at: {x,z}, zoom, seconds (waktu baca setelah teks selesai diketik), speaker, text, mood }]
  // → Promise saat selesai/dilewati.
  play(shots, { hideHud = true } = {}) {
    this.shots = shots;
    this.index = -1;
    this.el.classList.remove('hidden');
    document.body.classList.toggle('cinematic', hideHud);
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.nextShot(true);
    });
  }

  nextShot(first = false) {
    this.index += 1;
    const shot = this.shots[this.index];
    if (!shot) {
      this.finish();
      return;
    }
    this.timer = shot.seconds;
    this.view.cinematic = { x: shot.at.x, z: shot.at.z, zoom: shot.zoom ?? 1, speed: shot.speed ?? 1.6 };
    if (first) this.view.snapTo?.(shot.at);
    if (shot.text) this.caption.show({ speaker: shot.speaker, text: shot.text, mood: shot.mood });
    else this.caption.hide();
  }

  skip() {
    this.finish();
  }

  finish() {
    if (!this.resolve) return;
    const resolve = this.resolve;
    this.resolve = null;
    this.view.cinematic = null;
    this.caption.hide();
    this.el.classList.add('hidden');
    document.body.classList.remove('cinematic');
    resolve();
  }

  update(dt) {
    if (!this.playing) return;
    this.caption.update(dt);
    // Shot berganti otomatis setelah waktunya habis (dan teks selesai diketik + sempat dibaca).
    if (!this.caption.typing) this.timer -= dt;
    if (this.timer <= 0) this.nextShot();
  }
}
