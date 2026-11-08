import * as THREE from 'three';

/**
 * Temporary gallery painting textures, preloaded once at startup. The source
 * PNGs live in art-pipeline and are never modified; the local JPEG copies are
 * center-cropped to the 3.4:2.2 canvas aspect and tagged sRGB.
 */
export const GALLERY_ARTWORK_URLS = {
  '2026': `${import.meta.env.BASE_URL}assets/gallery-art-2026.jpg`,
  '2126': `${import.meta.env.BASE_URL}assets/gallery-art-2126.jpg`,
} as const;

export interface GalleryArtworkSet {
  readonly texture2026: THREE.Texture | null;
  readonly texture2126: THREE.Texture | null;
  readonly diagnostics: readonly string[];
}

let cache: Promise<GalleryArtworkSet> | null = null;

export function preloadGalleryArtwork(): Promise<GalleryArtworkSet> {
  if (cache === null) cache = loadGalleryArtwork();
  return cache;
}

async function loadGalleryArtwork(): Promise<GalleryArtworkSet> {
  const diagnostics: string[] = [];
  const loader = new THREE.TextureLoader();
  const loadOne = async (label: string, url: string): Promise<THREE.Texture | null> => {
    try {
      const texture = await loader.loadAsync(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      diagnostics.push(`gallery artwork ${label} loaded: ${url}`);
      return texture;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(`gallery artwork ${label} unavailable, solid fallback: ${message}`);
      console.warn(`[ART-002] gallery artwork ${label} unavailable; solid fallback retained.`, error);
      return null;
    }
  };

  const [texture2026, texture2126] = await Promise.all([
    loadOne('2026', GALLERY_ARTWORK_URLS['2026']),
    loadOne('2126', GALLERY_ARTWORK_URLS['2126']),
  ]);
  return { texture2026, texture2126, diagnostics };
}
