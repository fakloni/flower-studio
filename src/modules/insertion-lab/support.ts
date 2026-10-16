import {FLOWERS,VESSELS,innerRadius,type Kind,type LabDesign,type Point,type Rod,type VesselId} from './rod';
import {unit} from './placement-geometry';
import {createPlacement,interpolatePlacement,placeTip,rebuildPlacement,validPlacement} from './placement';
import {stemClearance} from './stem-contact';
import {seatPlacement,slideSupportedPlacement} from './seating';
export {seatPlacement} from './seating';

export const SETTLE_DURATION=.18;

export function createSupportedPlacement(kind:Kind,id:string,vessel:VesselId,order=0):Rod {
  const seed=createPlacement(kind,id,vessel,order),seated=seatPlacement(seed,vessel);
  if(!seated)throw new Error('这支花暂时无法在当前花瓶内落座');return seated;
}

/** Find a clear mouth lane for a newly added stem. Existing flowers stay in place. */
export function fitSupportedPlacement(input:Rod,vessel:VesselId,others:Rod[]):Rod|null {
  if(!input.placement)return null;
  const direct=seatPlacement(input,vessel);
  if(direct&&stemClearance(direct,others)>=0)return direct;
  const available=innerRadius(vessel,VESSELS[vessel].height)-FLOWERS[input.kind].radius-.002;
  for(const radius of [.006,.012,.02,.03,.04]){
    if(radius>available)continue;
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8+others.length*2.4;
      const candidate=rebuildPlacement(input,vessel,input.placement,[Math.cos(a)*radius,Math.sin(a)*radius]);
      const rod=seatPlacement(candidate,vessel);if(rod&&stemClearance(rod,others)>=0)return rod;
    }
  }
  return null;
}

export function initialSupportedDesign():LabDesign {
  const vessel:VesselId='bud',rods:Rod[]=[];
  for(const [i,kind]of (['rose','tulip','eucalyptus'] as Kind[]).entries()){
    const seed=createPlacement(kind,`${kind}-1`,vessel,i),rod=fitSupportedPlacement(seed,vessel,rods);
    if(!rod)throw new Error('初始花材尚未找到互不穿插的落座位置');rods.push(rod);
  }
  return {version:1,interaction:'place',vessel,rods};
}

export function moveSupportedTip(input:Rod,requested:Point,vessel:VesselId,gentle=true):Rod {
  if(!input.placement?.seated)return placeTip(input,requested,vessel,gentle);
  const tip=input.points[24],available=innerRadius(vessel,VESSELS[vessel].height)-FLOWERS[input.kind].radius-.002;
  return placeTip(input,requested,vessel,gentle,raw=>{
    // Share the gesture between tilt and sliding mouth contact; depth follows the rigid pose.
    const delta=raw.points[24].map((n,i)=>n-tip[i]);
    let mouth:[number,number]=[input.mouth[0]+delta[0]*.55,input.mouth[1]+delta[2]*.55];
    const radius=Math.hypot(...mouth);if(radius>available)mouth=mouth.map(n=>n*available/radius) as [number,number];
    return seatPlacement(rebuildPlacement(raw,vessel,raw.placement,mouth),vessel);
  });
}

/** Explicit mouth / axial controls follow a continuous series of supported poses. */
export function adjustSupportedPlacement(input:Rod,requested:Rod,vessel:VesselId):Rod {
  const shift=Math.hypot(...input.mouth.map((n,i)=>n-requested.mouth[i]));
  const steps=Math.max(1,Math.ceil(shift/.001),Math.ceil(Math.abs(input.twist-requested.twist)/(Math.PI/36)));
  let best=input,safe=0;
  for(let i=1;i<=steps;i++){
    const t=i/steps,candidate=slideSupportedPlacement(input,interpolatePlacement(input,requested,t,vessel),vessel);
    if(!candidate){
      let lo=safe,hi=t;
      for(let j=0;j<12;j++){const mid=(lo+hi)/2,test=slideSupportedPlacement(input,interpolatePlacement(input,requested,mid,vessel),vessel);if(test){best=test;lo=mid;}else hi=mid;}
      return best;
    }
    best=candidate;safe=t;
  }
  return best;
}

export function settleSupportedRod(input:Rod,vessel:VesselId):Rod {
  if(!input.placement?.seated||!input.placement.bend)return input;
  const bend=input.placement.bend.map(n=>n*.96) as [number,number];
  const candidate=rebuildPlacement(input,vessel,{...input.placement,bend});
  return validPlacement(candidate,vessel)?candidate:input;
}

export function supportedContactStudy():LabDesign {
  const vessel:VesselId='glass',rods:Rod[]=[];
  for(const [i,side]of [-1,1].entries()){
    const seed=createPlacement('tulip',`contact-tulip-${i+1}`,vessel,i);
    const pose=rebuildPlacement(seed,vessel,{direction:unit([side*.22,1,0]),insertion:.155},[side*.022,side*.008],i*Math.PI);
    const seated=fitSupportedPlacement(pose,vessel,rods);if(!seated)throw new Error('双花试验未找到落座位置');rods.push(seated);
  }
  return {version:1,interaction:'place',vessel,rods};
}

