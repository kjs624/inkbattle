// Client-side mirror of server/constants.js. The server also sends most of
// these in the `init` payload (config), but we keep local copies so the world
// can be built before/independently of the network.

export const EMPTY = 0;
export const PURPLE = 1;
export const ORANGE = 2;

export const TEAM_COLORS = {
  [PURPLE]: 0x7c3aed,
  [ORANGE]: 0xf97316,
};

export const TEAM_INK = {
  // Slightly brighter/saturated tones for painted floor ink.
  [PURPLE]: [0x8b, 0x5c, 0xf6],
  [ORANGE]: [0xfb, 0x92, 0x3c],
};

export const TEAM_LABEL = {
  [PURPLE]: '보라팀',
  [ORANGE]: '주황팀',
};

// Fallback world config (overwritten by server `init.config`).
export const DEFAULT_CONFIG = {
  GRID: 60,
  MAP_SIZE: 60,
  MATCH_DURATION: 180,
  BASE_SPEED: 13,
  SPEED_OWN_INK: 1.45,
  SPEED_ENEMY_INK: 0.5,
  SHOOT_RANGE: 15,
  SHOOT_COOLDOWN: 0.12,
  RESPAWN_DELAY: 2.5,
  PLAYER_RADIUS: 0.9,
};
