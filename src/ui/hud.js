// HUD DOM: jam, hari, quota, cargo, blessing, prompt E, banner, hint, dan panah arah.
import { formatHour, PHASE } from '../sim/clock.js';
import { Minimap } from './minimap.js';
import { CURSES, packageLook } from '../sim/curses.js';

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

    const right = el('div', 'hud-panel hud-right', this.root);
    el('div', 'hud-caption', right).textContent = 'Cargo';
    this.cargoEl = el('div', 'hud-cargo', right);
    this.blessingEl = el('div', 'hud-blessing', right);
    this.blessingEl.textContent = '⚡ Blessing Zeus · kebal petir';
    this.cursesEl = el('div', 'hud-curses', right);

    this.promptEl = el('div', 'hud-prompt', this.root);
    this.bannerEl = el('div', 'hud-banner', this.root);
    this.toastsEl = el('div', 'hud-toasts', this.root);
    this.arrowsEl = el('div', 'hud-arrows', this.root);
    this.vignetteEl = el('div', 'hud-vignette', this.root);
    // Hades: pandangan menyempit ke lingkaran di sekitar van.
    this.darknessEl = el('div', 'hud-darkness', this.root);
    this.minimap = new Minimap(this.root, game);
    this.arrows = new Map();
    this.bannerTimer = 0;
    this.hitTimer = 0;
    this.lastText = new Map();

    const { bus } = game;
    bus.on('day_start', ({ quota }) => this.banner(`DAY ${game.run.day} / ${game.cfg.run.days}`, `Quota hari ini $${quota}`, 'day', 2.5));
    bus.on('phase', ({ phase }) => {
      if (phase === PHASE.DUSK) this.banner('SENJA', 'Pulang ke HQ!', 'dusk', 3);
      if (phase === PHASE.STORM) this.banner('BADAI ZEUS MEMBURU', 'Pulang ke HQ sekarang!', 'storm', 3);
    });
    bus.on('blessing_gained', () => this.banner('⚡ Blessing Zeus', 'Kebal petir selama paket ini dibawa', 'zeus', 2.5));
    bus.on('blessing_lost', () => this.banner('The blessing belonged to the package, not you.', 'Blessing Zeus hilang. Petir bisa mengenaimu lagi.', 'lost', 4));
    bus.on('deliver', ({ pay, dest }) => this.toast(`+$${pay} · ${dest}`, 'money'));
    bus.on('pickup', ({ packageType, curse, dest }) => {
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
    bus.on('minotaur_charmed', () => this.toast('💘 Minotaur jatuh cinta padamu…', 'curse', 2));
    bus.on('cargo_full', () => this.toast('Cargo penuh! Antar dulu paket yang dibawa.', 'warn'));
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
    this.setHtml(this.moneyEl, `Hari ini <b>$${packages.income}</b> · Quota <b>$${run.quota}</b>`);

    const slots = [];
    for (const p of packages.cargo) {
      const look = packageLook(p);
      const style = p.type === 'curse' ? `;background:${look.color}` : '';
      slots.push(`<span class="slot ${p.type}" style="flex:${p.slots}${style}">${look.icon || '$' + p.pay}</span>`);
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
    document.body.classList.toggle('hades', Boolean(fx.visionRadius));

    this.updateArrows();
    this.minimap.update();
  }
}
