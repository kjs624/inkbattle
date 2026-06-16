// Deterministic heightfield terrain. Pure function of (x, z) so every client
// computes identical heights — no need to send Y over the network.
//
// Two kinds of hills:
//  - gentle  : cosine bump you can walk up.
//  - steep   : flat-topped mesa with steep sides ("walls"). Too steep to walk;
//              climbable only as a squid standing on your own ink.

const HILLS = [
  { x: -12, z: -8, r: 11, h: 6.0, steep: false },
  { x: 16, z: 13, r: 7, h: 8.0, steep: true },
  { x: 13, z: -15, r: 6, h: 6.5, steep: true },
  { x: -16, z: 15, r: 9, h: 4.5, steep: false },
  { x: 2, z: 5, r: 5, h: 3.0, steep: false },
];

function smoothstep(t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

export function terrainHeight(x, z) {
  let h = 0;
  for (const hl of HILLS) {
    const d = Math.hypot(x - hl.x, z - hl.z);
    if (d >= hl.r) continue;
    const t = d / hl.r;
    let f;
    if (hl.steep) {
      // flat top out to 0.55, then a steep drop to 0 at the rim
      f = t < 0.55 ? 1 : 1 - smoothstep((t - 0.55) / 0.45);
    } else {
      f = 0.5 + 0.5 * Math.cos(t * Math.PI); // 1 at center -> 0 at rim
    }
    const hv = hl.h * f;
    if (hv > h) h = hv;
  }
  return h;
}
