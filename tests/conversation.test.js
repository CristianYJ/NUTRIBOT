import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, preflight, buildPrompt, validateOutput } from '../server/recipes.js';
import { generateWithGemini } from '../server/gemini.js';
import { validateChat } from '../server/chat.js';
import { recipeContext } from '../src/recipe-context.js';
import { profileRestrictions } from '../src/profile-rules.js';

const input = (patch = {}) => parseInput({
  pantry: ['arroz', 'tomate', 'huevo'], maxTime: 30,
  profile: { diet: 'Sin preferencia', allergies: ['Frutos secos'], needsReview: false },
  message: 'Quiero cocinar algo mexicano', ...patch,
});
const recipe = () => ({ intent: 'recipe', message: 'Cocinemos', servings: 3, recipes: [{
  title: 'Arroz con tomate', subtitle: 'Un plato casero', category: 'Almuerzo', time: 25,
  ingredients: ['arroz', 'tomate'], amounts: ['50 g de arroz crudo', '100 g de tomate'], grams: [50,100],
  steps: ['Procura lavar el tomate. Cuece el arroz en agua potable, agrega el tomate y termina la cocción.'],
}] });
const fakeProvider = fn => ({ apiKey: 'fake', fetchImpl: async (_url, options) => {
  const body = JSON.parse(options.body);
  const output = fn(JSON.parse(body.contents[0].parts[0].text));
  return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] }) };
} });

test('cooking context is bounded and omits photos, profile fields and recipe payloads', () => {
  const context = recipeContext(Array.from({length: 20}, (_,index) => ({
    id:String(index), role:'user', text:'x'.repeat(1200), photo:'PRIVATE_PHOTO', apiKey:'PRIVATE_KEY',
    profile:{medicalNotes:'PRIVATE_NOTE'}, recipes:[{id:'ai-123',steps:['UNTRUSTED_RECIPE']}],servings:3,
  })));
  assert.equal(context.length,12);
  assert.equal(context[0].text.length,1000);
  assert.equal(context[0].servings,3);
  assert.deepEqual(context[0].recipeIds,['ai-123']);
  assert(!JSON.stringify(context).includes('PRIVATE'));
  assert(!JSON.stringify(context).includes('UNTRUSTED'));
  assert.doesNotThrow(()=>recipeContext([{role:'bot',text:'hola',recipeIds:{},recipes:{}}]));
});

test('conversation asks once, then forwards a natural follow-up and keeps party size on reload', async () => {
  const first = await generateWithGemini(input(), fakeProvider(() => ({intent:'conversation', message:'¿Para cuántas personas cocinaremos?', servings:0, recipes:[]})));
  assert.equal(first.type,'conversation');
  const history = [{role:'user',text:input().message},{role:'bot',text:first.text}];
  const next = await generateWithGemini(input({message:'Para mis papás y para mí', history}), fakeProvider(prompt => {
    assert.equal(prompt.historial[0].text,'Quiero cocinar algo mexicano');
    assert.equal(prompt.solicitud,'Para mis papás y para mí');
    return recipe();
  }));
  assert.equal(next.servings,3);
  assert.equal(next.recipes[0].grams[0],50); // Per-person quantities never multiply twice.
  const saved = validateChat({revision:0,draft:'',maxTime:30,busy:false,messages:[{id:'bot',role:'bot',...next}]});
  assert.equal(saved.messages[0].servings,3);
  const prompt = JSON.parse(buildPrompt(input({message:'Otra idea',history:saved.messages})));
  assert.equal(prompt.historial[0].servings,3);
});

test('recipes with unknown servings ask instead of assuming a single person', () => {
  const result=validateOutput({...recipe(),servings:0},input(),'test');
  assert.equal(result.type,'conversation');
  assert.equal(result.recipes.length,0);
  for(const servings of [-1,1.5,13,'3']) assert.throws(()=>validateOutput({...recipe(),servings},input(),'test'));
  assert.throws(()=>validateOutput({intent:'conversation',servings:0,message:'ok',recipes:recipe().recipes},input(),'test'));
});

