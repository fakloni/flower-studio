import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSupportedDesign} from '../src/modules/insertion-lab/support';
import {solveArrangementDrag} from '../src/modules/insertion-lab/drag-solver';
import {bloomConstraint} from '../src/modules/insertion-lab/contact';
import {stemClearance,stemGap} from '../src/modules/insertion-lab/stem-contact';
import {segmentDistanceSquared,segmentSeparation} from '../src/modules/insertion-lab/segment-distance';
import {validPlacement} from '../src/modules/insertion-lab/placement';
import {FLOWERS,distance,parseDesign,type Point} from '../src/modules/insertion-lab/rod';
import {placementGeometry} from '../src/modules/insertion-lab/placement-geometry';

test('the shared drag sweep retains stem, head and vase constraints throughout a rapid pointer replay',()=>{
  const design=initialSupportedDesign();
  for(const original of design.rods){
    let rod=original;const start=rod.points[24];
    for(let i=1;i<=24;i++){
      const before=rod,angle=i/24*Math.PI*2,target:Point=[start[0]+Math.sin(angle)*.12,start[1]+Math.cos(angle)*.03,start[2]+Math.cos(angle)*.08];
      const tip=rod.points[24],delta=target.map((n,a)=>n-tip[a]),fraction=Math.min(1,.008/Math.hypot(...delta));
      rod=solveArrangementDrag(rod,tip.map((n,a)=>n+delta[a]*fraction) as Point,design.rods,design.vessel);
      assert.ok(validPlacement(rod,design.vessel));assert.ok(stemClearance(rod,design.rods)>=-1e-7);
      assert.ok(bloomConstraint(before,design.rods,design.vessel)(rod));
      assert.doesNotThrow(()=>parseDesign({...design,rods:design.rods.map(r=>r.id===rod.id?rod:r)}));
    }
  }
});

test('segment bounds pruning preserves the closest distance for skewed and intersecting stems',()=>{
  const [a,seed]=initialSupportedDesign().rods;
  for(let sample=0;sample<30;sample++){
    const b={...seed,points:seed.points.map((p,i)=>[p[0]+Math.sin(sample+i*.1)*.05,p[1]+Math.cos(sample)*.1,p[2]+Math.sin(sample*.7)*.05] as Point)};
    let expected=Infinity;
    for(let i=1;i<a.points.length;i++)for(let j=1;j<b.points.length;j++)expected=Math.min(expected,Math.hypot(...segmentSeparation(a.points[i-1],a.points[i],b.points[j-1],b.points[j])));
    expected-=FLOWERS[a.kind].radius+FLOWERS[b.kind].radius+.0005;
    assert.ok(Math.abs(stemGap(a,b)-expected)<1e-12);
  }
});

test('cached geometric frames remain correct when a caller changes mouth, bend or direction',()=>{
  const rod=initialSupportedDesign().rods[0],p=rod.placement!;
  const a=placementGeometry(rod.kind,.52,p,rod.mouth,rod.twist,.232);
  assert.equal(placementGeometry(rod.kind,.52,p,rod.mouth,rod.twist,.232),a);
  const mouth:[number,number]=[rod.mouth[0]+.002,rod.mouth[1]];
  const b=placementGeometry(rod.kind,.52,p,mouth,rod.twist,.232);
  assert.notEqual(a,b);assert.ok(Math.abs(distance(a.points[24],b.points[24])-.002)<1e-12);
  p.bend=[.01,0];const c=placementGeometry(rod.kind,.52,p,mouth,rod.twist,.232);assert.notEqual(b,c);
  p.direction=[0,1,0];assert.notEqual(placementGeometry(rod.kind,.52,p,mouth,rod.twist,.232),c);
});

test('the scalar closest-point kernel agrees with full separation across skew, parallel and degenerate segments',()=>{
  let state=42;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296-.5;};
  const point=()=>[random(),random(),random()] as Point;
  for(let i=0;i<1000;i++){
    const a=point(),b=i%5?point():a,c=point(),d=i%7?point():c;
    const expected=Math.hypot(...segmentSeparation(a,b,c,d))**2;
    assert.ok(Math.abs(segmentDistanceSquared(a,b,c,d)-expected)<1e-12);
  }
});
