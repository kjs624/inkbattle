// Full gameplay constants for the client-side host simulation.
// Mirrors server/constants.js (kept as the original authoritative-server design).

export const MAP_SIZE = 60;
export const GRID = 60;
export const CELL = MAP_SIZE / GRID;

export const TICK_RATE = 30;
export const BROADCAST_RATE = 18;

export const MATCH_DURATION = 180;
export const RESULT_DURATION = 8;

export const BASE_SPEED = 13;
export const SPEED_OWN_INK = 1.45;
export const SPEED_ENEMY_INK = 0.5;

export const SHOOT_RANGE = 15;
export const SHOOT_COOLDOWN = 0.12;
export const BRUSH_RADIUS = 2.4;
export const STREAK_BLOBS = 4;
export const HIT_RADIUS = 2.2;
export const RESPAWN_DELAY = 2.5;

export const PLAYER_RADIUS = 0.9;

export const EMPTY = 0;
export const PURPLE = 1;
export const ORANGE = 2;

export const TEAMS = {
  [PURPLE]: { id: PURPLE, name: 'purple', color: '#7c3aed', label: '보라팀' },
  [ORANGE]: { id: ORANGE, name: 'orange', color: '#f97316', label: '주황팀' },
};

export const SCORE_PER_CELL = 1;
export const SCORE_PER_KILL = 20;
export const SCORE_PER_DEATH = 5;
