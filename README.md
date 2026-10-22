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

**Skala dan hirarki jalan.** Map 1,4× lebih besar dari versi pertama (`SCALE` di `src/sim/world.js`; `K` ikut menskalakan gedung dan gunung). Jalan dibagi beberapa kelas, dan tiap kelas punya lebar, tampilan, dan batas kecepatan sendiri (`ROAD_WIDTH` / `ROAD_SPEED`). Kecepatan maksimal van dikali faktor permukaan di bawahnya:

| Kelas | Tampilan | Lebar | Kecepatan |
|---|---|---|---|
| Jalan utama (`main`) & ring road | aspal gelap, garis kuning ganda / putih putus-putus, garis tepi, trotoar, lampu jalan | 14 | ×1,15 |
| Jalan gunung (`mountain`) | aspal, garis kuning putus-putus | 11 | ×1 |
| Jalan kota/perumahan (`street`) | abu-abu terang, tanpa marka | 8 | ×0,95 |
| Jalan tanah (`path`) | tanah | 5 | ×0,9 |
| Di luar jalan (rumput, padang, lereng) | | | ×0,75 (`OFFROAD_SPEED`) |

**Vegetasi dan isi map** ([`src/sim/vegetation.js`](src/sim/vegetation.js)): hutan kecil zaitun dan cemara yang berkelompok, pinus di lereng atas, palem di pantai, serta semak dan batu sebagai pengisi. Sebarannya deterministik, jadi map selalu sama. Pohon di tanah datar punya batang yang bisa ditabrak. Pohon di lereng hanya hiasan, supaya tidak membentuk kantong yang menjebak van. Di Padang Minotaur pohonnya jarang supaya tetap ada ruang menghindar. Area yang sebelumnya kosong sekarang terisi: rumput, pantai di sepanjang laut, ladang dengan barisan tanaman di selatan, dan pelataran kota/perumahan.

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
| `?zeus=0` | Matikan reaksi "Zeus LIVE" di pojok layar |
| `?npc=0` | Map tanpa penghuni (tanpa lalu lintas, pejalan kaki, hewan, burung) |
| `?drift=0` | Drift/handbrake mati (setir normal). `?drift=1` menyalakannya |

## Kontrol

| Tombol | Aksi |
|---|---|
| <kbd>W</kbd> / <kbd>S</kbd> (atau panah) | Gas / rem, lalu mundur |
| <kbd>A</kbd> / <kbd>D</kbd> | Belok |
| <kbd>Space</kbd> (tahan) | Handbrake: van ngepot/drift. Drift lama lalu lepas = turbo |
| <kbd>H</kbd> | Drift on/off (diingat di browser) |
| <kbd>E</kbd> | Berhenti di penanda, lalu ambil/antar paket. Di HQ: akhiri hari |
| <kbd>Esc</kbd> | Pause (ada tombol unduh log playtest) |
| <kbd>M</kbd> | Mute / unmute suara |
| <kbd>Enter</kbd> | Tombol utama di layar intro/laporan |

## Zeus LIVE

Di pojok kiri atas ada kamera reaksi **Zeus LIVE**. Wajah kartun Zeus berganti ekspresi (menyeringai, marah, murka, tertawa, kesal), dengan gelembung kata yang diketik dan suara gumaman "bahasa dewa".

| Momen | Reaksi Zeus |
|---|---|
| Senja | Menyindir: "Jam 8 nanti aku turun tangan. Siap-siap ya~" |
| **Badai mulai (20:00)** | Murka dan layar bergetar: **"BALIK! BALIK! BALIK KE HQ!"** |
| Selama badai | Kamera terus siaran dan mengejek tiap 4–7 detik, tergantung jarak van ke HQ: jauh "Lari, kurir, LARI!", sedang "Aku melihatmu… 👁️", dekat "JANGAN BERANI-BERANI MASUK HQ!" |
| Petir meleset / kena / ditahan blessing | "HAMPIR!" / "KENA! HAHAHAHA" / "Cih. Paketku melindungimu." |
| Masuk wilayah petir di siang hari | "Gunungku bukan jalan pintas!" |
| Ambil / antar paket Zeus | "Bawa paketku baik-baik." / "Sekarang kau tak terlindung lagi… 😈" |
| Sampai HQ saat badai | Kesal "Huh. Lolos kali ini…", lalu kamera mati |
| Menjelang tengah malam | "TENGAH MALAM SEBENTAR LAGI!" |

