# Hermes Express — Graybox Prototype

Prototype graybox untuk **core loop** Hermes Express (H.EX), dibuat dengan Three.js. Prototype ini dipakai untuk menguji dua hipotesis di GDD pada playtest akhir minggu 2:

- **H1 (hook):** pemain bereaksi saat blessing Zeus hilang setelah paket diantar, lalu mulai memikirkan kapan dan di mana mengantar paket dewa.
- **H2 (greed):** pemain tergoda mengambil "satu paket lagi" menjelang senja.

Scope-nya: paket Safe, Zeus, **Selundupan** (Chance), dan kategori **Curse** (5 dewa), plus petir, badai pemburu, dan Minotaur. Upgrade belum masuk.

## Map

Map dibuat dari sketsa kasar tim (utara = atas):

| Wilayah | Isi |
|---|---|
| **Istana Zeus** (kiri atas) | Ring road besar mengelilingi plaza luas. Di tengah ada halaman marmer dengan dua sayap istana, ramp "steep" ke tenggara, dan aula panjang di barat laut. Laut Aegea di utaranya. **Paket Zeus selalu diambil di Gerbang Istana.** |
| **Gunung Olympus** (kanan atas) | Jalan berkelok dengan hairpin, menanjak sampai **Electrical Plant** di puncak. Lereng di luar jalan berupa **teras berundak** yang bisa dijelajahi. Undakan terlalu tinggi untuk dinaiki (van menabraknya seperti tembok), jadi **naik ke plant hanya bisa lewat jalan**. Turun boleh nekat lewat lereng: van melayang dari undakan dan **mendarat keras dengan damage**. Lereng atas adalah zona petir. Ada Kuil Gunung di tengah jalan. |
| **Gubuk di lereng** | **Gubuk Gembala** ada di teras dalam zona petir; untuk sampai ke sana, keluar dari baris jalan berkelok di atasnya lalu turun ke terasnya. **Gubuk Penebang** ada di dataran rendah antara kaki gunung dan jalan diagonal, dijaga Minotaur ketiga. |
| **Padang Minotaur** (tengah kiri) | Lapangan terbuka yang dilewati jalan dari Base ke istana. Di sini ada 2 Minotaur. |
| **Base** (kiri bawah) | HQ Hermes Express dan lot parkir. |
| **Perumahan Arcadia** (bawah tengah) | Rumah-rumah kecil di dalam ring road. |
| **Kota** (kanan bawah) | Gedung padat dengan ring road, jalan dalam berbentuk oval, avenue, dan jalan diagonal. |

Jalan diagonal dari istana menyusuri kaki gunung ke kota. Di tengahnya ada percabangan ke jalan berkelok. Jalan utama timur-barat menghubungkan Base, perumahan, dan kota. Semua koordinat ditulis dalam piksel sketsa di [`src/sim/world.js`](src/sim/world.js), jadi bentuknya gampang digeser mengikuti sketsa.

Minimap di kanan bawah diputar 45° supaya arahnya sama dengan kamera isometric.

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
| Hari | 06:00 → 18:00 (senja, "Pulang ke HQ!") → 20:00 (badai memburu). 2 menit nyata sampai senja |
| HQ | Tempat spawn pagi dan akhir hari. Pulang sebelum 18:00 butuh E dua kali |
| Paket Safe | 1 slot. Bayaran naik sesuai jarak. Muncul acak di pinggir jalan; selalu ada minimal 1 di dekat van, maksimal 6 aktif |
| Paket Zeus | 2 slot, $400. Diambil di Gerbang Istana Zeus, diantar ke **Electrical Plant** di puncak gunung. Selama dibawa, van kebal petir dan bercahaya. Saat diantar, blessing langsung hilang dan van harus turun gunung tanpa perlindungan |
| Petir zona Zeus | Selalu ada tanda di tanah ~1 detik sebelum menyambar. Jatuh di sekitar van selama van berada di lereng gunung |
| Minotaur | Berkeliaran di padang. Kalau van masuk jangkauannya, Minotaur ancang-ancang ~0,9 detik (panah merah di tanah menunjukkan jalurnya, ditambah tanda "!"), lalu menyeruduk lurus. Kalau kena, van terpental dan tergelincir, lalu Minotaur pusing sebentar. Menabrak Minotaur yang sedang tenang juga membuatnya marah |
| Badai pemburu | Mulai 20:00, menyasar posisi van di seluruh kota, makin rapat sampai van masuk HQ |
| Damage | Tanpa HP. Tabrakan (termasuk menabrak undakan), petir, serudukan Minotaur, dan pendaratan keras menambah tagihan repair. Van punya 3 state visual; setelah state 3 muncul asap dan percikan. Angkanya baru terlihat di laporan |
| Laporan | Income − damage − 10% bayaran paket yang masih dibawa (− biaya derek) = profit. Profit ≥ quota → lanjut, kurang → ulang dari Day 1 |
| Run | 7 hari. Day 1 di run pertama di-script sebagai tutorial: paket Zeus dijamin menunggu di Gerbang Istana, dan panah ⚡ menunjukkan arahnya |

