import { flowerMap, type FlowerId, type VaseId, vases } from '../catalog/data';

export type Vector3 = [number, number, number];
export type Stem = { id: string; flowerId: FlowerId; position: Vector3; rotation: Vector3; scale: number };
export type Design = { version: 1; id: string; name: string; scene: 'vase' | 'bouquet'; vaseId: VaseId; mode: 'auto' | 'manual'; stems: Stem[] };
export type History = { present: Design; past: Design[]; future: Design[] };
export type Action = { type: 'add'; flowerId: FlowerId; id: string } | { type: 'remove'; id: string } | { type: 'move'; id: string; position: Vector3 } | { type: 'rotate'; id: string; radians: number; axis?:'y'|'z' } | { type: 'replace'; id: string; flowerId: FlowerId } | { type: 'rearrange' } | { type: 'mode'; mode: Design['mode'] } | { type: 'scene'; scene: Design['scene'] } | { type: 'vase'; vaseId: VaseId } | { type: 'name'; name: string } | { type: 'load'; design: Design } | { type: 'undo' } | { type: 'redo' };
export const MAX_STEMS = 48;

export function arrange(stems: Stem[], scene: Design['scene'] = 'vase'): Stem[] {
  const seen: Partial<Record<FlowerId, number>> = {};
  return stems.map(stem => {
    const index = seen[stem.flowerId] ?? 0; seen[stem.flowerId] = index + 1;
    const center = scene === 'bouquet' ? .04 : .06;
    if (stem.flowerId === 'pink-rose' || stem.flowerId === 'red-rose') return { ...stem, position: [((index%3)-1)*.004, center, (index%2)*.005], rotation: [.03, [ -.15,0,.12 ][index%3], [ .28,0,-.28 ][index%3]], scale: [ .95,1.12,.94 ][index%3] };
    if (stem.flowerId === 'white-tulip') return { ...stem, position: [index%2 ? .006 : -.006, center, -.010], rotation: [.04, index%2 ? .15 : -.15, index%2 ? -.28 : .28], scale: 1.26 };
    if (stem.flowerId === 'eucalyptus') return { ...stem, position: [0, center-.005, -.014], rotation: [.08, index*2.15+3.1, index%3===0 ? -.32 : index%3===1 ? .31 : .02], scale: .91 + (index%3)*.035 };
    if (flowerMap[stem.flowerId].isPilot) {
      const foliage=flowerMap[stem.flowerId].role==='叶材';
      const lean=['gerbera-atlanta','white-rose-proud','gypsophila-xlence','lily-of-valley'].includes(stem.flowerId) ? .24 : -.20;
      const rotation:Vector3=[.025,index%2 ? .18 : -.12,index%2 ? -lean : lean];
      const scale=foliage ? .82 : stem.flowerId==='craspedia-yellow' ? [.95,1.08,.85][index%3] : [.94,.88,1.02][index%3];
      return {...stem,position:[((index%3)-1)*.006,center,foliage?-.018:.004],rotation,scale};
    }
    return { ...stem, position: [0,center,0], rotation: [.04,index*2.3,(index%2 ? -.13 : .13)], scale: .94 };
  });
}
export function createDesign(name = '春日·粉白花意', counts: Partial<Record<FlowerId, number>> = { 'pink-rose': 3, 'white-tulip': 2, eucalyptus: 3 }, id = 'flowerstudio-first-design'): Design {
  const stems = Object.entries(counts).flatMap(([flowerId, count]) => Array.from({ length: count ?? 0 }, (_, index): Stem => ({ id: `${id}-${flowerId}-${index}`, flowerId: flowerId as FlowerId, position: [0,.06,0], rotation: [0,0,0], scale: 1 })));
  return { version: 1, id, name, scene: 'vase', vaseId: 'ivory-bud', mode: 'auto', stems: arrange(stems) };
}
export function recipe(design: Design) {
  const counts = new Map<FlowerId, number>();
  for (const stem of design.stems) counts.set(stem.flowerId, (counts.get(stem.flowerId) ?? 0) + 1);
  return Array.from(counts, ([flowerId, count]) => ({ ...flowerMap[flowerId], count }));
}
function edit(design: Design, action: Exclude<Action, { type: 'load' | 'undo' | 'redo' }>): Design {
  switch (action.type) {
    case 'add': {
      if (design.stems.length >= MAX_STEMS) return design;
      const stems = [...design.stems, { id: action.id, flowerId: action.flowerId, position: [0,.06,0] as Vector3, rotation: [0,0,0] as Vector3, scale: 1 }];
      return { ...design, stems: design.mode === 'auto' ? arrange(stems,design.scene) : stems };
    }
    case 'remove': return design.stems.some(s=>s.id===action.id) ? { ...design, stems: design.stems.filter(s=>s.id!==action.id) } : design;
    case 'move': return { ...design, mode: 'manual', stems: design.stems.map(s=>s.id===action.id ? { ...s, position: action.position } : s) };
    case 'rotate': return { ...design, mode: 'manual', stems: design.stems.map(s=>{if(s.id!==action.id)return s;const rotation=[...s.rotation] as Vector3;const axis=action.axis==='z'?2:1;rotation[axis]=Math.atan2(Math.sin(rotation[axis]+action.radians),Math.cos(rotation[axis]+action.radians));return {...s,rotation};}) };
    case 'replace': return { ...design, stems: design.stems.map(s=>s.id===action.id ? { ...s,flowerId:action.flowerId } : s) };
    case 'rearrange': return { ...design, mode: 'auto', stems: arrange(design.stems,design.scene) };
    case 'mode': return design.mode===action.mode ? design : { ...design,mode:action.mode };
    case 'scene': return design.scene===action.scene ? design : { ...design,scene:action.scene };
    case 'vase': return design.vaseId===action.vaseId ? design : { ...design,vaseId:action.vaseId };
    case 'name': return { ...design,name:action.name.slice(0,60) };
  }
}
export function historyReducer(state: History, action: Action): History {
  if (action.type==='load') return { present:action.design,past:[],future:[] };
  if (action.type==='undo') return state.past.length ? { present:state.past.at(-1)!,past:state.past.slice(0,-1),future:[state.present,...state.future].slice(0,50) } : state;
  if (action.type==='redo') return state.future.length ? { present:state.future[0],past:[...state.past,state.present].slice(-50),future:state.future.slice(1) } : state;
  const next = edit(state.present,action);
  return next===state.present ? state : { present:next,past:[...state.past,state.present].slice(-50),future:[] };
}
export function parseDesign(input: unknown): Design {
  const data=input as Partial<Design>;
  const isVector=(v:unknown,limit:number):v is Vector3 => Array.isArray(v) && v.length===3 && v.every(n=>typeof n==='number' && Number.isFinite(n) && Math.abs(n)<=limit);
  if (!data || data.version!==1 || typeof data.id!=='string' || !data.id || typeof data.name!=='string' || data.name.length>60 || !['vase','bouquet'].includes(data.scene as string) || !vases.some(v=>v.id===data.vaseId) || !['auto','manual'].includes(data.mode as string) || !Array.isArray(data.stems) || data.stems.length>MAX_STEMS) throw new Error('作品文件格式不正确');
  const ids=new Set<string>();
  for (const stem of data.stems) {
    if (!stem || typeof stem.id!=='string' || !stem.id || ids.has(stem.id) || !Object.hasOwn(flowerMap,stem.flowerId) || !isVector(stem.position,5) || !isVector(stem.rotation,1000) || !Number.isFinite(stem.scale) || stem.scale<.3 || stem.scale>2) throw new Error('作品中的花材数据不正确');
    ids.add(stem.id);
  }
  return structuredClone(data) as Design;
}
