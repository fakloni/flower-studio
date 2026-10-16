import * as THREE from 'three';
import type { Kind,Point } from './rod';
import { localStation, PLACEMENT_ASSETS, placementGeometry } from './placement-geometry';
import { connectedVertices } from './mesh-components';
import type { Tissue } from './tissue';

export type StemSweep={mesh:THREE.Mesh;original:Float32Array;source:Float32Array;stations:Float32Array;removable:Uint8Array;foliageStations:number[];indices:Uint32Array;groups:{start:number;count:number;materialIndex:number}[];foliageKey:string;inverse:THREE.Matrix4;signature:string};
type Geometry=ReturnType<typeof placementGeometry>;

/** Bind from the original connected asset. Floral parts follow their attachment as rigid patches;
 * only the main stem is swept continuously. Petals and leaves keep their authored proportions.
 */
export function prepareStemSweep(mesh:THREE.Mesh,kind:Kind,length:number):StemSweep {
  mesh.geometry=mesh.geometry.clone();
  const position=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const original=new Float32Array(position.array),source=new Float32Array(original.length),stations=new Float32Array(position.count);
  const removable=new Uint8Array(position.count);
  const existing=mesh.geometry.index;
  const indices=existing?Uint32Array.from(existing.array):Uint32Array.from({length:position.count},(_,i)=>i);
  const groups=mesh.geometry.groups.length?mesh.geometry.groups.map(group=>({...group,materialIndex:group.materialIndex??0})):[{start:0,count:indices.length,materialIndex:0}];
  // Reuse one GPU index buffer when the seating depth changes.
  mesh.geometry.setIndex(new THREE.BufferAttribute(indices.slice(),1));
  mesh.updateWorldMatrix(true,false);
  const inverse=mesh.matrixWorld.clone().invert(),p=new THREE.Vector3();
  const g=placementGeometry(kind,length,{direction:[0,1,0],insertion:.155},[0,0],0,0);
  for(let i=0;i<position.count;i++){
    p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).multiplyScalar(g.scale);
    source.set(p.toArray(),i*3);stations[i]=g.stationAt(p.y);
  }
  const head=mesh.name.includes('petal')||mesh.name.includes('flower-center');
  const trunk=mesh.name.includes('stem');
  for(const group of connectedVertices(mesh.geometry)){
    if(head){for(const i of group)stations[i]=length;continue;}
    let lo=Infinity,hi=-Infinity,root=group[0],nearest=Infinity,farthest=0;
    for(const i of group){
      lo=Math.min(lo,stations[i]);hi=Math.max(hi,stations[i]);
      const center=localStation(kind,length,stations[i]);
      const d=Math.hypot(source[i*3]-center[0],source[i*3+2]-center[2]);
      farthest=Math.max(farthest,d);
      if(d<nearest){nearest=d;root=i;}
    }
    // Exported hard normals may split the end caps away from the long trunk component.
    const trunkEnd=hi<.006||lo>length-.006;
    if(trunk&&(hi-lo>length*.7||farthest<.004*g.scale||trunkEnd))continue;
    let anchor=stations[root];
    const authoredHeight=PLACEMENT_ASSETS[kind].height;
    // Keep each leaf, its vein, and its short twig on one botanical junction.
    if(kind==='rose'){
      const nodes=[authoredHeight*.36,authoredHeight*.56].map(y=>g.stationAt(y*g.scale));
      anchor=nodes.reduce((a,b)=>Math.abs(a-anchor)<Math.abs(b-anchor)?a:b);
    }else if(kind==='eucalyptus'){
      const nodes=Array.from({length:9},(_,i)=>g.stationAt((.19+i*.047)*g.scale));
      anchor=nodes.reduce((a,b)=>Math.abs(a-anchor)<Math.abs(b-anchor)?a:b);
    }else if(kind==='tulip'&&!trunk)anchor=g.stationAt(.20*g.scale);
    for(const i of group){stations[i]=anchor;removable[i]=1;}
  }
  const foliageStations=[...new Set(Array.from(stations).filter((_,i)=>removable[i]))].sort((a,b)=>a-b);
  return {mesh,original,source,stations,removable,foliageStations,indices,groups,foliageKey:'',inverse,signature:''};
}

