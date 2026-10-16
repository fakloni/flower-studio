import type {Point,Rod,VesselId} from './rod';
import {bloomConstraint} from './contact';
import {placeTip} from './placement';
import {moveSupportedTip} from './support';
import {limitStemMove} from './stem-contact';

/** One shared supported sweep for stems and heads, with a final check only after sliding. */
export function solveArrangementDrag(before:Rod,requested:Point,others:Rod[],vessel:VesselId,gentle=true,contacts=true):Rod {
  const candidate=before.placement?.seated?moveSupportedTip(before,requested,vessel,gentle):placeTip(before,requested,vessel,gentle);
  const allowed=contacts?bloomConstraint(before,others,vessel):undefined;
  const result=limitStemMove(before,candidate,others,vessel,true,allowed);
  return result===candidate?result:limitStemMove(before,result,others,vessel,false,allowed);
}
