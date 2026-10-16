import type { Vector3 } from '../design/model';

/** Bring broad lower sections toward the bottle opening without collapsing thin stems. */
export function fitStemToInsertion(point:Vector3,anchor:Vector3):Vector3 {
  const [x,y,z]=point;const dx=x-anchor[0],dz=z-anchor[2];const radius=Math.hypot(dx,dz);
  if(radius===0)return [...point];
  const t=Math.max(0,Math.min(1,(y-.18)/.13));const blend=t*t*(3-2*t);
  const fittedRadius=Math.min(radius,.01)*(1-blend)+radius*blend;
  const ratio=fittedRadius/radius;
  return [anchor[0]+dx*ratio,y,anchor[2]+dz*ratio];
}
