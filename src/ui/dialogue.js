// Kotak dialog tutorial (Hestia memandu, Zeus sesekali nyeletuk): potret, nama, teks yang diketik,
// dan "Enter ▸" saat langkah menunggu konfirmasi. Juga dipakai untuk caption cutscene.
import { zeusPortrait } from './zeusCam.js';

// Wajah Hestia (SVG): rambut cokelat bersanggul, selendang oranye, api tungku, latar hangat.
function hestiaFace(talking = false) {
  const mouth = talking ? 'M34 49 Q40 56 46 49 Q40 52 34 49' : 'M34 49 Q40 54 46 49';
  return `
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <defs><radialGradient id="hestia-bg" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#f6b26b"/><stop offset="1" stop-color="#8a3b12"/></radialGradient></defs>
    <rect width="80" height="80" fill="url(#hestia-bg)"/>
    <path d="M60 10 Q66 18 62 24 Q70 20 68 12 Q64 4 60 10 Z" fill="#ffd27a"/>
    <circle cx="40" cy="15" r="8" fill="#6b3f22"/>
    <ellipse cx="40" cy="38" rx="17" ry="19" fill="#6b3f22"/>
    <ellipse cx="40" cy="40" rx="14" ry="15.5" fill="#f1c9a5"/>
    <path d="M26 33 Q40 18 54 33 Q48 26 40 26 Q32 26 26 33 Z" fill="#6b3f22"/>
    <circle cx="34.5" cy="40" r="2.2" fill="#2b1a10"/><circle cx="45.5" cy="40" r="2.2" fill="#2b1a10"/>
    <path d="M31 35.5 Q34.5 33.5 38 35.5 M42 35.5 Q45.5 33.5 49 35.5" stroke="#4a2a16" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <circle cx="31" cy="46" r="2.6" fill="#f4a6a0" opacity="0.6"/><circle cx="49" cy="46" r="2.6" fill="#f4a6a0" opacity="0.6"/>
    <path d="${mouth}" fill="#8c3a2b" stroke="#6b2a1e" stroke-width="1"/>
    <path d="M14 80 Q18 60 40 58 Q62 60 66 80 Z" fill="#e8742c"/>
    <path d="M30 60 Q40 68 50 60" stroke="#ffd27a" stroke-width="2" fill="none"/>
  </svg>`;
}

export const SPEAKERS = {
  hestia: { name: 'Hestia', role: 'Manajer HQ', portrait: (talking) => hestiaFace(talking), voice: 'hestia' },
  zeus: { name: 'Zeus', role: 'Raja Olympus', portrait: (talking, mood) => zeusPortrait(mood ?? 'angry'), voice: 'zeus' },
  narrator: { name: '', role: '', portrait: null, voice: null },
};

export class Dialogue {
  constructor(root, { onSpeak = null, className = 'dialogue' } = {}) {
    this.onSpeak = onSpeak;
    this.el = document.createElement('div');
    this.el.className = `${className} hidden`;
    this.el.innerHTML = `
      <div class="portrait"></div>
      <div class="body"><div class="who"><b class="name"></b><small class="role"></small><small class="progress"></small></div>
      <div class="text"></div><div class="next">Enter ▸</div></div>`;
    root.appendChild(this.el);
    this.portraitEl = this.el.querySelector('.portrait');
    this.nameEl = this.el.querySelector('.name');
    this.roleEl = this.el.querySelector('.role');
    this.progressEl = this.el.querySelector('.progress');
    this.textEl = this.el.querySelector('.text');
    this.text = '';
    this.shown = 0;
    this.time = 0;
    this.speaker = null;
  }

  get typing() {
    return this.shown < this.text.length;
  }

  // { speaker, text, waitConfirm, progress }
  show({ speaker = 'hestia', text, waitConfirm = false, progress = '', mood = 'smirk' }) {
    const sp = SPEAKERS[speaker] ?? SPEAKERS.narrator;
    this.speaker = sp;
    this.text = text;
    this.shown = 0;
    this.el.classList.remove('hidden');
    this.el.classList.toggle('narrator', !sp.portrait);
    this.el.classList.toggle('wait', waitConfirm);
    this.el.dataset.speaker = speaker;
    this.portraitEl.innerHTML = sp.portrait ? sp.portrait(true, mood) : '';
    this.nameEl.textContent = sp.name;
    this.roleEl.textContent = sp.role;
    this.progressEl.textContent = progress;
    this.textEl.textContent = '';
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
    if (sp.voice) this.onSpeak?.(sp.voice, text, mood);
  }

  // Selesaikan ketikan seketika (Enter pertama saat teks belum selesai).
  finish() {
    this.shown = this.text.length;
    this.textEl.textContent = this.text;
  }

  hide() {
    this.el.classList.add('hidden');
  }

  update(dt) {
    if (this.el.classList.contains('hidden')) return;
    this.time += dt;
    if (this.typing) {
      this.shown = Math.min(this.text.length, this.shown + dt * 42);
      this.textEl.textContent = this.text.slice(0, Math.ceil(this.shown));
      // Mulut Hestia bergerak saat bicara.
      if (this.speaker?.portrait && this.el.dataset.speaker === 'hestia') {
        const talking = Math.floor(this.time * 9) % 2 === 0;
        if (talking !== this.talking) {
          this.talking = talking;
          this.portraitEl.innerHTML = this.speaker.portrait(talking);
        }
      }
    } else if (this.talking && this.el.dataset.speaker === 'hestia') {
      this.talking = false;
      this.portraitEl.innerHTML = this.speaker.portrait(false);
    }
  }
}
