'use client';
import Icon from '@/components/ui/Icon';
import { flowers,type FlowerId } from '@/modules/catalog/data';

export default function FlowerLibrary({search,setSearch,category,setCategory,onAdd,disabled=false}:{search:string;setSearch:(value:string)=>void;category:string;setCategory:(value:string)=>void;onAdd:(id:FlowerId)=>void;disabled?:boolean}) {
  const visible=flowers.filter(flower=>(category==='全部'||(category==='新花材'?flower.isPilot:flower.role===category))&&flower.name.includes(search.trim()));
  return <div className="flower-library">
    <div className="search-field"><Icon name="search"/><input aria-label="搜索花材" placeholder="搜索花材" value={search} onChange={event=>setSearch(event.target.value)}/>{search?<button aria-label="清除搜索" className="search-clear" onClick={()=>setSearch('')}><Icon name="close" size={15}/></button>:null}</div>
    <div className="category-tabs" aria-label="花材分类">{['全部','新花材','主花','配花','叶材'].map(item=><button key={item} aria-pressed={category===item} className={category===item?'active':''} onClick={()=>setCategory(item)}>{item}</button>)}</div>
    <div className="flower-grid">{visible.map(flower=><button className="flower-tile" key={flower.id} onClick={()=>onAdd(flower.id)} disabled={disabled} aria-label={`添加${flower.name}`}>
      <img src={flower.thumb} alt="" draggable={false}/><span className="flower-tile-label">{flower.name}</span><span className="flower-add"><Icon name="plus" size={17}/></span>
    </button>)}</div>
    {!visible.length?<p className="empty-message">没有找到相关花材，试试其他名称。</p>:null}
  </div>;
}
