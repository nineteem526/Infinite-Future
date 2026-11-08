import type { Vec3, Vec3Tuple } from '../core/types';
import type { EraId } from '../world/types';
import type { StoryTarget } from './types';

/**
 * Re-planned M3 layout: a large gallery in the east district, a real walkable
 * street in front of it, and the existing city-core puzzle field to the west.
 */
export const GALLERY = {
  minX: 44,
  maxX: 62,
  minZ: 14,
  maxZ: 30,
  height: 12,
  spawn: { x: 53, y: 1.2, z: 22 },
  blankCanvas: { x: 53, y: 3, z: 29.2 },
  blankCanvasSize: { width: 4.4, height: 2.7 },
  blankCanvasOpeningMargin: -0.1,
  paintings: {
    'painting-2026': { x: 45.4, y: 3.2, z: 22 },
    'painting-2126': { x: 60.6, y: 3.2, z: 22 },
  },
  door: { x: 53, y: 1.5, z: 14 },
  paintStroke: { x: 53, y: 3, z: 29.05 },
} as const;

export const STORY_SPAWN = {
  position: { ...GALLERY.spawn },
  yaw: 0,
  pitch: 0,
} as const;

/** Painting teleport destination: the walkable street outside the gallery. */
export const FRAME_DESTINATION = { x: 52, y: 0.94, z: 11.8 } as const;
export const FRAME_DESTINATION_YAW = 0;
export const FRAME_DESTINATION_LABEL = '画廊外的街道';

export const STREET = {
  destination: FRAME_DESTINATION,
  timeDevice: { x: 50.5, y: 0.5, z: 10.5 },
  bridge: {
    eastPlatform: { minX: 46, maxX: 48, y: 0.6 },
    westPlatform: { minX: 40, maxX: 42, y: 0.6 },
    gap: { minX: 42, maxX: 46 },
    wallX: 46,
    retryX: 47,
  },
  corridor: {
    entryX: 40,
    exitX: 34,
    midX: 37,
  },
  gateway: { x: 32, zMin: 8, zMax: 14 },
  coreZone: { maxX: 16, maxZ: 8 },
} as const;

export const STORY_TARGETS: readonly StoryTarget[] = [
  {
    id: 'painting-2026',
    era: '2026',
    anchor: { x: 46.4, y: 1.4, z: 22 },
    radius: 2.8,
  },
  {
    id: 'painting-2126',
    era: '2026',
    anchor: { x: 59.6, y: 1.4, z: 22 },
    radius: 2.8,
  },
  {
    id: 'time-device',
    era: '2026',
    anchor: { x: 50.5, y: 1.2, z: 10.5 },
    radius: 2.8,
  },
  { id: 'archive-record', era: '2126', anchor: { x: -19.7, y: 1.2, z: 0.6 }, radius: 2.4 },
  { id: 'terminal-core', era: '2126', anchor: { x: 26, y: 1.2, z: -21.4 }, radius: 3.4 },
  { id: 'blank-canvas', era: '2026', anchor: { x: 53, y: 1.4, z: 27.9 }, radius: 3.0 },
];

export const TERMINAL_BARRIER: {
  halfExtents: Vec3Tuple;
  center: { x: number; y: number; z: number };
} = {
  halfExtents: [4.5, 1.8, 0.25],
  center: { x: 26, y: 1.8, z: -19 },
};

export function areaLabel(era: EraId, position: Vec3): string {
  if (era === '2026' && position.x >= 44 && position.x <= 62 && position.z >= 14 && position.z <= 30) {
    return '最后的画廊';
  }
  if (era === '2026' && position.x >= 32 && position.z >= 8 && position.z <= 14) {
    return '街道';
  }
  if (era === '2126' && position.x <= -18 && Math.abs(position.z) <= 2.2) {
    return '时序档案通道';
  }
  if (era === '2126' && position.x >= 20 && position.z <= -16) {
    return '终末画布核心';
  }
  return era === '2026' ? '城市核心' : '城市核心（2126）';
}
