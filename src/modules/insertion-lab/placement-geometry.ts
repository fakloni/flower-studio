import type { Kind, Point } from './rod';

/** Versioned connected assets: the stem and natural curve keep one rigid transform. */
export const PLACEMENT_ASSETS = {
  rose: { model: '/assets/insertion-lab/v6/rose.glb', height: .60 },
  tulip: { model: '/assets/insertion-lab/v6/tulip.glb', height: .376 },
  eucalyptus: { model: '/assets/insertion-lab/v6/eucalyptus.glb', height: .65 },
} as const;
export type Placement = { direction: Point; insertion: number; bend?: [number,number]; seated?:true };
export const BEND_ANGLES = {rose:5*Math.PI/180,tulip:9*Math.PI/180,eucalyptus:6*Math.PI/180};
export const BEND_CLEARANCE = .025;
export const MAX_TIP_BEND = .012;
export function boundedBend(kind:Kind,length:number,insertion:number,input:[number,number]):[number,number] {
  const limit=Math.min(BEND_ANGLES[kind],MAX_TIP_BEND*2/Math.max(.08,length-insertion-BEND_CLEARANCE));
  const magnitude=Math.hypot(...input),scale=magnitude>limit?limit/magnitude:1;
  return [input[0]*scale,input[1]*scale];
}
const cache = new Map<string, { points: Point[]; scale: number }>();

export function unit(p: Point): Point {
  const length = Math.hypot(...p);
  return length > 1e-10 ? p.map(n => n / length) as Point : [0, 1, 0];
}

/** Local +Y to the desired direction, with axial rotation before the tilt. */
export function rotate(p: Point, direction: Point, twist: number): Point {
  const c = Math.cos(twist), s = Math.sin(twist);
  const v: Point = [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  const d = unit(direction), q = [d[2], 0, -d[0], 1 + d[1]];
  const norm = Math.hypot(...q);
  for (let i = 0; i < 4; i++) q[i] /= norm;
  const [x, y, z, w] = q;
  const uv: Point = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
  const uuv: Point = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]];
  return v.map((n, i) => n + 2 * (w * uv[i] + uuv[i])) as Point;
}

function sourceAxis(kind: Kind, t: number): Point {
  const h = PLACEMENT_ASSETS[kind].height;
  if (kind !== 'tulip') return [.004 * Math.sin(Math.PI * 1.25 * t), h * t, -.002 * Math.sin(Math.PI * 1.5 * t)];
  // Smooth interpolation through the authored tulip stem's Bezier control stations.
  const controls: Point[] = [[0,0,0],[.002,.14,.002],[.009,.27,-.004],[.012,.376,-.008]];
  const y = h * t;
  let i = 0;
  while (i < controls.length - 2 && controls[i + 1][1] < y) i++;
  const a = controls[i], b = controls[i + 1], prev = controls[Math.max(0,i - 1)], next = controls[Math.min(3,i + 2)];
  const u = (y - a[1]) / (b[1] - a[1]);
  const result: Point = [0,y,0];
  for (const axis of [0,2]) {
    const m0 = (b[axis] - prev[axis]) / (b[1] - prev[1]);
    const m1 = (next[axis] - a[axis]) / (next[1] - a[1]);
    result[axis] = (2*u**3-3*u*u+1)*a[axis]+(u**3-2*u*u+u)*m0*(b[1]-a[1])+(-2*u**3+3*u*u)*b[axis]+(u**3-u*u)*m1*(b[1]-a[1]);
  }
  return result;
}

/** Sample once by arc length. No cursor-dependent changes to this intrinsic curve. */
export function intrinsic(kind: Kind, length: number) {
  const key = `${kind}:${length}`;
  const existing = cache.get(key); if (existing) return existing;
  const samples = Array.from({length:401},(_,i) => sourceAxis(kind,i/400));
  const arcs = [0];
  for(let i=1;i<samples.length;i++) arcs.push(arcs[i-1]+Math.hypot(...samples[i].map((n,a)=>n-samples[i-1][a])));
  const total = arcs[arcs.length-1], scale = length / total;
  const points: Point[] = [];
  let j = 0;
  for(let i=0;i<=240;i++) {
    const distance = total*i/240;
    while(j<samples.length-2&&arcs[j+1]<distance)j++;
    const t=(distance-arcs[j])/(arcs[j+1]-arcs[j]);
    points.push(samples[j].map((n,a)=>(n*(1-t)+samples[j+1][a]*t)*scale) as Point);
  }
  const result = { points, scale }; cache.set(key,result); return result;
}