test('ordinary cooking language and trailing separators do not trigger clinical blocks', () => {
  for(const message of ['Algo sin complicaciones para mí','No quiero tardar mucho cocinando','Estoy sin ganas de cocinar, algo rápido']) {
    assert.equal(preflight(input({message})),null);
  }
  assert.equal(preflight(input({message:"Algo sin ensuciar la cocina y sin huevo"})).type,"review");
  const restriction=profileRestrictions({exclusions:'huevo, queso, ',medicalNotes:''});
  assert.equal(restriction.needsReview,false);
  assert(restriction.excludedIngredients.includes('huevo'));
  assert.equal(profileRestrictions({exclusions:'no me gusta huevo'}).needsReview,false);
  assert.equal(profileRestrictions({exclusions:'alimento desconocido'}).needsReview,true);
});

test('invalid recipes are repaired within the same pantry without relaxing allergy filters', async () => {
  let calls=0;
  const request=input({profile:{diet:'Sin preferencia',allergies:['Huevo'],needsReview:false}});
  const result=await generateWithGemini(request,fakeProvider(prompt => {
    calls++;
    assert.equal(prompt.fase,'despensa');
    assert(!prompt.ingredientesPermitidos.some(item=>item.id==='huevo'));
    if(calls===1){const invalid=recipe();invalid.recipes[0].steps.push('Agrega huevo.');return invalid;}
    assert(prompt.correccion);
    return recipe();
  }));
  assert.equal(calls,2);
  assert.equal(result.type,'success');
});

test('missing ingredients require explicit consent and approval cannot allow a different missing food', async () => {
  const near=recipe();
  near.recipes[0]={title:'Arroz con cilantro',subtitle:'Una idea casera',time:25,category:'Almuerzo',ingredients:['arroz','cilantro'],amounts:['50 g de arroz crudo','5 g de cilantro'],grams:[50,5],steps:['Cuece el arroz en agua potable. Mezcla con cilantro lavado.']};
  const provider=fakeProvider(prompt=>prompt.fase==='despensa'?{intent:'no_match',recipes:[]}:structuredClone(near));
  const pending=await generateWithGemini(input(),provider);
  assert.equal(pending.type,'conversation');
  assert.deepEqual(pending.missingIngredients,['cilantro']);
  const history=[{role:'bot',...pending}];
  const approved=input({history,message:'Sí, puedo conseguir los ingredientes que faltan.'});
  assert.deepEqual(approved.approvedMissing,['cilantro']);
  const result=await generateWithGemini(approved,provider);
  assert.equal(result.type,'success');
  assert.equal(result.servings,3);
  assert.deepEqual(input({history,message:'No, mejor algo distinto'}).approvedMissing,[]);
  assert.deepEqual(input({history:[],message:'sí'}).approvedMissing,[]);
  const other=input({history:[{role:'bot',text:'¿Puedes conseguir limón?',missingIngredients:['limon']}],message:'sí'});
  assert.equal((await generateWithGemini(other,provider)).type,'conversation');
});
import { createAppServer } from '../server/app.js';

