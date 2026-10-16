import { boundedBend, placementGeometry, type Placement } from './placement-geometry';
import {segmentDistance} from './segment-distance';

/** Metres. The legacy bend prototype remains available as a separate comparison. */
export type Point = [number, number, number];
export type Kind = 'rose' | 'tulip' | 'eucalyptus';
export type VesselId = 'bud' | 'wide' | 'glass';
export const JOINTS = 25;
export const FLOWERS = {
  rose: { name: '白玫瑰', length: .52, radius: .0025, bendCompliance: .000002, color: '#d3a18e', model: '/assets/insertion-lab/v3/rose.glb', thumb: '/assets/catalog/P052/pilot-model-v2/head-front.webp' },
  tulip: { name: '白郁金香', length: .46, radius: .0026, bendCompliance: .000012, color: '#c9c5a7', model: '/assets/insertion-lab/v3/tulip.glb', thumb: '/assets/workbench/white-tulip-thumb.webp?v=3' },
  eucalyptus: { name: '银叶桉', length: .58, radius: .0022, bendCompliance: .000005, color: '#6d8a79', model: '/assets/insertion-lab/v3/eucalyptus.glb', thumb: '/assets/catalog/P067/pilot-model-v2/head-front.webp' },
} as const;
export const VESSELS = {
  bud: { name: '细口陶瓷瓶', height: .232, floor: .012, supportFloor:.009, wall: .004, model: '/assets/sample-pack/ivory-bud.glb', profile: [[0,.034],[.035,.043],[.15,.067],[.32,.075],[.51,.062],[.69,.034],[.84,.022],[1,.025]] },
  wide: { name: '宽口竖纹瓶', height: .262, floor: .012, supportFloor:.009, wall: .006, model: '/assets/sample-pack/sage-fluted.glb', profile: [[0,.053],[.04,.055],[.23,.061],[.52,.067],[.78,.063],[1,.053]] },
  glass: { name: '清透玻璃瓶', height: .2715, floor: .012, supportFloor:.009, wall: .003, model: '/assets/vases/smoke-glass.glb', profile: [[0,.052],[.025,.057],[.12,.059],[.45,.060],[.78,.060],[1,.059]] },
} as const;
export type Interaction = 'place' | 'bend';
export type Rod = { id: string; kind: Kind; points: Point[]; rest: Point[]; guide: number; mouth: [number, number]; twist: number; placement?: Placement };
export type LabDesign = { version: 1; vessel: VesselId; rods: Rod[]; interaction?: Interaction };
export const copyPoint = (p: Point): Point => [...p];
export const distance = (a: Point,b: Point) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export const cloneRod = (rod: Rod): Rod => ({...rod, ...(rod.placement?{placement:{...rod.placement,direction:copyPoint(rod.placement.direction),...(rod.placement.bend?{bend:[...rod.placement.bend] as [number,number]}:{})}}:{}), mouth: [...rod.mouth], points: rod.points.map(copyPoint), rest: rod.rest.map(copyPoint)});
export const cloneDesign = (design: LabDesign): LabDesign => ({...design, rods: design.rods.map(cloneRod)});

/** Clearance for the tilted flat cut of a stem, rather than a spherical floating end. */
export function placementFloor(rod:Rod,vessel:VesselId):number {
  return rod.placement?.seated&&Array.isArray(rod.placement.direction)?VESSELS[vessel].supportFloor+FLOWERS[rod.kind].radius*Math.hypot(rod.placement.direction[0],rod.placement.direction[2])+.00025
    :VESSELS[vessel].floor+FLOWERS[rod.kind].radius+.0007;
}
export function supportMetrics(rod:Rod,vessel:VesselId):{type:'floor'|'wall'|'none';floorGap:number;wallGap:number;point:Point} {
  const floorGap=rod.points[0][1]-placementFloor(rod,vessel);
  let wallGap=Infinity,point=copyPoint(rod.points[0]);
  for(let i=1;i<rod.points.length;i++)for(let j=0;j<=4;j++){
    const p=rod.points[i].map((n,a)=>n*j/4+rod.points[i-1][a]*(1-j/4)) as Point;
    if(p[1]>VESSELS[vessel].height+.00001)continue;
    const gap=innerRadius(vessel,p[1])-FLOWERS[rod.kind].radius-.0007-Math.hypot(p[0],p[2]);
    if(gap<wallGap){wallGap=gap;point=p;}
  }
  if(rod.placement?.seated&&floorGap<=.0012)return {type:'floor',floorGap,wallGap,point:copyPoint(rod.points[0])};
  return {type:rod.placement?.seated&&wallGap<=.0012?'wall':'none',floorGap,wallGap,point};
}

