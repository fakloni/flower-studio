'use client';
import Icon from '@/components/ui/Icon';
import { recipe,type Design } from '../model';
import type { FlowerId } from '@/modules/catalog/data';

export default function RecipePanel({design,selected,onAdd,onSubtract,onSelect,disabled=false}:{design:Design;selected:string|null;onAdd:(id:FlowerId)=>void;onSubtract:(id:FlowerId)=>void;onSelect:(id:string)=>void;disabled?:boolean}) {
  const rows=recipe(design);const selectedFlower=design.stems.find(stem=>stem.id===selected)?.flowerId;
  return <div className="recipe-panel">
    <div className="recipe-rows">{rows.map(flower=><div key={flower.id} className={`recipe-row ${selectedFlower===flower.id?'selected':''}`}>
      <button className="recipe-flower" onClick={()=>{const stem=design.stems.find(stem=>stem.flowerId===flower.id);if(stem)onSelect(stem.id);}} aria-label={`选择配方中的${flower.name}`}><img src={flower.thumb} alt=""/><span>{flower.name}</span></button>
      <div className="stepper"><button aria-label={`减少${flower.name}`} onClick={()=>onSubtract(flower.id)}><Icon name="minus" size={15}/></button><output aria-label={`${flower.name}支数`}>{flower.count}</output><button aria-label={`增加${flower.name}`} disabled={disabled} onClick={()=>onAdd(flower.id)}><Icon name="plus" size={15}/></button></div>
    </div>)}</div>
    {!rows.length?<p className="empty-message">从左侧选择花材，开始你的搭配。</p>:null}
    <div className="recipe-total" data-testid="recipe-total">共 <strong>{design.stems.length}</strong> 支</div>
  </div>;
}
