import * as THREE from 'three';
import { slotColorHex } from './constants.js';

const BASE_SCALE = 0.6;   // smaller characters (v2)
const SQUID_SCALE = 0.42; // squid form is smaller still

function makeNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(name, 128, 34);
  ctx.fillStyle = '#fff';
  ctx.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3, 0.75, 1);
  sprite.position.y = 2.2;
  return sprite;
}

// One avatar: a scalable body (capsule + eyes + nose + ground ring) plus an
// unscaled name sprite, so the name stays readable when the body shrinks.
function buildAvatar(slot, isSelf, name) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const color = slotColorHex(slot);

  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.7, 1.1, 6, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 })
  );
  capsule.position.y = 1.2;
  capsule.castShadow = true;
  body.add(capsule);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 });
  for (const sx of [-0.28, 0.28]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), eyeMat);
    eye.position.set(sx, 1.55, 0.6);
    body.add(eye);
  }

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.9, 14),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: isSelf ? 0.55 : 0.3 })
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.2, 1.05);
  body.add(nose);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.15, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isSelf ? 0.9 : 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  body.add(ring);

  body.scale.setScalar(BASE_SCALE);
  group.userData.body = body;
  group.add(makeNameSprite(name || 'P'));
  return group;
}

function applyForm(p) {
  const body = p.group.userData.body;
  const target = p.squid ? SQUID_SCALE : BASE_SCALE;
  body.scale.setScalar(target);
}

export class Players {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map(); // id -> { group, slot, target, dead, squid }
  }

  ensure(id, slot, name, isSelf) {
    let p = this.map.get(id);
    if (!p) {
      const group = buildAvatar(slot, isSelf, name || 'P');
      this.scene.add(group);
      p = { group, slot, target: { x: 0, z: 0, a: 0 }, dead: false, squid: false, isSelf };
      this.map.set(id, p);
    }
    return p;
  }

  syncFromState(list, selfId) {
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id);
      const p = this.ensure(s.id, s.sl, s.n, s.id === selfId);
      p.target.x = s.x;
      p.target.z = s.z;
      p.target.a = s.a;
      p.dead = s.d === 1;
      p.squid = s.sq === 1;
      if (s.id === selfId) continue; // self is locally controlled
      applyForm(p);
      p.group.visible = !p.dead;
    }
    for (const id of [...this.map.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  interpolate(dt, selfId) {
    const k = 1 - Math.pow(0.0015, dt);
    for (const [id, p] of this.map) {
      if (id === selfId) continue;
      const g = p.group;
      g.position.x += (p.target.x - g.position.x) * k;
      g.position.z += (p.target.z - g.position.z) * k;
      let da = p.target.a - g.rotation.y;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      g.rotation.y += da * k;
    }
  }

  setSelfTransform(selfId, x, z, a, y = 0, squid = false) {
    const p = this.map.get(selfId);
    if (!p) return;
    p.squid = squid;
    applyForm(p);
    p.group.position.set(x, y, z);
    p.group.rotation.y = a;
    p.group.visible = !p.dead;
  }

  remove(id) {
    const p = this.map.get(id);
    if (!p) return;
    this.scene.remove(p.group);
    this.map.delete(id);
  }

  get(id) { return this.map.get(id); }
}