/** The same Hermite profile as the authored vase, with a conservative inner margin. */
export function innerRadius(vessel: VesselId, y: number): number {
  const v = VESSELS[vessel]; const z = Math.max(0,Math.min(1,y/(v.height-.002)));
  const profile: readonly (readonly number[])[] = v.profile;
  for(let i=0;i<profile.length-1;i++) {
    const [z0,r0]=profile[i], [z1,r1]=profile[i+1];
    if(z<=z1) {
      const prev=profile[Math.max(0,i-1)], next=profile[Math.min(profile.length-1,i+2)];
      const t=(z-z0)/(z1-z0), m0=(r1-prev[1])/(z1-prev[0]), m1=(next[1]-r0)/(next[0]-z0);
      return (2*t**3-3*t*t+1)*r0+(t**3-2*t*t+t)*m0*(z1-z0)+(-2*t**3+3*t*t)*r1+(t**3-t*t)*m1*(z1-z0)-v.wall-.001;
    }
  }
  return profile[profile.length-1][1]-v.wall-.001;
}

function clampMouth(mouth: [number,number], vessel: VesselId, radius: number): [number,number] {
  const available=innerRadius(vessel,VESSELS[vessel].height)-radius-.001;
  const length=Math.hypot(...mouth), scale=length>available ? available/length : 1;
  return [mouth[0]*scale,mouth[1]*scale];
}

function pinAndContact(rod: Rod,vessel: VesselId) {
  const v=VESSELS[vessel], radius=FLOWERS[rod.kind].radius;
  const root=rod.rest[0]; rod.points[0]=copyPoint(root);
  rod.points[rod.guide]=[rod.mouth[0],v.height,rod.mouth[1]];
  for(let i=1;i<rod.points.length;i++) {
    if(i===rod.guide) continue;
    const p=rod.points[i];
    if(i<rod.guide) p[1]=Math.max(v.floor+radius,Math.min(v.height,p[1]));
    // Retain the strand's topology: inserted nodes stay inside; upper nodes stay above the lip.
    else p[1]=Math.max(v.height+radius,p[1]);
    if(p[1]<=v.height) {
      const r=Math.max(0,innerRadius(vessel,p[1])-radius-.0002), d=Math.hypot(p[0],p[2]);
      if(d>r) {p[0]*=r/d;p[2]*=r/d;}
    }
  }
  // A segment can cut across a concave bottle shoulder even when both endpoints are inside.
  for(let i=1;i<=rod.guide;i++) {
    const a=rod.points[i-1],b=rod.points[i],wa=i===1?0:1,wb=i===rod.guide?0:1;
    for(let j=1;j<4;j++) {
      const t=j/4,x=a[0]*(1-t)+b[0]*t,y=a[1]*(1-t)+b[1]*t,z=a[2]*(1-t)+b[2]*t;
      const radial=Math.hypot(x,z),limit=Math.max(0,innerRadius(vessel,y)-radius-.0002);
      if(radial<=limit||radial<1e-9)continue;
      const divisor=wa*(1-t)**2+wb*t*t;if(!divisor)continue;
      const push=(radial-limit)/divisor;
      a[0]-=x/radial*push*wa*(1-t);a[2]-=z/radial*push*wa*(1-t);
      b[0]-=x/radial*push*wb*t;b[2]-=z/radial*push*wb*t;
    }
  }
}

