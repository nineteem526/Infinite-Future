import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  EYE_HEIGHT,
  GRAVITY,
  JUMP_BUFFER_SECONDS,
  JUMP_SPEED,
  MAX_PITCH,
  MOUSE_SENSITIVITY,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_TOTAL_HALF_HEIGHT,
  WALK_SPEED,
} from '../core/constants';
import type { PoseSnapshot, Vec3 } from '../core/types';
import type { Input } from '../input/Input';
import type { Physics } from '../physics/Physics';
import type { EraId } from '../world/types';

export interface PlayerSpawn {
  position: Vec3;
  yaw?: number;
  pitch?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * First-person kinematic player: movement, look, jump and velocity continuity.
 * Velocity is owned here and is never touched by an era switch, so position,
 * view and speed are preserved exactly across a time-shift transaction.
 */
export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;

  /** Capsule center in world space. */
  readonly position = new THREE.Vector3();
  /** x/z = horizontal velocity, y = vertical velocity. */
  readonly velocity = new THREE.Vector3();

  yaw: number;
  pitch: number;
  grounded = false;

  private jumpBuffer = 0;
  private readonly physics: Physics;

  constructor(physics: Physics, spawn: PlayerSpawn) {
    this.physics = physics;
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.05, 500);
    this.camera.rotation.order = 'YXZ';

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      spawn.position.x,
      spawn.position.y,
      spawn.position.z,
    );
    this.body = physics.world.createRigidBody(bodyDesc);
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
        .setFriction(0)
        .setRestitution(0),
      this.body,
    );

    this.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
    this.yaw = spawn.yaw ?? 0;
    this.pitch = spawn.pitch ?? 0;
    this.syncCamera();
  }

  /** Advances movement by one fixed physics step; call before Physics.step. */
  update(dt: number, input: Input, era: EraId): void {
    const look = input.consumeLook();
    if (look.x !== 0 || look.y !== 0) {
      this.yaw -= look.x * MOUSE_SENSITIVITY;
      this.pitch = clamp(this.pitch - look.y * MOUSE_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
    }

    if (input.consumeJump()) {
      this.jumpBuffer = JUMP_BUFFER_SECONDS;
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    const wish = this.wishDirection(input);
    this.velocity.x = wish.x * WALK_SPEED;
    this.velocity.z = wish.z * WALK_SPEED;

    if (this.jumpBuffer > 0 && this.grounded) {
      this.velocity.y = JUMP_SPEED;
      this.jumpBuffer = 0;
      this.grounded = false;
    }

    this.velocity.y -= GRAVITY * dt;
    this.velocity.y = Math.max(this.velocity.y, -45);

    const desired = {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    };

    this.physics.controller.computeColliderMovement(
      this.collider,
      desired,
      undefined,
      undefined,
      this.physics.filterForEra(era),
    );
    const movement = this.physics.controller.computedMovement();

    this.body.setNextKinematicTranslation({
      x: this.position.x + movement.x,
      y: this.position.y + movement.y,
      z: this.position.z + movement.z,
    });

    this.grounded = this.physics.controller.computedGrounded();
    if (this.grounded && this.velocity.y < 0) {
      this.velocity.y = 0;
    }
  }

  /** Reads the authoritative body position after the physics world stepped. */
  afterPhysicsStep(): void {
    const translation = this.body.translation();
    this.position.set(translation.x, translation.y, translation.z);
  }

  syncCamera(): void {
    this.camera.position.set(
      this.position.x,
      this.position.y - PLAYER_TOTAL_HALF_HEIGHT + EYE_HEIGHT,
      this.position.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Development/test helper: moves the body without changing era. */
  teleport(x: number, y: number, z: number, yaw?: number, pitch?: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.body.setTranslation({ x, y, z }, true);
    this.body.setNextKinematicTranslation({ x, y, z });
    this.grounded = false;
    this.jumpBuffer = 0;
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.syncCamera();
  }

  snapshot(): PoseSnapshot {
    return {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      velocity: { x: this.velocity.x, y: this.velocity.y, z: this.velocity.z },
      yaw: this.yaw,
      pitch: this.pitch,
      grounded: this.grounded,
    };
  }

  private wishDirection(input: Input): { x: number; z: number } {
    let forward = 0;
    let strafe = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) forward += 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) forward -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) strafe += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) strafe -= 1;

    if (forward === 0 && strafe === 0) return { x: 0, z: 0 };

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const x = -sin * forward + cos * strafe;
    const z = -cos * forward - sin * strafe;
    const length = Math.hypot(x, z);
    return { x: x / length, z: z / length };
  }
}
