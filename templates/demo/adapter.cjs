'use strict';
// Neutral offline automation demo. All requests use local sample data.
const fs=require('node:fs');
const path=require('node:path');
const pages=['Hand','Automatik','Bandeinrichtung','Setup','Euromap','EA-Monitor','Status'];
const originalPages=pages;
const browser={projectId:'Automation Demo',workspaceName:'Automation Demo',productName:'Simple-AI-HMI-Editor',defaultPages:pages,originalPages,
  stateValueHints:{'#bandMetric':'band'},
  previewControls:[{key:'sgmReady',label:'SGM-Automatik (ZB2)',off:'Nicht bereit',on:'Bereit'},{key:'band',label:'Bandposition',off:'0 · Kein Loch',on:'1 · Loch erkannt'},{key:'bandValid',label:'Sensorwert gültig',off:'Ungültig',on:'Gültig'},{key:'sim',label:'Sensorquelle',off:'Realer Eingang (Beispiel)',on:'Simulation (Beispiel)'},{key:'io',label:'E/A-Bereitschaft',off:'Verbindung fehlt',on:'Bereit'}],
  previewScenes:[{value:'auto-wait-sgm',label:'Automatik · wartet auf SGM'},{value:'hand-cold',label:'Hand · Kaltstart'},{value:'hand',label:'Hand aktiv'},{value:'hand-ready',label:'Hand vor Start'},{value:'auto',label:'Automatik aktiv'},{value:'auto-ready',label:'Automatik vor Start'},{value:'fault',label:'Fehler vorhanden'},{value:'auto-no-band',label:'Automatik · Band fehlt'},{value:'auto-no-home',label:'Automatik · Grundstellung fehlt'},{value:'io-off',label:'E/A-Verbindung fehlt'}],
  blocks:'.panel,.process,.grid,.quick-grid,.node',
  sourceContract:{pageSelector:'section[data-page]',navigation:'#navigation',showPageFunction:'showPage',commandAttribute:'data-cmd'}};
function capture(){
  const source=fs.readFileSync(path.join(__dirname,'Demo-HMI.html'));
  return {source,html:source.toString('utf8'),version:'demo-1.0',sourceName:'Demo-HMI.html',sourceRef:'Demo-HMI.html'};
}
module.exports={browser,pages,capture,createPreview:require('./preview-controller.cjs').createPreview};
