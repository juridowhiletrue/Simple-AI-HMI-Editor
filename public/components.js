(function (root, factory) {
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document)root.SimpleAIHMIComponents=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TYPES=['button','iconbutton','toggle','dropdown','indicator'];
  const BEHAVIORS=['message','counter','value'];
  const TYPE_LABELS={button:'Schaltfläche',iconbutton:'Icon-Schaltfläche',toggle:'0/1-Schalter',dropdown:'Auswahl',indicator:'0/1-Anzeige'};
  const DEFAULT_OPTIONS=[{label:'Bereit',value:'ready',color:'#16835e'},{label:'Wartet',value:'wait',color:'#c68a16'}];
  const NAMED_COLORS={red:'#ff0000',green:'#008000',blue:'#0000ff',purple:'#800080',orange:'#ffa500',yellow:'#ffff00',black:'#000000',white:'#ffffff',gray:'#808080',grey:'#808080'};
  const copy=value=>JSON.parse(JSON.stringify(value));
  function text(value,fallback='',limit=12000){
    if(!['string','number','boolean'].includes(typeof value))return fallback;
    const result=String(value).trim();return Array.from(result).slice(0,limit).join('');
  }
  function color(value,fallback){
    if(typeof value!=='string')return fallback;
    value=value.trim().toLowerCase();if(Object.hasOwn(NAMED_COLORS,value))return NAMED_COLORS[value];
    if(/^#[0-9a-f]{3}$/.test(value))return '#'+Array.from(value.slice(1)).map(c=>c+c).join('');
    return /^#[0-9a-f]{6}$/.test(value)?value:fallback;
  }
  const bit=value=>value===true||value===1||value==='1'?1:0;
  function foreground(value){
    const luminance=hex=>{
      const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
      return .2126*c[0]+.7152*c[1]+.0722*c[2];
    };
    const l=luminance(value),ink='#15293b',inkL=luminance(ink);
    const white=1.05/(l+.05),dark=(l+.05)/(inkL+.05);
    return white>=dark?'#ffffff':ink;
  }
  function normalizeOptions(options){
    if(!Array.isArray(options))return copy(DEFAULT_OPTIONS);
    const result=[],seen=new Set();
    for(const option of options){
      const object=option&&typeof option==='object'?option:{label:option,value:option};
      const value=text(object.value,text(object.label,''),240);
      if(seen.has(value))continue;
      const label=text(object.label,value||'Auswahl',500)||value||'Auswahl';
      seen.add(value);result.push({label,value,color:color(object.color,'#657789')});
    }
    return result.length?result:copy(DEFAULT_OPTIONS);
  }
  function normalizeConfig(input){
    const source=input&&typeof input==='object'?input:{};
    let type=text(source.type||source.kind,'button',32).toLowerCase();
    if(type==='icon-button'||type==='icon')type='iconbutton';if(!TYPES.includes(type))type='button';
    const behavior=BEHAVIORS.includes(source.behavior)?source.behavior:'message';
    const options=normalizeOptions(source.options);
    let defaultValue=bit(source.defaultValue);
    if(type==='dropdown'){
      const requested=text(source.defaultValue,options[0].value,240);
      defaultValue=options.some(option=>option.value===requested)?requested:options[0].value;
    }else if((type==='button'||type==='iconbutton')&&behavior==='counter'){
      const n=Number(source.defaultValue);defaultValue=Number.isFinite(n)?Math.max(0,Math.min(999999,Math.floor(n))):0;
    }
    return {schema:1,type,label:text(source.label,'Neue Funktion',160)||'Neue Funktion',icon:text(source.icon,'✦',24),
      description:text(source.description,'',12000),defaultValue,
      offText:text(source.offText??source.zeroText,'Aus',160)||'Aus',onText:text(source.onText??source.oneText,'Ein',160)||'Ein',
      offColor:color(source.offColor??source.zeroColor,'#657789'),onColor:color(source.onColor??source.oneColor,'#16835e'),
      buttonColor:color(source.buttonColor,'#7444aa'),options,behavior,
      message:text(source.message,'Aktion im Entwurf ausgelöst.',2000)||'Aktion im Entwurf ausgelöst.',
      programmingStatus:'open',implemented:false};
  }

  function create(input,options={}){
    const document=options.document||(typeof globalThis!=='undefined'?globalThis.document:null);
    if(!document?.createElement)throw new TypeError('create benötigt ein document.');
    let config=normalizeConfig(input),state={value:config.defaultValue,count:Number(config.defaultValue)||0,message:''};
    const element=(tag,className,content)=>{const el=document.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=content;return el;};
    const card=element('div','shc-component');card.setAttribute('role','group');card.dataset.shcComponent='true';card.dataset.shcProgramming='open';
    const header=element('div','shc-header');
    const badge=element('span','shc-badge','Neue Funktion · Programmierung offen');badge.dataset.shcLocked='true';
    const typeLabel=element('span','shc-type');header.append(badge,typeLabel);
    const body=element('div','shc-body');
    const output=element('div','shc-output');output.setAttribute('role','status');output.setAttribute('aria-live','polite');
    const purpose=element('details','shc-purpose');const summary=element('summary','','Geplante Programmfunktion');const description=element('p');purpose.append(summary,description);
    card.append(header,body,output,purpose);
    let control=null,controlIcon=null,controlText=null,stateBadge=null,knob=null;
    const isTesting=()=>{try{return typeof options.isTesting==='function'?!!options.isTesting():!!options.isTesting;}catch{return false;}};
    function refreshTesting(){
      const active=isTesting();card.dataset.uiTest=active?'on':'off';
      if(control){control.disabled=!active;control.setAttribute('aria-disabled',String(!active));}
      output.textContent=active?(state.message||'Lokaler UI-Test · ohne Programmanbindung'):'UI-Test einschalten, um dieses Element auszuprobieren.';
      return active;
    }
    function emit(action,changed){
      if(!isTesting())return false;
      if(changed&&typeof options.onValue==='function')options.onValue(state.value);
      if(typeof options.onCommand==='function')options.onCommand(Object.freeze({
        source:'simple-ai-hmi-components',scope:'draft-only',placeholder:true,programmingRequired:true,implemented:false,
        action,componentType:config.type,label:config.label,value:state.value,count:state.count,message:state.message,description:config.description
      }));
      return true;
    }
    function applyState(){
      const binary=bit(state.value),stateColor=binary?config.onColor:config.offColor,stateText=binary?config.onText:config.offText;
      card.dataset.value=String(state.value);card.dataset.shcType=config.type;
      if(controlIcon)controlIcon.textContent=config.icon;
      if(config.type==='dropdown'){
        controlText.textContent=config.label;
        control.value=String(state.value);const selected=config.options.find(o=>o.value===state.value)||config.options[0];
        stateBadge.textContent=selected.label;stateBadge.style.backgroundColor=selected.color;stateBadge.style.color=foreground(selected.color);
        control.style.borderColor=selected.color;
      }else if(config.type==='toggle'){
        control.setAttribute('aria-checked',String(!!binary));controlText.textContent=config.label;
        stateBadge.textContent=binary+' · '+stateText;stateBadge.style.backgroundColor=stateColor;stateBadge.style.color=foreground(stateColor);
        knob.style.backgroundColor=stateColor;control.dataset.state=String(binary);
      }else if(config.type==='indicator'){
        control.setAttribute('aria-pressed',String(!!binary));controlText.textContent=config.label;
        stateBadge.textContent=binary+' · '+stateText;stateBadge.style.backgroundColor=stateColor;stateBadge.style.color=foreground(stateColor);
        control.setAttribute('aria-label',config.label+' · '+stateText+' · lokalen Anzeigewert umschalten');
      }else{
        const binaryMode=config.behavior==='value',fill=binaryMode?stateColor:config.buttonColor;
        control.style.backgroundColor=fill;control.style.color=foreground(fill);
        controlText.textContent=config.type==='iconbutton'?config.label:config.label+(binaryMode?' · '+stateText:'');
        control.setAttribute('aria-label',config.label+(binaryMode?' · '+stateText:''));
        if(binaryMode)control.setAttribute('aria-pressed',String(!!binary));else control.removeAttribute('aria-pressed');
      }
      refreshTesting();
    }
    function activate(){
      if(!refreshTesting())return;
      let changed=false;
      if(config.type==='toggle'||config.type==='indicator'||config.behavior==='value'){
        state.value=bit(state.value)?0:1;state.message='Lokaler Testwert: '+state.value+' · '+(state.value?config.onText:config.offText);changed=true;
      }else if(config.behavior==='counter'){
        state.count++;state.value=state.count;state.message='Lokale Betätigungen: '+state.count;changed=true;
      }else state.message=config.message;
      applyState();emit('activate',changed);
    }
    function rebuild(){
      const open=purpose.open;body.replaceChildren();controlIcon=null;controlText=null;stateBadge=null;knob=null;
      card.setAttribute('aria-label',config.label+' · neue Funktion, Programmierung offen');
      typeLabel.textContent=TYPE_LABELS[config.type];description.textContent=config.description||'Diese Funktion ist eine Entwurfsidee. Das spätere Programmverhalten muss noch beschrieben und bestätigt werden.';purpose.open=open;
      if(config.type==='dropdown'){
        const label=element('label','shc-select-label');controlText=element('span','shc-label',config.label);label.append(controlText);
        control=element('select','shc-select');control.setAttribute('aria-label',config.label);
        for(const item of config.options){const option=element('option','',item.label);option.value=item.value;option.style.backgroundColor=item.color;option.style.color=foreground(item.color);control.append(option);}
        control.onchange=()=>{if(!refreshTesting()){control.value=String(state.value);return;}state.value=control.value;state.message='Lokale Auswahl: '+config.options.find(o=>o.value===state.value).label;applyState();emit('change',true);};
        stateBadge=element('span','shc-selected');label.append(control);body.append(label,stateBadge);
      }else{
        control=element('button','shc-control shc-'+config.type);control.type='button';control.onclick=activate;
        if(config.type==='toggle'){
          control.setAttribute('role','switch');knob=element('span','shc-toggle-track');knob.setAttribute('aria-hidden','true');knob.append(element('span','shc-toggle-knob'));
          controlText=element('span','shc-label');stateBadge=element('span','shc-state');control.append(knob,controlText,stateBadge);
        }else if(config.type==='indicator'){
          controlText=element('span','shc-label');stateBadge=element('span','shc-indicator');control.append(controlText,stateBadge);
        }else{
          controlIcon=element('span','shc-icon');controlIcon.setAttribute('aria-hidden','true');controlText=element('span','shc-label');control.append(controlIcon,controlText);
        }
        body.append(control);
      }
      applyState();
    }
    function setValue(value,{notify=false}={}){
      if(config.type==='dropdown'){
        const requested=String(value);state.value=config.options.some(o=>o.value===requested)?requested:config.defaultValue;
      }else if((config.type==='button'||config.type==='iconbutton')&&config.behavior==='counter'){
        const n=Number(value);state.value=Number.isFinite(n)?Math.max(0,Math.floor(n)):config.defaultValue;state.count=state.value;
      }else state.value=bit(value);
      state.message='';applyState();if(notify&&isTesting())emit('set-value',true);return card;
    }
    function updateConfig(next,{resetValue=false}={}){
      const normalized=normalizeConfig(next);
      if(JSON.stringify(normalized)===JSON.stringify(config)&&!resetValue){refreshTesting();return card;}
      const previous=config;config=normalized;
      if(resetValue||previous.type!==config.type||previous.defaultValue!==config.defaultValue||(['button','iconbutton'].includes(config.type)&&previous.behavior!==config.behavior)){state={value:config.defaultValue,count:Number(config.defaultValue)||0,message:''};}
      else if(config.type==='dropdown'&&!config.options.some(o=>o.value===state.value)){state.value=config.defaultValue;state.message='';}
      else if(previous.message!==config.message)state.message='';
      if(previous.type!==config.type)rebuild();
      else{
        card.setAttribute('aria-label',config.label+' · neue Funktion, Programmierung offen');
        description.textContent=config.description||'Diese Funktion ist eine Entwurfsidee. Das spätere Programmverhalten muss noch beschrieben und bestätigt werden.';
        if(config.type==='dropdown'){
          while(control.options.length>config.options.length)control.remove(control.options.length-1);
          config.options.forEach((item,index)=>{
            let option=control.options[index];if(!option){option=element('option');control.append(option);}
            if(option.textContent!==item.label)option.textContent=item.label;
            if(option.value!==item.value)option.value=item.value;
            if(option.dataset.shcColor!==item.color){option.dataset.shcColor=item.color;option.style.backgroundColor=item.color;option.style.color=foreground(item.color);}
          });
        }
        applyState();
      }
      return card;
    }
    Object.defineProperty(card,'simpleAIHMI',{value:Object.freeze({
      getConfig:()=>copy(config),getState:()=>copy(state),updateConfig,setValue,refreshTesting,
      reset:()=>{state={value:config.defaultValue,count:Number(config.defaultValue)||0,message:''};applyState();return card;}
    })});
    rebuild();return card;
  }

  function renderEditor(container,input,options={}){
    if(!container?.ownerDocument)throw new TypeError('renderEditor benötigt ein DOM-Element.');
    const document=container.ownerDocument,initial=normalizeConfig(input);let draft=copy(initial),selectedOption=0;
    const el=(tag,className,content)=>{const n=document.createElement(tag);if(className)n.className=className;if(content!==undefined)n.textContent=content;return n;};
    const editor=el('section','shc-editor');editor.dataset.smartComponentEditor='true';
    const intro=el('p','shc-editor-intro','Neue Funktion · Programmierung offen. Hier werden nur Aussehen und lokale Testwerte festgelegt.');
    const fields=el('div','shc-fields'),conditional=el('div','shc-fields'),previewWrap=el('div','shc-preview');
    const previewTitle=el('strong','shc-preview-title','Direkt ausprobieren · lokaler UI-Test');
    const preview=create(draft,{document,isTesting:()=>true});previewWrap.append(previewTitle,preview);
    const status=el('p','shc-editor-status');status.setAttribute('role','status');
    const apply=el('button','shc-editor-apply','Baustein übernehmen');apply.type='button';
    editor.append(intro,fields,conditional,previewWrap,apply,status);container.replaceChildren(editor);
    const controls={};
    function inputField(parent,name,label,type='text',value=''){
      const wrap=el('label','shc-field');wrap.append(el('span','',label));const control=el(type==='textarea'?'textarea':'input','shc-input');
      if(type!=='textarea')control.type=type;else control.rows=3;
      control.value=value;control.dataset.field=name;wrap.append(control);parent.append(wrap);controls[name]=control;return control;
    }
    function selectField(parent,name,label,items,value){
      const wrap=el('label','shc-field');wrap.append(el('span','',label));const control=el('select','shc-input');control.dataset.field=name;
      for(const [key,caption] of items){const option=el('option','',caption);option.value=key;control.append(option);}control.value=String(value);wrap.append(control);parent.append(wrap);controls[name]=control;return control;
    }
    function colorField(parent,name,label,value,change){
      const wrap=el('label','shc-field shc-color-field');wrap.append(el('span','',label));const row=el('span','shc-color-row');
      const picker=el('input','shc-color-picker');picker.type='color';picker.value=value;picker.dataset.field=name;
      const code=el('output','shc-color-code',value);row.append(picker,code);wrap.append(row);parent.append(wrap);controls[name]=picker;
      picker.oninput=()=>{code.textContent=picker.value;change(picker.value);};return picker;
    }
    function updatePreview(preferValue){
      const next=normalizeConfig(draft);preview.simpleAIHMI.updateConfig(next);
      if(preferValue!==undefined)preview.simpleAIHMI.setValue(preferValue);
      status.textContent='Vorschau aktualisiert. Übernehmen speichert diesen Baustein im Entwurf.';
    }
    const type=selectField(fields,'type','Baustein',TYPES.map(t=>[t,TYPE_LABELS[t]]),draft.type);
    const label=inputField(fields,'label','Beschriftung','text',draft.label);label.maxLength=160;label.oninput=()=>{draft.label=label.value;updatePreview();};
    const icon=inputField(fields,'icon','Icon / Zeichen','text',draft.icon);icon.maxLength=48;icon.placeholder='Zum Beispiel ▶, ⚙, ✓';icon.oninput=()=>{draft.icon=icon.value;updatePreview();};
    const description=inputField(fields,'description','Was soll die spätere Programmfunktion tun?','textarea',draft.description);description.maxLength=12000;
    description.placeholder='Beschreibe die Funktion. Diese Beschreibung führt noch keinen Programmcode aus.';description.oninput=()=>{draft.description=description.value;updatePreview();};
    function stateFields(){
      const grid=el('div','shc-state-fields');conditional.append(grid);
      for(const [prefix,name] of [['off','0 · Aus'],['on','1 · Ein']]){
        const section=el('div','shc-state-settings');grid.append(section);section.append(el('strong','',name));
        const t=inputField(section,prefix+'Text','Anzeigetext','text',draft[prefix+'Text']);t.maxLength=160;t.oninput=()=>{draft[prefix+'Text']=t.value;updatePreview();};
        colorField(section,prefix+'Color','Farbe',draft[prefix+'Color'],value=>{draft[prefix+'Color']=value;updatePreview();});
      }
      const defaultControl=selectField(conditional,'defaultValue','Startwert',[['0','0 · '+draft.offText],['1','1 · '+draft.onText]],bit(draft.defaultValue));
      defaultControl.onchange=()=>{draft.defaultValue=Number(defaultControl.value);updatePreview();};
    }
    function dropdownFields(){
      const box=el('div','shc-options-editor');conditional.append(box);
      const list=selectField(box,'optionList','Auswahlmöglichkeiten',[],0);list.size=Math.min(6,Math.max(3,draft.options.length));
      const optionLabel=inputField(box,'optionLabel','Text der gewählten Option');
      const optionValue=inputField(box,'optionValue','Wert der gewählten Option');
      optionLabel.maxLength=500;optionValue.maxLength=240;
      const optionColor=colorField(box,'optionColor','Farbe der gewählten Option','#657789',value=>{draft.options[selectedOption].color=value;updatePreview(draft.options[selectedOption].value);});
      const rows=el('div','shc-option-buttons');box.append(rows);
      const add=el('button','','+ Option'),remove=el('button','','Entfernen'),up=el('button','','Nach oben'),down=el('button','','Nach unten');
      for(const button of [add,remove,up,down]){button.type='button';rows.append(button);}
      const start=selectField(box,'defaultValue','Startauswahl',[],draft.defaultValue);
      function fillLists(){
        list.replaceChildren();start.replaceChildren();draft.options.forEach((option,index)=>{
          const item=el('option','',option.label+' · '+option.value);item.value=String(index);list.append(item);
          const initial=el('option','',option.label);initial.value=option.value;start.append(initial);
        });
        selectedOption=Math.min(Math.max(0,selectedOption),draft.options.length-1);list.value=String(selectedOption);
        if(!draft.options.some(o=>o.value===String(draft.defaultValue)))draft.defaultValue=draft.options[0].value;
        start.value=String(draft.defaultValue);remove.disabled=draft.options.length<2;up.disabled=selectedOption===0;down.disabled=selectedOption===draft.options.length-1;
      }
      function showSelected(){
        const item=draft.options[selectedOption];optionLabel.value=item.label;optionValue.value=item.value;optionColor.value=item.color;
        optionColor.nextElementSibling.textContent=item.color;updatePreview(item.value);
      }
      list.onchange=()=>{selectedOption=Number(list.value);fillLists();showSelected();};
      optionLabel.oninput=()=>{draft.options[selectedOption].label=optionLabel.value;list.options[selectedOption].textContent=optionLabel.value+' · '+draft.options[selectedOption].value;start.options[selectedOption].textContent=optionLabel.value;updatePreview(draft.options[selectedOption].value);};
      optionValue.oninput=()=>{
        const previous=draft.options[selectedOption].value;draft.options[selectedOption].value=optionValue.value;
        if(String(draft.defaultValue)===previous)draft.defaultValue=optionValue.value;
        list.options[selectedOption].textContent=draft.options[selectedOption].label+' · '+optionValue.value;start.options[selectedOption].value=optionValue.value;start.value=String(draft.defaultValue);updatePreview(optionValue.value);
      };
      start.onchange=()=>{draft.defaultValue=start.value;updatePreview(start.value);};
      add.onclick=()=>{const used=new Set(draft.options.map(o=>o.value));let number=draft.options.length+1;while(used.has('option-'+number))number++;draft.options.push({label:'Neue Option '+number,value:'option-'+number,color:'#7444aa'});selectedOption=draft.options.length-1;fillLists();showSelected();};
      remove.onclick=()=>{if(draft.options.length<2)return;draft.options.splice(selectedOption,1);fillLists();showSelected();};
      for(const [button,delta] of [[up,-1],[down,1]])button.onclick=()=>{const index=selectedOption+delta;if(index<0||index>=draft.options.length)return;const item=draft.options.splice(selectedOption,1)[0];draft.options.splice(index,0,item);selectedOption=index;fillLists();showSelected();};
      const bulk=el('details','shc-bulk');bulk.append(el('summary','','Viele Optionen auf einmal einfügen'));
      const help=el('p','','Eine Zeile pro Option: Beschriftung | Wert | #Farbe. Ohne Farbe wird Grau verwendet. „Liste ersetzen“ wirkt zunächst nur in dieser Vorschau.');
      const area=inputField(bulk,'bulkOptions','Optionsliste','textarea','');area.rows=5;area.placeholder='Bereit | ready | #16835e\nWartet | wait | #c68a16';
      const replace=el('button','','Liste ersetzen');replace.type='button';bulk.append(help,replace);box.append(bulk);
      replace.onclick=()=>{
        const parsed=area.value.split(/\r?\n/).filter(line=>line.trim()).map((line,index)=>{
          const parts=line.split('|').map(p=>p.trim());return {label:parts[0]||'Option '+(index+1),value:parts.length>1?parts[1]:parts[0],color:color(parts[2],'#657789')};
        });
        if(!parsed.length){status.textContent='Bitte mindestens eine Option eingeben.';return;}
        if(new Set(parsed.map(o=>o.value)).size!==parsed.length){status.textContent='Jede Option braucht einen eindeutigen Wert. Bitte doppelte Werte korrigieren.';return;}
        draft.options=parsed;draft.defaultValue=parsed[0].value;selectedOption=0;fillLists();showSelected();status.textContent='Optionsliste in der Vorschau ersetzt. „Baustein übernehmen“ speichert sie.';
      };
      fillLists();showSelected();
    }
    function renderConditional(){
      conditional.replaceChildren();icon.closest('label').hidden=draft.type==='dropdown'||draft.type==='toggle'||draft.type==='indicator';
      if(draft.type==='dropdown')dropdownFields();
      else if(draft.type==='toggle'||draft.type==='indicator')stateFields();
      else{
        colorField(conditional,'buttonColor','Schaltflächenfarbe',draft.buttonColor,value=>{draft.buttonColor=value;updatePreview();});
        const behavior=selectField(conditional,'behavior','Beim lokalen UI-Test',[['message','Nur eine Testmeldung anzeigen'],['counter','Betätigungen zählen'],['value','Wert 0/1 umschalten']],draft.behavior);
        behavior.onchange=()=>{draft.behavior=behavior.value;draft.defaultValue=0;renderConditional();updatePreview();};
        if(draft.behavior==='value')stateFields();
        else if(draft.behavior==='counter'){
          const start=inputField(conditional,'defaultValue','Anfang des lokalen Zählers','number',draft.defaultValue);start.min='0';start.max='999999';start.step='1';start.oninput=()=>{draft.defaultValue=Number(start.value);updatePreview();};
        }else{
          const message=inputField(conditional,'message','Testmeldung','text',draft.message);message.maxLength=2000;message.oninput=()=>{draft.message=message.value;updatePreview();};
        }
      }
    }
    type.onchange=()=>{draft.type=type.value;draft=normalizeConfig(draft);renderConditional();updatePreview();};
    apply.onclick=()=>{
      if(draft.type==='dropdown'&&new Set(draft.options.map(o=>o.value)).size!==draft.options.length){status.textContent='Jede Option braucht einen eindeutigen Wert. Bitte doppelte Werte korrigieren.';return;}
      const config=normalizeConfig(draft);if(typeof options.onApply==='function')options.onApply(copy(config));status.textContent='Baustein für den Entwurf übernommen. Programmierung bleibt offen.';
    };
    editor.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();apply.click();}});
    renderConditional();updatePreview();
    return Object.freeze({element:editor,getConfig:()=>normalizeConfig(draft),isDirty:()=>JSON.stringify(normalizeConfig(draft))!==JSON.stringify(initial),focus:()=>label.focus()});
  }

  const templates=[
    normalizeConfig({type:'button',label:'Neue Aktion',icon:'▶',description:'Neue Programmfunktion: gewünschtes Verhalten noch festlegen.'}),
    normalizeConfig({type:'iconbutton',label:'Neue Icon-Aktion',icon:'⚙',description:'Eine neue Icon-Aktion, bisher ohne Programmanbindung.',behavior:'value'}),
    normalizeConfig({type:'toggle',label:'Neue Freigabe',description:'Neue schaltbare Funktion, Programmierung noch offen.'}),
    normalizeConfig({type:'dropdown',label:'Neue Auswahl',description:'Neue Auswahl für das spätere Programmverhalten.'}),
    normalizeConfig({type:'indicator',label:'Neue Zustandsanzeige',description:'Neue Anzeige: spätere Datenquelle noch festlegen.'})
  ];
  return Object.freeze({normalizeConfig,create,renderEditor,get templates(){return copy(templates);},types:Object.freeze(TYPES.slice())});
});