/** Accumulated XPBD distance multipliers; second-neighbour distances resist bending. */
function relax(rod: Rod,vessel: VesselId,iterations=100) {
  const ds=FLOWERS[rod.kind].length/(JOINTS-1);
  const constraints: {a:number;b:number;length:number;alpha:number;lambda:number}[]=[];
  for(let i=0;i<JOINTS-1;i++) constraints.push({a:i,b:i+1,length:ds,alpha:0,lambda:0});
  const alpha=FLOWERS[rod.kind].bendCompliance/(1/60)**2;
  for(let i=0;i<JOINTS-2;i++) constraints.push({a:i,b:i+2,length:distance(rod.rest[i],rod.rest[i+2]),alpha,lambda:0});
  const weight=(i:number)=>i===0||i===rod.guide ? 0 : 1;
  for(let iteration=0;iteration<iterations;iteration++) {
    // Alternate traversal so both ends receive comparable convergence.
    const list=iteration%2 ? constraints : [...constraints].reverse();
    for(const c of list) {
      const a=rod.points[c.a],b=rod.points[c.b], d=distance(a,b); if(d<1e-9)continue;
      const wa=weight(c.a),wb=weight(c.b), divisor=wa+wb+c.alpha; if(!divisor)continue;
      const lambda=(-(d-c.length)-c.alpha*c.lambda)/divisor; c.lambda+=lambda;
      for(let axis=0;axis<3;axis++) {const delta=(b[axis]-a[axis])/d*lambda;a[axis]-=wa*delta;b[axis]+=wb*delta;}
    }
    pinAndContact(rod,vessel);
  }
  // Polish the inserted chain's hard lengths after compliant bending has converged.
  // Near a narrow neck, contact projection and length projection need extra alternating sweeps.
  for(let sweep=0;sweep<400;sweep++) {
    let error=0;
    for(let j=0;j<rod.guide;j++) {
      const i=sweep%2 ? j : rod.guide-1-j;
      const a=rod.points[i],b=rod.points[i+1],d=distance(a,b);
      if(d<1e-9)continue;error=Math.max(error,Math.abs(d-ds));
      const wa=weight(i),wb=weight(i+1),sum=wa+wb;if(!sum)continue;
      for(let axis=0;axis<3;axis++){const delta=(b[axis]-a[axis])*(d-ds)/d/sum;a[axis]+=wa*delta;b[axis]-=wb*delta;}
    }
    pinAndContact(rod,vessel);
    if(error<.00012)break;
  }
  // Remove residual stretch in the exposed section; this also bounds reachable head positions.
  for(let i=rod.guide+1;i<JOINTS;i++) {
    const a=rod.points[i-1],b=rod.points[i];
    b[1]=Math.max(a[1]+ds*.12,b[1]);
    const d=distance(a,b);
    for(let axis=0;axis<3;axis++) b[axis]=a[axis]+(b[axis]-a[axis])*ds/d;
  }
}

export function createRod(kind: Kind,id: string,vessel: VesselId,order=0): Rod {
  const v=VESSELS[vessel], ds=FLOWERS[kind].length/(JOINTS-1);
  const guide=Math.max(4,Math.floor(Math.min(.17,v.height-.04)/ds));
  const mouth=clampMouth([Math.sin(order*2.4)*.009,Math.cos(order*2.4)*.009],vessel,FLOWERS[kind].radius);
  const root: Point=[mouth[0]*.4,v.height-guide*ds*.96,mouth[1]*.4];
  const points: Point[]=Array.from({length:JOINTS},(_,i)=> {
    if(i<=guide) {const t=i/guide;return [root[0]+(mouth[0]-root[0])*t+.006*Math.sin(t*Math.PI),root[1]+(v.height-root[1])*t,root[2]+(mouth[1]-root[2])*t];}
    const s=(i-guide)*ds,angle=order*2.4;
    return [mouth[0]+Math.sin(angle)*s*.3,v.height+s*Math.sqrt(1-.3**2),mouth[1]+Math.cos(angle)*s*.3];
  });
  const rod: Rod={id,kind,guide,mouth,twist:0,points,rest:points.map(copyPoint)};
  relax(rod,vessel,240);rod.rest=rod.points.map(copyPoint);return rod;
}
export function initialDesign(): LabDesign {
  return {version:1,vessel:'bud',rods:([['rose','rose-1'],['tulip','tulip-1'],['eucalyptus','eucalyptus-1']] as const).map(([kind,id],i)=>createRod(kind,id,'bud',i))};
}

