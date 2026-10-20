import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMeals,validateRating} from '../server/meals.js';
test('daily intake sums each person-sized record and never treats missing nutrients as zero',()=>{
  const summary=summarizeMeals([{nutrition:{kcal:500,fat:12,sugars:0}},{nutrition:{kcal:250,fat:8,sugars:null}}]);
  assert.equal(summary.totals.kcal,750);assert.equal(summary.totals.fat,20);
  assert.equal(summary.totals.sugars,null);assert.equal(summary.knownTotals.sugars,0);assert.equal(summary.missing.sugars,1);
  assert.equal(summary.complete,false);
  assert.equal(summarizeMeals([]).totals.kcal,0);
});
test('ratings accept exactly integers 1 through 5',()=>{
  for(const value of [0,6,1.5,null,'5',true])assert.throws(()=>validateRating(value),{code:'INVALID_RATING'});
  for(const value of [1,2,3,4,5])assert.doesNotThrow(()=>validateRating(value));
});
