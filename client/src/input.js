import { WEAPON_ORDER } from './weapons.js';

// Keyboard + mouse input. Mouse-look uses pointer lock; WASD drives movement;
// left mouse fires. Exposes a simple state object the game loop reads each frame.
export class Input {
  constructor(domElement) {
    this.el = domElement;
    this.keys = {};
    this.yaw = 0;
    this.pitch = 0;   // first-person vertical look
    this.firing = false;
    this.jumpQueued = false;
    this.squid = false; // held while Shift is down
    this.weapon = WEAPON_ORDER[0];
    this.sensitivity = 0.0024;
    this.locked = false;

    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.squid = true;
      const m = e.code.match(/^Digit([1-4])$/);
      if (m) { const w = WEAPON_ORDER[+m[1] - 1]; if (w) this.weapon = w; }
    });
    addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.squid = false;
    });

    domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (!this.locked) { domElement.requestPointerLock(); return; }
        this.firing = true;
      }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.firing = false; });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === domElement;
      if (!this.locked) this.firing = false;
    });

    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      const lim = 1.45;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });

    // Blur safety: clear movement if focus is lost.
    addEventListener('blur', () => { this.keys = {}; this.firing = false; this.squid = false; });
  }

  // Movement axes relative to facing. Returns {fwd, strafe} in -1..1.
  axes() {
    const k = this.keys;
    const fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
    const strafe = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
    return { fwd, strafe };
  }

  consumeJump() {
    if (this.jumpQueued) { this.jumpQueued = false; return true; }
    return false;
  }
}
