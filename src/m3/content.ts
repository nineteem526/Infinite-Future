import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Vec3Tuple } from '../core/types';
import type { Physics } from '../physics/Physics';
import type { Era } from '../world/Era';
import {
  addSolidVisuals,
  createSolidVisual,
  decoBox,
  standardMaterial,
} from '../world/geometry';
import type { EraId, SolidSpec } from '../world/types';
import { GALLERY, GALLERY_DOOR, STORY_LAYOUT, TERMINAL_BARRIER } from './layout';
import type { PaintingId } from './types';

const GALLERY_WALL = 0x2f343b;
const GALLERY_TRIM = 0x8a6c45;
const GALLERY_FLOOR_TRIM = 0x6d5637;
const TERMINAL_STONE = 0x3a3648;
const ARCHIVE_STONE = 0x353b44;

const PAINTING_COLORS: Readonly<Record<PaintingId, number>> = {
  'painting-2026': 0xd6a45e,
  'painting-2126': 0x6d7f92,
  'painting-gallery': 0x3f5c63,
};

function box(
  halfExtents: Vec3Tuple,
  position: Vec3Tuple,
  color: number,
  roughness = 0.9,
  metalness = 0.05,
): SolidSpec {
  return { kind: 'box', halfExtents, position, color, roughness, metalness };
}

function createPainting(paintingId: PaintingId, position: Vec3Tuple, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  const frameMaterial = standardMaterial({ color: GALLERY_TRIM, roughness: 0.55, metalness: 0.45 });
  const canvasMaterial = new THREE.MeshStandardMaterial({
    color: PAINTING_COLORS[paintingId],
    roughness: 0.92,
    metalness: 0.04,
    emissive: PAINTING_COLORS[paintingId],
    emissiveIntensity: 0.16,
  });

  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.4), canvasMaterial);
  canvas.position.z = 0.04;
  group.add(canvas);

  const bars: Array<{ size: [number, number, number]; y: number }> = [
    { size: [2.4, 0.12, 0.12], y: 0.76 },
    { size: [2.4, 0.12, 0.12], y: -0.76 },
    { size: [0.12, 1.64, 0.12], y: 0 },
  ];
  for (const bar of bars) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...bar.size), frameMaterial);
    mesh.position.y = bar.y;
    group.add(mesh);
  }
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.64, 0.12), frameMaterial);
    mesh.position.x = side * 1.26;
    group.add(mesh);
  }

  group.position.set(position[0], position[1], position[2]);
  group.rotation.y = rotationY;
  return group;
}

export interface StoryContentDeps {
  readonly eras: ReadonlyMap<EraId, Era>;
  readonly physics: Physics;
}

export interface StoryContent {
  readonly galleryDoorCollider: Collider;
  readonly galleryDoorHandle: number;
  readonly galleryDoorCanvas: THREE.Object3D;
  readonly terminalBarrierCollider: Collider;
  readonly terminalBarrierHandle: number;
  readonly terminalBarrierMesh: THREE.Object3D;
  readonly paintStroke: THREE.Object3D;
  readonly coreCanvasMaterial: THREE.MeshStandardMaterial;
  readonly coreGlowMaterial: THREE.MeshStandardMaterial;
  readonly archiveGlyphMaterial: THREE.MeshStandardMaterial;
  readonly staticSolids2026: number;
  readonly staticSolids2126: number;
  setLockdownClosed(closed: boolean): void;
}

