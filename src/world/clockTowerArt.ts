import * as THREE from 'three';
import type { Era } from './Era';

/** Visual-only clock tower shell. Existing simple structural colliders remain authoritative. */
export function refineClockTower(era: Era): void {
  const ruined=era.id==='2126';
  const root=new THREE.Group(); root.name='clock-tower-detail'; root.position.z=-24;
  // Retire the original face, hands and primitive crown, retaining solid structure.
  for(const child of era.group.children) {
    if(child instanceof THREE.Mesh && child.name!=='solid-box' && child.position.y>6 && Math.abs(child.position.x)<5 && child.position.z< -19 && child.position.z> -29) child.visible=false;
  }
  const stone=new THREE.MeshStandardMaterial({color:ruined?0x737d7c:0xc1b599,roughness:0.91});
  const edge=new THREE.MeshStandardMaterial({color:ruined?0x475754:0x8a795b,roughness:0.8});
  const brass=new THREE.MeshStandardMaterial({color:ruined?0x657c70:0xb99b55,metalness:0.68,roughness:ruined?0.8:0.36});
  const dark=new THREE.MeshStandardMaterial({color:0x172323,roughness:0.95});
  const copper=new THREE.MeshStandardMaterial({color:ruined?0x405b55:0x436962,metalness:0.4,roughness:0.64});
  const batches=new Map<THREE.Material,THREE.Matrix4[]>();
  const dummy=new THREE.Object3D();
  const box=(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material,rz=0)=>{
    dummy.position.set(x,y,z);dummy.rotation.set(0,0,rz);dummy.scale.set(w,h,d);dummy.updateMatrix();
    parent.updateWorldMatrix(true,false);
    // Face transforms relative to root; root's translation is applied only at draw time.
    const local=new THREE.Matrix4().copy(parent.matrixWorld);local.premultiply(new THREE.Matrix4().makeTranslation(0,0,24));
    const matrix=local.multiply(dummy.matrix);
    const list=batches.get(mat)??[];list.push(matrix);batches.set(mat,list);
  };
  const mesh=(parent:THREE.Object3D,g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number)=>{
    const object=new THREE.Mesh(g,m);object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
  };
  const ring=(parent:THREE.Object3D,r:number,t:number,x:number,y:number,z:number,mat:THREE.Material,start=0,length=Math.PI*2)=>{
    const object=mesh(parent,new THREE.TorusGeometry(r,t,8,64,length),mat,x,y,z);object.rotation.z=start;return object;
  };
  const arch=(face:THREE.Group,x:number,y:number,z:number,width:number,height:number)=>{
    box(face,x,y+height/2,z,width,height,0.04,dark);
    for(const side of [-1,1]) box(face,x+side*(width/2+0.11),y+height/2,z+0.08,0.2,height,0.19,stone);
    for(let i=0;i<11;i++) {
      if(ruined && i===3)continue;
      const a=i*Math.PI/10;
      box(face,x+Math.cos(a)*(width/2+0.1),y+height+Math.sin(a)*(width/2+0.1),z+0.08,0.22,0.28,0.22,stone,a-Math.PI/2);
    }
    box(face,x,y-0.08,z+0.1,width+0.6,0.18,0.28,edge);
    for(let j=1;j<9;j++) box(face,x,y+j*height/9,z+0.08,width,0.07,0.08,brass);
  };
  const clockHeight=ruined?8.2:10.4;
  // Clockwork is built on four faces, with identical north/south landmark height.
  for(let side=0;side<4;side++) {
    const face=new THREE.Group();face.rotation.y=side*Math.PI/2;root.add(face);
    const top=ruined?10:14;
    for(const x of [-3.67,3.67]) {
      box(face,x,top/2,4.045,0.48,top,0.14,edge);
      for(let y=0.45;y<top;y+=0.65) box(face,x,y,4.13,0.65,0.22,0.2,stone);
      if(!ruined) {
        mesh(face,new THREE.ConeGeometry(0.42,1.5,4),copper,x,14.9,3.65).rotation.y=Math.PI/4;
        box(face,x,13.8,3.65,0.75,0.35,0.75,stone);
      }
    }
    for(const y of ruined?[0.35,4.6,9.8]:[0.35,4.6,6.2,13.6]) {
      box(face,0,y,4.08,8.22,0.16,0.22,edge);
      box(face,0,y+0.16,4.16,8.4,0.1,0.32,stone);
      for(let x=-3.5;x<3.6;x+=0.42) if(!ruined || (Math.round(x*10)+side)%3!==0) box(face,x,y-0.2,4.11,0.18,0.22,0.25,stone);
    }
    arch(face,0,1.25,4.025,1.4,2.3);
    for(const x of [-2.25,2.25]) arch(face,x,2,4.025,0.65,1.7);
    // Clock dial: aged ivory sectors in 2026; missing quadrants expose gears in 2126.
    const dial=new THREE.MeshStandardMaterial({color:ruined?0x84908a:0xe5d8b2,roughness:0.82,emissive:ruined?0x000000:0x60451b,emissiveIntensity:0.25,side:THREE.DoubleSide});
    mesh(face,new THREE.CircleGeometry(2.34,64),dark,0,clockHeight,4.04);
    if(!ruined) mesh(face,new THREE.CircleGeometry(2.29,64),dial,0,clockHeight,4.08);
    else {
      for(const [start,length] of [[0.12,1.25],[2.4,1.15],[4.2,0.7]]) mesh(face,new THREE.RingGeometry(0.88,2.29,32,1,start,length),dial,0,clockHeight,4.12);
      for(const [gx,gy,r] of [[-0.65,-0.45,0.65],[0.55,0.4,0.8],[0.5,-0.9,0.4]]) {
        ring(face,r,0.055,gx,clockHeight+gy,4.09,brass);
        for(let t=0;t<16;t++) {const a=t*Math.PI/8;box(face,gx+Math.sin(a)*r,clockHeight+gy+Math.cos(a)*r,4.1,0.12,0.16,0.08,brass,-a);}
        for(let t=0;t<4;t++)box(face,gx,clockHeight+gy,4.1,r*1.8,0.055,0.07,brass,t*Math.PI/4);
      }
    }
    ring(face,2.43,0.12,0,clockHeight,4.17,edge,ruined?0.3:0,ruined?5.25:Math.PI*2);
    ring(face,2.3,0.035,0,clockHeight,4.24,brass);
    ring(face,1.7,0.022,0,clockHeight,4.22,brass);
    for(let i=0;i<60;i++) {
      if(ruined && (i>11&&i<23 || i>39&&i<47))continue;
      const a=i*Math.PI/30,r=2.15;
      box(face,Math.sin(a)*r,clockHeight+Math.cos(a)*r,4.25,i%5?0.025:0.07,i%5?0.09:0.22,0.025,brass,-a);
    }
    // Roman numerals as a transparent, locally drawn dial layer (no asset requests).
    if(typeof document!=='undefined') {
      const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
      const ctx=canvas.getContext('2d');
      if(ctx){ctx.fillStyle=ruined?'#283834':'#443724';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='54px Georgia';
        const numerals=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
        numerals.forEach((label,i)=>{if(ruined && [2,3,4,8,9].includes(i))return;const a=i*Math.PI/6;ctx.fillText(label,512+Math.sin(a)*405,512-Math.cos(a)*405);});
        const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
        mesh(face,new THREE.PlaneGeometry(4.25,4.25),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,toneMapped:false}),0,clockHeight,4.28);
      }
    }
    const hand=(length:number,angle:number,width:number)=>{box(face,Math.sin(angle)*length/2,clockHeight+Math.cos(angle)*length/2,4.34,width,length,0.07,brass,-angle);};
    hand(1.75,ruined?2.5:0.52,0.08); hand(1.12,ruined?-1.75:-1.15,0.13);
    mesh(face,new THREE.SphereGeometry(0.15,12,8),brass,0,clockHeight,4.37);
    if(!ruined) {
      for(const x of [-1.6,0,1.6]) arch(face,x,15,3.025,0.88,2.6);
      for(const y of [14.15,18.9,19.7]) box(face,0,y,3.1,6.3,0.2,0.25,stone);
    } else {
      // Torn upper buttresses and exposed iron trusses, all above the playable volume.
      for(let i=0;i<5;i++) {
        const x=-2.2+i*1.1,h=0.8+((i+side)*7%5)*0.32;
        box(face,x,14+h/2,2.5,0.25,h,0.3,edge,i%2?0.12:-0.08);
      }
      box(face,0,13.1,2.65,4.8,0.1,0.12,brass,0.4);
      box(face,0,12.8,2.65,4.8,0.1,0.12,brass,-0.45);
      for(let i=0;i<12;i++) {
        const y=4.8+i*0.38,x=1.6+Math.sin(i*1.7)*0.18;
        box(face,x,y,4.04,0.035,0.5,0.018,dark,Math.sin(i)*0.4);
      }
    }
  }
  if(!ruined) {
    mesh(root,new THREE.CylinderGeometry(2.7,3.05,0.45,8),edge,0,20,0);
    mesh(root,new THREE.ConeGeometry(2.8,5.6,8),copper,0,23,0).rotation.y=Math.PI/8;
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4+Math.PI/8;
      const start=new THREE.Vector3(Math.sin(a)*2.8,20.2,Math.cos(a)*2.8),end=new THREE.Vector3(0,25.8,0);
      const rib=mesh(root,new THREE.CylinderGeometry(0.035,0.06,start.distanceTo(end),6),brass,...start.clone().add(end).multiplyScalar(0.5).toArray() as [number,number,number]);
      rib.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());
    }
    mesh(root,new THREE.SphereGeometry(0.24,12,8),brass,0,25.9,0);
    mesh(root,new THREE.ConeGeometry(0.11,1.5,8),brass,0,26.65,0);
  }
  const unit=new THREE.BoxGeometry(1,1,1);
  for(const [mat,matrices] of batches){const batch=new THREE.InstancedMesh(unit,mat,matrices.length);matrices.forEach((m,i)=>batch.setMatrixAt(i,m));batch.castShadow=true;batch.receiveShadow=true;batch.computeBoundingSphere();root.add(batch);}
  era.group.add(root);
}
