import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { bloomOf, contactStudy, contactsFor, limitBloomMove, MAX_COMPRESSION, pairContact, tissueOffset, type Bloom } from '../src/modules/insertion-lab/contact';
import { adjustPlacement, placeTip, validPlacement } from '../src/modules/insertion-lab/placement';
import { parseDesign, type Point, type VesselId } from '../src/modules/insertion-lab/rod';
import { prepareTissue, stepTissue, targetTissue } from '../src/modules/insertion-lab/tissue';
import { glassSurface } from '../src/modules/insertion-lab/surfaces';

const sphere=(id:string,center:Point):Bloom=>({id,center,axes:[[1,0,0],[0,1,0],[0,0,1]],radii:[.04,.04,.04]});
test('untouched petals do not upload or rebuild geometry when no other flower is touching them',()=>{
  const geometry=new THREE.PlaneGeometry(.08,.08,8,8),mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.name='white-tulip-petal-test';
  const tissue=prepareTissue(mesh,'tulip')!,position=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const version=position.version,before=Array.from(position.array);
  for(let i=0;i<60;i++){targetTissue(tissue,sphere('a',[0,0,0]),[],[]);assert.equal(stepTissue(tissue,1/60),0);}
  assert.equal(position.version,version);assert.deepEqual(Array.from(position.array),before);
  mesh.geometry.dispose();geometry.dispose();mesh.material.dispose();
});
test('contact is symmetric, directional and inactive across a genuine gap',()=>{
  const a=sphere('a',[0,0,0]),b=sphere('b',[.07,0,0]);
  const c=pairContact(a,b)!;assert.ok(Math.abs(c.a.overlap-.01)<1e-9);
  assert.deepEqual(c.a.direction,[1,0,0]);assert.deepEqual(c.b.direction,[-1,-0,-0]);
  assert.equal(contactsFor([a,b]).get('a')!.length,1);
  assert.equal(pairContact(a,sphere('c',[.09,0,0])),null);
  const contact=[c.a];
  assert.deepEqual(tissueOffset([.04,0,0],0,contact),[0,0,0],'attachment stays fixed');
  assert.deepEqual(tissueOffset([-.04,0,0],1,contact),[0,0,0],'far side stays uncompressed');
  const dent=tissueOffset([.04,0,0],1,contact);
  assert.ok(dent[0]<-.0008&&Math.hypot(...dent)<=MAX_COMPRESSION*.6);
  assert.deepEqual(tissueOffset([.04,0,0],1,[]),[0,0,0],'separation returns the exact rest target');
});

test('fast head dragging stops at a bounded contact before tunnelling through its neighbour',()=>{
  const design=contactStudy(),[before,other]=design.rods;
  assert.ok(validPlacement(before,'glass'));assert.ok(validPlacement(other,'glass'));
  assert.equal(pairContact(bloomOf(before,'glass')!,bloomOf(other,'glass')!),null,'study starts separated');
  const target=other.points[24].map((x,i)=>i===0?x+.13:x) as Point;
  const requested=placeTip(before,target,'glass');
  const limited=limitBloomMove(before,requested,design.rods,'glass');
  assert.ok(validPlacement(limited,'glass'));
  assert.equal(limited.placement!.insertion,before.placement!.insertion);
  assert.deepEqual(limited.mouth,before.mouth);
  assert.equal(limited.twist,before.twist);
  const a=bloomOf(limited,'glass')!,b=bloomOf(other,'glass')!;
  assert.ok(a.center[0]<b.center[0],'cannot pass through the other head in a single move');
  const contact=pairContact(a,b)!;assert.ok(contact.a.overlap<=MAX_COMPRESSION+1e-6&&contact.a.overlap>MAX_COMPRESSION*.75);
  const released=limitBloomMove(limited,before,[limited,other],'glass');
  assert.deepEqual(released,before,'a compressed head can be separated again');
  assert.doesNotThrow(()=>parseDesign({...design,rods:[limited,other]}));
});

test('deformation buffers belong to each flower, roots remain fixed, and repeated release leaves no dent',()=>{
  const geometry=new THREE.PlaneGeometry(.08,.08,8,8);geometry.translate(0,.04,0);
  const source=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());source.name='white-tulip-petal-test';
  const first=source.clone(),second=source.clone();
  const tissue=prepareTissue(first,'tulip')!,other=prepareTissue(second,'tulip')!;
  assert.notEqual(first.geometry,second.geometry);assert.notEqual(first.geometry,geometry);
  const snapshot=Array.from(second.geometry.getAttribute('position').array);
  const bloom=sphere('a',[0,.04,0]);
  for(let cycle=0;cycle<5;cycle++){
    targetTissue(tissue,bloom,[{direction:[1,0,0],radius:.04,overlap:.012}],[]);
    for(let i=0;i<60;i++)stepTissue(tissue,1/60);
    const p=first.geometry.getAttribute('position');let moved=false;
    for(let i=0;i<p.count;i++){
      if(tissue.mobility[i]===0)assert.equal(p.getX(i),tissue.rest[i*3]);
      if(Math.abs(p.getX(i)-tissue.rest[i*3])>.001)moved=true;
    }
    assert.ok(moved);
    assert.deepEqual(Array.from(second.geometry.getAttribute('position').array),snapshot);
    targetTissue(tissue,bloom,[],[]);
    for(let i=0;i<100;i++)stepTissue(tissue,1/60);
    assert.deepEqual(Array.from(p.array),Array.from(tissue.rest));
  }
  first.geometry.dispose();second.geometry.dispose();geometry.dispose();source.material.dispose();
});

test('glass keeps physical transmission, full opacity, and compatible insertion constraints',()=>{
  const glass=glassSurface();assert.equal(glass.transmission,1);assert.equal(glass.opacity,1);
  assert.equal(glass.transparent,false);assert.ok(glass.thickness>0&&glass.ior>1);glass.dispose();
  const design=contactStudy();
  for(const vessel of ['bud','glass','wide'] as VesselId[]){
    const rods=design.rods.map(r=>adjustPlacement(r,vessel));
    rods.forEach(r=>assert.ok(validPlacement(r,vessel)));
    assert.doesNotThrow(()=>parseDesign({...design,vessel,rods}));
  }
});

test('exported assets retain coloured materials and surface data instead of silently turning white',()=>{
  for(const kind of ['rose','tulip','eucalyptus']){
    const bytes=readFileSync(`public/assets/insertion-lab/v6/${kind}.glb`);
    const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    assert.ok(gltf.materials.some((m:{pbrMetallicRoughness?:{baseColorFactor?:number[]}})=>{
      const rgb=m.pbrMetallicRoughness?.baseColorFactor;return rgb&&rgb[1]>rgb[0]*1.2;
    }),'green plant tissue retains its base colour');
    for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
      assert.ok(Object.hasOwn(primitive.attributes,'COLOR_0'));assert.ok(Object.hasOwn(primitive.attributes,'TEXCOORD_0'));
    }
    if(kind==='tulip')assert.ok(!gltf.nodes.some((n:{name:string})=>n.name==='white-tulip-leaf-0'));
  }
});
