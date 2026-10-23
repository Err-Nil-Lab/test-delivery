// Layar overlay: intro, laporan akhir hari, menang, dan pause.
import { formatHour } from '../sim/clock.js';
import { DAMAGE_LABELS } from '../sim/damage.js';
import { SETTINGS_FIELDS } from './settings.js';
import { UPGRADES, DAY_MODS } from '../sim/upgrades.js';

const money = (v) => (v < 0 ? `−$${Math.abs(v)}` : `$${v}`);

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class Screens {
  constructor(root) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'screen hidden';
    root.appendChild(this.overlay);
    this.current = null;
    window.addEventListener('keydown', (e) => {
      if (!this.current || e.code !== 'Enter') return;
      e.preventDefault();
      this.overlay.querySelector('[data-primary]')?.click();
    });
  }

  show(name, html, actions) {
    this.current = name;
    this.overlay.className = `screen ${name}`;
    this.overlay.innerHTML = `<div class="card">${html}</div>`;
    for (const [action, fn] of Object.entries(actions)) {
      this.overlay.querySelector(`[data-action="${action}"]`)?.addEventListener('click', fn);
    }
  }

  hide() {
    this.current = null;
    this.overlay.className = 'screen hidden';
    this.overlay.innerHTML = '';
  }

  // trained: pemain sudah pernah menyelesaikan pelatihan → tombol "Ulangi pelatihan".
  showIntro({ onStart, onTutorial = null, trained = false }) {
    this.show(
      'intro',
      `<p class="eyebrow">Graybox prototype</p>
      <h1>Hermes Express</h1>
      <p class="lead">Dulu kamu satu-satunya messenger Zeus dan Hera. Lalu satu paket salah kirim, dan semuanya berantakan.
      Status dewamu dicabut, sandal bersayapmu disita. Kini kamu mengantar paket para dewa dengan van tua.</p>
      <p class="goal">🎯 Penuhi <b>quota profit</b> tiap hari selama <b>7 hari</b>, lalu pulang ke HQ sebelum badai Zeus.</p>
      <ul class="controls">
        <li><kbd>W</kbd><kbd>S</kbd> gas & rem · <kbd>A</kbd><kbd>D</kbd> belok</li>
        <li>Berhenti di lingkaran + <kbd>E</kbd> ambil / antar paket</li>
        <li><kbd>V</kbd> ganti kamera (isometric / third person) · <kbd>Esc</kbd> pause &amp; pengaturan</li>
      </ul>
      <p class="muted">${trained ? 'Trik lain (drift, combo, dll.) dijelaskan saat pertama kali kamu temui.' : 'Hestia akan memandumu di Hari Pelatihan sebelum Day 1.'}</p>
      <button data-action="start" data-primary>Mulai (Enter)</button>
      ${trained && onTutorial ? '<button data-action="tutorial" class="secondary">🎓 Ulangi pelatihan</button>' : ''}`,
      { start: onStart, ...(onTutorial ? { tutorial: onTutorial } : {}) },
    );
  }

  showReport(report, run, { onContinue }) {
    const damageRows = report.damageEvents.length
      ? report.damageEvents
          .map((e) => `<li><span>${formatHour(e.hour)} · ${DAMAGE_LABELS[e.source] ?? e.source}</span><span>${money(-e.cost)}</span></li>`)
          .join('')
      : '<li class="muted">Tidak ada kerusakan. Mulus!</li>';
    const undeliveredNote = report.undelivered.length ? ` (${report.undelivered.length} paket)` : '';
    const verdict = report.pass
      ? `<div class="verdict pass">LOLOS QUOTA<small>${run.isFinalDay ? 'Hari terakhir selesai!' : 'Para dewa mengangguk… sedikit.'}</small></div>`
      : `<div class="verdict fail">GAGAL QUOTA<small>Para dewa kecewa. Hermes tetap manusia biasa.</small></div>`;
    const next = !report.pass ? 'Ulang dari Day 1' : run.isFinalDay ? 'Lihat hasil' : '🔨 Ke Bengkel Hephaestus';
    const mod = run.modifier ? DAY_MODS[run.modifier] : null;
    const kas = report.pass ? `<p class="kas">🔨 Kas bengkel <b>+${money(report.savingsGain)}</b> → ${money(run.savings)}</p>` : '';

    this.show(
      'report',
      `<p class="eyebrow">Laporan akhir hari · pulang ${formatHour(report.endHour)}${report.towed ? ' (diderek)' : ''}${mod ? ` · ${mod.icon} ${mod.name}` : ''}</p>
      <h2>Day ${report.day}</h2>
      <table class="report-table">
        <tr><td>Income (${report.deliveredCount} paket)</td><td data-count="${report.income}">${money(report.income)}</td></tr>
        ${report.tips ? `<tr><td>Tip gaya 🛞</td><td data-count="${report.tips}">${money(report.tips)}</td></tr>` : ''}
        <tr><td>Damage loss (repair)</td><td data-count="${-report.damageLoss}">${money(-report.damageLoss)}</td></tr>
        <tr><td>Undelivered offering${undeliveredNote}</td><td data-count="${-report.undeliveredLoss}">${money(-report.undeliveredLoss)}</td></tr>
        ${report.towed ? `<tr><td>Biaya derek</td><td>${money(-report.towFee)}</td></tr>` : ''}
        <tr class="total"><td>Profit</td><td data-count="${report.profit}">${money(report.profit)}</td></tr>
        <tr class="quota"><td>Quota hari ini</td><td>$${report.quota}</td></tr>
      </table>
      <div class="report-bar ${report.pass ? 'pass' : 'fail'}"><i style="width:${Math.min(100, (Math.max(0, report.profit) / Math.max(report.quota * 1.25, report.profit, 1)) * 100).toFixed(1)}%"></i><b style="left:${((report.quota / Math.max(report.quota * 1.25, report.profit, 1)) * 100).toFixed(1)}%"></b></div>
      <details ${report.damageEvents.length ? 'open' : ''}><summary>Rincian damage</summary><ul class="damage-list">${damageRows}</ul></details>
      ${verdict}
      <p class="muted">Dompet: ${money(run.wallet)}</p>
      ${kas}
      <button data-action="continue" data-primary>${next} (Enter)</button>`,
      { continue: onContinue },
    );
    this.countUp();
  }

  // Angka laporan bergulir dari 0 ke nilai akhirnya.
  countUp(duration = 800) {
    const cells = [...this.overlay.querySelectorAll('[data-count]')];
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / duration);
      const ease = 1 - (1 - k) ** 3;
      for (const cell of cells) cell.textContent = money(Math.round(Number(cell.dataset.count) * ease));
      if (k < 1 && this.current === 'report') requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  showWin(run, { onRestart, onDownload }) {
    const total = run.history.reduce((sum, r) => sum + r.profit, 0);
    this.show(
      'win',
      `<p class="eyebrow">7 hari selesai</p>
      <h1>Selangkah lebih dekat ke status dewa</h1>
      <p class="lead">Total profit ${money(total)}. Zeus mengakui kerjamu… untuk sekarang.</p>
      <p class="teaser">Kabar dari bawah tanah: Hades sedang mencari kurir baru…</p>
      <button data-action="restart" data-primary>Main lagi (Enter)</button>
      <button data-action="download" class="secondary">Unduh log playtest</button>`,
      { restart: onRestart, download: onDownload },
    );
  }

  // Bengkel Hephaestus: beli upgrade dengan Kas (profit di atas quota). Berlaku sampai run berakhir.
  showShop(game, { onDone }) {
    const run = game.run;
    const offers = game.shopOffers();
    const cards = offers
      .map((id) => {
        const u = UPGRADES[id];
        const owned = run.upgrades.includes(id);
        const afford = run.savings >= u.price;
        const btn = owned ? '<button disabled>Terpasang ✓</button>' : `<button data-buy="${id}" ${afford ? '' : 'disabled'}>Beli ${money(u.price)}</button>`;
        return `<div class="upgrade ${owned ? 'owned' : ''}"><div class="icon">${u.icon}</div><b>${u.name}</b><p>${u.desc}</p>${btn}</div>`;
      })
      .join('');
    const owned = run.upgrades.length ? `<p class="muted">Terpasang: ${run.upgrades.map((id) => `${UPGRADES[id].icon} ${UPGRADES[id].name}`).join(' · ')}</p>` : '';
    this.show(
      'shop',
      `<p class="eyebrow">Sebelum Day ${run.day + 1}</p>
      <h2>🔨 Bengkel Hephaestus</h2>
      <p class="lead">"Van tuamu menyedihkan. Bayar, dan aku tempa sesuatu." — Hephaestus</p>
      <p class="kas">Kas bengkel: <b>${money(run.savings)}</b></p>
      <div class="upgrades">${offers.length ? cards : '<p class="muted">Semua upgrade sudah terpasang!</p>'}</div>
      ${owned}
      <button data-action="done" data-primary>Mulai Day ${run.day + 1} (Enter)</button>`,
      { done: onDone },
    );
    for (const b of this.overlay.querySelectorAll('[data-buy]')) {
      b.addEventListener('click', () => {
        if (game.buyUpgrade(b.dataset.buy)) this.showShop(game, { onDone });
      });
    }
  }

  showPause({ onResume, onRestart, onDownload, onSettings, onSkipTutorial = null }) {
    this.show(
      'pause',
      `<h2>Pause</h2>
      <button data-action="resume" data-primary>Lanjut (Enter / Esc)</button>
      ${onSkipTutorial ? '<button data-action="skiptutorial" class="secondary">⏭ Lewati pelatihan</button>' : ''}
      <button data-action="settings" class="secondary">Pengaturan</button>
      <button data-action="restart" class="secondary">Ulang run dari Day 1</button>
      <button data-action="download" class="secondary">Unduh log playtest</button>`,
      { resume: onResume, settings: onSettings, restart: onRestart, download: onDownload, ...(onSkipTutorial ? { skiptutorial: onSkipTutorial } : {}) },
    );
  }

  showSettings(settings, { onChange, onBack }) {
    const rows = SETTINGS_FIELDS.map((f) => {
      const hint = f.hint ? ` <kbd>${f.hint}</kbd>` : '';
      if (f.type === 'toggle') {
        return `<label class="setting"><span>${f.label}${hint}</span><input type="checkbox" data-key="${f.key}" ${settings[f.key] ? 'checked' : ''}></label>`;
      }
      return `<label class="setting"><span>${f.label}</span><input type="range" min="0" max="1" step="0.05" data-key="${f.key}" value="${settings[f.key]}"></label>`;
    }).join('');
    this.show('settings', `<h2>Pengaturan</h2><div class="settings">${rows}</div><button data-action="back" data-primary>Kembali (Enter)</button>`, { back: onBack });
    for (const input of this.overlay.querySelectorAll('input[data-key]')) {
      const key = input.dataset.key;
      const read = () => (input.type === 'checkbox' ? input.checked : Number(input.value));
      input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => onChange(key, read()));
    }
  }
}