test('HTTP generation keeps normal repeats, resolves account context and checks nutrition before returning recipes', async t => {
  const original=input();
  const existing={...recipe().recipes[0], id:'saved-recipe'};
  const state={revision:0,pantry:original.pantry,ingredients:original.catalog,profile:original.profile,generated:[existing]};
  let lookups=0,scans=0,saved=0;
  const store={
    getState:async()=>state,
    getIngredientNutritionItems:async ids=>{lookups++; return ids.map(id=>({ingredientId:id,name:id,usda:{fdcId:123,description:id,nutrients:{kcal:10,protein:1,carbs:1,fat:1,saturatedFat:0,sodium:0,sugars:0,fiber:0}}}));},
    screenGeneratedNutrition:async result=>{scans++; return result;},
    saveGenerated:async()=>{saved++;},
  };
  const server=createAppServer({authentication:false,store,usdaApiKey:'fake', generate:async request=>{
    assert.deepEqual(request.previous,request.mode==='more'?[existing.title]:[]);
    assert.equal(request.discussedRecipes.length,1);
    assert.equal(request.discussedRecipes[0].title,existing.title);
    return validateOutput(recipe(),request,'test');
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const send=async mode=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/recipes/suggest`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      revision:0,maxTime:30,message:'Arroz para tres',mode,
      history:[{role:'bot',text:'Una receta',recipeIds:['saved-recipe','other-account-recipe']}],
      discussedRecipes:[{title:'INJECTED'}],
    })});
    assert.equal(response.status,200);
    assert.equal((await response.json()).type,'success');
  };
  await send('initial');
  assert(lookups > 0);
  state.profile.maxSodiumMg='300';
  await send('more');
  assert(lookups > 1);
  assert.equal(scans,2);
  assert.equal(saved,2);
});

test('ten-person recipes accept generic references to their declared bean and cheese varieties', () => {
  const catalog=[...input().catalog,
    {id:'frijoles_negros',name:'Frijoles negros'},
    {id:'queso_mozzarella',name:'Queso mozzarella',allergens:['Leche'],animal:true},
    {id:'pan',name:'Pan',allergens:['Trigo / gluten']},
    {id:'pan_integral',name:'Pan integral',allergens:['Trigo / gluten']},
  ];
  const request=parseInput({...input(),pantry:['frijoles_negros','arroz','queso_mozzarella','pan_integral'],message:'para 10 personas'},catalog);
  const cases=[
    {title:'Casamiento de arroz y frijoles',subtitle:'Para compartir',time:30,category:'Almuerzo',ingredients:['arroz','frijoles_negros'],amounts:['50 g de arroz','80 g de frijoles negros'],grams:[50,80],steps:['Cocina el arroz en agua potable. Incorpora los frijoles previamente cocidos.']},
    {title:'Pan con queso',subtitle:'Una preparación sencilla',time:15,category:'Cena',ingredients:['pan_integral','queso_mozzarella'],amounts:['60 g de pan integral','30 g de queso mozzarella'],grams:[60,30],steps:['Coloca el queso sobre el pan y calienta hasta que se derrita.']},
  ];
  for(const r of cases){
    const result=validateOutput({intent:'recipe',servings:10,recipes:[r]},request,'test');
    assert.equal(result.servings,10);
    assert.deepEqual(result.recipes[0].grams,r.grams);
  }
  assert.throws(()=>validateOutput({intent:'recipe',servings:10,recipes:[cases[1]]},{...request,profile:{...request.profile,allergies:['Leche']}},'test'));
  const undeclared=structuredClone(cases[0]);
  undeclared.steps.push('Añade queso fresco al servir.');
  assert.throws(()=>validateOutput({intent:'recipe',servings:10,recipes:[undeclared]},request,'test'), error=>error.validationIssues.some(issue=>issue.reason==='UNDECLARED_INGREDIENT'));
});

test('ingredient checks use whole words and targeted repair receives the validation reason', async () => {
  const neutral=recipe();neutral.recipes[0].steps.push('Separa claramente las porciones.');
  assert.equal(validateOutput(neutral,input(),'test').type,'success');
  let calls=0;
  const result=await generateWithGemini(input({pantry:['arroz','tomate']}),fakeProvider(prompt=>{
    if(++calls===1){const invalid=recipe();invalid.recipes[0].steps.push('Añade queso fresco.');return invalid;}
    assert.deepEqual(prompt.problemasDetectados,[{reason:'UNDECLARED_INGREDIENT'}]);
    return recipe();
  }));
  assert.equal(result.type,'success');
  assert.equal(calls,2);
});
