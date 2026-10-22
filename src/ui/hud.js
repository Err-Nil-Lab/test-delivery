// HUD DOM: jam, hari, quota, cargo, blessing, prompt E, banner, hint, dan panah arah.
import { formatHour, PHASE } from '../sim/clock.js';
import { Minimap } from './minimap.js';
import { CURSES, packageLook } from '../sim/curses.js';
import { DAY_MODS, UPGRADES } from '../sim/upgrades.js';

const PHASE_ICONS = { [PHASE.DAY]: '☀', [PHASE.DUSK]: '🌇', [PHASE.STORM]: '⛈', [PHASE.LIMIT]: '⛈' };

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.appendChild(node);
  return node;
}

export class Hud {
  constructor(root, game, view) {
    this.game = game;
    this.view = view;
    this.root = el('div', 'hud', root);

    const left = el('div', 'hud-panel hud-left', this.root);
    this.dayEl = el('div', 'hud-day', left);
    this.clockEl = el('div', 'hud-clock', left);
    this.moneyEl = el('div', 'hud-money', left);
    this.modEl = el('div', 'hud-mod', left);

    const right = el('div', 'hud-panel hud-right', this.root);
    el('div', 'hud-caption', right).textContent = 'Cargo';
    this.cargoEl = el('div', 'hud-cargo', right);
    this.blessingEl = el('div', 'hud-blessing', right);
    this.blessingEl.textContent = '⚡ Blessing Zeus · kebal petir';
    this.cursesEl = el('div', 'hud-curses', right);
    this.upgradesEl = el('div', 'hud-upgrades', right);

    this.promptEl = el('div', 'hud-prompt', this.root);
    this.bannerEl = el('div', 'hud-banner', this.root);
    this.toastsEl = el('div', 'hud-toasts', this.root);
    // Combo bonus gaya: daftar aksi, total × pengali, dan bar sisa waktu.
    this.comboEl = el('div', 'hud-combo', this.root);
    this.arrowsEl = el('div', 'hud-arrows', this.root);
    this.vignetteEl = el('div', 'hud-vignette', this.root);
    el('div', 'hud-storm-edge', this.root);
    el('div', 'hud-speedlines', this.root);
    // Hades: pandangan menyempit ke lingkaran di sekitar van.
    this.darknessEl = el('div', 'hud-darkness', this.root);
    this.minimap = new Minimap(this.root, game);
    this.arrows = new Map();
    this.bannerTimer = 0;
    this.hitTimer = 0;
    this.lastText = new Map();

    const { bus } = game;
    bus.on('day_start', ({ quota, modifier }) => {
      const m = modifier ? DAY_MODS[modifier] : null;
      this.banner(`DAY ${game.run.day} / ${game.cfg.run.days}`, `Quota hari ini $${quota}${m ? `<br><b>${m.icon} Titah hari ini: ${m.name}</b> · ${m.desc}` : ''}`, 'day', m ? 4.5 : 2.5);
    });
    bus.on('package_stolen', ({ pay }) => this.toast(`🟣 Iris Express mencuri paket $${pay}! Senggol vannya supaya paketnya jatuh`, 'loss', 3));
    bus.on('package_dropped', () => this.toast('📦 Paket curian jatuh! Ambil sebelum hilang', 'money', 2.5));
    bus.on('strike_hit', ({ rod }) => rod && this.toast('⚡ Penangkal petir menahan sambaran!', 'zeus', 2));
    bus.on('phase', ({ phase }) => {
      if (phase === PHASE.DUSK) this.banner('SENJA', 'Pulang ke HQ!', 'dusk', 3);
      if (phase === PHASE.STORM) this.banner('BADAI ZEUS MEMBURU', 'Pulang ke HQ sekarang!', 'storm', 3);
    });
    bus.on('blessing_gained', () => this.banner('⚡ Blessing Zeus', 'Kebal petir selama paket ini dibawa', 'zeus', 2.5));
    bus.on('blessing_lost', () => this.banner('The blessing belonged to the package, not you.', 'Blessing Zeus hilang. Petir bisa mengenaimu lagi.', 'lost', 4));
    bus.on('deliver', ({ pay, dest }) => {
      this.toast(`+$${pay} · ${dest}`, 'money');
      this.pulse(this.moneyEl, 'bump');
    });
    bus.on('fragile_cracked', ({ lost }) => {
      this.toast(`🏺 Retak! Bayaran −$${lost}`, 'loss', 1.8);
      this.pulse(this.cargoEl, 'shake');
    });
    bus.on('fragile_broken', ({ lost }) => {
      this.banner('🏺 PECAH!', `Paket rapuh hancur. $${lost} melayang.`, 'lost', 2.2);
      this.pulse(this.cargoEl, 'shake');
    });
    bus.on('express_late', ({ pay }) => this.toast(`⏱️ Telat! Bayaran tinggal $${pay}`, 'loss', 2.2));
    bus.on('style_banked', ({ tip, count }) => {
      this.toast(`🛞 Tip gaya +$${tip}${count > 1 ? ` (combo ×${count})` : ''}`, 'money', 1.8);
      this.pulse(this.moneyEl, 'bump');
    });
    bus.on('style_dropped', ({ lost }) => this.toast(`💥 Combo hangus (−$${lost})`, 'loss', 1.8));
    bus.on('pickup', ({ packageType, curse, dest }) => {
      this.pulse(this.cargoEl, 'bump');
      const look = packageLook({ type: packageType, curse });
      this.toast(`Paket ${look.icon} ${look.name} diambil → ${dest}`);
    });
    bus.on('curse_gained', ({ curse }) => {
      const c = CURSES[curse];
      this.banner(`${c.icon} Kutukan ${c.god}`, `${c.title}: ${c.desc}. Hilang saat paket diantar.`, `curse ${curse}`, 3);
    });
    bus.on('curse_lifted', ({ curse }) => {
      const c = CURSES[curse];
      this.banner('The curse belonged to the package too.', `Kutukan ${c.god} terangkat. Lega!`, 'lifted', 3);
    });
    bus.on('smuggle_resolved', ({ scam, pay }) => {
      if (!scam) {
        this.banner('💰 Legit!', `Barangnya aman. +$${pay}`, 'legit', 2.5);
        return;
      }
      this.hitTimer = 0.8;
      const lines = ['Isinya cuma batu bata.', 'Isinya bebek karet… yang meledak.', 'Penerimanya kabur sebelum paketnya meledak.', 'Ternyata kiriman iseng dari Eris.', 'Segelnya palsu. Isinya kembang api.'];
      this.banner('💥 SCAM!', `${lines[Math.floor(Math.random() * lines.length)]} Bayaran $${pay} hangus.`, 'scam', 3.5);
    });
    bus.on('minotaur_charmed', () => this.toast('💘 Minotaur jatuh cinta padamu…', 'curse', 2));
    bus.on('cargo_full', () => {
      this.toast('Cargo penuh! Antar dulu paket yang dibawa.', 'warn');
      this.pulse(this.cargoEl, 'shake');
    });
    bus.on('hint', ({ text }) => this.toast(text, 'hint', 6));
    bus.on('early_end_requested', () => this.toast('Masih siang. Tekan E lagi untuk pulang lebih awal.', 'warn', 3));
    bus.on('hard_landing', () => {
      this.hitTimer = 0.4;
      this.toast('Aduh! Mendarat keras', 'warn', 1.5);
    });
    bus.on('minotaur_hit', () => {
      this.hitTimer = 0.6;
      this.toast('Diseruduk Minotaur!', 'warn', 1.5);
    });
    bus.on('strike_hit', ({ blocked }) => {
      if (blocked) this.toast('⚡ Ditahan blessing Zeus', 'zeus', 1.2);
      else this.hitTimer = 0.5;
    });
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

  toast(text, kind = '', seconds = 2.5) {
    const node = el('div', `hud-toast ${kind}`, this.toastsEl);
    node.textContent = text;
    setTimeout(() => node.classList.add('hide'), seconds * 1000);
    setTimeout(() => node.remove(), seconds * 1000 + 400);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
  }

  promptText() {
    const { game } = this;
    const { car, packages, clock } = game;
    const action = packages.available(car);
    if (action) {
      if (action.kind === 'deliver') {
        const total = action.packages.reduce((sum, p) => sum + p.pay, 0);
        return car.stopped ? `<kbd>E</kbd> Antar ke ${action.packages[0].dest.name} (+$${total})` : 'Berhenti untuk mengantar';
      }
      if (action.kind === 'full') return `Cargo penuh: paket ini butuh ${action.pkg.slots} slot`;
      const p = action.pkg;
      const look = packageLook(p);
      const kind = `${look.icon} ${look.name}`.trim();
      return car.stopped ? `<kbd>E</kbd> Ambil paket ${kind} $${p.pay} → ${p.dest.name}` : 'Berhenti untuk mengambil paket';
    }
    if (game.inHQ && game.leftHQ) {
      if (!car.stopped) return 'Berhenti di HQ untuk mengakhiri hari';
      if (game.earlyEndPending) return '<kbd>E</kbd> lagi: pulang lebih awal';
      return clock.hour < game.cfg.time.duskHour ? '<kbd>E</kbd> Akhiri hari (pulang lebih awal)' : '<kbd>E</kbd> Akhiri hari';
    }
    return '';
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

  updateDarkness(radius) {
    this.darknessEl.style.opacity = radius ? '1' : '0';
    if (!radius) return;
    const { car } = this.game;
    const c = this.view.project(car.x, car.z);
    const edge = this.view.project(car.x + radius, car.z);
    const r = Math.max(60, Math.hypot(edge.x - c.x, edge.y - c.y));
    this.darknessEl.style.background = `radial-gradient(circle at ${c.x}px ${c.y}px, transparent ${r * 0.6}px, rgba(5, 6, 12, 0.96) ${r}px)`;
  }

  arrowTargets() {
    const { game } = this;
    const targets = game.packages.cargo.map((p) => ({
      key: `pkg-${p.id}`,
      x: p.dest.x,
      z: p.dest.z,
      label: p.dest.name,
      kind: p.type === 'zeus' ? 'zeus' : p.type === 'curse' ? `curse ${p.curse}` : 'dest',
    }));
    const zeusWaiting = game.packages.waiting.find((p) => p.type === 'zeus');
    if (zeusWaiting && !game.packages.blessed) {
      targets.push({ key: `zeus-${zeusWaiting.id}`, x: zeusWaiting.pickup.x, z: zeusWaiting.pickup.z, label: 'Paket Zeus', kind: 'zeus' });
    }
    const hq = game.world.hq.spawn;
    if (game.clock.hour >= game.cfg.time.duskHour - 1 && !game.inHQ) {
      targets.push({ key: 'hq', x: hq.x, z: hq.z, label: 'HQ', kind: 'hq' });
    }
    return targets;
  }

  updateArrows() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 48;
    const seen = new Set();
    for (const t of this.arrowTargets()) {
      seen.add(t.key);
      let node = this.arrows.get(t.key);
      if (!node) {
        node = el('div', `hud-arrow ${t.kind}`, this.arrowsEl);
        node.innerHTML = '<span class="tip">➤</span><span class="name"></span>';
        node.querySelector('.name').textContent = t.label;
        this.arrows.set(t.key, node);
      }
      const p = this.view.project(t.x, t.z);
      const onScreen = p.x > margin && p.x < w - margin && p.y > margin && p.y < h - margin;
      node.style.display = onScreen ? 'none' : '';
      if (onScreen) continue;
      const dx = p.x - w / 2;
      const dy = p.y - h / 2;
      const scale = Math.min((w / 2 - margin) / Math.abs(dx || 1e-6), (h / 2 - margin) / Math.abs(dy || 1e-6));
      const ax = w / 2 + dx * scale;
      // Jangan menimpa minimap di pojok kanan bawah.
      const ay = ax > w - 240 ? Math.min(h / 2 + dy * scale, h - 250) : h / 2 + dy * scale;
      node.style.transform = `translate(${ax}px, ${ay}px)`;
      node.querySelector('.tip').style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
    for (const [key, node] of this.arrows) {
      if (seen.has(key)) continue;
      node.remove();
      this.arrows.delete(key);
    }
  }

  update(dt) {
    const { game } = this;
    const { run, clock, packages } = game;
    const visible = run.state === 'day';
    this.root.classList.toggle('hidden', !visible);
    if (!visible) return;

    this.setText(this.dayEl, `DAY ${run.day} / ${game.cfg.run.days}`);
    this.setHtml(this.clockEl, `${formatHour(clock.hour)} <span>${PHASE_ICONS[clock.phase]}</span>`);
    this.clockEl.dataset.phase = clock.phase;
    this.setHtml(this.moneyEl, `Hari ini <b>$${packages.income + game.style.tips}</b> · Quota <b>$${run.quota}</b>`);
    this.updateCombo();
    const mod = game.dayMods.id ? DAY_MODS[game.dayMods.id] : null;
    this.setHtml(this.modEl, mod ? `${mod.icon} ${mod.name}` : '');
    this.modEl.title = mod ? mod.desc : '';
    this.setHtml(
      this.upgradesEl,
      run.upgrades
        .map((id) => `<span title="${UPGRADES[id].name}: ${UPGRADES[id].desc}">${UPGRADES[id].icon}${id === 'rod' ? `<small>${game.rodCharges}</small>` : ''}</span>`)
        .join(''),
    );

    const slots = [];
    for (const p of packages.cargo) {
      const look = packageLook(p);
      const colored = p.type === 'curse' || p.type === 'smuggle' || p.type === 'fragile' || p.type === 'express';
      const style = colored ? `;background:${look.color}` : '';
      let content = look.icon || '$' + p.pay;
      if (p.type === 'fragile') content = `${look.icon}<small>$${p.pay}</small>`;
      if (p.type === 'express') {
        const urgent = !p.late && p.timeLeft <= 8;
        content = `${look.icon}<small class="${urgent ? 'urgent' : ''}">${p.late ? 'telat' : `${Math.ceil(p.timeLeft)}s`}</small>`;
      }
      slots.push(`<span class="slot ${p.type}" style="flex:${p.slots}${style}">${content}</span>`);
    }
    for (let i = 0; i < packages.slotsFree; i++) slots.push('<span class="slot empty" style="flex:1"></span>');
    this.setHtml(this.cargoEl, slots.join(''));
    this.blessingEl.classList.toggle('show', packages.blessed);
    const fx = game.effects;
    this.setHtml(
      this.cursesEl,
      fx.curses.map((id) => `<div class="hud-curse" style="background:${CURSES[id].color}">${CURSES[id].icon} ${CURSES[id].god} · ${CURSES[id].desc}</div>`).join(''),
    );
    this.updateDarkness(fx.visionRadius);

    const prompt = this.promptText();
    this.setHtml(this.promptEl, prompt);
    this.promptEl.classList.toggle('show', prompt !== '');

    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show');
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.vignetteEl.style.opacity = String(this.hitTimer * 1.6);
    this.root.classList.toggle('night', clock.phase !== PHASE.DAY);
    this.root.classList.toggle('storm', clock.phase === PHASE.STORM || clock.phase === PHASE.LIMIT);
    this.root.classList.toggle('fast', game.car.speed > game.cfg.car.maxSpeed * 0.92 && !game.car.airborne);
    this.root.classList.toggle('turbo', game.car.boostTime > 0);
    document.body.classList.toggle('hades', Boolean(fx.visionRadius));

    this.updateArrows();
    this.minimap.update();
  }
}
