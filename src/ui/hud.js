// HUD DOM, disusun dalam 3 tingkat supaya yang penting terbaca sekali lirik:
// 1. Status (selalu tampil): panel Shift (hari, jam + bar waktu, profit vs quota), cargo + chip status, prompt E.
// 2. Konteks: strip objektif (tujuan aktif GPS), satu panah tepi ke tujuan itu, meter combo.
// 3. Hiasan & cerita: kolom kiri bawah (Zeus LIVE, kartu hint yang menetap, toast), banner untuk momen besar.
import { formatHour, PHASE } from '../sim/clock.js';
import { Minimap } from './minimap.js';
import { CURSES, packageLook } from '../sim/curses.js';
import { DAY_MODS, UPGRADES } from '../sim/upgrades.js';
import { routeLength } from '../sim/navigation.js';
import { ROUTE_COLORS } from '../render/routeView.js';

const PHASE_ICONS = { [PHASE.DAY]: '☀', [PHASE.DUSK]: '🌇', [PHASE.STORM]: '⛈', [PHASE.LIMIT]: '⛈' };
const MAX_TOASTS = 3;

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.appendChild(node);
  return node;
}

const money = (v) => (v < 0 ? `−$${Math.abs(v)}` : `$${v}`);
const meters = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);

export class Hud {
  constructor(root, game, view) {
    this.game = game;
    this.view = view;
    this.root = el('div', 'hud', root);

    // ---- Tingkat 1: panel Shift ----
    const shift = el('div', 'hud-panel hud-left', this.root);
    const top = el('div', 'hud-row', shift);
    this.dayEl = el('div', 'hud-day', top);
    this.modEl = el('div', 'hud-mod', top);
    this.clockEl = el('div', 'hud-clock', shift);
    this.timebarEl = el('div', 'hud-timebar', shift);
    this.profitEl = el('div', 'hud-profit', shift);
    this.profitEl.innerHTML =
      '<div class="hud-row"><span class="label">Profit</span><span class="value"></span></div><div class="bar"><i class="fill"></i><i class="quota"></i></div><div class="breakdown"></div>';
    this.profitValue = this.profitEl.querySelector('.value');
    this.profitFill = this.profitEl.querySelector('.fill');
    this.profitQuota = this.profitEl.querySelector('.quota');
    this.profitBreakdown = this.profitEl.querySelector('.breakdown');

    // ---- Tingkat 1: cargo + chip status ----
    const right = el('div', 'hud-panel hud-right', this.root);
    el('div', 'hud-caption', right).textContent = 'Cargo';
    this.cargoEl = el('div', 'hud-cargo', right);
    this.statusEl = el('div', 'hud-status', right);
    this.blessingEl = el('span', 'chip hud-blessing', this.statusEl);
    this.blessingEl.textContent = '⚡ Kebal petir';
    this.cursesEl = el('span', 'hud-curses', this.statusEl);
    this.upgradesEl = el('span', 'hud-upgrades', this.statusEl);

    // ---- Tingkat 2: objektif, panah, combo ----
    this.objectiveEl = el('div', 'hud-objective', this.root);
    this.arrowEl = el('div', 'hud-arrow', this.root);
    this.arrowEl.innerHTML = '<span class="tip">➤</span>';
    this.comboEl = el('div', 'hud-combo', this.root);
    this.promptEl = el('div', 'hud-prompt', this.root);

    // ---- Tingkat 3: kolom cerita kiri bawah (Zeus LIVE di atas, hint, lalu toast) ----
    this.feedEl = el('div', 'hud-feed', this.root);
    this.zeusSlot = el('div', 'hud-zeus-slot', this.feedEl);
    this.hintEl = el('div', 'hud-hint', this.feedEl);
    this.toastsEl = el('div', 'hud-toasts', this.feedEl);
    this.hints = [];
    this.hintTimer = 0;
    this.bannerEl = el('div', 'hud-banner', this.root);

    this.vignetteEl = el('div', 'hud-vignette', this.root);
    el('div', 'hud-storm-edge', this.root);
    el('div', 'hud-speedlines', this.root);
    // Hades: pandangan menyempit ke lingkaran di sekitar van.
    this.darknessEl = el('div', 'hud-darkness', this.root);
    this.minimap = new Minimap(this.root, game);
    this.bannerTimer = 0;
    this.hitTimer = 0;
    this.lastText = new Map();

    const { bus } = game;
    // Banner hanya untuk momen besar. Titah dewa diumumkan Zeus LIVE + chip di panel Shift.
    bus.on('day_start', ({ quota }) => this.banner(`DAY ${game.run.day} / ${game.cfg.run.days}`, `Quota profit hari ini $${quota}`, 'day', 2.5));
    bus.on('phase', ({ phase }) => {
      if (phase === PHASE.DUSK) this.banner('SENJA', 'Pulang ke HQ!', 'dusk', 2.5);
      if (phase === PHASE.STORM) this.banner('BADAI ZEUS MEMBURU', 'Pulang ke HQ sekarang!', 'storm', 2.5);
    });
    bus.on('blessing_lost', () => this.banner('The blessing belonged to the package, not you.', 'Blessing Zeus hilang. Petir bisa mengenaimu lagi.', 'lost', 3.5));
    bus.on('fragile_broken', ({ lost }) => {
      this.banner('🏺 PECAH!', `Paket rapuh hancur. $${lost} melayang.`, 'lost', 2);
      this.pulse(this.cargoEl, 'shake');
    });
    bus.on('smuggle_resolved', ({ scam, pay }) => {
      if (!scam) {
        this.toast(`💰 Selundupan legit! +$${pay}`, 'money', 2.5);
        return;
      }
      this.hitTimer = 0.8;
      const lines = ['Isinya cuma batu bata.', 'Isinya bebek karet… yang meledak.', 'Penerimanya kabur sebelum paketnya meledak.', 'Ternyata kiriman iseng dari Eris.', 'Segelnya palsu. Isinya kembang api.'];
      this.banner('💥 SCAM!', `${lines[Math.floor(Math.random() * lines.length)]} Bayaran $${pay} hangus.`, 'scam', 3);
    });

    // Status (chip + toast singkat).
    bus.on('blessing_gained', () => {
      this.toast('⚡ Blessing Zeus: kebal petir selama paket ini dibawa', 'zeus', 3);
      this.pulse(this.statusEl, 'bump');
    });
    bus.on('curse_gained', ({ curse }) => {
      const c = CURSES[curse];
      this.toast(`${c.icon} Kutukan ${c.god} · ${c.title}: ${c.desc}`, 'curse', 4);
      this.pulse(this.statusEl, 'bump');
    });
    bus.on('curse_lifted', ({ curse }) => this.toast(`✨ Kutukan ${CURSES[curse].god} terangkat. Lega!`, 'money', 2.5));

    // Uang & rugi.
    // Uang masuk sudah terlihat dari popup di dunia + bar profit yang membal; tidak perlu toast lagi.
    bus.on('deliver', () => this.pulse(this.profitEl, 'bump'));
    bus.on('style_banked', () => this.pulse(this.profitEl, 'bump'));
    bus.on('style_dropped', ({ lost }) => this.toast(`💥 Combo hangus (−$${lost})`, 'loss', 1.8));
    bus.on('fragile_cracked', ({ lost }) => {
      this.toast(`🏺 Retak! Bayaran −$${lost}`, 'loss', 1.8);
      this.pulse(this.cargoEl, 'shake');
    });
    bus.on('express_late', ({ pay }) => this.toast(`⏱️ Telat! Bayaran tinggal $${pay}`, 'loss', 2.2));
    bus.on('package_stolen', ({ pay }) => this.toast(`🟣 Iris Express mencuri paket $${pay}!`, 'iris', 2.5));
    bus.on('package_dropped', () => this.toast('📦 Paket curian jatuh! Ambil sebelum hilang', 'money', 2.5));
    bus.on('pickup', ({ packageType, curse }) => {
      this.pulse(this.cargoEl, 'bump');
      if (packageType === 'safe') return; // paket biasa: cukup slot cargo yang membal
      const look = packageLook({ type: packageType, curse });
      this.toast(`${look.icon} ${look.name} diambil`);
    });
    bus.on('cargo_full', () => {
      this.toast('Cargo penuh! Antar dulu paket yang dibawa.', 'warn');
      this.pulse(this.cargoEl, 'shake');
    });
    bus.on('minotaur_charmed', () => this.toast('💘 Minotaur jatuh cinta padamu…', 'curse', 2));
    bus.on('early_end_requested', () => this.toast('Masih siang. Tekan E lagi untuk pulang lebih awal.', 'warn', 3));
    bus.on('hard_landing', () => {
      this.hitTimer = 0.4;
      this.toast('Aduh! Mendarat keras', 'loss', 1.5);
    });
    bus.on('minotaur_hit', () => {
      this.hitTimer = 0.6;
      this.toast('Diseruduk Minotaur!', 'loss', 1.5);
    });
    bus.on('strike_hit', ({ blocked, rod }) => {
      if (rod) this.toast('⚡ Penangkal petir menahan sambaran!', 'zeus', 2);
      else if (blocked) this.toast('⚡ Ditahan blessing Zeus', 'zeus', 1.2);
      else this.hitTimer = 0.5;
    });

    // Hari Pelatihan: sorot bagian HUD yang sedang dibahas, redupkan sisanya.
    this.dimEl = el('div', 'hud-dim', this.root);
    bus.on('tutorial_step', ({ spotlight }) => this.setSpotlight(spotlight));
    bus.on('tutorial_done', () => this.setSpotlight(null));
    bus.on('tutorial_done', ({ skipped }) => !skipped && this.banner('🎓 Pelatihan selesai!', 'Hari pertama yang sesungguhnya dimulai…', 'day', 2.5));

    // Hint tutorial: antrean sendiri, tidak tergusur toast.
    bus.on('hint', ({ text }) => this.queueHint(text));
    bus.on('day_start', () => {
      this.hints = [];
      this.hintTimer = 0;
      this.hintEl.classList.remove('show');
    });
  }

