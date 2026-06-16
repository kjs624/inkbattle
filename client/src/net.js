import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, ROOM, HAS_SUPABASE } from './config.js';
import { Game } from './game-core.js';
import {
  GRID, MAP_SIZE, MATCH_DURATION, BASE_SPEED, SPEED_OWN_INK, SPEED_ENEMY_INK,
  SHOOT_RANGE, SHOOT_COOLDOWN, RESPAWN_DELAY, PLAYER_RADIUS, TICK_RATE,
  BROADCAST_RATE, TEAMS,
} from './gameconst.js';

// Constants a freshly-joined client needs to build the world identically.
const WORLD_CONFIG = {
  GRID, MAP_SIZE, MATCH_DURATION, BASE_SPEED, SPEED_OWN_INK, SPEED_ENEMY_INK,
  SHOOT_RANGE, SHOOT_COOLDOWN, RESPAWN_DELAY, PLAYER_RADIUS, TEAMS,
};

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'c' + Math.random().toString(36).slice(2) + Date.now());

// Serverless multiplayer over Supabase Realtime, "host-authoritative":
// the earliest player in the room runs the authoritative Game (game-core.js)
// and broadcasts state; everyone else relays input and renders. If the host
// leaves, the next-earliest player takes over (ink persists, scores reset).
export class Net {
  constructor() {
    this.clientId = uid();
    this.joinedAt = 0;
    this.name = null;
    this.handlers = {};
    this.subscribed = false;
    this.inRoom = false;

    this.isHost = false;
    this.game = null;
    this.myInput = null;
    this.myTeam = null;
    this.remoteInputs = new Map();
    this.hostTimers = [];
    this.lastPhase = null;

    // Shadow state kept while a client, so a new host can seed from it.
    this.shadowGrid = new Uint8Array(GRID * GRID);
    this.shadowMatch = null;

    if (!HAS_SUPABASE) {
      // Defer so listeners attached after construction still fire.
      setTimeout(() => this.emitLocal('error', {
        message: 'Supabase 키가 설정되지 않았습니다 (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
      }), 0);
      return;
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 30 } },
    });
    this.channel = this.supabase.channel(ROOM, {
      config: { broadcast: { self: false }, presence: { key: this.clientId } },
    });

    this.wire();
    this.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') { this.subscribed = true; this.emitLocal('open'); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        this.emitLocal('close');
      }
    });
  }

  // ---- event plumbing ------------------------------------------------------
  on(event, cb) { (this.handlers[event] ||= []).push(cb); return this; }
  emitLocal(event, data) { (this.handlers[event] || []).forEach((cb) => cb(data)); }
  send(event, payload) {
    if (this.subscribed) this.channel.send({ type: 'broadcast', event, payload });
  }
  get id() { return this.clientId; }

  wire() {
    const ch = this.channel;
    ch.on('presence', { event: 'sync' }, () => this.recomputeRole());
    // Host-only inbound:
    ch.on('broadcast', { event: 'input' }, ({ payload }) => {
      if (this.isHost) this.remoteInputs.set(payload.id, payload);
    });
    ch.on('broadcast', { event: 'shoot' }, ({ payload }) => {
      if (!this.isHost || !this.game) return;
      const p = this.game.players.get(payload.id);
      if (!p || p.dead) return;
      if (Date.now() / 1000 - p.lastShot < SHOOT_COOLDOWN) return;
      const fx = this.game.shoot(payload.id, payload.dx, payload.dz);
      if (fx) {
        const m = { id: payload.id, slot: p.slot, x: +p.x.toFixed(2), z: +p.z.toFixed(2), ex: +fx.endX.toFixed(2), ez: +fx.endZ.toFixed(2) };
        this.send('shotfx', m);
        this.emitLocal('shotFx', m); // host renders other players' shots too
      }
    });
    // Client-only inbound (host never receives its own due to broadcast.self=false):
    ch.on('broadcast', { event: 'state' }, ({ payload }) => this.emitLocal('state', payload));
    ch.on('broadcast', { event: 'paint' }, ({ payload }) => {
      this.applyShadowPaint(payload.cells);
      this.emitLocal('paint', payload);
    });
    ch.on('broadcast', { event: 'match' }, ({ payload }) => {
      this.shadowMatch = payload;
      this.emitLocal('match', payload);
    });
    ch.on('broadcast', { event: 'matchStart' }, ({ payload }) => {
      if (payload.grid) this.shadowGrid = Uint8Array.from(payload.grid);
      this.emitLocal('matchStart', payload);
    });
    ch.on('broadcast', { event: 'init' }, ({ payload }) => {
      if (payload.target !== this.clientId) return;
      if (payload.grid) this.shadowGrid = Uint8Array.from(payload.grid);
      this.myTeam = payload.you.slot;
      this.updatePresenceTeam(payload.you.slot);
      this.emitLocal('init', payload);
    });
    ch.on('broadcast', { event: 'shotfx' }, ({ payload }) => this.emitLocal('shotFx', payload));
    ch.on('broadcast', { event: 'left' }, ({ payload }) => this.emitLocal('left', payload.id));
  }

  // ---- public API (matches the old Socket.IO Net) --------------------------
  join(name) {
    this.name = (name || 'Player').slice(0, 14);
    this.joinedAt = Date.now();
    if (!this.subscribed) { this._pendingJoin = true; return; }
    this.trackPresence();
  }

  sendInput(x, z, a, squid) {
    this.myInput = { x, z, a, sq: squid };
    if (this.isHost && this.game) this.game.applyInput(this.clientId, x, z, a, squid);
    else this.send('input', { id: this.clientId, x, z, a, sq: squid });
  }

  sendShoot(dx, dz) {
    if (this.isHost && this.game) {
      const p = this.game.players.get(this.clientId);
      if (!p || p.dead) return;
      const fx = this.game.shoot(this.clientId, dx, dz);
      if (fx) this.send('shotfx', { id: this.clientId, slot: p.slot, x: +p.x.toFixed(2), z: +p.z.toFixed(2), ex: +fx.endX.toFixed(2), ez: +fx.endZ.toFixed(2) });
    } else {
      this.send('shoot', { id: this.clientId, dx, dz });
    }
  }

  // Leave the room entirely (used on death so we don't auto-respawn).
  leave() {
    try { if (this.channel) this.channel.untrack(); } catch (e) { /* ignore */ }
    try { if (this.supabase && this.channel) this.supabase.removeChannel(this.channel); } catch (e) { /* ignore */ }
    this.inRoom = false;
    this.subscribed = false;
    if (this.isHost) this.resignHost();
  }

  // ---- presence / roles ----------------------------------------------------
  trackPresence() {
    this.inRoom = true;
    this.channel.track({ clientId: this.clientId, name: this.name, team: this.myTeam, joinedAt: this.joinedAt });
  }
  updatePresenceTeam(team) {
    this.myTeam = team;
    if (this.inRoom) this.channel.track({ clientId: this.clientId, name: this.name, team, joinedAt: this.joinedAt });
  }

  presenceMembers() {
    const state = this.channel.presenceState();
    const members = [];
    for (const key in state) for (const m of state[key]) members.push(m);
    return members;
  }

  recomputeRole() {
    if (this._pendingJoin && this.subscribed) { this._pendingJoin = false; this.trackPresence(); }
    const members = this.presenceMembers();
    if (members.length === 0 || !this.inRoom) return;
    let host = members[0];
    for (const m of members) {
      if (m.joinedAt < host.joinedAt || (m.joinedAt === host.joinedAt && m.clientId < host.clientId)) host = m;
    }
    const amHost = host.clientId === this.clientId;
    if (amHost && !this.isHost) this.becomeHost();
    else if (!amHost && this.isHost) this.resignHost();
    if (this.isHost) this.reconcileRoster(members);
  }

  becomeHost() {
    this.isHost = true;
    this.game = new Game();
    if (this.shadowGrid.some((v) => v !== 0)) this.game.importGrid(Array.from(this.shadowGrid));
    if (this.shadowMatch) this.game.setPhase(this.shadowMatch.phase, this.shadowMatch.timeLeft);
    this.remoteInputs.clear();
    this.lastPhase = this.game.phase;

    this.hostTimers.push(setInterval(() => this.hostTick(), 1000 / TICK_RATE));
    this.hostTimers.push(setInterval(() => this.hostBroadcast(), 1000 / BROADCAST_RATE));
    this.hostTimers.push(setInterval(() => this.hostMatchPulse(), 1000));
  }

  resignHost() {
    this.isHost = false;
    this.hostTimers.forEach(clearInterval);
    this.hostTimers = [];
    this.game = null;
  }

  buildInit(p) {
    return {
      selfId: p.id,
      config: WORLD_CONFIG,
      grid: this.game.gridSnapshot(),
      match: this.game.matchSnapshot(),
      players: this.game.playerStates(),
      you: { slot: p.slot, hp: p.hp, x: p.x, z: p.z },
    };
  }

  reconcileRoster(members) {
    const ids = new Set(members.map((m) => m.clientId));
    for (const m of members) {
      if (this.game.players.has(m.clientId)) continue;
      const p = this.game.addPlayer(m.clientId, m.name, m.team);
      if (m.clientId === this.clientId) {
        this.myTeam = p.team;
        this.updatePresenceTeam(p.team);
        this.emitLocal('init', this.buildInit(p));
      } else {
        this.send('init', { target: m.clientId, ...this.buildInit(p) });
      }
    }
    for (const id of [...this.game.players.keys()]) {
      if (!ids.has(id)) {
        this.game.removePlayer(id);
        this.remoteInputs.delete(id);
        this.send('left', { id });
        this.emitLocal('left', id);
      }
    }
  }

  // ---- host loops ----------------------------------------------------------
  hostTick() {
    if (this.myInput) this.game.applyInput(this.clientId, this.myInput.x, this.myInput.z, this.myInput.a, this.myInput.sq);
    for (const [id, inp] of this.remoteInputs) this.game.applyInput(id, inp.x, inp.z, inp.a, inp.sq);
    this.game.update();
  }

  hostBroadcast() {
    const players = this.game.playerStates();
    const payload = { players, timeLeft: Math.ceil(this.game.timeLeft), phase: this.game.phase };
    this.send('state', payload);
    this.emitLocal('state', payload);
    const cells = this.game.flushDirty();
    if (cells) {
      const p = { cells, territory: this.game.territory() };
      this.send('paint', p);
      this.emitLocal('paint', p);
    }
  }

  hostMatchPulse() {
    if (this.game.phase !== this.lastPhase) {
      this.lastPhase = this.game.phase;
      if (this.game.phase === 'playing') {
        const ms = { ...this.game.matchSnapshot(), grid: this.game.gridSnapshot() };
        this.send('matchStart', ms);
        this.emitLocal('matchStart', ms);
      }
    }
    const snap = this.game.matchSnapshot();
    this.send('match', snap);
    this.emitLocal('match', snap);
  }

  // ---- shadow (for host migration) ----------------------------------------
  applyShadowPaint(cells) {
    for (let i = 0; i < cells.length; i += 2) this.shadowGrid[cells[i]] = cells[i + 1];
  }
}
