import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesign,historyReducer,parseDesign,recipe,MAX_STEMS,type History } from '../src/modules/design/model';

function state():History {return {present:createDesign(),past:[],future:[]};}
test('counts describe stems, independent of visual geometry and layout',()=>{
  let history=state();const before=recipe(history.present);
  history=historyReducer(history,{type:'move',id:history.present.stems[0].id,position:[.15,.08,-.04]});
  history=historyReducer(history,{type:'rotate',id:history.present.stems[0].id,radians:.4});
  history=historyReducer(history,{type:'mode',mode:'auto'});
  assert.deepEqual(recipe(history.present),before);
  history=historyReducer(history,{type:'rearrange'});assert.deepEqual(recipe(history.present),before);
});
test('add, replace and remove preserve a correct, independently recoverable recipe',()=>{
  let history=state();history=historyReducer(history,{type:'add',flowerId:'pink-rose',id:'additional-stem'});
  assert.equal(history.present.stems.length,9);assert.equal(recipe(history.present).find(row=>row.id==='pink-rose')?.count,4);
  history=historyReducer(history,{type:'replace',id:'additional-stem',flowerId:'sunflower'});
  assert.equal(history.present.stems.length,9);assert.equal(recipe(history.present).find(row=>row.id==='pink-rose')?.count,3);assert.equal(recipe(history.present).find(row=>row.id==='sunflower')?.count,1);
  history=historyReducer(history,{type:'remove',id:'additional-stem'});assert.equal(recipe(history.present).some(row=>row.id==='sunflower'),false);
  history=historyReducer(history,{type:'undo'});assert.equal(recipe(history.present).find(row=>row.id==='sunflower')?.count,1);
  history=historyReducer(history,{type:'redo'});assert.equal(history.present.stems.length,8);
});
test('undo restores placement and a new edit clears the redo branch',()=>{
  let history=state();const original=structuredClone(history.present);const id=original.stems[0].id;
  history=historyReducer(history,{type:'move',id,position:[.2,.1,0]});history=historyReducer(history,{type:'undo'});
  assert.deepEqual(history.present,original);history=historyReducer(history,{type:'add',flowerId:'eucalyptus',id:'new-branch'});assert.equal(history.future.length,0);
});
test('a generated shopping snapshot and template remain stable after edits',()=>{
  const original=createDesign();const snapshot=structuredClone(original);const history=historyReducer({present:original,past:[],future:[]},{type:'remove',id:original.stems[0].id});
  assert.equal(snapshot.stems.length,8);assert.equal(original.stems.length,8);assert.equal(history.present.stems.length,7);
});
test('saved documents round-trip and reject corrupted references and coordinates',()=>{
  const design=createDesign();assert.deepEqual(parseDesign(JSON.parse(JSON.stringify(design))),design);
  for(const transform of [(d:typeof design)=>{d.version=2 as 1;},(d:typeof design)=>{d.stems[0].position[0]=Infinity;},(d:typeof design)=>{d.stems[1].id=d.stems[0].id;},(d:typeof design)=>{d.stems[0].flowerId='unknown' as 'pink-rose';}]){
    const input=structuredClone(design);transform(input);assert.throws(()=>parseDesign(input));
  }
});
test('a vase or scene switch retains both the recipe and manual placement',()=>{
  let history=state();history=historyReducer(history,{type:'move',id:history.present.stems[0].id,position:[.02,.03,.04]});const stems=structuredClone(history.present.stems);
  history=historyReducer(history,{type:'vase',vaseId:'sage-fluted'});history=historyReducer(history,{type:'scene',scene:'bouquet'});assert.deepEqual(history.present.stems,stems);
});
test('the supported capacity is enforced without silently dropping saved stems',()=>{
  let history=state();for(let i=0;i<MAX_STEMS;i++)history=historyReducer(history,{type:'add',flowerId:'eucalyptus',id:`extra-${i}`});
  assert.equal(history.present.stems.length,MAX_STEMS);assert.doesNotThrow(()=>parseDesign(history.present));
});
