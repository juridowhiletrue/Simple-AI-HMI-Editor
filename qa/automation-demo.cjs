'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const adapter=require('../templates/demo/adapter.cjs');
const input=adapter.capture(),preview=adapter.createPreview(input),errors=[];
const consoleBridge=new VirtualConsole();consoleBridge.on('jsdomError',e=>errors.push(e.message));
let assertions=0,commands=0;
const check=fn=>{fn();assertions++;};
async function main(){
  check(()=>assert.doesNotMatch(input.html,/logo\.png|192\.168\./i));
  check(()=>assert.equal(adapter.pages.length,7));
  const dom=new JSDOM(input.html,{url:'http://127.0.0.1:9999/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:consoleBridge,beforeParse(w){
    w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{};
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.fetch=async(url,options={})=>{
      const target=new URL(url,w.location.href);
      assert.equal(target.origin,w.location.origin,'Demo request left loopback');
      const value=options.method==='POST'?(commands++,preview.post(target,options.body)):preview.get(target);
      return {ok:true,status:200,json:async()=>value,text:async()=>JSON.stringify(value)};
    };
  }});
  try{
    await new Promise(resolve=>setTimeout(resolve,100));
    const doc=dom.window.document;
    check(()=>assert.equal(doc.querySelector('.brand img'),null));
    check(()=>assert.match(doc.querySelector('header').textContent,/Automation Demo/));
    for(const page of adapter.pages){
      dom.window.showPage(page);
      check(()=>assert.equal(doc.querySelector('section[data-page="'+page+'"]').hidden,false));
    }
    for(const scene of ['hand-cold','hand','auto-wait-sgm','auto','fault','io-off']){
      preview.configure({enabled:true,scene});
      const state=preview.get(new URL('http://127.0.0.1:9999/api/status?sid=1'));
      dom.window.render(state);
      check(()=>assert.ok(doc.getElementById('activity').textContent.length));
    }
    preview.configure({enabled:true,scene:'hand'});
    dom.window.render(preview.get(new URL('http://127.0.0.1:9999/api/status?sid=1')));
    await dom.window.request('stop');
    check(()=>assert.equal(preview.get(new URL('http://127.0.0.1:9999/api/status?sid=1')).active,0));
    await new Promise(resolve=>setTimeout(resolve,80));
    check(()=>assert.deepEqual(errors,[]));
    console.log(JSON.stringify({passed:true,assertions,pages:7,scenes:6,commands,network:false,domErrors:errors}));
  }finally{dom.window.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