- **Prioritas kalimat:** kalimat penting (mis. "BALIK!") tidak dipotong reaksi kecil, dan reaksi kecil punya jeda supaya Zeus tidak cerewet.
- **Pengaturan:** semua angka ada di `zeusCam` di config. Bisa dimatikan dengan `?zeus=0` atau lewat panel debug.
- **`?calm=1`** mematikan getarnya.

## Penghuni map

Supaya map terasa hidup, ada penghuni yang bergerak sendiri. Semua angkanya ada di blok `npc` di [`src/config.js`](src/config.js).

| Penghuni | Tempat | Perilaku |
|---|---|---|
| **Lalu lintas** (±30 kendaraan) | Semua jalan aspal | Ada mobil warga, kereta kuda, truk sayur Demeter, dan van saingan ungu **Iris Express** yang suka klakson. Di jalan gunung ada gerobak kambing. Mobil jalan di lajur kanan, mengerem untuk halangan di depan, dan melambat di tikungan. Kalau van parkir di lajur, mobil di belakangnya klakson "TIN!" lalu **menyalip** |
| **Pejalan kaki** (±50 orang berjubah) | Trotoar kota, perumahan, istana | Berjalan, berhenti, dan kadang menyeberang (mobil mengerem untuknya) |
| **Domba** | Ladang selatan dan Gubuk Gembala | Merumput berkelompok, lalu kabur "MBEEE!" saat van mendekat |
| **Ayam** | Perumahan dan ladang | Mematuk, menyeberang jalan, dan panik zig-zag "PETOK!" |
| **Kambing** | Teras lereng gunung | Merumput, lalu kabur melompat |
| **Burung** | Merpati di alun-alun dan Gerbang Istana, camar di pantai | Mematuk tanah, lalu berhamburan terbang saat van lewat |

- **Menabrak mobil NPC** dihitung sebagai tabrakan biasa: biaya repair kecil sesuai kecepatan tumbukan. Mobil NPC terpental dan berputar, sopirnya marah ("WOI!", "PAKAI MATA!"), lalu mobil itu kembali ke lajurnya.
- **Pejalan kaki dan hewan tidak bisa tertabrak.** Mereka selalu sempat melompat ke samping sambil berteriak ("AAAH!", "ASTAGA ZEUS!"), lalu duduk kaget sebentar. Orang atau hewan yang diam di jalan akan diklakson mobil NPC sampai minggir.
- **Saat badai Zeus:**
  - Sebagian besar mobil pulang dan orang berlari masuk rumah, jadi kota sepi.
  - Petir bisa menyambar mobil NPC dan domba. Mereka hangus sebentar, tanpa damage.
- **Suara:** klakson, teriakan, embik, petok, dan kepak sayap. Semuanya hanya terdengar di dekat van. Saat van di distrik ramai ada gumam kota yang pelan.
- **Bisa dimatikan:** `?npc=0`, atau folder "Penghuni map" di panel debug (bisa per jenis).
- **Teknis:**
  - NPC memakai RNG sendiri, jadi `?seed=` tetap menghasilkan paket dan petir yang sama.
  - Simulasi NPC sekitar 0,2 ms per step.
  - Semua NPC digambar dengan InstancedMesh.

## Drift & handbrake

Supaya menyetir terasa konyol dan seru:
- **Cara ngepot:** tahan <kbd>Space</kbd> sambil belok. Buntut van langsung terlempar ke samping, lalu badan van oleng berlebihan. Arah laju menyusul hidung van pelan-pelan tanpa kehilangan kecepatan, jadi ngepot di tikungan tidak memperlambat. Lawan setir untuk mengontrol sudutnya.
- **Mini-turbo:**
  - Drift ≥ 0,7 detik lalu lepas: **TURBO!** (percikan biru, ×1,25 kecepatan maks selama 0,6 detik).
  - Drift ≥ 1,6 detik: **MEGA TURBO!!** (percikan oranye, ×1,4 selama 1,1 detik).
  - Saat turbo, van sedikit *wheelie* dan keluar api dari knalpot.
  - Turbo tidak keluar kalau van berputar-putar sampai hampir berhenti.
