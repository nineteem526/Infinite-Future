import type * as THREE from 'three';
import type { Vec3Tuple } from '../core/types';

export type EraId = '2026' | '2126';

export const ERA_IDS: readonly EraId[] = ['2026', '2126'];

export function otherEra(era: EraId): EraId {
  return era === '2026' ? '2126' : '2026';
}

export interface MaterialLook {
  color: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  opacity?: number;
}

interface SolidBase extends MaterialLook {
  position: Vec3Tuple;
  /** Euler XYZ rotation in radians. */
  rotation?: Vec3Tuple;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Structural geometry. Every solid gets a simple primitive collider that
 * matches its visual primitive; decorative meshes must not be used as
 * precision colliders for critical mechanisms.
 */
export interface BoxSolid extends SolidBase {
  kind: 'box';
  halfExtents: Vec3Tuple;
}

export interface CylinderSolid extends SolidBase {
  kind: 'cylinder';
  radius: number;
  halfHeight: number;
}

export interface CapsuleSolid extends SolidBase {
  kind: 'capsule';
  radius: number;
  halfHeight: number;
}

export type SolidSpec = BoxSolid | CylinderSolid | CapsuleSolid;

export interface SunLightSpec {
  color: number;
  intensity: number;
  position: Vec3Tuple;
}

export interface HemisphereLightSpec {
  skyColor: number;
  groundColor: number;
  intensity: number;
}

export interface AmbientLightSpec {
  color: number;
  intensity: number;
}

/** Everything scene-level that must switch together with the era. */
export interface EraLighting {
  background: number;
  fogColor: number;
  fogDensity: number;
  exposure: number;
  sun: SunLightSpec;
  hemi: HemisphereLightSpec;
  ambient: AmbientLightSpec;
}

export interface EraBuild {
  id: EraId;
  name: string;
  description: string;
  lighting: EraLighting;
  /** Structural solids: rendered as primitives and registered as colliders. */
  solids: SolidSpec[];
  /** Non-colliding visual dressing (skyline, inlays, clock faces...). */
  decorate: (group: THREE.Group) => void;
}
