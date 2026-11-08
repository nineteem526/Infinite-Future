/**
 * Pure measured geometry for the ART-002 frame opening. Kept separate from the
 * GLB loader so headless tests can validate fit without browser/import.meta
 * environment access.
 */
export const GALLERY_FRAME_OPENING = {
  widthRatio: 0.5547,
  heightRatio: 0.4766,
  /** Opening center Y offset from the outer-bbox center, in model-height units. */
  centerYOffset: -0.1094,
} as const;

export interface GalleryFrameOuterSize {
  readonly outerWidth: number;
  readonly outerHeight: number;
  readonly openingWidth: number;
  readonly openingHeight: number;
  readonly openingCenterYOffset: number;
}

/** Frame outer size required to contain a canvas + margin in the real opening. */
export function galleryFrameOuterForCanvas(
  canvasWidth: number,
  canvasHeight: number,
  openingMargin: number,
): GalleryFrameOuterSize {
  const openingWidth = canvasWidth + openingMargin;
  const openingHeight = canvasHeight + openingMargin;
  const outerHeight = openingHeight / GALLERY_FRAME_OPENING.heightRatio;
  return {
    outerWidth: openingWidth / GALLERY_FRAME_OPENING.widthRatio,
    outerHeight,
    openingWidth,
    openingHeight,
    openingCenterYOffset: GALLERY_FRAME_OPENING.centerYOffset * outerHeight,
  };
}
