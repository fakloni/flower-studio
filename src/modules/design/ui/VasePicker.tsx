'use client';
import { vases,type VaseId } from '@/modules/catalog/data';
import Icon from '@/components/ui/Icon';

export function CurrentVase({id,onChange}:{id:VaseId;onChange:()=>void}) {
  const vase=vases.find(item=>item.id===id)!;
  return <div className="current-vase"><img src={vase.image} alt=""/><div><h3>{vase.name}</h3><p>高 {vase.height} cm · 内口径 {vase.mouth} cm</p><button className="text-button" onClick={onChange}>更换花瓶 <Icon name="chevron" size={15}/></button></div></div>;
}
export default function VasePicker({id,onChoose}:{id:VaseId;onChoose:(id:VaseId)=>void}) {
  return <div className="vase-options">{vases.map(vase=><button key={vase.id} className={`vase-option ${id===vase.id?'selected':''}`} aria-pressed={id===vase.id} onClick={()=>onChoose(vase.id)}><img src={vase.image} alt=""/><h3>{vase.name}</h3><p>高 {vase.height} cm<br/>内口径 {vase.mouth} cm</p>{id===vase.id?<span className="vase-check"><Icon name="check" size={17}/></span>:null}</button>)}</div>;
}