- **Feedback:** bekas ban di tanah, asap ban, teks "SKRRT!" / "WHEEE!" / "NGEPOT!", decit ban, dan bunyi whoosh turbo.
- **Diseruduk Minotaur tidak dihitung drift:** drift hanya dimulai dengan handbrake.
- **Bisa dimatikan:** tombol <kbd>H</kbd>, `?drift=0`, panel debug, atau `car.drift.enabled` di config. Semua angka ada di `car.drift`.

## Yang ada di graybox ini

| Sistem | Perilaku |
|---|---|
| Hari | 06:00 → 18:00 (senja, "Pulang ke HQ!") → 20:00 (badai memburu). 84 detik nyata sampai senja, badai di detik 98 |
| HQ | Tempat spawn pagi dan akhir hari. Pulang sebelum 18:00 butuh E dua kali |
| Paket Safe | 1 slot. Bayaran naik sesuai jarak. Muncul acak di pinggir jalan; selalu ada minimal 1 di dekat van, maksimal 6 aktif |
| Paket Zeus | 2 slot, $400. Diambil di Gerbang Istana Zeus, diantar ke **Electrical Plant** di puncak gunung. Selama dibawa, van kebal petir dan bercahaya. Saat diantar, blessing langsung hilang dan van harus turun gunung tanpa perlindungan |
| Petir zona Zeus | Selalu ada tanda di tanah ~1 detik sebelum menyambar. Jatuh di sekitar van selama van berada di lereng gunung |
| Minotaur | Berkeliaran di padang. Kalau van masuk jangkauannya, Minotaur ancang-ancang ~0,9 detik (panah merah di tanah menunjukkan jalurnya, ditambah tanda "!"), lalu menyeruduk lurus. Kalau kena, van terpental dan tergelincir, lalu Minotaur pusing sebentar. Menabrak Minotaur yang sedang tenang juga membuatnya marah |
| Badai pemburu | Mulai 20:00, menyasar posisi van di seluruh kota, makin rapat sampai van masuk HQ |
| Damage | Tanpa HP. Tabrakan (termasuk menabrak undakan), petir, serudukan Minotaur, dan pendaratan keras menambah tagihan repair. Van punya 3 state visual; setelah state 3 muncul asap dan percikan. Angkanya baru terlihat di laporan |
| Laporan | Income − damage − 10% bayaran paket yang masih dibawa (− biaya derek) = profit. Profit ≥ quota → lanjut, kurang → ulang dari Day 1 |
| Run | 7 hari. Day 1 di run pertama di-script sebagai tutorial: paket Zeus dijamin menunggu di Gerbang Istana, dan panah ⚡ menunjukkan arahnya |

## Suara dan juice

Semua suara **disintesis dengan WebAudio**, jadi tidak ada file aset. Suara baru menyala setelah tombol pertama ditekan (aturan autoplay browser). **M** untuk mute. Volume tiap kanal (master, sfx, music, engine) bisa diatur di panel debug dan di `audio` pada `src/config.js`.

- **Mesin van:** pitch mengikuti kecepatan, tersendat saat rusak berat, nyaris hilang saat melayang. Ban berdecit saat van tergelincir.
- **Musik prosedural** bernuansa Yunani: riang di siang hari, minor dan lebih pelan saat senja, cepat dan tegang saat badai. Hades membuatnya gelap teredam; Dionysus membuatnya fals.
- **SFX untuk setiap event:** ambil/antar paket, tabrakan, terjun dan mendarat, petir (makin keras makin dekat), perisai blessing, blessing hilang, riff khas tiap curse, dengus dan serudukan Minotaur, selundupan legit/meledak, gong senja, sirene badai, serta tick, fanfare, atau trombon sedih di laporan.
- **Juice visual:**
  - camera shake berbasis "trauma" dan hitstop singkat (tabrakan keras, serudukan, blessing hilang, scam);
  - zoom kick dan partikel instanced (debu ban, percikan, koin, asap, serpihan);
  - teks melayang (+$, BONK!, ZAP!, HIK!, boop);
  - dunia memudar sesaat saat blessing hilang, van squash & stretch saat mendarat, kargo membal saat diambil;
  - tepi layar merah berdenyut saat badai, garis kecepatan di kecepatan maksimal;
  - angka laporan bergulir dan stempel LOLOS/GAGAL.
- **`?calm=1`** mematikan guncangan, zoom, dan goyangan kamera (untuk yang mudah pusing). Intensitasnya diatur di `juice` pada `src/config.js`.

Suara belum didengarkan oleh manusia: resep dan volumenya hasil tebakan awal, jadi perlu dicek di Mac dan di-tuning.

