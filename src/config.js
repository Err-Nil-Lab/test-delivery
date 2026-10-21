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
    realSecondsPerHour: 8, // 06→18 = 96 s, 18→20 = 16 s
    earlyEndConfirmSeconds: 3, // tekan E lagi dalam waktu ini untuk pulang sebelum senja
  },

  car: {
    radius: 1.6,
    maxSpeed: 20,
    maxReverse: 7,
    accel: 15,
    reverseAccel: 9,
    brake: 34,
    coastDrag: 5,
    steerRate: 2.5, // rad/s pada kecepatan penuh
    steerFullSpeed: 7, // di bawah kecepatan ini belokan melemah
    lateralGrip: 7,
    stopSpeed: 1.5, // "berhenti" = di bawah kecepatan ini
    wallBounce: 0.25,
    wallFriction: 0.85,
    spinDamping: 3,
  },

  damage: {
    collisionMinImpact: 5, // kecepatan tumbukan minimum yang dihitung damage
    collisionCostPerSpeed: 3, // $ per unit kecepatan tumbukan
    collisionCooldown: 0.6,
    lightning: 60, // TODO(GDD): biaya repair per sambaran
    storm: 80,
    towFee: 300, // TODO(GDD): biaya derek saat menyentuh batas malam
    stateThresholds: [150, 400], // total $ untuk state 2 (penyok) dan 3 (rusak berat)
  },

  packages: {
    capacity: 3,
    maxWaiting: 6,
    initialWaiting: 4,
    spawnInterval: 5,
    waitingLifetime: 45,
    nearRadius: 32, // selalu ada minimal 1 paket dalam radius ini
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

  storm: {
    telegraph: 1.0,
    startInterval: 2.4, // jeda sambaran badai di 20:00
    minInterval: 0.8, // jeda tercepat setelah ramp
    rampSeconds: 25,
    targetSpread: 2.5,
    lead: 0.5,
  },
};
