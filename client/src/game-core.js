// Authoritative game world — runs inside whichever client is the current host.
// v2: free-for-all. Every player owns a unique grid "slot" (their ink color).
// Infinite match, HP with regen on own ink, and death wipes that player's ink.

import {
  MAP_SIZE, GRID, CELL, BASE_SPEED, SHOOT_RANGE, BRUSH_RADIUS, STREAK_BLOBS,
  HIT_RADIUS, RESPAWN_DELAY, EMPTY, MAX_HP, HIT_DAMAGE, HEAL_RATE, REGEN_DELAY,
  SCORE_PER_CELL, SCORE_PER_KILL, SCORE_PER_DEATH,
} from './gameconst.js';

const HALF = MAP_SIZE / 2;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function now() { return Date.now() / 1000; }

function worldToCell(x, z) {
  const cx = Math.floor((x + HALF) / CELL);
  const cz = Math.floor((z + HALF) / CELL);
  return { cx: clamp(cx, 0, GRID - 1), cz: clamp(cz, 0, GRID - 1) };
}

export class Game {
  constructor() {
    this.grid = new Uint8Array(GRID * GRID); // 0 = empty, else owner slot
    this.players = new Map();
    this.counts = new Map();        // slot -> painted cell count
    this.usedSlots = new Set();
    this.dirtyCells = new Map();    // idx -> slot
    this.phase = 'playing';         // always 'playing' (infinite)
    this.lastUpdate = now();
  }

  get timeLeft() { return 0; } // infinite

