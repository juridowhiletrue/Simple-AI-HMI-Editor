'use strict';

/*
 * Lossless lexical instrumentation, not an HTML reserializer.
 * Every original character is retained; only data-draft-key attributes are added.
 * Raw HTML text, RCDATA and script escaped/double-escaped states are skipped.
 * Existing keys use literal text, numeric references or the five XML entities.
 * Unresolvable existing key references and foreign script/style elements fail
 * explicitly rather than risking different browser-side key identities.
 */

class SourceKeyError extends Error {
  constructor(code, message, offset) {
    super(message + (Number.isInteger(offset) ? ` (Position ${offset})` : ''));
    this.name = 'SourceKeyError';
    this.code = code;
    this.offset = offset;
  }
}

const lower = value => value.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32));
const space = c => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const letter = c => !!c && ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'));
const delimiter = c => c === '>' || c === '/' || space(c);
const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const rawTags = new Set(['script','style','title','textarea','xmp','iframe','noembed','noframes','noscript']);
const xmlEntities = {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'};
const legacyNumbers = {
  128:0x20ac,130:0x201a,131:0x0192,132:0x201e,133:0x2026,134:0x2020,135:0x2021,
  136:0x02c6,137:0x2030,138:0x0160,139:0x2039,140:0x0152,142:0x017d,
  145:0x2018,146:0x2019,147:0x201c,148:0x201d,149:0x2022,150:0x2013,
  151:0x2014,152:0x02dc,153:0x2122,154:0x0161,155:0x203a,156:0x0153,158:0x017e,159:0x0178
};

function decodeAttribute(raw, offset) {
  // HTML input-stream normalization occurs before character references.
  raw = raw.replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd');
  let output = '';
  for (let i=0; i<raw.length;) {
    if (raw[i] !== '&') { output += raw[i++]; continue; }
    if (raw[i+1] === '#') {
      let p=i+2, radix=10;
      if (raw[p] === 'x' || raw[p] === 'X') { radix=16; p++; }
      const start=p;
      while (p<raw.length && (radix===16 ? /[0-9a-fA-F]/.test(raw[p]) : /[0-9]/.test(raw[p]))) p++;
      if (p===start) throw new SourceKeyError('unsupported_key_reference','Nicht auflösbare Zeichenreferenz in einem Schlüssel',offset);
      let number=Number.parseInt(raw.slice(start,p),radix);
      if (!Number.isFinite(number) || number===0 || number>0x10ffff || (number>=0xd800 && number<=0xdfff)) number=0xfffd;
      number=legacyNumbers[number] || number;
      output += String.fromCodePoint(number);
      if (raw[p] === ';') p++;
      i=p; continue;
    }
    const end=raw.indexOf(';',i+1);
    const name=end<0 ? '' : raw.slice(i+1,end);
    if (!Object.hasOwn(xmlEntities,name)) throw new SourceKeyError('unsupported_key_reference','Benannte Schlüsselreferenz benötigt eine vollständige HTML-Entity-Auflösung',offset);
    output += xmlEntities[name]; i=end+1;
  }
  return output;
}

function escapeAttribute(value) {
  return value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/[\u0000-\u001f\u007f]/g,c=>'&#'+c.charCodeAt(0)+';');
}