export function moveTip(input: Rod,requested: Point,vessel: VesselId): Rod {
  const rod=cloneRod(input),v=VESSELS[vessel], guide=rod.points[rod.guide];
  const exposed=FLOWERS[rod.kind].length*(1-rod.guide/(JOINTS-1));
  const target: Point=[requested[0],Math.max(v.height+exposed*.2,requested[1]),requested[2]];
  const reach=distance(target,guide);
  if(reach>exposed*.997) for(let a=0;a<3;a++)target[a]=guide[a]+(target[a]-guide[a])*exposed*.997/reach;
  const old=rod.points[JOINTS-1],total=distance(old,target);
  const steps=Math.min(30,Math.max(1,Math.ceil(total/.012)));
  let lastValid=cloneRod(input);
  for(let step=0;step<steps;step++) {
    const tip=rod.points[JOINTS-1],remaining=steps-step;
    const delta=target.map((n,a)=>(n-tip[a])/remaining) as Point;
    for(let i=rod.guide+1;i<JOINTS;i++) {
      const t=(i-rod.guide)/(JOINTS-1-rod.guide);
      for(let a=0;a<3;a++)rod.points[i][a]+=delta[a]*t*t;
    }
    relax(rod,vessel,100);
    const validity=metrics(rod,vessel);
    if(validity.lengthError>.0008||validity.penetration>.0004||validity.maxBend>55)return lastValid;
    lastValid=cloneRod(rod);
  }
  // Keep the last feasible intermediate pose when the requested destination is unreachable.
  return lastValid;
}

export function settleRod(rod: Rod): Rod {
  // Creative editing commits a new equilibrium; do not spring back to the bind pose.
  const result=cloneRod(rod);result.rest=result.points.map(copyPoint);return result;
}

export function reposition(input: Rod,vessel: VesselId,mouth=input.mouth,guide=input.guide): Rod {
  const v=VESSELS[vessel],ds=FLOWERS[input.kind].length/(JOINTS-1);
  guide=Math.max(Math.ceil(.09/ds),Math.min(Math.floor((v.height-v.floor-.012)/ds),guide));
  const fresh=createRod(input.kind,input.id,vessel);fresh.guide=guide;
  fresh.mouth=clampMouth(mouth,vessel,FLOWERS[input.kind].radius);fresh.twist=input.twist;
  const rootY=v.height-guide*ds*.96,oldTip=input.points[JOINTS-1];
  const delta=[fresh.mouth[0]-input.mouth[0],v.height-input.points[input.guide][1],fresh.mouth[1]-input.mouth[1]];
  fresh.points=Array.from({length:JOINTS},(_,i):Point=> {
    if(i<=guide){const t=i/guide;return [fresh.mouth[0]*(.4+.6*t)+.006*Math.sin(Math.PI*t),rootY+(v.height-rootY)*t,fresh.mouth[1]*(.4+.6*t)];}
    const station=input.guide+(i-guide)/(JOINTS-1-guide)*(JOINTS-1-input.guide);
    const j=Math.min(JOINTS-2,Math.floor(station)),t=station-j;
    return input.points[j].map((n,a)=>n*(1-t)+input.points[j+1][a]*t+delta[a]) as Point;
  });
  fresh.rest=fresh.points.map(copyPoint);relax(fresh,vessel,300);
  const result=settleRod(moveTip(fresh,[oldTip[0]+delta[0],oldTip[1]+delta[1],oldTip[2]+delta[2]],vessel));
  const validity=metrics(result,vessel);
  if(validity.lengthError>.0008||validity.penetration>.0004||validity.maxBend>55) {
    const fallback=createRod(input.kind,input.id,vessel);fallback.twist=input.twist;return fallback;
  }
  return result;
}

export function metrics(rod: Rod,vessel: VesselId) {
  const ds=FLOWERS[rod.kind].length/(JOINTS-1);let lengthError=0,penetration=0,maxBend=0;
  for(let i=1;i<JOINTS;i++) {
    lengthError=Math.max(lengthError,Math.abs(distance(rod.points[i],rod.points[i-1])-ds));
    // Sample whole segments, not only joints, against the concave inner profile.
    for(let j=0;j<=8;j++) {
      const p=rod.points[i].map((n,a)=>n*j/8+rod.points[i-1][a]*(1-j/8)) as Point;
      if(p[1]<=VESSELS[vessel].height)penetration=Math.max(penetration,Math.hypot(p[0],p[2])+FLOWERS[rod.kind].radius-innerRadius(vessel,p[1]),(rod.placement?.seated?placementFloor(rod,vessel):VESSELS[vessel].floor+FLOWERS[rod.kind].radius)-p[1]);
    }
    if(i<JOINTS-1){const a=rod.points[i-1],b=rod.points[i],c=rod.points[i+1];const dot=a.reduce((sum,n,k)=>sum+(b[k]-n)*(c[k]-b[k]),0)/(distance(a,b)*distance(b,c));maxBend=Math.max(maxBend,Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI);}
  }
  return {lengthError,penetration:Math.max(0,penetration),maxBend,insertion:rod.placement?.insertion??rod.guide*ds};
}