  // key: 'objective' | 'prompt' | 'cargo' | 'profit' | 'time' | null
  setSpotlight(key) {
    const targets = {
      objective: [this.objectiveEl, this.objectiveEl],
      prompt: [this.promptEl, this.promptEl],
      cargo: [this.cargoEl.parentElement, this.cargoEl],
      profit: [this.profitEl.parentElement, this.profitEl],
      time: [this.timebarEl.parentElement, this.timebarEl],
    };
    for (const node of this.root.querySelectorAll('.lifted, .spotlight')) node.classList.remove('lifted', 'spotlight');
    const pair = key ? targets[key] : null;
    this.dimEl.classList.toggle('show', Boolean(pair));
    if (!pair) return;
    pair[0].classList.add('lifted');
    pair[1].classList.add('spotlight');
  }

  // Mainkan ulang animasi CSS sekali (membal / bergetar).
  pulse(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  setText(node, text) {
    if (this.lastText.get(node) === text) return;
    this.lastText.set(node, text);
    node.textContent = text;
  }

  setHtml(node, html) {
    if (this.lastText.get(node) === html) return;
    this.lastText.set(node, html);
    node.innerHTML = html;
  }

  banner(title, subtitle, kind, seconds) {
    this.bannerEl.className = `hud-banner show ${kind}`;
    this.bannerEl.innerHTML = `<div class="title">${title}</div><div class="subtitle">${subtitle}</div>`;
    this.bannerTimer = seconds;
  }

  // Toast: maks 3; kalimat yang sama berturut-turut digabung jadi "×2".
  toast(text, kind = '', seconds = 2.5) {
    const last = this.toastsEl.lastElementChild;
    if (last && last.dataset.text === text && !last.classList.contains('hide')) {
      last.dataset.count = String(Number(last.dataset.count ?? 1) + 1);
      last.textContent = `${text} ×${last.dataset.count}`;
      clearTimeout(last.hideTimer);
      clearTimeout(last.removeTimer);
    } else {
      const node = el('div', `hud-toast ${kind}`, this.toastsEl);
      node.dataset.text = text;
      node.textContent = text;
    }
    const node = this.toastsEl.lastElementChild;
    node.hideTimer = setTimeout(() => node.classList.add('hide'), seconds * 1000);
    node.removeTimer = setTimeout(() => node.remove(), seconds * 1000 + 400);
    while (this.toastsEl.children.length > MAX_TOASTS) this.toastsEl.firstChild.remove();
  }

  queueHint(text) {
    this.hints.push(text);
    if (this.hintTimer <= 0) this.nextHint();
  }

  nextHint() {
    const text = this.hints.shift();
    if (!text) {
      this.hintEl.classList.remove('show');
      return;
    }
    this.hintEl.innerHTML = `<span class="icon">💡</span><span>${text}</span>`;
    this.hintEl.classList.add('show');
    this.pulse(this.hintEl, 'bump');
    this.hintTimer = Math.max(6, text.length / 14);
  }

  promptText() {
    const { game } = this;
    const { car, packages, clock } = game;
    const action = packages.available(car);
    if (action) {
      if (action.kind === 'deliver') {
        const total = action.packages.reduce((sum, p) => sum + p.pay, 0);
        return car.stopped ? `<kbd>E</kbd> Antar ke ${action.packages[0].dest.name} <b class="pay">+$${total}</b>` : 'Berhenti untuk mengantar';
      }
      if (action.kind === 'full') return `Cargo penuh: paket ini butuh ${action.pkg.slots} slot`;
      const p = action.pkg;
      const look = packageLook(p);
      const kind = `${look.icon} ${look.name}`.trim();
      return car.stopped ? `<kbd>E</kbd> Ambil ${kind} <b class="pay">$${p.pay}</b> → ${p.dest.name}` : 'Berhenti untuk mengambil paket';
    }
    if (game.inHQ && game.leftHQ) {
      if (!car.stopped) return 'Berhenti di HQ untuk mengakhiri hari';
      if (game.earlyEndPending) return '<kbd>E</kbd> lagi: pulang lebih awal';
      return clock.hour < game.cfg.time.duskHour ? '<kbd>E</kbd> Akhiri hari (pulang lebih awal)' : '<kbd>E</kbd> Akhiri hari';
    }
    return '';
  }

  updateShift() {
    const { game } = this;
    const { run, clock } = game;
    const t = game.cfg.time;
    this.setText(this.dayEl, game.mode === 'tutorial' ? '🎓 PELATIHAN' : `DAY ${run.day} / ${game.cfg.run.days}`);
    const mod = game.dayMods.id ? DAY_MODS[game.dayMods.id] : null;
    this.setHtml(this.modEl, mod ? `${mod.icon} ${mod.name}` : '');
    this.modEl.title = mod ? mod.desc : '';
    this.setHtml(this.clockEl, `${formatHour(clock.hour)} <span>${PHASE_ICONS[clock.phase]}</span>`);
    this.clockEl.dataset.phase = clock.phase;

    // Bar waktu: siang → senja → badai, dengan penanda jam sekarang.
    const span = t.limitHour - t.startHour;
    const pct = (h) => ((Math.min(Math.max(h, t.startHour), t.limitHour) - t.startHour) / span) * 100;
    this.setHtml(
      this.timebarEl,
      `<i class="seg day" style="width:${pct(t.duskHour)}%"></i><i class="seg dusk" style="width:${pct(t.stormHour) - pct(t.duskHour)}%"></i><i class="seg storm" style="width:${100 - pct(t.stormHour)}%"></i><i class="now" style="left:${pct(clock.hour).toFixed(1)}%"></i>`,
    );

    // Profit hidup vs quota (rumus sama dengan laporan akhir hari).
    const p = game.liveProfit;
    const quota = game.quota;
    const scale = Math.max(quota * 1.25, p.profit, 1);
    const passed = p.profit >= quota;
    this.setHtml(this.profitValue, `<b class="${p.profit < 0 ? 'neg' : ''}">${money(p.profit)}</b> / $${quota}${passed ? ' <span class="ok">✓ LOLOS</span>' : ''}`);
    this.profitEl.classList.toggle('passed', passed);
    this.profitFill.style.width = `${(Math.max(0, p.profit) / scale) * 100}%`;
    this.profitQuota.style.left = `${(quota / scale) * 100}%`;
    const parts = p.income ? [`<span class="plus">+$${p.income} antar</span>`] : ['<span class="muted">Belum ada paket diantar</span>'];
    if (p.tips) parts.push(`<span class="plus">+$${p.tips} tip</span>`);
    if (p.repair) parts.push(`<span class="minus">−$${p.repair} repair</span>`);
    if (p.penalty) parts.push(`<span class="minus">−$${p.penalty} belum diantar</span>`);
    this.setHtml(this.profitBreakdown, parts.join(' '));
  }

  updateCargo() {
    const { game } = this;
    const { packages, run } = game;
    const target = game.nav.target;
    const slots = [];
    for (const p of packages.cargo) {
      const look = packageLook(p);
      const colored = p.type !== 'safe' && p.type !== 'zeus';
      const style = colored ? `;background:${look.color}` : '';
      let content = `${look.icon}<small>$${p.pay}</small>`;
      if (p.type === 'express') {
        const urgent = !p.late && p.timeLeft <= 8;
        content = `${look.icon}<small class="${urgent ? 'urgent' : ''}">${p.late ? 'telat' : `${Math.ceil(p.timeLeft)}s`}</small>`;
      }
      // Paket yang sedang dituju GPS ditandai.
      const active = target?.deliver && target.pkg === p ? ' active' : '';
      slots.push(`<span class="slot ${p.type}${active}" style="flex:${p.slots}${style}">${content}</span>`);
    }
    for (let i = 0; i < packages.slotsFree; i++) slots.push('<span class="slot empty" style="flex:1"></span>');
    this.setHtml(this.cargoEl, slots.join(''));

    // Chip status yang seragam: blessing, kutukan (ikon + 2 kata), upgrade (ikon, penangkal petir + sisa).
    this.blessingEl.classList.toggle('show', packages.blessed);
    const fx = game.effects;
    this.setHtml(
      this.cursesEl,
      fx.curses.map((id) => `<span class="chip" style="background:${CURSES[id].color}" title="${CURSES[id].desc}">${CURSES[id].icon} ${CURSES[id].title}</span>`).join(''),
    );
    this.setHtml(
      this.upgradesEl,
      run.upgrades.map((id) => `<span class="up" title="${UPGRADES[id].name}: ${UPGRADES[id].desc}">${UPGRADES[id].icon}${id === 'rod' ? `<small>×${game.rodCharges}</small>` : ''}</span>`).join(''),
    );
  }

  // Strip objektif: satu kalimat "apa yang harus dilakukan sekarang".
  objectiveText() {
    const { game } = this;
    const t = game.nav.target;
    // Hari Pelatihan: objektif datang dari langkah tutorial.
    if (game.mode === 'tutorial') {
      const obj = game.tutorial?.objective;
      if (!obj) return '';
      const d = t ? ` · <span class="dist">${meters(game.nav.route.length > 1 ? routeLength(game.nav.route) : Math.hypot(t.x - game.car.x, t.z - game.car.z))}</span>` : '';
      return `🎓 ${obj}${d}`;
    }
    if (!t) return '';
    const { car } = game;
    const dist = game.nav.route.length > 1 ? routeLength(game.nav.route) : Math.hypot(t.x - car.x, t.z - car.z);
    const d = `<span class="dist">${meters(dist)}</span>`;
    const pay = t.pkg ? `<b class="pay">$${t.pkg.pay}</b>` : '';
    switch (t.kind) {
      case 'hq':
        return `🏠 Pulang ke HQ · ${d}`;
      case 'express':
        return `⏱️ Antar ke ${t.label} · ${d} · <b class="timer">${Math.ceil(t.pkg.timeLeft)}s</b> ${pay}`;
      case 'zeus':
        return t.deliver ? `⚡ Antar paket Zeus ke ${t.label} · ${d} ${pay}` : `⚡ Ambil paket Zeus · ${d}`;
      case 'dest':
        return `📦 Antar ke ${t.label} · ${d} ${pay}`;
      default:
        return `📦 Paket terdekat ${packageLook(t.pkg).icon} ${pay} · ${d}`;
    }
  }

  updateDarkness(radius) {
    this.darknessEl.style.opacity = radius ? '1' : '0';
    if (!radius) return;
    const { car } = this.game;
    const c = this.view.project(car.x, car.z);
    const edge = this.view.project(car.x + radius, car.z);
    const r = Math.max(60, Math.hypot(edge.x - c.x, edge.y - c.y));
    this.darknessEl.style.background = `radial-gradient(circle at ${c.x}px ${c.y}px, transparent ${r * 0.6}px, rgba(5, 6, 12, 0.96) ${r}px)`;
  }

  // Satu panah tepi saja: ke tujuan aktif GPS, saat tujuannya di luar layar.
  updateArrow() {
    const t = this.game.nav.target;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 56;
    if (!t) {
      this.arrowEl.style.display = 'none';
      return;
    }
    const p = this.view.project(t.x, t.z);
    const onScreen = p.x > margin && p.x < w - margin && p.y > margin && p.y < h - margin;
    this.arrowEl.style.display = onScreen ? 'none' : '';
    if (onScreen) return;
    const dx = p.x - w / 2;
    const dy = p.y - h / 2;
    const scale = Math.min((w / 2 - margin) / Math.abs(dx || 1e-6), (h / 2 - margin) / Math.abs(dy || 1e-6));
    let ax = w / 2 + dx * scale;
    let ay = h / 2 + dy * scale;
    // Jangan menimpa panel di pojok (Shift kiri atas, cargo kanan atas, minimap kanan bawah, kolom cerita kiri bawah).
    ay = Math.min(Math.max(ay, 150), h - 120);
    if (ax < 280) ay = Math.max(ay, 210); // panel Shift
    if (ax < 420 && ay > h - 330) ay = h - 330; // kolom cerita kiri bawah
    if (ax > w - 250) ay = Math.min(ay, h - 250);
    ax = Math.min(Math.max(ax, margin), w - margin);
    this.arrowEl.style.transform = `translate(${ax}px, ${ay}px)`;
    this.arrowEl.style.color = ROUTE_COLORS[t.kind] ?? ROUTE_COLORS.dest;
    this.arrowEl.querySelector('.tip').style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }

  updateCombo() {
    const { style } = this.game;
    const combo = style.combo;
    this.comboEl.classList.toggle('show', Boolean(combo));
    if (!combo) return;
    const names = combo.tricks.slice(-4).map((t) => `<span>${t.name} +$${t.value}</span>`).join('');
    const mult = style.multiplier;
    const left = Math.max(0, combo.timer / style.cfg.comboWindow);
    this.setHtml(
      this.comboEl,
      `<div class="tricks">${names}</div><div class="total">$${combo.total}${mult > 1 ? ` <b>×${mult}</b>` : ''}</div><div class="bar"><i style="width:${(left * 100).toFixed(0)}%"></i></div>`,
    );
  }

  update(dt) {
    const { game } = this;
    const { run, clock } = game;
    const visible = run.state === 'day';
    this.root.classList.toggle('hidden', !visible);
    if (!visible) return;

    this.updateShift();
    this.updateCargo();
    this.updateCombo();
    const objective = this.objectiveText();
    this.setHtml(this.objectiveEl, objective);
    this.objectiveEl.classList.toggle('show', objective !== '');
    this.updateDarkness(game.effects.visionRadius);

    const prompt = this.promptText();
    this.setHtml(this.promptEl, prompt);
    this.promptEl.classList.toggle('show', prompt !== '');

    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show');
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.nextHint();
    }
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.vignetteEl.style.opacity = String(this.hitTimer * 1.6);
    this.root.classList.toggle('night', clock.phase !== PHASE.DAY);
    this.root.classList.toggle('storm', clock.phase === PHASE.STORM || clock.phase === PHASE.LIMIT);
    this.root.classList.toggle('fast', game.car.speed > game.cfg.car.maxSpeed * 0.92 && !game.car.airborne);
    this.root.classList.toggle('turbo', game.car.boostTime > 0);
    document.body.classList.toggle('hades', Boolean(game.effects.visionRadius));

    this.updateArrow();
    this.minimap.update();
  }
}
