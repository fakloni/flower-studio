import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOWERS, JOINTS, cloneDesign, createRod, distance, initialDesign, metrics, parseDesign, type Kind, type Point, type VesselId } from '../src/modules/insertion-lab/rod';
import { adjustPlacement, createPlacement, initialPlacement, maxInsertion, placeTip, toPlacement, validPlacement } from '../src/modules/insertion-lab/placement';

const kinds=Object.keys(FLOWERS) as Kind[];
function assertRigid(before:ReturnType<typeof createPlacement>,after:ReturnType<typeof createPlacement>){
  for(let i=0;i<JOINTS;i++)for(let j=i+1;j<JOINTS;j++)assert.ok(Math.abs(distance(before.points[i],before.points[j])-distance(after.points[i],after.points[j]))<1e-8,'all pairwise distances must stay fixed');
}

test('locked bending repositions the whole plant without changing its existing shape',()=>{
  for(const vessel of ['bud','wide','glass'] as VesselId[])for(const kind of kinds){
    const initial=createPlacement(kind,kind,vessel,1);let rod=initial;
    for(const target of [[.24,.43,.05],[-.8,-.5,.8],[0,2,0],[.08,.55,-.12]] as Point[]){
      rod=placeTip(rod,target,vessel,false);assertRigid(initial,rod);assert.ok(validPlacement(rod,vessel));
      const m=metrics(rod,vessel);assert.ok(m.penetration<1e-7);assert.ok(m.insertion>=.09);
      assert.doesNotThrow(()=>parseDesign({version:1,interaction:'place',vessel,rods:[rod]}));
    }
  }
});

test('tilting moves the lower end while explicit depth adjustment remains continuous',()=>{
  const original=createPlacement('tulip','t','bud');
  const target:Point=[original.points[24][0]+.10,original.points[24][1]-.05,original.points[24][2]];
  const moved=placeTip(original,target,'bud');
  assert.notDeepEqual(moved.points[0],original.points[0],'the bottom must not be nailed down');
  assert.notDeepEqual(moved.placement?.direction,original.placement?.direction);
  const depthA=adjustPlacement(original,'bud',original.mouth,.150);
  const depthB=adjustPlacement(original,'bud',original.mouth,.151);
  assert.ok(Math.abs(depthB.points[24][1]-depthA.points[24][1])<.0011);
  assert.ok(Math.abs(depthB.points[24][1]-depthA.points[24][1])>.0005);
  assertRigid(depthA,depthB);
});

test('dragging never changes insertion depth or mouth support, including repeated extreme targets',()=>{
  for(const vessel of ['bud','wide','glass'] as VesselId[])for(const kind of kinds){
    const initial=createPlacement(kind,kind,vessel,1);let rod=initial;
    const mouth:Point=[initial.mouth[0],({bud:.232,wide:.262,glass:.2715})[vessel],initial.mouth[1]];
    const exposedChord=distance(initial.points[24],mouth);
    for(const target of [[.4,.2,.5],[0,1.5,0],[-.6,.1,-.7],[.04,.55,-.12]] as Point[]){
      rod=placeTip(rod,target,vessel,false);
      assert.equal(rod.placement!.insertion,initial.placement!.insertion);
      assert.deepEqual(rod.mouth,initial.mouth);
      assert.equal(rod.twist,initial.twist);
      assert.ok(Math.abs(distance(rod.points[24],mouth)-exposedChord)<1e-9);
      assertRigid(initial,rod);assert.ok(validPlacement(rod,vessel));
    }
    // Moving the cursor along the exposed stem's axis is not an implicit lift/push gesture.
    for(const factor of [.3,2,5]){
      const target=initial.points[24].map((x,i)=>mouth[i]+(x-mouth[i])*factor) as Point;
      const unchanged=placeTip(initial,target,vessel);
      unchanged.points.forEach((p,i)=>assert.ok(distance(p,initial.points[i])<1e-7));
    }
  }
});

test('mouth, depth, twist and vessel changes preserve rigid shape and remain within the inner cavity',()=>{
  for(const kind of kinds){
    const original=createPlacement(kind,kind,'bud');let rod=original;
    for(const vessel of ['wide','bud','glass'] as VesselId[])for(const depth of [.09,.156,maxInsertion(kind,vessel)])for(const twist of [-Math.PI,0,Math.PI]){
      rod=adjustPlacement(rod,vessel,[.5,-.5],depth,twist);
      assertRigid(original,rod);assert.ok(validPlacement(rod,vessel));
      assert.doesNotThrow(()=>parseDesign({version:1,interaction:'place',vessel,rods:[rod]}));
    }
  }
});

test('both old bending drafts and new rigid drafts round-trip, with independent undo snapshots',()=>{
  assert.deepEqual(parseDesign(initialDesign()),initialDesign());
  const design=initialPlacement();design.rods[0]=placeTip(design.rods[0],[.12,.53,0],'bud');
  assert.deepEqual(parseDesign(JSON.parse(JSON.stringify(design))),design);
  const undo=cloneDesign(design);undo.rods[0].placement!.direction[0]+=.1;
  assert.notDeepEqual(undo,design);
  const invalid=cloneDesign(design);invalid.rods[0].points[10][0]+=.005;
  assert.throws(()=>parseDesign(invalid));
  const legacy=createRod('rose','legacy','bud');assert.ok(validPlacement(toPlacement(legacy,'bud'),'bud'));
});

test('repeated extreme targets do not accumulate deformation or pull the stem out',()=>{
  let seed=912;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(const kind of kinds){
    const original=createPlacement(kind,kind,'bud');let rod=original;
    for(let i=0;i<30;i++){
      rod=placeTip(rod,[(random()-.5)*2,random()*1.2,(random()-.5)*2],'bud',false);
      assertRigid(original,rod);assert.ok(validPlacement(rod,'bud'));
    }
  }
});
