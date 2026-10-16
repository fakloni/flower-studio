import { FLOWERS, VESSELS, cloneRod, copyPoint, type LabDesign, type Point, type Rod, type VesselId } from './rod';
import { placementGeometry, unit } from './placement-geometry';
import { createPlacement, validPlacement } from './placement';
import { supportedBetween } from './seating';

/** Authored local head envelopes, metres before the instance scale. Not triangle collision. */
const HEADS = {
  rose: {center:[-.00322505,.61454332,.01958185] as Point,radii:[.038,.030,.035] as Point},
  tulip: {center:[.01290375,.41536897,-.008] as Point,radii:[.032,.044,.029] as Point},
};
export type Bloom = {id:string;center:Point;axes:Point[];radii:Point};
export type Contact = {direction:Point;radius:number;overlap:number};
// A light touch only: stop the whole plant before a large, rubber-like dent develops.
export const MAX_COMPRESSION = .004;
export const dot = (a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const smooth = (x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};

export function bloomOf(rod:Rod,vessel:VesselId):Bloom|null {
  if(!rod.placement||rod.kind==='eucalyptus')return null;
  const h=HEADS[rod.kind],g=placementGeometry(rod.kind,FLOWERS[rod.kind].length,rod.placement,rod.mouth,rod.twist,VESSELS[vessel].height);
  return {id:rod.id,center:g.world(h.center.map(x=>x*g.scale) as Point),
    radii:h.radii.map(x=>x*g.scale) as Point,
    axes:([[1,0,0],[0,1,0],[0,0,1]] as Point[]).map(p=>g.vectorAt(p,FLOWERS[rod.kind].length))};
}
export function support(bloom:Bloom,direction:Point):number {
  return Math.hypot(...bloom.axes.map((axis,i)=>dot(axis,direction)*bloom.radii[i]));
}
export function pairContact(a:Bloom,b:Bloom):{a:Contact;b:Contact}|null {
  const delta=b.center.map((n,i)=>n-a.center[i]) as Point,distance=Math.hypot(...delta);
  const direction:Point=distance>1e-9?delta.map(x=>x/distance) as Point:[1,0,0];
  const ra=support(a,direction),rb=support(b,direction),overlap=ra+rb-distance;
  if(overlap<=0)return null;
  return {a:{direction,radius:ra,overlap},b:{direction:direction.map(x=>-x) as Point,radius:rb,overlap}};
}
export function contactsFor(blooms:Bloom[]):Map<string,Contact[]> {
  const contacts=new Map<string,Contact[]>(blooms.map(b=>[b.id,[]]));
  for(let i=0;i<blooms.length;i++)for(let j=i+1;j<blooms.length;j++) {
    const contact=pairContact(blooms[i],blooms[j]);
    if(contact){contacts.get(blooms[i].id)!.push(contact.a);contacts.get(blooms[j].id)!.push(contact.b);}
  }
  return contacts;
}
/** Sweep along the requested rigid move, so a fast pointer jump cannot tunnel through a bloom.
 * Existing overlapping drafts may separate; they are never forced into an arbitrary new pose.
 */
export function limitBloomMove(before:Rod,requested:Rod,others:Rod[],vessel:VesselId):Rod {
  if(!before.placement||!requested.placement||before.kind==='eucalyptus')return requested;
  const allowed=bloomConstraint(before,others,vessel);
  if(!others.some(r=>r.id!==before.id&&r.kind!=='eucalyptus'))return requested;
  const at=(t:number)=>supportedBetween(before,requested,t,vessel);
  const oldBloom=bloomOf(before,vessel)!,newBloom=bloomOf(requested,vessel)!;
  const travel=Math.hypot(...oldBloom.center.map((x,i)=>x-newBloom.center[i]));
  const steps=Math.max(1,Math.ceil(travel/.0025));
  let safe=0,best=before;
  for(let i=1;i<=steps;i++) {
    const t=i/steps,candidate=at(t);
    if(!candidate||!allowed(candidate)||!validPlacement(candidate,vessel)) {
      let lo=safe,hi=t;
      for(let j=0;j<12;j++){const mid=(lo+hi)/2,test=at(mid);if(test&&allowed(test)&&validPlacement(test,vessel)){lo=mid;best=test;}else hi=mid;}
      return cloneRod(best);
    }
    safe=t;best=candidate;
  }
  return requested;
}

/** Build once for a pointer update, then share it with the stem's swept path. */
export function bloomConstraint(before:Rod,others:Rod[],vessel:VesselId):(rod:Rod)=>boolean {
  if(!before.placement||before.kind==='eucalyptus')return ()=>true;
  const neighbours=others.filter(r=>r.id!==before.id).flatMap(r=>{const b=bloomOf(r,vessel);return b?[b]:[];});
  if(!neighbours.length)return ()=>true;
  const overlap=(rod:Rod)=>{const b=bloomOf(rod,vessel)!;let depth=0;for(const other of neighbours)depth=Math.max(depth,pairContact(b,other)?.a.overlap??0);return depth;};
  const limit=Math.max(MAX_COMPRESSION,overlap(before));
  return rod=>overlap(rod)<=limit+1e-7;
}

/** A bounded directional dent; only the facing tissue responds and fixed roots remain fixed. */
export function tissueOffset(relative:Point,mobility:number,contacts:Contact[]):Point {
  const offset:Point=[0,0,0];
  for(const c of contacts) {
    const depth=Math.min(MAX_COMPRESSION,c.overlap),facing=dot(relative,c.direction);
    const influence=smooth((facing-(c.radius-depth*1.4))/(depth*1.7+.00001));
    const amount=depth*.55*influence*mobility;
    for(let a=0;a<3;a++)offset[a]-=c.direction[a]*amount;
  }
  const length=Math.hypot(...offset),max=MAX_COMPRESSION*.6*mobility;
  if(length>max&&length>0)for(let a=0;a<3;a++)offset[a]*=max/length;
  return offset;
}

export function contactStudy():LabDesign {
  const vessel:VesselId='glass';
  const rods=[-1,1].map((side,i)=>{
    const rod=createPlacement('tulip',`contact-tulip-${i+1}`,vessel,i);
    rod.mouth=[side*.014,0];rod.placement={direction:unit([side*.14,1,0]),insertion:.155};
    rod.twist=i*Math.PI;
    const g=placementGeometry(rod.kind,FLOWERS.tulip.length,rod.placement,rod.mouth,rod.twist,VESSELS[vessel].height);
    rod.points=g.points;rod.rest=g.points.map(copyPoint);return rod;
  });
  return {version:1,interaction:'place',vessel,rods};
}
