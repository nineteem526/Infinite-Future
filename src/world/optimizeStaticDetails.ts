import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** One-time batching, exclusively for static decoration owned by our art modules.
 * Interactive objects, imported assets and structural shadow casters are untouched. */
export function optimizeStaticDetails(eraGroup: THREE.Group): void {
  for (const name of ['clock-tower-detail','plaza-prop-detail','architectural-finish']) {
    const root=eraGroup.getObjectByName(name);
    if(!root) continue;
    root.updateWorldMatrix(true,true);
    const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert();
    const batches=new Map<THREE.Material,{sources:THREE.Mesh[],geometries:THREE.BufferGeometry[]}>();
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      object.castShadow=false;
      if(object instanceof THREE.InstancedMesh || !object.visible || Array.isArray(object.material) || object.material.transparent || object.name==='era-sky')return;
      const material=object.material;
      const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld));
      const batch=batches.get(material)??{sources:[],geometries:[]};
      batch.sources.push(object);batch.geometries.push(geometry);batches.set(material,batch);
    });
    for(const [material,batch] of batches) {
      if(batch.sources.length<2){batch.geometries.forEach(g=>g.dispose());continue;}
      const geometry=mergeGeometries(batch.geometries,false);
      batch.geometries.forEach(g=>g.dispose());
      if(!geometry)continue;
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=`batched-${name}`;mesh.receiveShadow=true;mesh.castShadow=false;
      geometry.computeBoundingSphere();root.add(mesh);
      batch.sources.forEach(source=>source.removeFromParent());
    }
  }
}
