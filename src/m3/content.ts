import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Vec3Tuple } from '../core/types';
import type { Physics } from '../physics/Physics';
import type { Era } from '../world/Era';
import { addSolidVisuals, decoBox, decoPlane, standardMaterial } from '../world/geometry';
import type { EraId, SolidSpec } from '../world/types';
import type { NormalizedAssetStats, NormalizedGameAsset } from '../m2/gameAsset';
import type { GalleryFrameAsset } from '../m2/galleryFrameAsset';
import { galleryFrameOuterForCanvas } from '../m2/galleryFrameGeometry';
import type { GalleryArtworkSet } from './galleryArtwork';
import { GALLERY, STREET, TERMINAL_BARRIER } from './layout';

const GALLERY_WALL = 0x272b31;
const GALLERY_TRIM = 0x9a7a45;
const GALLERY_FLOOR = 0x3a3428;
const STREET_STONE = 0x4b4a45;
const STREET_BUILDING = 0x5a5148;
const TERMINAL_STONE = 0x3a3648;
const ARCHIVE_STONE = 0x353b44;
const TIME_DEVICE_STONE = 0x7a6a45;

const PAINTING_CANVAS_WIDTH = 3.4;
const PAINTING_CANVAS_HEIGHT = 2.2;
const FRAME_BACKING_DEPTH = 0.22;
const FRAME_BACKING_GAP = 0.10;

/**
 * ART-002 is an open, deeply sculpted frame. Measured opening ≈55.5% x 47.7% of
 * the outer size, with its center ~0.109 outer-heights below the model center.
 * The canvases are sized against that real opening (not the outer bbox), and the
 * frame is translated so the opening center aligns with the canvas center. The
 * frame sits behind the canvas, with the carved border visible around it.
 */
function createGalleryFrameBacking(
  asset: GalleryFrameAsset,
  canvasWidth: number,
  canvasHeight: number,
  openingMargin: number,
): THREE.Group {
  const { bounds, appliedHeight } = asset.stats;
  const nativeHeight = Math.max(1e-6, bounds.y);
  const normalizedWidth = (bounds.x / nativeHeight) * appliedHeight;
  const normalizedDepth = (bounds.z / nativeHeight) * appliedHeight;
  const target = galleryFrameOuterForCanvas(canvasWidth, canvasHeight, openingMargin);
  const backing = new THREE.Group();
  backing.name = 'gallery-frame-backing';
  const instance = asset.createInstance(1);
  backing.add(instance);
  backing.scale.set(
    target.outerWidth / Math.max(1e-6, normalizedWidth),
    target.outerHeight / Math.max(1e-6, appliedHeight),
    FRAME_BACKING_DEPTH / Math.max(1e-6, normalizedDepth),
  );
  // Align the true opening center (not the outer bbox center) with the canvas.
  backing.position.y = -target.openingCenterYOffset;
  // Keep the whole frame behind the canvas plane (canvas local z = 0.05).
  backing.position.z = FRAME_BACKING_GAP + FRAME_BACKING_DEPTH / 2;
  return backing;
}

function box(
  halfExtents: Vec3Tuple,
  position: Vec3Tuple,
  color: number,
  roughness = 0.9,
  metalness = 0.05,
): SolidSpec {
  return { kind: 'box', halfExtents, position, color, roughness, metalness };
}

function cylinder(
  radius: number,
  halfHeight: number,
  position: Vec3Tuple,
  color: number,
  roughness = 0.9,
  metalness = 0.05,
): SolidSpec {
  return { kind: 'cylinder', radius, halfHeight, position, color, roughness, metalness };
}

