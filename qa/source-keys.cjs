'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {annotateHtml,SourceKeyError}=require('../lib/source-keys.cjs');
const checks=[];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function check(name,fn){fn();checks.push(name);}
function insertedOnly(original,annotated){
  const keys=[];let a=0,b=0;
  while(a<original.length || b<annotated.length){
    if(original[a]===annotated[b]){a++;b++;continue;}
    const insertion=/^ data-draft-key="([^"]*)"/.exec(annotated.slice(b));
    assert.ok(insertion,'Unzulässige Änderung bei Originalposition '+a);
    keys.push(insertion[1]);b+=insertion[0].length;
  }
  assert.equal(a,original.length);assert.equal(b,annotated.length);return keys;
}
function invariant(html){const result=annotateHtml(html);insertedOnly(html,result);assert.equal(annotateHtml(result),result);return result;}

check('Frische Tags und IDs: exakte erwartete Instrumentierung',()=>{
  assert.equal(invariant('<main id="root"><div>Text</div><br></main>'),'<main id="root" data-draft-key="#root"><div data-draft-key="source-1">Text</div><br data-draft-key="source-2"></main>');
});
check('Vorhandene Schlüssel bleiben unverändert und werden vorab reserviert',()=>{
  assert.equal(invariant('<div id="x"></div><p DATA-DRAFT-KEY=\'#x\'></p><i data-draft-key="source-7"></i><b></b>'),'<div id="x" data-draft-key="source-8"></div><p DATA-DRAFT-KEY=\'#x\'></p><i data-draft-key="source-7"></i><b data-draft-key="source-9"></b>');
});
check('Größerzeichen und Slash in gequoteten Attributen',()=>{
  const input='<div title=\'a > b / > "c"\' data-json=\'{"n":">"}\'><img alt="a > b" /></div>';
  assert.equal(insertedOnly(input,invariant(input)).length,2);
});
check('Ungequoteter Slash bleibt Teil des ursprünglichen Attributwerts',()=>{
  assert.equal(invariant('<x value=a/><x value="a"/>'),'<x value=a/ data-draft-key="source-1"><x value="a" data-draft-key="source-2"/>');
});
check('Einrückung, Leerzeichen, Zeilenenden und Attribute bleiben bytegleich',()=>{
  invariant('<DIV\r\n  class = "a"\t id = \'A\'   >\r\n  hi\r\n</DIV>');
});
check('Script-Inhalt mit HTML-Strings und Schlüssel-Attrappen bleibt unverändert',()=>{
  const body='const s="<div data-draft-key=\'source-999\'>"; const q="a > b";';
  const html='<script>'+body+'</script><p></p>';
  const out=invariant(html);assert.ok(out.includes('>'+body+'</script>'));assert.ok(out.endsWith('<p data-draft-key="source-2"></p>'));
});
check('Script-Escaped- und Double-Escaped-Zustände',()=>{
  const body='<!--<script>const inner="<div>";</script><span data-draft-key="source-90">-->';
  const input='<script>'+body+'</script><p>danach</p>';
  const out=invariant(input);assert.ok(out.includes('>'+body+'</script>'));assert.ok(out.endsWith('<p data-draft-key="source-2">danach</p>'));
});
check('HTML-Script mit self-closing Schreibweise bleibt Rawtext',()=>{
  const out=invariant('<script/>const x="<b>";</script><p></p>');
  assert.equal(out,'<script data-draft-key="source-1"/>const x="<b>";</script><p data-draft-key="source-2"></p>');
});
check('Style-Inhalt mit Kommentaren und HTML-ähnlichen Strings',()=>{
  const body='/* <i> */ .a::before {content:"<b data-draft-key=\'source-50\'>"}';
  assert.ok(invariant('<style>'+body+'</style><div></div>').includes('>'+body+'</style>'));
});
check('RCDATA und Rawtext: textarea/title/iframe/plaintext',()=>{
  for(const tag of ['textarea','title','iframe','xmp','noscript']){
    const out=invariant('<'+tag+'><b id="literal">x</b></'+tag+'><p></p>');
    assert.equal(insertedOnly('<'+tag+'><b id="literal">x</b></'+tag+'><p></p>',out).length,2);
  }
  assert.equal(invariant('<plaintext><i>literal</i>'),'<plaintext data-draft-key="source-1"><i>literal</i>');
});
check('Kommentare, Doctype und SVG-CDATA werden nicht instrumentiert',()=>{
  const input='<!DOCTYPE html><!-- <div data-draft-key="source-70"> --><svg><![CDATA[<g id="literal">]]><path d="M0 0L1 1"/></svg>';
  assert.equal(insertedOnly(input,invariant(input)).length,2);
  invariant('<!--><p></p><!---><b></b><!-- text --!><i></i>');
});
check('CDATA außerhalb fremder Namensräume und Processing Instructions folgen HTML-Kommentargrenzen',()=>{
  for(const input of ['<![CDATA[<g> <p>x</p>]]><b></b>','<?xml " > <p>x</p>"?><b></b>','<!odd " > <p>x</p>" ><b></b>']){
    assert.equal(insertedOnly(input,invariant(input)).length,2);
  }
});
check('SVG-HTML-Integrationspunkt und HTML-Rawtext darin',()=>{
  const input='<svg><foreignObject><div><textarea><b>literal</b></textarea></div></foreignObject><path/></svg>';
  assert.equal(insertedOnly(input,invariant(input)).length,5);
});
check('HTML-Zeichenreferenzen und sichere Attribut-Escapes',()=>{
  const out=invariant('<div id=\'a>&quot;&amp;\'></div><p id="&#65;&#x42;"></p>');
  assert.ok(out.includes('data-draft-key="#a&gt;&quot;&amp;"'));
  assert.ok(out.includes('data-draft-key="#AB"'));
  invariant('<div data-draft-key="x&#13;&amp;&quot;"></div><p></p>');
});
check('Nicht auflösbare ID-Referenz verwendet stattdessen source-N',()=>{
  assert.equal(invariant('<p id="&copy;"></p>'),'<p id="&copy;" data-draft-key="source-1"></p>');
});
check('Doppelte IDs erzeugen trotzdem eindeutige Keys',()=>{
  const out=invariant('<p id="same"></p><b id="same"></b>');assert.ok(out.includes('data-draft-key="#same"'));assert.ok(out.includes('data-draft-key="source-1"'));
});
check('Vorhandene Nummern außerhalb Number-Präzision werden weitergezählt',()=>{
  assert.equal(invariant('<p data-draft-key="source-9007199254740993"></p><b></b>'),'<p data-draft-key="source-9007199254740993"></p><b data-draft-key="source-9007199254740994"></b>');
});
check('Bereits annotierte Abschnitte bleiben beim Umordnen unverändert',()=>{
  const out=invariant('<section id="a"><p>A</p></section><section id="b"><p>B</p></section>');
  const end=out.indexOf('</section>')+'</section>'.length;
  const reordered=out.slice(end)+out.slice(0,end);assert.equal(annotateHtml(reordered),reordered);
  const extended='<aside>Neu</aside>'+reordered;assert.ok(annotateHtml(extended).startsWith('<aside data-draft-key="source-3">Neu</aside>'));
});
check('Bestehende mehrdeutige oder leere Keys scheitern ausdrücklich',()=>{
  for(const input of ['<p data-draft-key="x"></p><b data-draft-key="x"></b>','<p data-draft-key="a&amp;b"></p><b data-draft-key="a&#38;b"></b>','<p data-draft-key=""></p>','<p data-draft-key="x" DATA-DRAFT-KEY="y"></p>','<p data-draft-key="&copy;"></p>'])assert.throws(()=>annotateHtml(input),SourceKeyError);
});
check('Fehlerhafter Attributabschluss und fremde Script-/Style-Elemente werden abgefangen',()=>{
  assert.throws(()=>annotateHtml('<p title="offen>'),e=>e.code==='unterminated_attribute');
  assert.throws(()=>annotateHtml('<svg><script>const x="<g>";</script></svg>'),e=>e.code==='foreign_raw_text');
  assert.throws(()=>annotateHtml('<svg><style>x{}</style></svg>'),e=>e.code==='foreign_raw_text');
  assert.throws(()=>annotateHtml('<!DOCTYPE html [<!ELEMENT div ANY>]><div></div>'),e=>e.code==='unsupported_doctype');
});
check('Literal kleiner als, nichtlateinischer Text und Verarbeitungsanweisungen bleiben erhalten',()=>{
  invariant('<?xml version="1.0"?><div>2 < 3, Grüße &amp; 日本語, <é></div>');
  assert.equal(annotateHtml('Nur Text < 3'), 'Nur Text < 3');
  assert.throws(()=>annotateHtml(null),TypeError);
});

