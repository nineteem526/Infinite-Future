import {
  preloadNormalizedGameAsset,
  type NormalizedAssetStats,
  type NormalizedGameAsset,
} from './gameAsset';

/**
 * Locally preloaded game copy of ART-003 energy crystal.
 *
 * The original 49.7MB / ~1.98M-triangle / 2x8K asset is never loaded at runtime.
 * `public/assets/art003-energy-crystal-game.glb` is the offline-optimized copy
 * (meshoptimizer decimation + Pillow 1K textures; see src/dev/art003_optimize.mjs).
 * Loading happens once at startup; era switching never requests or reloads.
 */
export const CRYSTAL_ASSET_URL = `${import.meta.env.BASE_URL}assets/art003-energy-crystal-game.glb`;

const TARGET_HEIGHT = 0.52;

export type CrystalAssetStats = NormalizedAssetStats;
export type CrystalAsset = NormalizedGameAsset;

const diagnosticsLog: string[] = [];

export function crystalAssetDiagnostics(): readonly string[] {
  return diagnosticsLog;
}

/** Loads (once) the optimized crystal. Failures return null and log diagnostics. */
export function preloadEnergyCrystal(url: string = CRYSTAL_ASSET_URL): Promise<CrystalAsset | null> {
  return preloadNormalizedGameAsset({
    url,
    targetHeight: TARGET_HEIGHT,
    diagnosticLabel: 'energy crystal',
    templateName: 'crystal-template',
    consoleTag: '[ART-003]',
    onDiagnostic: (message) => diagnosticsLog.push(message),
  });
}
