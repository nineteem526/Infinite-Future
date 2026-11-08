declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  import type { Group, Loader, LoadingManager } from 'three';

  export interface GLTF {
    scene: Group;
    scenes: Group[];
    animations: unknown[];
    cameras: unknown[];
    asset: unknown;
    parser: unknown;
  }

  export class GLTFLoader extends Loader {
    constructor(manager?: LoadingManager);
    loadAsync(
      url: string,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
    ): Promise<GLTF>;
  }
}