const p=new THREE.Vector3();
export function applyStemSweep(sweep:StemSweep,g:Geometry,bend:[number,number]|undefined,insertion:number,tissue?:Tissue,seated=false) {
  const signature=`${bend?.[0]??0}:${bend?.[1]??0}:${insertion}:${seated}`;
  if(sweep.signature===signature)return;
  sweep.signature=signature;
  const foliageKey=String(seated?sweep.foliageStations.filter(station=>station<insertion+.006).length:0);
  if(sweep.foliageKey!==foliageKey){
    sweep.foliageKey=foliageKey;
    const index=sweep.mesh.geometry.index!,array=index.array as Uint32Array;
    let cursor=0;sweep.mesh.geometry.clearGroups();
    for(const group of sweep.groups){
      const start=cursor;
      for(let i=group.start;i<group.start+group.count;i+=3){
        const a=sweep.indices[i];
        if(seated&&sweep.removable[a]&&sweep.stations[a]<insertion+.006)continue;
        array[cursor++]=a;array[cursor++]=sweep.indices[i+1];array[cursor++]=sweep.indices[i+2];
      }
      if(cursor>start)sweep.mesh.geometry.addGroup(start,cursor-start,group.materialIndex);
    }
    // Keep the buffer allocation fixed. Degenerate tail triangles contribute no normals.
    array.fill(0,cursor);index.needsUpdate=true;sweep.mesh.geometry.setDrawRange(0,cursor);
  }
  const position=sweep.mesh.geometry.getAttribute('position') as THREE.BufferAttribute,array=position.array as Float32Array;
  const bent=bend&&Math.hypot(...bend)>1e-10;
  // Cache a rigid section transform for each authored attachment/ring.
  const frames=new Map<number,{before:Point;after:Point;x:Point;y:Point;z:Point}>();
  for(let i=0;i<sweep.stations.length;i++){
    const at=i*3;let x=sweep.original[at],y=sweep.original[at+1],z=sweep.original[at+2];
    if(bent){
      const station=sweep.stations[i];let frame=frames.get(station);
      if(!frame){
        // Geometry supplies the exact same section transform used by the centreline/collider.
        const before=g.sourceAt(station),after=g.deform(before,station);
        frame={before,after,x:g.bendVector([1,0,0],station),y:g.bendVector([0,1,0],station),z:g.bendVector([0,0,1],station)};
        frames.set(station,frame);
      }
      const dx=sweep.source[at]-frame.before[0],dy=sweep.source[at+1]-frame.before[1],dz=sweep.source[at+2]-frame.before[2];
      p.set(frame.after[0]+dx*frame.x[0]+dy*frame.y[0]+dz*frame.z[0],
        frame.after[1]+dx*frame.x[1]+dy*frame.y[1]+dz*frame.z[1],
        frame.after[2]+dx*frame.x[2]+dy*frame.y[2]+dz*frame.z[2]).divideScalar(g.scale).applyMatrix4(sweep.inverse);
      x=p.x;y=p.y;z=p.z;
    }
    if(tissue){
      // Carry the previous tiny contact dent along with the new base shape; never accumulate it.
      array[at]+=x-tissue.rest[at];array[at+1]+=y-tissue.rest[at+1];array[at+2]+=z-tissue.rest[at+2];
      tissue.rest[at]=x;tissue.rest[at+1]=y;tissue.rest[at+2]=z;
    }else{array[at]=x;array[at+1]=y;array[at+2]=z;}
  }
  position.needsUpdate=true;sweep.mesh.geometry.computeVertexNormals();sweep.mesh.geometry.computeBoundingBox();sweep.mesh.geometry.computeBoundingSphere();
}