function startTag(html, start) {
  let p=start+1;
  while (p<html.length && !space(html[p]) && html[p]!=='/' && html[p]!=='>') p++;
  const name=lower(html.slice(start+1,p));
  const attrs=new Map();
  while (p<html.length) {
    while (space(html[p])) p++;
    if (html[p] === '>') return {start,end:p+1,insert:p,name,attrs,selfClosing:false};
    if (html[p] === '/' && html[p+1] === '>') return {start,end:p+2,insert:p,name,attrs,selfClosing:true};
    if (html[p] === '/') { p++; continue; } // HTML's stray solidus is not a quoted value.
    const attrStart=p;
    while (p<html.length && !space(html[p]) && !['/','>','='].includes(html[p])) p++;
    if (p===attrStart) throw new SourceKeyError('malformed_tag','Attributbeginn ist nicht eindeutig',p);
    const attrName=lower(html.slice(attrStart,p));
    while (space(html[p])) p++;
    let value='';
    if (html[p] === '=') {
      p++; while (space(html[p])) p++;
      if (html[p] === '"' || html[p] === "'") {
        const quote=html[p++], valueStart=p;
        while (p<html.length && html[p]!==quote) p++;
        if (p===html.length) throw new SourceKeyError('unterminated_attribute','Attributwert ist nicht geschlossen',attrStart);
        if (['id','data-draft-key','encoding'].includes(attrName)) value=html.slice(valueStart,p);
        p++;
      } else {
        const valueStart=p;
        // A slash is part of an unquoted attribute value, including the final '/>'.
        while (p<html.length && !space(html[p]) && html[p]!=='>') p++;
        if (['id','data-draft-key','encoding'].includes(attrName)) value=html.slice(valueStart,p);
      }
    }
    if (['id','data-draft-key','encoding'].includes(attrName)) {
      if (attrName==='data-draft-key' && attrs.has(attrName)) throw new SourceKeyError('duplicate_key_attribute','Mehrere data-draft-key-Attribute an einem Element',attrStart);
      if (!attrs.has(attrName)) attrs.set(attrName,{value,offset:attrStart});
    }
  }
  throw new SourceKeyError('unterminated_tag','Öffnungstag ist nicht geschlossen',start);
}

function skipMarkup(html,start) {
  let quote=null, brackets=0;
  for (let p=start+2;p<html.length;p++) {
    const c=html[p];
    if (quote) { if(c===quote)quote=null; continue; }
    if (c==='"' || c==="'") { quote=c; continue; }
    if (c==='[') brackets++;
    else if(c===']' && brackets) brackets--;
    else if(c==='>' && !brackets) return p+1;
  }
  return html.length;
}

function skipDeclaration(html,start) {
  if (html[start+1]!=='!' || lower(html.slice(start+2,start+9))!=='doctype') {
    // In text/html, other declarations and processing instructions are bogus
    // comments. Their quotes do not protect a greater-than character.
    const end=html.indexOf('>',start+2);return end<0?html.length:end+1;
  }
  if(!space(html[start+9]) && html[start+9]!=='>')throw new SourceKeyError('unsupported_doctype','Nicht eindeutige Doctype-Schreibweise',start);
  let quote=null;
  for(let p=start+9;p<html.length;p++){
    const c=html[p];
    if(quote){if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='[')throw new SourceKeyError('unsupported_doctype','DTD-Innensubsets benötigen einen vollständigen HTML-Parser',start);
    if(c==='>')return p+1;
  }
  return html.length;
}

function skipComment(html,start) {
  let p=start+4;
  if (html[p]==='>') return p+1;
  if (html[p]==='-' && html[p+1]==='>') return p+2;
  for (;p<html.length;p++) {
    if (html.startsWith('-->',p)) return p+3;
    if (html.startsWith('--!>',p)) return p+4;
  }
  return html.length;
}

function wordAt(html,p,word) {
  return lower(html.slice(p,p+word.length))===word && delimiter(html[p+word.length]);
}

function rawEnd(html,start,name) {
  let state='normal';
  for (let p=start;p<html.length;p++) {
    if (name==='script') {
      if (state==='normal' && html.startsWith('<!--',p)) { state='escaped'; p+=3; continue; }
      if (state!=='normal' && html.startsWith('-->',p)) { state='normal'; p+=2; continue; }
      if (state==='escaped' && html[p]==='<' && wordAt(html,p+1,'script')) { state='double'; p+=6; continue; }
      if (state==='double' && html.startsWith('</',p) && wordAt(html,p+2,'script')) { state='escaped'; p+=7; continue; }
    }
    if (state!=='double' && html.startsWith('</',p) && wordAt(html,p+2,name)) return p;
  }
  return html.length;
}

