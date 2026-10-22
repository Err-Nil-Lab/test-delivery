// Semua angka tuning graybox ada di file ini.
// Nilai bertanda TODO(GDD) adalah placeholder karena GDD belum menentukannya.
// Satuan jarak: 1 unit ≈ 1 meter. Satuan waktu: detik nyata.

export const CONFIG = {
  run: {
    days: 7,
    // Quota profit per hari (Day 1 → Day 7). TODO(GDD): kurva kenaikan quota.
    quotas: [200, 300, 400, 500, 600, 700, 800],
  },

  time: {
    startHour: 6,
    duskHour: 18, // peringatan "Pulang ke HQ!"
    stormHour: 20, // badai Zeus mulai memburu
    limitHour: 24, // TODO(GDD): batas akhir malam → van diderek ke HQ
    realSecondsPerHour: 7, // 06→18 = 84 s, 18→20 = 14 s (30% lebih cepat dari 120 s)
    earlyEndConfirmSeconds: 3, // tekan E lagi dalam waktu ini untuk pulang sebelum senja
  },

  car: {
    radius: 1.6,
    maxSpeed: 22,
    maxReverse: 7,
    accel: 15,
    reverseAccel: 9,
    brake: 34,
    coastDrag: 5,
    offroadDrag: 12, // perlambatan saat keluar jalan utama di atas batas kecepatan permukaan
    steerRate: 2.5, // rad/s pada kecepatan penuh
    steerFullSpeed: 7, // di bawah kecepatan ini belokan melemah
    lateralGrip: 7,
    stopSpeed: 1.5, // "berhenti" = di bawah kecepatan ini
    wallBounce: 0.25,
    wallFriction: 0.85,
    spinDamping: 3,
    gravity: 25, // pengaruh tanjakan: menanjak melambat, menurun bertambah cepat
    slideGrip: 0.15, // grip lateral saat tergelincir setelah diseruduk
    slideSeconds: 0.6,
    maxClimbSlope: 0.35, // tanjakan lebih curam dari ini (di luar jalan) = tembok
    fallGravity: 30, // gravitasi saat van melayang turun dari undakan
    landingFriction: 0.8,
    // Handbrake/drift (tahan Space). Bisa dimatikan: tombol H, ?drift=0, atau panel debug.
    drift: {
      enabled: true,
      follow: 5, // seberapa cepat arah laju menyusul hidung van (rad/s); kecil = sudut ngepot lebih lebar
      gripRecover: 0.45, // detik grip kembali normal setelah Space dilepas (drift masih menyambung)
      steerBoost: 1.35, // belok lebih tajam saat handbrake
      kickSpin: 1.3, // sentakan putar saat Space ditekan sambil belok (lucu & snappy)
      drag: 7, // perlambatan handbrake (dikurangi saat tetap ngegas)
      throttleDragFactor: 0.3,
      minSpeed: 8, // di bawah ini tidak dihitung drift
      minAngle: 0.35, // rad sudut slip minimal supaya dihitung drift
      grace: 0.25, // detik toleransi slip kecil sebelum drift dianggap selesai
      // Mini-turbo: drift cukup lama lalu lepas = dorongan sesaat.
      tiers: [
        { seconds: 0.7, boostSeconds: 0.6, speedMultiplier: 1.25 },
        { seconds: 1.6, boostSeconds: 1.1, speedMultiplier: 1.4 },
      ],
      boostAccel: 40,
    },
  },

  damage: {
    collisionMinImpact: 5, // kecepatan tumbukan minimum yang dihitung damage
    collisionCostPerSpeed: 3, // $ per unit kecepatan tumbukan
    collisionCooldown: 0.6,
    lightning: 60, // TODO(GDD): biaya repair per sambaran
    storm: 80,
    minotaur: 100, // TODO(GDD): biaya repair per serudukan
    landingSafeSpeed: 7, // kecepatan jatuh yang masih aman saat mendarat
    landingCostPerSpeed: 10, // TODO(GDD): $ per unit kecepatan jatuh di atas batas aman
    towFee: 300, // TODO(GDD): biaya derek saat menyentuh batas malam
    stateThresholds: [150, 400], // total $ untuk state 2 (penyok) dan 3 (rusak berat)
  },

  packages: {
    capacity: 3,
    maxWaiting: 6,
    initialWaiting: 4,
    guaranteeSpecialAtStart: true, // awal hari selalu ada min. 1 paket curse dan 1 selundupan (bila sudah boleh muncul)
    spawnInterval: 5,
    waitingLifetime: 45,
    nearRadius: 45, // selalu ada minimal 1 paket dalam radius ini
    nearMinDistance: 8,
    nearCheckInterval: 2,
    minAgeBeforeRetire: 15, // paket Safe boleh dipindahkan ke dekat van setelah menunggu selama ini
    pickupRadius: 4.5,
    dropoffRadius: 5,
    minTripDistance: 40,
    undeliveredPenalty: 0.1, // TODO(GDD): −10% dari bayaran tiap paket yang masih dibawa di akhir hari
    safe: { slots: 1, basePay: 40, payPerUnit: 0.7, maxPay: 200 },
    zeus: { slots: 2, pay: 400, chance: 0.3, maxPerDay: 1 },
  },

  // Kategori Chance: paket selundupan. Persentase scam terlihat sejak awal, bayaran naik sebanding.
  // Diundi saat diantar: legit = uang, scam = uang hangus + paket meledak (damage).
  smuggle: {
    fromDay: 1, // semua jenis paket langsung muncul sejak Day 1
    chance: 0.3,
    maxWaiting: 2,
    slots: 1,
    scamOptions: [0.05, 0.1, 0.2, 0.3, 0.4],
    payBase: 1.3, // bayaran = rumus Safe × (payBase + payPerScam × peluang scam)
    payPerScam: 4, // 5% → ×1,5 · 40% → ×2,9
    maxPay: 450,
    scamDamage: 120, // TODO(GDD): biaya repair saat paket scam meledak
    scamKnockback: 10,
  },

  // Kategori Curse: paket dewa dengan efek buruk selama dibawa, hilang saat diantar.
  curse: {
    fromDay: 1, // semua jenis paket langsung muncul sejak Day 1
    chance: 0.3, // peluang spawn acak menjadi paket curse
    maxWaiting: 1, // paling banyak 1 paket curse menunggu di map
    maxPerDay: 2,
    slots: 1,
    payMultiplier: 2, // bayaran = rumus paket Safe × ini
    maxPay: 380,
    minTripDistance: 60, // perjalanan panjang supaya efeknya terasa
    effects: {
      dionysus: { steerDelay: 0.25, wobble: 0.35, wobbleHz: 0.7, cameraSway: 0.6 },
      chronos: { clockMultiplier: 2 },
      hades: { visionRadius: 16 }, // unit dunia yang masih terlihat di sekitar van
      aphrodite: { followSpeed: 8, followRadius: 40, leash: 90, nudgeSpeed: 6, nudgeInterval: 1.5 },
      ares: { detectMultiplier: 2, windupMultiplier: 0.5, chargeMultiplier: 1.5, chaseMargin: 20 },
    },
  },

  lightning: {
    telegraph: 1.0, // detik dari tanda di tanah sampai petir menyambar
    radius: 3.5,
    zoneInterval: [0.45, 0.9], // jeda antar sambaran saat van di zona Zeus
    zoneTargetSpread: 9, // sambaran jatuh acak di sekitar van
    zoneLead: 0.6, // seberapa jauh sambaran memprediksi arah van (0 = posisi sekarang)
    ambientInterval: [0.9, 1.6], // sambaran hiasan saat van di luar zona
    hitSpeedMultiplier: 0.35,
    hitSpin: 4,
  },

  minotaur: {
    activeFromDay: 1,
    radius: 1.8,
    walkSpeed: 3,
    detectRadius: 26, // jarak Minotaur melihat van
    noticeMargin: 4, // van harus berada di padang (+ margin ini) untuk dikejar
    aimLead: 0.35, // detik prediksi posisi van saat membidik
    windup: 0.9, // detik ancang-ancang (telegraph) sebelum menyeruduk
    chargeSpeed: 30,
    chargeDistance: 40,
    knockback: 26, // kecepatan tambahan pada van saat kena
    knockSpin: 3,
    dizzy: 2.5,
    cooldown: 2,
  },

  // Suara (semua sintesis WebAudio). Mute dengan tombol M.
  audio: {
    enabled: true,
    master: 0.7,
    sfx: 0.9,
    music: 0.35,
    engine: 0.5,
  },

  // Juice: camera shake, hitstop, zoom kick. ?calm=1 di URL mematikan shake/zoom/sway.
  juice: {
    maxShake: 1.6, // unit dunia pada trauma 1
    traumaDecay: 1.6, // per detik
    maxZoomKick: 0.08,
    hitstop: { bump: 0.04, ram: 0.08, blessingLost: 0.12, scam: 0.1 },
    maxParticles: 700,
  },

  storm: {
    telegraph: 1.0,
    startInterval: 2.4, // jeda sambaran badai di 20:00
    minInterval: 0.8, // jeda tercepat setelah ramp
    rampSeconds: 25,
    targetSpread: 2.5,
    lead: 0.5,
  },
};
