import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMeals,summarizeWeek,validateRating} from '../server/meals.js';
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

test('week crosses year boundary, keeps missing nutrients partial and excludes other dates',()=>{
 const week=summarizeWeek('2027-01-01',[
  {date:'2026-12-28',nutrition:{kcal:400}},
  {date:'2026-12-28',nutrition:{kcal:null}},
  {date:'2027-01-01',nutrition:{kcal:250}},
  {date:'2026-12-27',nutrition:{kcal:900}},
  {date:'2027-01-04',nutrition:{kcal:999}},
 ]);
 assert.equal(week.length,7);assert.equal(week[0].date,'2026-12-28');assert.equal(week[6].date,'2027-01-03');
 assert.equal(week[0].totals.kcal,null);assert.equal(week[0].knownTotals.kcal,400);assert.equal(week[0].count,2);
 assert.equal(week[4].totals.kcal,250);assert.equal(week[1].count,0);
 assert.equal(summarizeWeek('2027-01-03',[])[0].date,'2026-12-28');
});
