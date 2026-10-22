// Keyboard: WASD/panah untuk menyetir, Space handbrake/drift, E untuk ambil/antar/akhiri hari.
const BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};
const BLOCK_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor(target = window) {
    this.held = new Set();
    this.pressed = new Set();
    target.addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  isHeld(action) {
    return BINDINGS[action].some((code) => this.held.has(code));
  }

  // Tekanan tombol di-latch sampai dipakai satu step simulasi.
  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  clearPresses() {
    this.pressed.clear();
  }

  controls() {
    return {
      throttle: (this.isHeld('up') ? 1 : 0) - (this.isHeld('down') ? 1 : 0),
      steer: (this.isHeld('left') ? 1 : 0) - (this.isHeld('right') ? 1 : 0),
      handbrake: this.held.has('Space'),
      interact: this.consume('KeyE'),
    };
  }
}
