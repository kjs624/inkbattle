// Authoritative game world for Ink Battle.
// Holds the grid, players, match state, and all the rules. The server owns
// the "real" state; clients only send inputs and render what they receive.

import {
  MAP_SIZE, GRID, CELL, MATCH_DURATION, RESULT_DURATION,
  BASE_SPEED, SHOOT_RANGE, BRUSH_RADIUS, STREAK_BLOBS, HIT_RADIUS,
  RESPAWN_DELAY, EMPTY, PURPLE, ORANGE,
  SCORE_PER_CELL, SCORE_PER_KILL, SCORE_PER_DEATH,
} from './constants.js';

const HALF = MAP_SIZE / 2;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function now() { return Date.now() / 1000; }

// Convert a world coordinate (-HALF..HALF) to a grid index (0..GRID-1).
function worldToCell(x, z) {
  const cx = Math.floor((x + HALF) / CELL);
  const cz = Math.floor((z + HALF) / CELL);
  return { cx: clamp(cx, 0, GRID - 1), cz: clamp(cz, 0, GRID - 1) };
}

export class Game {
  constructor() {
    this.grid = new Uint8Array(GRID * GRID); // EMPTY/PURPLE/ORANGE per cell
    this.players = new Map();                // id -> player object
    this.counts = { [PURPLE]: 0, [ORANGE]: 0 }; // painted cell counts
    this.dirtyCells = new Map();             // index -> team  (delta since last flush)
    this.phase = 'playing';                  // 'playing' | 'result'
    this.phaseEndsAt = now() + MATCH_DURATION;
    this.matchId = 1;
  }

  get timeLeft() {
    return Math.max(0, this.phaseEndsAt - now());
  }

  // ---- players -------------------------------------------------------------

