import * as THREE from 'three';
import type { Era } from './Era';
import { refineClockTower } from './clockTowerArt';
import { refinePlazaProps } from './plazaPropArt';

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

export function dressExterior(era: Era, root: THREE.Group, _box: Box): void {
  const future = era.id === '2126';




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
  refineClockTower(era);
  refinePlazaProps(era);
  // Subtle contact-darkening at walls, always a surface layer rather than a false obstacle.
  const contact=new THREE.MeshBasicMaterial({color:future?0x18252b:0x4b493c,transparent:true,opacity:0.16,depthWrite:false});
  for(const [x,z,w,d] of [[48,7.9,31,0.3],[38,14.1,12,0.3],[0,-19.8,8,0.3]]) {
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,d),contact);
    plane.rotation.x=-Math.PI/2; plane.position.set(x,0.023,z); root.add(plane);
  }
}







