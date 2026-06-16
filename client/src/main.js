import './style.css';
import * as THREE from 'three';
import { Net } from './net.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { InkFloor } from './inkfloor.js';
import { Players } from './players.js';
import { DEFAULT_CONFIG, EMPTY, slotColorHex } from './constants.js';
import {
  BASE_SPEED, SPEED_OWN_INK, SQUID_SPEED_MULT, MAX_HP, STEP_UP, EYE_HEIGHT,
} from './gameconst.js';
import { terrainHeight } from './terrain.js';
import { getWeapon, WEAPON_ORDER } from './weapons.js';

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
  x: 0, z: 0, y: 0, vy: 0, yaw: 0, pitch: 0, groundY: 0,
  slot: 1, hp: MAX_HP, dead: false, squid: false, weapon: WEAPON_ORDER[0],
  cells: 0, kills: 0, deaths: 0, rank: 0, totalPlayers: 0,
};
let gun = null, gunFlash = null, gunBaseZ = -0.6, gunRecoil = 0, gunFlashTimer = 0;
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

  scene.add(camera);   // so the first-person gun (a child of camera) renders
  setGun(self.weapon);

  addEventListener('resize', onResize);
}

// Build a simple first-person gun viewmodel and attach it to the camera.
function setGun(weaponKey) {
  if (gun) { camera.remove(gun); }
  const w = getWeapon(weaponKey);
  gun = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.6, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: w.gunColor, emissive: w.gunColor, emissiveIntensity: 0.35 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.34), mat);
  gun.add(body);
  const barrelLen = 0.3 + w.len * 0.34;
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, barrelLen), mat);
  barrel.position.set(0, 0.03, -0.17 - barrelLen / 2);
  gun.add(barrel);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), accent);
  sight.position.set(0, 0.12, -0.1);
  gun.add(sight);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.1), mat);
  grip.position.set(0, -0.15, 0.08);
  gun.add(grip);

  // muzzle flash (hidden until firing)
  gunFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff2a0 })
  );
  gunFlash.position.set(0, 0.03, -0.17 - barrelLen);
  gunFlash.visible = false;
  gun.add(gunFlash);

  gun.position.set(0.32, -0.26, gunBaseZ);
  camera.add(gun);
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
  self.yaw = 0; input.yaw = 0; self.pitch = 0; input.pitch = 0;
  self.dead = false; self.squid = false;
  ui.setWeapon(input.weapon);

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
    // Sync slot when we steal an identity (server assigns new slot)
    if (me.sl && me.sl !== self.slot) self.slot = me.sl;
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
  if (!projectiles || fx.id === selfId || !fx.impacts) return;
  const shooter = players.get(fx.id);
  const color = slotColorHex(shooter ? shooter.slot : 1);
  const origin = new THREE.Vector3(fx.ox, fx.oy, fx.oz);
  const wpn = getWeapon(fx.w);
  for (const im of fx.impacts) {
    const to = new THREE.Vector3(im.x, terrainHeight(im.x, im.z) + 0.3, im.z);
    projectiles.spawnTracer(origin, to, color, wpn.bulletSpeed);
  }
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
  if (gun) {
    gunRecoil = Math.max(0, gunRecoil - dt * 9);
    gun.position.z = gunBaseZ + gunRecoil * 0.09;
    gun.rotation.x = gunRecoil * 0.22;
  }
  if (gunFlash) {
    gunFlashTimer = Math.max(0, gunFlashTimer - dt);
    gunFlash.visible = gunFlashTimer > 0;
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

function updateSelf(dt) {
  self.yaw = input.yaw;
  self.pitch = input.pitch;
  self.squid = !!input.squid && !self.dead;
  if (input.weapon !== self.weapon) {
    self.weapon = input.weapon;
    setGun(self.weapon);
    ui.setWeapon(self.weapon);
  }
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

    // Step/climb gate: a tall step is a "wall" — climbable only as a squid
    // standing on your own ink. Small steps you just walk up.
    const dH = terrainHeight(nx, nz) - terrainHeight(self.x, self.z);
    const canClimb = self.squid &&
      (floor.slotAtWorld(self.x, self.z) === self.slot || floor.slotAtWorld(nx, nz) === self.slot);
    if (dH > STEP_UP && !canClimb) { nx = self.x; nz = self.z; }
    self.x = nx; self.z = nz;

    if (input.consumeJump() && self.y <= 0.001) self.vy = 7.5;

    // Firing (disabled in squid form), per-weapon fire rate.
    const w = getWeapon(self.weapon);
    if (!self.squid && input.firing && performance.now() / 1000 - lastFire >= w.cooldown) {
      lastFire = performance.now() / 1000;
      fireWeapon(w);
    }
  }

  self.vy -= 22 * dt;
  self.y += self.vy * dt;
  if (self.y < 0) { self.y = 0; self.vy = 0; }

  self.groundY = terrainHeight(self.x, self.z);
  players.setSelfTransform(selfId, self.x, self.z, self.yaw, self.groundY + self.y, self.squid);
}

