import { FLOWERS, JOINTS, VESSELS, cloneRod, copyPoint, distance, innerRadius, placementFloor,supportMetrics,type Kind, type LabDesign, type Point, type Rod, type VesselId } from './rod';
import { boundedBend, placementGeometry, rotate, unit } from './placement-geometry';

export const MIN_INSERTION = .09;
export const modeOf = (design: LabDesign) => design.interaction ?? 'bend';
export const maxInsertion = (kind: Kind,vessel: VesselId,seated=false) => seated?FLOWERS[kind].length-.16:Math.min(VESSELS[vessel].height-.025,FLOWERS[kind].length-.16);

function mouthWithin(mouth:[number,number],kind:Kind,vessel:VesselId):[number,number] {
  const available = innerRadius(vessel,VESSELS[vessel].height)-FLOWERS[kind].radius-.0015;
  const radius=Math.hypot(...mouth),scale=radius>available?available/radius:1;
  return [mouth[0]*scale,mouth[1]*scale];
}

function pose(kind: Kind,id: string,vessel: VesselId,mouth:[number,number],direction:Point,insertion:number,twist:number,bend?:[number,number],seated?:true):Rod {
  const placement = { direction: unit(direction), insertion,...(seated?{seated}:{}),...(bend&&Math.hypot(...bend)>1e-10?{bend:boundedBend(kind,FLOWERS[kind].length,insertion,bend)}:{}) };
  const {points}=placementGeometry(kind,FLOWERS[kind].length,placement,mouth,twist,VESSELS[vessel].height);
  return {id,kind,mouth:[...mouth],twist,placement,guide:Math.floor(insertion/FLOWERS[kind].length*(JOINTS-1)),points,rest:points.map(copyPoint)};
}

/** Collision checks are independent of the visible model; never distort a stem to fit. */
const cavityCache=new WeakMap<ReturnType<typeof placementGeometry>,{floor:number;valid:boolean}>();
export function validPlacement(rod:Rod,vessel:VesselId):boolean {
  if(!rod.placement)return false;
  const {direction,insertion}=rod.placement,v=VESSELS[vessel],radius=FLOWERS[rod.kind].radius;
  if(insertion<MIN_INSERTION-1e-8||insertion>maxInsertion(rod.kind,vessel,rod.placement.seated)+1e-8||direction[1]<.5||rod.points[0][1]>v.height-.075)return false;
  if(rod.placement.bend&&Math.hypot(...rod.placement.bend)>Math.hypot(...boundedBend(rod.kind,FLOWERS[rod.kind].length,insertion,rod.placement.bend))+1e-8)return false;
  const geometry=placementGeometry(rod.kind,FLOWERS[rod.kind].length,rod.placement,rod.mouth,rod.twist,v.height);
  const floor=placementFloor(rod,vessel),cached=cavityCache.get(geometry);
  if(cached?.floor===floor){if(!cached.valid)return false;}
  else{
    let valid=true;
    for(const p of geometry.worldCurve()) {
      if(p[1]<floor-1e-9||(p[1]<=v.height+.00001&&Math.hypot(p[0],p[2])+radius+.0007>innerRadius(vessel,Math.min(v.height,p[1])))){valid=false;break;}
    }
    cavityCache.set(geometry,{floor,valid});if(!valid)return false;
  }
  return !rod.placement.seated||supportMetrics(rod,vessel).type!=='none';
}

/** Find a supported tilt, allowing the lower end to slide rather than pinning it in space. */
function supported(kind:Kind,id:string,vessel:VesselId,mouth:[number,number],desired:Point,insertion:number,twist:number,bend?:[number,number]):Rod {
  let anchor=mouthWithin(mouth,kind,vessel);
  let vertical=pose(kind,id,vessel,anchor,[0,1,0],insertion,twist,bend);
  for(let i=0;i<24&&!validPlacement(vertical,vessel);i++) {
    anchor=[anchor[0]*.85,anchor[1]*.85];vertical=pose(kind,id,vessel,anchor,[0,1,0],insertion,twist,bend);
  }
  const d=unit([desired[0],Math.max(.001,desired[1]),desired[2]]);
  const angle=Math.min(Math.PI/3,Math.acos(d[1]));
  const horizontal=Math.hypot(d[0],d[2]),heading: [number,number]=horizontal>1e-9?[d[0]/horizontal,d[2]/horizontal]:[0,1];
  const at=(theta:number)=>pose(kind,id,vessel,anchor,[Math.sin(theta)*heading[0],Math.cos(theta),Math.sin(theta)*heading[1]],insertion,twist,bend);
  const target=at(angle);if(validPlacement(target,vessel))return target;
  let lo=0,hi=angle,best=vertical;
  for(let i=0;i<12;i++) {const theta=(lo+hi)/2,candidate=at(theta);if(validPlacement(candidate,vessel)){lo=theta;best=candidate;}else hi=theta;}
  return best;
}

export function createPlacement(kind:Kind,id:string,vessel:VesselId,order=0):Rod {
  const angle=order*2.4;
  return supported(kind,id,vessel,[Math.sin(angle)*.007,Math.cos(angle)*.007],[Math.sin(angle)*.22,1,Math.cos(angle)*.22],.155,0);
}
export function initialPlacement():LabDesign {
  return {version:1,interaction:'place',vessel:'bud',rods:([['rose','rose-1'],['tulip','tulip-1'],['eucalyptus','eucalyptus-1']] as const).map(([kind,id],i)=>createPlacement(kind,id,'bud',i))};
}

