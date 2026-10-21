import { test, expect } from '@playwright/test';

test('core loop: intro → setir → Zeus → blessing hilang → senja → badai → laporan → Day 2', async ({ page }) => {
  const state = () => page.evaluate(() => window.__hex.state());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/?seed=7');
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

  await page.keyboard.press('Enter');
  await expect(page.locator('.hud-day')).toContainText('DAY 2');
  expect(errors).toEqual([]);
});