export function localStation(kind: Kind,length: number,station: number): Point {
  const points = intrinsic(kind,length).points;
  const t = Math.max(0,Math.min(240,station/length*240));
  const i = Math.min(239,Math.floor(t)), blend=t-i;
  return points[i].map((n,a)=>n*(1-blend)+points[i+1][a]*blend) as Point;
}

const geometryCache=new WeakMap<Placement,{key:string;geometry:ReturnType<typeof buildPlacementGeometry>}>();
export function placementGeometry(kind: Kind,length: number,placement: Placement,mouth: [number,number],twist: number,height: number) {
  const key=`${kind}:${length}:${placement.direction}:${placement.insertion}:${placement.bend}:${mouth}:${twist}:${height}`;
  const cached=geometryCache.get(placement);if(cached?.key===key)return cached.geometry;
  const geometry=buildPlacementGeometry(kind,length,placement,mouth,twist,height);geometryCache.set(placement,{key,geometry});return geometry;
}
function buildPlacementGeometry(kind: Kind,length: number,placement: Placement,mouth: [number,number],twist: number,height: number) {
  const source=intrinsic(kind,length).points;
  const bend=placement.bend??[0,0],angle=Math.hypot(...bend),start=placement.insertion+BEND_CLEARANCE;
  const bent=angle>1e-10;
  const axis:Point=bent?[bend[1]/angle,0,-bend[0]/angle]:[1,0,0];
  const profile=(station:number)=>{const t=Math.max(0,Math.min(1,(station-start)/Math.max(.08,length-start)));return t*t*(3-2*t);};
  const bendVector=(p:Point,station:number):Point=>{
    if(!bent||station<=start)return [...p];
    const theta=angle*profile(station),c=Math.cos(theta),s=Math.sin(theta),dot=axis[0]*p[0]+axis[2]*p[2];
    return [p[0]*c-axis[2]*p[1]*s+axis[0]*dot*(1-c),
      p[1]*c+(axis[2]*p[0]-axis[0]*p[2])*s,
      p[2]*c+axis[0]*p[1]*s+axis[2]*dot*(1-c)];
  };
  const curve:Point[]=bent?[source[0]]:source;
  if(bent)for(let i=1;i<source.length;i++){
    const delta=source[i].map((n,a)=>n-source[i-1][a]) as Point;
    // Rotate each differential segment; its length is exactly preserved.
    const step=bendVector(delta,(i-.5)/240*length);
    curve.push(step.map((n,a)=>n+curve[i-1][a]) as Point);
  }
  const sample=(points:Point[],station:number):Point=>{
    const t=Math.max(0,Math.min(240,station/length*240)),i=Math.min(239,Math.floor(t)),blend=t-i;
    return points[i].map((n,a)=>n*(1-blend)+points[i+1][a]*blend) as Point;
  };
  const stationAt=(y:number):number=>{
    let lo=0,hi=240;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(source[mid][1]<y)lo=mid;else hi=mid;}
    return Math.max(0,Math.min(length,(lo+(y-source[lo][1])/(source[hi][1]-source[lo][1]))/240*length));
  };
  const deform=(point:Point,station=stationAt(point[1])):Point=>{
    if(!bent||station<=start)return [...point];
    const before=sample(source,station),after=sample(curve,station);
    const radial=bendVector(point.map((n,a)=>n-before[a]) as Point,station);
    return radial.map((n,a)=>n+after[a]) as Point;
  };
  const x=rotate([1,0,0],placement.direction,twist),y=rotate([0,1,0],placement.direction,twist),z=rotate([0,0,1],placement.direction,twist);
  const transform=(p:Point):Point=>[p[0]*x[0]+p[1]*y[0]+p[2]*z[0],p[0]*x[1]+p[1]*y[1]+p[2]*z[1],p[0]*x[2]+p[1]*y[2]+p[2]*z[2]];
  const atMouth = transform(localStation(kind,length,placement.insertion));
  const origin: Point = [mouth[0]-atMouth[0],height-atMouth[1],mouth[1]-atMouth[2]];
  const world = (point: Point,station?:number): Point => {const p=transform(deform(point,station));return [p[0]+origin[0],p[1]+origin[1],p[2]+origin[2]];};
  let transformedCurve:Point[]|undefined;
  const worldCurve=()=>transformedCurve??=curve.map(point=>{const p=transform(point);return [p[0]+origin[0],p[1]+origin[1],p[2]+origin[2]] as Point;});
  return { origin, scale: intrinsic(kind,length).scale, points:Array.from({length:25},(_,i)=>{const p=transform(curve[i*10]);return [p[0]+origin[0],p[1]+origin[1],p[2]+origin[2]] as Point;}),worldCurve,
    world,curve,source,sourceAt:(station:number)=>sample(source,station),deform,bendVector,stationAt,vectorAt:(p:Point,station:number)=>transform(bendVector(p,station)) };
}
