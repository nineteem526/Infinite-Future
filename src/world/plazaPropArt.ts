import * as THREE from 'three';
import type { Era } from './Era';
import { M2_LAYOUT } from '../m2/layout';

/** Surface embellishments only: no new walkable objects or interaction anchors. */
export function refinePlazaProps(era: Era): void {
  const future=era.id==='2126';
  const root=new THREE.Group();root.name='plaza-prop-detail';
  const stone=new THREE.MeshStandardMaterial({color:future?0x7b8580:0xcabda0,roughness:0.9});
  const brass=new THREE.MeshStandardMaterial({color:future?0x61776d:0x9b814f,metalness:0.65,roughness:0.5});
  const iron=new THREE.MeshStandardMaterial({color:0x263c3b,metalness:0.55,roughness:0.63});
  const wood=new THREE.MeshStandardMaterial({color:future?0x504b3e:0x795535,roughness:0.9});
  const mesh=(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;root.add(o);return o;};
  // Batch small fittings by geometry and material to keep draw calls bounded.
  const batches=new Map<string,{g:THREE.BufferGeometry,m:THREE.Material,matrices:THREE.Matrix4[]}>();
  const dummy=new THREE.Object3D();
  const unitBox=new THREE.BoxGeometry(1,1,1),unitRod=new THREE.CylinderGeometry(1,1,1,8);
  const part=(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,ry=0)=>{
    dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.rotation.set(0,ry,0);dummy.updateMatrix();
    const key=g.uuid+m.uuid;const b=batches.get(key)??{g,m,matrices:[]};b.matrices.push(dummy.matrix.clone());batches.set(key,b);
  };
  const ring=(r:number,t:number,x:number,y:number,z:number,m:THREE.Material)=>{const o=mesh(new THREE.TorusGeometry(r,t,8,48),m,x,y,z);o.rotation.x=Math.PI/2;return o;};
  const columns: [number,number,number,number][]=[];
  const survivors=new Map([[0,2.4],[1,1],[3,0.8],[4,2.8],[6,0.7],[8,1.9],[10,2.2]]);
  for(let i=0;i<12;i++) {
    const h=future?survivors.get(i):5;
    if(h===undefined)continue;
    const a=i*Math.PI/6;columns.push([Math.cos(a)*14,Math.sin(a)*14,future?0:0.3,h]);
  }
  if(!future) for(const x of [47,59])for(const z of [18,26]) columns.push([x,z,0.18,7.7]);
  for(const [x,z,base,h] of columns) {
    const radius=x>40?0.45:0.55;
    for(const [dy,r] of [[0.09,radius+0.07],[0.21,radius+0.035],[h-0.12,radius+0.025]]) ring(r,0.045,x,base+dy,z,stone);
    // Slender fluting follows the column envelope, never an extra obstacle.
    for(let j=0;j<16;j++) {
      const a=j*Math.PI/8;
      part(unitRod,stone,x+Math.sin(a)*(radius-0.018),base+h/2,z+Math.cos(a)*(radius-0.018),0.022,Math.max(0.2,h-0.5),0.022);
    }
    if(!future) for(const sx of [-1,1])for(const sz of [-1,1]) {
      const volute=mesh(new THREE.TorusGeometry(0.11,0.035,6,16),stone,x+sx*0.43,base+h+0.03,z+sz*0.43);volute.rotation.y=sx*Math.PI/4;
    }
    else for(let j=0;j<3;j++) part(unitRod,iron,x-0.18+j*0.17,base+h+0.12,z+Math.sin(j)*0.15,0.018,0.24+j*0.07,0.018);
  }
  // Dress the existing low benches, respecting their original footprint and yaw.
  for(const [x,angle] of [[6,0.2],[-6,-0.2]]) {
    for(let j=0;j<4;j++) {const dz=-0.28+j*0.18;part(unitBox,wood,x+Math.sin(angle)*dz,future?0.31:0.45,8+Math.cos(angle)*dz,2.32,0.055,0.14,angle);}
    for(const dx of [-0.9,0.9])part(unitBox,iron,x+Math.cos(angle)*dx,0.24,8-Math.sin(angle)*dx,0.08,0.4,0.7,angle);
  }
  if(!future) {
    ring(2.88,0.095,-18,0.64,0,stone);ring(0.43,0.055,-18,2.68,0,brass);
    mesh(new THREE.CylinderGeometry(0.65,0.3,0.2,24),stone,-18,2.65,0);
    // Generator: riveted housing, vent fins and a mechanically legible socket.
    const x=M2_LAYOUT.generator.x;
    for(const side of [-1,1]) {
      part(unitBox,iron,x+side*1.055,1.7,0,0.035,1.4,1.5);
      for(let j=0;j<10;j++)part(unitBox,brass,x+side*1.085,1.12+j*0.125,0,0.045,0.035,1.35);
      for(const z of [-0.91,0.91])part(unitBox,brass,x+side*0.92,1.65,z,0.085,2.05,0.085);
    }
    for(const y of [0.67,2.61]) for(let j=0;j<7;j++) {
      const bolt=mesh(new THREE.CylinderGeometry(0.045,0.045,0.045,6),brass,x-0.84+j*0.28,y,1.07);bolt.rotation.x=Math.PI/2;
    }
    const collar=mesh(new THREE.TorusGeometry(0.32,0.045,8,40),brass,x,1.9,1.14);
    collar.name='generator-socket-detail';
    for(let i=0;i<8;i++){const a=i*Math.PI/4;part(unitBox,brass,x+Math.sin(a)*0.38,1.9+Math.cos(a)*0.38,1.12,0.065,0.065,0.065);}
    // Small pressure dial below socket; no emissive indicators that imply power state.
    const gauge=mesh(new THREE.CircleGeometry(0.17,32),new THREE.MeshStandardMaterial({color:0xd9ceb3,roughness:0.8}),x,1.05,1.08);
    gauge.name='generator-pressure-dial';
    const needle=mesh(new THREE.BoxGeometry(0.02,0.22,0.02),iron,x,1.05,1.1);needle.rotation.z=-0.7;
    // Inset cable routing remains on top of the existing generator slab.
    for(const side of [-1,1]) {
      const points=[new THREE.Vector3(x+side*0.7,2.73,-0.4),new THREE.Vector3(x+side*0.86,2.86,0),new THREE.Vector3(x+side*0.7,2.73,0.4)];
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,0.04,6,false),iron,0,0,0);
    }
    // Past mechanism base retains its existing switch and status lamp.
    ring(0.75,0.045,M2_LAYOUT.pastDevice.x,1.05,0,brass);
  }
    // Energy pedestal: layered metal shoe, inset panels and a protective socket crown.
    if(future) {
      const x=M2_LAYOUT.crystalPedestal.x;
      for(const y of [0.12,0.28,1.65,1.8]) {
        part(unitBox,brass,x,y,0,1.13,0.08,1.13);
      }
      for(const side of [-1,1]) {
        part(unitBox,iron,x+side*0.555,0.95,0,0.02,1.15,0.76);
        part(unitBox,iron,x,0.95,side*0.555,0.76,1.15,0.02);
        for(const z of [-0.48,0.48])part(unitBox,brass,x+side*0.48,0.95,z,0.07,1.45,0.07);
      }
      for(let j=0;j<7;j++) {
        part(unitBox,brass,x,0.48+j*0.15,0.575,0.58,0.025,0.025);
        for(const side of [-1,1])part(unitBox,brass,x+side*0.575,0.48+j*0.15,0,0.025,0.025,0.58);
      }
      ring(0.43,0.035,x,1.98,0,brass);
      ring(0.59,0.025,x,1.97,0,iron);
      for(let j=0;j<8;j++) {
        const a=j*Math.PI/4;
        part(unitRod,brass,x+Math.sin(a)*0.46,2.025,Math.cos(a)*0.46,0.025,0.12,0.025);
        part(unitBox,brass,x+Math.sin(a)*0.62,1.98,Math.cos(a)*0.62,0.07,0.035,0.07,a);
      }
    } else {
      const x=M2_LAYOUT.pastDevice.x;
      // Reinforced lever console: skirt, side fins and bearing blocks.
      for(const y of [0.14,0.96])part(unitBox,brass,x,y,0,1.91,0.1,1.41);
      for(const side of [-1,1]) {
        part(unitBox,iron,x+side*0.96,0.55,0,0.025,0.62,1.05);
        for(let j=0;j<7;j++)part(unitBox,brass,x+side*0.98,0.55,-0.42+j*0.14,0.025,0.45,0.035);
        part(unitBox,brass,x+side*0.44,1.55,0,0.1,0.48,0.45);
        for(const z of [-0.34,0.34]) {
          const bearing=mesh(new THREE.CylinderGeometry(0.15,0.15,0.12,20),brass,x,1.72,z);
          bearing.rotation.x=Math.PI/2;
        }
      }
      const axis=mesh(new THREE.CylinderGeometry(0.065,0.065,0.85,12),iron,x,1.72,0);axis.rotation.x=Math.PI/2;
      // Grip follows the upper end of the existing 0.45-radian lever shaft.
      const grip=mesh(new THREE.CylinderGeometry(0.095,0.095,0.56,16),wood,x-0.2175,2.5,0);grip.rotation.x=Math.PI/2;
      for(const z of [-0.24,0.24]) {
        const cap=mesh(new THREE.CylinderGeometry(0.105,0.105,0.05,16),brass,x-0.2175,2.5,z);cap.rotation.x=Math.PI/2;
      }
      for(let j=0;j<9;j++) {
        const band=mesh(new THREE.TorusGeometry(0.097,0.009,4,16),iron,x-0.2175,2.5,-0.2+j*0.05);
        band.name='lever-grip-rib';
      }
      const arc=mesh(new THREE.TorusGeometry(0.54,0.035,6,32,Math.PI*0.8),brass,x,1.72,0.2);arc.rotation.z=0.3;
      for(let j=0;j<7;j++){const a=0.3+j*0.4;part(unitBox,brass,x+Math.cos(a)*0.54,1.72+Math.sin(a)*0.54,0.23,0.055,0.07,0.035);}
      // Status lamp already belongs to the causal mechanism; only add its bezel.
      for(const y of [1.39,1.71])part(unitBox,brass,x,y,0.515,0.6,0.035,0.045);
      for(const dx of [-0.3,0.3])part(unitBox,brass,x+dx,1.55,0.515,0.035,0.32,0.045);
    }

  for(const {g,m,matrices} of batches.values()) {const o=new THREE.InstancedMesh(g,m,matrices.length);matrices.forEach((v,i)=>o.setMatrixAt(i,v));o.castShadow=true;o.receiveShadow=true;o.computeBoundingSphere();root.add(o);}
  era.group.add(root);
}

