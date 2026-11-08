import {
  preloadNormalizedGameAsset,
  type NormalizedAssetStats,
  type NormalizedGameAsset,
} from './gameAsset';

/**
 * Existing lightweight Chrono Key model (KEY-001) as a static terminal-core
 * detail. No pickup/consumption/puzzle/collider; the original file is untouched.
 */
export const CHRONO_KEY_ASSET_URL = `${import.meta.env.BASE_URL}assets/chrono-key-game.glb`;

const TARGET_HEIGHT = 0.52;
const diagnosticsLog: string[] = [];

export type ChronoKeyAssetStats = NormalizedAssetStats;
export type ChronoKeyAsset = NormalizedGameAsset;

export function chronoKeyAssetDiagnostics(): readonly string[] {
  return diagnosticsLog;
}

export function preloadChronoKey(url: string = CHRONO_KEY_ASSET_URL): Promise<ChronoKeyAsset | null> {
  return preloadNormalizedGameAsset({
    url,
    targetHeight: TARGET_HEIGHT,
    diagnosticLabel: 'chrono key',
    templateName: 'chrono-key-template',
    consoleTag: '[KEY-001]',
    onDiagnostic: (message) => diagnosticsLog.push(message),
    // Keep the source PBR maps; soften the baked normal so the small key reads
    // cleanly under the terminal's violet lighting.
    tweakMaterial: (material) => {
      if (material.normalMap) material.normalScale.setScalar(0.85);
      material.envMapIntensity = 0.6;
      material.needsUpdate = true;
    },
  });
}
