import type { Vec3, Vec3Tuple } from '../core/types';
import type { EraId } from '../world/types';
import type { StoryTarget } from './types';

/**
 * Shared-coordinate M3 layout. The gallery sits in the south of the 2026 plaza,
 * the archive uses M2's opened 2126 passage, and the terminal canvas core is a
 * new 2126 room in the north-east. Placeholder geometry only.
 */
export const STORY_SPAWN = {
  position: { x: 0, y: 1.2, z: 28.5 },
  yaw: 0,
  pitch: 0,
} as const;

export const GALLERY = {
  westWallX: -8,
  eastWallX: 8,
  doorZ: 24,
  backWallZ: 31.2,
  height: 6,
  ceilingY: 6.2,
  centerZ: 27.6,
  halfWidth: 8,
  halfDepth: 3.6,
} as const;

export const GALLERY_DOOR: { halfExtents: Vec3Tuple; center: { x: number; y: number; z: number } } = {
  halfExtents: [2, 1.5, 0.25],
  center: { x: 0, y: 1.5, z: GALLERY.doorZ },
};

export const STORY_LAYOUT = {
  gallerySpawn: STORY_SPAWN.position,
  galleryDoor: { x: 0, y: 1.5, z: 24 },
  galleryDoorCanvas: { x: 0, y: 2.0, z: 24.12 },
  blankCanvas: { x: 0, y: 2.2, z: 30.86 },
  paintStroke: { x: 0, y: 2.2, z: 30.78 },  paintings: {
    'painting-2026': { x: -7.6, y: 2.5, z: 27.6 },
    'painting-2126': { x: 7.6, y: 2.5, z: 27.6 },
    'painting-gallery': { x: -4.7, y: 2.5, z: 24.32 },
  },
  archiveDais: { x: -19.7, y: 0.45, z: 0.95 },
  archiveMonolith: { x: -19.7, y: 1.35, z: 0.95 },
  terminal: {
    center: { x: 26, y: 0, z: -22 },
    backWall: { x: 26, y: 4, z: -25.5 },
    barrier: { x: 26, y: 1.8, z: -19 },
    coreCanvas: { x: 26, y: 4.2, z: -24.9 },
  },
} as const;

export const TERMINAL_BARRIER: {
  halfExtents: Vec3Tuple;
  center: { x: number; y: number; z: number };
} = {
  halfExtents: [4.5, 1.8, 0.25],
  center: { x: 26, y: 1.8, z: -19 },
};

/**
 * Deterministic painting-teleport destination for the M3 prologue. It is a
 * fixed, pre-validated safe landing in the lost district (2026 plaza), outside
 * all story-gated barriers and mechanisms. The frame interaction validates this
 * position before committing; it cannot be redirected by the player.
 */
export const FRAME_DESTINATION = { x: 0, y: 0.94, z: 19.5 } as const;
export const FRAME_DESTINATION_YAW = 0;
export const FRAME_DESTINATION_LABEL = '失落的街区（2026 广场）';

/** Story interaction anchors (3D distance, era-gated). */
export const STORY_TARGETS: readonly StoryTarget[] = [
  { id: 'painting-2026', era: '2026', anchor: { x: -6.6, y: 1.2, z: 27.6 }, radius: 2.3 },
  { id: 'painting-2126', era: '2026', anchor: { x: 6.6, y: 1.2, z: 27.6 }, radius: 2.3 },
  { id: 'painting-gallery', era: '2026', anchor: { x: -4.7, y: 1.2, z: 25.1 }, radius: 2.2 },
  { id: 'gallery-frame', era: '2026', anchor: { x: 0, y: 1.2, z: 25.4 }, radius: 2.6 },
  { id: 'archive-record', era: '2126', anchor: { x: -19.7, y: 1.2, z: 0.6 }, radius: 2.4 },
  { id: 'terminal-core', era: '2126', anchor: { x: 26, y: 1.2, z: -21.4 }, radius: 3.4 },
  { id: 'blank-canvas', era: '2026', anchor: { x: 0, y: 1.2, z: 30.1 }, radius: 2.6 },
];

/** Human-readable area label used by the HUD status line. */
export function areaLabel(era: EraId, position: Vec3): string {
  if (era === '2026' && position.z >= 23.2 && Math.abs(position.x) <= 9) {
    return '最后的画廊';
  }
  if (era === '2126' && position.x <= -18 && Math.abs(position.z) <= 2.2) {
    return '时序档案通道';
  }
  if (era === '2126' && position.x >= 20 && position.z <= -16) {
    return '终末画布核心';
  }
  return era === '2026' ? '暖金广场' : '铅灰废墟';
}
