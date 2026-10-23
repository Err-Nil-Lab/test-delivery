// Renderer, kamera isometric terkunci yang mengikuti van, dan cahaya siang → senja → malam.
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { WorldView } from './worldView.js';
import { CarView } from './carView.js';
import { MarkersView } from './markersView.js';
import { HazardView } from './hazardView.js';
import { MinotaurView } from './minotaurView.js';
import { ParticlePool } from './particles.js';
import { Popups } from './popups.js';
import { Juice } from './juice.js';
import { EventFx } from './fx.js';
import { TrafficView } from './trafficView.js';
import { CrowdView } from './crowdView.js';
import { Birds } from './birds.js';
import { RouteView } from './routeView.js';
import { TowView } from './towView.js';
import { chasePose, targetYaw, smoothYaw } from './chaseCam.js';
import { shotAt, shotAnchor, showcasePose } from './showcaseCam.js';

const ISO_OFFSET = new THREE.Vector3(1, 1.1, 1).normalize().multiplyScalar(140);
const SUN_OFFSET = new THREE.Vector3(-30, 60, 20);
const VIEW_HEIGHT = 72; // unit dunia yang terlihat secara vertikal

// Keyframe cahaya per jam in-game.
const LIGHT_KEYS = [
  { h: 6, sky: '#f3c9a5', sun: 1.4, sunColor: '#ffd2a6', hemi: 1.0 },
  { h: 8, sky: '#a9d4ef', sun: 2.6, sunColor: '#ffffff', hemi: 1.4 },
  { h: 16, sky: '#a9d4ef', sun: 2.6, sunColor: '#ffffff', hemi: 1.4 },
  { h: 18, sky: '#f0a067', sun: 1.5, sunColor: '#ffab6b', hemi: 1.0 },
  { h: 19.5, sky: '#4c3a66', sun: 0.4, sunColor: '#ff8a5c', hemi: 0.5 },
  { h: 20, sky: '#1a1d38', sun: 0.15, sunColor: '#8fa0ff', hemi: 0.3 },
  { h: 24, sky: '#0c0f22', sun: 0.1, sunColor: '#8fa0ff', hemi: 0.25 },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function lightingAt(hour) {
  const keys = LIGHT_KEYS;
  if (hour <= keys[0].h) return { ...keys[0], t: 0, a: keys[0], b: keys[0] };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (hour <= b.h) return { a, b, t: (hour - a.h) / (b.h - a.h) };
  }
  const last = keys[keys.length - 1];
  return { a: last, b: last, t: 0 };
}

// 0 = siang penuh, 1 = malam penuh.
export function nightFactor(hour) {
  return THREE.MathUtils.clamp((hour - 17.5) / 2.5, 0, 1);
}

export class View {
  constructor(container, game, { calm = false } = {}) {
    this.game = game;
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(LIGHT_KEYS[1].sky);
    // Dua kamera: isometric (ortografis) dan third person (perspektif di belakang van). this.camera = yang aktif.
    this.isoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 500);
    this.chaseCamera = new THREE.PerspectiveCamera(62, 1, 0.5, 600);
    this.camera = this.isoCamera;
    this.perspective = 'iso'; // 'iso' | 'chase' (pilihan pemain)
    this.chaseYaw = game.car.heading;
    this.camOffset = new THREE.Vector3(ISO_OFFSET.x, ISO_OFFSET.y, ISO_OFFSET.z);
    this.chaseFog = new THREE.Fog('#a9d4ef', 110, 360);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#6b6457', 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    this.calm = calm;
    this.juice = new Juice(game.cfg.juice, { calm });
    this.particles = new ParticlePool(this.scene, game.cfg.juice.maxParticles);
    this.popups = new Popups(this.scene);
    this.worldView = new WorldView(this.scene, game.world);
    this.carView = new CarView(this.scene, game.bus, this.particles);
    this.markersView = new MarkersView(this.scene, game);
    this.hazardView = new HazardView(this.scene, game.bus, game.world.heightAt);
    this.minotaurView = new MinotaurView(this.scene, game, this.particles);
    this.trafficView = new TrafficView(this.scene, game);
    this.crowdView = new CrowdView(this.scene, game);
    this.birds = new Birds(this.scene, game, game.cfg.npc.birds);
    this.routeView = new RouteView(this.scene, game);
    this.towView = new TowView(this.scene, game);
    this.midnightTint = 0; // 0..1: langit memerah & gelap selama urutan tengah malam
    this.fx = new EventFx({ game, particles: this.particles, popups: this.popups, juice: this.juice, carView: this.carView });

