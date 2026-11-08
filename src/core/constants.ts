import type { Vec3 } from './types';

/** Physics runs on a fixed timestep so time-shift transactions are deterministic. */
export const FIXED_DT = 1 / 120;
export const MAX_SUBSTEPS = 8;
export const MAX_FRAME_TIME = 0.1;

export const GRAVITY = 18;

/** Player is a capsule: center = feet + PLAYER_TOTAL_HALF_HEIGHT. */
export const PLAYER_RADIUS = 0.3;
export const PLAYER_HALF_HEIGHT = 0.6;
export const PLAYER_TOTAL_HALF_HEIGHT = PLAYER_RADIUS + PLAYER_HALF_HEIGHT;
export const EYE_HEIGHT = 1.62;

export const WALK_SPEED = 5.2;
export const JUMP_SPEED = 6.4;
export const JUMP_BUFFER_SECONDS = 0.12;
export const MOUSE_SENSITIVITY = 0.0022;
export const MAX_PITCH = 1.55;

/** Kinematic character controller tuning. */
export const CHARACTER_OFFSET = 0.02;
export const CHARACTER_AUTOSTEP_HEIGHT = 0.4;
export const CHARACTER_SNAP_DISTANCE = 0.3;
export const CHARACTER_MAX_SLOPE_ANGLE = (50 * Math.PI) / 180;

/** Safety probe nearly matches the player collider; a 1 mm tolerance avoids
 * treating exact surface contact as penetration. */
export const SAFETY_HALF_HEIGHT = PLAYER_HALF_HEIGHT - 0.001;
export const SAFETY_RADIUS = PLAYER_RADIUS - 0.001;

/** Player capsule center above a flat floor at y = 0 (with controller offset). */
export const STANDING_CENTER_Y = PLAYER_TOTAL_HALF_HEIGHT + CHARACTER_OFFSET;

export const DEFAULT_SPAWN: Vec3 = { x: 0, y: 1.2, z: 18 };
export const DEFAULT_YAW = 0;
export const DEFAULT_PITCH = 0;

/** Falling below this height means the player left the test field; respawn. */
export const VOID_Y = -12;
