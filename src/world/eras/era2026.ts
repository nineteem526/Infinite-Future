import * as THREE from 'three';
import { decoBox, decoCylinder, decoPlane, decoRing } from '../geometry';
import type { EraBuild, SolidSpec } from '../types';

const GROUND = 0xe8d8b8;
const WALL = 0xdcc9a6;
const STONE = 0xe7d8bd;
const TRIM = 0xd2bd95;
const MONUMENT = 0xcdb890;
const WOOD = 0x8a6238;
const METAL = 0xb08d4f;

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;
const COLONNADE_RADIUS = 14;
const COLONNADE_COUNT = 12;

function addColonnade(solids: SolidSpec[]): void {
  const step = TWO_PI / COLONNADE_COUNT;

  for (let i = 0; i < COLONNADE_COUNT; i += 1) {
    const angle = i * step;
    const x = Math.cos(angle) * COLONNADE_RADIUS;
    const z = Math.sin(angle) * COLONNADE_RADIUS;

    solids.push({
      kind: 'box',
      halfExtents: [0.9, 0.15, 0.9],
      position: [x, 0.15, z],
      color: STONE,
      roughness: 0.95,
      metalness: 0,
    });
    solids.push({
      kind: 'cylinder',
      radius: 0.55,
      halfHeight: 2.5,
      position: [x, 2.8, z],
      color: STONE,
      roughness: 0.9,
      metalness: 0,
    });
    solids.push({
      kind: 'box',
      halfExtents: [0.85, 0.18, 0.85],
      position: [x, 5.48, z],
      color: TRIM,
      roughness: 0.9,
      metalness: 0,
    });

    const midAngle = angle + step / 2;
    const midX = Math.cos(midAngle) * COLONNADE_RADIUS;
    const midZ = Math.sin(midAngle) * COLONNADE_RADIUS;
    solids.push({
      kind: 'box',
      halfExtents: [3.6, 0.3, 0.42],
      position: [midX, 5.96, midZ],
      rotation: [0, midAngle + HALF_PI, 0],
      color: TRIM,
      roughness: 0.9,
      metalness: 0,
    });
  }
}

function addPerimeter(solids: SolidSpec[]): void {
  // Low, solid balustrade wall around the test field; keeps the player inside
  // while letting the skyline read above it.
  solids.push({
    kind: 'box',
    halfExtents: [32.6, 1.2, 0.6],
    position: [0, 1.2, -32],
    color: WALL,
    roughness: 0.95,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [32.6, 1.2, 0.6],
    position: [0, 1.2, 32],
    color: WALL,
    roughness: 0.95,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.6, 1.2, 32],
    position: [-32, 1.2, 0],
    color: WALL,
    roughness: 0.95,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.6, 1.2, 32],
    position: [32, 1.2, 0],
    color: WALL,
    roughness: 0.95,
    metalness: 0,
  });
}

function addMonument(solids: SolidSpec[]): void {
  solids.push({
    kind: 'box',
    halfExtents: [3.2, 0.3, 3.2],
    position: [0, 0.3, 0],
    color: MONUMENT,
    roughness: 0.9,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [2.4, 0.3, 2.4],
    position: [0, 0.9, 0],
    color: MONUMENT,
    roughness: 0.9,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [1.2, 0.5, 1.2],
    position: [0, 1.7, 0],
    color: STONE,
    roughness: 0.9,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.55, 3.4, 0.55],
    position: [0, 5.6, 0],
    color: STONE,
    roughness: 0.88,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.75, 0.22, 0.75],
    position: [0, 9.22, 0],
    color: TRIM,
    roughness: 0.85,
    metalness: 0.05,
  });
}

function addTerrace(solids: SolidSpec[]): void {
  solids.push({
    kind: 'box',
    halfExtents: [4, 0.5, 4],
    position: [18, 0.5, 0],
    color: STONE,
    roughness: 0.95,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.25, 0.125, 4],
    position: [12.75, 0.125, 0],
    color: TRIM,
    roughness: 0.95,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.25, 0.25, 4],
    position: [13.25, 0.25, 0],
    color: TRIM,
    roughness: 0.95,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.25, 0.375, 4],
    position: [13.75, 0.375, 0],
    color: TRIM,
    roughness: 0.95,
    metalness: 0,
  });
}

function addProps(solids: SolidSpec[]): void {
  solids.push({
    kind: 'cylinder',
    radius: 3,
    halfHeight: 0.3,
    position: [-18, 0.3, 0],
    color: STONE,
    roughness: 0.9,
    metalness: 0,
  });
  solids.push({
    kind: 'cylinder',
    radius: 0.4,
    halfHeight: 1.2,
    position: [-18, 1.6, 0],
    color: TRIM,
    roughness: 0.85,
    metalness: 0.05,
  });

  solids.push({
    kind: 'box',
    halfExtents: [0.6, 0.6, 0.6],
    position: [8, 0.6, 10],
    color: WOOD,
    roughness: 0.95,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.45, 0.45, 0.45],
    position: [8.9, 0.45, 10.9],
    rotation: [0, 0.4, 0],
    color: WOOD,
    roughness: 0.95,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [0.5, 0.5, 0.5],
    position: [7.2, 0.5, 11.2],
    rotation: [0, -0.3, 0],
    color: WOOD,
    roughness: 0.95,
    metalness: 0,
  });

  solids.push({
    kind: 'box',
    halfExtents: [1.2, 0.22, 0.38],
    position: [6, 0.22, 8],
    rotation: [0, 0.2, 0],
    color: WOOD,
    roughness: 0.95,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [1.2, 0.22, 0.38],
    position: [-6, 0.22, 8],
    rotation: [0, -0.2, 0],
    color: WOOD,
    roughness: 0.95,
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
      halfHeight: 1.5,
      position: [x, 1.5, z],
      color: METAL,
      roughness: 0.6,
      metalness: 0.6,
    });
  }
}

