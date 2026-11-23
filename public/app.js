'use strict';
const $=id=>document.getElementById(id);
const frame=$('hmi');
let model,projectAdapter,etag='',htmlHash='',mode='view',currentPage='',original=false;
let doc,win,observer,nodes=new Map(),selected=null,selectedPage=null,commentAnchor=null,commentPage=null,focusedComment=null;
let undoStack=[],redoStack=[],saving=false,saveQueue=Promise.resolve(),remote=null;
let renderQueued=false,pointerStart=null,dragKey=null,toastTimer,readOnlyKeys=new Set();
let editRevision=0,savedRevision=0,saveError=null,baseModel=null,saveMessage='';
let localRecovery=null;
let commentPageSignature='',replyDrafts=new Map();
let noteDraft=null,restoreNoteOnLoad=false;
let recoveryStored=false,transientStored=false;
let testContext={},testOverrides=new Map();
let componentDrafts=new Map(),componentEditorView=null,componentEditorKey=null,navigatorView=null;
const clone=value=>JSON.parse(JSON.stringify(value));
const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
const pageName=id=>model?.pages.find(p=>p.id===id)?.name||id;
const modes={view:'Gehe durch die Seiten. Die Daten sind Beispiele; keine OPTA ist verbunden.',edit:'Klicke Text zum Bearbeiten. Ziehe einen Bereich an eine andere Stelle. Rückgängig geht jederzeit.',comment:'Klicke auf ein Element oder ziehe eine Markierung auf. Schreibe deinen Wunsch direkt dazu.',test:'Teste Schalter, Farben, Auswahllisten und Klickreaktionen. Befehle enden im lokalen Testadapter.'};
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
async function api(url,body){
  const res=await fetch(url,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json();if(!res.ok){const error=Error(data.error||'Speichern nicht möglich.');error.status=res.status;throw error;}return data;
}
const dirty=()=>editRevision>savedRevision;
const recoveryKey=()=> 'simple-ai-hmi-editor:recovery:'+(model.workspaceId||model.baseline.sourceSha256)+':'+model.baseline.sourceSha256;
function rememberRecovery(){
  try{localStorage.setItem(recoveryKey(),JSON.stringify({model:clone(model),baseModel:clone(baseModel),etag,htmlHash,at:new Date().toISOString()}));recoveryStored=true;}catch{recoveryStored=false;}
  return recoveryStored;
}
function clearRecovery(){try{localStorage.removeItem(recoveryKey());}catch{}}
const transientKey=()=>recoveryKey()+':inputs';
function persistTransient(){
  if(!model)return;
  try{localStorage.setItem(transientKey(),JSON.stringify({note:noteDraft,replies:[...replyDrafts],components:[...componentDrafts]}));transientStored=true;}catch{transientStored=false;}
  $('resumeNote').hidden=!noteDraft;
  $('resumeComponent').hidden=!componentDrafts.size;
  $('resumeComponent').textContent=componentDrafts.size===1?'Offenen Baustein fortsetzen':componentDrafts.size+' offene Bausteine';
  $('componentDraftState').hidden=!componentEditorKey||!componentDrafts.has(componentEditorKey);
  $('discardComponentDraft').hidden=$('componentDraftState').hidden;
  $('componentDraftState').textContent=transientStored?'Deine offenen Eingaben bleiben beim Wechsel und Neuladen erhalten. Mit „Baustein übernehmen“ werden sie Teil des Entwurfs.':'Eingaben noch ungesichert. Bitte übernehmen oder Zwischenstand herunterladen.';
  if(noteDraft)$('noteSaveState').textContent=transientStored?'Notiz-Entwurf im Browser zwischengespeichert.':'Notiz noch nicht gesichert. Bitte speichern oder Zwischenstand herunterladen.';
  return transientStored;
}
function captureComponentInput(){
  if(!componentEditorView||!componentEditorKey||!model)return;
  const saved=model.actions.find(a=>a.type==='component'&&a.key===componentEditorKey);
  if(!saved)return;
  const config=componentEditorView.getConfig();
  if(JSON.stringify(config)===JSON.stringify(saved.config))componentDrafts.delete(componentEditorKey);
  else componentDrafts.set(componentEditorKey,config);
  persistTransient();
}
function noteChanged(){
  if($('commentEditor').hidden)return false;
  const existing=focusedComment&&model.comments.find(c=>c.id===focusedComment);
  return existing?existing.text!==$('commentText').value.trim()||existing.kind!==$('commentKind').value||!!existing.important!==$('commentImportant').checked:!!$('commentText').value.trim();
}
function captureNoteInput(){
  if(noteChanged())noteDraft={page:commentPage,anchor:commentAnchor,text:$('commentText').value,kind:$('commentKind').value,important:$('commentImportant').checked,commentId:focusedComment};
  else if(!$('commentEditor').hidden)noteDraft=null;
  persistTransient();
}
function resumeNote(){
  if(!noteDraft)return;
  const value=clone(noteDraft);setCurrentPage(value.page);
  openComment(value.anchor,model.comments.find(c=>c.id===value.commentId)||null);
  commentPage=value.page;$('commentText').value=value.text;$('commentKind').value=value.kind;$('commentImportant').checked=!!value.important;
  noteDraft=value;persistTransient();positionNote();
}
function mergeRemote(data){
  const merge=window.HMIDraftState?.mergeModels;
  if(!merge)return {model:clone(model),conflicts:[{message:'Automatische Abstimmung nicht verfügbar.'}]};
  return merge(baseModel,model,data.model);
}
function notifyRemote(data){
  remote=data;$('remoteNotice').hidden=false;
  $('remoteMessage').textContent=dirty()?'Ein anderer Entwurf ist da. Deine ungespeicherten Änderungen bleiben erhalten.':'Ein neuer Arbeitsstand ist da.';
  $('acceptRemote').textContent=dirty()?'Abstimmung öffnen':'Vorschau aktualisieren';
  $('recoverExport').hidden=!dirty();
}
function status(text,failed=false){$('saveState').textContent=text;$('saveState').style.color=failed?'#ffd19b':'';}
const drawerButtons={comments:'commentsButton',pages:'pagesButton',changes:'changesButton'};
function closeDrawers(){for(const id of ['inspector','comments','pages','changes','program']){$(id).hidden=true;if(drawerButtons[id])$(drawerButtons[id]).setAttribute('aria-expanded','false');}}
function drawer(id){closeDrawers();$(id).hidden=false;if(drawerButtons[id])$(drawerButtons[id]).setAttribute('aria-expanded','true');}
function toggleDrawer(id){if($(id).hidden)drawer(id);else{$(id).hidden=true;if(drawerButtons[id])$(drawerButtons[id]).setAttribute('aria-expanded','false');}}
function setMode(value){
  captureComponentInput();
  mode=value;if(original&&value!=='view'){original=false;$('compare').setAttribute('aria-pressed','false');$('compare').textContent='Original ansehen';updateWorkspaceTitle();reloadFrame();}
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===value)));
  $('modeHint').textContent=modes[value];if(doc)doc.documentElement.dataset.draftMode=value;
  $('addComponent').hidden=value!=='edit';$('testTools').hidden=value!=='test';
  api('/draft/preview',{enabled:value==='test'}).then(data=>{testContext=data;updateTestControls();renderFrame();}).catch(error=>{if(value==='test')toast(error.message);});
  if(value==='view'){selected=null;closeDrawers();}else if(value==='comment')closeDrawers();
  else if(value==='test'){selected=null;closeDrawers();}
  requestAnimationFrame(resizeCanvas);
  renderFrame();
}
function resizeCanvas(){
  document.documentElement.style.setProperty('--chrome-height',$('chrome').getBoundingClientRect().height+'px');
  const sizes={portrait:[1080,1920],landscape:[1920,1080],tablet:[820,1180],phone:[390,844]};
  const available=Math.max(300,$('workspace').clientWidth-(innerWidth<800?24:48));
  const [width,height]=$('viewport').value==='free'?[available,Math.max(800,innerHeight-240)]:(sizes[$('viewport').value]||sizes.portrait);
  const zoom=$('zoom').value==='fit'?Math.min(1,available/width):Number($('zoom').value);
  $('canvas').style.width=width+'px';$('canvas').style.height=height+'px';$('canvas').style.transform=`scale(${zoom})`;
  $('canvasWrap').style.width=(width*zoom)+'px';$('canvasWrap').style.height=(height*zoom)+'px';
}
function keyFor(el){
  if(!el||el.nodeType!==1||el.closest('[data-draft-decoration]'))return null;
  if(el.dataset.draftKey)return el.dataset.draftKey;
  let key;
  if(el.id)key='#'+el.id;
  else if(el.dataset.nav)key='nav:'+el.dataset.nav;
  else {
    const parts=[];let node=el;
    while(node&&node!==doc.body){
      if(node.id){parts.unshift('#'+node.id);break;}
      const siblings=node.parentElement?Array.from(node.parentElement.children).filter(n=>n.tagName===node.tagName):[node];
      parts.unshift(node.tagName.toLowerCase()+':'+(siblings.indexOf(node)+1));node=node.parentElement;
    }
    key=parts.join('/');
  }
  el.dataset.draftKey=key;nodes.set(key,el);return key;
}
function registerNodes(){
  for(const el of doc.body.querySelectorAll('*')){
    if(['SCRIPT','STYLE','PATH','SVG','OPTION'].includes(el.tagName)||el.closest('[data-draft-decoration]'))continue;
    if(el.dataset.draftKey)nodes.set(el.dataset.draftKey,el);else keyFor(el);
  }
}
function nodeFor(key){const el=nodes.get(key);return el?.isConnected?el:null;}
function labelFor(el){
  if(!el)return '';
  if(el.matches('input,select,textarea')){
    const label=Array.from(el.labels||[]).map(item=>Array.from(item.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ')).join(' ');
    return normalize(el.getAttribute('aria-label')||label||el.id||'Eingabefeld').slice(0,110);
  }
  const component=model?.actions.find(a=>a.type==='component'&&a.key===el.dataset.draftKey);
  if(component)return component.config.label;
  const heading=el?.querySelector?.('h1,h2,h3,strong,small');
  return normalize(heading?.textContent||el?.getAttribute?.('aria-label')||el?.textContent||el?.tagName).slice(0,110);
}
function directText(el){return Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();}
function setText(el,text){
  const parts=Array.from(el.childNodes).filter(n=>n.nodeType===3);
  if(parts.length){if(parts[0].textContent!==text)parts[0].textContent=text;for(const p of parts.slice(1))if(p.textContent)p.textContent='';}
  else if(!el.children.length&&el.textContent!==text)el.textContent=text;
}
function isEditableText(el){return ['H1','H2','H3','H4','P','SPAN','SMALL','STRONG','B','LABEL','BUTTON','TH','TD'].includes(el.tagName)&&(!el.children.length||directText(el));}
function blockFor(el){
  if(!el)return null;
  const result=el.closest('.shc-component,.panel,.process,.node,.loop,.system-strip,.standalone,.grid,.quick-grid');
  return result||el.closest('section[data-page]')?.querySelector('h1')||el;
}
function anchorFor(el,point){
  const r=el.getBoundingClientRect();
  return {key:keyFor(el),label:labelFor(el),tag:el.tagName.toLowerCase(),elementId:el.id||null,command:el.closest('[data-cmd]')?.dataset.cmd||null,
    x:point?Math.max(0,Math.min(1,(point.x-r.left)/Math.max(1,r.width))):0.95,
    y:point?Math.max(0,Math.min(1,(point.y-r.top)/Math.max(1,r.height))):0.1};
}
function addAction(action,description){
  action.id='a-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);action.description=description;
  if(action.type==='move'){
    const el=nodeFor(action.key),from=el?.closest('section[data-page]')?.dataset.page;
    const to=action.page||nodeFor(action.parent)?.closest('section[data-page]')?.dataset.page;
    const commands=el?[el,...el.querySelectorAll('[data-cmd]')].map(n=>n.dataset.cmd).filter(Boolean):[];
    const matches=(projectAdapter.layoutRules||[]).filter(rule=>from!==to&&rule.pages.some(p=>[from,to].includes(p))&&commands.some(cmd=>rule.prefixes.some(prefix=>prefix==='*'||cmd.startsWith(prefix))&&!(rule.exceptPrefixes||[]).some(prefix=>cmd===prefix||cmd.startsWith(prefix))));
    if(matches.length)action.impact={classification:'bedienablauf',requiresConfirmation:true,confirmed:false,commands:[...new Set(commands)],explanation:matches.map(r=>r.explanation).join(' '),references:matches.flatMap(r=>r.references||[])};
    else if(commands.length&&from!==to&&!projectAdapter.layoutRules)action.impact={classification:'ungeprüft',requiresConfirmation:false,confirmed:false,commands,explanation:'Die Folgen der Seitenzuordnung sind für diesen Projektadapter noch nicht fachlich bewertet.'};
  }
  change(m=>m.actions.push(action),description);
}
function change(edit,description,{reload=false}={}){
  if(original){toast('Wechsle zuerst zurück zum Entwurf.');return;}
  undoStack.push(clone(model));if(undoStack.length>80)undoStack.shift();redoStack=[];
  edit(model);renderShell();if(reload)reloadFrame();else renderFrame();persist(description);
}
function persist(description){
  editRevision++;updateWorkspaceTitle();saveMessage=description||saveMessage;rememberRecovery();status('Wird gespeichert …');
  if(!saving)saveQueue=flushSaves();
  return saveQueue;
}
async function flushSaves(){
  saving=true;let retries=0;
  try{
    while(dirty()){
      const revision=editRevision,state=clone(model);
      try{
        const data=await api('/draft/save',{model:state,etag});
        etag=data.etag;htmlHash=data.htmlHash;baseModel=clone(data.model);
        model.serial=data.model.serial;model.savedAt=data.model.savedAt;
        savedRevision=revision;saveError=null;$('retrySave').hidden=true;$('emergencyDownload').hidden=true;
      }catch(error){
        if(error.status===409&&retries++<2){
          const latest=await api('/draft/state'),merged=mergeRemote(latest);
          if(!merged.conflicts.length){
            model=merged.model;etag=latest.etag;baseModel=clone(latest.model);editRevision++;
            renderShell();renderFrame();rememberRecovery();continue;
          }
          notifyRemote(latest);
        }
        saveError=error;rememberRecovery();status(recoveryStored?'Im Browser gesichert · Speichern offen':'Noch ungespeichert · Fenster offen lassen',true);$('retrySave').hidden=false;$('emergencyDownload').hidden=false;
        toast('Dein Entwurf bleibt erhalten. '+error.message);return false;
      }
    }
    clearRecovery();status('Lokal gespeichert');if(saveMessage)toast(saveMessage);saveMessage='';return true;
  }catch(error){saveError=error;rememberRecovery();status(recoveryStored?'Im Browser gesichert · Speichern offen':'Noch ungespeichert · Fenster offen lassen',true);$('retrySave').hidden=false;$('emergencyDownload').hidden=false;return false;}
  finally{saving=false;}
}
async function ensureSaved(){
  captureComponentInput();
  if(componentDrafts.size){toast('Noch offene Baustein-Eingaben: bitte zuerst fortsetzen und übernehmen oder verwerfen.');return false;}
  if(!$('commentEditor').hidden&&$('commentText').value.trim())$('saveComment').click();
  const pendingReplies=[...replyDrafts].filter(([id,text])=>text.trim()&&model.comments.some(c=>c.id===id));
  if(pendingReplies.length){
    replyDrafts.clear();$('commentList').querySelectorAll('.reply-editor').forEach(area=>area.value='');persistTransient();
    change(m=>{for(const [id,text] of pendingReplies)m.comments.find(c=>c.id===id).replies.push({text:text.trim(),at:new Date().toISOString()});},'Antwortentwürfe gespeichert');
  }
  await saveQueue;
  if(dirty()||saveError){toast('Dieser Stand ist noch nicht vollständig gespeichert. Bitte erst die Speicherung oder Abstimmung abschließen.');return false;}
  return true;
}
function updateWorkspaceTitle(){
  if(!model)return;
  const marker=projectAdapter.checkpointLabel;
  const marked=marker && typeof marker.title==='string' && marker.title.trim() && !original && !dirty() &&
    marker.version===model.version && marker.serial===model.serial && marker.modelSha256===etag && marker.previewSha256===htmlHash;
  const view=original?'Original':model.name;
  const version=original?model.baseline.version:model.version;
  $('workspaceTitle').textContent=marked?view+' · '+marker.title:view;
  $('version').textContent=version;
  document.title=projectAdapter.projectId+' · '+(marked?marker.title:view)+' '+version+' · '+projectAdapter.productName;
}
function renderShell(){
  if(!model)return;
  updateWorkspaceTitle();$('productTitle').textContent=projectAdapter.productName+' · '+projectAdapter.projectId;$('baselineVersion').textContent='Basis '+model.baseline.version;
  $('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;
  $('commentCount').textContent=model.comments.filter(c=>c.status!=='erledigt').length;
  const previous=$('pageSelect').value;
  $('pageSelect').replaceChildren();$('targetPage').replaceChildren();
  const visiblePages=original?(projectAdapter.originalPages||projectAdapter.defaultPages).map(id=>({id,name:id,visible:true})):model.pages;
  for(const p of visiblePages){
    if(p.visible){const o=new Option(p.name,p.id);$('pageSelect').append(o);}
    $('targetPage').append(new Option(p.name+(p.visible?'':' · ausgeblendet'),p.id));
  }
  if(!visiblePages.some(p=>p.id===currentPage&&p.visible))currentPage=visiblePages.find(p=>p.visible).id;
  $('pageSelect').value=currentPage||previous;$('targetPage').value=currentPage;
  renderPages();renderComments();renderChanges();
}
function setCurrentPage(id){
  captureComponentInput();
  if(!$('commentEditor').hidden&&commentPage!==id)$('cancelComment').click();
  currentPage=id;$('pageSelect').value=id;
  if(win?.showPage){win.showPage(id);win.scrollTo({top:0,behavior:'instant'});}
  renderComments();renderFrame();
}
function reloadFrame(){
  captureComponentInput();componentEditorView=null;componentEditorKey=null;
  selected=null;selectedPage=null;$('inspector').hidden=true;nodes=new Map();if(observer)observer.disconnect();doc=null;win=null;
  frame.src=(original?'/baseline.html':'/hmi.html')+'?draft='+Date.now();
}
function applyModel(){
  registerNodes();if(original)return;
  const nav=doc.getElementById('navigation');
  for(const p of model.pages){
    let section=Array.from(doc.querySelectorAll('section[data-page]')).find(n=>n.dataset.page===p.id);
    if(!section){
      section=doc.createElement('section');section.dataset.page=p.id;section.hidden=true;
      const heading=doc.createElement('h1');heading.textContent=p.name;section.append(heading);
      const empty=doc.createElement('div');empty.className='draft-empty';empty.dataset.draftDecoration='empty';empty.textContent='Hier ist Platz für deine neue Seite. Verschiebe einen Bereich hierher.';section.append(empty);
      doc.querySelector('main').insertBefore(section,doc.querySelector('main footer'));keyFor(section);keyFor(heading);
    }
    let button=Array.from(nav.querySelectorAll('button')).find(n=>n.dataset.nav===p.id);
    if(!button){button=doc.createElement('button');button.dataset.nav=p.id;const icon=doc.createElement('span');icon.className='nav-icon';icon.textContent='▦';const label=doc.createElement('span');label.textContent=p.name;button.append(icon,label);button.onclick=()=>{win.showPage(p.id);currentPage=p.id;renderComments();};nav.append(button);keyFor(button);}
    const label=button.querySelector('span:last-child');if(label&&label.textContent!==p.name)label.textContent=p.name;
    if(!p.visible)button.style.setProperty('display','none','important');else button.style.removeProperty('display');
    if(p.title!==null){const h=section.querySelector('h1');if(h&&h.textContent!==p.title)h.textContent=p.title;}
  }
  const order=model.pages.map(p=>p.id);
  const defaultOrder=projectAdapter.defaultPages;
  if(JSON.stringify(order)!==JSON.stringify(defaultOrder)||model.pages.some(p=>!p.visible)){
    nav.querySelectorAll('.nav-heading').forEach(n=>n.style.display='none');
    const buttons=Array.from(nav.querySelectorAll('button'));
    if(buttons.map(n=>n.dataset.nav).join('|')!==order.join('|'))for(const p of model.pages)nav.append(buttons.find(n=>n.dataset.nav===p.id));
  }
  for(const action of model.actions){
    if(action.type==='component'){
      let component=nodeFor(action.key);
      if(!component){
        if(!window.SimpleAIHMIComponents)continue;
        component=window.SimpleAIHMIComponents.create(action.config,{document:doc,isTesting:()=>mode==='test',onCommand:event=>{$('testResult').textContent='Neue Funktion (Platzhalter): '+event.label+' · Wert '+event.value;toast('UI-Test: '+event.message+' Programmierung bleibt offen.');},onValue:()=>renderFrame()});
        component.dataset.draftKey=action.key;component.dataset.componentAction=action.id;
        const parent=Array.from(doc.querySelectorAll('section[data-page]')).find(n=>n.dataset.page===action.page);
        if(parent){parent.append(component);nodes.set(action.key,component);registerNodes();}
      }else component.simpleAIHMI?.updateConfig(action.config);
      component?.simpleAIHMI?.refreshTesting();continue;
    }
    const el=nodeFor(action.key);if(!el)continue;
    if(action.type==='text')setText(el,action.value);
    else if(action.type==='state-style'){
      const override=testOverrides.get(action.key),recipe=override?.recipe||action.recipe;
      const value=override?override.value:!['element','manual'].includes(recipe.valueSource)?testContext[recipe.valueSource]:undefined;
      window.SimpleAIHMIStateStyles?.apply(el,recipe,value);
    }
    else if(action.type==='hide')el.classList.add('draft-hidden');
    else if(action.type==='style'){
      el.classList.remove('draft-width-full','draft-width-half','draft-width-third');
      if(action.width!=='auto')el.classList.add('draft-width-'+action.width);
    }else if(action.type==='move'){
      const parent=action.page?Array.from(doc.querySelectorAll('section[data-page]')).find(n=>n.dataset.page===action.page):nodeFor(action.parent);
      const before=action.before?nodeFor(action.before):null;
      if(parent&&!el.contains(parent)){
        const reference=before?.parentElement===parent?before:null;
        if(el.parentElement!==parent||el.nextElementSibling!==reference)parent.insertBefore(el,reference);
      }
    }else if(action.type==='duplicate'){
      const duplicateKey='copy:'+action.id;
      if(!nodeFor(duplicateKey)){
        const copy=el.cloneNode(true);copy.dataset.draftKey=duplicateKey;
        for(const child of [copy,...copy.querySelectorAll('*')]){
          if(child!==copy)child.dataset.draftKey='copy:'+action.id+':'+(child.dataset.draftKey||Math.random());
          child.removeAttribute('id');child.removeAttribute('draggable');
        }
        copy.classList.add('draft-native-duplicate');copy.dataset.draftUnbound='true';
        const badge=doc.createElement('div');badge.className='shc-badge';badge.dataset.shcLocked='true';badge.textContent='Layout-Kopie · Programmbindung offen';copy.prepend(badge);
        el.after(copy);nodes.set(duplicateKey,copy);registerNodes();
      }
    }
  }
  for(const [key,override] of testOverrides){const el=nodeFor(key);if(el)window.SimpleAIHMIStateStyles?.apply(el,override.recipe,override.value);}
  for(const section of doc.querySelectorAll('section[data-page]')){
    const empty=section.querySelector('.draft-empty');if(empty)empty.style.display=section.querySelector('.panel,.grid,.process,.shc-component')?'none':'';
  }
  const activeSection=Array.from(doc.querySelectorAll('section[data-page]')).find(n=>n.dataset.page===currentPage);
  if(activeSection?.hidden&&win.showPage)win.showPage(currentPage);
  for(const el of doc.querySelectorAll(projectAdapter.blocks+',.shc-component')){
    el.dataset.draftBlock='1';el.draggable=mode==='edit';
  }
}
function renderFrame(){
  if(!doc||renderQueued)return;
  renderQueued=true;
  requestAnimationFrame(()=>{
    renderQueued=false;if(!doc?.body)return;observer?.disconnect();
    try{
      applyModel();doc.documentElement.dataset.draftMode=mode;
      for(const el of doc.querySelectorAll('.draft-selected'))el.classList.remove('draft-selected');
      if(selected&&mode==='edit'){
        const chosen=nodeFor(selected);chosen?.classList.add('draft-selected');
        if(chosen){
          $('selectionName').textContent=labelFor(chosen)||'Bereich';
          const actualPage=chosen.closest('section[data-page]')?.dataset.page||null;
          if(actualPage!==selectedPage){selectedPage=actualPage;$('selectionContext').textContent=(actualPage?pageName(actualPage)+' · ':'')+'Bereich';$('targetPage').value=actualPage||currentPage;}
          renderBreadcrumbs(chosen);
        }
      }
      renderPins();
      positionNote();
      const nextCommentSignature=model.comments.map(c=>c.id+':'+effectiveCommentPage(c)).join('|');
      if(nextCommentSignature!==commentPageSignature){commentPageSignature=nextCommentSignature;renderComments();}
      const nav=doc.querySelector('#navigation .current');
      if(nav&&currentPage!==nav.dataset.nav){currentPage=nav.dataset.nav;$('pageSelect').value=currentPage;renderComments();}
    }catch(error){console.error(error);toast('Diese Änderung konnte nicht dargestellt werden: '+error.message);}
    finally{observer?.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});}
  });
}
function selectElement(el){
  if(!el||el.closest('[data-draft-decoration]'))return;
  captureComponentInput();
  if(el.closest('[data-shc-locked]'))el=blockFor(el);
  el=el.closest('.shc-component')||el;
  if(selected!==keyFor(el)){for(const key of testOverrides.keys()){const previous=nodeFor(key);if(previous)window.SimpleAIHMIStateStyles?.clear(previous);}testOverrides.clear();}
  selected=keyFor(el);$('selectionName').textContent=labelFor(el)||'Bereich';
  const position=el.getBoundingClientRect(),framePosition=frame.getBoundingClientRect(),frameScale=framePosition.width/frame.clientWidth;
  const focusX=framePosition.left+(position.left+Math.min(position.width/2,100))*frameScale;
  $('inspector').classList.toggle('dock-left',innerWidth>800&&focusX>innerWidth*.55);
  const page=el.closest('section[data-page]')?.dataset.page;selectedPage=page||null;
  $('selectionContext').textContent=(page?pageName(page)+' · ':'')+({BUTTON:'Schaltfläche',H1:'Überschrift',H2:'Überschrift',P:'Text',LABEL:'Beschriftung',SELECT:'Auswahlliste',INPUT:'Eingabefeld',TEXTAREA:'Textfeld',FORM:'Formular'}[el.tagName]||'Bereich');
  const editable=isEditableText(el);$('elementText').value=editable?directText(el):'';$('elementText').disabled=!editable;$('applyText').disabled=!editable;
  $('elementText').placeholder=editable?'Neue Bezeichnung':'Klicke auf einen Text innerhalb dieses Bereichs.';
  $('targetPage').value=page||currentPage;
  $('elementWidth').value=[...model.actions].reverse().find(a=>a.type==='style'&&a.key===selected)?.width||'auto';
  const component=model.actions.find(a=>a.type==='component'&&a.key===selected);
  $('elementText').closest('label').hidden=!!component;$('applyText').hidden=!!component;
  $('componentEditor').hidden=!component;$('componentEditor').replaceChildren();
  componentEditorView=null;componentEditorKey=component?.key||null;
  if(component)componentEditorView=window.SimpleAIHMIComponents.renderEditor($('componentEditor'),componentDrafts.get(component.key)||component.config,{onApply:config=>{change(m=>{m.actions.find(a=>a.id===component.id).config=config;},'Neuen Baustein aktualisiert');componentDrafts.delete(component.key);persistTransient();}});
  persistTransient();renderBreadcrumbs(el);
  $('stateStylePanel').hidden=!!component;if(!component&&$('stateStylePanel').open)loadStateStyleEditor();
  const command=selectedCommands()[0]||'';
  api('/draft/selection',{page:page||currentPage,command,key:selected,label:labelFor(el)}).catch(()=>{});
  if($('programBinding').open)loadSelectionProgram();
  drawer('inspector');renderFrame();
}
function selectedCommands(){
  const el=nodeFor(selected);if(!el)return [];
  const bound=el.closest('[data-cmd]');if(bound)return [bound.dataset.cmd];
  const nested=[...el.querySelectorAll('[data-cmd]')].map(n=>n.dataset.cmd);
  if(nested.length)return [...new Set(nested)];
  const control=el.closest('button,input,select,textarea,form');
  if(control?.id)return ['ui:'+control.id];
  if(control?.classList.contains('forceUnlock'))return ['ui:forceUnlock'];
  const form=el.closest('form');return form?.id?['ui:'+form.id]:[];
}
function renderBreadcrumbs(el){
  const host=$('elementPath');
  const chain=[];let parent=el;
  while(parent&&parent!==doc.body){if(parent===el||parent.matches('section[data-page],.panel,.process,.node,.shc-component'))chain.unshift(parent);parent=parent.parentElement;}
  const items=chain.slice(-4),labels=items.map(item=>item.matches('section[data-page]')?pageName(item.dataset.page):labelFor(item).slice(0,48)||'Bereich');
  const signature=JSON.stringify(items.map((item,i)=>[keyFor(item),labels[i]]));if(host.dataset.pathSignature===signature)return;
  host.dataset.pathSignature=signature;host.replaceChildren();
  for(const [index,item] of items.entries()){
    const button=document.createElement('button');button.type='button';
    button.textContent=labels[index];
    button.disabled=item===el;button.onclick=()=>selectElement(item);host.append(button);
  }
}
function openNavigator(){
  $('moreMenu').hidden=true;$('moreButton').setAttribute('aria-expanded','false');
  if(!doc||!window.SimpleAIHMINavigator)return;
  if(original){toast('Bitte zuerst zum Entwurf wechseln, um Elemente zu bearbeiten.');return;}
  navigatorView?.destroy();
  navigatorView=window.SimpleAIHMINavigator.render($('navigatorBody'),{document:doc,pages:model.pages,getKey:keyFor,pageFilter:'',onSelect:entry=>{
    const page=model.pages.find(p=>p.id===entry.page);
    if(page&&!page.visible){toast('Diese Seite ist ausgeblendet. Bitte zuerst in „Seiten ordnen“ einblenden.');return;}
    $('navigatorDialog').hidden=true;setMode('edit');if(entry.page)setCurrentPage(entry.page);
    const el=nodeFor(entry.key);if(el){selectElement(el);requestAnimationFrame(()=>el.scrollIntoView({block:'center',behavior:'smooth'}));}
  }});
  $('navigatorDialog').hidden=false;requestAnimationFrame(()=>navigatorView.focus());
}
function contextCards(target,data,command=''){
  target.replaceChildren();
  const text=(tag,value,cls='')=>{const el=document.createElement(tag);el.textContent=value;el.className=cls;target.append(el);return el;};
  if(!data.available){text('p',data.limitations?.join(' ')||'Für diese Auswahl liegt noch keine geprüfte Programmanalyse vor.','muted');return;}
  text('p',(data.sourceVersion||'Gespeicherter Programmstand')+(data.analyzedAt?' · Analyse '+new Date(data.analyzedAt).toLocaleString('de-AT',{timeZone:'Europe/Vienna'}):''),'small muted');
  if(!command)for(const item of data.summary||[])text('p',typeof item==='string'?item:JSON.stringify(item));
  let entries=data.matches||data.commands||[];
  if(command&&!data.matches&&!data.query){const family=command.split(',')[0];entries=entries.filter(c=>String(c.pattern||'').split(/[<,]/)[0]===family||String(c.pattern||'')===command);}
  if(command&&!entries.length)text('p','Für diesen konkreten UI-Bezug ist noch keine eindeutige Zuordnung hinterlegt. Wir prüfen ihn im vollständigen Programmkontext.','muted');
  for(const c of entries){
    const card=document.createElement('article');card.className='context-card';
    const add=(tag,value)=>{if(value==null)return;const el=document.createElement(tag);el.textContent=typeof value==='string'?value:JSON.stringify(value);card.append(el);};
    add('h3',c.label||c.pattern);add('p',c.purpose);
    if(c.handler)add('p','Verarbeitung: '+(Array.isArray(c.handler)?c.handler.join(' · '):c.handler));
    for(const [label,items] of [['Bedingungen',c.guards],['Wirkung und Grenzen',c.effects]])if(items?.length){add('strong',label);const ul=document.createElement('ul');for(const item of items){const li=document.createElement('li');li.textContent=typeof item==='string'?item:JSON.stringify(item);ul.append(li);}card.append(ul);}
    if(c.references?.length){const refs=document.createElement('div');refs.className='source-refs';refs.textContent=c.references.map(r=>r.file+(r.line?':'+r.line:'')).join(' · ');card.append(refs);}target.append(card);
  }
  if(data.limitations?.length){const details=document.createElement('details');const title=document.createElement('summary');title.textContent='Grenzen des Kontextstands';details.append(title);for(const item of data.limitations){const p=document.createElement('p');p.textContent=item;details.append(p);}target.append(details);}
}
async function loadSelectionProgram(){
  const target=$('selectionProgram'),commands=selectedCommands();target.textContent='Programmbezug wird geladen …';
  if(model.actions.some(a=>a.type==='component'&&a.key===selected)){target.textContent='Diese Funktion ist neu erfunden. Ihre echte Programmanbindung ist noch offen; der UI-Test demonstriert ausschließlich das gewünschte Verhalten.';return;}
  if(!commands.length){target.textContent='Für diese Auswahl ist kein direkter Bedienbefehl hinterlegt. Datenquellen und mögliche Programmfolgen klären wir im Chat; der gesamte geprüfte Zusammenhang steht unter „Mehr → Programmkontext“.';return;}
  try{const command=commands[0]||'';const data=await api('/draft/context'+(command?'?command='+encodeURIComponent(command):''));contextCards(target,data,command);if(commands.length>1){const p=document.createElement('p');p.className='muted small';p.textContent='Dieser Bereich enthält weitere Befehle: '+commands.slice(1).join(', ')+'. Für deren Details die jeweilige Schaltfläche auswählen.';target.append(p);}}
  catch{target.textContent='Der gespeicherte Programmkontext ist gerade nicht erreichbar.';}
}
function loadStateStyleEditor(){
  const el=nodeFor(selected);if(!el||!window.SimpleAIHMIStateStyles)return;
  const key=selected,existing=[...model.actions].reverse().find(a=>a.type==='state-style'&&a.key===key);
  const control=el.matches('input,select')?el:el.querySelector('input,select');
  const recipe=existing?.recipe||{mode:control?.matches('select')?'options':'binary',target:'background',valueSource:control?'element':projectAdapter.stateValueHints?.[key]||'manual',offColor:'#cc4249',onColor:'#16835e',manualValue:'0'};
  window.SimpleAIHMIStateStyles.renderEditor($('stateStyleEditor'),recipe,{element:el,sources:[{value:'element',label:'Wert des Bedienelements'},{value:'manual',label:'Freier Beispielwert'},...(projectAdapter.previewControls||[]).map(c=>({value:c.key,label:c.label+' (Testdaten)'}))],
    onPreview:(value,previewRecipe)=>{testOverrides.set(key,{value,recipe:previewRecipe});renderFrame();},
    onApply:next=>{testOverrides.delete(key);addAction({type:'state-style',key,recipe:next,anchor:anchorFor(el)},'Zustandsfarben im Entwurf geändert');}
  });
}
async function loadProgram(){try{contextCards($('programOverview'),await api('/draft/context'));}catch{$('programOverview').textContent='Programmkontext momentan nicht erreichbar.';}}
function positionNote(){
  if($('commentEditor').hidden||!$('commentEditor').classList.contains('anchored-note')||$('commentEditor').classList.contains('expanded-note'))return;
  const el=commentAnchor?.key?nodeFor(commentAnchor.key):null;if(!el)return;
  const rect=el.getBoundingClientRect(),fr=frame.getBoundingClientRect(),scale=fr.width/frame.clientWidth;
  const x=fr.left+(rect.left+rect.width*(commentAnchor.x??.95))*scale;
  const y=fr.top+(rect.top+rect.height*(commentAnchor.y??.1))*scale;
  const box=$('commentEditor'),width=Math.min(370,innerWidth-24),height=Math.min(box.offsetHeight||470,innerHeight*.75);
  const left=x+width+24<innerWidth?x+16:Math.max(12,x-width-16);
  const top=Math.min(Math.max($('chrome').getBoundingClientRect().bottom+10,y-30),Math.max(12,innerHeight-height-18));
  box.style.left=Math.max(12,Math.min(innerWidth-width-12,left))+'px';box.style.top=top+'px';
}
function openComment(anchor=null,existing=null){
  if(!$('commentEditor').hidden&&noteChanged())$('saveComment').click();
  focusedComment=existing?.id||null;commentAnchor=anchor;commentPage=existing?effectiveCommentPage(existing):currentPage;$('commentText').value=existing?.text||'';$('commentImportant').checked=!!existing?.important;$('commentKind').value=existing?.kind||'Idee';
  $('commentAnchor').textContent=pageName(commentPage)+(anchor?.label?' · '+anchor.label:' · Ganze Seite');
  $('commentEditorTitle').textContent=existing?'Notiz '+existing.number:'Neue Notiz';
  $('deleteComment').hidden=!existing;
  $('commentEditor').classList.toggle('anchored-note',!!anchor);$('commentEditor').classList.remove('expanded-note');$('expandNote').textContent='Mehr Platz';
  $('commentEditor').querySelector('[role=dialog]').setAttribute('aria-modal',String(!anchor));
  $('commentEditor').hidden=false;requestAnimationFrame(positionNote);setTimeout(()=>$('commentText').focus(),50);
}
function deleteComment(id){
  if(original){toast('Wechsle zuerst zurück zum Entwurf.');return;}
  const comment=model.comments.find(c=>c.id===id);
  if(!comment)return;
  if(focusedComment===id){
    if(noteChanged())$('saveComment').click();
    $('commentEditor').hidden=true;focusedComment=null;
  }
  if(noteDraft?.commentId===id)noteDraft=null;
  replyDrafts.delete(id);
  change(m=>{m.comments=m.comments.filter(c=>c.id!==id);},'Notiz gelöscht');
  persistTransient();
  toast('Notiz gelöscht. Mit „Zurück“ kannst du sie wiederherstellen.');
  $('commentsButton').focus();
}
function renderPins(){
  let layer=doc.getElementById('draft-note-layer');
  if(!layer){layer=doc.createElement('div');layer.id='draft-note-layer';layer.dataset.draftDecoration='pins';doc.body.append(layer);}
  layer.replaceChildren();if(original)return;
  for(const c of model.comments.filter(c=>effectiveCommentPage(c)===currentPage&&c.status!=='erledigt')){
    let el=c.anchor?.key?nodeFor(c.anchor.key):null;
    if(!el)el=doc.querySelector('section[data-page]:not([hidden]) h1');
    if(!el||!el.getClientRects().length)continue;
    const rect=el.getBoundingClientRect();const pin=doc.createElement('button');pin.className='draft-note-pin';pin.dataset.draftDecoration='pin';
    pin.textContent=c.number;pin.title=c.text.slice(0,220)+(c.text.length>220?' …':'');pin.setAttribute('aria-label','Kommentar '+c.number+': '+c.text.slice(0,80));
    pin.style.left=(rect.left+win.scrollX+rect.width*(c.anchor?.x??.95))+'px';pin.style.top=(rect.top+win.scrollY+rect.height*(c.anchor?.y??0))+'px';
    pin.onclick=e=>{e.preventDefault();e.stopPropagation();openComment(c.anchor,c);};layer.append(pin);
    if(c.anchor?.rectangle){
      const r=c.anchor.rectangle;const box=doc.createElement('div');box.className='draft-comment-area';box.dataset.draftDecoration='rectangle';
      Object.assign(box.style,{left:(rect.left+win.scrollX+r.x*rect.width)+'px',top:(rect.top+win.scrollY+r.y*rect.height)+'px',width:(r.width*rect.width)+'px',height:(r.height*rect.height)+'px'});layer.append(box);
    }
  }
}
function effectiveCommentPage(comment){
  return (comment.anchor?.key?nodeFor(comment.anchor.key)?.closest('section[data-page]')?.dataset.page:null)||comment.page;
}
function renderComments(){
  if(!model)return;const list=$('commentList');
  let activeReply=null,replyCursor=null;
  for(const area of list.querySelectorAll('.reply-editor')){
    const id=area.closest('.comment-card')?.dataset.commentId;
    if(id){if(area.value&&model.comments.some(c=>c.id===id))replyDrafts.set(id,area.value);else replyDrafts.delete(id);}
    if(area===document.activeElement){activeReply=id;replyCursor=[area.selectionStart,area.selectionEnd];}
  }
  list.replaceChildren();
  const visible=model.comments.filter(c=>($('allComments').checked||effectiveCommentPage(c)===currentPage)&&($('commentFilter').value==='all'||c.status===$('commentFilter').value));
  if(!visible.length){const p=document.createElement('p');p.className='empty';p.textContent='Noch Platz für deine Ideen. Klicke in die HMI oder kommentiere die ganze Seite.';list.append(p);return;}
  for(const c of visible){
    const card=document.createElement('article');card.className='comment-card';card.id='note-'+c.id;card.dataset.commentId=c.id;
    const meta=document.createElement('div');meta.className='comment-meta';
    for(const [text,cls] of [[String(c.number),'comment-tag'],[pageName(effectiveCommentPage(c)),''],[c.kind,'comment-tag'],...(c.important?[['Wichtig','comment-tag important']]:[])]){const t=document.createElement('span');t.className=cls;t.textContent=text;meta.append(t);}card.append(meta);
    if(c.anchor){const link=document.createElement('button');link.className='anchor-link';link.textContent=c.anchor.label||'Markierter Bereich';link.onclick=()=>{setCurrentPage(effectiveCommentPage(c));const el=nodeFor(c.anchor.key);el?.scrollIntoView({block:'center',behavior:'smooth'});if(el){el.classList.add('draft-flash');setTimeout(()=>el.classList.remove('draft-flash'),1600);}};card.append(link);}
    const text=document.createElement('p');text.textContent=c.text;card.append(text);
    if(c.impact?.explanation){
      const impact=document.createElement('div');impact.className='reply';
      const title=document.createElement('b');title.textContent='Auswirkung: '+({darstellung:'Darstellung',bedienablauf:'Bedienablauf',programmlogik:'Programmlogik',ungeprüft:'Noch zu prüfen'}[c.impact.classification]||c.impact.classification);
      const explanation=document.createElement('p');explanation.textContent=c.impact.explanation;impact.append(title,explanation);
      if(c.impact.confirmed){const note=document.createElement('p');note.textContent='Bestätigt und für die spätere Implementierung vorgemerkt.';impact.append(note);}
      else if(c.impact.requiresConfirmation){const confirm=document.createElement('button');confirm.textContent='Zusatzanforderung bestätigen';confirm.onclick=()=>change(m=>{const x=m.comments.find(x=>x.id===c.id);x.impact.confirmed=true;x.impact.confirmedAt=new Date().toISOString();x.impact.confirmationSource='Nutzerbestätigung in HMI-Draft';},'Zusatzanforderung vorgemerkt – kein Programmier-GO');impact.append(confirm);}
      card.append(impact);
    }
    for(const reply of c.replies){const p=document.createElement('p');p.className='reply';p.textContent=reply.text;card.append(p);}
    const statusSelect=document.createElement('select');statusSelect.setAttribute('aria-label','Status von Kommentar '+c.number);
    for(const [value,label] of [['offen','Offen'],['im-entwurf','Im Entwurf berücksichtigt'],['erledigt','Besprochen / erledigt']])statusSelect.append(new Option(label,value));statusSelect.value=c.status;
    statusSelect.onchange=()=>change(m=>m.comments.find(x=>x.id===c.id).status=statusSelect.value,'Kommentarstatus gespeichert');card.append(statusSelect);
    const row=document.createElement('div');row.className='button-row';
    const replyButton=document.createElement('button');replyButton.textContent='Antworten';const showReply=()=>{
      if(card.querySelector('.reply-editor'))return;
      const area=document.createElement('textarea');area.className='reply-editor';area.placeholder='Antwort oder Ergänzung';area.setAttribute('aria-label','Antwort auf Kommentar '+c.number);
      area.value=replyDrafts.get(c.id)||'';area.oninput=()=>{replyDrafts.set(c.id,area.value);persistTransient();};
      const save=document.createElement('button');save.className='primary';save.textContent='Antwort speichern';save.onclick=()=>{const value=area.value.trim();if(!value)return;area.value='';replyDrafts.delete(c.id);persistTransient();change(m=>m.comments.find(x=>x.id===c.id).replies.push({text:value,at:new Date().toISOString()}),'Antwort gespeichert');};
      card.append(area,save);return area;
    };replyButton.onclick=()=>showReply()?.focus();
    const edit=document.createElement('button');edit.textContent='Bearbeiten';edit.onclick=()=>{
      setCurrentPage(effectiveCommentPage(c));openComment(c.anchor,c);
    };
    const remove=document.createElement('button');remove.textContent='Notiz löschen';remove.className='delete-note';
    remove.setAttribute('aria-label','Notiz '+c.number+' löschen');remove.onclick=()=>deleteComment(c.id);
    row.append(replyButton,edit,remove);card.append(row);list.append(card);
    if(replyDrafts.has(c.id)){const area=showReply();if(activeReply===c.id)requestAnimationFrame(()=>{area?.focus();if(area&&replyCursor)area.setSelectionRange(...replyCursor);});}
  }
  if(focusedComment){requestAnimationFrame(()=>$('note-'+focusedComment)?.scrollIntoView({block:'nearest',behavior:'smooth'}));}
}
function renderPages(){
  if(!model)return;const list=$('pageList');list.replaceChildren();
  model.pages.forEach((p,index)=>{
    const row=document.createElement('div');row.className='page-row';
    const input=document.createElement('input');input.value=p.name;input.setAttribute('aria-label','Seite '+p.name+' umbenennen');
    input.onchange=()=>{const value=input.value.trim();if(!value)return;change(m=>{m.pages[index].name=value;m.pages[index].title=value;},'Seite umbenannt');};
    const actions=document.createElement('div');actions.className='page-actions';
    for(const [delta,symbol,label] of [[-1,'↑','Seite nach oben'],[1,'↓','Seite nach unten']]){
      const b=document.createElement('button');b.textContent=symbol;b.setAttribute('aria-label',label+' · '+p.name);b.disabled=index+delta<0||index+delta>=model.pages.length;
      b.onclick=()=>change(m=>{const item=m.pages.splice(index,1)[0];m.pages.splice(index+delta,0,item);},'Seitenreihenfolge geändert');actions.append(b);
    }
    const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=p.visible;check.disabled=p.visible&&model.pages.filter(x=>x.visible).length===1;
    check.onchange=()=>change(m=>m.pages[index].visible=check.checked,check.checked?'Seite wieder eingeblendet':'Seite ausgeblendet',{reload:true});label.append(check,document.createTextNode('Sichtbar'));
    row.append(input,actions,label);list.append(row);
  });
}
function renderChanges(){
  $('changeCount').textContent=model.actions.length;
  const list=$('changeList');list.replaceChildren();
  if(!model.actions.length){const p=document.createElement('p');p.className='empty';p.textContent='Noch keine Gestaltungsschritte. Probiere im Bearbeiten-Modus etwas aus.';list.append(p);return;}
  for(const action of model.actions){
    const card=document.createElement('article');card.className='comment-card';
    const title=document.createElement('b');title.textContent=action.description||action.type;card.append(title);
    if(action.anchor?.label){const p=document.createElement('p');p.className='muted';p.textContent=action.anchor.label;card.append(p);}
    if(action.type==='text'){const p=document.createElement('p');p.textContent='Neue Bezeichnung: '+action.value;card.append(p);}
    if(action.page){const p=document.createElement('p');p.textContent='Zielseite: '+pageName(action.page);card.append(p);}
    if(action.requiresBinding){const p=document.createElement('p');p.className='reply';p.textContent='Neue Funktion / Layout-Kopie: Die echte Programmanbindung ist noch offen und wird separat geprüft.';card.append(p);}
    if(action.impact){const p=document.createElement('p');p.className='impact-note';p.textContent='Programmfolge prüfen: '+action.impact.explanation;card.append(p);}
    const remove=document.createElement('button');remove.textContent='Diesen Schritt entfernen';remove.onclick=()=>change(m=>{m.actions=m.actions.filter(a=>a.id!==action.id&&!(action.type==='duplicate'&&a.key.startsWith('copy:'+action.id)));},'Gestaltungsschritt entfernt',{reload:true});card.append(remove);list.append(card);
  }
}
function frameEvents(){
  doc.addEventListener('click',event=>{
    if(event.target.closest('[data-draft-decoration]'))return;
    const navigation=event.target.closest('[data-nav]');
    if(navigation&&(mode==='view'||mode==='test'||original)){currentPage=navigation.dataset.nav;$('pageSelect').value=currentPage;renderComments();}
    if((mode==='edit'||mode==='comment')&&!original){event.preventDefault();event.stopImmediatePropagation();return;}
    if(mode==='test'){
      const unbound=event.target.closest('[data-draft-unbound]');
      if(unbound){event.preventDefault();event.stopImmediatePropagation();const command=event.target.closest('[data-cmd]')?.dataset.cmd;$('testResult').textContent='Layout-Kopie: '+(command?'würde '+command+' anfordern. ':'')+'Programmbindung ist noch offen.';toast('Layout-Kopie: Programmanbindung muss erst geprüft werden.');}
      return;
    }
    const button=event.target.closest('button');
    if(button&&!button.dataset.nav&&!['older','refreshLog','showPassword','netread'].includes(button.id)){
      event.preventDefault();event.stopImmediatePropagation();toast('Zum Ausprobieren „UI-Test“ einschalten. In der Kopie wird kein Maschinenbefehl ausgeführt.');
    }
  },true);
  doc.addEventListener('submit',event=>{if(mode==='test')return;event.preventDefault();event.stopImmediatePropagation();toast('Einstellungen der OPTA werden im Entwurf nicht geschrieben.');},true);
  doc.addEventListener('change',()=>{if(mode==='test')renderFrame();},true);
  doc.addEventListener('pointerdown',event=>{
    if(event.button!==0||original||event.target.closest('[data-draft-decoration]'))return;
    if(mode==='edit')selectElement(event.target.closest('input,select,textarea,button,h1,h2,h3,p,small,strong,label,span,th,td')||event.target);
    if(mode==='comment'){
      event.preventDefault();pointerStart={x:event.clientX,y:event.clientY,target:event.target};
      doc.documentElement.setPointerCapture?.(event.pointerId);
    }
  },true);
  doc.addEventListener('pointermove',event=>{
    if(mode!=='comment'||!pointerStart)return;
    const start=pointerStart;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)<8)return;
    let box=doc.getElementById('draft-drawing-area');
    if(!box){box=doc.createElement('div');box.id='draft-drawing-area';box.className='draft-comment-area';box.dataset.draftDecoration='drawing';doc.body.append(box);}
    Object.assign(box.style,{left:(Math.min(start.x,event.clientX)+win.scrollX)+'px',top:(Math.min(start.y,event.clientY)+win.scrollY)+'px',width:Math.abs(event.clientX-start.x)+'px',height:Math.abs(event.clientY-start.y)+'px',zIndex:'99999'});
  },true);
  doc.addEventListener('pointerup',event=>{
    if(mode!=='comment'||!pointerStart)return;
    const start=pointerStart;pointerStart=null;doc.getElementById('draft-drawing-area')?.remove();
    const distance=Math.hypot(event.clientX-start.x,event.clientY-start.y);
    const target=distance>10?blockFor(start.target):start.target.closest('button,h1,h2,h3,p,small,strong,label,span,th,td')||start.target;
    const anchor=anchorFor(target,{x:start.x,y:start.y});
    if(distance>10){const r=target.getBoundingClientRect();anchor.rectangle={x:(Math.min(start.x,event.clientX)-r.left)/Math.max(1,r.width),y:(Math.min(start.y,event.clientY)-r.top)/Math.max(1,r.height),width:Math.abs(event.clientX-start.x)/Math.max(1,r.width),height:Math.abs(event.clientY-start.y)/Math.max(1,r.height)};}
    focusedComment=null;openComment(anchor);
  },true);
  doc.addEventListener('dragstart',event=>{
    if(mode!=='edit'||original)return event.preventDefault();
    const block=blockFor(event.target);dragKey=keyFor(block);event.dataTransfer.setData('text/plain',dragKey);event.dataTransfer.effectAllowed='move';event.stopPropagation();selectElement(block);$('inspector').hidden=true;
  },true);
  doc.addEventListener('dragover',event=>{
    if(mode!=='edit'||!dragKey)return;event.preventDefault();event.dataTransfer.dropEffect='move';
    doc.querySelectorAll('.draft-drop').forEach(x=>x.classList.remove('draft-drop'));
    const target=blockFor(event.target);if(target&&keyFor(target)!==dragKey)target.classList.add('draft-drop');
  });
  doc.addEventListener('drop',event=>{
    if(mode!=='edit'||!dragKey)return;event.preventDefault();event.stopImmediatePropagation();
    doc.querySelectorAll('.draft-drop').forEach(x=>x.classList.remove('draft-drop'));
    const el=nodeFor(dragKey),target=blockFor(event.target);dragKey=null;
    if(!el||!target||el===target||el.contains(target))return;
    const r=target.getBoundingClientRect();let before=event.clientY>r.top+r.height/2?target.nextElementSibling:target;
    if(before===el)before=el.nextElementSibling;
    addAction({type:'move',key:keyFor(el),parent:keyFor(target.parentElement),before:before?keyFor(before):null},'Bereich verschoben');
  });
  doc.addEventListener('dragend',()=>{dragKey=null;doc.querySelectorAll('.draft-drop').forEach(x=>x.classList.remove('draft-drop'));const el=nodeFor(selected);if(el&&mode==='edit')selectElement(el);});
  win.addEventListener('scroll',()=>{renderFrame();positionNote();},{passive:true});
  doc.addEventListener('keydown',keyboard,true);
}
frame.addEventListener('load',()=>{
  doc=frame.contentDocument;win=frame.contentWindow;nodes=new Map();
  const navigateName=projectAdapter.sourceContract?.showPageFunction;
  const nativeNavigate=navigateName&&win[navigateName];
  if(typeof nativeNavigate==='function'){
    const frameWindow=win;
    frameWindow[navigateName]=function(page,...args){
      if(page!==currentPage&&!original&&(mode==='edit'||mode==='comment')){
        // A native redirect must not displace an open annotation or a selected element.
        const {scrollX,scrollY}=frameWindow;
        frameWindow.queueMicrotask(()=>{
          if(frameWindow.scrollX!==scrollX||frameWindow.scrollY!==scrollY)frameWindow.scrollTo(scrollX,scrollY);
        });
        return;
      }
      const result=nativeNavigate.call(this,page,...args);
      const visible=frameWindow.document.querySelector(projectAdapter.sourceContract.pageSelector+':not([hidden])');
      if(visible?.dataset.page===page&&page!==currentPage){
        currentPage=page;$('pageSelect').value=page;renderComments();
      }
      return result;
    };
  }
  const componentStyle=doc.createElement('link');componentStyle.rel='stylesheet';componentStyle.href='/components.css';doc.head.append(componentStyle);
  const nativeFetch=win.fetch?.bind(win);
  if(nativeFetch)win.fetch=async(input,options)=>{
    const response=await nativeFetch(input,options),url=String(input);
    if(url.includes('/api/status'))response.clone().json().then(data=>{testContext={...testContext,...data};renderFrame();}).catch(()=>{});
    if(url.includes('/api/cmd')&&mode==='test'){
      const command=String(options?.body||'').split(',').slice(4).join(',');
      $('testResult').textContent='Lokaler Testbefehl: '+(command.startsWith('network,')?'network · Werte ausgeblendet':command.slice(0,200));
    }
    return response;
  };
  const style=doc.createElement('style');style.textContent=`
    html[data-draft-mode=comment] body,html[data-draft-mode=comment] button{cursor:crosshair!important}
    html[data-draft-mode=edit] [data-draft-block="1"]{cursor:grab;position:relative}
    html[data-draft-mode=edit] [data-draft-block="1"]:hover{outline:2px dashed #48a8c9;outline-offset:3px}
    html[data-draft-mode=edit] button,html[data-draft-mode=edit] h1,html[data-draft-mode=edit] h2,html[data-draft-mode=edit] label{cursor:crosshair!important}
    .draft-selected{outline:3px solid #187bac!important;outline-offset:4px;box-shadow:0 0 0 8px #2193bd15!important}
    .draft-drop{outline:4px dashed #1bb18c!important;outline-offset:5px;background-color:#e1faf2!important}
    .draft-hidden{display:none!important}
    .draft-width-full{grid-column:1/-1!important;width:100%!important}
    .draft-width-half{grid-column:span 1!important;width:calc(50% - 12px);display:inline-block!important;vertical-align:top;margin-right:8px}
    .draft-width-third{grid-column:span 1!important;width:calc(33.333% - 12px);display:inline-block!important;vertical-align:top;margin-right:8px}
    .grid>.draft-width-half,.grid>.draft-width-third,.quick-grid>.draft-width-half,.quick-grid>.draft-width-third{width:100%;margin-right:0}
    #draft-note-layer{position:absolute;top:0;left:0;width:100%;height:0;pointer-events:none;z-index:99999}
    .draft-note-pin{position:absolute;transform:translate(-50%,-50%);width:30px!important;height:30px!important;min-height:0!important;padding:0!important;border-radius:50%!important;background:#efb63f!important;color:#173147!important;border:2px solid white!important;box-shadow:0 3px 8px #14324944;pointer-events:auto;font:700 13px system-ui!important;z-index:2}
    .draft-comment-area{position:absolute;border:2px dashed #d19720;background:#f4c65b1c;border-radius:6px;pointer-events:none}
    .draft-empty{padding:40px;border:2px dashed #b7d1e1;color:#526d80;border-radius:12px;text-align:center;margin-top:20px;font:16px system-ui}
    .draft-flash{outline:4px solid #efb63f!important;outline-offset:5px}
    .draft-native-duplicate{border:2px dashed #8651bc!important;position:relative}.draft-native-duplicate>.shc-badge{display:block;margin-bottom:10px}
    @media(max-width:600px){.draft-width-half,.draft-width-third{width:100%!important;margin-right:0}}
  `;doc.head.append(style);registerNodes();observer=new MutationObserver(()=>renderFrame());frameEvents();
  applyModel();if(win.showPage)win.showPage(currentPage);renderFrame();
  if(restoreNoteOnLoad){restoreNoteOnLoad=false;requestAnimationFrame(resumeNote);}
});
function undo(){
  captureComponentInput();componentEditorView=null;componentEditorKey=null;
  if(!undoStack.length)return;redoStack.push(clone(model));model=undoStack.pop();renderShell();reloadFrame();persist('Letzte Änderung zurückgenommen');
}
function redo(){if(!redoStack.length)return;captureComponentInput();componentEditorView=null;componentEditorKey=null;undoStack.push(clone(model));model=redoStack.pop();renderShell();reloadFrame();persist('Änderung wiederhergestellt');}
function keyboard(event){
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openNavigator();return;}
  const dialog=!$('navigatorDialog').hidden?$('navigatorDialog'):!$('componentDialog').hidden?$('componentDialog'):!$('commentEditor').hidden&&(!$('commentEditor').classList.contains('anchored-note')||$('commentEditor').classList.contains('expanded-note'))?$('commentEditor'):!$('welcome').hidden?$('welcome'):null;
  if(dialog&&event.key==='Tab'){
    const focusable=Array.from(dialog.querySelectorAll('button,input,select,textarea')).filter(el=>!el.disabled);
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  if(event.key==='Escape'){
    if(!$('navigatorDialog').hidden){$('navigatorDialog').hidden=true;return;}
    if(!$('componentDialog').hidden){$('componentDialog').hidden=true;return;}
    if(!$('commentEditor').hidden){$('cancelComment').click();return;}
    closeDrawers();$('moreMenu').hidden=true;$('moreButton').setAttribute('aria-expanded','false');return;
  }
  const target=event.target;if(target?.closest?.('input,textarea,select,[contenteditable=true]'))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}
}
document.addEventListener('keydown',keyboard);
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{$(b.dataset.close).hidden=true;if(drawerButtons[b.dataset.close])$(drawerButtons[b.dataset.close]).setAttribute('aria-expanded','false');});
$('pageSelect').onchange=()=>setCurrentPage($('pageSelect').value);
$('viewport').onchange=()=>{localStorage.setItem('hmi-draft-viewport',$('viewport').value);resizeCanvas();};
$('zoom').onchange=resizeCanvas;window.addEventListener('resize',resizeCanvas);
$('pagesButton').onclick=()=>toggleDrawer('pages');
$('commentsButton').onclick=()=>{renderComments();toggleDrawer('comments');};
$('changesButton').onclick=()=>toggleDrawer('changes');
$('allComments').onchange=renderComments;$('commentFilter').onchange=renderComments;
$('pageComment').onclick=()=>{focusedComment=null;openComment();};
$('resumeNote').onclick=resumeNote;
$('programBinding').ontoggle=()=>{if($('programBinding').open)loadSelectionProgram();};
$('stateStylePanel').ontoggle=()=>{if($('stateStylePanel').open)loadStateStyleEditor();};
$('componentEditor').addEventListener('input',captureComponentInput);
$('componentEditor').addEventListener('change',captureComponentInput);
$('componentEditor').addEventListener('click',captureComponentInput);
$('resumeComponent').onclick=()=>{
  const key=componentDrafts.keys().next().value,action=model.actions.find(a=>a.type==='component'&&a.key===key);
  if(!action){componentDrafts.delete(key);persistTransient();return;}
  setMode('edit');setCurrentPage(action.page);const el=nodeFor(key);if(el)selectElement(el);
};
$('discardComponentDraft').onclick=()=>{const key=componentEditorKey;componentEditorView=null;componentEditorKey=null;componentDrafts.delete(key);persistTransient();const el=nodeFor(key);if(el)selectElement(el);};
$('findElement').onclick=openNavigator;
$('closeNavigator').onclick=()=>{$('navigatorDialog').hidden=true;$('moreButton').focus();};
$('commentText').oninput=captureNoteInput;$('commentKind').onchange=captureNoteInput;$('commentImportant').onchange=captureNoteInput;
$('cancelComment').onclick=()=>{if($('commentText').value.trim())$('saveComment').click();else{$('commentEditor').hidden=true;focusedComment=null;}};
$('deleteComment').onclick=()=>deleteComment(focusedComment);
$('expandNote').onclick=()=>{const expanded=$('commentEditor').classList.toggle('expanded-note');$('expandNote').textContent=expanded?'Wieder anheften':'Mehr Platz';$('commentEditor').querySelector('[role=dialog]').setAttribute('aria-modal',String(expanded||!commentAnchor));if(!expanded)positionNote();};
$('noteThread').onclick=()=>{if($('commentText').value.trim())$('saveComment').click();else $('commentEditor').hidden=true;drawer('comments');};
$('saveComment').onclick=()=>{
  const text=$('commentText').value.trim();if(!text){$('commentText').focus();return;}
  const editing=focusedComment&&model.comments.find(c=>c.id===focusedComment);
  if(editing&&editing.text===text&&editing.kind===$('commentKind').value&&!!editing.important===$('commentImportant').checked){$('commentEditor').hidden=true;focusedComment=null;noteDraft=null;persistTransient();return;}
  if(editing)change(m=>{const c=m.comments.find(x=>x.id===editing.id);c.text=text;c.kind=$('commentKind').value;c.important=$('commentImportant').checked;},'Kommentar aktualisiert');
  else change(m=>{const number=Math.max(0,...m.comments.map(c=>c.number))+1;m.comments.push({id:'note-'+Date.now().toString(36),number,page:commentPage||currentPage,sourcePage:commentPage||currentPage,anchor:commentAnchor,text,kind:$('commentKind').value,important:$('commentImportant').checked,status:'offen',replies:[],impact:{classification:'ungeprüft',explanation:'',requiresConfirmation:false,confirmed:false,implementationNote:''},createdAt:new Date().toISOString()});},'Kommentar gespeichert');
  $('commentEditor').hidden=true;focusedComment=null;noteDraft=null;persistTransient();if(!commentAnchor)drawer('comments');
};
window.addEventListener('scroll',positionNote,{passive:true});window.addEventListener('resize',positionNote);
$('selectBlock').onclick=()=>{const el=nodeFor(selected);if(el)selectElement(blockFor(el));};
$('applyText').onclick=()=>{const el=nodeFor(selected);if(!el||!isEditableText(el))return;addAction({type:'text',key:selected,value:$('elementText').value,anchor:anchorFor(el)},'Bezeichnung geändert');};
$('elementText').onkeydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter')$('applyText').click();};
function moveStep(delta){
  const el=blockFor(nodeFor(selected));if(!el)return;let sibling=delta<0?el.previousElementSibling:el.nextElementSibling;
  if(!sibling||sibling.tagName==='H1'||sibling.classList.contains('kicker'))return toast('Hier ist keine weitere Position. Ziehe den Bereich oder verschiebe ihn auf eine Seite.');
  const before=delta<0?sibling:sibling.nextElementSibling;
  addAction({type:'move',key:keyFor(el),parent:keyFor(el.parentElement),before:before?keyFor(before):null},delta<0?'Bereich nach oben verschoben':'Bereich nach unten verschoben');selectElement(el);
}
$('moveUp').onclick=()=>moveStep(-1);$('moveDown').onclick=()=>moveStep(1);
$('movePage').onclick=()=>{const el=blockFor(nodeFor(selected));if(!el)return;const target=$('targetPage').value;addAction({type:'move',key:keyFor(el),page:target,before:null,anchor:anchorFor(el)},'Bereich auf „'+pageName(target)+'“ verschoben');setCurrentPage(target);selectElement(el);};
$('elementWidth').onchange=()=>{const el=blockFor(nodeFor(selected));if(el)addAction({type:'style',key:keyFor(el),width:$('elementWidth').value},'Bereichsbreite geändert');};
$('hideElement').onclick=()=>{const el=nodeFor(selected);if(el)addAction({type:'hide',key:selected,anchor:anchorFor(el)},'Element ausgeblendet – mit Zurück wiederherstellbar');$('inspector').hidden=true;};
$('duplicate').onclick=()=>{const el=blockFor(nodeFor(selected));if(!el)return;const component=model.actions.find(a=>a.type==='component'&&a.key===keyFor(el));if(component){const key='component:copy-'+Date.now().toString(36);addAction({type:'component',key,page:el.closest('section[data-page]')?.dataset.page||currentPage,config:clone(component.config),requiresBinding:true},'Neuen Funktionsentwurf dupliziert');}else addAction({type:'duplicate',key:keyFor(el),requiresBinding:true,anchor:anchorFor(el)},'Bereich als Layout-Kopie dupliziert');};
$('commentSelection').onclick=()=>{const el=nodeFor(selected);if(el){focusedComment=null;openComment(anchorFor(el));}};
$('addPage').onclick=()=>{const name=$('newPageName').value.trim();if(!name)return;const id='draft-page-'+Date.now().toString(36);change(m=>m.pages.push({id,name,title:name,visible:true}),'Neue Seite angelegt');$('newPageName').value='';setCurrentPage(id);};
$('addComponent').onclick=()=>{
  const palette=$('componentPalette');palette.replaceChildren();
  const labels={button:'Schaltfläche',iconbutton:'Icon-Schaltfläche',toggle:'0/1-Schalter',dropdown:'Auswahlliste',indicator:'Zustandsanzeige'};
  for(const config of window.SimpleAIHMIComponents.templates){const button=document.createElement('button');button.textContent=labels[config.type];button.onclick=()=>{
    const id='component-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,5),key='component:'+id;
    addAction({type:'component',key,page:currentPage,config,requiresBinding:true},'Neues Element: '+labels[config.type]);$('componentDialog').hidden=true;
    requestAnimationFrame(()=>{const el=nodeFor(key);if(el){el.scrollIntoView({block:'center',behavior:'smooth'});selectElement(el);}});
  };palette.append(button);} $('componentDialog').hidden=false;palette.querySelector('button')?.focus();
};
$('closeComponentDialog').onclick=()=>$('componentDialog').hidden=true;
function updateTestControls(){
  for(const control of $('testSignals').querySelectorAll('[data-test-key]')){const value=Number(!!testContext[control.dataset.testKey]);control.value=String(value);control.setAttribute('aria-pressed',String(!!value));}
}
function initializeTestTools(){
  $('testScene').replaceChildren();for(const scene of projectAdapter.previewScenes||[])$('testScene').append(new Option(scene.label,scene.value));
  $('testSignals').replaceChildren();
  for(const signal of projectAdapter.previewControls||[]){const label=document.createElement('label');label.textContent=signal.label+' ';const select=document.createElement('select');select.dataset.testKey=signal.key;select.setAttribute('aria-label',signal.label+' im UI-Test');select.append(new Option(signal.off,'0'),new Option(signal.on,'1'));
    select.onchange=async()=>{try{testContext=await api('/draft/preview',{values:{[signal.key]:Number(select.value)}});renderFrame();}catch(e){toast(e.message);}};label.append(select);$('testSignals').append(label);}
  updateTestControls();
}
$('testScene').onchange=async()=>{try{testContext=await api('/draft/preview',{scene:$('testScene').value});updateTestControls();renderFrame();}catch(e){toast(e.message);}};
$('resetTest').onclick=async()=>{try{testContext=await api('/draft/preview',{reset:true});testOverrides.clear();for(const el of nodes.values())el.simpleAIHMI?.reset();updateTestControls();renderFrame();$('testResult').textContent='UI-Test zurückgesetzt · ohne echten Ablauf';}catch(e){toast(e.message);}};
$('undo').onclick=undo;$('redo').onclick=redo;
$('compare').onclick=()=>{
  original=!original;$('compare').setAttribute('aria-pressed',String(original));$('compare').textContent=original?'Zurück zum Entwurf':'Original ansehen';
  if(original){setMode('view');$('modeHint').textContent='Original des gesicherten Ausgangsstands. Deine Änderungen bleiben im Entwurf erhalten.';
    if(currentPage.startsWith('draft-page-'))currentPage=projectAdapter.defaultPages[0];}
  else $('modeHint').textContent=modes.view;
  renderShell();reloadFrame();
};
$('snapshot').onclick=async()=>{if(!await ensureSaved())return;try{const data=await api('/draft/snapshot',{});toast('Arbeitsstand '+data.name+' separat gesichert');}catch(e){toast(e.message);}};
$('moreButton').onclick=()=>{$('moreMenu').hidden=!$('moreMenu').hidden;$('moreButton').setAttribute('aria-expanded',String(!$('moreMenu').hidden));};
$('exportJson').onclick=async()=>{if(!await ensureSaved())return;window.location.href='/draft/export';$('moreMenu').hidden=true;};
$('exportMd').onclick=async()=>{if(!await ensureSaved())return;window.location.href='/draft/export?format=md';$('moreMenu').hidden=true;};
$('helpButton').onclick=()=>{$('welcome').hidden=false;$('moreMenu').hidden=true;};
$('contextButton').onclick=()=>{drawer('program');$('moreMenu').hidden=true;$('moreButton').setAttribute('aria-expanded','false');loadProgram();};
$('checkProgram').onclick=async()=>{try{const result=await api('/draft/context/check',{});$('programFreshness').textContent=({current:'Der analysierte Quellstand stimmt mit den angeschlossenen Quellen überein.',changed:'Quellen geändert – die Zuordnung muss neu analysiert werden.',detached:'Originalquellen nicht angeschlossen; der gespeicherte Analysekontext bleibt verfügbar.',missing:'Für dieses Projekt fehlt noch eine Analyse.'}[result.state]||'Quellstandprüfung abgeschlossen.')+(result.changedFiles?.length?' '+result.changedFiles.join(', '):'');}catch(e){toast(e.message);}};
$('requestProgram').onclick=async()=>{try{await api('/draft/context/request',{selection:{page:currentPage,key:selected,commands:selectedCommands()},request:'Programmzusammenhang ganzheitlich prüfen; UI-Befehl, Handler, Zustände, Bedingungen und fachliche Auswirkungen belegen.'});toast('Analysewunsch lokal vorgemerkt. Schreib hier im Chat: „Programmkontext prüfen“.');}catch(e){toast(e.message);}};
$('startWorkshop').onclick=()=>{$('welcome').hidden=true;localStorage.setItem('hmi-draft-welcome','seen');};
$('retrySave').onclick=()=>{if(!saving)saveQueue=flushSaves();};
$('recoverExport').onclick=()=>{
  captureComponentInput();
  const blob=new Blob([JSON.stringify({model,baseline:model.baseline,transient:{note:noteDraft,replies:[...replyDrafts],components:[...componentDrafts]},source:'Lokale Wiederherstellung',at:new Date().toISOString()},null,2)],{type:'application/json'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='HMI-Draft-lokaler-Zwischenstand.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
};
$('emergencyDownload').onclick=()=>$('recoverExport').click();
$('acceptRemote').onclick=()=>{
  if(!remote)return;
  if(dirty()){
    const merged=mergeRemote(remote);
    if(merged.conflicts.length){toast('Beide Arbeitsstände bleiben erhalten. Bitte den lokalen Zwischenstand herunterladen und die Überschneidungen hier im Chat klären.');return;}
    model=merged.model;etag=remote.etag;baseModel=clone(remote.model);htmlHash=remote.htmlHash;remote=null;$('remoteNotice').hidden=true;
    renderShell();reloadFrame();persist('Arbeitsstände zusammengeführt');return;
  }
  model=remote.model;etag=remote.etag;htmlHash=remote.htmlHash;baseModel=clone(model);remote=null;undoStack=[];redoStack=[];renderShell();reloadFrame();$('remoteNotice').hidden=true;status('Neuer Arbeitsstand geladen');
};
async function poll(){
  if(saving||!model)return;
  try{
    const data=await api('/draft/state');if(data.etag===etag&&data.htmlHash===htmlHash)return;
    if(dirty()||saveError){rememberRecovery();notifyRemote(data);return;}
    const editorOpen=!$('commentEditor').hidden||componentDrafts.size||document.activeElement?.matches('textarea,input');
    if(editorOpen){notifyRemote(data);return;}
    model=data.model;etag=data.etag;htmlHash=data.htmlHash;baseModel=clone(model);renderShell();reloadFrame();status('Voransicht aktualisiert');toast('Der Arbeitsstand wurde aktualisiert.');
  }catch{status('Vorschau-Server nicht erreichbar',true);}
}
(async()=>{
  try{
    const data=await api('/draft/state');model=data.model;projectAdapter=data.adapter;etag=data.etag;htmlHash=data.htmlHash;baseModel=clone(model);currentPage=model.pages.find(p=>p.visible).id;
    try{localRecovery=JSON.parse(localStorage.getItem(recoveryKey())||'null');}catch{}
    try{const inputs=JSON.parse(localStorage.getItem(transientKey())||'null');if(inputs){noteDraft=inputs.note||null;replyDrafts=new Map(inputs.replies||[]);componentDrafts=new Map(inputs.components||[]);restoreNoteOnLoad=!!noteDraft;}}catch{}
    if(localRecovery?.model){
      const merged=window.HMIDraftState?.mergeModels(localRecovery.baseModel,localRecovery.model,data.model);
      if(merged&&!merged.conflicts.length){model=merged.model;editRevision=1;rememberRecovery();}
      else{model=localRecovery.model;baseModel=localRecovery.baseModel;etag=localRecovery.etag;editRevision=1;saveError=Error('Ein lokaler Zwischenstand ist noch abzustimmen.');recoveryStored=true;notifyRemote(data);$('retrySave').hidden=false;$('emergencyDownload').hidden=false;}
    }
    $('viewport').value=localStorage.getItem('hmi-draft-viewport')||'portrait';
    renderShell();initializeTestTools();persistTransient();resizeCanvas();reloadFrame();status(dirty()||saveError?'Im Browser gesichert · Abstimmung offen':'Lokal gespeichert',!!saveError);
    if(!localStorage.getItem('hmi-draft-welcome'))$('welcome').hidden=false;
    if(dirty()&&!saveError)saveQueue=flushSaves();
    setInterval(poll,2400);
  }catch(error){status('Start nicht möglich',true);toast(error.message);$('modeHint').textContent='Bitte HMI-Draft mit Start-HMI-Draft.cmd öffnen.';}
})();
window.addEventListener('beforeunload',event=>{captureComponentInput();const noteOpen=noteChanged();if(noteOpen)captureNoteInput();if(dirty()||saveError||noteOpen||componentDrafts.size||[...replyDrafts.values()].some(text=>text.trim())){if(dirty())rememberRecovery();persistTransient();event.preventDefault();event.returnValue='';}});
