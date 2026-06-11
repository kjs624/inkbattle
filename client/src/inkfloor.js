import * as THREE from 'three';
import { EMPTY, TEAM_INK } from './constants.js';

// The painted floor. The grid state (one byte per cell) is rendered into a
// DataTexture that's mapped onto a flat plane. Updating ink = writing pixels.
export class InkFloor {
  constructor(mapSize, grid) {
    this.mapSize = mapSize;
    this.grid = grid; // cells per side
    this.half = mapSize / 2;
    this.cell = mapSize / grid;

    // RGBA texture, one texel per cell.
    this.data = new Uint8Array(grid * grid * 4);
    // Parallel team-id grid (EMPTY/PURPLE/ORANGE) used for movement speed.
    this.cells = new Uint8Array(grid * grid);
    this.fillBase();

    this.texture = new THREE.DataTexture(this.data, grid, grid, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(mapSize, mapSize, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 0.85,
      metalness: 0.0,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;

    // Faint grid lines overlaid for spatial reference.
    const gridHelper = new THREE.GridHelper(mapSize, grid / 4, 0x222a44, 0x1a2038);
    gridHelper.position.y = 0.02;
    gridHelper.material.opacity = 0.25;
    gridHelper.material.transparent = true;
    this.gridHelper = gridHelper;
  }

  // Base (unpainted) checkerboard so the ground isn't flat grey.
  fillBase() {
    const g = this.grid;
    for (let z = 0; z < g; z++) {
      for (let x = 0; x < g; x++) {
        const i = (z * g + x) * 4;
        const shade = (x + z) % 2 === 0 ? 60 : 52;
        this.data[i] = shade;
        this.data[i + 1] = shade + 6;
        this.data[i + 2] = shade + 16;
        this.data[i + 3] = 255;
      }
    }
  }

  // Write one cell index (gz*GRID+gx) with a team color. Note the vertical flip
  // (GRID-1-cz) so texture rows line up with world Z.
  setCell(idx, team) {
    const g = this.grid;
    const cx = idx % g;
    const cz = (idx - cx) / g;
    this.cells[idx] = team;
    const py = g - 1 - cz;
    const i = (py * g + cx) * 4;
    if (team === EMPTY) {
      const shade = (cx + cz) % 2 === 0 ? 60 : 52;
      this.data[i] = shade;
      this.data[i + 1] = shade + 6;
      this.data[i + 2] = shade + 16;
    } else {
      const [r, gg, b] = TEAM_INK[team];
      this.data[i] = r;
      this.data[i + 1] = gg;
      this.data[i + 2] = b;
    }
    this.data[i + 3] = 255;
  }

  // Apply a flat [idx, team, idx, team, ...] delta array.
  applyDelta(cells) {
    for (let i = 0; i < cells.length; i += 2) {
      this.setCell(cells[i], cells[i + 1]);
    }
    this.texture.needsUpdate = true;
  }

  // Replace the whole grid (full snapshot on join / match reset).
  applySnapshot(arr) {
    for (let idx = 0; idx < arr.length; idx++) {
      this.setCell(idx, arr[idx]);
    }
    this.texture.needsUpdate = true;
  }

  // Which team's ink (if any) covers a given world position.
  teamAtWorld(x, z) {
    const g = this.grid;
    let cx = Math.floor((x + this.half) / this.cell);
    let cz = Math.floor((z + this.half) / this.cell);
    if (cx < 0) cx = 0; else if (cx >= g) cx = g - 1;
    if (cz < 0) cz = 0; else if (cz >= g) cz = g - 1;
    return this.cells[cz * g + cx];
  }

  addTo(scene) {
    scene.add(this.mesh);
    scene.add(this.gridHelper);
  }
}
