// Main menu sinematik: van menyetir sendiri di belakang menu. Idle ±20 detik → mode pamer (menu memudar,
// tersisa letterbox, logo kecil, dan caption lokasi). Input apa pun memunculkan menu lagi.
import { formatHour } from '../sim/clock.js';

const BOLT = `<svg class="mm-bolt" viewBox="0 0 64 64" aria-hidden="true"><path d="M38 2 14 36h16l-6 26 26-38H34z" fill="currentColor"/></svg>`;
const SANDAL = `<svg class="mm-sandal" viewBox="0 0 120 48" aria-hidden="true"><path d="M8 34c14 6 40 8 70 2l14-6c4-2 8 0 8 4 0 5-6 8-14 10-28 6-60 4-78-6z" fill="currentColor"/><path d="M40 28c-8-2-18-8-30-6 8-8 22-8 34-2zM48 26c-6-6-14-14-28-16 12-4 26 0 36 12z" fill="currentColor" opacity=".8"/></svg>`;

const BACKSTORY =
  'Dulu kamu satu-satunya messenger Zeus dan Hera. Lalu satu paket salah kirim, dan semuanya berantakan. Status dewamu dicabut, sandal bersayapmu disita. Kini kamu mengantar paket para dewa dengan van tua. Penuhi quota profit tiap hari selama 7 hari, lalu pulang ke HQ sebelum badai Zeus.';

// Lokasi terdekat dari posisi van (label map).
export function nearestLabel(world, x, z, maxDist = 260) {
  let best = null;
  let bestD = maxDist;
  for (const l of world.labels) {
    const d = Math.hypot(l.x - x, l.z - z);
    if (d < bestD) {
      bestD = d;
      best = l.text;
    }
  }
  return best;
}

export class MainMenu {
  constructor(root, game, { onStart, onTutorial, onSettings, trained, idleSeconds = 20, blocked = () => false }) {
    this.blocked = blocked;
    this.game = game;
    this.idleSeconds = idleSeconds;
    this.idle = 0;
    this.showcase = false;
    this.index = 0;
    this.visible = true;
    this.label = '';
    this.el = document.createElement('div');
    this.el.className = 'mainmenu';
    this.el.innerHTML = `
      <div class="mm-vignette"></div>
      <div class="mm-bars top"></div><div class="mm-bars bottom"></div>
      <header class="mm-logo">
        <div class="mm-mark">${SANDAL}${BOLT}</div>
        <h1><span>HERMES</span><span class="ex">EXPRESS</span></h1>
        <p>Antar paket para dewa. Sebelum Zeus marah.</p>
      </header>
      <nav class="mm-buttons" aria-label="Menu utama">
        <button data-act="start" class="mm-primary">▶ Mulai</button>
        <button data-act="tutorial">${trained ? '🎓 Ulangi pelatihan' : '🎓 Pelatihan'}</button>
        <button data-act="settings">⚙ Pengaturan</button>
        <button data-act="showcase">🎬 Mode pamer</button>
      </nav>
      <button class="mm-info" data-act="info" aria-label="Cerita">ⓘ</button>
      <aside class="mm-story hidden"><p>${BACKSTORY}</p><p class="muted"><kbd>W</kbd><kbd>S</kbd><kbd>A</kbd><kbd>D</kbd> setir · <kbd>Space</kbd> drift · <kbd>E</kbd> ambil/antar · <kbd>V</kbd> kamera</p></aside>
      <div class="mm-caption"><b class="mm-place"></b><span class="mm-clock"></span></div>
      <div class="mm-hint">Tekan tombol apa saja untuk kembali ke menu</div>
      <div class="mm-fade"></div>`;
    root.appendChild(this.el);
    this.buttons = [...this.el.querySelectorAll('.mm-buttons button')];
    this.placeEl = this.el.querySelector('.mm-place');
    this.clockEl = this.el.querySelector('.mm-clock');
    this.fadeEl = this.el.querySelector('.mm-fade');
    this.storyEl = this.el.querySelector('.mm-story');
    const actions = {
      start: onStart,
      tutorial: onTutorial,
      settings: onSettings,
      showcase: () => this.setShowcase(true),
      info: () => this.storyEl.classList.toggle('hidden'),
    };
    this.actions = actions;
    for (const b of this.el.querySelectorAll('[data-act]')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        actions[b.dataset.act]?.();
      });
      b.addEventListener('mouseenter', () => this.focus(this.buttons.indexOf(b)));
    }
    this.keydown = (e) => {
      if (!this.visible || this.blocked()) return;
      if (this.showcase) {
        this.wake();
        e.preventDefault();
        return;
      }
      this.idle = 0;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') this.focus(this.index + 1);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.focus(this.index - 1);
      else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.buttons[this.index]?.click();
      }
    };
    this.poke = () => {
      if (!this.visible || this.blocked() || this.wakeGrace > 0) return;
      if (this.showcase) this.wake();
      else this.idle = 0;
    };
    window.addEventListener('keydown', this.keydown, true);
    window.addEventListener('pointerdown', this.poke);
    window.addEventListener('mousemove', this.poke);
    this.focus(0);
  }

  focus(i) {
    this.index = (i + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, n) => b.classList.toggle('focus', n === this.index));
  }

  setShowcase(on) {
    this.showcase = on;
    this.idle = 0;
    this.el.classList.toggle('showcase', on);
    this.onShowcase?.(on);
  }

  wake() {
    this.setShowcase(false);
    this.focus(0); // bangun dari mode pamer: fokus kembali ke ▶ Mulai
    this.wakeGrace = 0.4; // abaikan gerakan mouse sisa saat baru bangun
  }

  destroy() {
    window.removeEventListener('keydown', this.keydown, true);
    window.removeEventListener('pointerdown', this.poke);
    window.removeEventListener('mousemove', this.poke);
    this.el.remove();
    this.visible = false;
  }

  update(dt) {
    if (!this.visible) return;
    const { game } = this;
    this.wakeGrace = Math.max(0, (this.wakeGrace ?? 0) - dt);
    const hidden = this.blocked();
    this.el.classList.toggle('away', hidden);
    if (!this.showcase && !hidden) {
      this.idle += dt;
      if (this.idle >= this.idleSeconds) this.setShowcase(true);
    }
    const car = game.car;
    const place = nearestLabel(game.world, car.x, car.z) ?? 'JALAN RAYA';
    if (place !== this.label) {
      this.label = place;
      this.placeEl.textContent = place;
      this.placeEl.classList.remove('swap');
      void this.placeEl.offsetWidth;
      this.placeEl.classList.add('swap');
    }
    const h = game.clock.hour;
    this.clockEl.textContent = `${h >= 6 && h < 17.5 ? '☀' : h < 20 ? '🌇' : '🌙'} ${formatHour(h)}`;
    // Fade hitam menutup lonjakan jam saat siklus kembali ke pagi.
    const a = game.cfg.attract;
    const into = game.attractTime % a.cycleSeconds;
    const toWrap = a.cycleSeconds - into;
    const after = game.attractTime >= a.cycleSeconds && into < 1.2 ? 1 - into / 1.2 : 0;
    const fade = Math.max(after, toWrap < 0.8 ? 1 - toWrap / 0.8 : 0);
    this.fadeEl.style.opacity = fade.toFixed(2);
  }
}
