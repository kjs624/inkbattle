// Ink Battle — authoritative game server.
// Express serves a tiny health page; Socket.IO carries the realtime game.

import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { Game } from './game.js';
import {
  GRID, MAP_SIZE, TICK_RATE, BROADCAST_RATE, MATCH_DURATION,
  BASE_SPEED, SPEED_OWN_INK, SPEED_ENEMY_INK, SHOOT_RANGE, SHOOT_COOLDOWN,
  RESPAWN_DELAY, PLAYER_RADIUS, TEAMS,
} from './constants.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.get('/', (_req, res) => {
  const g = global.__game;
  res.json({
    status: 'ok',
    game: 'Ink Battle server',
    players: g ? g.players.size : 0,
    phase: g ? g.phase : 'init',
    timeLeft: g ? Math.ceil(g.timeLeft) : 0,
  });
});
app.get('/health', (_req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const game = new Game();
global.__game = game;

// The constants a freshly-joined client needs to render the world identically.
const WORLD_CONFIG = {
  GRID, MAP_SIZE, MATCH_DURATION,
  BASE_SPEED, SPEED_OWN_INK, SPEED_ENEMY_INK,
  SHOOT_RANGE, SHOOT_COOLDOWN, RESPAWN_DELAY, PLAYER_RADIUS,
  TEAMS,
};

io.on('connection', (socket) => {
  socket.on('join', (data = {}) => {
    const player = game.addPlayer(socket.id, data.name);
    socket.emit('init', {
      selfId: socket.id,
      config: WORLD_CONFIG,
      grid: game.gridSnapshot(),
      match: game.matchSnapshot(),
      players: game.playerStates(),
      you: { team: player.team, x: player.x, z: player.z },
    });
  });

  socket.on('input', (d) => {
    if (!d) return;
    game.applyInput(socket.id, d.x, d.z, d.a);
  });

  socket.on('shoot', (d) => {
    const p = game.players.get(socket.id);
    if (!p || p.dead || !d) return;
    // Enforce fire-rate server-side.
    if ((Date.now() / 1000) - p.lastShot < SHOOT_COOLDOWN) return;
    const res = game.shoot(socket.id, d.dx, d.dz);
    if (res) {
      io.emit('shotFx', {
        id: socket.id, team: p.team,
        x: +p.x.toFixed(2), z: +p.z.toFixed(2),
        ex: +res.endX.toFixed(2), ez: +res.endZ.toFixed(2),
      });
    }
  });

  socket.on('disconnect', () => {
    game.removePlayer(socket.id);
    io.emit('left', socket.id);
  });
});

// ---- fixed-step simulation -------------------------------------------------
setInterval(() => {
  game.update();
}, 1000 / TICK_RATE);

// ---- broadcast player positions --------------------------------------------
setInterval(() => {
  io.emit('state', {
    players: game.playerStates(),
    timeLeft: Math.ceil(game.timeLeft),
    phase: game.phase,
  });
  // Flush painted-cell deltas with up-to-date territory numbers.
  const cells = game.flushDirty();
  if (cells) {
    io.emit('paint', { cells, territory: game.territory() });
  }
}, 1000 / BROADCAST_RATE);

// ---- match/result + leaderboard pulse (1 Hz) -------------------------------
let lastPhase = game.phase;
setInterval(() => {
  if (game.phase !== lastPhase) {
    lastPhase = game.phase;
    if (game.phase === 'playing') {
      io.emit('matchStart', { ...game.matchSnapshot(), grid: game.gridSnapshot() });
    }
  }
  io.emit('match', game.matchSnapshot());
}, 1000);

server.listen(PORT, () => {
  console.log(`Ink Battle server listening on :${PORT}`);
});
