// Layar overlay: intro, laporan akhir hari, menang, dan pause.
import { formatHour } from '../sim/clock.js';
import { DAMAGE_LABELS } from '../sim/damage.js';

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

  showIntro({ onStart }) {
    this.show(
      'intro',
      `<p class="eyebrow">Graybox prototype</p>
      <h1>Hermes Express</h1>
      <p class="lead">Dulu kamu satu-satunya messenger Zeus dan Hera. Lalu satu paket salah kirim, dan semuanya berantakan.
      Status dewamu dicabut, sandal bersayapmu disita. Kini kamu mengantar paket para dewa dengan van tua.</p>
      <p>Penuhi <b>quota profit</b> setiap hari selama <b>7 hari</b>. Gagal sekali, ulang dari Day 1.</p>
      <ul class="controls">
        <li><kbd>W</kbd><kbd>S</kbd> gas & rem/mundur · <kbd>A</kbd><kbd>D</kbd> belok</li>
        <li><kbd>Space</kbd> handbrake: ngepot, drift lama = turbo · <kbd>H</kbd> drift on/off</li>
        <li>Berhenti di penanda + <kbd>E</kbd> untuk ambil dan antar paket</li>
        <li>Pulang ke HQ + <kbd>E</kbd> untuk mengakhiri hari · <kbd>Esc</kbd> pause</li>
      </ul>
      <button data-action="start" data-primary>Mulai (Enter)</button>`,
      { start: onStart },
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
    const next = !report.pass ? 'Ulang dari Day 1' : run.isFinalDay ? 'Lihat hasil' : `Lanjut ke Day ${run.day + 1}`;
    const shop = report.pass && !run.isFinalDay ? '<p class="muted shop">Toko upgrade: belum ada di graybox ini.</p>' : '';

    this.show(
      'report',
      `<p class="eyebrow">Laporan akhir hari · pulang ${formatHour(report.endHour)}${report.towed ? ' (diderek)' : ''}</p>
      <h2>Day ${report.day}</h2>
      <table class="report-table">
        <tr><td>Income (${report.deliveredCount} paket)</td><td data-count="${report.income}">${money(report.income)}</td></tr>
        <tr><td>Damage loss (repair)</td><td data-count="${-report.damageLoss}">${money(-report.damageLoss)}</td></tr>
        <tr><td>Undelivered offering${undeliveredNote}</td><td data-count="${-report.undeliveredLoss}">${money(-report.undeliveredLoss)}</td></tr>
        ${report.towed ? `<tr><td>Biaya derek</td><td>${money(-report.towFee)}</td></tr>` : ''}
        <tr class="total"><td>Profit</td><td data-count="${report.profit}">${money(report.profit)}</td></tr>
        <tr class="quota"><td>Quota hari ini</td><td>$${report.quota}</td></tr>
      </table>
      <details ${report.damageEvents.length ? 'open' : ''}><summary>Rincian damage</summary><ul class="damage-list">${damageRows}</ul></details>
      ${verdict}
      <p class="muted">Dompet: ${money(run.wallet)}</p>
      ${shop}
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

  showPause({ onResume, onRestart, onDownload }) {
    this.show(
      'pause',
      `<h2>Pause</h2>
      <button data-action="resume" data-primary>Lanjut (Enter / Esc)</button>
      <button data-action="restart" class="secondary">Ulang run dari Day 1</button>
      <button data-action="download" class="secondary">Unduh log playtest</button>`,
      { resume: onResume, restart: onRestart, download: onDownload },
    );
  }
}