  importGrid(arr) {
    if (!arr || arr.length !== this.grid.length) return;
    this.counts = new Map();
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      this.grid[i] = v;
      if (v !== EMPTY) this.counts.set(v, (this.counts.get(v) || 0) + 1);
    }
  }

  setPhase() { this.phase = 'playing'; }

  // ---- players -------------------------------------------------------------

  nextSlot() {
    for (let s = 1; s <= 255; s++) if (!this.usedSlots.has(s)) return s;
    return 1; // overflow fallback
  }

  addPlayer(id, name) {
    const slot = this.nextSlot();
    this.usedSlots.add(slot);
    const spawn = this.spawnPoint();
    const player = {
      id,
      name: (name || 'Player').slice(0, 14),
      slot,
      x: spawn.x, z: spawn.z, angle: 0,
      hp: MAX_HP, lastHit: 0,
      kills: 0, deaths: 0, cells: 0,
      dead: false, respawnAt: 0, lastShot: 0, squid: false,
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.clearInk(p.slot);       // free their territory
    this.usedSlots.delete(p.slot);
    this.players.delete(id);
  }

  spawnPoint() {
    // FFA: spawn anywhere with a little margin from the walls.
    const m = MAP_SIZE / 2 - 5;
    return { x: (Math.random() * 2 - 1) * m, z: (Math.random() * 2 - 1) * m };
  }

  applyInput(id, x, z, angle, squid) {
    const p = this.players.get(id);
    if (!p || p.dead) return;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(angle)) return;
    const lim = HALF - 0.6;
    p.x = clamp(x, -lim, lim);
    p.z = clamp(z, -lim, lim);
    p.angle = angle;
    p.squid = !!squid;
  }

  // ---- shooting & painting -------------------------------------------------

  shoot(id, dirX, dirZ) {
    const p = this.players.get(id);
    if (!p || p.dead || p.squid) return; // no shooting in squid form
    p.lastShot = now();

    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len; dirZ /= len;

    // Ink right in front of the shooter too, so wall faces (not just the top)
    // get covered — needed for squid wall-climbing.
    this.paintBlob(p.x + dirX * 1.5, p.z + dirZ * 1.5, BRUSH_RADIUS, p.slot, p);

    for (let i = 1; i <= STREAK_BLOBS; i++) {
      const dist = (SHOOT_RANGE * i) / STREAK_BLOBS;
      const px = p.x + dirX * dist;
      const pz = p.z + dirZ * dist;
      const radius = BRUSH_RADIUS * (0.6 + 0.4 * (i / STREAK_BLOBS));
      this.paintBlob(px, pz, radius, p.slot, p);
    }

    const endX = p.x + dirX * SHOOT_RANGE;
    const endZ = p.z + dirZ * SHOOT_RANGE;
    for (const other of this.players.values()) {
      if (other.id === id || other.dead) continue;
      for (let i = 1; i <= STREAK_BLOBS; i++) {
        const dist = (SHOOT_RANGE * i) / STREAK_BLOBS;
        const sx = p.x + dirX * dist;
        const sz = p.z + dirZ * dist;
        if (Math.hypot(other.x - sx, other.z - sz) < HIT_RADIUS) {
          this.damage(other, p);
          break;
        }
      }
    }
    return { endX, endZ };
  }

  paintBlob(wx, wz, radiusCells, slot, owner) {
    const { cx, cz } = worldToCell(wx, wz);
    const r = Math.ceil(radiusCells);
    const r2 = radiusCells * radiusCells;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r2) continue;
        const gx = cx + dx, gz = cz + dz;
        if (gx < 0 || gx >= GRID || gz < 0 || gz >= GRID) continue;
        const idx = gz * GRID + gx;
        const prev = this.grid[idx];
        if (prev === slot) continue;
        if (prev !== EMPTY) this.dec(prev);
        this.inc(slot);
        this.grid[idx] = slot;
        this.dirtyCells.set(idx, slot);
        if (owner) owner.cells++;
      }
    }
  }

  inc(slot) { this.counts.set(slot, (this.counts.get(slot) || 0) + 1); }
  dec(slot) {
    const c = (this.counts.get(slot) || 0) - 1;
    if (c <= 0) this.counts.delete(slot); else this.counts.set(slot, c);
  }

  // Wipe every cell owned by a slot (on death / leave).
  clearInk(slot) {
    if (!this.counts.get(slot)) return;
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] === slot) {
        this.grid[i] = EMPTY;
        this.dirtyCells.set(i, EMPTY);
      }
    }
    this.counts.delete(slot);
    const p = [...this.players.values()].find((pl) => pl.slot === slot);
    if (p) p.cells = 0;
  }

  damage(victim, attacker) {
    victim.hp -= HIT_DAMAGE;
    victim.lastHit = now();
    if (victim.hp <= 0) this.die(victim, attacker);
  }

  die(victim, killer) {
    victim.dead = true;
    victim.hp = 0;
    victim.respawnAt = now() + RESPAWN_DELAY;
    victim.deaths++;
    if (killer && killer !== victim) killer.kills++;
    this.clearInk(victim.slot); // death deletes your territory
  }

  // ---- match loop ----------------------------------------------------------

  update() {
    const t = now();
    const dt = Math.min(0.25, t - this.lastUpdate);
    this.lastUpdate = t;

    for (const p of this.players.values()) {
      if (p.dead) {
        if (t >= p.respawnAt) {
          const s = this.spawnPoint();
          p.x = s.x; p.z = s.z; p.dead = false; p.hp = MAX_HP;
        }
        continue;
      }
      // Heal when standing on your own ink (after a short delay since last hit).
      if (p.hp < MAX_HP && t - p.lastHit >= REGEN_DELAY && this.slotAt(p.x, p.z) === p.slot) {
        p.hp = Math.min(MAX_HP, p.hp + HEAL_RATE * dt);
      }
    }
  }

  slotAt(x, z) {
    const { cx, cz } = worldToCell(x, z);
    return this.grid[cz * GRID + cx];
  }

  // ---- serialization -------------------------------------------------------

  scoreOf(p) {
    return p.cells * SCORE_PER_CELL + p.kills * SCORE_PER_KILL - p.deaths * SCORE_PER_DEATH;
  }

  territory() {
    return { total: GRID * GRID };
  }

  leaderboard() {
    return [...this.players.values()]
      .map((p) => ({
        id: p.id, name: p.name, slot: p.slot,
        cells: p.cells, kills: p.kills, deaths: p.deaths,
        score: this.scoreOf(p),
      }))
      .sort((a, b) => b.cells - a.cells || b.score - a.score);
  }

  playerStates() {
    const arr = [];
    for (const p of this.players.values()) {
      arr.push({
        id: p.id, n: p.name, sl: p.slot,
        x: +p.x.toFixed(2), z: +p.z.toFixed(2), a: +p.angle.toFixed(3),
        d: p.dead ? 1 : 0, h: Math.round(p.hp), sq: p.squid ? 1 : 0,
        k: p.kills, de: p.deaths, c: p.cells,
      });
    }
    return arr;
  }

  gridSnapshot() { return Array.from(this.grid); }

  flushDirty() {
    if (this.dirtyCells.size === 0) return null;
    const cells = [];
    for (const [idx, slot] of this.dirtyCells) cells.push(idx, slot);
    this.dirtyCells.clear();
    return cells;
  }

  matchSnapshot() {
    return {
      phase: 'playing',
      timeLeft: 0,
      total: GRID * GRID,
      playerCount: this.players.size,
      leaderboard: this.leaderboard(),
    };
  }
}
