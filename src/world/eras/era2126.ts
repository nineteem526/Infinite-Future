import * as THREE from 'three';
import { decoBox, decoCylinder, decoPlane, decoRing } from '../geometry';
import type { EraBuild, SolidSpec } from '../types';

const GROUND = 0x474c52;
const WALL = 0x5b6065;
const STONE = 0x63676b;
const RUBBLE = 0x555a5f;
const METAL = 0x6f7a80;

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;
const COLONNADE_RADIUS = 14;
const COLONNADE_ANGLE_STEP = TWO_PI / 12;

interface WallSegment {
  from: number;
  to: number;
  height: number;
}

function addRuinedWall(
  solids: SolidSpec[],
  side: 'north' | 'south' | 'east' | 'west',
  segments: readonly WallSegment[],
): void {
  for (const segment of segments) {
    const length = segment.to - segment.from;
    const center = (segment.from + segment.to) / 2;
    if (side === 'north' || side === 'south') {
      solids.push({
        kind: 'box',
        halfExtents: [length / 2, segment.height / 2, 0.6],
        position: [center, segment.height / 2, side === 'north' ? -32 : 32],
        color: WALL,
        roughness: 0.98,
        metalness: 0,
      });
    } else {
      solids.push({
        kind: 'box',
        halfExtents: [0.6, segment.height / 2, length / 2],
        position: [side === 'west' ? -32 : 32, segment.height / 2, center],
        color: WALL,
        roughness: 0.98,
        metalness: 0,
      });
    }
  }
}

function addBrokenColonnade(solids: SolidSpec[]): void {
  const survivors: readonly [number, number][] = [
    [0, 2.4],
    [1, 1.0],
    [3, 0.8],
    [4, 2.8],
    [6, 0.7],
    [8, 1.9],
    [10, 2.2],
  ];

  for (const [index, height] of survivors) {
    const angle = index * COLONNADE_ANGLE_STEP;
    const x = Math.cos(angle) * COLONNADE_RADIUS;
    const z = Math.sin(angle) * COLONNADE_RADIUS;

    solids.push({
      kind: 'box',
      halfExtents: [0.9, 0.12, 0.9],
      position: [x, 0.12, z],
      color: STONE,
      roughness: 0.98,
      metalness: 0,
    });
    solids.push({
      kind: 'cylinder',
      radius: 0.55,
      halfHeight: height / 2,
      position: [x, height / 2, z],
      color: STONE,
      roughness: 0.98,
      metalness: 0,
    });
  }

  // Fallen columns lie on the ground; capsules are the simplest faithful collider.
  solids.push({
    kind: 'capsule',
    radius: 0.55,
    halfHeight: 2.2,
    position: [10, 0.55, 12],
    rotation: [0, 0, HALF_PI],
    color: 0x6b6d70,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'capsule',
    radius: 0.5,
    halfHeight: 1.8,
    position: [-6, 0.5, 13],
    rotation: [0, 0.7, HALF_PI],
    color: 0x6b6d70,
    roughness: 0.98,
    metalness: 0,
  });
}

function addTerrace(solids: SolidSpec[]): void {
  // Collapsed terrace: lower than 2026, so a switch here keeps the player's
  // position (they fall a short distance afterwards) instead of teleporting.
  solids.push({
    kind: 'box',
    halfExtents: [4, 0.3, 4],
    position: [18, 0.3, 0],
    color: STONE,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.5, 0.2, 3.6],
    position: [13.5, 0.2, 0],
    color: RUBBLE,
    roughness: 0.98,
    metalness: 0,
    rotation: [0, 0.1, 0],
  });
}

function addTower(solids: SolidSpec[]): void {
  solids.push({
    kind: 'box',
    halfExtents: [4, 5, 4],
    position: [0, 5, -24],
    color: STONE,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [2.6, 2, 2.6],
    position: [0, 12, -24],
    color: STONE,
    roughness: 0.98,
    metalness: 0,
  });
}