    this.target = new THREE.Vector3(game.car.x, 0, game.car.z);
    // Kamera sinematik (cutscene / pan tutorial): { x, z, zoom } menggantikan kamera-ikut-van.
    this.cinematic = null;
    // Kamera menu / mode pamer: shot sinematik berganti otomatis mengikuti van yang menyetir sendiri.
    this.showcase = false;
    this.showcaseTime = 0;
    this.showcaseShot = -1;
    this.showcaseAnchor = null;
    this.showcasePos = null;
    this.showcaseLook = null;
    this.camZoom = 1;
    this.flash = 0;
    game.bus.on('strike', (s) => {
      const d = Math.hypot(s.x - game.car.x, s.z - game.car.z);
      this.flash = Math.max(this.flash, s.hit ? 1 : d < 30 ? 0.45 : 0.15);
    });
    game.bus.on('day_start', () => {
      this.snapCamera();
      this.midnightTint = 0;
    });
    // Sambaran raksasa: layar putih penuh sesaat (lebih lama dari petir biasa).
    game.bus.on('midnight_strike', () => {
      this.flash = 2.2;
    });
    game.bus.on('smuggle_resolved', (e) => {
      if (e.scam) this.flash = 1;
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setCalm(calm) {
    this.calm = calm;
    this.juice.calm = calm;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const aspect = w / h;
    const iso = this.isoCamera;
    iso.left = (-VIEW_HEIGHT * aspect) / 2;
    iso.right = (VIEW_HEIGHT * aspect) / 2;
    iso.top = VIEW_HEIGHT / 2;
    iso.bottom = -VIEW_HEIGHT / 2;
    iso.updateProjectionMatrix();
    this.chaseCamera.aspect = aspect;
    this.chaseCamera.updateProjectionMatrix();
  }

  // 'iso' | 'chase'. Cutscene & pan tutorial selalu memakai isometric sementara.
  setPerspective(mode) {
    if (mode === this.perspective) return;
    this.perspective = mode;
    this.chaseYaw = this.game.car.heading;
  }

  get chase() {
    return (this.perspective === 'chase' || this.showcase) && !this.cinematic;
  }

  setShowcase(on) {
    if (this.showcase === on) return;
    this.showcase = on;
    this.showcaseTime = 0;
    this.showcaseShot = -1;
    this.showcasePos = null;
    this.chaseYaw = this.game.car.heading;
  }

  snapTo(p) {
    this.target.set(p.x, this.game.world.heightAt(p.x, p.z), p.z);
  }

  snapCamera() {
    const { car, world } = this.game;
    this.target.set(car.x, car.y ?? world.heightAt(car.x, car.z), car.z);
  }

  update(dt) {
    const { car, clock, world } = this.game;

    // Kamera mengikuti van dengan sedikit look-ahead ke arah gerak (atau target sinematik saat cutscene).
    const cin = this.cinematic;
    const desired = cin
      ? new THREE.Vector3(cin.x, world.heightAt(cin.x, cin.z), cin.z)
      : new THREE.Vector3(car.x + car.vx * 0.4, car.y ?? world.heightAt(car.x, car.z), car.z + car.vz * 0.4);
    this.target.lerp(desired, 1 - Math.exp(-(cin ? cin.speed ?? 1.8 : 4) * dt));
    // Dionysus: kamera ikut oleng pelan.
    const sway = this.game.effects?.steerDelay && !this.calm ? this.game.cfg.curse.effects.dionysus.cameraSway : 0;
    this.swayTime = (this.swayTime ?? 0) + dt;
    this.target.x += Math.sin(this.swayTime * 1.3) * sway * dt * 2;
    this.target.z += Math.cos(this.swayTime * 0.9) * sway * dt * 2;
    // Juice: guncangan kamera dan zoom kick (tidak memengaruhi target supaya tidak bergeser).
    this.juice.update(dt);
    const shake = this.juice.offset;
    const chase = this.chase;
    this.camera = chase ? this.chaseCamera : this.isoCamera;
    if (chase && this.showcase) {
      // Menu / mode pamer: shot sinematik, pose dihaluskan supaya perpindahan antar shot mulus.
      this.showcaseTime += dt;
      const s = shotAt(this.showcaseTime);
      const pos = { x: car.x, y: car.y ?? world.heightAt(car.x, car.z), z: car.z };
      if (s.index !== this.showcaseShot) {
        this.showcaseShot = s.index;
        this.showcaseAnchor = shotAnchor(s.shot, pos, car.heading);
      }
      const pose = showcasePose(s, { ...car, x: car.x, z: car.z, y: pos.y, heading: car.heading }, this.showcaseAnchor, world.heightAt, car.speed / this.game.cfg.car.maxSpeed);
      const k = 1 - Math.exp(-(this.showcasePos ? 3.2 : 100) * dt);
      this.showcasePos ??= { ...pose.position };
      this.showcaseLook ??= { ...pose.look };
      for (const key of ['x', 'y', 'z']) {
        this.showcasePos[key] += (pose.position[key] - this.showcasePos[key]) * k;
        this.showcaseLook[key] += (pose.look[key] - this.showcaseLook[key]) * k;
      }
      this.target.set(pos.x, pos.y, pos.z);
      this.camera.position.set(this.showcasePos.x, this.showcasePos.y, this.showcasePos.z);
      this.camera.lookAt(this.showcaseLook.x, this.showcaseLook.y, this.showcaseLook.z);
      if (Math.abs(this.camera.fov - pose.fov) > 0.01) {
        this.camera.fov += (pose.fov - this.camera.fov) * k;
        this.camera.updateProjectionMatrix();
      }
    } else if (chase) {
      // Third person: kamera menempel di belakang van, arahnya menyusul arah van dengan halus.
      const pos = { x: car.x, y: car.y ?? world.heightAt(car.x, car.z), z: car.z };
      this.chaseYaw = smoothYaw(this.chaseYaw, targetYaw(car), dt);
      const pose = chasePose(pos, this.chaseYaw, car.speed / this.game.cfg.car.maxSpeed);
      this.target.set(pos.x, pos.y, pos.z); // sinkron supaya cahaya/bayangan & occlusion mengikuti van
      this.camera.position.set(pose.position.x + shake.x, pose.position.y, pose.position.z + shake.z);
      this.camera.lookAt(pose.look.x + shake.x, pose.look.y, pose.look.z + shake.z);
      const fov = pose.fov / (1 + this.juice.zoom);
      if (Math.abs(this.camera.fov - fov) > 0.01) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
    } else {
      this.camera.position.copy(this.target).add(ISO_OFFSET);
      this.camera.position.x += shake.x;
      this.camera.position.z += shake.z;
      this.camera.lookAt(this.target.x + shake.x, this.target.y, this.target.z + shake.z);
      this.camZoom += ((cin ? cin.zoom ?? 1 : 1) - this.camZoom) * (1 - Math.exp(-2 * dt));
      const zoom = this.camZoom + (cin ? 0 : this.juice.zoom);
      if (this.camera.zoom !== zoom) {
        this.camera.zoom = zoom;
        this.camera.updateProjectionMatrix();
      }
    }
    this.camOffset.copy(this.camera.position).sub(this.target);
    this.sun.position.copy(this.target).add(SUN_OFFSET);
    this.sun.target.position.copy(this.target);

    const night = nightFactor(clock.hour);
    const { a, b, t } = lightingAt(clock.hour);
    this.flash = Math.max(0, this.flash - dt * 4);
    // Tengah malam: langit menggelap dan memerah mengikuti peringatan, lalu tetap gelap setelah sambaran.
    const mTarget = this.game.midnight.active ? Math.max(0.25, this.game.midnight.warnProgress) : 0;
    this.midnightTint += (mTarget - this.midnightTint) * (1 - Math.exp(-3 * dt));
    this.scene.background
      .copy(tmpA.set(a.sky).lerp(tmpB.set(b.sky), t))
      .lerp(tmpB.set('#3a0d12'), this.midnightTint * 0.85)
      .lerp(tmpB.set('#e8ecff'), Math.min(1, this.flash * 0.6));
    // Third person: kabut warna langit menyembunyikan tepi map di cakrawala.
    if (chase) {
      this.chaseFog.color.copy(this.scene.background);
      this.scene.fog = this.chaseFog;
    } else this.scene.fog = null;
    this.sun.intensity = THREE.MathUtils.lerp(a.sun, b.sun, t) * (1 - this.midnightTint * 0.7);
    this.sun.color.copy(tmpA.set(a.sunColor).lerp(tmpB.set(b.sunColor), t));
    this.hemi.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, t) * (1 - this.midnightTint * 0.4) + this.flash * 1.5;

    this.worldView.update(dt, night, car, this.camOffset);
    this.carView.update(dt, this.game, night);
    this.markersView.update(dt, this.game);
    this.hazardView.update(dt, this.game);
    this.minotaurView.update(dt, this.game);
    this.trafficView.update(dt, night);
    this.crowdView.update(dt);
    this.birds.update(dt);
    this.routeView.update(dt);
    this.towView.update(dt);
    this.fx.update(dt);
    this.particles.update(dt);
    this.popups.update(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  // Posisi dunia → piksel layar (untuk panah penunjuk arah di HUD).
  project(x, z, y = 1) {
    const v = new THREE.Vector3(x, this.game.world.heightAt(x, z) + y, z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * window.innerWidth,
      y: ((1 - v.y) / 2) * window.innerHeight,
    };
  }
}
