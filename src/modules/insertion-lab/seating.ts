import {FLOWERS,VESSELS,innerRadius,supportMetrics,type Point,type Rod,type VesselId} from './rod';
import {boundedBend,intrinsic,localStation,rotate} from './placement-geometry';
import {interpolatePlacement,maxInsertion,rebuildPlacement,validPlacement} from './placement';
/** Insert the unchanged plant along its own axis until the first floor / wall contact.
 * The short inserted part is rigid, so seating can be checked without rebuilding petal geometry.
 */
export function seatPlacement(input:Rod,vessel:VesselId):Rod|null {
  if(!input.placement)return null;
  const v=VESSELS[vessel],length=FLOWERS[input.kind].length,radius=FLOWERS[input.kind].radius;
  const direction=input.placement.direction,x=rotate([1,0,0],direction,input.twist),y=rotate([0,1,0],direction,input.twist),z=rotate([0,0,1],direction,input.twist);
  const transform=(p:Point):Point=>[p[0]*x[0]+p[1]*y[0]+p[2]*z[0],p[0]*x[1]+p[1]*y[1]+p[2]*z[1],p[0]*x[2]+p[1]*y[2]+p[2]*z[2]];
  const floor=v.supportFloor+radius*Math.hypot(direction[0],direction[2])+.00025;
  const source=intrinsic(input.kind,length).points.map(transform);
  const clear=(depth:number)=>{
    const mouth=transform(localStation(input.kind,length,depth));
    const origin:Point=[input.mouth[0]-mouth[0],v.height-mouth[1],input.mouth[1]-mouth[2]];
    const end=Math.ceil(depth/length*240);
    // Use original arc samples: nothing below the lip participates in gentle bending.
    for(let i=0;i<=end;i++){
      const p=i===end?mouth:source[i];
      const py=p[1]+origin[1];if(py<floor)return false;
      if(py<=v.height+.00001&&Math.hypot(p[0]+origin[0],p[2]+origin[2])+radius+.0009>innerRadius(vessel,Math.min(v.height,py)))return false;
    }
    return true;
  };
  let lo=Math.max(.09,.077/direction[1]),hi=maxInsertion(input.kind,vessel,true);
  if(lo>=hi||!clear(lo)||clear(hi))return null;
  for(let i=0;i<17;i++){const mid=(lo+hi)/2;if(clear(mid))lo=mid;else hi=mid;}
  for(let j=0;j<7;j++){
    const insertion=lo-j*.0001;
    const placement={...input.placement,seated:true as const,insertion,
      ...(input.placement.bend?{bend:boundedBend(input.kind,length,insertion,input.placement.bend)}:{})};
    const rod=rebuildPlacement(input,vessel,placement);
    if(validPlacement(rod,vessel)&&supportMetrics(rod,vessel).type!=='none')return rod;
  }
  return null;
}

/** Follow the support surface throughout contact sweeps; linear depth interpolation can cut the floor. */
export function supportedBetween(before:Rod,after:Rod,t:number,vessel:VesselId):Rod|null {
  if(t<=0)return before;if(t>=1)return after;
  const raw=interpolatePlacement(before,after,t,vessel);
  if(validPlacement(raw,vessel))return raw;
  return before.placement?.seated&&after.placement?.seated?(slideSupportedPlacement(before,raw,vessel)??seatPlacement(raw,vessel)):raw;
}

/** Project the mouth into the intersection of the actual inner-wall sections.
 * Each path sample retains its intended inserted length while the mouth slides along
 * the wall; a floor-supported cut follows the floor without intersecting it.
 */
export function slideSupportedPlacement(before:Rod,raw:Rod,vessel:VesselId):Rod|null {
  if(!raw.placement)return null;
  if(validPlacement(raw,vessel))return raw;
  const kind=raw.kind,v=VESSELS[vessel],length=FLOWERS[kind].length,radius=FLOWERS[kind].radius;
  const direction=raw.placement.direction;
  const x=rotate([1,0,0],direction,raw.twist),y=rotate([0,1,0],direction,raw.twist),z=rotate([0,0,1],direction,raw.twist);
  const transform=(p:Point):Point=>[p[0]*x[0]+p[1]*y[0]+p[2]*z[0],p[0]*x[1]+p[1]*y[1]+p[2]*z[1],p[0]*x[2]+p[1]*y[2]+p[2]*z[2]];
  const floor=v.supportFloor+radius*Math.hypot(direction[0],direction[2])+.00025;
  let insertion=raw.placement.insertion;
  if(supportMetrics(before,vessel).type==='floor'||v.height-transform(localStation(kind,length,insertion))[1]<floor){
    let lo=.09,hi=maxInsertion(kind,vessel,true);
    if(v.height-transform(localStation(kind,length,hi))[1]>floor)return null;
    for(let i=0;i<20;i++){const mid=(lo+hi)/2;if(v.height-transform(localStation(kind,length,mid))[1]>=floor)lo=mid;else hi=mid;}
    insertion=lo;
  }
  const atMouth=transform(localStation(kind,length,insertion));
  const sections:{x:number;z:number;r:number}[]=[];
  for(const source of intrinsic(kind,length).points){
    const p=transform(source),y=v.height+p[1]-atMouth[1];
    if(y>v.height+.00001)continue;if(y<floor-1e-8)return null;
    sections.push({x:atMouth[0]-p[0],z:atMouth[2]-p[2],r:innerRadius(vessel,Math.min(y,v.height))-radius-.0009});
  }
  // Include the exact lip between source samples, with a small picking/geometry margin.
  sections.push({x:0,z:0,r:innerRadius(vessel,v.height)-radius-.0017});
  const mouth:[number,number]=[...raw.mouth];
  for(let pass=0;pass<24;pass++){
    let correction=0;
    for(const s of sections){
      const dx=mouth[0]-s.x,dz=mouth[1]-s.z,d=Math.hypot(dx,dz);
      if(d>s.r){const shift=d-s.r;mouth[0]-=dx/d*shift;mouth[1]-=dz/d*shift;correction=Math.max(correction,shift);}
    }
    if(correction<1e-8)break;
  }
  if(sections.some(s=>Math.hypot(mouth[0]-s.x,mouth[1]-s.z)>s.r+1e-7))return null;
  const placement={...raw.placement,insertion,seated:true as const,
    ...(raw.placement.bend?{bend:boundedBend(kind,length,insertion,raw.placement.bend)}:{})};
  let candidate=rebuildPlacement(raw,vessel,placement,mouth);
  if(supportMetrics(candidate,vessel).type==='none'){
    // The nearest boundary of this convex feasible region is a wall support.
    let nearest:typeof sections[number]|undefined,gap=Infinity;
    for(const s of sections){const d=s.r-Math.hypot(mouth[0]-s.x,mouth[1]-s.z);if(d<gap){gap=d;nearest=s;}}
    if(!nearest)return null;
    const dx=mouth[0]-nearest.x,dz=mouth[1]-nearest.z,d=Math.hypot(dx,dz);
    const fallback=before.mouth,heading=d>1e-10?[dx/d,dz/d]:Math.hypot(...fallback)>1e-10?fallback.map(n=>n/Math.hypot(...fallback)):[1,0];
    mouth[0]+=heading[0]*gap;mouth[1]+=heading[1]*gap;
    candidate=rebuildPlacement(raw,vessel,placement,mouth);
  }
  return validPlacement(candidate,vessel)?candidate:null;
}
