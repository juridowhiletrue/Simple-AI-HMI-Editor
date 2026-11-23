(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document)root.SimpleAIHMIStateStyles=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const owned=new WeakMap(),optionTargets=new WeakMap();
  const OFF='#d63e46',ON='#16835e',OTHER='#657789';
  const NAMED={red:'#ff0000',green:'#008000',blue:'#0000ff',purple:'#800080',orange:'#ffa500',yellow:'#ffff00',white:'#ffffff',black:'#000000',gray:'#808080',grey:'#808080'};
  const copy=value=>JSON.parse(JSON.stringify(value));
  function text(value,fallback='',limit=500){return ['string','number','boolean'].includes(typeof value)?Array.from(String(value).trim()).slice(0,limit).join(''):fallback;}
  function color(value,fallback){
    if(typeof value!=='string')return fallback;
    value=value.trim().toLowerCase();if(Object.hasOwn(NAMED,value))return NAMED[value];
    if(/^#[0-9a-f]{3}$/.test(value))return '#'+Array.from(value.slice(1)).map(c=>c+c).join('');
    if(/^#[0-9a-f]{6}$/.test(value))return value;
    const rgb=/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(1(?:\.0+)?))?\s*\)$/.exec(value);
    if(rgb&&rgb.slice(1,4).every(c=>Number(c)<=255))return '#'+rgb.slice(1,4).map(c=>Number(c).toString(16).padStart(2,'0')).join('');
    return fallback;
  }
  function foreground(fill){
    const luminance=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4));return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
    const l=luminance(fill),dark='#15293b';return 1.05/(l+.05)>=(l+.05)/(luminance(dark)+.05)?'#ffffff':dark;
  }
  function binary(value){
    if(value===true||value===1)return 1;if(value===false||value===0)return 0;
    if(typeof value==='string'){const v=value.trim().toLowerCase();if(v==='1'||v==='true')return 1;if(v==='0'||v==='false')return 0;}
    return null;
  }
  function normalizeRecipe(input){
    const source=input&&typeof input==='object'?input:{};
    const requested=text(source.mode||source.kind||source.type,'binary',40).toLowerCase();
    const mode=['options','dropdown','select'].includes(requested)?'options':'binary';
    const target=['background','text','border'].includes(source.target)?source.target:'background';
    const result=[],seen=new Set();
    if(Array.isArray(source.options))for(const entry of source.options){
      const option=entry&&typeof entry==='object'?entry:{label:entry,value:entry};
      const value=text(option.value,text(option.label,''),240);if(seen.has(value))continue;seen.add(value);
      result.push({value,label:text(option.label,value||'Auswahl',500)||value||'Auswahl',color:color(option.color,value==='0'?OFF:value==='1'?ON:OTHER)});
    }
    const manual=source.manualValue??source.defaultValue;
    let manualValue=mode==='options'?text(manual,result[0]?.value||'',240):(binary(manual)??0);
    if(mode==='options'&&result.length&&!result.some(option=>option.value===manualValue))manualValue=result[0].value;
    return {schema:1,mode,target,valueSource:text(source.valueSource,'element',200)||'element',
      offColor:color(source.offColor,OFF),onColor:color(source.onColor,ON),
      autoContrast:source.autoContrast!==false,
      manualValue,options:result};
  }
  function selectFor(element){return element?.tagName==='SELECT'?element:element?.querySelector?.('select')||null;}
  function elementValue(element){
    const select=selectFor(element);if(select)return select.value;
    if(element?.tagName==='INPUT'&&['checkbox','radio'].includes(element.type))return element.checked?1:0;
    for(const attr of ['aria-checked','aria-pressed','data-value','data-state'])if(element?.hasAttribute?.(attr))return element.getAttribute(attr);
    if(element&&typeof element.value==='string'&&element.value!=='')return element.value;
    const literal=element?.children?.length===0?text(element.textContent,'',100):'';
    return literal==='0'||literal==='1'?literal:undefined;
  }
  function inferOptions(element){
    const select=selectFor(element);if(!select)return [];
    return Array.from(select.options).map(option=>({value:option.value,label:option.label||option.textContent,
      color:color(option.style.backgroundColor,color(option.style.color,option.value==='0'?OFF:option.value==='1'?ON:OTHER))}));
  }
  function snapshot(element,property){return {value:element.style.getPropertyValue(property),priority:element.style.getPropertyPriority(property)};}
  function restore(element,property,value){if(value.value)element.style.setProperty(property,value.value,value.priority);else element.style.removeProperty(property);}
  function clearOne(element){
    const state=owned.get(element);if(!state)return;
    for(const [property,previous] of state.base){
      const current=snapshot(element,property),written=state.written.get(property);
      // A later host-side style update belongs to the host and must be retained.
      if(!written||(current.value===written.value&&current.priority===written.priority))restore(element,property,previous);
    }
    owned.delete(element);
  }
  function clear(element){
    if(!element?.style)return;
    clearOne(element);for(const option of optionTargets.get(element)||[])clearOne(option);optionTargets.delete(element);
  }
  function writeStyles(element,recipe,fill){
    const previous=owned.get(element);const base=new Map();
    if(previous){
      for(const [property,initial] of previous.base){
        const current=snapshot(element,property),last=previous.written.get(property);
        base.set(property,last&&current.value===last.value&&current.priority===last.priority?initial:current);
      }
      // A recipe has one active target; restore the previous target before changing it.
      for(const [property,value] of base)restore(element,property,value);
    }
    const requested=new Map();
    if(recipe.target==='background'){
      requested.set('background-color',fill);if(recipe.autoContrast)requested.set('color',foreground(fill));
    }else if(recipe.target==='text')requested.set('color',fill);
    else{
      requested.set('border-color',fill);
      const view=element.ownerDocument?.defaultView;
      const computed=view?.getComputedStyle?.(element);
      if(!computed||['','none','hidden'].includes(computed.borderTopStyle))requested.set('border-style','solid');
      if(!computed||!computed.borderTopWidth||Number.parseFloat(computed.borderTopWidth)===0)requested.set('border-width','2px');
    }
    const nextBase=new Map(),written=new Map();
    for(const [property,value] of requested){nextBase.set(property,base.get(property)||snapshot(element,property));element.style.setProperty(property,value,'important');written.set(property,snapshot(element,property));}
    owned.set(element,{base:nextBase,written});
  }
  function apply(element,input,value){
    if(!element?.style?.setProperty)return {applied:false,reason:'invalid-element'};
    const recipe=normalizeRecipe(input);
    let current=value;
    if(current===undefined){
      if(recipe.valueSource==='manual')current=recipe.manualValue;
      else if(recipe.valueSource==='element')current=elementValue(element);
    }
    let fill,normalizedValue;
    if(recipe.mode==='binary'){
      normalizedValue=binary(current);if(normalizedValue!==null)fill=normalizedValue?recipe.onColor:recipe.offColor;
    }else{
      normalizedValue=current===undefined||current===null?null:String(current);
      fill=recipe.options.find(option=>option.value===normalizedValue)?.color;
    }
    if(!fill){clear(element);return {applied:false,reason:current===undefined?'missing-value':'unmapped-value',value:current??null};}
    writeStyles(element,recipe,fill);
    const select=recipe.mode==='options'?selectFor(element):null,nextOptions=new Set();
    if(select)for(const option of select.options){
      const mapped=recipe.options.find(item=>item.value===option.value);
      if(mapped){writeStyles(option,recipe,mapped.color);nextOptions.add(option);}
    }
    for(const option of optionTargets.get(element)||[])if(!nextOptions.has(option))clearOne(option);
    if(nextOptions.size)optionTargets.set(element,nextOptions);else optionTargets.delete(element);
    return {applied:true,value:normalizedValue,color:fill,target:recipe.target,valueSource:recipe.valueSource};
  }

  function renderEditor(container,input,options={}){
    if(!container?.ownerDocument)throw new TypeError('renderEditor benötigt ein DOM-Element.');
    const document=container.ownerDocument,source=input&&typeof input==='object'?input:{};
    const seed={...source};
    if(!source.mode&&!source.kind&&!source.type&&selectFor(options.element))seed.mode='options';
    if(['options','dropdown','select'].includes(seed.mode||seed.kind||seed.type)&&(!Array.isArray(seed.options)||!seed.options.length))seed.options=inferOptions(options.element);
    if(seed.manualValue===undefined&&seed.defaultValue===undefined){const current=elementValue(options.element);if(current!==undefined)seed.manualValue=current;}
    let draft=normalizeRecipe(seed),previewValue=draft.manualValue,selected=Math.max(0,draft.options.findIndex(option=>option.value===String(draft.manualValue)));
    const initial=copy(draft);
    const el=(tag,className,content)=>{const node=document.createElement(tag);if(className)node.className=className;if(content!==undefined)node.textContent=content;return node;};
    const editor=el('section','shs-editor');const fields=el('div','shs-fields'),settings=el('div','shs-fields'),previewBox=el('div','shs-preview');
    const intro=el('p','shs-intro','Farben im Entwurf testen. Es werden nur Darstellungsfarben geändert – keine Befehle oder realen Signalwerte.');
    const feedback=el('p','shs-feedback');feedback.setAttribute('role','status');
    const previewTitle=el('strong','','Farbvorschau · lokaler Beispielwert');let previewElement=null;
    const previewHolder=el('div','shs-preview-holder'),testButtons=el('div','shs-test-buttons');previewBox.append(previewTitle,previewHolder,testButtons);
    const applyButton=el('button','shs-apply','Farbzuordnung übernehmen');applyButton.type='button';editor.append(intro,fields,settings,previewBox,applyButton,feedback);container.replaceChildren(editor);
    const inputs={};
    function inputField(parent,name,label,value,type='text'){
      const wrap=el('label','shs-field');wrap.append(el('span','',label));const control=el('input','shs-input');control.type=type;control.value=value;control.dataset.field=name;wrap.append(control);parent.append(wrap);inputs[name]=control;return control;
    }
    function selectField(parent,name,label,items,value){
      const wrap=el('label','shs-field');wrap.append(el('span','',label));const control=el('select','shs-input');control.dataset.field=name;
      for(const [v,labelText] of items){const option=el('option','',labelText);option.value=v;control.append(option);}control.value=String(value);wrap.append(control);parent.append(wrap);inputs[name]=control;return control;
    }
    function colorField(parent,name,label,value,changed){
      const wrap=el('label','shs-field');wrap.append(el('span','',label));const row=el('span','shs-color-row');const picker=el('input','shs-color');picker.type='color';picker.value=value;picker.dataset.field=name;
      const code=el('output','',value);row.append(picker,code);wrap.append(row);parent.append(wrap);picker.oninput=()=>{code.textContent=picker.value;changed(picker.value);};inputs[name]=picker;return picker;
    }
    function emitPreview(){
      const recipe=normalizeRecipe(draft);
      if(previewElement){
        if(recipe.mode==='options')previewElement.value=String(previewValue);else previewElement.textContent='Beispielwert '+previewValue;
        apply(previewElement,recipe,previewValue);
      }
      for(const button of testButtons.querySelectorAll('button[data-preview-value]'))button.setAttribute('aria-pressed',String(String(previewValue)===button.dataset.previewValue));
      if(typeof options.onPreview==='function')options.onPreview(previewValue,copy(recipe));
      feedback.textContent='Farbvorschau aktualisiert. Die Zuordnung wird erst mit „Übernehmen“ gespeichert.';
    }
    function rebuildPreview(){
      if(previewElement)clear(previewElement);previewHolder.replaceChildren();testButtons.replaceChildren();
      if(draft.mode==='options'){
        previewElement=el('select','shs-preview-element');previewElement.setAttribute('aria-label','Beispielauswahl für die Farbvorschau');
        for(const option of draft.options){const node=el('option','',option.label);node.value=option.value;previewElement.append(node);}
        if(!draft.options.some(o=>o.value===String(previewValue)))previewValue=draft.options[0]?.value||'';
        previewElement.onchange=()=>{previewValue=previewElement.value;draft.manualValue=previewValue;emitPreview();};
      }else{
        previewValue=binary(previewValue)??0;previewElement=el('button','shs-preview-element');previewElement.type='button';previewElement.setAttribute('aria-label','Binären Beispielwert umschalten');previewElement.onclick=()=>{previewValue=previewValue?0:1;draft.manualValue=previewValue;emitPreview();};
        for(const value of [0,1]){const button=el('button','',String(value));button.type='button';button.dataset.previewValue=String(value);button.setAttribute('aria-label','Beispielwert '+value+' testen');button.onclick=()=>{previewValue=value;draft.manualValue=value;emitPreview();};testButtons.append(button);}
      }
      previewHolder.append(previewElement);emitPreview();
    }
    const mode=selectField(fields,'mode','Zustände',[['binary','Binär · Wert 0 oder 1'],['options','Dropdown · Farbe je Auswahlwert']],draft.mode);
    const target=selectField(fields,'target','Was soll sich färben?',[['background','Hintergrund'],['text','Text'],['border','Rahmen']],draft.target);
    const sources=new Map([['element','Wert dieses Elements'],['manual','Manueller UI-Testwert']]);
    for(const item of Array.isArray(options.sources)?options.sources:[])if(item&&typeof item.value==='string'&&item.value.trim())sources.set(item.value,text(item.label,item.value,200));
    if(!sources.has(draft.valueSource))sources.set(draft.valueSource,draft.valueSource);
    let customSourceKey='__shs_custom__';while(sources.has(customSourceKey))customSourceKey+='_';
    const sourceItems=Array.from(sources);sourceItems.push([customSourceKey,'Andere Wertquelle …']);
    const sourceChoice=selectField(fields,'valueSource','Wertquelle',sourceItems,draft.valueSource);
    const custom=inputField(fields,'customSource','Kennung der anderen Wertquelle',draft.valueSource);custom.maxLength=200;custom.closest('label').hidden=sourceChoice.value!==customSourceKey;
    const sourceHelp=el('p','shs-hint','Die Wertquelle wird vom Host zugeordnet. Eine neue Quelle ist noch keine neue Daten- oder Programmfunktion.');fields.append(sourceHelp);
    const contrastLabel=el('label','shs-check');const contrast=el('input');contrast.type='checkbox';contrast.checked=draft.autoContrast;contrast.dataset.field='autoContrast';contrastLabel.append(contrast,document.createTextNode('Text auf farbigem Hintergrund automatisch lesbar halten'));fields.append(contrastLabel);
    target.onchange=()=>{draft.target=target.value;contrastLabel.hidden=draft.target!=='background';emitPreview();};
    contrast.onchange=()=>{draft.autoContrast=contrast.checked;emitPreview();};
    sourceChoice.onchange=()=>{custom.closest('label').hidden=sourceChoice.value!==customSourceKey;draft.valueSource=sourceChoice.value===customSourceKey?custom.value:sourceChoice.value;emitPreview();};
    custom.oninput=()=>{draft.valueSource=custom.value;emitPreview();};
    function modeSettings(){
      settings.replaceChildren();
      if(draft.mode==='binary'){
        const row=el('div','shs-color-grid');settings.append(row);
        colorField(row,'offColor','Farbe bei 0',draft.offColor,value=>{draft.offColor=value;emitPreview();});
        colorField(row,'onColor','Farbe bei 1',draft.onColor,value=>{draft.onColor=value;emitPreview();});
        const swap=el('button','','0/1-Farben tauschen');swap.type='button';swap.onclick=()=>{[draft.offColor,draft.onColor]=[draft.onColor,draft.offColor];modeSettings();emitPreview();};settings.append(swap);
      }else{
        const list=selectField(settings,'optionList','Farbzuordnung auswählen',draft.options.map((o,i)=>[String(i),o.label+' · '+o.value]),selected);list.size=Math.min(6,Math.max(3,draft.options.length));
        const label=inputField(settings,'optionLabel','Beschriftung dieser Zuordnung','');label.maxLength=500;
        const value=inputField(settings,'optionValue','Auswahlwert für diese Zuordnung','');value.maxLength=240;
        const picker=colorField(settings,'optionColor','Farbe für diesen Auswahlwert',OTHER,newColor=>{if(draft.options[selected]){draft.options[selected].color=newColor;previewValue=draft.options[selected].value;emitPreview();}});
        const help=el('p','shs-hint','Diese Liste ordnet Farben zu. Beschriftungen und Werte im ursprünglichen Dropdown werden dadurch nicht verändert.');settings.append(help);
        const tools=el('div','shs-test-buttons'),add=el('button','','+ Farbzuordnung'),remove=el('button','','Zuordnung entfernen');add.type=remove.type='button';tools.append(add,remove);settings.append(tools);
        add.onclick=()=>{const used=new Set(draft.options.map(option=>option.value));let value=String(draft.options.length);while(used.has(value))value=String(Number(value)+1);draft.options.push({value,label:'Wert '+value,color:value==='0'?OFF:value==='1'?ON:OTHER});selected=draft.options.length-1;previewValue=draft.manualValue=value;modeSettings();rebuildPreview();};
        remove.onclick=()=>{if(!draft.options.length)return;draft.options.splice(selected,1);selected=Math.max(0,selected-1);previewValue=draft.manualValue=draft.options[selected]?.value||'';modeSettings();rebuildPreview();};
        const reload=el('button','','Optionen aus dem Element neu übernehmen');reload.type='button';reload.disabled=!selectFor(options.element);reload.onclick=()=>{draft.options=normalizeRecipe({...draft,options:inferOptions(options.element)}).options;selected=0;modeSettings();rebuildPreview();};settings.append(reload);
        function show(){
          selected=Math.min(Math.max(0,selected),Math.max(0,draft.options.length-1));list.value=String(selected);
          const option=draft.options[selected];for(const node of [label,value,picker])node.disabled=!option;
          remove.disabled=!option;
          if(!option){feedback.textContent='Für diese Zuordnung fehlen noch Auswahlwerte.';return;}
          label.value=option.label;value.value=option.value;picker.value=option.color;picker.nextElementSibling.textContent=option.color;
        }
        list.onchange=()=>{selected=Number(list.value);show();previewValue=draft.options[selected]?.value||'';emitPreview();};
        label.oninput=()=>{draft.options[selected].label=label.value;list.options[selected].textContent=label.value+' · '+draft.options[selected].value;rebuildPreview();};
        value.oninput=()=>{const previous=draft.options[selected].value;draft.options[selected].value=value.value;if(String(previewValue)===previous)previewValue=value.value;list.options[selected].textContent=draft.options[selected].label+' · '+value.value;rebuildPreview();};
        show();
      }
    }
    mode.onchange=()=>{
      draft.mode=mode.value;if(draft.mode==='options'&&!draft.options.length)draft.options=inferOptions(options.element);
      draft=normalizeRecipe(draft);previewValue=draft.manualValue;selected=0;modeSettings();rebuildPreview();
    };
    applyButton.onclick=()=>{
      if(!text(draft.valueSource,'')){feedback.textContent='Bitte eine Wertquelle auswählen oder ihre Kennung eingeben.';return;}
      if(draft.mode==='options'&&!draft.options.length){feedback.textContent='Bitte zuerst die Dropdownoptionen aus dem Element übernehmen.';return;}
      if(draft.mode==='options'&&new Set(draft.options.map(o=>o.value)).size!==draft.options.length){feedback.textContent='Jeder Auswahlwert darf nur eine Farbzuordnung besitzen.';return;}
      const recipe=normalizeRecipe(draft);if(typeof options.onApply==='function')options.onApply(copy(recipe));feedback.textContent='Farbzuordnung für den Entwurf übernommen. Programm- und Datenwerte bleiben unverändert.';
    };
    contrastLabel.hidden=draft.target!=='background';modeSettings();rebuildPreview();
    return Object.freeze({element:editor,getRecipe:()=>normalizeRecipe(draft),isDirty:()=>JSON.stringify(normalizeRecipe(draft))!==JSON.stringify(initial),setPreview(value){previewValue=value;emitPreview();},focus(){mode.focus();}});
  }
  return Object.freeze({normalizeRecipe,apply,clear,renderEditor,inferOptions});
});
