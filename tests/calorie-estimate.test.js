import test from 'node:test';
import assert from 'node:assert/strict';
import {calorieEstimate} from '../src/calorie-estimate.js';
const p={weight:'70',height:'175',birthDate:'1996-10-20',calorieSex:'male',calorieActivity:'light',calorieEstimateEligible:true};
test('maintenance estimate uses age, measurements, sex and activity without setting a goal',()=>{
 assert.equal(calorieEstimate(p,'2026-10-20'),2650);
 assert.equal(calorieEstimate({...p,calorieSex:'female'},'2026-10-20'),2350);
});
test('no estimate for missing data, unconfirmed eligibility or ages outside original adult range',()=>{
 for(const change of [{weight:''},{height:''},{birthDate:''},{calorieSex:''},{calorieActivity:''},{calorieEstimateEligible:false},{birthDate:'2010-01-01'},{birthDate:'1940-01-01'},{weight:'NaN'}])assert.equal(calorieEstimate({...p,...change},'2026-10-20'),null);
});