## Paket Selundupan (Chance)

Peti hitam bersinar merah yang muncul acak di titik paket biasa sejak Day 1 (`smuggle.fromDay`), paling banyak 2 menunggu di map. Labelnya menulis **persentase scam** (5–40%), dan bayarannya naik sebanding: rumus Safe × (1,3 + 4 × peluang scam), jadi 5% ≈ ×1,5 dan 40% ≈ ×2,9.

Hasilnya diundi saat diantar:
- **Legit:** bayaran masuk, banner "💰 Legit!".
- **Scam:** bayaran hangus, paket meledak (bola api, layar berkilat, van terlempar), dan tagihan repair $120 (`smuggle.scamDamage`) masuk laporan sebagai "Selundupan meledak". Banner "💥 SCAM!" memakai kalimat komedi acak.

Selundupan bisa dibawa bersama curse maupun Zeus. Panel debug punya tombol untuk langsung memberi paket selundupan.

## Paket Curse

Kategori sendiri: paket dewa yang membawa **efek buruk selama dibawa**, dan efeknya hilang begitu paket diantar (*"The curse belonged to the package too."*). Bayarannya ±2× paket Safe, makan 1 slot, dan tujuannya selalu jauh. Muncul sejak Day 1 (`curse.fromDay`), paling banyak 1 menunggu di map dan 2 per hari.

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

Satu hari dibuat 84 detik sampai senja (`time.realSecondsPerHour` = 7) dan kecepatan van 22 (25 di jalan utama). Sejak map diperbesar 1,4×, satu perjalanan Zeus pulang-pergi (Base → istana → puncak → Base) bisa memakan sebagian besar hari, jadi mengambil paket Zeus adalah keputusan besar. Kalau terasa terlalu panjang, angka yang bisa diputar: `time.realSecondsPerHour`, `ROAD_SPEED`, `SCALE`, atau bayaran Zeus. Angka ini belum diuji dengan pemain.
- **Semua jenis paket (Safe, Zeus, Curse, Selundupan) muncul sejak Day 1.** Di awal tiap hari dijamin ada minimal 1 paket curse dan 1 selundupan di map (`packages.guaranteeSpecialAtStart`).

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
    world.js       map dari sketsa: wilayah, jalan (hirarki + kecepatan), gedung, elevasi gunung, titik paket, collider
    vegetation.js  sebaran pohon, semak, batu (deterministik, berkelompok)
    geometry.js    helper polyline/polygon
    collision.js   collider kotak berotasi, dinding kapsul, lingkaran + grid spasial
    car.js         driving arcade, handbrake/drift + mini-turbo, tanjakan, collision, impuls
    lanes.js       lajur mobil (loop per jalan) dan trotoar untuk NPC
    traffic.js     lalu lintas NPC: ikut lajur, mengerem, menyalip, terpental saat ditabrak
    crowd.js       pejalan kaki & hewan: berjalan, menyeberang, menghindar, kabur, pulang saat badai
    minotaurs.js   AI Minotaur: berkeliaran → ancang-ancang → menyeruduk → pusing (+ mode Ares/Aphrodite)
    curses.js      definisi 5 curse, gabungan efek dari cargo, dan tampilan tiap tipe paket
    clock.js       jam dan fase hari
    packages.js    spawn, cargo/slot, ambil/antar, blessing
    hazards.js     petir zona dan badai pemburu
    damage.js      catatan damage dan state visual
    run.js         struktur 7 hari, quota, laporan
    events.js      event bus + telemetri playtest
  render/          three.js: kamera isometric, medan gunung, jalan, gedung, van, marker, petir, Minotaur, NPC & burung,
                   juice (shake/hitstop/zoom), particle pool, teks melayang, efek per event
  audio/           WebAudio: synth, resep SFX, mesin van, musik prosedural
  ui/              HUD, minimap, Zeus LIVE (reaksi Zeus), layar intro/laporan/menang/pause, panel debug
tests/             unit test (Vitest)
e2e/               smoke test di browser (Playwright)
```

## Tes

```bash
npm test                       # unit test logika + map (semua titik bisa dicapai, van tidak bisa terjebak, plant hanya lewat jalan)
npx playwright install chromium   # sekali saja, untuk e2e
npm run test:e2e               # smoke test: intro → Zeus → blessing hilang → senja → badai → laporan → Day 2
```
