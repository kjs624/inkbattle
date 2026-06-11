import * as THREE from 'three';
import { TEAM_COLORS } from './constants.js';

function makeNameSprite(name, hex) {
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
  sprite.scale.set(4, 1, 1);
  sprite.position.y = 3.1;
  return sprite;
}

// One avatar: a capsule body, a "nose" cone showing facing/aim, a ground ring.
function buildAvatar(team, isSelf, name) {
  const group = new THREE.Group();
  const color = TEAM_COLORS[team];

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.7, 1.1, 6, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 })
  );
  body.position.y = 1.2;
  body.castShadow = true;
  group.add(body);

  // Eyes give a sense of facing direction (+Z is forward).
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 });
  for (const sx of [-0.28, 0.28]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), eyeMat);
    eye.position.set(sx, 1.55, 0.6);
    group.add(eye);
  }

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.9, 14),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isSelf ? 0.55 : 0.3,
    })
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.2, 1.05);
  group.add(nose);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.15, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isSelf ? 0.9 : 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  group.add(makeNameSprite(name, color));
  return group;
}

export class Players {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map(); // id -> { group, team, target:{x,z,a}, dead }
  }

  ensure(id, team, name, isSelf) {
    let p = this.map.get(id);
    if (!p) {
      const group = buildAvatar(team, isSelf, name || 'P');
      this.scene.add(group);
      p = { group, team, target: { x: 0, z: 0, a: 0 }, dead: false, isSelf };
      this.map.set(id, p);
    }
    return p;
  }

  // Update from a server state snapshot (array of compact player objects).
  syncFromState(list, selfId) {
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id);
      const p = this.ensure(s.id, s.t, s.n, s.id === selfId);
      p.target.x = s.x;
      p.target.z = s.z;
      p.target.a = s.a;
      p.dead = s.d === 1;
      if (s.id === selfId) continue; // self is locally controlled; skip remote pos
      p.group.visible = !p.dead;
    }
    // Remove players no longer present.
    for (const id of [...this.map.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  // Smoothly move remote avatars toward their latest target each frame.
  interpolate(dt, selfId) {
    const k = 1 - Math.pow(0.0015, dt); // frame-rate independent smoothing
    for (const [id, p] of this.map) {
      if (id === selfId) continue;
      const g = p.group;
      g.position.x += (p.target.x - g.position.x) * k;
      g.position.z += (p.target.z - g.position.z) * k;
      // Shortest-arc angle lerp.
      let da = p.target.a - g.rotation.y;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      g.rotation.y += da * k;
    }
  }

  setSelfTransform(selfId, x, z, a, y = 0) {
    const p = this.map.get(selfId);
    if (!p) return;
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
