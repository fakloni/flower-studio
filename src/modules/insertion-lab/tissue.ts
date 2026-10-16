import * as THREE from 'three';
import type { Kind, Point } from './rod';
import { smooth, tissueOffset, type Bloom, type Contact } from './contact';
import { connectedVertices } from './mesh-components';

export type Tissue={mesh:THREE.Mesh;rest:Float32Array;target:Float32Array;mobility:Float32Array;active:boolean;leaf:boolean;displacement:number};

/** Clone only deforming geometry. Every instance owns its tissue buffers. */
export function prepareTissue(mesh:THREE.Mesh,kind:Kind,cloneGeometry=true):Tissue|null {
  const petal=mesh.name.includes('petal'),leaf=mesh.name.includes('leaf')&&!mesh.name.includes('vein');
  if(!petal&&!leaf)return null;
  if(cloneGeometry)mesh.geometry=mesh.geometry.clone();
  const position=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const rest=new Float32Array(position.array),target=rest.slice(),mobility=new Float32Array(position.count);
  const groups=connectedVertices(mesh.geometry);
  const p=new THREE.Vector3(),q=new THREE.Vector3(),points:THREE.Vector3[]=[];
  mesh.updateWorldMatrix(true,false);
  for(let i=0;i<position.count;i++)points.push(p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).clone());
  const axis=new THREE.Vector3(...(kind==='rose'?[0,.65,.76]:[0,1,0])).normalize();
  for(const group of groups) {
    if(petal){
      let lo=Infinity,hi=-Infinity;for(const i of group){const s=points[i].dot(axis);lo=Math.min(lo,s);hi=Math.max(hi,s);}
      for(const i of group)mobility[i]=smooth(((points[i].dot(axis)-lo)/Math.max(.001,hi-lo)-.12)/.60);
    }else{
      // Each connected leaf keeps its attachment: nearest point to the authored main stem.
      let anchor=group[0],near=Infinity;
      for(const i of group){const r=Math.hypot(points[i].x,points[i].z);if(r<near){near=r;anchor=i;}}
      q.copy(points[anchor]);let far=.001;for(const i of group)far=Math.max(far,points[i].distanceTo(q));
      for(const i of group)mobility[i]=smooth((points[i].distanceTo(q)/far-.08)/.8)*.85;
    }
  }
  return {mesh,rest,target,mobility,active:false,leaf,displacement:0};
}

const point=new THREE.Vector3(),offset=new THREE.Vector3(),inverse=new THREE.Matrix4(),local=new THREE.Vector3(),bounds=new THREE.Sphere();
export function targetTissue(tissue:Tissue,bloom:Bloom|null,contacts:Contact[],obstacles:Bloom[]) {
  const {mesh,rest,target,mobility}=tissue;
  if(tissue.leaf&&obstacles.length){
    if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
    bounds.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
    obstacles=obstacles.filter(other=>{
      const x=bounds.center.x-other.center[0],y=bounds.center.y-other.center[1],z=bounds.center.z-other.center[2];
      const reach=bounds.radius+Math.max(...other.radii)+.002;return x*x+y*y+z*z<=reach*reach;
    });
  }
  if((!tissue.leaf&&(!bloom||!contacts.length))||(tissue.leaf&&!obstacles.length)||mesh.geometry.drawRange.count===0){
    // An untouched flower has no deformation work. A previous dent still recovers normally.
    if(tissue.active||tissue.displacement>0){target.set(rest);tissue.active=true;}
    return;
  }
  inverse.copy(mesh.matrixWorld).invert();
  for(let i=0;i<mobility.length;i++) {
    const at=i*3;point.fromArray(rest,at).applyMatrix4(mesh.matrixWorld);offset.set(0,0,0);
    if(bloom&&!tissue.leaf&&contacts.length) {
      const relative=point.toArray().map((x,a)=>x-bloom.center[a]) as Point;
      offset.fromArray(tissueOffset(relative,mobility[i],contacts));
    }else if(tissue.leaf&&obstacles.length&&mobility[i]>.001){
      // Leaves only respond to other flower heads, never their own head or stem.
      for(const other of obstacles){
        local.set(point.x-other.center[0],point.y-other.center[1],point.z-other.center[2]);
        const distance=local.length();if(distance<.0001)continue;
        local.divideScalar(distance);
        const radius=Math.hypot(...other.axes.map((axis,a)=>(local.x*axis[0]+local.y*axis[1]+local.z*axis[2])*other.radii[a]));
        const penetration=radius-distance;
        if(penetration>0)offset.addScaledVector(local,Math.min(.002,penetration)*mobility[i]);
      }
      if(offset.length()>.002)offset.setLength(.002);
    }
    if(offset.lengthSq()===0){target[at]=rest[at];target[at+1]=rest[at+1];target[at+2]=rest[at+2];}
    else{local.copy(point).add(offset).applyMatrix4(inverse);target[at]=local.x;target[at+1]=local.y;target[at+2]=local.z;}
  }
  tissue.active=true;
}

/** Damped visual response with exact rest targets: no accumulating dents or floating roots. */
export function stepTissue(tissue:Tissue,dt:number):number {
  if(!tissue.active)return tissue.displacement;
  const position=tissue.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const array=position.array as Float32Array,alpha=1-Math.exp(-Math.min(dt,.05)/.095);
  let remaining=0,displacement=0,changed=false;
  for(let i=0;i<array.length;i++) {
    const delta=tissue.target[i]-array[i];remaining=Math.max(remaining,Math.abs(delta));
    array[i]=Math.abs(delta)<.000002?tissue.target[i]:array[i]+delta*alpha;
    if(delta!==0)changed=true;
    displacement=Math.max(displacement,Math.abs(array[i]-tissue.rest[i]));
  }
  if(changed){position.needsUpdate=true;tissue.mesh.geometry.computeVertexNormals();
    tissue.mesh.geometry.computeBoundingBox();tissue.mesh.geometry.computeBoundingSphere();}
  tissue.active=remaining>.000002;
  tissue.displacement=displacement;
  return displacement;
}