export function createEra2126(): EraBuild {
  const solids: SolidSpec[] = [];

  solids.push({
    kind: 'box',
    halfExtents: [32, 0.5, 32],
    position: [0, -0.5, 0],
    color: GROUND,
    roughness: 1,
    metalness: 0,
    castShadow: false,
  });

  addRuinedWall(solids, 'north', [
    { from: -32.6, to: -18, height: 2.6 },
    { from: -18, to: -6, height: 3.4 },
    { from: -6, to: 4, height: 2.2 },
    { from: 4, to: 14, height: 3.0 },
    { from: 14, to: 32.6, height: 2.4 },
  ]);
  addRuinedWall(solids, 'south', [
    { from: -32.6, to: -14, height: 2.2 },
    { from: -14, to: -2, height: 3.2 },
    { from: -2, to: 10, height: 2.8 },
    { from: 10, to: 20, height: 2.2 },
    { from: 20, to: 32.6, height: 3.0 },
  ]);
  addRuinedWall(solids, 'west', [
    { from: -32.6, to: -16, height: 3.2 },
    { from: -16, to: -4, height: 2.4 },
    { from: -4, to: 8, height: 3.0 },
    { from: 8, to: 20, height: 2.2 },
    { from: 20, to: 32.6, height: 2.6 },
  ]);
  addRuinedWall(solids, 'east', [
    { from: -32.6, to: -20, height: 2.4 },
    { from: -20, to: -8, height: 3.0 },
    { from: -8, to: 2, height: 2.2 },
    { from: 2, to: 16, height: 3.4 },
    { from: 16, to: 32.6, height: 2.6 },
  ]);

  addBrokenColonnade(solids);
  addTower(solids);
  addTerrace(solids);

  // Rubble walls. These occupy open 2026 space, so switching into 2126 while
  // standing in one of these spots must be rejected.
  solids.push({
    kind: 'box',
    halfExtents: [4, 1.5, 0.5],
    position: [0, 1.5, 6],
    color: RUBBLE,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [3, 1.1, 0.45],
    position: [-9, 1.1, -7],
    rotation: [0.05, 0.35, 0],
    color: RUBBLE,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [2.5, 1.3, 0.5],
    position: [12, 1.3, -3],
    rotation: [0, -0.6, 0.04],
    color: RUBBLE,
    roughness: 0.98,
    metalness: 0,
  });

  // Rubble piles and debris.
  solids.push({
    kind: 'box',
    halfExtents: [1.6, 0.6, 1.2],
    position: [5, 0.6, 14],
    rotation: [0.08, 0.5, 0.05],
    color: RUBBLE,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [1.2, 0.45, 1.0],
    position: [-5, 0.45, 14],
    rotation: [0, -0.4, 0.06],
    color: RUBBLE,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [1.8, 0.5, 1.4],
    position: [14, 0.5, -10],
    rotation: [0.05, 0.9, 0],
    color: RUBBLE,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [1.0, 0.35, 0.9],
    position: [-14, 0.35, -12],
    rotation: [0.1, -0.5, 0.03],
    color: RUBBLE,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [1.4, 0.4, 1.1],
    position: [7.5, 0.4, -12],
    rotation: [0.06, 0.3, 0.02],
    color: RUBBLE,
    roughness: 0.98,
    metalness: 0,
  });

  // Broken street props.
  solids.push({
    kind: 'box',
    halfExtents: [0.6, 0.6, 0.6],
    position: [8, 0.6, 10],
    rotation: [0.1, 0.25, 0.08],
    color: 0x4f463c,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.45, 0.3, 0.45],
    position: [8.9, 0.3, 10.9],
    rotation: [0, 0.6, 0.12],
    color: 0x4f463c,
    roughness: 0.98,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [1.2, 0.15, 0.38],
    position: [6, 0.15, 8],
    rotation: [0.04, 0.2, 0],
    color: 0x4f463c,
    roughness: 0.98,
    metalness: 0,
  });
  for (const [x, z] of [
    [9, 9],
    [-9, 9],
    [9, -9],
    [-9, -9],
  ] as const) {
    solids.push({
      kind: 'cylinder',
      radius: 0.12,
      halfHeight: 0.7,
      position: [x, 0.7, z],
      color: METAL,
      roughness: 0.7,
      metalness: 0.5,
    });
  }

  return {
    id: '2126',
    name: '铅灰废墟',
    description: 'Vernaux · 终末画布之后',
    lighting: {
      background: 0x39414a,
      fogColor: 0x4a535d,
      fogDensity: 0.0105,
      exposure: 0.92,
      sun: {
        color: 0xa8bfd6,
        intensity: 0.85,
        position: [-28, 42, -34],
      },
      hemi: {
        skyColor: 0x6c7c8e,
        groundColor: 0x25272b,
        intensity: 0.6,
      },
      ambient: {
        color: 0x1f2933,
        intensity: 0.4,
      },
    },
    solids,
    decorate(group: THREE.Group): void {
      // Cracked paving: decorative, non-colliding.
      decoPlane(group, {
        width: 0.35,
        height: 44,
        position: [-3, 0.012, 0],
        rotation: [-HALF_PI, 0, 0.12],
        color: 0x35393e,
        roughness: 1,
        metalness: 0,
      });
      decoPlane(group, {
        width: 34,
        height: 0.4,
        position: [0, 0.012, -2],
        rotation: [-HALF_PI, 0, -0.06],
        color: 0x35393e,
        roughness: 1,
        metalness: 0,
      });
      decoPlane(group, {
        width: 0.25,
        height: 26,
        position: [11, 0.013, 2],
        rotation: [-HALF_PI, 0, -0.4],
        color: 0x35393e,
        roughness: 1,
        metalness: 0,
      });

      // Drained fountain footprint in 2026's position.
      decoRing(group, {
        innerRadius: 2.75,
        outerRadius: 3.05,
        position: [-18, 0.014, 0],
        rotation: [-HALF_PI, 0, 0],
        color: 0x5c6165,
        roughness: 1,
        metalness: 0,
      });
      decoPlane(group, {
        width: 5.8,
        height: 5.8,
        position: [-18, 0.011, 0],
        rotation: [-HALF_PI, 0, 0],
        color: 0x2e3237,
        roughness: 1,
        metalness: 0,
      });

      // Broken clock face with a dark hole.
      decoCylinder(group, {
        radiusTop: 2.4,
        radiusBottom: 2.4,
        height: 0.16,
        position: [0, 8.2, -19.88],
        rotation: [HALF_PI, 0, 0],
        color: 0x2a2e33,
        roughness: 0.9,
        metalness: 0.1,
      });
      decoBox(group, {
        size: [1.3, 0.14, 0.06],
        position: [1.2, 8.2, -19.78],
        rotation: [0, 0, 0.35],
        color: 0x202428,
        roughness: 0.8,
        metalness: 0.1,
      });

      // Jagged broken crown of the clock tower (visual only; no colliders).
      decoBox(group, {
        size: [3.4, 1.8, 3.4],
        position: [-0.5, 14.8, -24],
        rotation: [0.08, 0.3, 0.12],
        color: STONE,
        roughness: 0.98,
        metalness: 0,
        castShadow: true,
      });
      decoBox(group, {
        size: [2.2, 1.2, 2.6],
        position: [1.4, 15.6, -23.4],
        rotation: [0.2, -0.2, 0.18],
        color: STONE,
        roughness: 0.98,
        metalness: 0,
        castShadow: true,
      });
      decoBox(group, {
        size: [1.1, 2.4, 1.1],
        position: [-2.2, 16.4, -24.6],
        rotation: [0.3, 0.7, 0.1],
        color: WALL,
        roughness: 0.98,
        metalness: 0,
        castShadow: true,
      });

      // Broken wall tops: small chunks sitting on the ruined perimeter.
      for (let i = 0; i < 16; i += 1) {
        const sideIndex = i % 4;
        const t = -28 + ((i * 13) % 56);
        const angleBasedWidth = 1.4 + ((i * 3) % 4) * 0.6;
        const baseY = 2.2 + ((i * 7) % 10) * 0.13;
        const x = sideIndex === 0 ? t : sideIndex === 1 ? 32 : sideIndex === 2 ? t : -32;
        const z = sideIndex === 0 ? -32 : sideIndex === 1 ? t : sideIndex === 2 ? 32 : t;
        decoBox(group, {
          size: [angleBasedWidth, 1.1, angleBasedWidth * 0.8],
          position: [x, baseY, z],
          rotation: [0.1, (i % 5) * 0.3, 0.08],
          color: WALL,
          roughness: 0.98,
          metalness: 0,
          castShadow: true,
        });
      }

      // Cold skyline silhouettes.
      for (let i = 0; i < 18; i += 1) {
        const angle = (i / 18) * TWO_PI + 0.18;
        const radius = 50 + ((i * 9) % 25);
        const width = 6 + ((i * 5) % 7);
        const depth = 6 + ((i * 3) % 8);
        const height = 9 + ((i * 13) % 31);
        decoBox(group, {
          size: [width, height, depth],
          position: [Math.cos(angle) * radius, height / 2 - 1.5, Math.sin(angle) * radius],
          color: i % 2 === 0 ? 0x3c4045 : 0x464a4f,
          roughness: 1,
          metalness: 0,
          receiveShadow: false,
        });
      }
    },
  };
}