## Paket Selundupan (Chance)

Peti hitam bersinar merah yang muncul acak di titik paket biasa, mulai Day 3 (`smuggle.fromDay`, sesuai GDD), paling banyak 2 menunggu di map. Labelnya menulis **persentase scam** (5–40%), dan bayarannya naik sebanding: rumus Safe × (1,3 + 4 × peluang scam), jadi 5% ≈ ×1,5 dan 40% ≈ ×2,9.

Hasilnya diundi saat diantar:
- **Legit:** bayaran masuk, banner "💰 Legit!".
- **Scam:** bayaran hangus, paket meledak (bola api, layar berkilat, van terlempar), dan tagihan repair $120 (`smuggle.scamDamage`) masuk laporan sebagai "Selundupan meledak". Banner "💥 SCAM!" memakai kalimat komedi acak.

Selundupan bisa dibawa bersama curse maupun Zeus. Panel debug punya tombol untuk langsung memberi paket selundupan.

## Paket Curse

Kategori sendiri: paket dewa yang membawa **efek buruk selama dibawa**, dan efeknya hilang begitu paket diantar (*"The curse belonged to the package too."*). Bayarannya ±2× paket Safe, makan 1 slot, dan tujuannya selalu jauh. Muncul mulai Day 2 (`curse.fromDay`), paling banyak 1 menunggu di map dan 2 per hari.

| Dewa | Efek selama dibawa | Pickup → tujuan (bila tersedia) |
|---|---|---|
| 🍷 **Dionysus** · Mabuk | Setir tertunda 0,25 detik, van oleng sendiri, kamera bergoyang pelan | Kafe Dionysus → Aula Istana Zeus (pesta) |
| ⏳ **Chronos** · Waktu ngebut | Jam in-game berjalan 2×, jadi senja dan badai datang lebih cepat | acak |
| 💀 **Hades** · Gelap | Pandangan menyempit ke lingkaran di sekitar van. Paket lain dan Minotaur hilang dari layar dan minimap; hanya tujuan yang ditunjuk | acak → Dermaga Poseidon |
| 💘 **Aphrodite** · Terpikat | Minotaur tidak menyeruduk, tapi jatuh cinta dan membuntuti van, bahkan keluar padang. Kalau van berhenti di dekatnya, Minotaur menyundul pelan tanpa damage | Butik Aphrodite → Gubuk Penebang |
| ⚔️ **Ares** · Provokasi | Minotaur melihat 2× lebih jauh, ancang-ancang ½ lebih singkat, menyeruduk 1,5× lebih jauh, dan mengejar sampai keluar padang | Gym Ares → Ladang Minotaur |

Efek bisa bertumpuk (misalnya Chronos + Hades). Kalau membawa Aphrodite dan Ares sekaligus, yang berlaku untuk Minotaur adalah curse yang diambil terakhir. Semua angka ada di `curse.effects` di `src/config.js`. Panel debug punya tombol untuk langsung memberi tiap curse.

