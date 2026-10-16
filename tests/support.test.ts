import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOWERS,cloneDesign,distance,initialDesign,parseDesign,supportMetrics,type Kind,type Point,type VesselId} from '../src/modules/insertion-lab/rod';
import {createPlacement,interpolatePlacement,rebuildPlacement,validPlacement} from '../src/modules/insertion-lab/placement';
import {adjustSupportedPlacement,createSupportedPlacement,initialSupportedDesign,moveSupportedTip,seatPlacement,settleSupportedRod,supportedContactStudy} from '../src/modules/insertion-lab/support';
import {supportedBetween} from '../src/modules/insertion-lab/seating';
import {limitBloomMove} from '../src/modules/insertion-lab/contact';
import {limitStemMove,segmentDistance,stemClearance,stemGap} from '../src/modules/insertion-lab/stem-contact';
import {intrinsic,placementGeometry} from '../src/modules/insertion-lab/placement-geometry';

test('new stems seat on a real floor or wall in all vessels and survive persistence',()=>{
  for(const vessel of ['bud','wide','glass'] as VesselId[])for(const kind of Object.keys(FLOWERS) as Kind[]){
    const rod=createSupportedPlacement(kind,kind,vessel,1);
    assert.equal(rod.placement!.seated,true);assert.ok(validPlacement(rod,vessel));
    assert.notEqual(supportMetrics(rod,vessel).type,'none');
    assert.deepEqual(parseDesign({version:1,interaction:'place',vessel,rods:[rod]}).rods[0],rod);
  }
  assert.deepEqual(parseDesign(initialDesign()),initialDesign(),'legacy drafts remain unchanged');
  const floating=createPlacement('tulip','old','glass');
  const invalid=rebuildPlacement(floating,'glass',{...floating.placement!,seated:true});
  assert.throws(()=>parseDesign({version:1,interaction:'place',vessel:'glass',rods:[invalid]}));
  const seated=createSupportedPlacement('tulip','a','glass');
  assert.throws(()=>parseDesign({version:1,interaction:'place',vessel:'glass',rods:[seated,{...seated,id:'b'}]}),'overlapping seated drafts are rejected');
});

test('mouth and twist controls follow inner-wall support, and tiny settling retains support throughout',()=>{
  const original=createSupportedPlacement('tulip','t','glass');
  for(const twist of [-Math.PI,Math.PI]){
    const requested=rebuildPlacement(original,'glass',original.placement,[.05,.02],twist);
    const adjusted=adjustSupportedPlacement(original,requested,'glass');
    assert.ok(validPlacement(adjusted,'glass'));
    assert.notEqual(supportMetrics(adjusted,'glass').type,'none');
  }
  const tip=original.points[24],bent=moveSupportedTip(original,[tip[0]+.13,tip[1],tip[2]],'glass');
  const settled=settleSupportedRod(bent,'glass');
  assert.ok(distance(bent.points[24],settled.points[24])<.001);
  for(let i=0;i<=18;i++){
    const frame=interpolatePlacement(bent,settled,i/18,'glass');
    assert.ok(validPlacement(frame,'glass'));assert.notEqual(supportMetrics(frame,'glass').type,'none');
  }
});

test('initial supported bouquet and glass study have non-intersecting main stems',()=>{
  for(const design of [initialSupportedDesign(),supportedContactStudy()]){
    design.rods.forEach(rod=>{
      assert.ok(validPlacement(rod,design.vessel));assert.ok(stemClearance(rod,design.rods)>=0);
      assert.notEqual(supportMetrics(rod,design.vessel).type,'none');
    });
    assert.doesNotThrow(()=>parseDesign(design));
  }
  const study=supportedContactStudy();
  study.rods.forEach(rod=>assert.ok(rod.points[0][1]<.012,'glass stems actually reach the interior floor'));
});

test('supported dragging slides the mouth contact without stretching or pulling a stem through the vase',()=>{
  for(const vessel of ['bud','glass'] as VesselId[])for(const kind of Object.keys(FLOWERS) as Kind[]){
    let rod=createSupportedPlacement(kind,kind,vessel,1);
    for(const delta of [[.13,0,0],[-.2,.3,.1],[.1,-.3,-.15]] as Point[]){
      const before=rod,tip=before.points[24],requested=tip.map((n,i)=>n+delta[i]) as Point;
      rod=moveSupportedTip(before,requested,vessel);
      assert.ok(validPlacement(rod,vessel));
      assert.notEqual(supportMetrics(rod,vessel).type,'none');
      const curve=placementGeometry(kind,FLOWERS[kind].length,rod.placement!,rod.mouth,rod.twist,({bud:.232,glass:.2715})[vessel as 'bud'|'glass']).curve;
      const original=intrinsic(kind,FLOWERS[kind].length).points;
      for(let i=1;i<curve.length;i++)assert.ok(Math.abs(distance(curve[i],curve[i-1])-distance(original[i],original[i-1]))<1e-12);
      const settled=settleSupportedRod(rod,vessel);assert.ok(distance(settled.points[24],rod.points[24])<.001);
      assert.ok(validPlacement(settled,vessel));
    }
  }
});

