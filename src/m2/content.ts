import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Vec3Tuple } from '../core/types';
import type { Physics } from '../physics/Physics';
import type { Era } from '../world/Era';
import { addSolidVisuals, createSolidVisual, decoBox, decoCylinder } from '../world/geometry';
import type { EraId, SolidSpec } from '../world/types';
import { GATE_SLAB, M2_LAYOUT } from './layout';

const MACHINE = 0x6d6455;
const MACHINE_LIGHT = 0x77705f;
const BRASS = 0xa88d5a;
const PEDESTAL = 0x6b6a66;
const PEDESTAL_TRIM = 0x8a8272;
const GATE_STONE = 0x5a5148;

const CRYSTAL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xd8fbff,
  emissive: 0x46c7e8,
  emissiveIntensity: 1.35,
  roughness: 0.12,
  metalness: 0.25,
});

function point(p: { x: number; y: number; z: number }): Vec3Tuple {
  return [p.x, p.y, p.z];
}

function machineBox(
  halfExtents: Vec3Tuple,
  position: Vec3Tuple,
  color: number,
  roughness = 0.75,
  metalness = 0.35,
): SolidSpec {
  return { kind: 'box', halfExtents, position, color, roughness, metalness };
}

function createCrystalMesh(scale: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), CRYSTAL_MATERIAL);
  mesh.scale.setScalar(scale);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export interface M2ContentDeps {
  readonly eras: ReadonlyMap<EraId, Era>;
  readonly physics: Physics;
  readonly camera: THREE.PerspectiveCamera;
}

/**
 * All M2 geometry and colliders are built once at start (no network, no lazy
 * loading). Large mechanisms get simple primitive colliders; decorative levers,
 * crystals and glow strips are visual-only and never precision colliders.
 */
export interface M2Content {
  /**
   * Dynamic gate registration for integration:
   * - era: 2126
   * - primitive cuboid collider, parentless (no rigid body)
   * - NOT present in Physics' eraByCollider table; movement inclusion is
   *   currently supplied by CausalitySystem.dynamicObstacleFilter via
   *   Player.setExtraObstacleFilter.
   * - Closed gate must be treated as target-era collision by TimeShift and by
   *   protected-mechanism checks; open gate must be non-colliding.
   */
  readonly gateCollider: Collider;
  readonly gateColliderHandle: number;
  readonly gateSlab: THREE.Object3D;
  readonly gateOpenGlow: THREE.Object3D;
  readonly worldCrystal: THREE.Object3D;
  readonly carriedCrystal: THREE.Object3D;
  readonly socketCrystal: THREE.Object3D;
  readonly generatorGlow: THREE.Object3D;
  readonly chamberMarker: THREE.Object3D;
  readonly staticSolids2026: number;
  readonly staticSolids2126: number;
}

