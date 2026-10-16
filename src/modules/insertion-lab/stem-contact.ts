import {FLOWERS,cloneRod,type Point,type Rod,type VesselId} from './rod';
import {rebuildPlacement,validPlacement} from './placement';
import {slideSupportedPlacement,supportedBetween} from './seating';
import {segmentDistanceSquared,segmentSeparation} from './segment-distance';
export {segmentDistance} from './segment-distance';

export function stemGap(a:Rod,b:Rod):number {
  let closest=Infinity;
  for(let i=1;i<a.points.length;i++)for(let j=1;j<b.points.length;j++){
    if(segmentBoxDistance(a.points[i-1],a.points[i],b.points[j-1],b.points[j])>=closest)continue;
    closest=Math.min(closest,segmentDistanceSquared(a.points[i-1],a.points[i],b.points[j-1],b.points[j]));
  }
  return Math.sqrt(closest)-FLOWERS[a.kind].radius-FLOWERS[b.kind].radius-.0005;
}
/** An exact lower bound: distant segment pairs never need the closest-point calculation. */
function segmentBoxDistance(a:Point,b:Point,c:Point,d:Point):number {
  let squared=0;for(let axis=0;axis<3;axis++){
    const gap=Math.max(0,Math.min(a[axis],b[axis])-Math.max(c[axis],d[axis]),Math.min(c[axis],d[axis])-Math.max(a[axis],b[axis]));squared+=gap*gap;
  }return squared;
}
export function stemClearance(rod:Rod,others:Rod[]):number {
  return Math.min(Infinity,...others.filter(r=>r.id!==rod.id).map(r=>stemGap(rod,r)));
}

/** Sweep full centreline capsules. A screen-space crossing can remain separated in depth. */
export function limitStemMove(before:Rod,after:Rod,others:Rod[],vessel:VesselId,slide=false,accept?:(rod:Rod)=>boolean):Rod {
  if(!before.placement||!after.placement)return after;
  const neighbours=others.filter(r=>r.id!==before.id);if(!neighbours.length)return after;
  const minimum=Math.min(0,stemClearance(before,neighbours));
  const travel=Math.max(...before.points.map((p,i)=>Math.hypot(...p.map((n,a)=>n-after.points[i][a]))));
  const steps=Math.max(1,Math.ceil(travel/.0018));let safe=0,best=before;
  let offset:[number,number]=[0,0];
  const allowed=(rod:Rod|null):rod is Rod=>!!rod&&validPlacement(rod,vessel)&&stemClearance(rod,neighbours)>=minimum-1e-8&&(!accept||accept(rod));
  for(let i=1;i<=steps;i++){
    const t=i/steps,raw=supportedBetween(before,after,t,vessel);
    let candidate=raw;
    if(slide&&raw?.placement?.seated&&(offset[0]!==0||offset[1]!==0||!allowed(raw))){
      candidate=offset[0]!==0||offset[1]!==0?slideSupportedPlacement(best,rebuildPlacement(raw,vessel,raw.placement,[raw.mouth[0]+offset[0],raw.mouth[1]+offset[1]]),vessel):raw;
      if(candidate&&!allowed(candidate))candidate=slideContacts(best,candidate,neighbours,vessel,minimum);
    }
    if(!allowed(candidate)){
      let lo=safe,hi=t;
      for(let j=0;j<12;j++){const mid=(lo+hi)/2,test=supportedBetween(before,after,mid,vessel);if(allowed(test)){lo=mid;best=test;}else hi=mid;}
      return cloneRod(best);
    }
    safe=t;best=candidate;
    if(slide&&raw)offset=[candidate.mouth[0]-raw.mouth[0],candidate.mouth[1]-raw.mouth[1]];
  }
  return slide?best:after;
}

function closestVector(a:Rod,b:Rod):Point {
  let first=1,second=1,minimum=Infinity;
  for(let i=1;i<a.points.length;i++)for(let j=1;j<b.points.length;j++){
    if(segmentBoxDistance(a.points[i-1],a.points[i],b.points[j-1],b.points[j])>=minimum)continue;
    const squared=segmentDistanceSquared(a.points[i-1],a.points[i],b.points[j-1],b.points[j]);
    if(squared<minimum){minimum=squared;first=i;second=j;}
  }
  return segmentSeparation(a.points[first-1],a.points[first],b.points[second-1],b.points[second]);
}

/** Project a small blocked step onto the neighbouring stem's tangent, keeping the old
 * side of contact. Only mouth translation is corrected; stem length and shape are untouched.
 */
function slideContacts(before:Rod,input:Rod,others:Rod[],vessel:VesselId,minimum:number):Rod|null {
  let rod=input;
  for(let pass=0;pass<12;pass++){
    let moved=false;
    for(const other of others){
      const vector=closestVector(rod,other),distance=Math.hypot(...vector),required=FLOWERS[rod.kind].radius+FLOWERS[other.kind].radius+.0005+minimum;
      if(distance>=required)continue;
      const old=closestVector(before,other);
      // A closest-point normal must not flip across the obstacle on a fast step.
      const normal=vector.reduce((sum,n,i)=>sum+n*old[i],0)>0?vector:old;
      const horizontal=Math.hypot(normal[0],normal[2]);if(horizontal<1e-9)return null;
      const push=Math.min(.002,(required-distance+.000015)*Math.hypot(...normal)/horizontal);
      const raw=rebuildPlacement(rod,vessel,rod.placement,[rod.mouth[0]+normal[0]/horizontal*push,rod.mouth[1]+normal[2]/horizontal*push]);
      const projected=slideSupportedPlacement(before,raw,vessel);if(!projected)return null;
      rod=projected;moved=true;
    }
    if(stemClearance(rod,others)>=minimum-1e-8&&validPlacement(rod,vessel))return rod;
    if(!moved)return null;
  }
  return null;
}