Catatan: goyangan kamera Dionysus kecil (`cameraSway`), tapi belum ada opsi untuk mematikannya.

## Tuning

Semua angka ada di [`src/config.js`](src/config.js). Nilai bertanda `TODO(GDD)` adalah **placeholder untuk graybox karena GDD belum menentukannya**:

- **Batas akhir malam:** jam 24:00 van diderek otomatis ke HQ dengan biaya derek $300.
- **Undelivered offering:** denda 10% dari bayaran tiap paket yang masih dibawa saat hari berakhir.
- **Quota per hari:** $200 → $800 (naik $100 per hari).
- **Biaya damage:** petir $60, badai $80, Minotaur $100, tabrakan $3 per unit kecepatan tumbukan (di atas 5), pendaratan $10 per unit kecepatan jatuh di atas 7. Turun satu undakan (±2,5 unit) sekitar $50.
- **Medan:** tinggi undakan 2,5 (`TERRAIN` di `src/sim/world.js`), batas panjat `car.maxClimbSlope` 0,35. Jalan gunung paling curam 0,18, jadi selalu bisa dinaiki.
- **Minotaur aktif mulai Day 1** (`minotaur.activeFromDay`). Ubah ke 2 kalau ingin tutorial Day 1 tanpa Minotaur.

Karena map ini lebih besar, satu hari dibuat 2 menit sampai senja dan kecepatan van dinaikkan ke 22. Dari panjang jalannya, satu perjalanan Zeus pulang-pergi (Base → istana → puncak → Base) diperkirakan makan sekitar setengah hari, jadi mengambil paket Zeus adalah keputusan besar. Angka ini belum diuji dengan pemain.

## Debug dan playtest

Panel debug (<kbd>`</kbd>) berisi time scale, lompat ke 17:30/18:00/20:00/23:45, beri paket Zeus, teleport (HQ, Gerbang Istana, Padang Minotaur, kaki gunung, plant), god mode, dan akhiri hari.

Selama bermain, game mencatat event playtest: pickup, deliver, blessing didapat/hilang, sambaran yang kena, serudukan Minotaur, pendaratan keras, curse didapat/terangkat (beserta lama dibawa), hasil selundupan (legit/scam), tabrakan, pergantian fase, jam pulang, dan ringkasan laporan. Setiap event membawa hari dan jam in-game. Log bisa diunduh sebagai JSON dari layar pause atau layar menang. Data ini membantu menjawab H2, misalnya apakah pemain masih mengambil paket setelah 17:00 dan jam berapa mereka pulang.

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
    world.js       map dari sketsa: wilayah, jalan, gedung, elevasi gunung, titik paket, collider
    geometry.js    helper polyline/polygon
    collision.js   collider kotak berotasi, dinding kapsul, lingkaran + grid spasial
    car.js         driving arcade, tanjakan, collision, impuls
    minotaurs.js   AI Minotaur: berkeliaran → ancang-ancang → menyeruduk → pusing (+ mode Ares/Aphrodite)
    curses.js      definisi 5 curse, gabungan efek dari cargo, dan tampilan tiap tipe paket
    clock.js       jam dan fase hari
    packages.js    spawn, cargo/slot, ambil/antar, blessing
    hazards.js     petir zona dan badai pemburu
    damage.js      catatan damage dan state visual
    run.js         struktur 7 hari, quota, laporan
    events.js      event bus + telemetri playtest
  render/          three.js: kamera isometric, medan gunung, jalan, gedung, van, marker, petir, Minotaur
  ui/              HUD, minimap, layar intro/laporan/menang/pause, panel debug
tests/             unit test (Vitest)
e2e/               smoke test di browser (Playwright)
```

## Tes

```bash
npm test                       # unit test logika + map (semua titik bisa dicapai, van tidak bisa terjebak, plant hanya lewat jalan)
npx playwright install chromium   # sekali saja, untuk e2e
npm run test:e2e               # smoke test: intro → Zeus → blessing hilang → senja → badai → laporan → Day 2
```
