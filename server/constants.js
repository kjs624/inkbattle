// Shared game constants (authoritative source of truth).
// NOTE: client/src/constants.js mirrors these values. Keep them in sync.

export const MAP_SIZE = 60;        // world units (floor spans -30..30 on X and Z)
export const GRID = 60;            // cells per side (GRID x GRID total)
export const CELL = MAP_SIZE / GRID; // world size of one cell (=1)

export const TICK_RATE = 30;       // server simulation ticks per second
export const BROADCAST_RATE = 20;  // state broadcasts per second

export const MATCH_DURATION = 180; // seconds of play per match
export const RESULT_DURATION = 8;  // seconds showing results before reset

export const BASE_SPEED = 13;      // world units / second on neutral ground
export const SPEED_OWN_INK = 1.45; // multiplier on your team's ink
export const SPEED_ENEMY_INK = 0.5;// multiplier on enemy ink

export const SHOOT_RANGE = 15;     // how far ink travels (world units)
export const SHOOT_COOLDOWN = 0.12;// seconds between shots
export const BRUSH_RADIUS = 2.4;   // ink blob radius in cells
export const STREAK_BLOBS = 4;     // blobs painted along the shot trajectory
export const HIT_RADIUS = 2.2;     // world-unit radius to splat an enemy
export const RESPAWN_DELAY = 2.5;  // seconds before a splatted player respawns

export const PLAYER_RADIUS = 0.9;  // collision/visual radius

// Cell ownership values
export const EMPTY = 0;
export const PURPLE = 1;
export const ORANGE = 2;

export const TEAMS = {
  [PURPLE]: { id: PURPLE, name: 'purple', color: '#7c3aed', label: '보라팀' },
  [ORANGE]: { id: ORANGE, name: 'orange', color: '#f97316', label: '주황팀' },
};

// Score weights for the individual leaderboard
export const SCORE_PER_CELL = 1;
export const SCORE_PER_KILL = 20;
export const SCORE_PER_DEATH = 5;