const args=process.argv.slice(2),workspaceAt=args.indexOf('--workspace');
if(workspaceAt>=0&&!args[workspaceAt+1])throw Error('--workspace benötigt einen ausdrücklich gewählten Arbeitsordner.');
let corpus=null,workingCopy=null;
if(workspaceAt>=0){
  const workspace=path.resolve(args[workspaceAt+1]);
  const htmlPath=path.join(workspace,'hmi.html');
  const original=fs.readFileSync(htmlPath,'utf8');
  const pristinePath=path.join(workspace,'baseline/hmi.html');
  const pristine=fs.existsSync(pristinePath)?fs.readFileSync(pristinePath,'utf8'):original;
  let corpusKeys=0;
  check('Expliziter HMI-Korpus nur im Speicher: ausschließlich Attribute eingefügt',()=>{
    const result=annotateHtml(pristine);const keys=insertedOnly(pristine,result);
    corpusKeys=keys.length;assert.equal(new Set(keys).size,keys.length);assert.equal(annotateHtml(result),result);
    for(const tag of ['script','style']){
      const bodies=text=>Array.from(text.matchAll(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)</'+tag+'\\s*>','gi'))).map(m=>hash(m[1]));
      assert.deepEqual(bodies(result),bodies(pristine));
    }
    const logos=text=>Array.from(text.matchAll(/data:image\/[^;"']+;base64,[A-Za-z0-9+/=]+/g)).map(m=>hash(m[0]));
    assert.deepEqual(logos(result),logos(pristine));
  });
  check('Explizite Arbeitskopie bleibt unverändert und idempotent instrumentierbar',()=>{
    const result=annotateHtml(original);insertedOnly(original,result);assert.equal(annotateHtml(result),result);
    assert.equal(fs.readFileSync(htmlPath,'utf8'),original);
  });
  corpus={path:fs.existsSync(pristinePath)?'baseline/hmi.html':'hmi.html',sha256:hash(pristine),newKeys:corpusKeys,modifiedOnDisk:false};
  workingCopy={path:'hmi.html',sha256:hash(original),modifiedOnDisk:false};
}
const report={passed:true,at:new Date().toISOString(),node:process.version,checks,scope:workspaceAt<0?'portable-parser-core':'explicit-workspace-corpus',corpus,workingCopy,limits:['Vorhandene Schlüssel: numerische und fünf XML-Entities; andere benannte Referenzen werden ausdrücklich abgelehnt.','Script/Style in fremden Namensräumen und DTD-Innensubsets benötigen einen vollständigen HTML-Parser und werden ausdrücklich abgelehnt.'],controllerAccess:false};
fs.writeFileSync(path.join(__dirname,workspaceAt<0?'source-keys-results.json':'source-keys-workspace-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,checks:checks.length,scope:report.scope,newKeys:corpus?.newKeys??null,htmlSha256:corpus?.sha256??null}));
