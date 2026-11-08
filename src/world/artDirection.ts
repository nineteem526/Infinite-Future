import * as THREE from 'three';
import type { Era } from './Era';
import { dressExterior } from './exteriorArt';

/** Prebuilt visual layer. No gameplay geometry, physics or state is modified. */
export function dressWorld(eras: ReadonlyMap<string, Era>): void {
  for (const [id, era] of eras) {
    const future = id === '2126';
    const root = new THREE.Group();
    root.name = 'architectural-finish';
    const batches = new Map<number, THREE.Matrix4[]>();
    const transform = new THREE.Object3D();
    const stone = future ? 0x697779 : 0xb7a78b;
    const trim = future ? 0x444f56 : 0x776448;
    const dark = future ? 0x172a34 : 0x25343b;
    const gold = future ? 0x4e878b : 0xb79a60;
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, color = stone, ry = 0): void => {
      transform.position.set(x, y, z); transform.scale.set(w, h, d);
      transform.rotation.set(0, ry, 0); transform.updateMatrix();
      const list = batches.get(color) ?? []; list.push(transform.matrix.clone()); batches.set(color, list);
    };
    // Finish only the faces of existing buildings; all trim is shallow.
    for (const [x, z, w, top] of [[36,5.5,8,6],[44,5.5,8,8],[52,5.5,8,6],[60,5.5,8,6],[36,16.5,8,6],[42,16.5,4,8]]) {
      const height = future ? top * 0.86 : top;
      const face = z < 10 ? z + 2.53 : z - 2.53;
      const sign = z < 10 ? 1 : -1;
      for (const y of [0.28, height - 0.4, height]) box(x,y,face,w,0.18,0.25,trim);
      for (let wx = x - w/2 + 0.85; wx < x+w/2; wx += 2.05) {
        box(wx,height/2,face,0.16,height,0.12,stone);
        for (let y=1.8; y<height-0.5; y+=2.25) {
          box(wx+0.55,y,face+sign*0.025,0.95,1.35,0.035,dark);
          box(wx+0.55,y-0.72,face+sign*0.08,1.16,0.12,0.24,stone);
          box(wx+0.55,y+0.72,face+sign*0.08,1.16,0.13,0.16,stone);
          box(wx+0.55,y,face+sign*0.07,0.055,1.35,0.05,gold);
          box(wx+0.55,y,face+sign*0.07,0.95,0.05,0.05,gold);
        }
      }
      // Recessed parapet and rooftop silhouettes.
      box(x,height+0.22,z,w,0.4,4.8,trim);
      box(x-1,height+0.7,z,0.7,1,0.7,stone);
    }
    // Street paving seams and gutter lines, on the existing floor only.
    for(let x=33; x<64; x+=1.5) {
      box(x,0.012,9,0.022,0.008,1.8,trim);
      box(x,0.012,13,0.022,0.008,1.8,trim);
    }
    for(const z of [8.12,13.88]) box(48,0.018,z,31,0.018,0.08,trim);
    for(let i=0;i<10;i++) {
      const x=36+i%5*6, z=i<5?8.2:13.8, y=future?2.2:2.6;
      box(x,y,z,0.45,0.12,0.45,trim);
      box(x,y+0.2,z,0.26,0.3,0.26,future?0x76a6ad:0xffd69a);
      box(x,y+0.4,z,0.5,0.1,0.5,trim);
    }
    if (!future) {
      // Gallery: layered wall cornices, wainscot and a coffered ceiling.
      for(const y of [0.28,1.15,7.8,8.1,10.9,11.45]) {
        const depth = y>7?0.32:0.1;
        for(const x of [44.55,61.45]) box(x,y,22,depth,0.12,15, y>7?gold:trim);
        box(53,y,29.44,17,0.12,depth,y>7?gold:trim);
      }
      for(const x of [44.58,61.42]) {
        for(const z of [15.6,18,26,28.4]) {
          box(x,4.6,z,0.17,7.8,0.42,stone);
          box(x,8.45,z,0.3,0.25,0.78,gold);
        }
      }
      for(const x of [47,59]) for(const z of [18,26]) {
        box(x,0.27,z,1.05,0.22,1.05,trim);
        box(x,7.85,z,1.15,0.28,1.15,gold);
        box(x,8.08,z,1.32,0.16,1.32,stone);
      }
      for(let x=46;x<=60;x+=3.5) box(x,11.68,22,0.16,0.3,15,gold);
      for(let z=15.5;z<=29;z+=3.3) box(53,11.68,z,17,0.3,0.16,gold);
      // Thin marble tiles preserve the original standing surface.
      for(let ix=0;ix<12;ix++) for(let iz=0;iz<10;iz++) {
        box(44.85+ix*1.48,0.172,14.8+iz*1.48,1.455,0.006,1.455,
          (ix+iz)%2===0?0x4e514b:0x363e3e);
      }
      for(const x of [48.1,57.9]) box(x,0.18,22,0.045,0.008,14.5,gold);
      for(const z of [15,29]) box(53,0.18,z,9.8,0.008,0.045,gold);
      // Art lights aim at the three existing canvases; no new paintings.
      for(const [x,z,tx,tz] of [[48,22,45.6,22],[58,22,60.4,22],[53,26,53,29.2]]) {
        const lamp = new THREE.SpotLight(0xffe4b4,100,14,0.65,0.8,2);
        lamp.position.set(x,7,z); lamp.target.position.set(tx,3,tz);
        root.add(lamp,lamp.target);
        box(x,7.1,z,0.32,0.18,0.32,gold);
      }
      const fill = new THREE.PointLight(0xffe2ba,95,20,2);
      fill.position.set(53,8,22); root.add(fill);
    } else {
      // Surface-scale debris stays against existing facades, outside the route.
      for(let i=0;i<70;i++) {
        const x=33+(i*7.37)%30, z=i%2?7.85:14.15;
        box(x,0.08,z,0.1+(i%4)*0.06,0.12,0.18,stone,i*0.7);
      }
    }
    dressExterior(era, root, box);
    const geometry = new THREE.BoxGeometry(1,1,1);
    for(const [color,matrices] of batches) {
      const luminous = color===0xffd69a || color===0x76a6ad;
      const material = new THREE.MeshStandardMaterial({color,roughness:color===gold?0.48:0.83,metalness:color===gold?0.4:0.08,
        emissive:luminous?color:0,emissiveIntensity:luminous?1.5:0});
      const mesh = new THREE.InstancedMesh(geometry,material,matrices.length);
      matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
      mesh.receiveShadow=true; mesh.computeBoundingSphere(); root.add(mesh);
    }
    era.group.add(root);
  }
}


