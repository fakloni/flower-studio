'use client';
import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import { recipe,type Design } from '@/modules/design/model';

export function listText(design:Design) {return `${design.name}\n花材清单\n\n${recipe(design).map(flower=>`${flower.name}（${flower.color}） × ${flower.count} 支`).join('\n')}\n\n共 ${design.stems.length} 支\n按生成时的设计统计。`;}
export function downloadFile(name:string,content:string,type='text/plain;charset=utf-8') {const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function ShoppingList({snapshot,onBack}:{snapshot:Design;onBack:()=>void}) {
  const [copied,setCopied]=useState(false);const [copyError,setCopyError]=useState(false);const rows=recipe(snapshot);
  return <div className="shopping-list"><p className="list-title">{snapshot.name}</p><p className="muted">此清单保留生成时的花材与支数。</p>
    <div className="shopping-rows">{rows.map(flower=><div className="shopping-row" key={flower.id}><img src={flower.thumb} alt=""/><div><strong>{flower.name}</strong><p>{flower.color}</p></div><span>{flower.count} 支</span></div>)}</div>
    <div className="list-total">共 {snapshot.stems.length} 支</div>
    <div className="dialog-actions"><button className="button" onClick={onBack}>返回修改</button><button className="button" onClick={async()=>{try{await navigator.clipboard.writeText(listText(snapshot));setCopied(true);setCopyError(false);}catch{setCopyError(true);}}}><Icon name={copied?'check':'copy'} size={17}/>{copied?'已复制':'复制清单'}</button><button className="button primary" onClick={()=>downloadFile(`${snapshot.name}-花材清单.txt`,listText(snapshot))}><Icon name="download" size={17}/>下载清单</button></div>
    {copyError?<div className="copy-fallback"><p>浏览器未允许复制，可以选中下方内容复制或下载清单。</p><textarea readOnly aria-label="可复制的清单内容" value={listText(snapshot)}/></div>:null}
  </div>;
}
