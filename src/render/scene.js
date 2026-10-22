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
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 500);

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
    this.fx = new EventFx({ game, particles: this.particles, popups: this.popups, juice: this.juice, carView: this.carView });

    this.target = new THREE.Vector3(game.car.x, 0, game.car.z);
    this.flash = 0;
    game.bus.on('strike', (s) => {
      const d = Math.hypot(s.x - game.car.x, s.z - game.car.z);
      this.flash = Math.max(this.flash, s.hit ? 1 : d < 30 ? 0.45 : 0.15);
    });
    game.bus.on('day_start', () => this.snapCamera());
    game.bus.on('smuggle_resolved', (e) => {
      if (e.scam) this.flash = 1;
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const aspect = w / h;
    this.camera.left = (-VIEW_HEIGHT * aspect) / 2;
    this.camera.right = (VIEW_HEIGHT * aspect) / 2;
    this.camera.top = VIEW_HEIGHT / 2;
    this.camera.bottom = -VIEW_HEIGHT / 2;
    this.camera.updateProjectionMatrix();
  }

  snapCamera() {
    const { car, world } = this.game;
    this.target.set(car.x, car.y ?? world.heightAt(car.x, car.z), car.z);
  }

  update(dt) {
    const { car, clock, world } = this.game;

    // Kamera mengikuti van dengan sedikit look-ahead ke arah gerak.
    const desired = new THREE.Vector3(car.x + car.vx * 0.4, car.y ?? world.heightAt(car.x, car.z), car.z + car.vz * 0.4);
    this.target.lerp(desired, 1 - Math.exp(-4 * dt));
    // Dionysus: kamera ikut oleng pelan.
    const sway = this.game.effects?.steerDelay && !this.calm ? this.game.cfg.curse.effects.dionysus.cameraSway : 0;
    this.swayTime = (this.swayTime ?? 0) + dt;
    this.target.x += Math.sin(this.swayTime * 1.3) * sway * dt * 2;
    this.target.z += Math.cos(this.swayTime * 0.9) * sway * dt * 2;
    // Juice: guncangan kamera dan zoom kick (tidak memengaruhi target supaya tidak bergeser).
    this.juice.update(dt);
    const shake = this.juice.offset;
    this.camera.position.copy(this.target).add(ISO_OFFSET);
    this.camera.position.x += shake.x;
    this.camera.position.z += shake.z;
    this.camera.lookAt(this.target.x + shake.x, this.target.y, this.target.z + shake.z);
    const zoom = 1 + this.juice.zoom;
    if (this.camera.zoom !== zoom) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    this.sun.position.copy(this.target).add(SUN_OFFSET);
    this.sun.target.position.copy(this.target);

    const night = nightFactor(clock.hour);
    const { a, b, t } = lightingAt(clock.hour);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.scene.background.copy(tmpA.set(a.sky).lerp(tmpB.set(b.sky), t)).lerp(tmpB.set('#e8ecff'), this.flash * 0.6);
    this.sun.intensity = THREE.MathUtils.lerp(a.sun, b.sun, t);
    this.sun.color.copy(tmpA.set(a.sunColor).lerp(tmpB.set(b.sunColor), t));
    this.hemi.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, t) + this.flash * 1.5;

    this.worldView.update(dt, night, car, ISO_OFFSET);
    this.carView.update(dt, this.game, night);
    this.markersView.update(dt, this.game);
    this.hazardView.update(dt, this.game);
    this.minotaurView.update(dt, this.game);
    this.trafficView.update(dt, night);
    this.crowdView.update(dt);
    this.birds.update(dt);
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
