import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRecipeNutrition, nutritionQuestion, hasCompleteNutrients } from '../server/nutrition-readiness.js';
import { nutrientFields, translateFoodQuery } from '../server/nutrition.js';
import { createAppServer } from '../server/app.js';
import { validateChat } from '../server/chat.js';

// Synthetic fixtures: these amounts test arithmetic, not real food composition.
const fixtureFood = (fdcId = 173735) => ({fdcId, description:'Beans, black, mature seeds, cooked, boiled, without salt',
  dataType:'SR Legacy', nutrients:{kcal:100, protein:5, carbs:10, fat:2, saturatedFat:0, sodium:20, sugars:1, fiber:4}});
const proposed = () => ({type:'success', source:'gemini', text:'Una receta para tres', servings:3,
  recipes:[{id:'ai-test', title:'Frijoles', ingredients:['frijoles_negros'], amounts:['150 g de frijoles negros cocidos'],
    grams:[150], nutrition:{kcal:99999}, nutritionSummary:{perPerson:{kcal:99999}}}]});
function fixtureStore() {
  const items = [{ingredientId:'frijoles_negros', name:'Frijoles negros', usda:null}];
  return {items, saved:[],
    getState:async()=>({revision:0, pantry:['frijoles_negros'],
      ingredients:[{id:'frijoles_negros',name:'Frijoles negros',allergens:[],animal:false}],
      profile:{diet:'Sin preferencia',allergies:[],needsReview:false}, generated:[]}),
    getIngredientNutritionItems:async ids=>items.filter(item=>ids.includes(item.ingredientId)),
    setIngredientUsda:async (id, food)=>{items.find(item=>item.ingredientId===id).usda=food; return {saved:true};},
    saveGenerated:async function(result) {this.saved.push(result);},
  };
}
const unusedFetch = () => {throw Error('Must not guess an ambiguous food or refetch a complete cached record');};

test('ambiguous beans and oil ask first, without choosing an English search hit', async () => {
  const store=fixtureStore();
  store.items.push({ingredientId:'aceite_vegetal',name:'Aceite vegetal',usda:null});
  const result=proposed();
  result.recipes[0].ingredients.push('aceite_vegetal');
  result.recipes[0].grams.push(5);
  const answer=await requireRecipeNutrition(result,store,'test-key',unusedFetch,{},'Quiero casamiento para tres','initial');
  assert.equal(answer.type,'nutrition_setup');
  assert.deepEqual(answer.recipes,[]);
  assert.deepEqual(answer.nutritionIngredientIds,['frijoles_negros','aceite_vegetal']);
  assert.equal(answer.servings,3);
  assert.equal(answer.retryText,'Quiero casamiento para tres');
  assert.equal(store.items[0].usda,null);
  assert.equal(answer.nutritionUnavailable,undefined);
  assert.deepEqual(nutritionQuestion(store.items[0]).options.map(item=>item.fdcId),[173735,173734]);
  assert(!nutritionQuestion(store.items[1],['Soya']).options.some(item=>item.fdcId===171411));
  store.items[1].usda=fixtureFood(171411);
  assert.equal(nutritionQuestion(store.items[1],['Soya']).complete,false);
  const changedProfile=await requireRecipeNutrition(result,store,'',unusedFetch,{allergies:['Soya']},'continúa','initial');
  assert(changedProfile.nutritionIngredientIds.includes('aceite_vegetal'));
});

test('confirmed cached data produces totals from grams and ignores model-supplied nutrition', async () => {
  const store=fixtureStore();
  await store.setIngredientUsda('frijoles_negros',fixtureFood());
  const answer=await requireRecipeNutrition(proposed(),store,'',unusedFetch,{maxSodiumMg:25},'continúa','initial');
  assert.equal(answer.type,'success');
  assert.equal(answer.recipes[0].nutrition,null);
  const nutrition=answer.recipes[0].nutritionSummary;
  assert.equal(nutrition.complete,true);
  assert.equal(nutrition.perPerson.kcal,150);
  assert.equal(nutrition.total.kcal,450);
  assert.equal(nutrition.perPerson.fiber,6);
  assert.equal(nutrition.perPerson.saturatedFat,0);
  assert.equal(nutrition.checks.maxSodiumMg,'exceeds');
  assert.equal(nutritionQuestion(store.items[0]).complete,true);
});

test('missing nutrient values or gram weights block new recipes instead of becoming zero', async () => {
  for (const value of [null,undefined,NaN,-1,'0']) {
    const store=fixtureStore();
    store.items[0].usda=fixtureFood();
    store.items[0].usda.nutrients.fiber=value;
    assert.equal(hasCompleteNutrients(store.items[0].usda),false);
    const answer=await requireRecipeNutrition(proposed(),store,'',unusedFetch,{},'continúa','initial');
    assert.equal(answer.type,'nutrition_setup');
    assert.equal(answer.recipes.length,0);
  }
  for (const grams of [null,0,undefined,NaN]) {
    const store=fixtureStore();store.items[0].usda=fixtureFood();
    const recipe=proposed();recipe.recipes[0].grams=[grams];
    const answer=await requireRecipeNutrition(recipe,store,'',unusedFetch,{},'continúa','initial');
    assert.equal(answer.type,'nutrition_setup');
    assert.deepEqual(answer.nutritionIngredientIds,[]);
  }
  assert.equal(hasCompleteNutrients({...fixtureFood(),fdcId:0}),false);
});

