import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FLOWERS,VESSELS,cloneDesign,distance,parseDesign,type Kind,type Point,type VesselId } from '../src/modules/insertion-lab/rod';
import { BEND_CLEARANCE,MAX_TIP_BEND,boundedBend,intrinsic,placementGeometry } from '../src/modules/insertion-lab/placement-geometry';
import { createPlacement,placeTip,validPlacement } from '../src/modules/insertion-lab/placement';
import { applyStemSweep,prepareStemSweep } from '../src/modules/insertion-lab/stem-sweep';
import { prepareTissue,targetTissue,stepTissue } from '../src/modules/insertion-lab/tissue';

const kinds=Object.keys(FLOWERS) as Kind[];
function expectCurve(kind:Kind,insertion:number,bend:[number,number]){
  const length=FLOWERS[kind].length,g=placementGeometry(kind,length,{direction:[0,1,0],insertion,bend},[0,0],0,.27);
  const source=intrinsic(kind,length).points;
  for(let i=1;i<g.curve.length;i++){
    assert.ok(Math.abs(distance(g.curve[i],g.curve[i-1])-distance(source[i],source[i-1]))<1e-12,'each differential length is preserved');
    if(i/240*length<=insertion+BEND_CLEARANCE)assert.deepEqual(g.curve[i],source[i],'inserted part and lip clearance stay unchanged');
  }
  assert.ok(distance(g.curve[240],source[240])<=MAX_TIP_BEND+.0003,'tip flex is capped at about 12 mm');
  return g;
}
test('gentle bending preserves arclength, fixes the insertion region and has a small hard cap',()=>{
  for(const kind of kinds)for(const depth of [.09,.155,.20])for(const input of [[9,0],[0,-9],[5,5]] as [number,number][]){
    const bend=boundedBend(kind,FLOWERS[kind].length,depth,input);
    const g=expectCurve(kind,depth,bend);
    for(let i=1;i<240;i++){
      const a=g.curve[i].map((n,k)=>n-g.curve[i-1][k]),b=g.curve[i+1].map((n,k)=>n-g.curve[i][k]);
      const cosine=a.reduce((sum,n,k)=>sum+n*b[k],0)/Math.hypot(...a)/Math.hypot(...b);
      assert.ok(Math.acos(Math.max(-1,Math.min(1,cosine)))<.025,'no hinge, kink or rope-like hook');
    }
  }
});

test('repeated gentle drags retain depth, support, twist and bounded curvature in all three vessels',()=>{
  for(const vessel of ['bud','wide','glass'] as VesselId[])for(const kind of kinds){
    const initial=createPlacement(kind,kind,vessel,1);let rod=initial;
    for(const target of [[.25,.5,0],[-.5,.05,.4],[0,1.8,0],[.4,.35,-.1],[-.4,.5,.1]] as Point[]){
      rod=placeTip(rod,target,vessel);
      assert.equal(rod.placement!.insertion,initial.placement!.insertion);
      assert.deepEqual(rod.mouth,initial.mouth);assert.equal(rod.twist,initial.twist);
      assert.ok(validPlacement(rod,vessel));
      const bend=rod.placement!.bend??[0,0];expectCurve(kind,rod.placement!.insertion,bend);
      assert.deepEqual(parseDesign({version:1,interaction:'place',vessel,rods:[rod]}).rods[0],rod);
    }
  }
});

test('saved bends survive undo copies, reject excessive flex, and locked mode keeps the chosen arc',()=>{
  const initial=createPlacement('tulip','t','glass');
  const bent=placeTip(initial,[initial.points[24][0]+.13,initial.points[24][1],initial.points[24][2]],'glass');
  assert.ok(Math.hypot(...bent.placement!.bend!)>.01);
  const design={version:1 as const,interaction:'place' as const,vessel:'glass' as const,rods:[bent]};
  const copy=cloneDesign(design);copy.rods[0].placement!.bend![0]+=.01;
  assert.notDeepEqual(copy,design);
  const broken=cloneDesign(design);broken.rods[0].placement!.bend=[1,0];assert.throws(()=>parseDesign(broken));
  const locked=placeTip(bent,[.2,.4,.1],'glass',false);
  assert.deepEqual(locked.placement!.bend,bent.placement!.bend);
});