export function createM2Content(deps: M2ContentDeps): M2Content {
  const era2026 = deps.eras.get('2026');
  const era2126 = deps.eras.get('2126');
  if (!era2026 || !era2126) {
    throw new Error('M2 content requires both eras to be built first');
  }

  const solids2026: SolidSpec[] = [
    // Generator: large mechanism, not pickable.
    machineBox([1.5, 0.3, 1.5], point(M2_LAYOUT.generator), MACHINE, 0.8, 0.3),
    machineBox([1.05, 1.05, 1.05], [M2_LAYOUT.generator.x, 1.65, 0], MACHINE_LIGHT, 0.65, 0.45),
    machineBox([0.7, 0.12, 0.7], point(M2_LAYOUT.generatorCap), BRASS, 0.5, 0.6),
    // Past mechanical device: large mechanism, not pickable.
    machineBox([0.95, 0.55, 0.7], point(M2_LAYOUT.pastDevice), MACHINE, 0.8, 0.3),
    machineBox([0.5, 0.4, 0.45], point(M2_LAYOUT.pastDeviceTop), MACHINE_LIGHT, 0.7, 0.4),
  ];
  addSolidVisuals(era2026.group, solids2026);
  deps.physics.addSolids('2026', solids2026);

  const solids2126: SolidSpec[] = [
    // Crystal pedestal (the only place the crystal id can be in the world).
    machineBox([0.55, 0.9, 0.55], point(M2_LAYOUT.crystalPedestal), PEDESTAL, 0.9, 0.05),
    { ...machineBox([0.7, 0.08, 0.7], [M2_LAYOUT.crystalPedestal.x, 1.88, 0], PEDESTAL_TRIM, 0.9, 0.05) },
    // Future passage frame + corridor. The moving slab is registered separately.
    machineBox([0.6, 1.9, 0.6], [M2_LAYOUT.gateCenter.x, 1.9, 1.55], GATE_STONE, 0.85, 0.15),
    machineBox([0.6, 1.9, 0.6], [M2_LAYOUT.gateCenter.x, 1.9, -1.55], GATE_STONE, 0.85, 0.15),
    machineBox([0.7, 0.4, 2.4], [M2_LAYOUT.gateCenter.x, 4.2, 0], GATE_STONE, 0.85, 0.15),
    machineBox([3, 1.9, 0.4], [-21, 1.9, 1.6], GATE_STONE, 0.9, 0.1),
    machineBox([3, 1.9, 0.4], [-21, 1.9, -1.6], GATE_STONE, 0.9, 0.1),
    machineBox([0.4, 1.9, 1.6], [-24, 1.9, 0], GATE_STONE, 0.9, 0.1),
    // Chamber marker pedestal behind the passage.
    machineBox([0.4, 0.5, 0.4], point(M2_LAYOUT.chamberMarker), PEDESTAL, 0.85, 0.1),
  ];
  addSolidVisuals(era2126.group, solids2126);
  deps.physics.addSolids('2126', solids2126);

  // Dynamic future gate slab: visual lives in the 2126 group; its primitive
  // collider is owned by M2 because it toggles with the causal state.
  const gateSlabSolid: SolidSpec = {
    kind: 'box',
    halfExtents: GATE_SLAB.halfExtents,
    position: point(GATE_SLAB.center),
    color: GATE_STONE,
    roughness: 0.7,
    metalness: 0.35,
  };
  const gateSlab = createSolidVisual(gateSlabSolid);
  gateSlab.visible = true;
  era2126.group.add(gateSlab);

  const gateCollider = deps.physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(...GATE_SLAB.halfExtents)
      .setTranslation(GATE_SLAB.center.x, GATE_SLAB.center.y, GATE_SLAB.center.z)
      .setFriction(0.9)
      .setRestitution(0),
  );

  const worldCrystal = createCrystalMesh(1);
  worldCrystal.position.set(...point(M2_LAYOUT.crystalWorld));
  era2126.group.add(worldCrystal);

  const socketCrystal = createCrystalMesh(0.85);
  socketCrystal.position.set(...point(M2_LAYOUT.generatorSocket));
  era2026.group.add(socketCrystal);

  const carriedCrystal = createCrystalMesh(0.62);
  carriedCrystal.position.set(0.32, -0.24, -0.6);
  carriedCrystal.rotation.set(0.2, 0.4, 0);
  deps.camera.add(carriedCrystal);

  // Empty socket collar on the generator front.
  decoCylinder(era2026.group, {
    radiusTop: 0.36,
    radiusBottom: 0.36,
    height: 0.18,
    position: [M2_LAYOUT.generatorSocket.x, M2_LAYOUT.generatorSocket.y, 1.05],
    rotation: [Math.PI / 2, 0, 0],
    color: BRASS,
    roughness: 0.45,
    metalness: 0.7,
  });

  // Generator energy ring, visible only when the crystal is socketed.
  const generatorGlow = new THREE.Mesh(
    new THREE.TorusGeometry(1.18, 0.07, 8, 36),
    new THREE.MeshStandardMaterial({
      color: 0x9ff3ff,
      emissive: 0x4fd8f0,
      emissiveIntensity: 1.25,
      roughness: 0.25,
      metalness: 0.4,
    }),
  );
  generatorGlow.position.set(M2_LAYOUT.generator.x, 2.96, 0);
  generatorGlow.rotation.x = Math.PI / 2;
  era2026.group.add(generatorGlow);

  // Past device lever + status lamp (decorative, no collider).
  decoBox(era2026.group, {
    size: [0.12, 1.0, 0.12],
    position: [M2_LAYOUT.pastDeviceTop.x, 2.05, 0],
    rotation: [0, 0, 0.45],
    color: BRASS,
    roughness: 0.5,
    metalness: 0.65,
  });
  decoBox(era2026.group, {
    size: [0.5, 0.24, 0.06],
    position: [M2_LAYOUT.pastDeviceTop.x, 1.55, 0.48],
    color: 0x3f4a44,
    emissive: 0x2f6f72,
    emissiveIntensity: 0.7,
    roughness: 0.6,
    metalness: 0.2,
  });

  // Gate-open glow strips, visible only after the past device is operated.
  const gateOpenGlow = new THREE.Group();
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: 0x8fe8ff,
    emissive: 0x4fd8f0,
    emissiveIntensity: 1.2,
    roughness: 0.3,
    metalness: 0.3,
  });
  for (const z of [1.3, -1.3]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.4, 0.1), glowMaterial);
    strip.position.set(M2_LAYOUT.gateCenter.x, 1.9, z);
    gateOpenGlow.add(strip);
  }
  const topStrip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.4), glowMaterial);
  topStrip.position.set(M2_LAYOUT.gateCenter.x, 3.85, 0);
  gateOpenGlow.add(topStrip);
  era2126.group.add(gateOpenGlow);

  // Marker visible in the chamber once the passage can be entered.
  const chamberMarker = createCrystalMesh(0.8);
  chamberMarker.position.set(...point(M2_LAYOUT.chamberCrystal));
  era2126.group.add(chamberMarker);

  // Initial visibility is owned by CausalitySystem.syncPresentation().
  worldCrystal.visible = false;
  socketCrystal.visible = false;
  carriedCrystal.visible = false;
  generatorGlow.visible = false;
  gateOpenGlow.visible = false;
  gateSlab.visible = true;
  chamberMarker.visible = true;

  return {
    gateCollider,
    gateColliderHandle: gateCollider.handle,
    gateSlab,
    gateOpenGlow,
    worldCrystal,
    carriedCrystal,
    socketCrystal,
    generatorGlow,
    chamberMarker,
    staticSolids2026: solids2026.length,
    staticSolids2126: solids2126.length,
  };
}
