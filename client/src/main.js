import './style.css';
import * as THREE from 'three';
import { Net } from './net.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { InkFloor } from './inkfloor.js';
import { Players } from './players.js';
import { DEFAULT_CONFIG, EMPTY, slotColorHex } from './constants.js';
import {
  BASE_SPEED, SPEED_OWN_INK, SQUID_SPEED_MULT, MAX_HP, SHOOT_RANGE, SHOOT_COOLDOWN,
  MAX_WALK_SLOPE,
} from './gameconst.js';
import { terrainHeight } from './terrain.js';

const root = document.getElementById('app');
const ui = new UI(root);
const net = new Net();

let cfg = { ...DEFAULT_CONFIG };
let selfId = null;
let started = false;
let joined = false;
let gameOver = false;      // true once we die — freezes control, shows score

// Local state for our own avatar (FFA: slot is our color/identity).
const self = {
  x: 0, z: 0, y: 0, vy: 0, yaw: 0, groundY: 0,
  slot: 1, hp: MAX_HP, dead: false, squid: false,
  cells: 0, kills: 0, deaths: 0, rank: 0, totalPlayers: 0,
};
let serverSelfPos = { x: 0, z: 0 };
let lastFire = 0;
let inputAccum = 0;

// ---- Three.js scene --------------------------------------------------------
let renderer, scene, camera, floor, players, input, projectiles;
let debugCam = false;
const camPos = new THREE.Vector3(0, 12, -12);

function buildScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1020);
  scene.fog = new THREE.Fog(0x0d1020, 55, 110);

  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);

  const hemi = new THREE.HemisphereLight(0xbfd0ff, 0x2a2440, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const d = cfg.MAP_SIZE * 0.7;
  sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
  sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
  sun.shadow.camera.far = 150;
  scene.add(sun);

  floor = new InkFloor(cfg.MAP_SIZE, cfg.GRID);
  floor.addTo(scene);
  buildWalls();

  players = new Players(scene);
  input = new Input(renderer.domElement);
  projectiles = new Projectiles(scene);

  addEventListener('resize', onResize);
}

function buildWalls() {
  const half = cfg.MAP_SIZE / 2;
  const h = 2.2, t = 0.6;
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a3157, roughness: 0.8 });
  const specs = [
    [0, -half, cfg.MAP_SIZE + t, t],
    [0, half, cfg.MAP_SIZE + t, t],
    [-half, 0, t, cfg.MAP_SIZE + t],
    [half, 0, t, cfg.MAP_SIZE + t],
  ];
  for (const [x, z, sx, sz] of specs) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), mat);
    w.position.set(x, h / 2, z);
    w.castShadow = true; w.receiveShadow = true;
    scene.add(w);
  }
}

function onResize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// ---- networking glue -------------------------------------------------------
net.on('open', () => { ui.setConn(true); ui.setLobbyStatus('연결됨 · 입장 가능'); ui.setStartEnabled(true); });
net.on('close', () => { ui.setConn(false); if (!joined) ui.setLobbyStatus('연결 끊김 · 재연결 중…', true); });
net.on('error', (e) => { if (!joined) ui.setLobbyStatus((e && e.message) || '연결할 수 없습니다.', true); });

ui.setStartEnabled(false);
ui.onStart((name) => { net.join(name); });

net.on('init', (data) => {
  selfId = data.selfId;
  cfg = { ...cfg, ...data.config };
  if (!started) { buildScene(); started = true; requestAnimationFrame(loop); }

  self.slot = data.you.slot;
  self.hp = data.you.hp ?? MAX_HP;
  self.x = data.you.x; self.z = data.you.z; self.y = 0; self.vy = 0;
  self.yaw = 0; input.yaw = 0;
  self.dead = false; self.squid = false;

  floor.applySnapshot(data.grid);
  players.ensure(selfId, self.slot, '나', true);
  players.syncFromState(data.players, selfId);
  updateMatchUI(data.match);
  ui.setHp(self.hp, MAX_HP);

  joined = true;
  ui.enterGame();
});

