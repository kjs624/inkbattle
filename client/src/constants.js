// Client rendering constants. v2 is free-for-all: each player gets a unique
// color derived deterministically from their "slot" (1..255), so host and all
// clients agree on colors without sending a palette over the wire.

export const EMPTY = 0;

function hslToRgb(h, s, l) {
  // h,s,l in 0..1 -> [r,g,b] 0..255
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

const _rgb = new Map();
const _hex = new Map();

// Bright, well-spaced ink color for a slot (golden-angle hue spacing).
export function slotColorRGB(slot) {
  if (_rgb.has(slot)) return _rgb.get(slot);
  const hue = ((slot * 137.508) % 360) / 360;
  const rgb = hslToRgb(hue, 0.72, 0.58);
  _rgb.set(slot, rgb);
  return rgb;
}

export function slotColorHex(slot) {
  if (_hex.has(slot)) return _hex.get(slot);
  const [r, g, b] = slotColorRGB(slot);
  const hex = (r << 16) | (g << 8) | b;
  _hex.set(slot, hex);
  return hex;
}

export function slotColorCss(slot) {
  const [r, g, b] = slotColorRGB(slot);
  return `rgb(${r},${g},${b})`;
}

// Fallback world config (overwritten by host `init.config`).
export const DEFAULT_CONFIG = {
  GRID: 60,
  MAP_SIZE: 60,
  BASE_SPEED: 13,
  SPEED_OWN_INK: 1.5,
  SHOOT_RANGE: 15,
  SHOOT_COOLDOWN: 0.12,
  RESPAWN_DELAY: 2.5,
  PLAYER_RADIUS: 0.55,
  MAX_HP: 100,
  SQUID_SPEED_MULT: 1.5,
};
