import test from 'node:test';
import assert from 'node:assert/strict';
import { fitStemToInsertion } from '../src/modules/visuals/insertion';

test('insertion preserves a thin stem cross-section instead of collapsing it into a line',()=>{
  assert.deepEqual(fitStemToInsertion([.003,.18,0],[0,.18,0]),[.003,.18,0]);
  assert.deepEqual(fitStemToInsertion([0,.17,0],[0,.18,0]),[0,.17,0]);
  const wide=fitStemToInsertion([.08,.18,.06],[0,.18,0]);
  assert.ok(Math.abs(Math.hypot(wide[0],wide[2])-.01)<1e-10);
});

test('insertion leaves flower heads unchanged and produces finite intermediate sections',()=>{
  const head:[number,number,number]=[.2,.4,-.1];
  assert.deepEqual(fitStemToInsertion(head,[0,.18,0]),head);
  const middle=fitStemToInsertion([.08,.24,0],[0,.18,0]);
  assert.ok(middle.every(Number.isFinite));
  assert.ok(middle[0]>.01&&middle[0]<.08);
  assert.equal(middle[1],.24);
});
