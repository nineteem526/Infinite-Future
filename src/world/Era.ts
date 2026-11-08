import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { addSolidVisuals } from './geometry';
import type { EraBuild, EraId, EraLighting } from './types';

/**
 * One pre-loaded era: its rendered group, its lights and its structural
 * colliders. Activation is a synchronous visibility/environment switch; no
 * asset loading or network access happens at switch time.
 */
export class Era {
  readonly id: EraId;
  readonly name: string;
  readonly description: string;
  readonly lighting: EraLighting;
  readonly group = new THREE.Group();

  private readonly background: THREE.Color;
  private readonly fog: THREE.FogExp2;
  private active = false;

  constructor(build: EraBuild, physics: Physics) {
    this.id = build.id;
    this.name = build.name;
    this.description = build.description;
    this.lighting = build.lighting;

    this.group.name = `era-${build.id}`;
    addSolidVisuals(this.group, build.solids);
    build.decorate(this.group);

    physics.addSolids(build.id, build.solids);

    const sunSpec = build.lighting.sun;
    const sun = new THREE.DirectionalLight(sunSpec.color, sunSpec.intensity);
    sun.position.set(...sunSpec.position);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.target.position.set(0, 0, 0);
    this.group.add(sun);
    this.group.add(sun.target);

    const hemiSpec = build.lighting.hemi;
    const hemi = new THREE.HemisphereLight(hemiSpec.skyColor, hemiSpec.groundColor, hemiSpec.intensity);
    this.group.add(hemi);

    const ambientSpec = build.lighting.ambient;
    const ambient = new THREE.AmbientLight(ambientSpec.color, ambientSpec.intensity);
    this.group.add(ambient);

    this.background = new THREE.Color(build.lighting.background);
    this.fog = new THREE.FogExp2(build.lighting.fogColor, build.lighting.fogDensity);

    this.group.visible = false;
  }

  get isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.group.visible = active;
  }

  /** Applies scene-level environment state atomically with the era switch. */
  applyEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    scene.background = this.background;
    scene.fog = this.fog;
    renderer.toneMappingExposure = this.lighting.exposure;
  }
}