function addClockTower(solids: SolidSpec[]): void {
  solids.push({
    kind: 'box',
    halfExtents: [4, 7, 4],
    position: [0, 7, -24],
    color: STONE,
    roughness: 0.9,
    metalness: 0,
  });
  solids.push({
    kind: 'box',
    halfExtents: [3, 3, 3],
    position: [0, 17, -24],
    color: STONE,
    roughness: 0.9,
    metalness: 0,
  });
}

export function createEra2026(): EraBuild {
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

  addPerimeter(solids);
  addColonnade(solids);
  addMonument(solids);
  addTerrace(solids);
  addProps(solids);
  addClockTower(solids);

  return {
    id: '2026',
    name: '暖金广场',
    description: 'Vernaux · 最后的画廊外庭',
    lighting: {
      background: 0xd8b98a,
      fogColor: 0xcfb184,
      fogDensity: 0.006,
      exposure: 1.12,
      sun: {
        color: 0xffd7a0,
        intensity: 2.6,
        position: [34, 46, 22],
      },
      hemi: {
        skyColor: 0xfff1d6,
        groundColor: 0x8a6a45,
        intensity: 0.75,
      },
      ambient: {
        color: 0x5a4a35,
        intensity: 0.35,
      },
    },
    solids,
    decorate(group: THREE.Group): void {
      // Paving inlays: decorative planes only, deliberately never colliders.
      decoPlane(group, {
        width: 7.5,
        height: 46,
        position: [0, 0.012, 0],
        rotation: [-HALF_PI, 0, 0],
        color: 0xdecdb0,
        roughness: 1,
        metalness: 0,
      });
      decoPlane(group, {
        width: 40,
        height: 7.5,
        position: [0, 0.012, 0],
        rotation: [-HALF_PI, 0, 0],
        color: 0xdecdb0,
        roughness: 1,
        metalness: 0,
      });
      decoRing(group, {
        innerRadius: 6,
        outerRadius: 6.6,
        position: [0, 0.014, 0],
        rotation: [-HALF_PI, 0, 0],
        color: 0xc9b58d,
        roughness: 1,
        metalness: 0,
      });
      decoRing(group, {
        innerRadius: 19,
        outerRadius: 19.5,
        position: [0, 0.014, 0],
        rotation: [-HALF_PI, 0, 0],
        color: 0xc9b58d,
        roughness: 1,
        metalness: 0,
      });

      // Fountain water surface.
      decoCylinder(group, {
        radiusTop: 2.78,
        radiusBottom: 2.78,
        height: 0.04,
        position: [-18, 0.62, 0],
        color: 0x7fb3bf,
        opacity: 0.72,
        emissive: 0x2f6f7d,
        emissiveIntensity: 0.55,
        roughness: 0.25,
        metalness: 0.1,
        receiveShadow: true,
      });

      // Terrace balustrade.
      for (let i = -3; i <= 3; i += 1) {
        decoBox(group, {
          size: [0.5, 0.75, 0.2],
          position: [18 + i * 1.1, 1.37, -3.85],
          color: STONE,
          roughness: 0.95,
          metalness: 0,
        });
      }
      decoBox(group, {
        size: [8.4, 0.14, 0.3],
        position: [18, 1.8, -3.85],
        color: TRIM,
        roughness: 0.9,
        metalness: 0,
      });

      // Clock face and hands on the tower front.
      decoCylinder(group, {
        radiusTop: 2.4,
        radiusBottom: 2.4,
        height: 0.22,
        position: [0, 10.4, -19.86],
        rotation: [HALF_PI, 0, 0],
        color: 0xfff2d0,
        emissive: 0xffc966,
        emissiveIntensity: 0.85,
        roughness: 0.4,
        metalness: 0.1,
      });
      decoBox(group, {
        size: [0.16, 1.9, 0.08],
        position: [0, 10.4, -19.72],
        rotation: [0, 0, 0.42],
        color: 0x4a3520,
        roughness: 0.7,
        metalness: 0.1,
      });
      decoBox(group, {
        size: [0.12, 1.3, 0.08],
        position: [0, 10.4, -19.7],
        rotation: [0, 0, -1.1],
        color: 0x4a3520,
        roughness: 0.7,
        metalness: 0.1,
      });
      decoCylinder(group, {
        radiusTop: 0.18,
        radiusBottom: 0.18,
        height: 0.12,
        position: [0, 10.4, -19.68],
        rotation: [HALF_PI, 0, 0],
        color: 0x4a3520,
        roughness: 0.6,
        metalness: 0.3,
      });

      // Spire above the clock tier.
      decoCylinder(group, {
        radiusTop: 0.12,
        radiusBottom: 2.4,
        height: 4.6,
        position: [0, 22.3, -24],
        color: 0x7c6a4a,
        roughness: 0.8,
        metalness: 0.15,
        castShadow: true,
      });

      // Distant skyline silhouettes beyond the balustrade.
      for (let i = 0; i < 18; i += 1) {
        const angle = (i / 18) * TWO_PI + 0.12;
        const radius = 52 + ((i * 7) % 23);
        const width = 5 + ((i * 3) % 6);
        const depth = 5 + ((i * 5) % 7);
        const height = 11 + ((i * 11) % 25);
        decoBox(group, {
          size: [width, height, depth],
          position: [Math.cos(angle) * radius, height / 2 - 1, Math.sin(angle) * radius],
          color: i % 3 === 0 ? 0x9d7f58 : 0xab9068,
          roughness: 0.95,
          metalness: 0,
          receiveShadow: false,
        });
      }
    },
  };
}