function createPainting(
  title: 'past' | 'future',
  position: Vec3Tuple,
  rotationY: number,
  color: number,
  frameAsset: GalleryFrameAsset | null,
  artworkTexture: THREE.Texture | null,
): THREE.Group {
  const group = new THREE.Group();
  const frameMaterial = standardMaterial({ color: GALLERY_TRIM, roughness: 0.55, metalness: 0.45 });
  const canvasMaterial = new THREE.MeshStandardMaterial({
    color: artworkTexture === null ? color : 0xffffff,
    map: artworkTexture,
    roughness: 0.92,
    metalness: 0.04,
    emissive: artworkTexture === null ? color : 0x000000,
    emissiveIntensity: artworkTexture === null ? 0.18 : 0,
  });
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(PAINTING_CANVAS_WIDTH, PAINTING_CANVAS_HEIGHT),
    canvasMaterial,
  );
  canvas.name = `gallery-canvas-${title}`;
  canvas.position.z = 0.05;
  group.add(canvas);
  if (frameAsset !== null) {
    group.add(createGalleryFrameBacking(frameAsset, PAINTING_CANVAS_WIDTH, PAINTING_CANVAS_HEIGHT, -0.1));
  } else {
    for (const [w, h, y, x] of [
      [3.9, 0.18, 1.28, 0],
      [3.9, 0.18, -1.28, 0],
      [0.18, 2.75, 0, -1.78],
      [0.18, 2.75, 0, 1.78],
    ] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), frameMaterial);
      bar.position.set(x, y, 0);
      group.add(bar);
    }
  }
  group.position.set(...position);
  group.rotation.y = rotationY;
  group.name = `gallery-painting-${title}`;
  return group;
}

/** Minimal brass key stand-in used only if the KEY-001 GLB fails to load. */
function createChronoKeyPlaceholder(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'chrono-key-placeholder';
  const material = new THREE.MeshStandardMaterial({
    color: 0xa88d5a,
    emissive: 0x2a1c08,
    emissiveIntensity: 0.25,
    roughness: 0.5,
    metalness: 0.75,
  });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.32, 0.03), material);
  shaft.position.y = -0.03;
  group.add(shaft);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 20), material);
  bow.position.y = 0.2;
  group.add(bow);
  const toothA = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.028), material);
  toothA.position.set(0.045, -0.17, 0);
  group.add(toothA);
  const toothB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.028), material);
  toothB.position.set(0.025, -0.22, 0);
  group.add(toothB);
  return group;
}

export interface StoryContentDeps {
  readonly eras: ReadonlyMap<EraId, Era>;
  readonly physics: Physics;
  /** Optional preloaded KEY-001 visual used as a static terminal-core detail. */
  readonly chronoKeyAsset?: NormalizedGameAsset | null;
  /** Optional preloaded ART-002 frame used as visual backing on the three paintings. */
  readonly galleryFrameAsset?: GalleryFrameAsset | null;
  /** Optional preloaded temporary painting textures (central canvas stays blank). */
  readonly galleryArtwork?: GalleryArtworkSet | null;
}

export interface StoryContent {
  readonly terminalBarrierCollider: Collider;
  readonly terminalBarrierHandle: number;
  readonly terminalBarrierMesh: THREE.Object3D;
  readonly paintStroke: THREE.Object3D;
  readonly coreCanvasMaterial: THREE.MeshStandardMaterial;
  readonly coreGlowMaterial: THREE.MeshStandardMaterial;
  readonly archiveGlyphMaterial: THREE.MeshStandardMaterial;
  readonly timeDeviceMesh: THREE.Object3D;
  /** Static KEY-001 detail near the terminal core (no interaction, no collider). */
  readonly chronoKeyVisualSource: 'glb' | 'placeholder';
  readonly chronoKeyAssetStats: NormalizedAssetStats | null;
  /** Gallery frame backing source (decor only; canvases stay independent). */
  readonly galleryFrameVisualSource: 'glb' | 'placeholder';
  readonly galleryFrameAssetStats: NormalizedAssetStats | null;
  /** Temporary painting texture source; central blank canvas is never textured. */
  readonly galleryArtwork2026: 'texture' | 'fallback';
  readonly galleryArtwork2126: 'texture' | 'fallback';
  readonly galleryArtworkDiagnostics: readonly string[];
  /** M3-007 street challenge protected barriers. */
  readonly bridgeWallCollider: Collider;
  readonly bridgeWallHandle: number;
  readonly corridorCollapseCollider: Collider;
  readonly corridorCollapseHandle: number;
  readonly staticSolids2026: number;
  readonly staticSolids2126: number;
  setArchiveRead(read: boolean): void;
  setPassageOpen(open: boolean): void;
  setLockdownClosed(closed: boolean): void;
}

