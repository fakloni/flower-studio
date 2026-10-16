import type {Point} from './rod';
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const subtract=(a:Point,b:Point)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]] as Point;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));

/** Closest finite segments, including parallel and degenerate segments. */
export function segmentSeparation(a:Point,b:Point,c:Point,d:Point):Point {
  const u=subtract(b,a),v=subtract(d,c),w=subtract(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w);
  let s=0,t=0;
  if(aa<1e-16&&cc<1e-16)return w;
  if(aa<1e-16)t=clamp(ee/cc);
  else if(cc<1e-16)s=clamp(-dd/aa);
  else{
    const denominator=aa*cc-bb*bb;s=denominator>1e-20?clamp((bb*ee-cc*dd)/denominator):0;
    t=(bb*s+ee)/cc;
    if(t<0){t=0;s=clamp(-dd/aa);}else if(t>1){t=1;s=clamp((bb-dd)/aa);}
  }
  return [w[0]+s*u[0]-t*v[0],w[1]+s*u[1]-t*v[1],w[2]+s*u[2]-t*v[2]];
}
/** Allocation-free distance for the collision hot path. */
export function segmentDistanceSquared(a:Point,b:Point,c:Point,d:Point):number {
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=d[0]-c[0],vy=d[1]-c[1],vz=d[2]-c[2];
  const wx=a[0]-c[0],wy=a[1]-c[1],wz=a[2]-c[2];
  const aa=ux*ux+uy*uy+uz*uz,bb=ux*vx+uy*vy+uz*vz,cc=vx*vx+vy*vy+vz*vz,dd=ux*wx+uy*wy+uz*wz,ee=vx*wx+vy*wy+vz*wz;
  let s=0,t=0;
  if(aa<1e-16&&cc<1e-16)return wx*wx+wy*wy+wz*wz;
  if(aa<1e-16)t=clamp(ee/cc);else if(cc<1e-16)s=clamp(-dd/aa);
  else{const denominator=aa*cc-bb*bb;s=denominator>1e-20?clamp((bb*ee-cc*dd)/denominator):0;t=(bb*s+ee)/cc;
    if(t<0){t=0;s=clamp(-dd/aa);}else if(t>1){t=1;s=clamp((bb-dd)/aa);}}
  const x=wx+s*ux-t*vx,y=wy+s*uy-t*vy,z=wz+s*uz-t*vz;return x*x+y*y+z*z;
}
export function segmentDistance(a:Point,b:Point,c:Point,d:Point):number {return Math.sqrt(segmentDistanceSquared(a,b,c,d));}
