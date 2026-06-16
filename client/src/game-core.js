// Authoritative game world — runs inside whichever client is the current host.
// v2: free-for-all. Every player owns a unique grid "slot" (their ink color).
// Infinite match, HP with regen on own ink, and death wipes that player's ink.

import {
  MAP_SIZE, GRID, CELL, HIT_RADIUS, RESPAWN_DELAY, EMPTY, MAX_HP,
  HEAL_RATE, REGEN_DELAY, SCORE_PER_CELL, SCORE_PER_KILL, SCORE_PER_DEATH,
} from './gameconst.js';
import { getWeapon } from './weapons.js';
import { terrainHeight } from './terrain.js';

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
      dead: false, respawnAt: 0, lastShot: 0, squid: false, weapon: 'rifle',
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

  applyInput(id, x, z, angle, squid, weapon) {
    const p = this.players.get(id);
    if (!p || p.dead) return;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(angle)) return;
    const lim = HALF - 0.6;
    p.x = clamp(x, -lim, lim);
    p.z = clamp(z, -lim, lim);
    p.angle = angle;
    p.squid = !!squid;
    if (weapon) p.weapon = weapon;
  }

  // ---- shooting & painting -------------------------------------------------

  // ray = { w, ox, oy, oz, dx, dy, dz }  (muzzle origin + 3D aim direction)
  shoot(id, ray) {
    const p = this.players.get(id);
    if (!p || p.dead || p.squid || !ray) return;
    const w = getWeapon(ray.w);
    const t0 = now();
    if (t0 - p.lastShot < w.cooldown) return;
    p.lastShot = t0;
    p.weapon = w.key;

    const len = Math.hypot(ray.dx, ray.dy, ray.dz) || 1;
    const ax = ray.dx / len, ay = ray.dy / len, az = ray.dz / len;
    const impacts = [];

    for (let pellet = 0; pellet < w.pellets; pellet++) {
      let dx = ax, dy = ay, dz = az;
      if (w.spread > 0) {
        dx += (Math.random() - 0.5) * w.spread * 2;
        dy += (Math.random() - 0.5) * w.spread * 2;
        dz += (Math.random() - 0.5) * w.spread * 2;
        const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      }
      const hit = this.raymarch(ray.ox, ray.oy, ray.oz, dx, dy, dz, w.range);
      this.paintBlob(hit.x, hit.z, w.brush, p.slot, p);
      impacts.push({ x: +hit.x.toFixed(2), z: +hit.z.toFixed(2) });
      this.hitscan(id, p, ray.ox, ray.oy, ray.oz, dx, dy, dz, hit.t, w.dmg);
    }
    return { impacts, w: w.key, ox: ray.ox, oy: ray.oy, oz: ray.oz, dx: ax, dy: ay, dz: az };
  }

  // March along a ray until it goes under the terrain; returns ground impact.
  raymarch(ox, oy, oz, dx, dy, dz, range) {
    const step = 0.5;
    for (let t = step; t <= range; t += step) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (y <= terrainHeight(x, z)) return { x, z, t };
    }
    return { x: ox + dx * range, z: oz + dz * range, t: range };
  }

  hitscan(id, shooter, ox, oy, oz, dx, dy, dz, maxT, dmg) {
    for (const e of this.players.values()) {
      if (e.id === id || e.dead) continue;
      const ex = e.x, ez = e.z, ey = terrainHeight(ex, ez) + 1.0;
      let t = (ex - ox) * dx + (ey - oy) * dy + (ez - oz) * dz;
      if (t < 0) t = 0; else if (t > maxT) t = maxT;
      const cx = ox + dx * t, cy = oy + dy * t, cz = oz + dz * t;
      if (Math.hypot(ex - cx, ey - cy, ez - cz) < HIT_RADIUS) this.damage(e, shooter, dmg);
    }
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

  damage(victim, attacker, dmg) {
    victim.hp -= dmg;
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
        d: p.dead ? 1 : 0, h: Math.round(p.hp), sq: p.squid ? 1 : 0, w: p.weapon,
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
