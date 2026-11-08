import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  CHARACTER_AUTOSTEP_HEIGHT,
  CHARACTER_MAX_SLOPE_ANGLE,
  CHARACTER_OFFSET,
  CHARACTER_SNAP_DISTANCE,
  FIXED_DT,
  GRAVITY,
  SAFETY_HALF_HEIGHT,
  SAFETY_RADIUS,
  PLAYER_TOTAL_HALF_HEIGHT,
} from '../core/constants';
import type { Vec3, Vec3Tuple } from '../core/types';
import type { EraId, SolidSpec } from '../world/types';

const IDENTITY_ROTATION: RAPIER.Rotation = { x: 0, y: 0, z: 0, w: 1 };
const MIN_SLOPE_SLIDE_ANGLE = (35 * Math.PI) / 180;

export interface ObstructionReport {
  blocked: boolean;
  /** Number of target-era colliders overlapping the safety probe (capped at 8). */
  hits: number;
}

function rotationFromEuler(rotation: Vec3Tuple): RAPIER.Rotation {
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ'),
  );
  return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}

function colliderDescFor(solid: SolidSpec): RAPIER.ColliderDesc {
  switch (solid.kind) {
    case 'box': {
      const [hx, hy, hz] = solid.halfExtents;
      return RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    }
    case 'cylinder':
      return RAPIER.ColliderDesc.cylinder(solid.halfHeight, solid.radius);
    case 'capsule':
      return RAPIER.ColliderDesc.capsule(solid.halfHeight, solid.radius);
  }
}

/**
 * One shared Rapier world at shared coordinates.
 *
 * Both eras are pre-built and their colliders stay registered for the whole
 * session. Per-era activation is expressed by collision filters: the character
 * controller and the safety probe only consider colliders owned by the era
 * they are asked about. This keeps broad-phase data valid for the safety probe
 * (no enable/disable timing hazard) while guaranteeing that only the active
 * era can influence movement.
 */
export class Physics {
  readonly world: RAPIER.World;
  readonly controller: RAPIER.KinematicCharacterController;

  private readonly eraByCollider = new Map<number, EraId>();
  private readonly collidersByEra = new Map<EraId, Set<number>>();
  private readonly safetyShape: RAPIER.Capsule;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = FIXED_DT;

    const controller = this.world.createCharacterController(CHARACTER_OFFSET);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.enableAutostep(CHARACTER_AUTOSTEP_HEIGHT, 0.2, false);
    controller.enableSnapToGround(CHARACTER_SNAP_DISTANCE);
    controller.setMaxSlopeClimbAngle(CHARACTER_MAX_SLOPE_ANGLE);
    controller.setMinSlopeSlideAngle(MIN_SLOPE_SLIDE_ANGLE);
    controller.setSlideEnabled(true);
    controller.setApplyImpulsesToDynamicBodies(false);
    this.controller = controller;

    this.safetyShape = new RAPIER.Capsule(SAFETY_HALF_HEIGHT, SAFETY_RADIUS);

    for (const era of ['2026', '2126'] as const) {
      this.collidersByEra.set(era, new Set<number>());
    }
  }

  /** Registers all structural solids of an era as simple primitive colliders. */
  addSolids(era: EraId, solids: readonly SolidSpec[]): void {
    const handles = this.collidersByEra.get(era);
    if (!handles) throw new Error(`Unknown era: ${era}`);

    for (const solid of solids) {
      const desc = colliderDescFor(solid)
        .setTranslation(solid.position[0], solid.position[1], solid.position[2])
        .setFriction(0.9)
        .setRestitution(0);

      if (solid.rotation) {
        desc.setRotation(rotationFromEuler(solid.rotation));
      }

      const collider = this.world.createCollider(desc);
      this.eraByCollider.set(collider.handle, era);
      handles.add(collider.handle);
    }
  }

  eraOf(handle: number): EraId | undefined {
    return this.eraByCollider.get(handle);
  }

  /** Collision filter predicate: only colliders owned by `era` are obstacles. */
  filterForEra(era: EraId): (collider: RAPIER.Collider) => boolean {
    return (collider) => this.eraByCollider.get(collider.handle) === era;
  }

  /**
   * Time-shift safety probe: does the player capsule at `center` overlap any
   * structural collider of the target era? The probe is slightly shrunken so
   * resting on a floor or hugging a valid wall is not a false obstruction.
   */
  isCapsuleObstructed(era: EraId, center: Vec3): ObstructionReport {
    let hits = 0;
    this.world.intersectionsWithShape(
      center,
      IDENTITY_ROTATION,
      this.safetyShape,
      (collider) => {
        if (this.eraByCollider.get(collider.handle) !== era) return true;
        hits += 1;
        return hits < 8;
      },
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => this.eraByCollider.get(collider.handle) === era,
    );
    return { blocked: hits > 0, hits };
  }

  /** True when a nearby surface can support a grounded player at this height. */
  hasSupport(era: EraId, center: Vec3): boolean {
    const ray = new RAPIER.Ray(
      { x: center.x, y: center.y - PLAYER_TOTAL_HALF_HEIGHT + 0.12, z: center.z },
      { x: 0, y: -1, z: 0 },
    );
    return this.world.castRay(ray, 0.35, true, undefined, undefined, undefined, undefined, this.filterForEra(era)) !== null;
  }

  /** Find a nearby clear position without crossing an obstacle in the source era. */
  findSafeLanding(source: EraId, target: EraId, center: Vec3, grounded: boolean): Vec3 | null {
    const step = 0.25;
    for (let radius = step; radius <= 2.0; radius += step) {
      for (let index = 0; index < 16; index += 1) {
        const angle = index * Math.PI / 8;
        const dx = Math.cos(angle) * radius;
        const dz = Math.sin(angle) * radius;
        const candidate = { x: center.x + dx, y: center.y, z: center.z + dz };
        if (this.isCapsuleObstructed(target, candidate).blocked) continue;
        if (grounded && !this.hasSupport(target, candidate)) continue;
        let pathClear = true;
        const samples = Math.ceil(radius / 0.2);
        for (let i = 1; i <= samples; i += 1) {
          const t = i / samples;
          if (this.isCapsuleObstructed(source, { x: center.x + dx * t, y: center.y, z: center.z + dz * t }).blocked) {
            pathClear = false;
            break;
          }
        }
        if (pathClear) return candidate;
      }
    }
    return null;
  }

  step(dt: number = FIXED_DT): void {
    this.world.timestep = dt;
    this.world.step();
  }

  get colliderCount(): number {
    return this.eraByCollider.size;
  }

  countColliders(era: EraId): number {
    return this.collidersByEra.get(era)?.size ?? 0;
  }
}