/** Validate before applying a save: arbitrary JSON must not create impossible geometry. */
export function parseDesign(value: unknown): LabDesign {
  const d=value as LabDesign;
  if(!d||d.version!==1||!Object.hasOwn(VESSELS,d.vessel)||!Array.isArray(d.rods)||d.rods.length>15)throw new Error('草稿格式不正确');
  if(d.interaction!==undefined&&d.interaction!=='place'&&d.interaction!=='bend')throw new Error('草稿交互模式不正确');
  const ids=new Set<string>();
  for(const r of d.rods) {
    const point=(p:unknown):p is Point=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<2);
    if(!r||typeof r.id!=='string'||!r.id||r.id.length>100||ids.has(r.id)||!Object.hasOwn(FLOWERS,r.kind)||!Number.isInteger(r.guide)||r.guide<3||r.guide>JOINTS-5||!Array.isArray(r.points)||r.points.length!==JOINTS||!r.points.every(point)||!Array.isArray(r.rest)||r.rest.length!==JOINTS||!r.rest.every(point)||!Array.isArray(r.mouth)||r.mouth.length!==2||!r.mouth.every(n=>Number.isFinite(n))||!Number.isFinite(r.twist))throw new Error('花枝数据不正确');
    ids.add(r.id);
    const m=metrics(r,d.vessel),lip=r.points[r.guide],root=r.points[0];
    if(d.interaction==='place') {
      const p=r.placement;
      if(!p||!point(p.direction)||Math.abs(Math.hypot(...p.direction)-1)>.00001||p.direction[1]<.5||!Number.isFinite(p.insertion)||p.insertion<.09||p.insertion>(p.seated?FLOWERS[r.kind].length-.16:Math.min(VESSELS[d.vessel].height-.025,FLOWERS[r.kind].length-.16))||(p.seated!==undefined&&p.seated!==true))throw new Error('整枝摆放数据不正确');
      if(p.bend!==undefined){
        if(!Array.isArray(p.bend)||p.bend.length!==2||!p.bend.every(n=>typeof n==='number'&&Number.isFinite(n)))throw new Error('轻柔弯曲数据不正确');
        const bounded=boundedBend(r.kind,FLOWERS[r.kind].length,p.insertion,p.bend);
        if(Math.hypot(...p.bend)>Math.hypot(...bounded)+1e-7)throw new Error('轻柔弯曲超出上限');
      }
      const expected=placementGeometry(r.kind,FLOWERS[r.kind].length,p,r.mouth,r.twist,VESSELS[d.vessel].height).points;
      if(r.points.some((point,i)=>distance(point,expected[i])>.00001)||m.penetration>.0001||m.lengthError>.001||root[1]>VESSELS[d.vessel].height-.075)throw new Error('整枝摆放超出花瓶约束');
      if(p.seated&&supportMetrics(r,d.vessel).type==='none')throw new Error('花枝尚未落到瓶底或瓶壁');
      continue;
    }
    if(r.placement)throw new Error('花枝数据与交互模式不一致');
    if(m.penetration>.0008||m.lengthError>.001||m.insertion<.085||root[1]>VESSELS[d.vessel].height-.075||Math.abs(lip[1]-VESSELS[d.vessel].height)>.0001||Math.hypot(lip[0]-r.mouth[0],lip[2]-r.mouth[1])>.0001||r.points.slice(0,r.guide).some(p=>p[1]>VESSELS[d.vessel].height)||r.points.slice(r.guide+1).some(p=>p[1]<VESSELS[d.vessel].height))throw new Error('草稿包含未满足插入约束的花枝');
  }
  const seated=d.rods.filter(r=>r.placement?.seated);
  for(let i=0;i<seated.length;i++)for(let j=i+1;j<seated.length;j++){
    const a=seated[i],b=seated[j],minimum=FLOWERS[a.kind].radius+FLOWERS[b.kind].radius+.0005;
    for(let x=1;x<a.points.length;x++)for(let y=1;y<b.points.length;y++){
      if(segmentDistance(a.points[x-1],a.points[x],b.points[y-1],b.points[y])<minimum-.000005)throw new Error('落座花茎之间存在穿插');
    }
  }
  return cloneDesign(d);
}
