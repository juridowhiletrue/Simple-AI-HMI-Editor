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
const api=require('../public/components.js');
const code=fs.readFileSync(path.resolve(__dirname,'../public/components.js'),'utf8');
const css=fs.readFileSync(path.resolve(__dirname,'../public/components.css'),'utf8');
const failures=[],checks=[];let unexpectedNetwork=0;
const consoleCapture=new VirtualConsole();consoleCapture.on('jsdomError',error=>failures.push(error.message));
const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{runScripts:'outside-only',url:'https://components.invalid/',virtualConsole:consoleCapture});
const {document,Event}=dom.window;
dom.window.fetch=()=>{unexpectedNetwork++;throw Error('Keine Netzwerkaufrufe erlaubt.');};
dom.window.XMLHttpRequest=function(){unexpectedNetwork++;throw Error('Keine Netzwerkaufrufe erlaubt.');};
const style=document.createElement('style');style.textContent=css;document.head.append(style);
function check(name,test){test();checks.push(name);}
function mount(config,options={}){const component=api.create(config,{document,isTesting:()=>true,...options});document.body.append(component);return component;}
const input=(node,selector,value,event='input')=>{const target=node.querySelector(selector);assert.ok(target,selector);target.value=value;target.dispatchEvent(new Event(event,{bubbles:true}));return target;};
const clickText=(node,text)=>{const button=Array.from(node.querySelectorAll('button')).find(b=>b.textContent===text);assert.ok(button,text);button.click();return button;};
check('Browser- und CommonJS-API sind verfügbar',()=>{
  assert.equal(typeof api.create,'function');dom.window.eval(code);assert.equal(typeof dom.window.SmartHMIComponents.renderEditor,'function');
});
check('Normalisierung ist unabhängig, defensiv und idempotent',()=>{
  const raw={kind:'icon-button',label:' Test ',icon:'▶',offColor:'#abc',onColor:'red',options:[{label:'A',value:0,color:'#fff'},{label:'B',value:0},{label:'C',value:1}],implemented:true};
  const before=JSON.stringify(raw),normalized=api.normalizeConfig(raw);
  assert.equal(JSON.stringify(raw),before);assert.equal(normalized.type,'iconbutton');assert.equal(normalized.offColor,'#aabbcc');assert.equal(normalized.onColor,'#ff0000');
  assert.equal(normalized.options.length,2);assert.equal(normalized.implemented,false);assert.equal(normalized.programmingStatus,'open');assert.deepEqual(api.normalizeConfig(normalized),normalized);
});
check('Ungültige oder gefährliche Farbwerte bleiben keine CSS-Ausdrücke',()=>{
  for(const value of ['url(https://example.invalid/x)','expression(alert(1))','constructor','__proto__'])assert.equal(api.normalizeConfig({onColor:value}).onColor,'#16835e');
  assert.equal(api.normalizeConfig({type:'unknown'}).type,'button');
});
check('Alle fünf Bausteine sind eindeutig unimplementiert markiert und haben keine echten Befehlsattribute',()=>{
  for(const type of api.types){const element=mount({type});assert.equal(element.dataset.shcProgramming,'open');assert.match(element.textContent,/Neue Funktion · Programmierung offen/);assert.equal(element.querySelectorAll('[id],[data-cmd]').length,0);}
});
check('0/1-Schalter ändert lokalen Wert, Text, Farbe und zugänglichen Zustand',()=>{
  const values=[],commands=[];const element=mount({type:'toggle',label:'Neue Freigabe',offText:'Gesperrt',onText:'Freigegeben',offColor:'#ffffff',onColor:'#000000'},{onValue:value=>values.push(value),onCommand:event=>commands.push(event)});
  const button=element.querySelector('button');assert.equal(button.getAttribute('role'),'switch');assert.equal(button.getAttribute('aria-checked'),'false');
  button.click();assert.equal(element.dataset.value,'1');assert.equal(button.getAttribute('aria-checked'),'true');assert.match(element.querySelector('.shc-state').textContent,/1 · Freigegeben/);assert.equal(element.querySelector('.shc-state').style.backgroundColor,'rgb(0, 0, 0)');assert.equal(element.querySelector('.shc-state').style.color,'rgb(255, 255, 255)');
  button.click();assert.equal(element.dataset.value,'0');assert.equal(element.querySelector('.shc-state').style.color,'rgb(21, 41, 59)');assert.deepEqual(values,[1,0]);assert.equal(commands.length,2);
});
check('Ohne UI-Test sind Aktionen gesperrt und erzeugen keine Platzhalterereignisse',()=>{
  let testing=false,calls=0;const element=mount({type:'toggle'},{isTesting:()=>testing,onValue:()=>calls++,onCommand:()=>calls++});
  const button=element.querySelector('button');assert.equal(button.disabled,true);button.click();assert.equal(calls,0);assert.equal(element.dataset.value,'0');
  testing=true;element.smartHMI.refreshTesting();assert.equal(button.disabled,false);button.click();assert.equal(element.dataset.value,'1');assert.equal(calls,2);
  testing=false;element.smartHMI.refreshTesting();button.click();assert.equal(element.dataset.value,'1');assert.equal(calls,2);assert.match(element.querySelector('.shc-output').textContent,/UI-Test einschalten/);
});
check('Icon-Schaltfläche ist bedienbar, beschriftet und kann 0/1-Farben testen',()=>{
  const element=mount({type:'iconbutton',label:'Neue Verriegelung',icon:'🔒',behavior:'value',offColor:'#fff',onColor:'#f00'});
  const button=element.querySelector('button');assert.match(button.getAttribute('aria-label'),/Neue Verriegelung/);assert.equal(element.querySelector('.shc-icon').textContent,'🔒');
  button.click();assert.equal(element.dataset.value,'1');assert.equal(button.style.backgroundColor,'rgb(255, 0, 0)');assert.equal(button.getAttribute('aria-pressed'),'true');
});
check('Schaltflächen demonstrieren Meldung oder lokalen Zähler',()=>{
  const messages=[];const message=mount({type:'button',message:'Nur diese Testmeldung.'},{onCommand:event=>messages.push(event)});message.querySelector('button').click();assert.equal(message.querySelector('.shc-output').textContent,'Nur diese Testmeldung.');
  const values=[];const counter=mount({type:'button',behavior:'counter',defaultValue:5},{onValue:value=>values.push(value)});counter.querySelector('button').click();counter.querySelector('button').click();assert.equal(counter.smartHMI.getState().count,7);assert.deepEqual(values,[6,7]);
  assert.match(counter.querySelector('.shc-output').textContent,/7/);
  const event=messages[0];assert.equal(event.scope,'draft-only');assert.equal(event.placeholder,true);assert.equal(event.programmingRequired,true);assert.equal(event.implemented,false);assert.equal(Object.hasOwn(event,'command'),false);assert.equal(Object.isFrozen(event),true);
});
check('Dropdown aktualisiert lokale Auswahl, Farbanzeige und Callback',()=>{
  const values=[];const element=mount({type:'dropdown',label:'Neue Betriebswahl',options:[{label:'A',value:'a',color:'#ff0000'},{label:'B',value:'b',color:'#00ff00'}],defaultValue:'b'},{onValue:value=>values.push(value)});
  const select=element.querySelector('select');assert.equal(select.value,'b');assert.equal(element.querySelector('.shc-selected').style.backgroundColor,'rgb(0, 255, 0)');
  select.value='a';select.dispatchEvent(new Event('change',{bubbles:true}));assert.equal(element.dataset.value,'a');assert.equal(element.querySelector('.shc-selected').textContent,'A');assert.deepEqual(values,['a']);
});
check('Anzeige lässt ihren Beispielwert im UI-Test bewusst umschalten',()=>{
  const element=mount({type:'indicator',label:'Neue Meldung',defaultValue:1,onText:'Bereit'});assert.equal(element.dataset.value,'1');element.querySelector('button').click();assert.equal(element.dataset.value,'0');assert.match(element.querySelector('button').getAttribute('aria-label'),/lokalen Anzeigewert/);
});
check('Konfigurationsänderung erhält laufenden Testwert und DOM-Fokus bei gleichem Typ',()=>{
  const config={type:'toggle',label:'Alt',onColor:'#000000'},element=mount(config);const button=element.querySelector('button');button.click();button.focus();
  element.smartHMI.updateConfig({...config,label:'Neu',onColor:'#ff0000'});assert.equal(element.querySelector('button'),button);assert.equal(document.activeElement,button);assert.equal(element.dataset.value,'1');assert.match(element.textContent,/Neu/);assert.equal(element.querySelector('.shc-state').style.backgroundColor,'rgb(255, 0, 0)');
  element.smartHMI.updateConfig({...config,defaultValue:1});assert.equal(element.dataset.value,'1');element.smartHMI.reset();assert.equal(element.dataset.value,'1');
});
check('Dropdown-Konfiguration kann Optionen aktualisieren, ohne das Steuerelement auszutauschen',()=>{
  const element=mount({type:'dropdown',options:[{label:'A',value:'a'},{label:'B',value:'b'}]});const select=element.querySelector('select');select.value='b';select.dispatchEvent(new Event('change',{bubbles:true}));
  element.smartHMI.updateConfig({type:'dropdown',label:'Neu',options:[{label:'A2',value:'a',color:'#000'},{label:'B2',value:'b',color:'#f00'}]});
  assert.equal(element.querySelector('select'),select);assert.equal(select.value,'b');assert.equal(select.options[1].textContent,'B2');assert.equal(element.querySelector('.shc-selected').textContent,'B2');
  element.smartHMI.updateConfig({type:'dropdown',options:[{label:'C',value:'c'}]});assert.equal(element.dataset.value,'c');
});
check('Typ-/Testverhaltenswechsel setzt lokale Werte nachvollziehbar zurück',()=>{
  const element=mount({type:'button',behavior:'counter'});element.querySelector('button').click();element.querySelector('button').click();
  element.smartHMI.updateConfig({type:'button',behavior:'value'});assert.equal(element.dataset.value,'0');element.querySelector('button').click();assert.equal(element.dataset.value,'1');
  element.smartHMI.updateConfig({type:'indicator',defaultValue:0});assert.equal(element.dataset.value,'0');
});
check('Texte, Icons, Beschreibung und Optionslisten bleiben sichere Texte',()=>{
  const unsafe='<img src=x onerror="alert(1)"><script>window.bad=1</script>';
  const element=mount({type:'dropdown',label:unsafe,description:unsafe,options:[{label:unsafe,value:'unsafe'}]});assert.equal(element.querySelectorAll('img,script').length,0);assert.ok(element.textContent.includes('<img'));assert.equal(dom.window.bad,undefined);
  const icon=mount({type:'iconbutton',icon:unsafe});assert.equal(icon.querySelectorAll('img,script').length,0);
});
check('Lange Dropdownliste ist vollständig und wird ohne HTML-Interpretation aufgebaut',()=>{
  const options=Array.from({length:600},(_,index)=>({label:'Option <'+index+'>',value:String(index),color:index%2?'#ff0000':'#00ff00'}));
  const element=mount({type:'dropdown',options,defaultValue:'599'});assert.equal(element.querySelector('select').options.length,600);assert.equal(element.querySelector('select').value,'599');assert.equal(element.querySelectorAll('script,img').length,0);
});
check('Editor zeigt Änderungen direkt, übernimmt aber erst auf bewusste Aktion',()=>{
  const host=document.createElement('div');document.body.append(host);const applied=[];const editor=api.renderEditor(host,{type:'button',label:'Vorher'},{onApply:config=>applied.push(config)});
  input(host,'[data-field="label"]','Neuer Text');assert.equal(applied.length,0);assert.match(host.querySelector('.shc-preview').textContent,/Neuer Text/);assert.equal(editor.isDirty(),true);
  clickText(host,'Baustein übernehmen');assert.equal(applied.length,1);assert.equal(applied[0].label,'Neuer Text');assert.equal(applied[0].implemented,false);assert.equal(host.querySelectorAll('[data-cmd],[id]').length,0);
});
check('Editor testet 0/1-Anzeige und Farbänderung lokal',()=>{
  const host=document.createElement('div');document.body.append(host);api.renderEditor(host,{type:'toggle',label:'Probe'});
  input(host,'[data-field="defaultValue"]','1','change');input(host,'[data-field="onColor"]','#ff0000');assert.equal(host.querySelector('.shc-preview .shc-state').style.backgroundColor,'rgb(255, 0, 0)');
  assert.equal(host.querySelector('.shc-preview .shc-component').dataset.value,'1');
});
check('Dropdown-Editor unterstützt Optionen, Reihenfolge, Farben und Sammellisten',()=>{
  const host=document.createElement('div');document.body.append(host);const applied=[];api.renderEditor(host,{type:'dropdown'},{onApply:value=>applied.push(value)});
  clickText(host,'+ Option');assert.equal(host.querySelector('[data-field="optionList"]').options.length,3);
  input(host,'[data-field="optionLabel"]','Dritte Option');input(host,'[data-field="optionValue"]','third');input(host,'[data-field="optionColor"]','#ff00ff');
  assert.equal(host.querySelector('.shc-preview .shc-selected').style.backgroundColor,'rgb(255, 0, 255)');
  clickText(host,'Nach oben');assert.equal(host.querySelector('[data-field="optionList"]').options[1].textContent,'Dritte Option · third');
  input(host,'[data-field="bulkOptions"]','Start | start | #00ff00\nWarten | wait | #ff0000');clickText(host,'Liste ersetzen');clickText(host,'Baustein übernehmen');
  assert.equal(applied[0].options.length,2);assert.equal(applied[0].options[0].value,'start');assert.equal(applied[0].options[1].color,'#ff0000');
});
check('Doppelte Optionswerte werden im Editor vor Übernahme erklärt',()=>{
  const host=document.createElement('div');document.body.append(host);let calls=0;api.renderEditor(host,{type:'dropdown'},{onApply:()=>calls++});
  input(host,'[data-field="optionValue"]','wait');clickText(host,'Baustein übernehmen');assert.equal(calls,0);assert.match(host.querySelector('.shc-editor-status').textContent,/eindeutigen Wert/);
});
check('Editor und neue Bausteine greifen nicht auf Netzwerk, Server oder Nutzerdaten zu',()=>{
  assert.equal(unexpectedNetwork,0);assert.deepEqual(failures,[]);assert.equal(document.querySelectorAll('iframe,img,script').length,0);
});
const report={passed:true,at:new Date().toISOString(),node:process.version,checks,unexpectedNetwork,jsdomErrors:failures,scope:'isolated-dom-only',controllerAccess:false,userDataWrites:false};
fs.writeFileSync(path.join(__dirname,'components-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,checks:checks.length,networkCalls:unexpectedNetwork,scope:report.scope}));
dom.window.close();
