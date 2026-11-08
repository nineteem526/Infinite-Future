import * as THREE from 'three';
import type { Era } from './Era';
import type { EraId } from './types';
export type CityBackdrops = ReadonlyMap<EraId, THREE.Texture>;

export async function preloadCityBackdrops(): Promise<CityBackdrops> {
  const loader = new THREE.TextureLoader();
  const textures = new Map<EraId, THREE.Texture>();
  await Promise.all((['2026','2126'] as const).map(async id => {
    try {
      const texture = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/city-panorama-${id}.png`);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      textures.set(id, texture);
    } catch (error) { console.warn(`City panorama ${id} unavailable; retaining geometry fallback`,error); }
  }));
  return textures;
}

/** Full spherical background. Camera-relative position prevents false near-field
 * parallax; era ownership retains synchronous, preloaded time switching. */
export function addCityBackdrops(eras: ReadonlyMap<EraId,Era>, textures: CityBackdrops): void {
  for (const [id,texture] of textures) {
    const era = eras.get(id);
    if (!era) continue;
    const geometry = new THREE.SphereGeometry(240,96,64);
    // Inward geometry preserves image handedness. Image center faces north (-Z).
    geometry.scale(-1,1,1);
    geometry.rotateY(-Math.PI/2);
    const uv=geometry.attributes.uv;
    // Source paintings have different ground/sky proportions; keep the city base
    // near the horizon without moving the poles or modifying source images.
    const horizonOffset=id==='2026'?0.075:0.18;
    for(let i=0;i<uv.count;i++) {
      const v=uv.getY(i);
      uv.setY(i,v-horizonOffset*Math.sin(Math.PI*v));
    }
    const material = new THREE.MeshBasicMaterial({map:texture,fog:false,toneMapped:false,depthWrite:false});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=`city-panorama-${id}`;
    mesh.renderOrder=-20;
    mesh.frustumCulled=false;
    const cameraPosition = new THREE.Vector3();
    mesh.onBeforeRender=(_renderer,_scene,camera)=>{
      mesh.position.copy(camera.getWorldPosition(cameraPosition));
      mesh.updateMatrixWorld();
    };
    era.group.add(mesh);
    const oldSky=era.group.getObjectByName('era-sky');
    if(oldSky) oldSky.visible=false;
    // Old far-distance primitive skyline no longer belongs over the panorama.
    for(const child of era.group.children) {
      if(child instanceof THREE.Mesh && child!==mesh && Math.hypot(child.position.x,child.position.z)>80) child.visible=false;
    }
  }
}

