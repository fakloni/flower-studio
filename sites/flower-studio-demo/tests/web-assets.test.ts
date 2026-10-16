import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flowers,vases } from '../src/modules/catalog/data';

type Glb = {nodes:Array<{name?:string;mesh?:number}>;materials:Array<{name?:string;pbrMetallicRoughness?:{baseColorFactor?:number[]}}>};
function readGlb(url:string):Glb {
  const bytes=readFileSync(`public${url.split('?')[0]}`);
  assert.equal(bytes.readUInt32LE(0),0x46546c67,'Expected a GLB model');
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
  return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
}

test('every selectable flower and vase has a valid web model with visible geometry',()=>{
  for(const asset of [...flowers,...vases]){
    const model=readGlb(asset.model);
    assert.ok(model.nodes.some(node=>node.mesh!==undefined),`${asset.name} has no geometry`);
  }
});

test('spider lily contains the flower and stem, without an opaque scene-effect envelope',()=>{
  const model=readGlb(flowers.find(flower=>flower.id==='spider-lily')!.model);
  assert.ok(model.nodes.some(node=>node.name==='stem'&&node.mesh!==undefined));
  assert.ok(model.nodes.some(node=>node.name?.startsWith('flower')&&node.mesh!==undefined));
  assert.ok(!model.nodes.some(node=>node.mesh!==undefined&&/mist|fog|volume/i.test(node.name??'')));
  const petals=model.materials.filter(material=>material.name?.startsWith('flowerRed')||material.name?.startsWith('flowerDarkRed'));
  assert.equal(petals.length,2);
  for(const petal of petals){
    const color=petal.pbrMetallicRoughness?.baseColorFactor;
    assert.ok(color,'Petal color must survive the GLB export');
    assert.ok(color[0]>.03&&color[0]>color[1]*2&&color[0]>color[2]*2,'Petals must render red rather than default white');
  }
});
