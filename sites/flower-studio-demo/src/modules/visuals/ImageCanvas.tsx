'use client';
import { useRef,useState } from 'react';
import { flowerMap,vases } from '../catalog/data';
import type { Design,Vector3 } from '../design/model';
import type { View } from './SceneCanvas';

export default function ImageCanvas({design,view,zoom,selected,onSelect,onMove}:{design:Design;view:View;zoom:number;selected:string|null;onSelect:(id:string|null)=>void;onMove:(id:string,position:Vector3)=>void}) {
  const host=useRef<HTMLDivElement>(null);const [failed,setFailed]=useState<Record<string,boolean>>({});const vase=vases.find(v=>v.id===design.vaseId)!;
  return <div className="image-scene" ref={host} onPointerDown={event=>{if(event.target===event.currentTarget)onSelect(null);}} data-testid="image-scene">
    <div className="image-arrangement" style={{transform:`scale(${zoom*.86})`}}>
      {design.stems.map((stem,index)=>{
        const asset=flowerMap[stem.flowerId];const horizontal=view==='side' ? stem.position[2] : stem.position[0];
        const rotation=stem.rotation[2]*-180/Math.PI;
        return <button key={stem.id} data-stem-id={stem.id} aria-label={`选择${asset.name}第${index+1}支`} className={`image-stem ${selected===stem.id?'is-selected':''}`} style={{left:`calc(50% + ${horizontal*720}px)`,bottom:`calc(11% + ${(stem.position[1]-.06)*720}px)`,zIndex:10+Math.round(stem.position[2]*100)+index,transform:`translateX(-50%) rotate(${rotation}deg) scale(${stem.scale})`}}
          onPointerDown={event=>{
            event.preventDefault();onSelect(stem.id);const element=event.currentTarget;const x=event.clientX,y=event.clientY;const initialTransform=element.style.transform;let dx=0,dy=0;let moved=false;element.setPointerCapture(event.pointerId);
            const move=(e:PointerEvent)=>{dx=(e.clientX-x)/(zoom*.86);dy=(e.clientY-y)/(zoom*.86);moved=Math.hypot(dx,dy)>3;element.style.transform=`translate(${dx}px,${dy}px) ${initialTransform}`;};
            const finish=(e:PointerEvent)=>{element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',finish);element.removeEventListener('pointercancel',cancel);if(element.hasPointerCapture(e.pointerId))element.releasePointerCapture(e.pointerId);element.style.transform=initialTransform;if(moved){const next=[...stem.position] as Vector3;next[view==='side'?2:0]+=dx/720;next[1]-=dy/720;onMove(stem.id,next);}};
            const cancel=(e:PointerEvent)=>{moved=false;finish(e);};element.addEventListener('pointermove',move);element.addEventListener('pointerup',finish);element.addEventListener('pointercancel',cancel);
          }}>
          {failed[stem.id] ? <span className="image-error">{asset.name}<br/>素材未加载</span> : <img draggable={false} src={view==='side'?asset.sideImage:asset.image} alt="" onError={()=>setFailed(current=>({...current,[stem.id]:true}))}/>}
        </button>;
      })}
      {design.scene==='vase' ? <img className="image-vase" draggable={false} src={view==='side'?vase.sideImage:vase.image} alt={vase.name}/> : <div className="bouquet-binding" aria-label="花束绑扎位置"/>}
    </div>
  </div>;
}
