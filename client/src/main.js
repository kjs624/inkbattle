import './style.css';
import * as THREE from 'three';
import { Net } from './net.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { InkFloor } from './inkfloor.js';
import { Players } from './players.js';
import { DEFAULT_CONFIG, TEAM_COLORS, EMPTY, PURPLE } from './constants.js';

const root = document.getElementById('app');
const ui = new UI(root);
const net = new Net();

let cfg = { ...DEFAULT_CONFIG };
let selfId = null;
let started = false;       // render loop running
let joined = false;        // received init

// Local authoritative-ish state for our own avatar.
const self = {
  x: 0, z: 0, y: 0, vy: 0, yaw: 0,
  team: PURPLE, dead: false, wasDead: false,
  cells: 0, kills: 0, deaths: 0, score: 0,
};
let serverSelfPos = { x: 0, z: 0 }; // last server position (for respawn snap)
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
net.on('open', () => { ui.setConn(true); ui.setLobbyStatus('서버 연결됨 · 입장 가능'); ui.setStartEnabled(true); });
net.on('close', () => { ui.setConn(false); if (!joined) ui.setLobbyStatus('서버 연결 끊김 · 재연결 중…', true); });
net.on('error', () => { if (!joined) ui.setLobbyStatus('서버에 연결할 수 없습니다. 서버 주소를 확인하세요.', true); });

ui.setStartEnabled(false);
ui.onStart((name) => {
  net.join(name);
});

net.on('init', (data) => {
  selfId = data.selfId;
  cfg = { ...cfg, ...data.config };
  if (!started) { buildScene(); started = true; requestAnimationFrame(loop); }

  self.team = data.you.team;
  self.x = data.you.x; self.z = data.you.z; self.y = 0; self.vy = 0;
  self.yaw = self.team === PURPLE ? 0 : Math.PI;
  input.yaw = self.yaw;
  self.dead = false; self.wasDead = false;

  floor.applySnapshot(data.grid);
  players.ensure(selfId, self.team, '나', true);
  players.syncFromState(data.players, selfId);
  ui.setTerritory(data.match.territory);
  ui.setLeaderboard(data.match.leaderboard, selfId);
  ui.setTimer(data.match.timeLeft, data.match.phase);

  joined = true;
  ui.enterGame();
});

net.on('state', (data) => {
  if (!joined) return;
  players.syncFromState(data.players, selfId);
  const me = data.players.find((p) => p.id === selfId);
  if (me) {
    serverSelfPos = { x: me.x, z: me.z };
    self.cells = me.c; self.kills = me.k; self.deaths = me.de;
    const nowDead = me.d === 1;
    if (nowDead && !self.dead) onSelfDied();
    if (!nowDead && self.dead) onSelfRespawn();
    self.dead = nowDead;
  }
});

net.on('paint', (data) => {
  if (!floor) return;
  floor.applyDelta(data.cells);
  ui.setTerritory(data.territory);
});

net.on('match', (data) => {
  ui.setTimer(data.timeLeft, data.phase);
  ui.setTerritory(data.territory);
  ui.setLeaderboard(data.leaderboard, selfId);
  const me = data.leaderboard.find((p) => p.id === selfId);
  if (me) ui.setSelfStats({ cells: me.cells, kills: me.kills, deaths: me.deaths, score: me.score });
  if (data.phase === 'result') ui.showResult(data, selfId);
  else ui.hideResult();
});

net.on('matchStart', (data) => {
  if (floor && data.grid) floor.applySnapshot(data.grid);
  ui.hideResult();
});

net.on('shotFx', (fx) => {
  if (!projectiles || fx.id === selfId) return; // own shots are spawned locally
  projectiles.spawn(fx.x, fx.z, fx.ex, fx.ez, TEAM_COLORS[fx.team]);
});

net.on('left', (id) => { if (players) players.remove(id); });

// Dev-only hook for headless verification (stripped from production builds).
if (import.meta.env.DEV) {
  window.__ink = {
    get self() { return self; },
    get joined() { return joined; },
    fire() {
      net.sendShoot(Math.sin(self.yaw), Math.cos(self.yaw));
    },
    cellCounts() {
      if (!floor) return null;
      const c = { 0: 0, 1: 0, 2: 0 };
      for (const v of floor.cells) c[v]++;
      return c;
    },
    info() {
      return {
        cam: camera && camera.position.toArray().map(n => +n.toFixed(1)),
        sceneChildren: scene && scene.children.length,
        tris: renderer && renderer.info.render.triangles,
      };
    },
    floorInfo() {
      if (!floor) return null;
      return {
        inScene: scene.children.includes(floor.mesh),
        visible: floor.mesh.visible,
        hasMap: !!floor.mesh.material.map,
        pos: floor.mesh.position.toArray(),
        outputColorSpace: renderer.outputColorSpace,
      };
    },
    topDown() {
      debugCam = true;
      camera.position.set(0, 70, 0.01);
      camera.lookAt(0, 0, 0);
      return 'topdown';
    },
    resumeCam() { debugCam = false; return 'resumed'; },
    get floor() { return floor; },
    get scene() { return scene; },
    get camera() { return camera; },
    get input() { return input; },
    look(yaw) { input.yaw = yaw; return yaw; },
    sampleTexel() {
      const d = floor.data;
      return [d[0], d[1], d[2], d[3]];
    },
  };
}

