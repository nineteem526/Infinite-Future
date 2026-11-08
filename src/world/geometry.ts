import * as THREE from 'three';
import type { Vec3Tuple } from '../core/types';
import type { MaterialLook, SolidSpec } from './types';

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

/** Materials are cached per look so hundreds of simple solids stay cheap. */
export function standardMaterial(look: MaterialLook): THREE.MeshStandardMaterial {
  const key = [
    look.color,
    look.roughness ?? 0.85,
    look.metalness ?? 0.05,
    look.emissive ?? 0,
    look.emissiveIntensity ?? 1,
    look.opacity ?? 1,
  ].join('|');

  const cached = materialCache.get(key);
  if (cached) return cached;

  const material = new THREE.MeshStandardMaterial({
    color: look.color,
    roughness: look.roughness ?? 0.85,
    metalness: look.metalness ?? 0.05,
    emissive: look.emissive ?? 0x000000,
    emissiveIntensity: look.emissiveIntensity ?? 1,
    transparent: (look.opacity ?? 1) < 1,
    opacity: look.opacity ?? 1,
    depthWrite: (look.opacity ?? 1) >= 1,
  });
  materialCache.set(key, material);
  return material;
}

function geometryFor(solid: SolidSpec): THREE.BufferGeometry {
  switch (solid.kind) {
    case 'box': {
      const [hx, hy, hz] = solid.halfExtents;
      return new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
    }
    case 'cylinder':
      return new THREE.CylinderGeometry(solid.radius, solid.radius, solid.halfHeight * 2, 24);
    case 'capsule':
      return new THREE.CapsuleGeometry(solid.radius, solid.halfHeight * 2, 6, 14);
  }
}

/** Builds the primitive visuals that mirror the registered structural colliders. */
export function addSolidVisuals(group: THREE.Group, solids: readonly SolidSpec[]): void {
  for (const solid of solids) {
    const mesh = new THREE.Mesh(geometryFor(solid), standardMaterial(solid));
    mesh.position.set(...solid.position);
    if (solid.rotation) mesh.rotation.set(...solid.rotation);
    mesh.castShadow = solid.castShadow ?? true;
    mesh.receiveShadow = solid.receiveShadow ?? true;
    mesh.name = `solid-${solid.kind}`;
    group.add(mesh);
  }
}

interface DecorationBase extends MaterialLook {
  position: Vec3Tuple;
  /** Euler XYZ rotation in radians. */
  rotation?: Vec3Tuple;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface BoxDecoration extends DecorationBase {
  size: Vec3Tuple;
}

export interface CylinderDecoration extends DecorationBase {
  radiusTop?: number;
  radiusBottom?: number;
  height: number;
  radialSegments?: number;
}

export interface PlaneDecoration extends DecorationBase {
  width: number;
  height: number;
}

export interface RingDecoration extends DecorationBase {
  innerRadius: number;
  outerRadius: number;
  segments?: number;
}

function attach(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  look: MaterialLook,
  options: DecorationBase,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, standardMaterial(look));
  mesh.position.set(...options.position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.castShadow ?? false;
  mesh.receiveShadow = options.receiveShadow ?? true;
  group.add(mesh);
  return mesh;
}

/** Decorative, non-colliding dressing. */
export function decoBox(group: THREE.Group, options: BoxDecoration): THREE.Mesh {
  const [w, h, d] = options.size;
  return attach(group, new THREE.BoxGeometry(w, h, d), options, options);
}

export function decoCylinder(group: THREE.Group, options: CylinderDecoration): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(
    options.radiusTop ?? options.radiusBottom ?? 1,
    options.radiusBottom ?? options.radiusTop ?? 1,
    options.height,
    options.radialSegments ?? 20,
  );
  return attach(group, geometry, options, options);
}

export function decoPlane(group: THREE.Group, options: PlaneDecoration): THREE.Mesh {
  return attach(group, new THREE.PlaneGeometry(options.width, options.height), options, options);
}

export function decoRing(group: THREE.Group, options: RingDecoration): THREE.Mesh {
  const geometry = new THREE.RingGeometry(
    options.innerRadius,
    options.outerRadius,
    options.segments ?? 48,
  );
  return attach(group, geometry, options, options);
}
