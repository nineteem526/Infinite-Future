import * as THREE from 'three';
import type { Era } from './Era';

type Box = (x:number,y:number,z:number,w:number,h:number,d:number,color?:number,ry?:number)=>void;

/** Deterministic, world-space surface detail; no assets or random runtime work. */
function masonry(source: THREE.MeshStandardMaterial, future: boolean): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vStoneWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvStoneWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 vStoneWorld;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 surfaceNormal = normalize(cross(dFdx(vStoneWorld), dFdy(vStoneWorld)));
      vec3 axis = abs(surfaceNormal);
      vec2 st = axis.y > 0.7 ? vStoneWorld.xz : (axis.x > axis.z ? vStoneWorld.zy : vStoneWorld.xy);
      vec2 cellScale = axis.y > 0.7 ? vec2(1.25, 1.25) : vec2(1.6, 0.65);
      vec2 cell = st / cellScale;
      cell.x += mod(floor(cell.y), 2.0) * 0.5;
      vec2 edge = min(fract(cell), 1.0-fract(cell));
      vec2 aa = max(fwidth(cell), vec2(0.002));
      float joint = min(smoothstep(0.008, 0.008+aa.x, edge.x), smoothstep(0.012, 0.012+aa.y, edge.y));
      float grain = fract(sin(dot(floor(st*90.0),vec2(12.9898,78.233)))*43758.5453);
      float tile = fract(sin(dot(floor(cell),vec2(41.7,93.1)))*12415.13);
      diffuseColor.rgb *= (0.89 + tile*0.16) * (0.95 + grain*0.07) * mix(${future?'0.55':'0.7'},1.0,joint);
    `);
  };
  material.customProgramCacheKey = () => `world-stone-${future}`;
  return material;
}

export function dressExterior(era: Era, root: THREE.Group, box: Box): void {
  const future = era.id === '2126';
  const stone = future?0x657378:0xbbb49f;
  const trim = future?0x35454c:0x83755c;
  const roof = future?0x263d45:0x435a60;
  const windows = future?0x20333d:0x354c50;
  // Broad sky bounce keeps the ruined era readable on ordinary displays.
  root.add(new THREE.HemisphereLight(future ? 0xb1c9d5 : 0xc7dbdd, future ? 0x56646b : 0x827660, future ? 1.65 : 0.35));
  const cache = new Map<THREE.MeshStandardMaterial,THREE.MeshStandardMaterial>();
  // Structural meshes only: leave artwork, metal mechanisms, and imported assets intact.
  era.group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.name !== 'solid-box' || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    if (object.material.roughness < 0.85 || object.material.metalness > 0.1) return;
    let material = cache.get(object.material);
    if (!material) { material = masonry(object.material,future); cache.set(object.material,material); }
    object.material = material;
  });
  // Sky gradient lives in each era group and switches atomically with it.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(240,24,12),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    uniforms:{zenith:{value:new THREE.Color(future?0x333843:0x815e62)},horizon:{value:new THREE.Color(future?0x8d9299:0xd5a181)}},
    vertexShader:'varying vec3 vSky; void main(){vSky=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform vec3 zenith; uniform vec3 horizon; varying vec3 vSky; void main(){float h=clamp(normalize(vSky).y,0.0,1.0);gl_FragColor=vec4(mix(horizon,zenith,pow(h,0.55)),1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}',
  }));
  sky.name='era-sky'; sky.renderOrder=-10; root.add(sky);
  // City blocks outside playable boundaries: continuous midground, varied rooflines.
  const buildings: number[][]=[];
  for(let i=0;i<9;i++) {
    // North view is reserved for the paired city matte paintings.
    buildings.push([-48+i*12,48,9,8+(i*5)%12]);
    buildings.push([-47,-32+i*10,8,10+(i*3)%15]);
  }
  buildings.push([73,0,10,17],[76,19,9,23],[73,38,11,15]);
  buildings.forEach(([x,z,w,h],i)=>{
    const height=future?h*(0.65+(i%3)*0.08):h;
    box(x,height/2,z,w,height,8,stone);
    box(x,height+0.2,z,w+0.5,0.45,8.5,trim);
    box(x,height+1,z,w*0.85,1.2,7,roof);
    for(const face of [-1,1]) for(let wx=-w/2+1.1;wx<w/2;wx+=2.3) {
      for(let y=2;y<height-0.8;y+=2.8) {
        if(future && (Math.floor(y)+i)%5===0) continue;
        box(x+wx,y,z+face*4.02,1.05,1.65,0.05,windows);
        box(x+wx,y-0.88,z+face*4.06,1.3,0.12,0.18,trim);
      }
    }
    for(let y=3.1;y<height;y+=2.8) box(x,y,z,w+0.1,0.1,8.1,trim);
    if(i%3===0) box(x,height+2,z,0.5,3,0.5,trim);
  });
  // Clock tower stone courses, corner piers and clock bezel.
  const towerHeight=future?10:14;
  for(const x of [-3.75,3.75]) {
    box(x,towerHeight/2,-19.94,0.38,towerHeight,0.18,trim);
    for(let y=0.5;y<towerHeight;y+=0.7) box(x,y,-19.82,0.55,0.2,0.13,stone);
  }
  for(const y of future?[0.4,4.8,9.8]:[0.4,4.8,13.6,14.1,19.8]) box(0,y,-24,y>14?6.4:8.5,0.25,y>14?6.4:8.5,trim);
  const bezel=new THREE.Mesh(new THREE.TorusGeometry(2.47,0.105,8,64),new THREE.MeshStandardMaterial({color:trim,metalness:0.45,roughness:0.5}));
  bezel.position.set(0,future?8.2:10.4,-19.68); root.add(bezel);
  for(let i=0;i<12;i++) {
    if(future && i%3===0) continue;
    const a=i*Math.PI/6;
    box(Math.sin(a)*2.08,(future?8.2:10.4)+Math.cos(a)*2.08,-19.64,0.1,0.24,0.05,trim);
  }
  if(!future) {
    // Upper bell chamber slats sit on the existing tower, never in traversal space.
    for(const x of [-1.7,0,1.7]) {
      box(x,17,-20.98,0.9,3.3,0.05,windows);
      for(let y=15.5;y<18.7;y+=0.3) box(x,y,-20.92,0.95,0.09,0.08,trim);
    }
  }
  // Vegetation is confined beyond the retaining walls, leaving puzzle silhouettes clear.
  const leaves = new THREE.MeshStandardMaterial({color:future?0x45595a:0x657b55,roughness:1});
  const foliageGeometry=new THREE.IcosahedronGeometry(1,1);
  for(let i=0;i<22;i++) {
    const x=i<11?-29+i*6:-37, z=i<11?37:-28+(i-11)*6;
    const h=4+(i%4)*0.55;
    box(x,h/2,z,0.26,h,0.26,future?0x48504b:0x655342);
    for(let j=0;j<(future?1:3);j++) {
      const crown=new THREE.Mesh(foliageGeometry,leaves);
      crown.position.set(x+Math.sin(j*2.1)*0.8,h+j*0.45,z+Math.cos(j*2.1)*0.6);
      crown.scale.set(1.7,1.6,1.6); crown.castShadow=true; root.add(crown);
    }
  }
  // Subtle contact-darkening at walls, always a surface layer rather than a false obstacle.
  const contact=new THREE.MeshBasicMaterial({color:future?0x18252b:0x4b493c,transparent:true,opacity:0.16,depthWrite:false});
  for(const [x,z,w,d] of [[48,7.9,31,0.3],[38,14.1,12,0.3],[0,-19.8,8,0.3]]) {
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,d),contact);
    plane.rotation.x=-Math.PI/2; plane.position.set(x,0.023,z); root.add(plane);
  }
}