test('a flower head follows the bent stem as a rigid patch and contact recovery retains its bent base',()=>{
  const source=new THREE.BoxGeometry(.03,.06,.02);source.translate(0,.62,0);
  const mesh=new THREE.Mesh(source,new THREE.MeshStandardMaterial());mesh.name='curved-flower-petals';
  const sweep=prepareStemSweep(mesh,'rose',FLOWERS.rose.length),tissue=prepareTissue(mesh,'rose',false)!;
  const original=new Float32Array(source.getAttribute('position').array);
  const placement={direction:[0,1,0] as Point,insertion:.155,bend:boundedBend('rose',FLOWERS.rose.length,.155,[.08,0])};
  const g=placementGeometry('rose',FLOWERS.rose.length,placement,[0,0],0,VESSELS.glass.height);
  applyStemSweep(sweep,g,placement.bend,placement.insertion,tissue);
  const position=mesh.geometry.getAttribute('position'),p=(i:number)=>[position.getX(i),position.getY(i),position.getZ(i)] as Point;
  for(let i=0;i<position.count;i++)for(let j=i+1;j<position.count;j++){
    assert.ok(Math.abs(distance(p(i),p(j))-distance(Array.from(original.slice(i*3,i*3+3)) as Point,Array.from(original.slice(j*3,j*3+3)) as Point))<1e-7,'petals/head are not lengthened or squashed by the stem bend');
  }
  const bentBase=Array.from(tissue.rest);assert.notDeepEqual(bentBase,Array.from(original));
  targetTissue(tissue,null,[],[]);for(let i=0;i<60;i++)stepTissue(tissue,1/60);
  assert.deepEqual(Array.from(position.array),bentBase);
  assert.deepEqual(Array.from(source.getAttribute('position').array),Array.from(original),'source asset stays untouched');
  mesh.geometry.dispose();source.dispose();mesh.material.dispose();
});

test('separate trunk end caps follow their own section, without detaching or bending the inserted base',()=>{
  const source=new THREE.CylinderGeometry(.0025,.0025,.60,12,30);source.translate(0,.30,0);
  const mesh=new THREE.Mesh(source,new THREE.MeshStandardMaterial());mesh.name='main-stem-and-branches';
  const sweep=prepareStemSweep(mesh,'rose',FLOWERS.rose.length);
  const p={direction:[0,1,0] as Point,insertion:.155,bend:boundedBend('rose',FLOWERS.rose.length,.155,[.08,0])};
  const g=placementGeometry('rose',FLOWERS.rose.length,p,[0,0],0,.27);
  applyStemSweep(sweep,g,p.bend,p.insertion);
  const position=mesh.geometry.getAttribute('position');
  for(let i=0;i<position.count;i++){
    const at=i*3,original:Array<number>=Array.from(sweep.original.slice(at,at+3));
    if(original[1]<.00001||original[1]>.59999){
      const point=original.map(n=>n*g.scale) as Point,expected=g.deform(point,g.stationAt(point[1])).map(n=>n/g.scale) as Point;
      assert.ok(distance([position.getX(i),position.getY(i),position.getZ(i)],expected)<1e-7);
    }
  }
  mesh.geometry.dispose();source.dispose();mesh.material.dispose();
});

test('deep seating strips only submerged foliage in the instance and can restore its original geometry',()=>{
  const source=new THREE.PlaneGeometry(.02,.06,3,4);source.translate(.02,.22,0);
  const mesh=new THREE.Mesh(source,new THREE.MeshStandardMaterial());mesh.name='leaf-surfaces';
  const originalIndex=Array.from(source.index!.array),sweep=prepareStemSweep(mesh,'rose',FLOWERS.rose.length);
  const p={direction:[0,1,0] as Point,insertion:.27,seated:true as const};
  const g=placementGeometry('rose',FLOWERS.rose.length,p,[0,0],0,.2715);
  applyStemSweep(sweep,g,undefined,p.insertion,undefined,true);
  assert.equal(mesh.geometry.drawRange.count,0,'low leaf is prepared out of the insertion segment');
  assert.deepEqual(Array.from(source.index!.array),originalIndex,'published/source asset remains intact');
  applyStemSweep(sweep,g,undefined,p.insertion,undefined,false);
  assert.equal(mesh.geometry.drawRange.count,originalIndex.length);
  assert.equal(mesh.geometry.index!.count,originalIndex.length);
  assert.deepEqual(Array.from(mesh.geometry.index!.array),originalIndex);
  mesh.geometry.dispose();source.dispose();mesh.material.dispose();
});
