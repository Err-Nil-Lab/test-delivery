import { test, expect } from '@playwright/test';

test('core loop: intro → setir → Zeus → blessing hilang → senja → badai → laporan → bengkel → Day 2', async ({ page }) => {
  const state = () => page.evaluate(() => window.__hex.state());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/?seed=7&tutorial=0');
  await expect(page.getByRole('button', { name: /Mulai/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.hud-clock')).toContainText('06:');

  // Menyetir: W menggerakkan van ke utara (z berkurang).
  const start = await state();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await state()).car.z, { timeout: 15_000 }).toBeLessThan(start.car.z - 2);
  await page.keyboard.up('KeyW');

  // Hook: ambil paket Zeus → blessing aktif.
  await page.evaluate(() => {
    const g = window.__hex.game;
    g.god = true;
    const zeus = g.packages.waiting.find((p) => p.type === 'zeus');
    g.car.reset({ x: zeus.pickup.x, z: zeus.pickup.z, heading: Math.PI });
  });
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state()).blessed).toBe(true);
  await expect(page.locator('.hud-blessing')).toBeVisible();

  // Antar di Electrical Plant → blessing hilang.
  await page.evaluate(() => {
    const g = window.__hex.game;
    g.car.reset({ ...g.world.plant.dropoff, heading: 0 });
  });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.hud-banner')).toContainText('The blessing belonged to the package');
  expect((await state()).blessed).toBe(false);

  // Senja lalu badai pemburu.
  await page.evaluate(() => {
    const g = window.__hex.game;
    g.car.reset({ ...g.world.ref.cityRoad, heading: Math.PI / 2 });
    g.clock.setHour(18);
  });
  await expect(page.locator('.hud-banner')).toContainText('SENJA');
  await page.evaluate(() => window.__hex.jumpTo(20));
  await expect(page.locator('.hud-banner')).toContainText('BADAI');
  await expect
    .poll(() => page.evaluate(() => window.__hex.game.hazards.strikes.some((s) => s.kind === 'storm')), { timeout: 15_000 })
    .toBe(true);

  // Pulang ke HQ + E → laporan akhir hari.
  await page.evaluate(() => {
    const g = window.__hex.game;
    g.car.reset(g.world.hq.spawn);
  });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.screen.report')).toBeVisible();
  await expect(page.locator('.report-table')).toContainText('$400');
  await expect(page.locator('.verdict')).toContainText('LOLOS');

  // Lolos → Bengkel Hephaestus (Kas = profit di atas quota), lalu Day 2 dengan titah dewa.
  await page.keyboard.press('Enter');
  await expect(page.locator('.screen.shop')).toBeVisible();
  await expect(page.locator('.upgrade')).toHaveCount(3);
  await page.keyboard.press('Enter');
  await expect(page.locator('.hud-day')).toContainText('DAY 2');
  await expect(page.locator('.hud-mod')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('audio: menyala setelah input pertama, musik & mesin berjalan, M untuk mute', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=3&tutorial=0');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__hex.audio.ctx?.state)).toBe('running');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  const live = await page.evaluate(() => {
    const a = window.__hex.audio;
    return { mood: a.music.mood, master: a.master.gain.value, engineFreq: a.engine.osc.frequency.value };
  });
  expect(live.mood).toBe('day');
  expect(live.master).toBeGreaterThan(0);
  expect(live.engineFreq).toBeGreaterThan(40);

  // Semua SFX bisa dimainkan di AudioContext sungguhan tanpa error.
  await page.evaluate(() => {
    const a = window.__hex.audio;
    for (const name of ['pickup', 'deliver', 'bump', 'thunder', 'blessingLost', 'explosion', 'ram', 'fanfare', 'sadTrombone']) a.play(name, { strength: 1, near: 1 });
  });

  await page.keyboard.press('KeyM');
  await expect.poll(() => page.evaluate(() => window.__hex.audio.master.gain.value), { timeout: 3000 }).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test('FTUE: cutscene → Hari Pelatihan bersama Hestia → Day 1', async ({ page }) => {
  test.setTimeout(240_000); // banyak langkah; headless swiftshader bisa sangat lambat
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?seed=5&tutorial=1');
  await expect(page.locator('.screen.intro')).toBeVisible();
  await page.keyboard.press('Enter');

  // Cutscene: letterbox + caption, bisa dilewati dengan Esc.
  await expect(page.locator('.cutscene')).toBeVisible();
  await expect(page.locator('.dialogue.caption .text')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cutscene')).toBeHidden();

  // Hari Pelatihan: dialog Hestia + label PELATIHAN.
  const dialog = page.locator('.dialogue.tutorial');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.name')).toHaveText('Hestia');
  await expect(page.locator('.hud-day')).toContainText('PELATIHAN');

  // Jalankan semua langkah seperti pemain (teleport + E / Enter).
  const stepId = () => page.evaluate(() => window.__hex.game.tutorial?.step?.id ?? null);
  const stopAt = (key) =>
    page.evaluate((k) => {
      const g = window.__hex.game;
      const t = g.tutorial;
      const p = k === 'pickup' ? t.pkg.pickup : k === 'dest' ? t.pkg.dest : k === 'hq' ? g.world.hq.spawn : t.target;
      g.car.reset({ x: p.x, z: p.z, heading: 0 });
    }, key);
  // Tekan E lalu tunggu sampai simulasi benar-benar memprosesnya (headless bisa sangat lambat).
  const pressE = async (until, arg) => {
    await page.keyboard.press('KeyE');
    await expect.poll(() => page.evaluate(until, arg), { timeout: 30_000 }).toBe(true);
  };
  const leftStep = (stepName) => window.__hex.game.tutorial?.step?.id !== stepName;
  const picked = () => {
    const g = window.__hex.game;
    return g.packages.cargo.includes(g.tutorial.pkg);
  };

  for (let guard = 0; guard < 20; guard++) {
    const id = await stepId();
    if (!id) break;
    const wait = await page.evaluate(() => window.__hex.game.tutorial.step.waitConfirm ?? false);
    if (wait) {
      await page.keyboard.press('Enter'); // selesaikan ketikan
      await page.keyboard.press('Enter'); // lanjut
      if (id === 'zeus') {
        // Pan kamera ke istana & plant: lewati.
        if (await page.locator('.cutscene').isVisible()) await page.keyboard.press('Escape');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      }
    } else if (id === 'drive') await stopAt('target');
    else if (id === 'gps') await stopAt('pickup');
    else if (id === 'pickup') {
      await stopAt('pickup');
      await pressE(leftStep, 'pickup');
    } else if (id === 'deliver') {
      await stopAt('dest');
      await pressE(leftStep, 'deliver');
    } else if (id === 'fragile' || id === 'express') {
      await stopAt('pickup');
      await pressE(picked);
      await stopAt('dest');
      await pressE(leftStep, id);
    } else if (id === 'home') {
      await page.evaluate(() => {
        const g = window.__hex.game;
        g.car.reset({ ...g.world.ref.outsideHQ, heading: 0 });
      });
      await expect.poll(() => page.evaluate(() => window.__hex.game.leftHQ), { timeout: 30_000 }).toBe(true);
      await stopAt('hq');
      await pressE(() => window.__hex.game.mode === 'normal');
    }
    await expect.poll(stepId, { timeout: 30_000 }).not.toBe(id);
  }

  await expect(page.locator('.hud-day')).toContainText('DAY 1');
  await expect(page.locator('.dialogue.tutorial')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('hex.ftue'))).toBe('1');
  expect(errors).toEqual([]);
});

test('tengah malam: peringatan → petir raksasa → lumpuh → derek → laporan diderek', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?seed=9&tutorial=0');
  await page.keyboard.press('Enter');
  await expect(page.locator('.hud-clock')).toContainText('06:');
  await page.evaluate(() => {
    const g = window.__hex.game;
    g.god = true;
    g.car.reset({ ...g.world.ref.cityRoad, heading: 0 });
    g.clock.setHour(23.99);
  });
  await expect(page.locator('.hud-banner')).toContainText('TENGAH MALAM', { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => window.__hex.game.car.paralyzed), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__hex.game.midnight.phase), { timeout: 60_000 }).toBe('tow');
  await expect(page.locator('.screen.report')).toBeVisible({ timeout: 90_000 });
  expect(await page.evaluate(() => window.__hex.game.run.lastReport.towed)).toBe(true);
  expect(errors).toEqual([]);
});
