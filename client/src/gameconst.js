// Full gameplay constants for the client-side host simulation.
// v2: free-for-all (개인전), infinite match, HP/heal/death-clears-ink.

export const MAP_SIZE = 60;
export const GRID = 60;
export const CELL = MAP_SIZE / GRID;

export const TICK_RATE = 30;
export const BROADCAST_RATE = 18;

// Infinite mode: no match timer / no result screen.
export const INFINITE = true;
export const MATCH_DURATION = 0; // kept for import compatibility (unused)
export const RESULT_DURATION = 0;

export const BASE_SPEED = 13;
export const SPEED_OWN_INK = 1.5;  // faster on your own ink
export const SPEED_ENEMY_INK = 1;  // no slowdown anymore (kept for compat)

export const SHOOT_RANGE = 15;
export const SHOOT_COOLDOWN = 0.12;
export const BRUSH_RADIUS = 2.4;
export const STREAK_BLOBS = 4;
export const HIT_RADIUS = 2.0;
export const RESPAWN_DELAY = 2.5;

export const PLAYER_RADIUS = 0.55; // smaller characters

// Health / combat
export const MAX_HP = 100;
export const HIT_DAMAGE = 45;      // damage per ink hit (~3 hits to splat)
export const HEAL_RATE = 40;       // HP per second regenerated on your own ink
export const REGEN_DELAY = 1.2;    // seconds after taking damage before regen

// Squid form (hold Shift): faster, smaller, can't shoot.
export const SQUID_SPEED_MULT = 1.5;

// Terrain: max slope you can walk up. Steeper than this is a "wall" you can
// only climb as a squid standing on your own ink.
export const MAX_WALK_SLOPE = 1.1;

export const EMPTY = 0;
// Grid cells now store a per-player "slot" (1..255); 0 = empty.

// Legacy team ids kept only so older imports don't break.
export const PURPLE = 1;
export const ORANGE = 2;
export const TEAMS = {};

export const SCORE_PER_CELL = 1;
export const SCORE_PER_KILL = 20;
export const SCORE_PER_DEATH = 5;
