# Hermes Express — Graybox Prototype

Prototype graybox untuk **core loop** Hermes Express (H.EX), dibuat dengan Three.js. Prototype ini dipakai untuk menguji dua hipotesis di GDD pada playtest akhir minggu 2:

- **H1 (hook):** pemain bereaksi saat blessing Zeus hilang setelah paket diantar, lalu mulai memikirkan kapan dan di mana mengantar paket dewa.
- **H2 (greed):** pemain tergoda mengambil "satu paket lagi" menjelang senja.

Scope-nya setara **Plan B** di GDD: paket Safe + Zeus, petir, dan badai pemburu. Paket selundupan, Minotaur, dan upgrade belum masuk.

## Menjalankan

Butuh Node.js 20.19+ atau 22.12+.

```bash
npm install
npm run dev        # buka http://localhost:5173
```

URL bisa diberi parameter:

| Parameter | Fungsi |
|---|---|
| `?seed=123` | Run deterministik: spawn paket dan petir sama persis setiap kali |
| `?debug=1` | Panel debug langsung terbuka (bisa juga dibuka dengan tombol <kbd>`</kbd>) |

## Kontrol

| Tombol | Aksi |
|---|---|
| <kbd>W</kbd> / <kbd>S</kbd> (atau panah) | Gas / rem, lalu mundur |
| <kbd>A</kbd> / <kbd>D</kbd> | Belok |
| <kbd>E</kbd> | Berhenti di penanda, lalu ambil/antar paket. Di HQ: akhiri hari |
| <kbd>Esc</kbd> | Pause (ada tombol unduh log playtest) |
| <kbd>Enter</kbd> | Tombol utama di layar intro/laporan |

## Yang ada di graybox ini

| Sistem | Perilaku |
|---|---|
| Hari | 06:00 → 18:00 (senja, "Pulang ke HQ!") → 20:00 (badai memburu). ±2 menit nyata sampai senja |
| HQ | Tempat spawn pagi dan akhir hari. Pulang sebelum 18:00 butuh E dua kali |
| Paket Safe | 1 slot. Bayaran naik sesuai jarak. Muncul acak di pinggir jalan; selalu ada minimal 1 di dekat van, maksimal 6 aktif |
| Paket Zeus | 2 slot, $400, tujuan **Electrical Plant** di dalam zona Zeus. Selama dibawa van kebal petir dan bercahaya. Saat diantar, blessing langsung hilang |
| Petir zona Zeus | Selalu ada tanda di tanah ~1 detik sebelum menyambar. Jatuh di sekitar van selama van di zona |
| Badai pemburu | Mulai 20:00, menyasar posisi van di seluruh kota, makin rapat sampai van masuk HQ |
| Damage | Tanpa HP. Tabrakan dan petir menambah tagihan repair. Van punya 3 state visual; setelah state 3 muncul asap dan percikan. Angkanya baru terlihat di laporan |
| Laporan | Income − damage − 10% bayaran paket yang masih dibawa (− biaya derek) = profit. Profit ≥ quota → lanjut, kurang → ulang dari Day 1 |
| Run | 7 hari. Day 1 di run pertama di-script sebagai tutorial: paket Zeus menunggu di seberang HQ |

## Tuning

Semua angka ada di [`src/config.js`](src/config.js). Nilai bertanda `TODO(GDD)` adalah **placeholder untuk graybox karena GDD belum menentukannya**:

- **Batas akhir malam:** jam 24:00 van diderek otomatis ke HQ dengan biaya derek $300.
- **Undelivered offering:** denda 10% dari bayaran tiap paket yang masih dibawa saat hari berakhir.
- **Quota per hari:** $200 → $800 (naik $100 per hari).
- **Biaya damage:** petir $60, badai $80, tabrakan $3 per unit kecepatan tumbukan (di atas 5).

## Debug dan playtest

Panel debug (<kbd>`</kbd>) berisi time scale, lompat ke 17:30/18:00/20:00/23:45, beri paket Zeus, teleport ke plant/HQ, god mode, dan akhiri hari.

Selama bermain, game mencatat event playtest: pickup, deliver, blessing didapat/hilang, sambaran yang kena, tabrakan, pergantian fase, jam pulang, dan ringkasan laporan. Setiap event membawa hari dan jam in-game. Log bisa diunduh sebagai JSON dari layar pause atau layar menang. Data ini membantu menjawab H2, misalnya apakah pemain masih mengambil paket setelah 17:00 dan jam berapa mereka pulang.

### Membagikan untuk playtest online

```bash
npm run build      # hasilnya di dist/, path relatif
```

Zip **isi** folder `dist/` (dengan `index.html` di root zip), lalu upload ke itch.io sebagai proyek HTML. Folder `dist/` juga bisa ditaruh di host statis mana pun.

## Struktur kode

```
src/
  config.js        semua angka tuning
  main.js          game loop fixed-step 60 Hz, menyambungkan semuanya
  sim/             logika game murni (tanpa three.js), bisa dites headless
    game.js        orkestrator: step, interaksi E, akhir hari
    world.js       layout map: jalan, gedung, HQ, plant, zona Zeus, titik paket
    car.js         driving arcade + collision
    clock.js       jam dan fase hari
    packages.js    spawn, cargo/slot, ambil/antar, blessing
    hazards.js     petir zona dan badai pemburu
    damage.js      catatan damage dan state visual
    run.js         struktur 7 hari, quota, laporan
    events.js      event bus + telemetri playtest
  render/          three.js: kamera isometric, cahaya siang-malam, van, marker, petir
  ui/              HUD, layar intro/laporan/menang/pause, panel debug
tests/             unit test (Vitest)
e2e/               smoke test di browser (Playwright)
```

## Tes

```bash
npm test                       # unit test logika (Vitest)
npx playwright install chromium   # sekali saja, untuk e2e
npm run test:e2e               # smoke test: intro → Zeus → blessing hilang → senja → badai → laporan → Day 2
```
