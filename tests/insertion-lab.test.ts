import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLOWERS, JOINTS, VESSELS, cloneDesign, createRod, initialDesign, metrics, moveTip, parseDesign, reposition, settleRod, type Kind, type Point, type VesselId } from '../src/modules/insertion-lab/rod';

function expectValid(rod: ReturnType<typeof createRod>,vessel: VesselId){
  const m=metrics(rod,vessel);
  assert.ok(m.lengthError<.001,`${rod.kind} length error ${m.lengthError}`);
  assert.ok(m.penetration<.0008,`${rod.kind} penetrates the cavity by ${m.penetration}`);
  assert.ok(m.insertion>=.09);
  assert.ok(m.maxBend<=55,`excessively kinked stem: ${m.maxBend}`);
  assert.equal(rod.points[rod.guide][1],VESSELS[vessel].height);
  assert.ok(rod.points[0][1]<VESSELS[vessel].height-.075);
  assert.ok(rod.points.every(p=>p.every(Number.isFinite)));
}

test('all three strands retain insertion and length under large, fast drags in every vessel',()=>{
  for(const vessel of ['bud','wide','glass'] as VesselId[])for(const kind of Object.keys(FLOWERS) as Kind[]){
    let rod=createRod(kind,kind,vessel,2);
    for(const target of [[.9,.01,.2],[-.8,.3,-.8],[0,1.5,0],[0,-1,0],[.08,.47,-.12]] as Point[]){
      const before=JSON.stringify(rod);const next=moveTip(rod,target,vessel);
      assert.equal(JSON.stringify(rod),before,'dragging must not mutate history');
      rod=settleRod(next);expectValid(rod,vessel);
    }
  }
});

test('switching vessels and moving the insertion point keeps the strand inside the new cavity',()=>{
  for(const kind of Object.keys(FLOWERS) as Kind[]){
    let rod=moveTip(createRod(kind,kind,'wide',1),[-.25,.35,.2],'wide');
    for(const vessel of ['bud','wide','bud'] as VesselId[]){
      rod=reposition(rod,vessel,[.5,-.5]);expectValid(rod,vessel);
      rod=reposition(rod,vessel,[-.5,.5],4);expectValid(rod,vessel);
      rod=reposition(rod,vessel,[0,0],100);expectValid(rod,vessel);
    }
  }
});

test('committing and JSON restore preserve edited geometry instead of reverting to the bind pose',()=>{
  const design=initialDesign(),initial=cloneDesign(design);
  design.rods[0]=settleRod(moveTip(design.rods[0],[.18,.43,0],design.vessel));
  assert.notDeepEqual(design.rods[0].points,initial.rods[0].points);
  assert.deepEqual(design.rods[0].rest,design.rods[0].points);
  assert.deepEqual(parseDesign(JSON.parse(JSON.stringify(design))),design);
  const restored=parseDesign(design);restored.rods[0].points[JOINTS-1][0]+=.1;
  assert.notDeepEqual(restored,design,'restore must not share mutable coordinates');
});

test('restore rejects duplicate IDs, stretched geometry, below-floor strands and invalid material data',()=>{
  const cases: Array<(d:ReturnType<typeof initialDesign>)=>void>=[
    d=>{d.rods[1].id=d.rods[0].id;},
    d=>{d.rods[0].points[20][0]=1;},
    d=>{d.rods[0].points[0][1]=-.1;},
    d=>{d.rods[0].twist=NaN;},
    d=>{d.rods[0].guide=1;},
  ];
  for(const mutate of cases){const d=initialDesign();mutate(d);assert.throws(()=>parseDesign(d));}
});

test('repeated edits across a concave shoulder never accumulate invalid segment contacts',()=>{
  let seed=873;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(const kind of Object.keys(FLOWERS) as Kind[]){
    let vessel:VesselId='bud',rod=createRod(kind,kind,vessel);
    for(let i=0;i<80;i++){
      if(i%7===0){vessel=vessel==='bud'?'wide':'bud';rod=reposition(rod,vessel,[(random()-.5)*.1,(random()-.5)*.1],Math.round(random()*14));}
      else rod=settleRod(moveTip(rod,[(random()-.5)*1.3,random(),(random()-.5)*1.3],vessel));
      expectValid(rod,vessel);
      assert.doesNotThrow(()=>parseDesign({version:1,vessel,rods:[rod]}));
    }
  }
});

test('the three lab GLBs contain deformation joints and skinned geometry, not rigid display-only assets',()=>{
  for(const flower of Object.values(FLOWERS)){
    const bytes=readFileSync(new URL('../public'+flower.model,import.meta.url));
    assert.equal(bytes.toString('ascii',0,4),'glTF');
    const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    assert.equal(gltf.skins.length,1);assert.equal(gltf.skins[0].joints.length,JOINTS);
    assert.equal(gltf.nodes.filter((n:{name?:string})=>n.name?.startsWith('Lab_joint_')).length,JOINTS);
    for(const node of gltf.nodes.filter((n:{mesh?:number})=>n.mesh!==undefined))assert.equal(node.skin,0);
    for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
      assert.equal(typeof primitive.attributes.JOINTS_0,'number');
      assert.equal(typeof primitive.attributes.WEIGHTS_0,'number');
    }
  }
});
