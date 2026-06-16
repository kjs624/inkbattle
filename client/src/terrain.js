// Box terrain: a handful of simple cuboids at jagged heights. terrainHeight is
// a pure step function (tallest box covering the point, else 0) so every client
// agrees and the ink grid wraps over the boxes when the floor plane is displaced.

const BOXES = [
  { x: -14, z: -12, w: 8, d: 8, h: 5 },
  { x: 14, z: 13, w: 7, d: 7, h: 8 },
  { x: 15, z: -14, w: 6, d: 6, h: 3 },
  { x: -16, z: 14, w: 8, d: 6, h: 6 },
  { x: 0, z: 0, w: 6, d: 6, h: 2 },
  { x: -3, z: 19, w: 7, d: 5, h: 4 },
  { x: 20, z: 3, w: 5, d: 9, h: 7 },
  { x: -20, z: -3, w: 5, d: 7, h: 4 },
  { x: 7, z: -20, w: 9, d: 5, h: 5 },
];

export function terrainHeight(x, z) {
  let h = 0;
  for (const b of BOXES) {
    if (
      x >= b.x - b.w / 2 && x <= b.x + b.w / 2 &&
      z >= b.z - b.d / 2 && z <= b.z + b.d / 2
    ) {
      if (b.h > h) h = b.h;
    }
  }
  return h;
}

export { BOXES };