net.on('state', (data) => {
  if (!joined || gameOver) return;
  players.syncFromState(data.players, selfId);
  const me = data.players.find((p) => p.id === selfId);
  if (me) {
    serverSelfPos = { x: me.x, z: me.z };
    self.kills = me.k; self.deaths = me.de;
    if (me.d === 1) {
      if (!self.dead) { self.dead = true; onSelfDied(); } // keep last-alive cells
    } else {
      self.cells = me.c;
      self.hp = me.h;
      ui.setHp(self.hp, MAX_HP);
      self.dead = false;
    }
  }
});

net.on('paint', (data) => {
  if (floor) floor.applyDelta(data.cells);
});

net.on('match', (data) => { updateMatchUI(data); });

net.on('matchStart', (data) => {
  if (floor && data.grid) floor.applySnapshot(data.grid);
});

net.on('shotFx', (fx) => {
  if (!projectiles || fx.id === selfId) return;
  projectiles.spawn(fx.x, fx.z, fx.ex, fx.ez, slotColorHex(fx.slot));
});

net.on('left', (id) => { if (players) players.remove(id); });

function updateMatchUI(match) {
  if (!match) return;
  const lb = match.leaderboard || [];
  const total = match.total || (cfg.GRID * cfg.GRID);
  const me = lb.find((p) => p.id === selfId);
  const rank = me ? lb.findIndex((p) => p.id === selfId) + 1 : 0;
  const coverage = me ? (me.cells / total) * 100 : 0;
  self.rank = rank; self.totalPlayers = lb.length;
  ui.setTopStatus(coverage, rank, lb.length);
  ui.setLeaderboard(lb, selfId);
  if (me) ui.setSelfStats({ cells: me.cells, kills: me.kills, deaths: me.deaths });
}

function onSelfDied() {
  gameOver = true;
  if (document.exitPointerLock) document.exitPointerLock();
  net.leave(); // leave the room so we don't auto-respawn
  ui.showGameOver({
    cells: self.cells,
    kills: self.kills,
    deaths: self.deaths,
    rank: self.rank,
    total: self.totalPlayers,
  });
}

// ---- main loop -------------------------------------------------------------
let prev = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;

  if (joined && !gameOver) {
    updateSelf(dt);
    sendInput(dt);
  }
  players.interpolate(dt, selfId);
  projectiles.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

function updateSelf(dt) {
  self.yaw = input.yaw;
  self.squid = !!input.squid && !self.dead;
  const fwd = new THREE.Vector2(Math.sin(self.yaw), Math.cos(self.yaw));
  const right = new THREE.Vector2(Math.cos(self.yaw), -Math.sin(self.yaw));

  if (!self.dead) {
    const a = input.axes();
    let mx = fwd.x * a.fwd - right.x * a.strafe;
    let mz = fwd.y * a.fwd - right.y * a.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    // Faster on your own ink; no slowdown elsewhere. Squid is faster still.
    const onOwnInk = floor.slotAtWorld(self.x, self.z) === self.slot;
    let mult = onOwnInk ? SPEED_OWN_INK : 1;
    if (self.squid) mult *= SQUID_SPEED_MULT;
    const speed = BASE_SPEED * mult;

    let nx = self.x + mx * speed * dt;
    let nz = self.z + mz * speed * dt;
    const lim = cfg.MAP_SIZE / 2 - 0.6;
    nx = Math.max(-lim, Math.min(lim, nx));
    nz = Math.max(-lim, Math.min(lim, nz));

    // Terrain: block ascending steep slopes ("walls") unless you're a squid
    // standing on your own ink — then you climb.
    const horiz = Math.hypot(nx - self.x, nz - self.z);
    if (horiz > 1e-5) {
      const slope = (terrainHeight(nx, nz) - terrainHeight(self.x, self.z)) / horiz;
      const onOwnInkHere = floor.slotAtWorld(self.x, self.z) === self.slot;
      const onOwnInkDest = floor.slotAtWorld(nx, nz) === self.slot;
      const canClimb = self.squid && (onOwnInkHere || onOwnInkDest);
      if (slope > MAX_WALK_SLOPE && !canClimb) { nx = self.x; nz = self.z; }
    }
    self.x = nx; self.z = nz;

    if (input.consumeJump() && self.y <= 0.001) self.vy = 7.5;

    // Firing (disabled in squid form).
    if (!self.squid && input.firing && performance.now() / 1000 - lastFire >= SHOOT_COOLDOWN) {
      lastFire = performance.now() / 1000;
      net.sendShoot(fwd.x, fwd.y);
      const ex = self.x + fwd.x * SHOOT_RANGE;
      const ez = self.z + fwd.y * SHOOT_RANGE;
      projectiles.spawn(self.x, self.z, ex, ez, slotColorHex(self.slot));
    }
  }

  self.vy -= 22 * dt;
  self.y += self.vy * dt;
  if (self.y < 0) { self.y = 0; self.vy = 0; }

  self.groundY = terrainHeight(self.x, self.z);
  players.setSelfTransform(selfId, self.x, self.z, self.yaw, self.groundY + self.y, self.squid);
}

