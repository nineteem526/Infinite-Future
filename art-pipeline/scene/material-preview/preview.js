import * as THREE from '/node_modules/three/build/three.module.js';
import {createEra2026} from '/src/world/eras/era2026.ts';
import {createEra2126} from '/src/world/eras/era2126.ts';
import {addSolidVisuals} from '/src/world/geometry.ts';
const status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.05,500);camera.position.set(5,2.0,19.5);camera.lookAt(0,9,-24);
let texture,enabled=true,current='2026';const groups={};const source={};
try{
 texture=await new THREE.TextureLoader().loadAsync('./sandstone-preview-1k.jpg');texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,2);texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 for(const build of [createEra2026(),createEra2126()]){
  const group=new THREE.Group();addSolidVisuals(group,build.solids);build.decorate(group);const l=build.lighting;
  group.add(new THREE.HemisphereLight(l.hemi.skyColor,l.hemi.groundColor,l.hemi.intensity),new THREE.AmbientLight(l.ambient.color,l.ambient.intensity));
  const sun=new THREE.DirectionalLight(l.sun.color,l.sun.intensity);sun.position.set(...l.sun.position);group.add(sun);if(build.id==='2126')group.add(new THREE.AmbientLight(0xb5c4d3,0.8));scene.add(group);groups[build.id]=group;source[build.id]=build;
  const stone=build.id==='2026'?new Set([0xe8d8b8,0xdcc9a6,0xe7d8bd,0xd2bd95,0xcdb890]):new Set([0x474c52,0x5b6065,0x63676b,0x555a5f]);
  group.traverse(obj=>{if(!obj.isMesh||!obj.material||!stone.has(obj.material.color?.getHex()))return;const m=obj.material.clone();m.map=texture;m.color.set(build.id==='2026'?0xffffff:0xb4c0ca);m.needsUpdate=true;obj.material=m;obj.userData.stonePreview=true;});
 }
 function activate(id){current=id;for(const k of Object.keys(groups))groups[k].visible=k===id;const l=source[id].lighting;scene.background=new THREE.Color(l.background);scene.fog=new THREE.FogExp2(l.fogColor,l.fogDensity);renderer.toneMappingExposure=id==='2126'?1.1:l.exposure;status.textContent=`${id} · ${enabled?'预览贴图已加载':'贴图已关闭'} · 仅视觉测试`;document.documentElement.dataset.preview='ready';}
 document.querySelector('#past').onclick=()=>activate('2026');document.querySelector('#future').onclick=()=>activate('2126');document.querySelector('#toggle').onclick=()=>{enabled=!enabled;for(const g of Object.values(groups))g.traverse(o=>{if(o.userData.stonePreview){o.material.map=enabled?texture:null;o.material.needsUpdate=true;}});activate(current)};activate(current);
 window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});renderer.setAnimationLoop(()=>renderer.render(scene,camera));
}catch(e){status.textContent=`预览加载失败：${e.message}`;document.documentElement.dataset.preview='error';console.error(e)}