function onSelfDied() {
  ui.showBanner('<span class="big">💥</span>처치당했습니다! 부활 중…');
}
function onSelfRespawn() {
  self.x = serverSelfPos.x; self.z = serverSelfPos.z;
  self.y = 0; self.vy = 0;
  ui.hideBanner();
}

// ---- main loop -------------------------------------------------------------
let prev = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;

  if (joined) {
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
  const fwd = new THREE.Vector2(Math.sin(self.yaw), Math.cos(self.yaw));
  const right = new THREE.Vector2(Math.cos(self.yaw), -Math.sin(self.yaw));

  if (!self.dead) {
    const a = input.axes();
    let mx = fwd.x * a.fwd + right.x * a.strafe;
    let mz = fwd.y * a.fwd + right.y * a.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    // Speed depends on the ink under our feet.
    const team = floor.teamAtWorld(self.x, self.z);
    let mult = 1;
    if (team !== EMPTY) mult = team === self.team ? cfg.SPEED_OWN_INK : cfg.SPEED_ENEMY_INK;
    const speed = cfg.BASE_SPEED * mult;

    self.x += mx * speed * dt;
    self.z += mz * speed * dt;
    const lim = cfg.MAP_SIZE / 2 - 0.6;
    self.x = Math.max(-lim, Math.min(lim, self.x));
    self.z = Math.max(-lim, Math.min(lim, self.z));

    // Jump (cosmetic hop on flat ground).
    if (input.consumeJump() && self.y <= 0.001) self.vy = 7.5;

    // Firing.
    if (input.firing && performance.now() / 1000 - lastFire >= cfg.SHOOT_COOLDOWN) {
      lastFire = performance.now() / 1000;
      net.sendShoot(fwd.x, fwd.y);
      const ex = self.x + fwd.x * cfg.SHOOT_RANGE;
      const ez = self.z + fwd.y * cfg.SHOOT_RANGE;
      projectiles.spawn(self.x, self.z, ex, ez, TEAM_COLORS[self.team]);
    }
  }

  // Gravity for the hop.
  self.vy -= 22 * dt;
  self.y += self.vy * dt;
  if (self.y < 0) { self.y = 0; self.vy = 0; }

  players.setSelfTransform(selfId, self.x, self.z, self.yaw, self.y);
}

function sendInput(dt) {
  inputAccum += dt;
  if (inputAccum >= 1 / 20) { // ~20 Hz
    inputAccum = 0;
    net.sendInput(self.x, self.z, self.yaw);
  }
}

function updateCamera(dt) {
  if (debugCam) return;
  const fwd = new THREE.Vector3(Math.sin(self.yaw), 0, Math.cos(self.yaw));
  const dist = 9.5, height = 6.5;
  const desired = new THREE.Vector3(
    self.x - fwd.x * dist,
    height + self.y * 0.4,
    self.z - fwd.z * dist
  );
  const k = 1 - Math.pow(0.0001, dt);
  camPos.lerp(desired, k);
  camera.position.copy(camPos);
  camera.lookAt(self.x + fwd.x * 6, 1.2 + self.y * 0.4, self.z + fwd.z * 6);
}

// ---- ink projectiles (visual only) ----------------------------------------
class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.SphereGeometry(0.45, 10, 10);
  }
  spawn(fromX, fromZ, toX, toZ, color) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(fromX, 1.4, fromZ);
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
      p.mesh.position.y = 1.4 + Math.sin(u * Math.PI) * 1.6; // little arc
    }
    // animate splashes
    if (this.splashes) {
      for (let i = this.splashes.length - 1; i >= 0; i--) {
        const s = this.splashes[i];
        s.t += dt;
        const u = s.t / 0.3;
        s.mesh.scale.setScalar(1 + u * 3);
        s.mesh.material.opacity = 0.6 * (1 - u);
        if (u >= 1) { this.scene.remove(s.mesh); this.splashes.splice(i, 1); }
      }
    }
  }
  splash(x, z, color) {
    if (!this.splashes) this.splashes = [];
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
