'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const args=process.argv.slice(2),jsdomAt=args.indexOf('--jsdom');
const jsdomModule=jsdomAt<0?process.env.HMI_QA_JSDOM:args[jsdomAt+1];
if(jsdomAt>=0&&!jsdomModule)throw Error('--jsdom benötigt ein Modulverzeichnis.');
let JSDOM,VirtualConsole;
try{({JSDOM,VirtualConsole}=require(jsdomModule?path.resolve(jsdomModule):'jsdom'));}
catch(error){throw Error('JSDOM ist nur eine Entwicklungsabhängigkeit. npm install --include=dev oder --jsdom <Modulverzeichnis> verwenden. '+error.message);}
const api=require('../public/state-styles.js');
const code=fs.readFileSync(path.resolve(__dirname,'../public/state-styles.js'),'utf8');
const css=fs.readFileSync(path.resolve(__dirname,'../public/state-styles.css'),'utf8');
const checks=[],errors=[];let networkCalls=0;
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{runScripts:'outside-only',url:'https://state-styles.invalid/',virtualConsole});
const {document,Event}=dom.window;
dom.window.fetch=()=>{networkCalls++;throw Error('Netzwerk nicht erlaubt.');};
dom.window.XMLHttpRequest=function(){networkCalls++;throw Error('Netzwerk nicht erlaubt.');};
const sheet=document.createElement('style');sheet.textContent=css;document.head.append(sheet);
const check=(name,fn)=>{fn();checks.push(name);};
function node(tag='button'){const el=document.createElement(tag);document.body.append(el);return el;}
function input(host,field,value,event='input'){const el=host.querySelector('[data-field="'+field+'"]');assert.ok(el,field);el.value=value;el.dispatchEvent(new Event(event,{bubbles:true}));return el;}
function click(host,text){const el=Array.from(host.querySelectorAll('button')).find(button=>button.textContent===text);assert.ok(el,text);el.click();return el;}
function attrs(root){return [root,...root.querySelectorAll('*')].map(el=>Array.from(el.attributes).filter(a=>a.name!=='style').map(a=>[a.name,a.value]));}
function dropdown(){const select=node('select');select.id='real-selection';select.dataset.cmd='real-command';for(const [value,label] of [['0','Aus'],['1','Ein'],['manual','Hand']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.value='1';return select;}

check('CommonJS und Browser-API verfügbar',()=>{assert.equal(typeof api.apply,'function');dom.window.eval(code);assert.equal(typeof dom.window.SimpleAIHMIStateStyles.renderEditor,'function');});
check('Normalisierung ist defensiv, stabil und verändert Eingaben nicht',()=>{
  const raw={type:'dropdown',target:'text',valueSource:'band',manualValue:'1',options:[{value:0,label:'Aus',color:'#abc'},{value:1,label:'Ein',color:'rgb(10, 20, 30)'}]};const original=JSON.stringify(raw);const recipe=api.normalizeRecipe(raw);
  assert.equal(recipe.mode,'options');assert.equal(recipe.options[0].color,'#aabbcc');assert.equal(recipe.options[1].color,'#0a141e');assert.equal(JSON.stringify(raw),original);assert.deepEqual(api.normalizeRecipe(recipe),recipe);
  assert.equal(api.normalizeRecipe({mode:'unknown',target:'invalid'}).mode,'binary');assert.equal(api.normalizeRecipe({}).offColor,'#d63e46');assert.equal(api.normalizeRecipe({}).onColor,'#16835e');
});
check('Sichere Farbwerte statt CSS-Ausdrücken oder Prototypattributen',()=>{
  for(const invalid of ['url(https://example.invalid)','expression(alert(1))','constructor','__proto__','rgba(0,0,0,0)'])assert.equal(api.normalizeRecipe({offColor:invalid}).offColor,'#d63e46');
});
check('Binärwechsel und automatische Textlesbarkeit',()=>{
  const el=node();api.apply(el,{offColor:'#ffffff',onColor:'#000000'},0);assert.equal(el.style.backgroundColor,'rgb(255, 255, 255)');assert.equal(el.style.color,'rgb(21, 41, 59)');
  api.apply(el,{offColor:'#ffffff',onColor:'#000000'},1);assert.equal(el.style.backgroundColor,'rgb(0, 0, 0)');assert.equal(el.style.color,'rgb(255, 255, 255)');
});
check('Farben umkehren bleibt dem jeweiligen Wert zugeordnet',()=>{
  const el=node();api.apply(el,{offColor:'#00ff00',onColor:'#ff0000'},0);assert.equal(el.style.backgroundColor,'rgb(0, 255, 0)');api.apply(el,{offColor:'#00ff00',onColor:'#ff0000'},1);assert.equal(el.style.backgroundColor,'rgb(255, 0, 0)');
});
check('Aus einem Element werden nur eindeutige Zustände gelesen',()=>{
  const el=node();el.setAttribute('aria-pressed','true');assert.equal(api.apply(el,{}).value,1);el.setAttribute('aria-pressed','false');assert.equal(api.apply(el,{}).value,0);
  const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=true;assert.equal(api.apply(checkbox,{}).value,1);
  const span=node('span');span.textContent='0';assert.equal(api.apply(span,{}).value,0);span.textContent='Unbekannt';assert.equal(api.apply(span,{}).applied,false);
});
check('Manuelle und vom Host zugeordnete Quellen werden getrennt behandelt',()=>{
  const el=node();assert.equal(api.apply(el,{valueSource:'manual',manualValue:1}).value,1);
  assert.equal(api.apply(el,{valueSource:'band'}).reason,'missing-value');assert.equal(el.style.backgroundColor,'');assert.equal(api.apply(el,{valueSource:'band'},0).value,0);
});
check('Unbekannt ist kein stillschweigender Zustand 0',()=>{
  const el=node();el.style.backgroundColor='#123456';api.apply(el,{},1);assert.equal(api.apply(el,{},'unknown').applied,false);assert.equal(el.style.backgroundColor,'rgb(18, 52, 86)');
});
check('IDs, Befehlsattribute, Klassen, Wert und bestehende Handler bleiben erhalten',()=>{
  const el=node();el.id='real-start';el.dataset.cmd='start';el.className='existing-control';el.setAttribute('aria-label','Vorhandene Aktion');el.value='unchanged';el.style.marginLeft='9px';let clicks=0;
  const handler=()=>clicks++;el.onclick=handler;el.addEventListener('click',()=>clicks++);const before=attrs(el);
  api.apply(el,{target:'text'},0);api.apply(el,{target:'background'},1);api.apply(el,{target:'border'},0);
  assert.deepEqual(attrs(el),before);assert.equal(el.onclick,handler);assert.equal(el.value,'unchanged');assert.equal(el.style.marginLeft,'9px');el.click();assert.equal(clicks,2);
});
check('Wechsel des Farbzieles stellt vorherige eigene Styles wieder her',()=>{
  const el=node();el.style.backgroundColor='#abcdef';el.style.color='blue';el.style.border='3px dashed #223344';
  api.apply(el,{target:'background'},1);api.apply(el,{target:'text'},0);assert.equal(el.style.backgroundColor,'rgb(171, 205, 239)');assert.equal(el.style.color,'rgb(214, 62, 70)');
  api.apply(el,{target:'border'},1);assert.equal(el.style.color,'blue');assert.equal(el.style.borderStyle,'dashed');assert.equal(el.style.borderWidth,'3px');assert.equal(el.style.borderColor,'rgb(22, 131, 94)');
});
check('Clear erhält ursprüngliche Prioritäten und unrelated Styles',()=>{
  const el=node();el.style.setProperty('color','#112233','important');el.style.padding='7px';api.apply(el,{},0);assert.equal(el.style.getPropertyPriority('background-color'),'important');api.clear(el);
  assert.equal(el.style.color,'rgb(17, 34, 51)');assert.equal(el.style.getPropertyPriority('color'),'important');assert.equal(el.style.backgroundColor,'');assert.equal(el.style.padding,'7px');
});
check('Zwischenzeitliche Host-Styleänderungen werden nicht durch alte Snapshots überschrieben',()=>{
  const el=node();el.style.backgroundColor='#111111';api.apply(el,{},0);el.style.backgroundColor='#123456';api.apply(el,{},1);api.clear(el);assert.equal(el.style.backgroundColor,'rgb(18, 52, 86)');
});
check('Dropdownoptionsfarben ändern ausschließlich Styles, keine Auswahl oder Zuordnungen',()=>{
  const select=dropdown();let changes=0;const handler=()=>changes++;select.onchange=handler;const before=attrs(select);const recipe={mode:'options',options:[{value:'0',label:'Neuer Text, nur Mapping',color:'#ff0000'},{value:'1',label:'Anderer Text, nur Mapping',color:'#00ff00'}]};
  assert.equal(api.apply(select,recipe).value,'1');assert.equal(select.style.backgroundColor,'rgb(0, 255, 0)');assert.equal(select.options[0].style.backgroundColor,'rgb(255, 0, 0)');assert.equal(select.options[1].style.backgroundColor,'rgb(0, 255, 0)');
  assert.deepEqual(attrs(select),before);assert.equal(select.value,'1');assert.equal(select.options[0].label,'Aus');assert.equal(select.onchange,handler);select.dispatchEvent(new Event('change'));assert.equal(changes,1);
  api.apply(select,recipe,'0');assert.equal(select.value,'1');assert.equal(select.style.backgroundColor,'rgb(255, 0, 0)');api.clear(select);assert.equal(select.options[0].style.backgroundColor,'');
});
check('Dropdownzuordnungen mit fehlendem Wert werden neutral zurückgenommen',()=>{
  const select=dropdown();api.apply(select,{mode:'options',options:[{value:'1',color:'#00ff00'}]});assert.equal(api.apply(select,{mode:'options',options:[{value:'1',color:'#00ff00'}]},'missing').applied,false);assert.equal(select.style.backgroundColor,'');
});
check('Vorhandene Optionen werden nur lesend übernommen, auch mit sicherem Text',()=>{
  const select=dropdown();select.options[2].textContent='<img src=x onerror=alert(1)>';select.options[2].style.color='#123456';const before=attrs(select);const options=api.inferOptions(select);assert.equal(options[2].label,'<img src=x onerror=alert(1)>');assert.equal(options[2].color,'#123456');assert.deepEqual(attrs(select),before);
});
check('Editor erkennt bestehendes SELECT und übernimmt seine Optionen',()=>{
  const select=dropdown(),host=node('div'),before=attrs(select);const previews=[],applied=[];
  const editor=api.renderEditor(host,{}, {element:select,onPreview:(value,recipe)=>previews.push({value,recipe}),onApply:recipe=>applied.push(recipe)});
  assert.equal(editor.getRecipe().mode,'options');assert.equal(editor.getRecipe().options.length,3);assert.equal(editor.getRecipe().manualValue,'1');assert.equal(host.querySelector('[data-field="optionList"]').value,'1');assert.equal(host.querySelector('[data-field="optionList"]').options.length,3);assert.equal(applied.length,0);
  input(host,'optionList','0','change');
  input(host,'optionColor','#ff00ff');assert.equal(previews.at(-1).recipe.options[0].color,'#ff00ff');click(host,'Farbzuordnung übernehmen');assert.equal(applied.length,1);assert.deepEqual(attrs(select),before);
});
check('Binärer Editor testet 0/1 und Farbumkehr direkt ohne Speicherung',()=>{
  const host=node('div'),previews=[],applied=[];api.renderEditor(host,{}, {onPreview:(value,recipe)=>previews.push({value,recipe}),onApply:recipe=>applied.push(recipe)});
  host.querySelector('[data-preview-value="1"]').click();assert.equal(previews.at(-1).value,1);const before=previews.at(-1).recipe;
  click(host,'0/1-Farben tauschen');assert.equal(previews.at(-1).recipe.offColor,before.onColor);assert.equal(previews.at(-1).recipe.onColor,before.offColor);assert.equal(applied.length,0);
  click(host,'Farbzuordnung übernehmen');assert.equal(applied.length,1);
});
check('Andere Wertquellen sind frei benennbar, ohne Signalzugriff auszulösen',()=>{
  const host=node('div'),previews=[];api.renderEditor(host,{valueSource:'band'},{sources:[{value:'band',label:'Bandsensor'},{value:'__shs_custom__',label:'Echte Hostquelle'}],onPreview:(value,recipe)=>previews.push(recipe)});
  const select=host.querySelector('[data-field="valueSource"]');assert.equal(select.value,'band');const custom=Array.from(select.options).find(option=>option.textContent==='Andere Wertquelle …');assert.notEqual(custom.value,'__shs_custom__');
  input(host,'valueSource',custom.value,'change');input(host,'customSource','neue-quelle');assert.equal(previews.at(-1).valueSource,'neue-quelle');
});
check('Optionsmapping lässt sich ergänzen, ohne das echte Dropdown umzuschreiben',()=>{
  const select=dropdown(),host=node('div'),before=select.options.length;const editor=api.renderEditor(host,{mode:'options'},{element:select});
  click(host,'+ Farbzuordnung');assert.equal(editor.getRecipe().options.length,before+1);assert.equal(select.options.length,before);
  click(host,'Zuordnung entfernen');assert.equal(editor.getRecipe().options.length,before);
});
check('Lange und unsichere Texte werden weder als HTML noch als Code interpretiert',()=>{
  const host=node('div');api.renderEditor(host,{mode:'options',options:Array.from({length:400},(_,index)=>({value:String(index),label:'Option <img '+index+'>',color:'#123456'}))},{sources:[{value:'<script>',label:'<img src=x>'}]});
  assert.equal(host.querySelector('[data-field="optionList"]').options.length,400);assert.equal(host.querySelectorAll('img,script,iframe').length,0);
});
check('Keine Netzwerkaktionen, Nutzerdateien oder Controllerzugriffe',()=>{assert.equal(networkCalls,0);assert.deepEqual(errors,[]);});
const report={passed:true,at:new Date().toISOString(),node:process.version,checks,networkCalls,scope:'isolated-dom-only',controllerAccess:false,userDataWrites:false};
fs.writeFileSync(path.join(__dirname,'state-styles-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,checks:checks.length,networkCalls}));dom.window.close();
