'use client';

import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import type { LabView } from './LabScene';
import { FLOWERS, VESSELS, JOINTS, cloneDesign, cloneRod, createRod, initialDesign, innerRadius, metrics, moveTip, parseDesign, reposition, settleRod,supportMetrics,type Interaction, type Kind, type LabDesign, type Rod, type VesselId } from './rod';
import { adjustPlacement, createPlacement, maxInsertion, modeOf,rebuildPlacement,toPlacement } from './placement';
import { limitBloomMove } from './contact';
import {adjustSupportedPlacement,fitSupportedPlacement,initialSupportedDesign,supportedContactStudy} from './support';
import {limitStemMove} from './stem-contact';
import styles from './lab.module.css';

const Scene=dynamic(()=>import('./LabScene'),{ssr:false});
const STORAGE='flower-studio:insertion-lab:v1';
const views: {id:LabView;name:string}[]=[{id:'orbit',name:'自由观察'},{id:'front',name:'正面'},{id:'side',name:'侧面'},{id:'top',name:'俯视'}];
const kinds=Object.keys(FLOWERS) as Kind[];

export default function LabWorkbench(){
  const [design,setDesign]=useState<LabDesign>(initialSupportedDesign),[selected,setSelected]=useState<string|null>('rose-1');
  const [view,setView]=useState<LabView>('orbit'),[traces,setTraces]=useState(false);
  const [contacts,setContacts]=useState(true),[detailed,setDetailed]=useState(true),[contactCount,setContactCount]=useState(0);
  const [gentle,setGentle]=useState(true);
  const [status,setStatus]=useState('花材正在准备…'),[error,setError]=useState(''),[ready,setReady]=useState(false);
  const [historyState,setHistoryState]=useState({past:0,future:0});
  const designRef=useRef(design),history=useRef<{past:LabDesign[];future:LabDesign[]}>({past:[],future:[]});
  const sliderGesture=useRef<{committed:boolean;start?:Rod}|null>(null);
  const comparison=useRef<Partial<Record<Interaction,LabDesign>>>({});
  const interaction=modeOf(design),placing=interaction==='place';
  designRef.current=design;
  const commit=useCallback((next:LabDesign)=>{
    if(!sliderGesture.current?.committed){
      history.current.past.push(cloneDesign(designRef.current));if(history.current.past.length>60)history.current.past.shift();
      if(sliderGesture.current)sliderGesture.current.committed=true;
    }
    history.current.future=[];designRef.current=next;setDesign(next);setHistoryState({past:history.current.past.length,future:0});
  },[]);
  const commitRod=useCallback((rod:Rod)=>{commit({...designRef.current,rods:designRef.current.rods.map(r=>r.id===rod.id?rod:r)});},[commit]);
  const onReady=useCallback((message?:string)=>{setError(message??'');setReady(!message);setStatus(message?'花材尚未加载完成。':modeOf(designRef.current)==='place'?'拖动花头调整姿态；花茎保持瓶内支撑，接触邻茎时会受阻。':'弯曲对照：选中花头或叶片，拖动试试。');},[]);
  const chosen=design.rods.find(r=>r.id===selected),statistics=chosen?metrics(chosen,design.vessel):null;
  const selectedIndex=chosen?design.rods.filter(r=>r.kind===chosen.kind).findIndex(r=>r.id===chosen.id)+1:0;
  const chosenSupport=chosen?supportMetrics(chosen,design.vessel):null,seated=!!chosen?.placement?.seated;
  function travel(direction:'past'|'future'){
    const stack=history.current[direction],next=stack.pop();if(!next)return;
    history.current[direction==='past'?'future':'past'].push(cloneDesign(designRef.current));
    designRef.current=next;setDesign(next);setHistoryState({past:history.current.past.length,future:history.current.future.length});
    if(!next.rods.some(r=>r.id===selected))setSelected(next.rods[0]?.id??null);setStatus(direction==='past'?'已撤销这次调整。':'已重做这次调整。');
  }
  function add(kind:Kind){
    if(design.rods.length>=15){setStatus('这一轮最多测试 15 支花材。');return;}
    const id=crypto.randomUUID(),seed=(placing?createPlacement:createRod)(kind,id,design.vessel,design.rods.length);
    const rod=placing?fitSupportedPlacement(seed,design.vessel,design.rods):seed;
    if(!rod){setStatus('当前瓶口较拥挤，暂未找到互不穿插的落点。请先调整已有花材。');return;}
    commit({...design,rods:[...design.rods,rod]});setSelected(id);setStatus('新花材已在瓶内落座。');
  }
  function changeVase(vessel:VesselId){
    if(vessel===design.vessel)return;const rods:Rod[]=[];
    for(const input of design.rods){
      const rod=placing?(input.placement?.seated?fitSupportedPlacement(input,vessel,rods):adjustPlacement(input,vessel)):reposition(input,vessel);
      if(!rod){setStatus('这只花瓶暂时容纳不下当前花姿，请先调整或减少花材。');return;}rods.push(rod);
    }
    commit({...design,vessel,rods});setStatus('已按新花瓶重新找到瓶内支撑位置。');
  }
  function changeInteraction(next:Interaction){
    if(next===interaction)return;
    comparison.current[interaction]=cloneDesign(design);
    const saved=comparison.current[next];
    const rods:Rod[]=[];
    for(const input of design.rods){
      const cached=saved?.rods.find(r=>r.id===input.id&&r.kind===input.kind);
      if(cached){
        const rod=saved?.vessel===design.vessel?cloneRod(cached):next==='place'?(cached.placement?.seated?fitSupportedPlacement(cached,design.vessel,rods):adjustPlacement(cached,design.vessel)):reposition(cached,design.vessel);
        if(!rod){setStatus('当前花瓶无法容纳保存的对照花姿，请调整花材后再试。');return;}
        rods.push(rod);continue;
      }
      if(next==='place'){rods.push(toPlacement(input,design.vessel));continue;}
      let rod=createRod(input.kind,input.id,design.vessel);
      rod=reposition(rod,design.vessel,input.mouth,Math.round((input.placement?.insertion??.155)/(FLOWERS[input.kind].length/(JOINTS-1))));
      rod.twist=input.twist;rods.push(settleRod(moveTip(rod,input.points[JOINTS-1],design.vessel)));
    }
    commit({...design,interaction:next,rods});
    setStatus(next==='place'?'整枝摆放：瓶内支撑配合有限柔弯，花茎长度保持不变。':'弯曲对照：两种模式分别保留各自的调整，可来回比较。');
  }
  function save(){try{localStorage.setItem(STORAGE,JSON.stringify(design));setStatus('花姿已保存到本机。');}catch{setStatus('本机存储不可用，保存未成功。');}}
  function restore(){try{const raw=localStorage.getItem(STORAGE);if(!raw){setStatus('本机还没有实验草稿。');return;}const restored=parseDesign(JSON.parse(raw));comparison.current={};commit(restored);setSelected(restored.rods[0]?.id??null);setStatus('已恢复保存的花姿与交互模式。');}catch(err){setStatus(err instanceof Error?err.message:'草稿读取失败。');}}
  function changeRod(next:Rod){
    if(!chosen)return;
    const target=seated?adjustSupportedPlacement(sliderGesture.current?.start??chosen,next,design.vessel):next;
    if(!target){setStatus('这个位置找不到瓶内支撑，已保留原来的花姿。');return;}
    const bloom=contacts&&placing?limitBloomMove(chosen,target,design.rods,design.vessel):target;
    commitRod(placing?limitStemMove(chosen,bloom,design.rods,design.vessel):bloom);
  }
  function adjust(mouth?:[number,number],depth?:number){
    if(!chosen)return;
    if(seated){changeRod(rebuildPlacement(chosen,design.vessel,chosen.placement,mouth??chosen.mouth));return;}
    changeRod(placing?adjustPlacement(chosen,design.vessel,mouth??chosen.mouth,depth??chosen.placement?.insertion):reposition(chosen,design.vessel,mouth??chosen.mouth,depth??chosen.guide));
  }
  function seatChosen(){
    if(!chosen)return;const target=fitSupportedPlacement(chosen,design.vessel,design.rods.filter(r=>r.id!==chosen.id));
    if(!target){setStatus('暂未找到互不穿插的落点，请先调整花材或更换花瓶。');return;}
    commitRod(target);setStatus('已找到瓶内支撑，旧草稿可通过撤销恢复原来的位置。');
  }
  const mouthRange=Math.floor((innerRadius(design.vessel,VESSELS[design.vessel].height)-(chosen?FLOWERS[chosen.kind].radius:.0026)-.0017)*1000);
  const stageState=error?'error':ready?'ready':'loading';
  return <main className={styles.lab}>
    <header className={styles.header}>
      <a href="/" className={styles.brand}>Flower<span>Studio</span><span className={styles.brandDot}>✳</span></a>
      <span className={styles.experiment}>EXPERIMENT 01 <span>花姿与空间</span></span>
      <div className={styles.headerActions}><button onClick={restore}>恢复草稿</button><button className={styles.save} onClick={save} disabled={!ready}>保存花姿 <span>↗</span></button></div>
    </header>
    <section className={styles.intro}><div><p className={styles.eyebrow}>A STUDY IN ARRANGEMENT</p><h1>让每一枝，找到自己的姿态。</h1><p className={styles.subtitle}>三种花材 · 陶瓷与玻璃 · 自由调整，始终保持插入</p></div><span className={styles.prototype}><i/>可操作研究样片</span></section>
    <div className={styles.workspace}>
      <section className={styles.stage} aria-label="插花实验画布" data-state={stageState}>
        <Scene design={design} selected={selected} view={view} traces={traces} contacts={contacts} detailed={detailed} gentle={gentle} onContact={setContactCount} onSelect={setSelected} onCommit={commitRod} onReady={onReady} onFeedback={setStatus}/>
        <div className={styles.stageTop}><div className={styles.stageControls}><div className={styles.modes} role="group" aria-label="摆放方式"><button disabled={!ready} aria-pressed={placing} onClick={()=>changeInteraction('place')}>整枝摆放</button><button disabled={!ready} aria-pressed={!placing} onClick={()=>changeInteraction('bend')}>弯曲对照</button></div><div className={styles.views} role="group" aria-label="观察角度">{views.map(v=><button key={v.id} aria-pressed={view===v.id} onClick={()=>setView(v.id)}>{v.name}</button>)}</div></div><span className={styles.stageTag}>{placing?(gentle?'瓶内支撑 · 有限柔弯':'瓶内支撑 · 锁定弧度'):'形变研究对照'}</span></div>
        {!ready?<div className={styles.loading} role={error?'alert':'status'}>{error||'正在加载可变形花材…'}{error?<button onClick={()=>window.location.reload()}>重新加载</button>:null}</div>:null}
        <div className={styles.stageBottom}><div className={styles.hint}><span className={styles.hintIcon}>↔</span><div><strong>{placing?(gentle?'花茎保持落座，轻柔调整花姿':'弧度已锁定，拖动只调整倾斜'):'拖动花材，观察弯曲对照'}</strong><span>拖空白处转动视角 · 滚轮缩放 · Alt＋点击切换重叠花材 · Esc 取消拖动</span></div></div><button className={styles.traceButton} aria-pressed={traces} onClick={()=>setTraces(!traces)}>{traces?'隐藏':'查看'}花枝轨迹</button></div>
      </section>
      <aside className={styles.sidebar}>
        <section className={styles.panelSection}><div className={styles.sectionTitle}><h2>本次花材</h2><span>{design.rods.length.toString().padStart(2,'0')} 支</span></div>
          <div className={styles.addFlowers}>{kinds.map(kind=><button key={kind} onClick={()=>add(kind)} disabled={!ready||design.rods.length>=15} aria-label={`添加${FLOWERS[kind].name}`}><img src={FLOWERS[kind].thumb} alt=""/><span>{FLOWERS[kind].name}</span><b>＋</b></button>)}</div>
          <div className={styles.stemList} aria-label="逐支花材">{design.rods.map((rod,i)=><button key={rod.id} data-stem-id={rod.id} aria-pressed={rod.id===selected} onClick={()=>setSelected(rod.id)}><span className={styles.stemDot} style={{background:FLOWERS[rod.kind].color}}/><span>{FLOWERS[rod.kind].name}<small>第 {design.rods.slice(0,i+1).filter(r=>r.kind===rod.kind).length} 支</small></span><span className={styles.stemCheck}>{rod.id===selected?'✓':'↗'}</span></button>)}</div>
          {!design.rods.length?<p className={styles.empty}>选择上方花材，开始一束新的搭配。</p>:null}
        </section>
        <section className={styles.panelSection}><div className={styles.sectionTitle}><h2>触感与表面</h2><span>{contacts&&placing?(contactCount?'花瓣正在让位':'等待接触'):'对照观察'}</span></div>
          <div className={styles.surfaceOptions}><button aria-pressed={gentle} disabled={!ready||!placing} onClick={()=>{setGentle(!gentle);setStatus(gentle?'已锁定现有花枝弧度，拖动只调整整枝倾斜。':'轻柔弯曲已开启，花枝小幅让位，达到上限后停止弯曲。');}}>轻柔弯曲 <span>{gentle?'开启':'锁定'}</span></button><button aria-pressed={contacts} disabled={!ready||!placing} onClick={()=>setContacts(!contacts)}>花瓣接触 <span>{contacts?'开启':'关闭'}</span></button><button aria-pressed={detailed} disabled={!ready} onClick={()=>setDetailed(!detailed)}>细腻材质 <span>{detailed?'开启':'关闭'}</span></button></div>
          <button className={styles.studyButton} disabled={!ready} onClick={()=>{const next=supportedContactStudy();comparison.current={};commit(next);setSelected(next.rods[0].id);setContacts(true);setGentle(true);setView('front');setStatus('双花支撑试验：茎底已落座。轻轻靠拢花头，可观察花瓣让位和花茎避让。');}}>双花接触试验 <span>↗</span></button>
          <p className={styles.surfaceNote}>拖动会带动瓶口接触点滑动，整枝调整并保留轻微柔弯。碰到邻茎或瓶壁会受阻。</p>
        </section>
        <section className={styles.panelSection}><div className={styles.sectionTitle}><h2>花瓶</h2><span>{design.vessel==='glass'?'透视 · 折射':'真实瓶壁遮挡'}</span></div><div className={styles.vases}>{(Object.keys(VESSELS) as VesselId[]).map(id=><button key={id} aria-pressed={design.vessel===id} disabled={!ready} onClick={()=>changeVase(id)}><span>{id==='bud'?'◡':id==='wide'?'▥':'♧'}</span>{VESSELS[id].name}</button>)}</div></section>
        <section className={styles.panelSection}><div className={styles.sectionTitle}><h2>{chosen?`${FLOWERS[chosen.kind].name} · ${selectedIndex}`:'调整花姿'}</h2><span>{chosen?(chosenSupport?.type==='floor'?'瓶底支撑':chosenSupport?.type==='wall'?'瓶壁支撑':'未落座'):'请选择一支'}</span></div>
          {chosen?<div className={styles.adjustments} onPointerDownCapture={event=>{if(event.target instanceof HTMLInputElement)sliderGesture.current={committed:false,start:cloneRod(chosen)};}} onPointerUpCapture={()=>{sliderGesture.current=null;}} onPointerCancel={()=>{sliderGesture.current=null;}}>
            <label>瓶口位置 · 左右<output>{(chosen.mouth[0]*100).toFixed(1)} cm</output><input aria-label="瓶口左右位置" type="range" min={-mouthRange} max={mouthRange} step="1" value={Math.round(chosen.mouth[0]*1000)} onChange={e=>adjust([Number(e.target.value)/1000,chosen.mouth[1]])}/></label>
            <label>瓶口位置 · 前后<output>{(chosen.mouth[1]*100).toFixed(1)} cm</output><input aria-label="瓶口前后位置" type="range" min={-mouthRange} max={mouthRange} step="1" value={Math.round(chosen.mouth[1]*1000)} onChange={e=>adjust([chosen.mouth[0],Number(e.target.value)/1000])}/></label>
            <label>{seated?'落座深度':'高低调整 · 插入深度'}<output>{statistics?(statistics.insertion*100).toFixed(1):'—'} cm</output><input aria-label="插入深度" disabled={seated} type="range" min={placing?90:Math.ceil(.09/(FLOWERS[chosen.kind].length/(JOINTS-1)))} max={placing?Math.floor(maxInsertion(chosen.kind,design.vessel,seated)*1000):Math.floor((VESSELS[design.vessel].height-.025)/(FLOWERS[chosen.kind].length/(JOINTS-1)))} value={placing?Math.round(chosen.placement!.insertion*1000):chosen.guide} onChange={e=>adjust(undefined,Number(e.target.value)/(placing?1000:1))}/></label>
            <label>花材朝向<output>{Math.round(chosen.twist*180/Math.PI)}°</output><input aria-label="花材朝向" type="range" min="-180" max="180" value={Math.round(chosen.twist*180/Math.PI)} onChange={e=>changeRod(placing?(seated?rebuildPlacement(chosen,design.vessel,chosen.placement,chosen.mouth,Number(e.target.value)*Math.PI/180):adjustPlacement(chosen,design.vessel,chosen.mouth,chosen.placement!.insertion,Number(e.target.value)*Math.PI/180)):settleRod({...chosen,twist:Number(e.target.value)*Math.PI/180}))}/></label>
            {seated?<p className={styles.supportNote}>拖动花头可联动调整倾斜和瓶口位置。瓶底或瓶壁保持支撑，花茎长度保持不变。</p>:placing?<button className={styles.seatButton} disabled={!ready} onClick={seatChosen}>落座到瓶内</button>:null}
            <button className={styles.remove} disabled={!ready} onClick={()=>{const rods=design.rods.filter(r=>r.id!==selected);commit({...design,rods});setSelected(rods[0]?.id??null);}}>移除这一支</button>
          </div>:<p className={styles.empty}>在画布或逐支列表中选取花材。</p>}
        </section>
        <div className={styles.history}><button disabled={!historyState.past||!ready} onClick={()=>travel('past')}>↶ 撤销</button><button disabled={!historyState.future||!ready} onClick={()=>travel('future')}>↷ 重做</button><button disabled={!ready} onClick={()=>{commit(placing?initialSupportedDesign():initialDesign());setSelected('rose-1');setStatus('已恢复当前模式的初始姿态。');}}>重新开始</button></div>
      </aside>
    </div>
    <div className={styles.status} role="status"><span className={styles.statusDot}/>{status}<span className={styles.statusEnd}>松手保留花姿</span></div>
    <details className={styles.research}><summary>试验范围与测量</summary><div>
      <p>新花材沿自身轴线落到瓶底或瓶壁。拖动会联动倾斜、瓶口接触点和下端落点，在内腔允许的区域滑动。插入深度随接触几何联动，不再按整次手势限制为 2 mm；整枝发生平移和转动，花茎自身长度不变。邻茎接触时尝试沿接触处滑开，经过的路径仍检查穿插。松手用约 0.18 秒做小于 1 mm 的柔弯回稳，保留构图。落座实例会整理插入段的低位枝叶，原始花材保留完整。旧草稿不自动重排，可单独选择落座。</p>
      <p>主茎采用带半径的分段碰撞体，按三维距离避让，并检查快速移动经过的路径；画面上的交叉不一定是实体相撞。瓶底采用模型内底平面，瓶壁采用同源保守截面。这是受约束的支撑近似，未模拟完整摩擦、重力平衡或枝叶实体碰撞。</p>
      <p>瓶口上方约 2.5 cm 保持稳定，附加柔弯按花材限幅，茎顶新增偏移约束在 1.2 cm 内。花头和叶片随连接处转动。花瓣接触使用方向性包络有限让位，并非逐片自碰撞。表面为程序细纹，尺寸为试验约定。玻璃瓶为空瓶透射近似，不含水面、水下折射或焦散。弯曲对照保留旧原型，草稿只保存在当前浏览器。</p>
      {statistics?<dl><div><dt>最大分段长度误差</dt><dd data-testid="length-error">{(statistics.lengthError*1000).toFixed(2)} mm</dd></div><div><dt>中心线内腔穿透估计</dt><dd data-testid="penetration">{(statistics.penetration*1000).toFixed(2)} mm</dd></div><div><dt>{placing?'整枝倾斜':'最大相邻段转角'}</dt><dd>{placing&&chosen?.placement?(Math.acos(chosen.placement.direction[1])*180/Math.PI).toFixed(1):statistics.maxBend.toFixed(1)}°</dd></div>{placing?<><div><dt>附加柔弯</dt><dd data-testid="gentle-angle">{(Math.hypot(...(chosen?.placement?.bend??[0,0]))*180/Math.PI).toFixed(1)}°</dd></div><div><dt>瓶内支撑</dt><dd data-testid="support-kind">{chosenSupport?.type==='floor'?'瓶底':chosenSupport?.type==='wall'?'瓶壁':'未落座'}</dd></div></>:null}</dl>:null}
    </div></details>
  </main>;
}