test('every initial flower has a meaningful drag direction with both bloom and stem collisions enabled',()=>{
  const design=initialSupportedDesign();
  for(const rod of design.rods){
    let reach=0;
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,tip=rod.points[24],requested:Point=[tip[0]+Math.cos(a)*.12,tip[1],tip[2]+Math.sin(a)*.12];
      const moved=moveSupportedTip(rod,requested,design.vessel);
      const sliding=limitStemMove(rod,limitBloomMove(rod,moved,design.rods,design.vessel),design.rods,design.vessel,true);
      const limited=limitStemMove(rod,limitBloomMove(rod,sliding,design.rods,design.vessel),design.rods,design.vessel);
      reach=Math.max(reach,distance(tip,limited.points[24]));
      assert.ok(validPlacement(limited,design.vessel));assert.ok(stemClearance(limited,design.rods)>=-1e-7);
      assert.doesNotThrow(()=>parseDesign({...design,rods:design.rods.map(r=>r.id===rod.id?limited:r)}));
    }
    // The deeper rose has less room in the narrow neck; each flower must still move
    // substantially beyond the 12 mm flex-only range with the whole bouquet present.
    assert.ok(reach>(rod.kind==='rose'?.03:.07),`${rod.kind} remains movable beyond the tiny flex range: ${reach}`);
  }
});

test('support follows the curved contact path during a large move instead of cutting through the floor',()=>{
  const before=createSupportedPlacement('tulip','t','glass'),tip=before.points[24];
  const after=moveSupportedTip(before,[tip[0]+.10,tip[1],tip[2]+.04],'glass');
  assert.ok(distance(tip,after.points[24])>.06);
  assert.ok(Math.hypot(...after.mouth.map((n,i)=>n-before.mouth[i]))>.005);
  for(let i=0;i<=40;i++){
    const frame=supportedBetween(before,after,i/40,'glass');
    assert.ok(frame&&validPlacement(frame,'glass'));
    assert.notEqual(supportMetrics(frame,'glass').type,'none');
  }
  const limited=limitStemMove(before,after,[{...before,id:'far',points:before.points.map(p=>[p[0]+1,p[1],p[2]] as Point)}],'glass');
  assert.deepEqual(limited,after,'an unrelated neighbour must not freeze a supported rotation');
});

test('capsule contacts handle parallel stems, points, and projected crossings separated in depth',()=>{
  assert.equal(segmentDistance([0,0,0],[1,0,0],[.5,-1,0],[.5,1,0]),0);
  assert.equal(segmentDistance([0,0,0],[1,0,0],[0,0,.02],[1,0,.02]),.02);
  assert.equal(segmentDistance([0,0,0],[0,0,0],[0,1,0],[0,2,0]),1);
  assert.equal(segmentDistance([0,0,0],[1,0,0],[.5,-1,.02],[.5,1,.02]),.02);
});

test('a stem touching its neighbour can slide along it while the final path remains collision-free',()=>{
  const design=initialSupportedDesign(),before=design.rods[1],tip=before.points[24];
  const requested=moveSupportedTip(before,[tip[0]+.12,tip[1],tip[2]],design.vessel);
  const blocked=limitStemMove(before,requested,design.rods,design.vessel);
  const sliding=limitStemMove(before,requested,design.rods,design.vessel,true);
  const headChecked=limitBloomMove(before,sliding,design.rods,design.vessel);
  const result=limitStemMove(before,headChecked,design.rods,design.vessel);
  assert.ok(distance(tip,result.points[24])>distance(tip,blocked.points[24])+.01);
  assert.ok(distance(tip,result.points[24])>.07,'the complete constrained drag must allow a useful arrangement change');
  assert.ok(Math.abs(result.placement!.insertion-before.placement!.insertion)>.002,'support can move through the cavity beyond the old gesture quota');
  assert.ok(validPlacement(result,design.vessel));assert.ok(stemClearance(result,design.rods)>=-1e-7);
  for(let i=0;i<=40;i++){
    const frame=supportedBetween(before,result,i/40,design.vessel);
    assert.ok(frame&&validPlacement(frame,design.vessel));assert.ok(stemClearance(frame,design.rods)>=-1e-7);
  }
});

test('a fast supported move cannot tunnel a whole stem through its neighbour',()=>{
  const seed=createPlacement('tulip','a','glass');
  const a=seatPlacement(rebuildPlacement(seed,'glass',{direction:[0,1,0],insertion:.155},[-.015,0]),'glass')!;
  const b=seatPlacement(rebuildPlacement({...seed,id:'b'},'glass',{direction:[0,1,0],insertion:.155},[.015,0]),'glass')!;
  assert.ok(stemGap(a,b)>0);
  const target=rebuildPlacement(a,'glass',a.placement,[.035,0]);
  assert.ok(validPlacement(target,'glass'));assert.ok(stemGap(target,b)>0,'end point itself is separated');
  const limited=limitStemMove(a,target,[a,b],'glass');
  assert.ok(limited.mouth[0]<b.mouth[0]);assert.ok(stemGap(limited,b)>=-1e-7);
  assert.notDeepEqual(limited,target);assert.ok(validPlacement(limited,'glass'));
});
