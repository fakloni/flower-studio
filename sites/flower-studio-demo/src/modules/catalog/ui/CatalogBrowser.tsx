'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { flowerMap, type FlowerId } from '../data';
import { filterCatalog, loadCatalogIndex, loadCatalogProduct, type CatalogIndex, type CatalogProduct, type CatalogSummary, type Source } from '../library';

function CatalogCover({ url, name }: { url: string | null; name: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) return <div className="catalog-placeholder"><Icon name="leaf" size={34} /><span>{url ? '图片暂未载入' : '图鉴图片待补'}</span></div>;
  return <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setFailedUrl(url)} />;
}

function SourceLinks({ source }: { source: Source }) {
  if (!source.name && !source.urls.length) return <p className="catalog-muted">来源待补充</p>;
  return <div className="catalog-sources"><p>{source.name}</p>{source.urls.map((url, index) => <a href={url} key={url} target="_blank" rel="noreferrer">查看来源{source.urls.length > 1 ? ` ${index + 1}` : ''} ↗</a>)}</div>;
}

function ProductDetail({ product, disabled, onAdd }: { product: CatalogProduct; disabled: boolean; onAdd: (id: FlowerId) => void }) {
  const editorAssets = product.assets.filter(asset => asset.editor && Object.hasOwn(flowerMap, asset.editor.id));
  return <article className="catalog-detail" aria-label={`${product.name}详情`}>
    <div className="catalog-detail-intro">
      <div className="catalog-detail-cover"><CatalogCover url={product.assets[0]?.coverUrl ?? null} name={product.name} />{product.assets[0]?.kind === 'model-preview' ? <span className="catalog-image-caption">建模参考，品种与实物规格待核实</span> : null}</div>
      <div><span className="catalog-eyebrow">{product.group} / {product.id}</span><h3>{product.name}</h3><p className="catalog-identity">{product.scientificName ?? '物种／品种待核实'}</p><p className="catalog-muted">{product.nameStatus}</p>
        <div className="catalog-tags">{product.roles.length ? product.roles.map(role => <span key={role}>{role}</span>) : <span>作用待核定</span>}</div>
        <p className="catalog-muted">{product.roleStatus === 'reviewed' ? '角色已人工复核' : product.roleStatus === 'pending' ? '角色或适用条件尚待核定' : '搭配角色为项目建议，可兼任'}</p>
        {editorAssets.length ? <div className="catalog-add-options">{editorAssets.map(asset => <button className="button" key={asset.id} disabled={disabled} onClick={() => onAdd(asset.editor!.id as FlowerId)}>添加{asset.editor!.name}示例</button>)}</div> : <p className="catalog-no-editor">单支编辑素材待补充</p>}
      </div>
    </div>
    <div className="catalog-detail-sections">
      {product.assets.some(asset => asset.kind === 'photo') ? <section className="catalog-info-section"><h4>图片参考</h4>{product.assets.filter(asset => asset.kind === 'photo').map(asset => <div key={asset.id}><p>{asset.notes}</p><p className="catalog-muted">摄影／来源：{asset.author ?? '待核对'} · {asset.license ?? '使用条件待核对'}</p>{asset.publicationStatus === 'local-reference' ? <p className="catalog-muted">本地参考图片</p> : null}{asset.sourceUrl ? <a href={asset.sourceUrl} target="_blank" rel="noreferrer">查看图片来源 ↗</a> : null}</div>)}</section> : null}
      <section className="catalog-info-section"><h4>搭配与外观</h4><p>{product.roleNotes ?? '作用资料待补充'}</p><p>{product.shapeNotes ?? '形态资料待补充'}</p>{product.ornamentalPart ? <p className="catalog-muted">观赏部位：{product.ornamentalPart}</p> : null}</section>
      <section className="catalog-info-section"><h4>季节参考</h4><p className="catalog-season-text">{product.season.text ?? '季节资料待补充'}</p>{product.season.text ? <><p>资料口径：{product.season.basis ?? '待核实'}</p><p>适用范围：{product.season.region ?? '地区／对象待核实'}</p><SourceLinks source={product.season.source} /></> : null}<p className="catalog-reference-note">通用图鉴尚未绑定采购地区，当前供货未核实。季节参考不用于判定无货。</p></section>
      <section className="catalog-info-section"><h4>尺寸参考</h4><p>{product.dimensions.object ?? '测量对象待补充'}</p>{product.dimensions.minCm !== null || product.dimensions.maxCm !== null ? <><p>下限：{product.dimensions.minCm === null ? '未核实' : `${product.dimensions.minCm} cm`}　上限：{product.dimensions.maxCm === null ? '未核实' : `${product.dimensions.maxCm} cm`}</p><p>数值性质：{product.dimensions.valueType ?? '待核实'}</p><p>适用对象：{product.dimensions.scope ?? '待核实'}</p><SourceLinks source={product.dimensions.source} /></> : <p className="catalog-muted">该细分产品的尺寸数值待补充</p>}<p className="catalog-reference-note">参考范围不代表到货规格，真实比例需另行测量。</p></section>
      <section className="catalog-info-section"><h4>名称与检索关系</h4><div className="catalog-aliases">{product.aliases.map((alias, index) => <div key={`${alias.name}-${index}`}><span>{alias.name}</span><small>{alias.relation}</small>{alias.restriction ? <p>{alias.restriction}</p> : null}</div>)}</div><p className="catalog-muted">检索名称可能包含上下位关系或待核候选，匹配结果不代表同款商品。</p></section>
    </div>
    {product.notes ? <details className="catalog-notes"><summary>使用限制与待核事项</summary><p>{product.notes}</p>{product.dimensions.notes ? <p>{product.dimensions.notes}</p> : null}</details> : null}
    {product.relatedEvidence.length ? <details className="catalog-notes"><summary>同大类的尺寸证据（需核对品种适用范围）</summary><p className="catalog-reference-note">以下证据保留原适用对象，未自动套用到此细分产品。</p>{product.relatedEvidence.map(evidence => <div className="catalog-evidence" key={evidence.id}><p>{evidence.values['测量项目']} · {evidence.values['适用物种／品种／商品']}</p><p className="catalog-muted">{evidence.values['原数值口径（简记）']}　{evidence.values['限制与解释']}</p><SourceLinks source={{ name: String(evidence.values['来源机构／资料'] ?? ''), urls: String(evidence.values['来源URL'] ?? '').split('\n').filter(url => /^https?:\/\//.test(url)) }} /></div>)}</details> : null}
    <footer className="catalog-detail-footer"><span>资料核查：{product.checkedDate ?? '日期待补充'}</span><SourceLinks source={product.source} /></footer>
  </article>;
}

export default function CatalogBrowser({ onAdd, disabled = false }: { onAdd: (id: FlowerId) => void; disabled?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState<CatalogIndex | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('全部');
  const [group, setGroup] = useState('全部');
  const [media, setMedia] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<{ url: string; data: CatalogProduct | null; error: string } | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);

  useEffect(() => {
    host.current?.closest('dialog')?.scrollTo({ top: 0 });
    host.current?.querySelector<HTMLElement>(selectedId ? '.catalog-back' : 'input')?.focus({ preventScroll: true });
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    loadCatalogIndex().then(value => { if (!cancelled) { setIndex(value); setError(''); } }).catch(() => { if (!cancelled) setError('花材图鉴暂时无法载入，请重试。'); });
    return () => { cancelled = true; };
  }, [retry]);

  const selected = index?.products.find(product => product.id === selectedId) ?? null;
  const revision = index?.revision;
  useEffect(() => {
    if (!selected || !revision) return;
    let cancelled = false;
    loadCatalogProduct(selected, revision).then(value => { if (!cancelled) setDetailState({ url: selected.detailUrl, data: value, error: '' }); }).catch(() => { if (!cancelled) setDetailState({ url: selected.detailUrl, data: null, error: '这项花材的资料暂时无法载入，请重试。' }); });
    return () => { cancelled = true; };
  }, [selected, revision, detailRetry]);

  if (!index) return <div className="catalog-load-state" role="status">{error ? <><p>{error}</p><button className="button" onClick={() => { setError(''); setRetry(value => value + 1); }}>重新载入图鉴</button></> : <p>正在载入花材图鉴…</p>}</div>;
  if (selected) {
    const current = detailState?.url === selected.detailUrl ? detailState : null;
    return <div className="catalog-browser" ref={host}><button className="text-button catalog-back" onClick={() => setSelectedId(null)}>← 返回花材列表</button>{current?.data ? <ProductDetail product={current.data} onAdd={onAdd} disabled={disabled} /> : <div className="catalog-load-state" role="status">{current?.error ? <><p>{current.error}</p><button className="button" onClick={() => { setDetailState(null); setDetailRetry(value => value + 1); }}>重新载入详情</button></> : <p>正在载入花材资料…</p>}</div>}</div>;
  }
  const products = filterCatalog(index.products, { search, role, group, media });
  const groups = Array.from(new Set(index.products.map(product => product.group))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const hasFilters = search || role !== '全部' || group !== '全部' || media !== 'all';
  return <div className="catalog-browser" ref={host}>
    <div className="catalog-overview"><div><span className="catalog-eyebrow">通用图鉴</span><p className="catalog-overview-count"><strong>{index.counts.products}</strong> 项花材<span>{index.counts.aliases} 条名称关系</span></p></div><p>认识花材，找到合适搭配。<br /><span>季节仅作参考，供货未核实。</span></p></div>
    <div className="catalog-filterbar"><div className="search-field"><Icon name="search" /><input aria-label="搜索图鉴花材" placeholder="搜索名称、别名或编号" value={search} onChange={event => setSearch(event.target.value)} />{search ? <button className="search-clear" aria-label="清除图鉴搜索" onClick={() => setSearch('')}><Icon name="close" size={15} /></button> : null}</div><select aria-label="筛选花材大类" value={group} onChange={event => setGroup(event.target.value)}><option value="全部">全部大类</option>{groups.map(value => <option key={value} value={value}>{value}</option>)}</select><select aria-label="筛选素材状态" value={media} onChange={event => setMedia(event.target.value)}><option value="all">全部资料</option><option value="editor">有编辑示例</option><option value="missing">图片待补</option></select></div>
    <div className="catalog-role-filters" aria-label="筛选搭配作用">{['全部', '主花', '配花', '叶材', '线条', '填充', '待核定'].map(value => <button key={value} aria-pressed={role === value} className={role === value ? 'active' : ''} onClick={() => setRole(value)}>{value}</button>)}</div>
    <div className="catalog-results"><p role="status">找到 {products.length} 项花材</p>{hasFilters ? <button className="text-button" onClick={() => { setSearch(''); setRole('全部'); setGroup('全部'); setMedia('all'); }}>重置筛选</button> : <span>选择花材查看详细资料</span>}</div>
    <div className="catalog-cards">{products.map(product => <button className="catalog-card" key={product.id} aria-label={`查看${product.name}资料`} onClick={() => setSelectedId(product.id)}><div className="catalog-card-cover"><CatalogCover url={product.coverUrl} name={product.name} />{product.coverKind === 'model-preview' ? <span className="catalog-preview-badge">建模参考</span> : null}</div><div className="catalog-card-info"><span className="catalog-eyebrow">{product.group} / {product.id}</span><h3>{product.name}</h3><p>{product.roles.length ? product.roles.join(' · ') : '作用待核定'}</p><div className="catalog-card-status"><span>{product.seasonStatus === 'reference' ? '有季节参考' : '季节待补充'}</span>{product.editorIds.length ? <span>可用编辑示例</span> : null}</div></div></button>)}</div>
    {!products.length ? <div className="catalog-load-state"><p>没有找到符合条件的花材，试试其他名称或重置筛选。</p></div> : null}
  </div>;
}
