import test from 'node:test';
import assert from 'node:assert/strict';
import {kitchenOverview} from '../src/home-dashboard.js';
import {initialProfile} from '../src/data.js';
const ingredients=[{id:'tomate',name:'Tomate',category:'Vegetales'},{id:'huevo',name:'Huevo',category:'Proteínas'},{id:'arroz',name:'Arroz',category:'Granos'}];
const recipe=(id,foods,extra={})=>({id,ingredients:foods,time:15,allergens:[],vegan:true,...extra});
const overview=overrides=>kitchenOverview({ingredients,pantry:ingredients.map(i=>i.id),dates:{},recipes:[],profile:initialProfile,today:'2026-10-19',...overrides});
test('dashboard prioritizes upcoming dates and excludes missing, expired and allergenic ingredients',()=>{
 const result=overview({dates:{tomate:{labelDate:'2026-10-20'},arroz:{labelDate:'2026-10-18'}},profile:{...initialProfile,allergies:['Huevo']},recipes:[recipe('egg',['huevo'],{allergens:['Huevo']}),recipe('expired',['arroz']),recipe('missing',['pollo']),recipe('slow',['tomate'],{time:45}),recipe('tomato',['tomate'])]});
 assert.deepEqual(result.suggestions.map(r=>r.id),['tomato']);
 assert.equal(result.soon.length,1);assert.equal(result.past.length,1);
 assert.equal(result.groups.reduce((n,g)=>n+g.count,0),3);
});
test('dashboard does not invent dates and supports an empty pantry',()=>{
 const result=overview({pantry:[],recipes:[recipe('one',['tomate'])]});
 assert.equal(result.foods.length,0);assert.equal(result.suggestions.length,0);
 assert.equal(overview({}).soon.length,0);
 assert.equal(overview({}).foods[0].expiry.tone,'unknown');
});
test('dashboard respects unresolved exclusions and favors soon-dated foods over faster recipes',()=>{
 const recipes=[recipe('fast',['arroz'],{time:5}),recipe('soon',['tomate'],{time:25})];
 assert.deepEqual(overview({recipes,dates:{tomate:{labelDate:'2026-10-19'}}}).suggestions.map(r=>r.id),['soon','fast']);
 assert.equal(overview({recipes,profile:{...initialProfile,exclusions:'alimento desconocido xyz'}}).suggestions.length,0);
});