export function createStoryContent(deps: StoryContentDeps): StoryContent {
  const era2026 = deps.eras.get('2026');
  const era2126 = deps.eras.get('2126');
  if (!era2026 || !era2126) {
    throw new Error('M3 content requires both eras to be built first');
  }

  const solids2026: SolidSpec[] = [
    box([0.3, 3, 3.6], [GALLERY.westWallX, 3, GALLERY.centerZ], GALLERY_WALL),
    box([0.3, 3, 3.6], [GALLERY.eastWallX, 3, GALLERY.centerZ], GALLERY_WALL),
    box([GALLERY.halfWidth + 0.3, 3, 0.3], [0, 3, GALLERY.backWallZ], GALLERY_WALL),
    box([3, 3, 0.3], [-5, 3, GALLERY.doorZ], GALLERY_WALL),
    box([3, 3, 0.3], [5, 3, GALLERY.doorZ], GALLERY_WALL),
    box([2.3, 1.5, 0.3], [0, 4.5, GALLERY.doorZ], GALLERY_WALL),
    box([GALLERY.halfWidth, 0.2, GALLERY.halfDepth], [0, GALLERY.ceilingY, GALLERY.centerZ], GALLERY_WALL),
  ];
  addSolidVisuals(era2026.group, solids2026);
  deps.physics.addSolids('2026', solids2026);

  const solids2126: SolidSpec[] = [
    box([5, 4, 0.5], [26, 4, -25.5], TERMINAL_STONE, 0.92, 0.08),
    box([0.5, 4, 3.5], [21, 4, -22], TERMINAL_STONE, 0.92, 0.08),
    box([0.5, 4, 3.5], [31, 4, -22], TERMINAL_STONE, 0.92, 0.08),
    box([0.3, 0.45, 0.3], [-19.7, 0.45, 0.95], ARCHIVE_STONE, 0.9, 0.1),
  ];
  addSolidVisuals(era2126.group, solids2126);
  deps.physics.addSolids('2126', solids2126);

  // Gallery trim / doorway frame (decorative, no colliders).
  decoBox(era2026.group, {
    size: [4.4, 0.26, 0.3],
    position: [0, 3.26, 24.24],
    color: GALLERY_TRIM,
    roughness: 0.55,
    metalness: 0.45,
  });
  for (const side of [-1, 1]) {
    decoBox(era2026.group, {
      size: [0.26, 3.3, 0.3],
      position: [side * 2.16, 1.65, 24.24],
      color: GALLERY_TRIM,
      roughness: 0.55,
      metalness: 0.45,
    });
    decoBox(era2026.group, {
      size: [0.24, 0.16, 3.3],
      position: [side * 7.7, 0.24, 27.6],
      color: GALLERY_FLOOR_TRIM,
      roughness: 0.8,
      metalness: 0.2,
    });
  }

  // Three gallery paintings.
  const painting2026 = createPainting('painting-2026', [STORY_LAYOUT.paintings['painting-2026'].x, 2.5, 27.6], Math.PI / 2);
  const painting2126 = createPainting('painting-2126', [STORY_LAYOUT.paintings['painting-2126'].x, 2.5, 27.6], -Math.PI / 2);
  const paintingGallery = createPainting(
    'painting-gallery',
    [STORY_LAYOUT.paintings['painting-gallery'].x, 2.5, 24.32],
    0,
  );
  era2026.group.add(painting2026, painting2126, paintingGallery);

  // Central frame canvas covering the doorway until the frame is entered.
  const doorCanvasMaterial = new THREE.MeshStandardMaterial({
    color: 0x263d43,
    emissive: 0x1d4b55,
    emissiveIntensity: 0.5,
    roughness: 0.9,
    metalness: 0.05,
  });
  const doorCanvas = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.8), doorCanvasMaterial);
  doorCanvas.position.set(
    STORY_LAYOUT.galleryDoorCanvas.x,
    STORY_LAYOUT.galleryDoorCanvas.y,
    STORY_LAYOUT.galleryDoorCanvas.z,
  );
  doorCanvas.visible = true;
  era2026.group.add(doorCanvas);

  // Blank canvas on the back wall of the gallery, plus the ending brushstroke.
  const blankCanvas = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xf2e8d6, roughness: 0.95, metalness: 0.02 }),
  );
  blankCanvas.position.set(
    STORY_LAYOUT.blankCanvas.x,
    STORY_LAYOUT.blankCanvas.y,
    STORY_LAYOUT.blankCanvas.z,
  );
  blankCanvas.rotation.y = Math.PI;
  era2026.group.add(blankCanvas);
  for (const bar of [
    { size: [3.6, 0.14, 0.14] as Vec3Tuple, position: [0, 3.16, 30.82] as Vec3Tuple },
    { size: [3.6, 0.14, 0.14] as Vec3Tuple, position: [0, 1.24, 30.82] as Vec3Tuple },
    { size: [0.14, 2.06, 0.14] as Vec3Tuple, position: [-1.72, 2.2, 30.82] as Vec3Tuple },
    { size: [0.14, 2.06, 0.14] as Vec3Tuple, position: [1.72, 2.2, 30.82] as Vec3Tuple },
  ]) {
    decoBox(era2026.group, {
      size: bar.size,
      position: bar.position,
      color: GALLERY_TRIM,
      roughness: 0.55,
      metalness: 0.45,
    });
  }

  const paintStroke = new THREE.Group();
  const strokeColors = [0xc84f4f, 0xd9a441, 0x4fa3a8];
  strokeColors.forEach((color, index) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.6 - index * 0.2, 0.16, 0.03),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.6,
        metalness: 0.1,
      }),
    );
    mesh.position.set(index * 0.32 - 0.24, index * 0.26 - 0.2, 0);
    mesh.rotation.z = 0.28 - index * 0.14;
    paintStroke.add(mesh);
  });
  paintStroke.position.set(
    STORY_LAYOUT.paintStroke.x,
    STORY_LAYOUT.paintStroke.y,
    STORY_LAYOUT.paintStroke.z,
  );
  paintStroke.visible = false;
  era2026.group.add(paintStroke);

  // Gallery fill light.
  const galleryLight = new THREE.PointLight(0xffe2b8, 7, 20, 2);
  galleryLight.position.set(0, 4.6, 27.6);
  era2026.group.add(galleryLight);

  // 2126 archive monolith in the opened M2 passage.
  const monolith = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 1.5, 0.26),
    standardMaterial({ color: ARCHIVE_STONE, roughness: 0.75, metalness: 0.2 }),
  );
  monolith.position.set(
    STORY_LAYOUT.archiveMonolith.x,
    STORY_LAYOUT.archiveMonolith.y,
    STORY_LAYOUT.archiveMonolith.z,
  );
  era2126.group.add(monolith);
  const archiveGlyphMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fe8ff,
    emissive: 0x3fb6d8,
    emissiveIntensity: 0.55,
    roughness: 0.4,
    metalness: 0.1,
  });
  const archiveGlyph = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.9), archiveGlyphMaterial);
  archiveGlyph.position.set(-19.7, 1.45, 0.8);
  archiveGlyph.rotation.y = Math.PI;
  era2126.group.add(archiveGlyph);

  // 2126 terminal canvas core room.
  decoBox(era2126.group, {
    size: [1.2, 8, 0.6],
    position: [21, 4, -18.7],
    color: TERMINAL_STONE,
    roughness: 0.9,
    metalness: 0.1,
  });
  decoBox(era2126.group, {
    size: [1.2, 8, 0.6],
    position: [31, 4, -18.7],
    color: TERMINAL_STONE,
    roughness: 0.9,
    metalness: 0.1,
  });

  const coreCanvasMaterial = new THREE.MeshStandardMaterial({
    color: 0x211d33,
    emissive: 0x5a3f9a,
    emissiveIntensity: 0.75,
    roughness: 0.92,
    metalness: 0.05,
  });
  const coreCanvas = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), coreCanvasMaterial);
  coreCanvas.position.set(
    STORY_LAYOUT.terminal.coreCanvas.x,
    STORY_LAYOUT.terminal.coreCanvas.y,
    STORY_LAYOUT.terminal.coreCanvas.z,
  );
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

  const terminalLight = new THREE.PointLight(0x8a6bff, 6, 22, 2);
  terminalLight.position.set(26, 5, -22);
  era2126.group.add(terminalLight);

  // Lockdown barrier across the core room entrance.
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

  // Dynamic colliders (registered by StorySystem with story-state callbacks).
  const galleryDoorCollider = deps.physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(...GALLERY_DOOR.halfExtents)
      .setTranslation(GALLERY_DOOR.center.x, GALLERY_DOOR.center.y, GALLERY_DOOR.center.z)
      .setFriction(0.9)
      .setRestitution(0),
  );
  const terminalBarrierCollider = deps.physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(...TERMINAL_BARRIER.halfExtents)
      .setTranslation(TERMINAL_BARRIER.center.x, TERMINAL_BARRIER.center.y, TERMINAL_BARRIER.center.z)
      .setFriction(0.9)
      .setRestitution(0),
  );

  function setLockdownClosed(closed: boolean): void {
    if (closed) {
      coreCanvasMaterial.color.setHex(0x2a2f3f);
      coreCanvasMaterial.emissive.setHex(0x4f7f9a);
      coreCanvasMaterial.emissiveIntensity = 0.5;
      coreCanvasMaterial.needsUpdate = true;
      coreGlowMaterial.color.setHex(0x9fe8ff);
      coreGlowMaterial.emissive.setHex(0x4fd8f0);
      coreGlowMaterial.emissiveIntensity = 0.9;
      coreGlowMaterial.needsUpdate = true;
      archiveGlyphMaterial.emissiveIntensity = 0.9;
      archiveGlyphMaterial.needsUpdate = true;
    } else {
      coreCanvasMaterial.color.setHex(0x211d33);
      coreCanvasMaterial.emissive.setHex(0x5a3f9a);
      coreCanvasMaterial.emissiveIntensity = 0.75;
      coreCanvasMaterial.needsUpdate = true;
      coreGlowMaterial.color.setHex(0xa98bff);
      coreGlowMaterial.emissive.setHex(0x6a4fd8);
      coreGlowMaterial.emissiveIntensity = 0.9;
      coreGlowMaterial.needsUpdate = true;
      archiveGlyphMaterial.emissiveIntensity = 0.55;
      archiveGlyphMaterial.needsUpdate = true;
    }
  }

  return {
    galleryDoorCollider,
    galleryDoorHandle: galleryDoorCollider.handle,
    galleryDoorCanvas: doorCanvas,
    terminalBarrierCollider,
    terminalBarrierHandle: terminalBarrierCollider.handle,
    terminalBarrierMesh,
    paintStroke,
    coreCanvasMaterial,
    coreGlowMaterial,
    archiveGlyphMaterial,
    staticSolids2026: solids2026.length,
    staticSolids2126: solids2126.length,
    setLockdownClosed,
  };
}

/** Kept for integrations that want the same visual primitive as static solids. */
export function createStorySolidVisual(solid: SolidSpec): THREE.Mesh {
  return createSolidVisual(solid);
}
