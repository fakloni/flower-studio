import type { BufferGeometry } from 'three';

/** Connected authored patches, including material-separated petals and branch tubes. */
export function connectedVertices(geometry:BufferGeometry):number[][] {
  const count=geometry.getAttribute('position').count,parent=Array.from({length:count},(_,i)=>i);
  const root=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a:number,b:number)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a;};
  const index=geometry.index;
  if(index)for(let i=0;i<index.count;i+=3){join(index.getX(i),index.getX(i+1));join(index.getX(i),index.getX(i+2));}
  else for(let i=0;i<count;i+=3){join(i,i+1);join(i,i+2);}
  const groups=new Map<number,number[]>();
  for(let i=0;i<count;i++){const r=root(i),group=groups.get(r)??[];group.push(i);groups.set(r,group);}
  return [...groups.values()];
}