function aimVec() {
  const cp = Math.cos(self.pitch), sp = Math.sin(self.pitch);
  return new THREE.Vector3(Math.sin(self.yaw) * cp, sp, Math.cos(self.yaw) * cp);
}
function eyeVec() {
  return new THREE.Vector3(self.x, self.groundY + EYE_HEIGHT + self.y, self.z);
}
function raymarchClient(o, d, range) {
  const step = 0.5;
  for (let t = step; t <= range; t += step) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    const th = terrainHeight(x, z);
    if (y <= th) return new THREE.Vector3(x, th + 0.05, z);
  }
  return new THREE.Vector3(o.x + d.x * range, o.y + d.y * range, o.z + d.z * range);
}
function fireWeapon(w) {
  const eye = eyeVec();
  const aim = aimVec();
  net.sendShoot({
    w: w.key,
    ox: +eye.x.toFixed(2), oy: +eye.y.toFixed(2), oz: +eye.z.toFixed(2),
    dx: +aim.x.toFixed(3), dy: +aim.y.toFixed(3), dz: +aim.z.toFixed(3),
  });
  const muzzle = eye.clone().add(aim.clone().multiplyScalar(0.8));
  const color = slotColorHex(self.slot);
  for (let i = 0; i < w.pellets; i++) {
    const d = aim.clone();
    if (w.spread > 0) {
      d.x += (Math.random() - 0.5) * w.spread * 2;
      d.y += (Math.random() - 0.5) * w.spread * 2;
      d.z += (Math.random() - 0.5) * w.spread * 2;
      d.normalize();
    }
    const impact = raymarchClient(eye, d, w.range);
    projectiles.spawnTracer(muzzle, impact, color, w.bulletSpeed);
  }
  gunRecoil = 1;
  gunFlashTimer = 0.055;
}

function sendInput(dt) {
  inputAccum += dt;
  if (inputAccum >= 1 / 20) {
    inputAccum = 0;
    net.sendInput(self.x, self.z, self.yaw, self.squid, self.weapon);
  }
}

// First-person camera: sit at the eye and look along the aim direction.
function updateCamera() {
  if (debugCam) return;
  const eye = eyeVec();
  const aim = aimVec();
  camera.position.copy(eye);
  camera.lookAt(eye.x + aim.x, eye.y + aim.y, eye.z + aim.z);
}

// ---- bullets (visible tracers) + ink splashes -----------------------------
class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.splashes = [];
    this.geo = new THREE.SphereGeometry(0.18, 8, 8);
  }
  // Fast tracer from `from` to `to` (THREE.Vector3).
  spawnTracer(from, to, color, speed) {
    const dist = Math.max(0.001, from.distanceTo(to));
    const dur = Math.min(0.5, Math.max(0.03, dist / (speed || 90)));
    const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.list.push({ mesh, from: from.clone(), to: to.clone(), t: 0, dur, color });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      const u = p.t / p.dur;
      if (u >= 1) {
        this.scene.remove(p.mesh);
        this.splash(p.to, p.color);
        this.list.splice(i, 1);
        continue;
      }
      p.mesh.position.lerpVectors(p.from, p.to, u);
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
  splash(pos, color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.5, 14),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    mesh.position.y += 0.06;
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
