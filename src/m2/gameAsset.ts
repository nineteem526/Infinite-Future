import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Minimal reusable local GLB preload + normalization helper.
 *
 * Assets are loaded once during startup, cached by URL + target height, cloned
 * into static containers, and never requested on era switches or per frame.
 * Failure returns null so callers can keep their existing placeholder visuals.
 */
export interface NormalizedAssetStats {
  readonly source: string;
  readonly triangles: number;
  readonly meshes: number;
  readonly materials: number;
  readonly textures: number;
  readonly appliedHeight: number;
  readonly bounds: { x: number; y: number; z: number };
}

export interface NormalizedGameAsset {
  readonly stats: NormalizedAssetStats;
  /** Clone of the normalized template; geometry/material resources are shared. */
  createInstance(scale: number): THREE.Object3D;
}

export interface NormalizedAssetOptions {
  readonly url: string;
  readonly targetHeight: number;
  readonly diagnosticLabel: string;
  readonly templateName: string;
  readonly consoleTag: string;
  readonly onDiagnostic?: (message: string) => void;
  readonly tweakMaterial?: (material: THREE.MeshStandardMaterial) => void;
}

const cache = new Map<string, Promise<NormalizedGameAsset | null>>();

export function preloadNormalizedGameAsset(
  options: NormalizedAssetOptions,
): Promise<NormalizedGameAsset | null> {
  const key = `${options.url}|${options.targetHeight}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = loadNormalizedAsset(options);
    cache.set(key, promise);
  }
  return promise;
}

async function loadNormalizedAsset(
  options: NormalizedAssetOptions,
): Promise<NormalizedGameAsset | null> {
  const diagnostic = (message: string): void => {
    options.onDiagnostic?.(message);
  };
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(options.url);
    const scene = gltf.scene;

    let triangles = 0;
    let meshes = 0;
    const materials = new Set<THREE.Material>();
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      meshes += 1;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const indexCount = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
      triangles += Math.floor(indexCount / 3);
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const entry of material) {
          materials.add(entry);
          if (entry instanceof THREE.MeshStandardMaterial) options.tweakMaterial?.(entry);
        }
      } else {
        materials.add(material);
        if (material instanceof THREE.MeshStandardMaterial) options.tweakMaterial?.(material);
      }
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });

    const bounds = new THREE.Box3().setFromObject(scene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 1e-6) {
      throw new Error(`invalid ${options.diagnosticLabel} bounds`);
    }

    const normalized = new THREE.Group();
    normalized.name = options.templateName;
    scene.position.set(-center.x, -center.y, -center.z);
    normalized.add(scene);
    normalized.scale.setScalar(options.targetHeight / size.y);

    let textures = 0;
    for (const material of materials) {
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.map) textures += 1;
      if (standard.metalnessMap) textures += 1;
      if (standard.roughnessMap) textures += 1;
      if (standard.normalMap) textures += 1;
      if (standard.emissiveMap) textures += 1;
      standard.needsUpdate = true;
    }

    const stats: NormalizedAssetStats = {
      source: options.url,
      triangles,
      meshes,
      materials: materials.size,
      textures,
      appliedHeight: options.targetHeight,
      bounds: { x: size.x, y: size.y, z: size.z },
    };
    diagnostic(
      `${options.diagnosticLabel} GLB loaded: ${triangles} tris, ${meshes} meshes, ${materials.size} materials, ${textures} textures, native ${size.x.toFixed(3)}x${size.y.toFixed(3)}x${size.z.toFixed(3)}, normalized height ${options.targetHeight}`,
    );

    return {
      stats,
      createInstance(scale: number): THREE.Object3D {
        const instance = normalized.clone(true);
        instance.scale.multiplyScalar(scale);
        return instance;
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostic(`${options.diagnosticLabel} GLB unavailable, using placeholder: ${message}`);
    console.warn(`${options.consoleTag} ${options.diagnosticLabel} GLB unavailable; placeholder retained.`, error);
    return null;
  }
}
