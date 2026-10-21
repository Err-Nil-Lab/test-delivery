// Van Hermes Express: kotak graybox, kargo di atap, lampu depan, aura blessing,
// dan tanda damage (3 state + asap/percikan setelah state 3).
import * as THREE from 'three';

const BODY_COLORS = { 1: '#f2f2ee', 2: '#c9c2b0', 3: '#8d7660' };
const SLOT_Z = [1.15, 0, -1.15];

function part(geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export class CarView {
  constructor(scene, bus) {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ'; // heading lalu pitch tanjakan
    this.pitch = 0;
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);

    this.paint = new THREE.MeshStandardMaterial({ color: BODY_COLORS[1], roughness: 0.6, emissive: '#9fc4ff', emissiveIntensity: 0 });
    const stripe = new THREE.MeshStandardMaterial({ color: '#3b6fb6' });
    const glass = new THREE.MeshStandardMaterial({ color: '#24323f', roughness: 0.2 });
    const tyre = new THREE.MeshStandardMaterial({ color: '#1d1d1f' });
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#fff2c0', emissiveIntensity: 0.2 });

    this.body.add(part(new THREE.BoxGeometry(2.2, 1.7, 4.0), this.paint, 0, 1.35, 0));
    this.body.add(part(new THREE.BoxGeometry(2.26, 0.35, 3.0), stripe, 0, 1.15, -0.3));
    this.body.add(part(new THREE.BoxGeometry(1.9, 0.7, 0.08), glass, 0, 1.75, 2.0));
    for (const x of [-0.65, 0.65]) this.body.add(part(new THREE.BoxGeometry(0.45, 0.25, 0.08), this.lampMat, x, 0.95, 2.02));
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12).rotateZ(Math.PI / 2);
    for (const x of [-1.1, 1.1]) for (const z of [-1.3, 1.3]) this.root.add(part(wheelGeo, tyre, x, 0.45, z));

    this.cargo = new THREE.Group();
    this.cargo.position.y = 2.2;
    this.body.add(this.cargo);
    this.cargoKey = '';
    this.crateMat = new THREE.MeshStandardMaterial({ color: '#b98b55' });
    this.zeusMat = new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffb800', emissiveIntensity: 0.6 });

    this.headlight = new THREE.SpotLight('#fff2c8', 0, 34, 0.55, 0.5, 1.2);
    this.headlight.position.set(0, 1.0, 2.0);
    this.headlight.target.position.set(0, 0, 14);
    this.root.add(this.headlight, this.headlight.target);

    this.auraLight = new THREE.PointLight('#ffd84a', 0, 18, 1.4);
    this.auraLight.position.y = 3;
    this.aura = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.aura.position.y = 1.4;
    this.root.add(this.auraLight, this.aura);

    this.particles = [];
    this.particleGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.scene = scene;
    this.smokeTimer = 0;
    this.sparkTimer = 0;
    this.hitFlash = 0;
    this.landingDust = 0;
    this.time = 0;

    bus.on('hard_landing', () => {
      this.landingDust = 6;
    });
    bus.on('strike_hit', (h) => {
      if (!h.blocked) this.hitFlash = 1;
    });
  }

  rebuildCargo(cargo) {
    for (const crate of this.cargo.children) crate.geometry.dispose();
    this.cargo.clear();
    let slot = 0;
    for (const pkg of cargo) {
      if (pkg.type === 'zeus') {
        const z = (SLOT_Z[slot] + SLOT_Z[slot + 1]) / 2;
        this.cargo.add(part(new THREE.BoxGeometry(1.2, 0.95, 2.1), this.zeusMat, 0, 0.48, z));
      } else {
        this.cargo.add(part(new THREE.BoxGeometry(0.95, 0.7, 0.95), this.crateMat, 0, 0.35, SLOT_Z[slot]));
      }
      slot += pkg.slots;
    }
  }

  emit(color, x, y, z, vy, life, size) {
    const mesh = new THREE.Mesh(
      this.particleGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(size);
    this.scene.add(mesh);
    this.particles.push({ mesh, vy, life, maxLife: life, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
  }

  update(dt, game, night) {
    const { car, damage, packages, world } = game;
    this.time += dt;
    const fx = Math.sin(car.heading) * 1.8;
    const fz = Math.cos(car.heading) * 1.8;
    // Di udara hidung van menunduk; di tanah mengikuti kemiringan.
    const targetPitch = car.airborne
      ? Math.max(-0.5, car.vy * 0.03)
      : Math.atan2(world.heightAt(car.x + fx, car.z + fz) - world.heightAt(car.x - fx, car.z - fz), 3.6);
    this.pitch += (targetPitch - this.pitch) * (1 - Math.exp(-12 * dt));
    const y = car.y ?? world.heightAt(car.x, car.z);
    this.root.position.set(car.x, y, car.z);
    this.root.rotation.y = car.heading;
    this.root.rotation.x = -this.pitch;

    const key = packages.cargo.map((p) => p.id).join(',');
    if (key !== this.cargoKey) {
      this.cargoKey = key;
      this.rebuildCargo(packages.cargo);
    }

    // Damage: warna, kemiringan, lalu asap dan percikan yang terus bertambah.
    const state = damage.state;
    this.paint.color.set(BODY_COLORS[state]);
    this.body.rotation.z = state === 3 ? 0.07 : state === 2 ? 0.035 : 0;
    this.body.rotation.x = state === 3 ? -0.03 : 0;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    this.paint.emissiveIntensity = this.hitFlash * 1.5;

    if (state === 3) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.35 - damage.overflow * 0.27;
        const back = { x: car.x - fx, z: car.z - fz };
        this.emit('#5d5d5d', back.x, world.heightAt(back.x, back.z) + 1.8, back.z, 2.5, 1.4, 0.6 + damage.overflow * 0.8);
      }
      if (damage.overflow > 0.3) {
        this.sparkTimer -= dt;
        if (this.sparkTimer <= 0) {
          this.sparkTimer = 0.5 - damage.overflow * 0.35;
          this.emit('#ffb347', car.x, y + 0.6, car.z, 4, 0.4, 0.25);
        }
      }
    }
    // Debu saat mendarat keras.
    for (; this.landingDust > 0; this.landingDust--) {
      const a = Math.random() * Math.PI * 2;
      this.emit('#c9b79a', car.x + Math.cos(a) * 1.5, y + 0.3, car.z + Math.sin(a) * 1.5, 1.5, 0.8, 0.9);
    }
    for (const p of this.particles) {
      p.life -= dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.material.opacity = Math.max(0, p.life / p.maxLife) * 0.8;
    }
    for (const p of this.particles.filter((q) => q.life <= 0)) {
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // Lampu depan menyala saat senja; aura kuning selama membawa paket Zeus.
    this.headlight.intensity = night * 260;
    this.lampMat.emissiveIntensity = 0.2 + night * 2.5;
    const blessed = packages.blessed;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
    this.aura.visible = blessed;
    this.aura.material.opacity = 0.1 + pulse * 0.1;
    this.aura.scale.setScalar(1 + pulse * 0.08);
    this.auraLight.intensity = blessed ? 60 + night * 140 : 0;
  }
}