export function toPlacement(input:Rod,vessel:VesselId):Rod {
  if(input.placement)return cloneRod(input);
  const tip=input.points[JOINTS-1],anchor:[number,number]=[...input.mouth];
  return supported(input.kind,input.id,vessel,anchor,[tip[0]-anchor[0],Math.max(.05,tip[1]-VESSELS[vessel].height),tip[2]-anchor[1]],Math.max(MIN_INSERTION,Math.min(maxInsertion(input.kind,vessel),input.guide*FLOWERS[input.kind].length/(JOINTS-1))),input.twist);
}

/** Drag rotates a plant about its existing mouth support, with optional small, bounded flex.
 * Depth and support translation are explicit controls, never hidden cursor-following variables.
 */
export function placeTip(input:Rod,requested:Point,vessel:VesselId,gentle=true,project?:(raw:Rod)=>Rod|null):Rod {
  const current=toPlacement(input,vessel),v=VESSELS[vessel],tip=current.points[JOINTS-1];
  const anchor:Point=[current.mouth[0],v.height,current.mouth[1]];
  const delta=requested.map((n,a)=>n-anchor[a]) as Point;
  if(Math.hypot(...delta)<.02||distance(tip,requested)<.0005)return current;
  const wanted=unit(delta),original=current.placement!.direction,depth=current.placement!.insertion;
  const oldBend:[number,number]=current.placement!.bend??[0,0];
  const actualDirection=unit(tip.map((n,a)=>n-anchor[a]) as Point);
  const turnDelta=wanted.map((n,a)=>n-actualDirection[a]) as Point;
  const axes=[rotate([1,0,0],original,current.twist),rotate([0,0,1],original,current.twist)];
  const newBend=gentle?boundedBend(current.kind,FLOWERS[current.kind].length,depth,
    axes.map((axis,i)=>oldBend[i]+axis.reduce((sum,n,a)=>sum+n*turnDelta[a],0)*.55) as [number,number]):oldBend;
  const at=(direction:Point,bend=newBend)=>pose(current.kind,current.id,vessel,current.mouth,direction,depth,current.twist,bend,current.placement!.seated);
  const accept=(raw:Rod)=>project?project(raw):validPlacement(raw,vessel)?raw:null;
  // Account for the authored natural curve without changing its twist or length.
  let desired:Point=[...original];
  for(let i=0;i<6;i++){
    const actual=unit(at(desired).points[JOINTS-1].map((n,a)=>n-anchor[a]) as Point);
    desired=unit(desired.map((n,a)=>n+wanted[a]-actual[a]) as Point);
  }
  const angle=Math.min(Math.PI/3,Math.acos(Math.max(-1,Math.min(1,desired[1]))));
  const horizontal=Math.hypot(desired[0],desired[2]);
  desired=horizontal>1e-10?[desired[0]/horizontal*Math.sin(angle),Math.cos(angle),desired[2]/horizontal*Math.sin(angle)]:[0,1,0];
  if(distance(original,desired)<1e-8&&Math.hypot(...newBend.map((n,i)=>n-oldBend[i]))<1e-8)return current;
  // Stop at the first blocked orientation rather than moving the support or seeking a new depth.
  const turn=Math.acos(Math.max(-1,Math.min(1,original.reduce((sum,n,a)=>sum+n*desired[a],0))));
  const steps=Math.max(1,Math.ceil(turn/(Math.PI/180)));
  const between=(t:number)=>at(unit(original.map((n,a)=>n*(1-t)+desired[a]*t) as Point),oldBend.map((n,i)=>n+(newBend[i]-n)*t) as [number,number]);
  let safe=0,best=current;
  for(let i=1;i<=steps;i++){
    const t=i/steps,candidate=accept(between(t));
    if(!candidate){
      let lo=safe,hi=t;
      for(let j=0;j<12;j++){const mid=(lo+hi)/2,test=accept(between(mid));if(test){lo=mid;best=test;}else hi=mid;}
      // Once the inserted stem reaches its support, only the small exposed flex may continue.
      if(gentle){const flexed=accept(at(best.placement!.direction,newBend));if(flexed)return flexed;}
      return best;
    }
    safe=t;best=candidate;
  }
  return best;
}

export function rebuildPlacement(input:Rod,vessel:VesselId,placement=input.placement!,mouth=input.mouth,twist=input.twist):Rod {
  return pose(input.kind,input.id,vessel,mouth,placement.direction,placement.insertion,twist,placement.bend,placement.seated);
}

export function interpolatePlacement(before:Rod,after:Rod,t:number,vessel:VesselId):Rod {
  if(!before.placement||!after.placement)return t<1?cloneRod(before):cloneRod(after);
  const a=before.placement,b=after.placement;
  return pose(before.kind,before.id,vessel,before.mouth.map((n,i)=>n+(after.mouth[i]-n)*t) as [number,number],
    unit(a.direction.map((n,i)=>n+(b.direction[i]-n)*t) as Point),a.insertion+(b.insertion-a.insertion)*t,
    before.twist+(after.twist-before.twist)*t,
    a.bend||b.bend?[0,1].map(i=>(a.bend?.[i]??0)+((b.bend?.[i]??0)-(a.bend?.[i]??0))*t) as [number,number]:undefined,
    a.seated&&b.seated?true:undefined);
}

export function adjustPlacement(input:Rod,vessel:VesselId,mouth=input.mouth,insertion=input.placement?.insertion??.155,twist=input.twist):Rod {
  const current=toPlacement(input,vessel);
  return supported(input.kind,input.id,vessel,mouth,current.placement!.direction,Math.max(MIN_INSERTION,Math.min(maxInsertion(input.kind,vessel),insertion)),twist,current.placement!.bend);
}
