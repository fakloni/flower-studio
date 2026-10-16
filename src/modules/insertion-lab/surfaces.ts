import * as THREE from 'three';
import type { Kind } from './rod';

export function surfaceGrain() {
  const size=128,bump=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const i=(y*size+x)*4;
    const grain=Math.sin(x*12.9898+y*78.233)*43758.5453%1;
    const vein=Math.sin(x/size*Math.PI*24+Math.sin(y/size*Math.PI*2)*.65);
    const h=Math.round(128+vein*14+grain*5),r=Math.round(205+vein*10+grain*8);
    bump.set([h,h,h,255],i);rough.set([r,r,r,255],i);
  }
  const texture=(data:Uint8Array)=>{const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;};
  return {bump:texture(bump),rough:texture(rough)};
}
type Grain=ReturnType<typeof surfaceGrain>;
export function flowerSurface(original:THREE.Material,name:string,kind:Kind,detailed:boolean,grain:Grain):THREE.Material {
  if(!(original instanceof THREE.MeshStandardMaterial))return original.clone();
  const petal=name.includes('petal'),leaf=name.includes('leaf')&&!name.includes('vein');
  let m:THREE.MeshStandardMaterial;
  if(detailed&&petal) {
    m=new THREE.MeshPhysicalMaterial({color:original.color,map:original.map,normalMap:original.normalMap,
      vertexColors:original.vertexColors,roughness:.67,metalness:0,sheen:.12,sheenColor:'#e5dfce',sheenRoughness:.8,
      specularIntensity:.4});
  }else m=original.clone();
  m.side=THREE.DoubleSide;m.envMapIntensity=.75;
  if(m.transparent&&m.map){m.alphaTest=.35;m.transparent=false;m.depthWrite=true;}
  if(detailed) {
    m.metalness=0;
    if(petal||leaf){m.bumpMap=grain.bump;m.bumpScale=petal?.00014:.00012;m.roughnessMap=grain.rough;}
    if(leaf){m.roughness=kind==='eucalyptus'?.94:.74;m.color.multiplyScalar(kind==='eucalyptus'?.89:.94);}
    if(!petal&&!leaf){m.roughness=.7;}
  }
  return m;
}

export function glassSurface() {
  // Transmission keeps reflections at full transparency. Opacity remains one.
  return new THREE.MeshPhysicalMaterial({color:'#f3faf6',metalness:0,roughness:.055,transmission:1,
    ior:1.46,thickness:.003,attenuationColor:'#d6e8df',attenuationDistance:.45,
    envMapIntensity:1,side:THREE.FrontSide,transparent:false,opacity:1});
}