export function createStoryContent(deps: StoryContentDeps): StoryContent {
  const era2026 = deps.eras.get('2026');
  const era2126 = deps.eras.get('2126');
  if (!era2026 || !era2126) {
    throw new Error('M3 content requires both eras to be built first');
  }

  const galleryFrameAsset = deps.galleryFrameAsset ?? null;
  const galleryArtwork = deps.galleryArtwork ?? null;

  const galleryX0 = GALLERY.minX;
  const galleryX1 = GALLERY.maxX;
  const galleryZ0 = GALLERY.minZ;
  const galleryZ1 = GALLERY.maxZ;
  const galleryCenterX = (galleryX0 + galleryX1) / 2;
  const galleryCenterZ = (galleryZ0 + galleryZ1) / 2;

  const solids2026: SolidSpec[] = [
    // Grand gallery shell (18 x 16 footprint, 12 high, open street entrance).
    box([0.5, 6, 8], [galleryX0, 6, galleryCenterZ], GALLERY_WALL),
    box([0.5, 6, 8], [galleryX1, 6, galleryCenterZ], GALLERY_WALL),
    box([9.5, 6, 0.5], [galleryCenterX, 6, galleryZ1], GALLERY_WALL),
    box([3.5, 6, 0.5], [47.5, 6, galleryZ0], GALLERY_WALL),
    box([3.5, 6, 0.5], [58.5, 6, galleryZ0], GALLERY_WALL),
    box([2, 4.5, 0.5], [galleryCenterX, 7.5, galleryZ0], GALLERY_WALL),
    box([9.5, 0.35, 8], [galleryCenterX, 12.15, galleryCenterZ], GALLERY_WALL),
    box([9.5, 0.08, 8], [galleryCenterX, 0.08, galleryCenterZ], GALLERY_FLOOR, 0.95, 0.02),
    // Interior colonnade (middle columns removed so painting approaches stay clear).
    cylinder(0.45, 4, [47, 4, 18], GALLERY_TRIM, 0.85, 0.1),
    cylinder(0.45, 4, [47, 4, 26], GALLERY_TRIM, 0.85, 0.1),
    cylinder(0.45, 4, [59, 4, 18], GALLERY_TRIM, 0.85, 0.1),
    cylinder(0.45, 4, [59, 4, 26], GALLERY_TRIM, 0.85, 0.1),
    // M3-007 walkable street and east district.
    box([16, 0.5, 20], [48, -0.5, 10], 0xb7a98d),
    box([0.5, 1.2, 20.5], [64, 1.2, 10], STREET_STONE),
    box([16, 1.2, 0.5], [48, 1.2, -10], STREET_STONE),
    box([16, 1.2, 0.5], [48, 1.2, 30], STREET_STONE),
    // Street lined by real building rows (north side is the gallery for x44..62).
    box([4, 3, 2.5], [36, 3, 5.5], STREET_BUILDING),
    box([4, 4, 2.5], [44, 4, 5.5], STREET_BUILDING),
    box([4, 3, 2.5], [52, 3, 5.5], STREET_BUILDING),
    box([4, 3, 2.5], [60, 3, 5.5], STREET_BUILDING),
    box([4, 3, 2.5], [36, 3, 16.5], STREET_BUILDING),
    box([2, 4, 2.5], [42, 4, 16.5], STREET_BUILDING),
    // Raised bridge platforms + steps (both eras).
    box([1, 0.3, 3], [47, 0.3, 11], STREET_STONE),
    box([1, 0.3, 3], [41, 0.3, 11], STREET_STONE),
    box([0.75, 0.15, 3], [48.75, 0.15, 11], STREET_STONE),
    // 2026 corridor rubble blocks entry/exit; 2126 mid-collapse is a protected dynamic collider.
    box([0.3, 1.5, 3], [40, 1.5, 11], STREET_BUILDING),
    box([0.3, 1.5, 3], [34, 1.5, 11], STREET_BUILDING),
    // Street device pedestal.
    box([0.6, 0.5, 0.6], [STREET.timeDevice.x, 0.5, STREET.timeDevice.z], TIME_DEVICE_STONE),
  ];
  addSolidVisuals(era2026.group, solids2026);
  deps.physics.addSolids('2026', solids2026);

  const solids2126: SolidSpec[] = [
    box([5, 4, 0.5], [26, 4, -25.5], TERMINAL_STONE, 0.92, 0.08),
    box([0.5, 4, 3.5], [21, 4, -22], TERMINAL_STONE, 0.92, 0.08),
    box([0.5, 4, 3.5], [31, 4, -22], TERMINAL_STONE, 0.92, 0.08),
    box([0.3, 0.45, 0.3], [-19.7, 0.45, 0.95], ARCHIVE_STONE, 0.9, 0.1),
    // Ruined gallery counterpart keeps the two eras coordinate-aligned.
    box([0.5, 3, 8], [galleryX0, 3, galleryCenterZ], GALLERY_WALL, 0.98, 0.02),
    box([0.5, 3, 8], [galleryX1, 3, galleryCenterZ], GALLERY_WALL, 0.98, 0.02),
    box([9.5, 3, 0.5], [galleryCenterX, 3, galleryZ1], GALLERY_WALL, 0.98, 0.02),
    box([3.5, 3, 0.5], [47.5, 3, galleryZ0], GALLERY_WALL, 0.98, 0.02),
    box([3.5, 3, 0.5], [58.5, 3, galleryZ0], GALLERY_WALL, 0.98, 0.02),
    box([2, 2.5, 0.5], [galleryCenterX, 5.5, galleryZ0], GALLERY_WALL, 0.98, 0.02),
    // Street counterpart (gallery exists in 2026; this is its ruined forecourt).
    box([16, 0.5, 20], [48, -0.5, 10], 0x474c52),
    box([0.5, 1.2, 20.5], [64, 1.2, 10], STREET_STONE, 0.98, 0.02),
    box([16, 1.2, 0.5], [48, 1.2, -10], STREET_STONE, 0.98, 0.02),
    box([16, 1.2, 0.5], [48, 1.2, 30], STREET_STONE, 0.98, 0.02),
    box([4, 2.6, 2.5], [36, 2.6, 5.5], 0x464a4f),
    box([4, 3.4, 2.5], [44, 3.4, 5.5], 0x3c4045),
    box([4, 2.6, 2.5], [52, 2.6, 5.5], 0x52575c),
    box([4, 2.6, 2.5], [60, 2.6, 5.5], 0x3f4448),
    box([4, 2.6, 2.5], [36, 2.6, 16.5], 0x464a4f),
    box([2, 3.4, 2.5], [42, 3.4, 16.5], 0x3c4045),
    box([1, 0.3, 3], [47, 0.3, 11], STREET_STONE),
    box([1, 0.3, 3], [41, 0.3, 11], STREET_STONE),
    box([0.75, 0.15, 3], [48.75, 0.15, 11], STREET_STONE),
    box([2, 0.3, 3], [44, 0.3, 11], STREET_STONE),
  ];
  addSolidVisuals(era2126.group, solids2126);
  deps.physics.addSolids('2126', solids2126);

  // Gallery floor inlay (decorative, no colliders).
  decoPlane(era2026.group, {
    width: 8,
    height: 12,
    position: [galleryCenterX, 0.17, galleryCenterZ],
    rotation: [-Math.PI / 2, 0, 0],
    color: 0x8a6c45,
    roughness: 0.9,
    metalness: 0.15,
  });

  // Exactly three gallery frames: past painting, future painting, blank canvas.
  era2026.group.add(
    createPainting(
      'past',
      [45.6, 3.2, 22],
      Math.PI / 2,
      0xd6a45e,
      galleryFrameAsset,
      galleryArtwork?.texture2026 ?? null,
    ),
    createPainting(
      'future',
      [60.4, 3.2, 22],
      -Math.PI / 2,
      0x6d7f92,
      galleryFrameAsset,
      galleryArtwork?.texture2126 ?? null,
    ),
  );

  const blankCanvas = new THREE.Mesh(
    new THREE.PlaneGeometry(GALLERY.blankCanvasSize.width, GALLERY.blankCanvasSize.height),
    new THREE.MeshStandardMaterial({ color: 0xf2e8d6, roughness: 0.95, metalness: 0.02 }),
  );
  blankCanvas.position.set(GALLERY.blankCanvas.x, GALLERY.blankCanvas.y, GALLERY.blankCanvas.z);
  blankCanvas.rotation.y = Math.PI;
  era2026.group.add(blankCanvas);
  if (galleryFrameAsset !== null) {
    // Parent wrapper owns the world position/rotation; the backing keeps its own
    // opening-center and depth offsets (never overwrite them with position.set).
    const blankFrameParent = new THREE.Group();
    blankFrameParent.name = 'blank-canvas-frame';
    blankFrameParent.position.set(
      GALLERY.blankCanvas.x,
      GALLERY.blankCanvas.y,
      GALLERY.blankCanvas.z,
    );
    blankFrameParent.rotation.y = Math.PI;
    blankFrameParent.add(createGalleryFrameBacking(
      galleryFrameAsset,
      GALLERY.blankCanvasSize.width,
      GALLERY.blankCanvasSize.height,
      GALLERY.blankCanvasOpeningMargin,
    ));
    era2026.group.add(blankFrameParent);
  }

  const paintStroke = new THREE.Group();
  [0xc84f4f, 0xd9a441, 0x4fa3a8].forEach((color, index) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.2 - index * 0.25, 0.2, 0.04),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.6,
        metalness: 0.1,
      }),
    );
    mesh.position.set(index * 0.42 - 0.3, index * 0.34 - 0.28, 0);
    mesh.rotation.z = 0.3 - index * 0.16;
    paintStroke.add(mesh);
  });
  paintStroke.position.set(GALLERY.paintStroke.x, GALLERY.paintStroke.y, GALLERY.paintStroke.z);
  paintStroke.visible = false;
  era2026.group.add(paintStroke);

  // Gallery lighting: warm painterly pools under a high vault.
  for (const z of [18, 22, 26]) {
    const light = new THREE.PointLight(0xffd9a0, 5.5, 22, 2);
    light.position.set(galleryCenterX, 8.5, z);
    era2026.group.add(light);
  }
  const galleryFill = new THREE.PointLight(0xffe7c4, 3, 26, 2);
  galleryFill.position.set(galleryCenterX, 6, galleryCenterZ);
  era2026.group.add(galleryFill);

  // Street lamps, gateway arch and city-core landmark.
  for (let index = 0; index < 10; index += 1) {
    const x = 36 + (index % 5) * 6;
    const z = index < 5 ? 8.2 : 13.8;
    decoBox(era2026.group, {
      size: [0.16, 2.6, 0.16],
      position: [x, 1.3, z],
      color: 0x6f5a3d,
      emissive: 0xffd7a0,
      emissiveIntensity: 0.35,
      roughness: 0.6,
      metalness: 0.2,
    });
    decoBox(era2126.group, {
      size: [0.16, 2.2, 0.16],
      position: [x, 1.1, z],
      color: 0x3f4448,
      emissive: 0x6c8fa8,
      emissiveIntensity: 0.25,
      roughness: 0.7,
      metalness: 0.1,
    });
  }
  for (const group of [era2026.group, era2126.group]) {
    decoBox(group, {
      size: [1.2, 3.2, 1.2],
      position: [32, 1.6, 8],
      color: 0x8a6c45,
      roughness: 0.6,
      metalness: 0.3,
    });
    decoBox(group, {
      size: [1.2, 3.2, 1.2],
      position: [32, 1.6, 14],
      color: 0x8a6c45,
      roughness: 0.6,
      metalness: 0.3,
    });
    decoBox(group, {
      size: [1.2, 0.5, 7.2],
      position: [32, 3.2, 11],
      color: 0x9d7f58,
      roughness: 0.6,
      metalness: 0.3,
    });
  }
  // City core landmark visible from the street gateway.
  for (const group of [era2026.group, era2126.group]) {
    const beacon = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.12, 8, 32),
      new THREE.MeshStandardMaterial({
        color: 0x9fe8ff,
        emissive: 0x3fb6d8,
        emissiveIntensity: 0.8,
        roughness: 0.35,
        metalness: 0.2,
      }),
    );
    beacon.position.set(18, 3.2, 8);
    beacon.rotation.y = Math.PI / 2;
    group.add(beacon);
  }

  // Time-folding device glow.
  const timeDeviceMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fe8ff,
    emissive: 0x3fb6d8,
    emissiveIntensity: 0.9,
    roughness: 0.35,
    metalness: 0.3,
  });
  const timeDeviceMesh = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 28), timeDeviceMaterial);
  timeDeviceMesh.position.set(STREET.timeDevice.x, 1.15, STREET.timeDevice.z);
  era2026.group.add(timeDeviceMesh);
  // Clear, simple street marker so the device is visible and reachable.
  decoBox(era2026.group, {
    size: [0.1, 2.6, 0.1],
    position: [STREET.timeDevice.x, 2.2, STREET.timeDevice.z],
    color: 0x9fe8ff,
    emissive: 0x3fb6d8,
    emissiveIntensity: 1.1,
    roughness: 0.3,
    metalness: 0.3,
  });
  const deviceLight = new THREE.PointLight(0x9fe8ff, 3, 14, 2);
  deviceLight.position.set(STREET.timeDevice.x, 2.4, STREET.timeDevice.z);
  era2026.group.add(deviceLight);

  // Bridge readability: launch strip, future-bridge ghost, rails and barriers.
  decoBox(era2026.group, {
    size: [0.3, 0.05, 5.8],
    position: [46.2, 0.64, 11],
    color: 0x8fe8ff,
    emissive: 0x3fb6d8,
    emissiveIntensity: 1.0,
    roughness: 0.3,
    metalness: 0.3,
  });
  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: 0x8fe8ff,
    emissive: 0x3fb6d8,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.2,
    roughness: 0.4,
    metalness: 0.1,
    depthWrite: false,
  });
  const bridgeGhost = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 5.6), ghostMaterial);
  bridgeGhost.position.set(44, 0.66, 11);
  era2026.group.add(bridgeGhost);
  decoBox(era2126.group, {
    size: [4.2, 0.06, 0.16],
    position: [44, 0.68, 8.2],
    color: 0x9fe8ff,
    emissive: 0x4fd8f0,
    emissiveIntensity: 1.1,
    roughness: 0.3,
    metalness: 0.3,
  });
  decoBox(era2126.group, {
    size: [4.2, 0.06, 0.16],
    position: [44, 0.68, 13.8],
    color: 0x9fe8ff,
    emissive: 0x4fd8f0,
    emissiveIntensity: 1.1,
    roughness: 0.3,
    metalness: 0.3,
  });
  const bridgeWallMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2, 6),
    new THREE.MeshStandardMaterial({
      color: 0x3b4046,
      emissive: 0x201a14,
      emissiveIntensity: 0.3,
      roughness: 0.9,
      metalness: 0.05,
    }),
  );
  bridgeWallMesh.position.set(STREET.bridge.wallX, 1, 11);
  era2126.group.add(bridgeWallMesh);
  const corridorCollapseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 3, 6),
    bridgeWallMesh.material.clone(),
  );
  corridorCollapseMesh.position.set(STREET.corridor.midX, 1.5, 11);
  era2126.group.add(corridorCollapseMesh);

  const bridgeWallCollider = deps.physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.25, 1, 3)
      .setTranslation(STREET.bridge.wallX, 1, 11)
      .setFriction(0.9)
      .setRestitution(0),
  );
  const corridorCollapseCollider = deps.physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.3, 1.5, 3)
      .setTranslation(STREET.corridor.midX, 1.5, 11)
      .setFriction(0.9)
      .setRestitution(0),
  );

  // Terminal core room (2126) remains the next-location set piece.
  const terminalLight = new THREE.PointLight(0x8a6bff, 6, 22, 2);
  terminalLight.position.set(26, 5, -22);
  era2126.group.add(terminalLight);

  const passageBeaconMaterial = new THREE.MeshStandardMaterial({
    color: 0x8fe8ff,
    emissive: 0x3fb6d8,
    emissiveIntensity: 0.9,
    roughness: 0.35,
    metalness: 0.25,
  });
  const passageBeacon = new THREE.Group();
  const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 8, 28), passageBeaconMaterial);
  beaconRing.position.set(-16.6, 2.2, 0);
  passageBeacon.add(beaconRing);
  era2126.group.add(passageBeacon);
  const passageLight = new THREE.PointLight(0x8fe8ff, 2.2, 18, 2);
  passageLight.position.set(-19.5, 2.6, 0);
  era2126.group.add(passageLight);

  decoBox(era2126.group, {
    size: [0.55, 1.5, 0.26],
    position: [-19.7, 1.35, 0.95],
    color: ARCHIVE_STONE,
    roughness: 0.75,
    metalness: 0.2,
  });

  const coreCanvasMaterial = new THREE.MeshStandardMaterial({
    color: 0x211d33,
    emissive: 0x5a3f9a,
    emissiveIntensity: 0.75,
    roughness: 0.92,
    metalness: 0.05,
  });
  const coreCanvas = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), coreCanvasMaterial);
  coreCanvas.position.set(26, 4.2, -24.9);
  era2126.group.add(coreCanvas);
  for (const bar of [
    { size: [8.8, 0.22, 0.16] as Vec3Tuple, position: [26, 6.8, -24.8] as Vec3Tuple },
    { size: [8.8, 0.22, 0.16] as Vec3Tuple, position: [26, 1.6, -24.8] as Vec3Tuple },
    { size: [0.22, 5.4, 0.16] as Vec3Tuple, position: [21.6, 4.2, -24.8] as Vec3Tuple },
    { size: [0.22, 5.4, 0.16] as Vec3Tuple, position: [30.4, 4.2, -24.8] as Vec3Tuple },
  ]) {
    decoBox(era2126.group, {
      size: bar.size,
      position: bar.position,
      color: GALLERY_TRIM,
      roughness: 0.55,
      metalness: 0.45,
    });
  }
  const coreGlowMaterial = new THREE.MeshStandardMaterial({
    color: 0xa98bff,
    emissive: 0x6a4fd8,
    emissiveIntensity: 0.9,
    roughness: 0.35,
    metalness: 0.2,
  });
  const coreGlow = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.08, 8, 40), coreGlowMaterial);
  coreGlow.position.set(26, 4.2, -24.6);
  era2126.group.add(coreGlow);

  // KEY-001 static visual detail beside the terminal core. This replaces no
  // gameplay entity: no pickup, no consumption, no interaction, no collider.
  const chronoKeyAsset = deps.chronoKeyAsset ?? null;
  const chronoKeyGroup = new THREE.Group();
  chronoKeyGroup.name = 'chrono-key-detail';
  chronoKeyGroup.position.set(26, 1.16, -23.15);
  chronoKeyGroup.rotation.z = 0.08;
  chronoKeyGroup.add(
    chronoKeyAsset !== null
      ? chronoKeyAsset.createInstance(1)
      : createChronoKeyPlaceholder(),
  );
  era2126.group.add(chronoKeyGroup);
  decoBox(era2126.group, {
    size: [0.55, 0.9, 0.45],
    position: [26, 0.45, -23.2],
    color: 0x2b2633,
    roughness: 0.8,
    metalness: 0.2,
  });

  const barrierMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d7bff,
    emissive: 0x6a4fd8,
    emissiveIntensity: 1.1,
    transparent: true,
    opacity: 0.45,
    roughness: 0.4,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const terminalBarrierMesh = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.6), barrierMaterial);
  terminalBarrierMesh.position.set(26, 1.8, -18.85);
  era2126.group.add(terminalBarrierMesh);

  const archiveGlyphMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fe8ff,
    emissive: 0x3fb6d8,
    emissiveIntensity: 0.55,
    roughness: 0.4,
    metalness: 0.1,
  });

  const terminalBarrierCollider = deps.physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(...TERMINAL_BARRIER.halfExtents)
      .setTranslation(TERMINAL_BARRIER.center.x, TERMINAL_BARRIER.center.y, TERMINAL_BARRIER.center.z)
      .setFriction(0.9)
      .setRestitution(0),
  );

  let archiveReadState = false;
  let lockdownClosedState = false;

  function applyCoreVisuals(): void {
    if (!archiveReadState) {
      coreCanvasMaterial.color.setHex(0x211d33);
      coreCanvasMaterial.emissive.setHex(0x2a2a3a);
      coreCanvasMaterial.emissiveIntensity = 0.18;
      coreGlowMaterial.emissiveIntensity = 0.18;
      terminalLight.intensity = 1.0;
      archiveGlyphMaterial.emissiveIntensity = 0.55;
    } else if (lockdownClosedState) {
      coreCanvasMaterial.color.setHex(0x2a2f3f);
      coreCanvasMaterial.emissive.setHex(0x4f7f9a);
      coreCanvasMaterial.emissiveIntensity = 0.5;
      coreGlowMaterial.color.setHex(0x9fe8ff);
      coreGlowMaterial.emissive.setHex(0x4fd8f0);
      coreGlowMaterial.emissiveIntensity = 0.9;
      terminalLight.intensity = 6;
      archiveGlyphMaterial.emissiveIntensity = 0.9;
    } else {
      coreCanvasMaterial.color.setHex(0x211d33);
      coreCanvasMaterial.emissive.setHex(0x5a3f9a);
      coreCanvasMaterial.emissiveIntensity = 0.75;
      coreGlowMaterial.color.setHex(0xa98bff);
      coreGlowMaterial.emissive.setHex(0x6a4fd8);
      coreGlowMaterial.emissiveIntensity = 0.9;
      terminalLight.intensity = 6;
      archiveGlyphMaterial.emissiveIntensity = 0.55;
    }
    coreCanvasMaterial.needsUpdate = true;
    coreGlowMaterial.needsUpdate = true;
    archiveGlyphMaterial.needsUpdate = true;
  }

  function setArchiveRead(read: boolean): void {
    archiveReadState = read;
    applyCoreVisuals();
  }

  function setLockdownClosed(closed: boolean): void {
    lockdownClosedState = closed;
    applyCoreVisuals();
  }

  function setPassageOpen(open: boolean): void {
    passageBeaconMaterial.emissiveIntensity = open ? 1.8 : 0.65;
    passageBeaconMaterial.needsUpdate = true;
    passageLight.intensity = open ? 4.5 : 1.4;
  }

  return {
    terminalBarrierCollider,
    terminalBarrierHandle: terminalBarrierCollider.handle,
    terminalBarrierMesh,
    paintStroke,
    coreCanvasMaterial,
    coreGlowMaterial,
    archiveGlyphMaterial,
    timeDeviceMesh,
    chronoKeyVisualSource: chronoKeyAsset !== null ? 'glb' : 'placeholder',
    chronoKeyAssetStats: chronoKeyAsset?.stats ?? null,
    galleryFrameVisualSource: galleryFrameAsset !== null ? 'glb' : 'placeholder',
    galleryFrameAssetStats: galleryFrameAsset?.stats ?? null,
    galleryArtwork2026: galleryArtwork?.texture2026 ? 'texture' : 'fallback',
    galleryArtwork2126: galleryArtwork?.texture2126 ? 'texture' : 'fallback',
    galleryArtworkDiagnostics: galleryArtwork?.diagnostics ?? [],
    bridgeWallCollider,
    bridgeWallHandle: bridgeWallCollider.handle,
    corridorCollapseCollider,
    corridorCollapseHandle: corridorCollapseCollider.handle,
    staticSolids2026: solids2026.length,
    staticSolids2126: solids2126.length,
    setArchiveRead,
    setPassageOpen,
    setLockdownClosed,
  };
}
