import * as THREE from 'three';
import {
  preloadNormalizedGameAsset,
  type NormalizedAssetStats,
  type NormalizedGameAsset,
} from './gameAsset';

/**
 * Lightweight local copy of ART-002 gallery frame. The 51MB / ~1.97M-triangle
 * source is never loaded at runtime; `public/assets/art002-gallery-frame-game.glb`
 * is the offline-optimized copy (meshoptimizer + 1K textures).
 */
export const GALLERY_FRAME_ASSET_URL = `${import.meta.env.BASE_URL}assets/art002-gallery-frame-game.glb`;

/** Normalized template height; assembly applies per-painting outer dimensions. */
const TARGET_HEIGHT = 1.0;
const diagnosticsLog: string[] = [];

export type GalleryFrameAssetStats = NormalizedAssetStats;
export type GalleryFrameAsset = NormalizedGameAsset;

// Opening measurements live in a pure geometry module so tests can import them
// without the loader's import.meta/BASE_URL environment.
export {
  GALLERY_FRAME_OPENING,
  galleryFrameOuterForCanvas,
  type GalleryFrameOuterSize,
} from './galleryFrameGeometry';

export function galleryFrameAssetDiagnostics(): readonly string[] {
  return diagnosticsLog;
}

export function preloadGalleryFrame(url: string = GALLERY_FRAME_ASSET_URL): Promise<GalleryFrameAsset | null> {
  return preloadNormalizedGameAsset({
    url,
    targetHeight: TARGET_HEIGHT,
    diagnosticLabel: 'gallery frame',
    templateName: 'gallery-frame-template',
    consoleTag: '[ART-002]',
    onDiagnostic: (message) => diagnosticsLog.push(message),
    // The optimized frame is open/thin; render it from both sides so mounting
    // behind a canvas cannot accidentally hide the border from oblique views.
    tweakMaterial: (material) => {
      material.side = THREE.DoubleSide;
      material.envMapIntensity = 0.8;
      material.needsUpdate = true;
    },
  });
}
