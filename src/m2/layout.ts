import type { Vec3Tuple } from '../core/types';
import type { InteractionTarget } from './types';

/**
 * Shared-coordinate M2 layout. Both eras are pre-built at these anchors, so a
 * switch preserves position; only the active era's props are visible/relevant.
 */
export const M2_LAYOUT = {
  crystalWorld: { x: 6, y: 2.15, z: 0 },
  crystalPedestal: { x: 6, y: 0.9, z: 0 },
  generator: { x: 10, y: 1.65, z: 0 },
  generatorCap: { x: 10, y: 2.82, z: 0 },
  generatorSocket: { x: 10, y: 1.9, z: 1.02 },
  pastDevice: { x: -10, y: 0.55, z: 0 },
  pastDeviceTop: { x: -10, y: 1.5, z: 0 },
  gateCenter: { x: -18, y: 1.9, z: 0 },
  gateFrontAnchor: { x: -16.5, y: 1.4, z: 0 },
  chamberMarker: { x: -21, y: 0.5, z: 0 },
  chamberCrystal: { x: -21, y: 1.2, z: 0 },
  /** Inside-volume used to confirm the player actually walked through. */
  chamber: { minX: -23.3, maxX: -18.6, minZ: -0.9, maxZ: 0.9 },
} as const;

export const GATE_SLAB: { halfExtents: Vec3Tuple; center: { x: number; y: number; z: number } } = {
  halfExtents: [0.35, 1.9, 1.2],
  center: { x: -18, y: 1.9, z: 0 },
};

/**
 * Interaction anchors are read-only data. F only works within radius and only
 * in the target's era. Large mechanisms (generator, past device, gate) appear
 * here as operation targets; only the crystal can ever be picked up.
 */
export const M2_TARGETS: readonly InteractionTarget[] = [
  { id: 'crystal-2126', era: '2126', anchor: { x: 6, y: 1.6, z: 0 }, radius: 2.6 },
  { id: 'generator-2026', era: '2026', anchor: { x: 10, y: 1.4, z: 0 }, radius: 3.0 },
  { id: 'past-device-2026', era: '2026', anchor: { x: -10, y: 1.0, z: 0 }, radius: 2.8 },
  { id: 'future-gate-2126', era: '2126', anchor: { x: -16.5, y: 1.4, z: 0 }, radius: 3.0 },
];