test('missing credentials and USDA outages leave a pending question without fabricated data', async () => {
  for (const key of ['', 'test-key']) {
    const store=fixtureStore();store.items[0]={ingredientId:'arroz',name:'Arroz',usda:null};
    const recipe=proposed();recipe.recipes[0].ingredients=['arroz'];
    const answer=await requireRecipeNutrition(recipe,store,key,async()=>{throw Error('network failure');},{},'continúa','initial');
    assert.equal(answer.type,'nutrition_setup');
    assert.equal(answer.nutritionUnavailable,true);
    assert.equal(store.items[0].usda,null);
  }
});

test('HTTP flow requires confirmation, fetches official values, and only then releases a complete recipe', async t => {
  const store=fixtureStore();
  const requests=[];
  const server=createAppServer({authentication:false,store,usdaApiKey:'test-key', generate:async input=>{
    if (store.items[0].usda) assert.deepEqual(input.nutritionReferences,[{id:'frijoles_negros',description:fixtureFood().description}]);
    return proposed();
  },usdaFetch:async url=>{
    requests.push(url.pathname);
    const fdcId=Number(url.pathname.split('/').at(-1));
    const fixture=fixtureFood(fdcId);
    return {ok:true,json:async()=>({...fixture,foodNutrients:Object.entries(nutrientFields)
      .filter(([name])=>fdcId!==999 || name!=='fiber')
      .map(([name,ids])=>({nutrient:{id:ids[0]},amount:fixture.nutrients[name]}))})};
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const request=(method,path,body)=>fetch(`http://127.0.0.1:${server.address().port}/api/${path}`,{
    method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,
  });
  const suggest=()=>request('POST','recipes/suggest',{revision:0,maxTime:30,message:'Frijoles para tres',mode:'initial'});
  assert.equal((await (await suggest()).json()).type,'nutrition_setup');
  assert.equal(store.saved[0].recipes.length,0);
  const options=await (await request('GET','nutrition/ingredients/frijoles_negros/options')).json();
  assert.equal(options.complete,false);
  assert.equal(options.options[0].fdcId,173735);
  assert.equal((await request('PUT','nutrition/ingredients/frijoles_negros/usda',{fdcId:173735})).status,400);
  assert.equal((await request('GET','nutrition/ingredients/another-accounts-food/options')).status,404);
  assert.equal((await request('PUT','nutrition/ingredients/another-accounts-food/usda',{fdcId:173735,confirmed:true})).status,404);
  assert.equal(requests.length,0);
  const incomplete=await request('PUT','nutrition/ingredients/frijoles_negros/usda',{fdcId:999,confirmed:true});
  assert.equal((await incomplete.json()).error,'INCOMPLETE_NUTRIENTS');
  assert.equal(store.items[0].usda,null);
  assert.equal((await request('PUT','nutrition/ingredients/frijoles_negros/usda',{
    fdcId:173735,confirmed:true,nutrients:{kcal:99999},description:'Injected',
  })).status,200);
  assert.equal(store.items[0].usda.nutrients.kcal,100);
  assert.equal((await (await request('GET','nutrition/ingredients/frijoles_negros/options')).json()).complete,true);
  const complete=await (await suggest()).json();
  assert.equal(complete.type,'success');
  assert.equal(complete.recipes[0].nutritionSummary.total.kcal,450);
  assert.deepEqual(requests,['/fdc/v1/food/999','/fdc/v1/food/173735']);
});

test('translation produces a search query only; chat reload preserves the pending confirmation', async () => {
  const query=await translateFoodQuery('frijoles negros cocidos',{apiKey:'test'},async payload=>{
    assert.deepEqual(JSON.parse(payload.parts[0].text),{alimento:'frijoles negros cocidos'});
    return {output:{query:'Black beans cooked',nutrients:{kcal:99999}}};
  });
  assert.equal(query,'Black beans cooked');
  await assert.rejects(translateFoodQuery('frijoles',{},async()=>({output:{query:''}})),{code:'INVALID_QUERY'});
  const saved=validateChat({revision:0,maxTime:30,draft:'',busy:false,messages:[{
    id:'pending',role:'bot',text:'Confirma tus frijoles',type:'nutrition_setup',
    nutritionIngredientIds:['frijoles_negros'],retryText:'Casamiento',retryMode:'initial',servings:3,
    nutrients:{kcal:99999},apiKey:'secret',
  }]});
  assert.equal(saved.messages[0].type,'nutrition_setup');
  assert.deepEqual(saved.messages[0].nutritionIngredientIds,['frijoles_negros']);
  assert.equal(saved.messages[0].retryText,'Casamiento');
  assert.equal(saved.messages[0].servings,3);
  assert.equal(saved.messages[0].nutrients,undefined);
  assert.equal(saved.messages[0].apiKey,undefined);
});