function openingTags(html) {
  const tags=[],stack=[];
  let p=0;
  const childNamespace=()=>stack.length?stack[stack.length-1].children:'html';
  while (p<html.length) {
    p=html.indexOf('<',p); if(p<0)break;
    if (html.startsWith('<!--',p)) { p=skipComment(html,p); continue; }
    if (html.startsWith('<![CDATA[',p) && stack[stack.length-1]?.namespace!=='html' && stack.length) {
      const end=html.indexOf(']]>',p+9);p=end<0?html.length:end+3;continue;
    }
    if (html[p+1]==='!' || html[p+1]==='?') { p=skipDeclaration(html,p);continue; }
    if (html[p+1]==='/') {
      let end=p+2; while(end<html.length && !space(html[end]) && !['/','>'].includes(html[end]))end++;
      const name=lower(html.slice(p+2,end));
      const match=stack.findLastIndex(item=>item.name===name);
      if(match>=0)stack.length=match;
      p=skipMarkup(html,p);continue;
    }
    if (!letter(html[p+1])) { p++;continue; }
    const tag=startTag(html,p);
    let namespace=childNamespace();
    if(tag.name==='svg')namespace='svg';else if(tag.name==='math')namespace='math';
    if(namespace!=='html' && ['script','style'].includes(tag.name)) throw new SourceKeyError('foreign_raw_text','Script/Style in fremdem Namensraum benötigt einen vollständigen HTML-Parser',p);
    tags.push(tag);p=tag.end;
    let children=namespace;
    if(namespace==='svg' && ['foreignobject','desc','title'].includes(tag.name))children='html';
    if(namespace==='math' && ['mi','mo','mn','ms','mtext'].includes(tag.name))children='html';
    if(namespace==='math' && tag.name==='annotation-xml'){
      const encoding=lower(tag.attrs.get('encoding')?.value||'');
      if(['text/html','application/xhtml+xml'].includes(encoding))children='html';
    }
    if(!(namespace==='html'&&voidTags.has(tag.name)) && !(namespace!=='html'&&tag.selfClosing))stack.push({name:tag.name,namespace,children});
    if(namespace==='html' && tag.name==='plaintext')break;
    if(namespace==='html' && rawTags.has(tag.name))p=rawEnd(html,p,tag.name);
  }
  return tags;
}

function annotateHtml(html) {
  if(typeof html!=='string')throw new TypeError('annotateHtml erwartet einen HTML-String.');
  const tags=openingTags(html),used=new Set();
  let next=1n;
  for(const tag of tags){
    const attr=tag.attrs.get('data-draft-key');if(!attr)continue;
    const key=decodeAttribute(attr.value,attr.offset);
    if(!key.length)throw new SourceKeyError('empty_key','Vorhandener data-draft-key ist leer',attr.offset);
    if(used.has(key))throw new SourceKeyError('duplicate_key','Vorhandener data-draft-key ist nicht eindeutig',attr.offset);
    used.add(key);tag.existing=true;
    const numbered=/^source-([0-9]+)$/.exec(key);
    if(numbered){const candidate=BigInt(numbered[1])+1n;if(candidate>next)next=candidate;}
  }
  const parts=[];let previous=0;
  for(const tag of tags){
    if(tag.existing)continue;
    let key=null;
    const id=tag.attrs.get('id');
    if(id){try{const value=decodeAttribute(id.value,id.offset);if(value&&!used.has('#'+value))key='#'+value;}catch(error){if(!(error instanceof SourceKeyError))throw error;}}
    if(key===null){do{key='source-'+next++;}while(used.has(key));}
    used.add(key);
    parts.push(html.slice(previous,tag.insert),' data-draft-key="'+escapeAttribute(key)+'"');
    previous=tag.insert;
  }
  if(!parts.length)return html;
  parts.push(html.slice(previous));return parts.join('');
}

module.exports={annotateHtml,SourceKeyError};