function sendInput(dt) {
  inputAccum += dt;
  if (inputAccum >= 1 / 20) {
    inputAccum = 0;
    net.sendInput(self.x, self.z, self.yaw, self.squid);
  }
}

function updateCamera(dt) {
  if (debugCam) return;
  const fwd = new THREE.Vector3(Math.sin(self.yaw), 0, Math.cos(self.yaw));
  const dist = 9.5, height = 6.5;
  const desired = new THREE.Vector3(
    self.x - fwd.x * dist,
    self.groundY + height + self.y * 0.4,
    self.z - fwd.z * dist
  );
  const k = 1 - Math.pow(0.0001, dt);
  camPos.lerp(desired, k);
  camera.position.copy(camPos);
  camera.lookAt(self.x + fwd.x * 6, self.groundY + 1.2 + self.y * 0.4, self.z + fwd.z * 6);
}

// ---- ink projectiles (visual only) ----------------------------------------
class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.splashes = [];
    this.geo = new THREE.SphereGeometry(0.4, 10, 10);
  }
  spawn(fromX, fromZ, toX, toZ, color) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(fromX, 1.1, fromZ);
    this.scene.add(mesh);
    this.list.push({ mesh, fromX, fromZ, toX, toZ, t: 0, dur: 0.18, color });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      const u = p.t / p.dur;
      if (u >= 1) {
        this.scene.remove(p.mesh);
        this.splash(p.toX, p.toZ, p.color);
        this.list.splice(i, 1);
        continue;
      }
      p.mesh.position.x = p.fromX + (p.toX - p.fromX) * u;
      p.mesh.position.z = p.fromZ + (p.toZ - p.fromZ) * u;
      p.mesh.position.y = 1.1 + Math.sin(u * Math.PI) * 1.6;
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.t += dt;
      const u = s.t / 0.3;
      s.mesh.scale.setScalar(1 + u * 3);
      s.mesh.material.opacity = 0.6 * (1 - u);
      if (u >= 1) { this.scene.remove(s.mesh); this.splashes.splice(i, 1); }
    }
  }
  splash(x, z, color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.6, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.08, z);
    this.scene.add(mesh);
    this.splashes.push({ mesh, t: 0 });
  }
}

// Dev-only hook for headless verification (stripped from production builds).
if (import.meta.env.DEV) {
  window.__ink = {
    get self() { return self; },
    get joined() { return joined; },
    fire() { net.sendShoot(Math.sin(self.yaw), Math.cos(self.yaw)); },
    cellCounts() {
      if (!floor) return null;
      const c = {};
      for (const v of floor.cells) c[v] = (c[v] || 0) + 1;
      return c;
    },
    info() {
      return {
        cam: camera && camera.position.toArray().map((n) => +n.toFixed(1)),
        tris: renderer && renderer.info.render.triangles,
        slot: self.slot, hp: self.hp, squid: self.squid,
        x: +self.x.toFixed(2), z: +self.z.toFixed(2), groundY: +self.groundY.toFixed(2),
      };
    },
    teleport(x, z) { self.x = x; self.z = z; self.groundY = terrainHeight(x, z); return [x, z]; },
    look(yaw) { input.yaw = yaw; return yaw; },
    setSquid(v) { input.squid = !!v; return input.squid; },
    die() { if (!self.dead) { self.dead = true; onSelfDied(); } return 'died'; },
    press(code, down = true) { dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })); },
    topDown() { debugCam = true; camera.position.set(0, 70, 0.01); camera.lookAt(0, 0, 0); return 'topdown'; },
    resumeCam() { debugCam = false; return 'resumed'; },
  };
}