  addPlayer(id, name) {
    // Balance teams: assign to whichever side currently has fewer players.
    let purple = 0, orange = 0;
    for (const p of this.players.values()) {
      if (p.team === PURPLE) purple++; else orange++;
    }
    const team = purple <= orange ? PURPLE : ORANGE;
    const spawn = this.spawnPoint(team);
    const player = {
      id,
      name: (name || 'Player').slice(0, 14),
      team,
      x: spawn.x, z: spawn.z,
      angle: team === PURPLE ? 0 : Math.PI,
      kills: 0, deaths: 0, cells: 0,
      dead: false, respawnAt: 0,
      lastShot: 0,
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  spawnPoint(team) {
    // Purple spawns on the -Z side, orange on the +Z side, with some jitter.
    const z = team === PURPLE ? -HALF + 6 : HALF - 6;
    const x = (Math.random() - 0.5) * (MAP_SIZE - 12);
    return { x, z };
  }

  // Client-authoritative-ish movement: trust the client's position but clamp
  // it to the map bounds. (Grid + score stay fully server-authoritative.)
  applyInput(id, x, z, angle) {
    const p = this.players.get(id);
    if (!p || p.dead) return;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(angle)) return;
    const lim = HALF - 0.6;
    p.x = clamp(x, -lim, lim);
    p.z = clamp(z, -lim, lim);
    p.angle = angle;
  }

  // ---- shooting & painting -------------------------------------------------

  shoot(id, dirX, dirZ) {
    const p = this.players.get(id);
    if (!p || p.dead) return;
    const t = now();
    p.lastShot = t;

    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len; dirZ /= len;

    // Paint a streak of blobs from just ahead of the player out to max range.
    for (let i = 1; i <= STREAK_BLOBS; i++) {
      const dist = (SHOOT_RANGE * i) / STREAK_BLOBS;
      const px = p.x + dirX * dist;
      const pz = p.z + dirZ * dist;
      const radius = BRUSH_RADIUS * (0.6 + 0.4 * (i / STREAK_BLOBS));
      this.paintBlob(px, pz, radius, p.team, p);
    }

    // Splat check at the end of the trajectory.
    const endX = p.x + dirX * SHOOT_RANGE;
    const endZ = p.z + dirZ * SHOOT_RANGE;
    for (const other of this.players.values()) {
      if (other.id === id || other.team === p.team || other.dead) continue;
      // Closest point check along the streak: test a few sample points.
      for (let i = 1; i <= STREAK_BLOBS; i++) {
        const dist = (SHOOT_RANGE * i) / STREAK_BLOBS;
        const sx = p.x + dirX * dist;
        const sz = p.z + dirZ * dist;
        if (Math.hypot(other.x - sx, other.z - sz) < HIT_RADIUS) {
          this.splat(other, p);
          break;
        }
      }
    }
    return { endX, endZ };
  }

  paintBlob(wx, wz, radiusCells, team, owner) {
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
        if (prev === team) continue;
        if (prev !== EMPTY) this.counts[prev]--;
        this.counts[team]++;
        this.grid[idx] = team;
        this.dirtyCells.set(idx, team);
        if (owner) owner.cells++;
      }
    }
  }

  splat(victim, killer) {
    victim.dead = true;
    victim.respawnAt = now() + RESPAWN_DELAY;
    victim.deaths++;
    if (killer) killer.kills++;
  }

  // ---- match loop ----------------------------------------------------------

  update() {
    const t = now();

    // Respawn dead players whose timer elapsed.
    for (const p of this.players.values()) {
      if (p.dead && t >= p.respawnAt) {
        const s = this.spawnPoint(p.team);
        p.x = s.x; p.z = s.z; p.dead = false;
      }
    }

    if (this.phase === 'playing' && this.timeLeft <= 0) {
      this.phase = 'result';
      this.phaseEndsAt = t + RESULT_DURATION;
    } else if (this.phase === 'result' && this.timeLeft <= 0) {
      this.resetMatch();
    }
  }

  resetMatch() {
    this.grid.fill(EMPTY);
    this.counts = { [PURPLE]: 0, [ORANGE]: 0 };
    this.dirtyCells.clear();
    this.phase = 'playing';
    this.phaseEndsAt = now() + MATCH_DURATION;
    this.matchId++;
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.cells = 0; p.dead = false;
      const s = this.spawnPoint(p.team);
      p.x = s.x; p.z = s.z;
    }
  }

  // ---- serialization -------------------------------------------------------

  scoreOf(p) {
    return p.cells * SCORE_PER_CELL + p.kills * SCORE_PER_KILL - p.deaths * SCORE_PER_DEATH;
  }

  territory() {
    const total = GRID * GRID;
    return {
      purple: this.counts[PURPLE],
      orange: this.counts[ORANGE],
      total,
      purplePct: (this.counts[PURPLE] / total) * 100,
      orangePct: (this.counts[ORANGE] / total) * 100,
    };
  }

  leaderboard() {
    return [...this.players.values()]
      .map((p) => ({
        id: p.id, name: p.name, team: p.team,
        cells: p.cells, kills: p.kills, deaths: p.deaths,
        score: this.scoreOf(p),
      }))
      .sort((a, b) => b.score - a.score);
  }

  playerStates() {
    const arr = [];
    for (const p of this.players.values()) {
      arr.push({
        id: p.id, n: p.name, t: p.team,
        x: +p.x.toFixed(2), z: +p.z.toFixed(2), a: +p.angle.toFixed(3),
        d: p.dead ? 1 : 0, k: p.kills, de: p.deaths, c: p.cells,
      });
    }
    return arr;
  }

  // The full grid as a transferable array (sent once on join).
  gridSnapshot() {
    return Array.from(this.grid);
  }

  // Drain accumulated cell changes since last call.
  flushDirty() {
    if (this.dirtyCells.size === 0) return null;
    const cells = [];
    for (const [idx, team] of this.dirtyCells) cells.push(idx, team);
    this.dirtyCells.clear();
    return cells; // flat [idx, team, idx, team, ...]
  }

  matchSnapshot() {
    return {
      matchId: this.matchId,
      phase: this.phase,
      timeLeft: Math.ceil(this.timeLeft),
      territory: this.territory(),
      leaderboard: this.leaderboard(),
    };
  }
}
