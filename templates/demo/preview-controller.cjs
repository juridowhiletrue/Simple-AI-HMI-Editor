'use strict';
// Private UI-only test double. No controller client, PLC sequence or Safety simulation.
function createPreview(baseline,monotonicMs=()=>Math.floor(performance.now())){
  const started=Date.now();let enabled=false,lastCommand=null,sequence=1,pendingSetting=null,pendingA6=null,armedToken=0,armedAt=0;
  const HmiHold=1,FaultHold=16,ResultIo=6;
  let clockOffset=0,pendingUi=null,shortReleaseAt=null,handMove=null;
  const shortReleaseDurationMs=8_000;
  const standaloneProcessMask=0x0f;
  // The native layout uses 20 bytes per event plus 12 bytes of ring metadata.
  const logCapacity=50,problemLimit=10,logBytes=20*logCapacity+12;
  const newLogBoot=()=>require('node:crypto').randomBytes(8).toString('hex');
  let logBoot=newLogBoot(),logEntries=[],logSerial=0,loggedFaults=0;
  let logProtected=[],logFirstNormal=0;
  function clearHistory(){
    logEntries=[];logSerial=0;logProtected=[];logFirstNormal=0;loggedFaults=0;logBoot=newLogBoot();
  }
  function problemRow(row){return row[3]===3||row[3]===5||row[3]===18||(row[3]===6&&row[8]===11);}
  function historyMetadata(){
    return {logNewest:logSerial,logFirstNormal,logProtected:logProtected.slice()};
  }
  const now=()=>Date.now()+clockOffset;
  const cycleClock=()=>monotonicMs()+clockOffset;
  const cycleFreshMs=30_000,demoHalfCycleMs=3_000;
  let formWasClosed=false,lastCycleEnd=null,cycleDuration=null;
  let demoForm=false,demoEpoch=null,demoHalf=0;
  function clearCycleMeasurement(){
    formWasClosed=false;lastCycleEnd=null;cycleDuration=null;
  }
  function resetCycleObservation(){
    clearCycleMeasurement();demoEpoch=null;demoHalf=0;
  }
  function canMeasureCycles(){
    // Browser ownership does not determine whether the machine is in continuous production.
    return enabled&&state.boot&&state.io&&state.ack&&state.active&&state.auto&&state.selectedAuto&&
      !state.standalone&&!state.autoWaitingSgm&&!state.toHand&&!state.holds&&!state.tip&&!state.queuedHome&&
      state.job!==1&&state.job!==2&&state.setup.state==='inactive'&&!state.skip.question&&
      !state.profilePending&&!state.networkPending&&Boolean(state.rawBase&1)&&
      !state.forceIn.slice(0,5).some(value=>value>=0)&&!state.forceOut.slice(0,4).some(value=>value>=0);
  }
  // Offline equivalent of Control::scan's cycleClosed -> periodAvailable event:
  // a confirmed closed mould followed by fully open and no longer closed.
  function observeForm(form,at){
    if(form===6){clearCycleMeasurement();return;}
    if(form===4){formWasClosed=true;return;}
    if(form!==2||!formWasClosed)return;
    formWasClosed=false;
    if(lastCycleEnd!==null&&at>lastCycleEnd)cycleDuration=at-lastCycleEnd;
    lastCycleEnd=at;
  }
  function updateCycleMeasurement(){
    if(!canMeasureCycles()){resetCycleObservation();return null;}
    const at=cycleClock();
    if(demoForm){
      if(demoEpoch===null){demoEpoch=at;demoHalf=0;}
      const half=Math.floor((at-demoEpoch)/demoHalfCycleMs);
      // Five alternating states contain the last two full completions even after arbitrarily sparse polling.
      if(half-demoHalf>5){clearCycleMeasurement();demoHalf=half-5;}
      for(let n=demoHalf+1;n<=half;n++)observeForm(n%2?4:2,demoEpoch+n*demoHalfCycleMs);
      demoHalf=half;
      const form=half%2?4:2;
      state.rawBase=(state.rawBase&~6)|form;
      state.effectiveBase=(state.effectiveBase&~6)|form;
    }else observeForm(state.rawBase&6,at);
    if(cycleDuration===null||at-lastCycleEnd>cycleFreshMs)return null;
    return {durationMs:cycleDuration,ageMs:at-lastCycleEnd};
  }
  const setupCommands=['manual,2','manual,3','manual,4','manual,5','manual,8','manual,9','home,1','home,2','home,3','feed1','feed2','both','eject-rear','eject-front','mould-open','mould-close','setup-without-sgm-on','setup-without-sgm-off'];
  const emptySetup=()=>({state:'inactive',withoutSgm:0,busy:0,action:'',reason:'Einrichten aktivieren.',last:'',progress:0,remainingMs:0,feed2Holes:null});
  let bootSerial=require("node:crypto").randomBytes(4).readUInt32LE()||1;
  const nextBoot=()=>bootSerial=(bootSerial+1)>>>0||1;
  let ioFaultLatched=false;
  const original=()=>({
    version:baseline.version,autoWaitingSgm:0,boot:nextBoot(),faultSerial:0,stamp:1,
    owner:0,ownerName:'HMI-Draft',ownerConnected:1,clientNetwork:'LAN',ownerNetwork:'LAN',
    io:1,ext:2,sim:0,standalone:0,released:0,auto:0,selectedAuto:0,active:0,toHand:0,holds:0,tip:0,
    job:0,step:0,pending:0,stepToken:1,jobNumber:0,band:1,bandValid:1,holes:0,rawBase:19,effectiveBase:19,
    rawExt:[0,1],effectiveExt:[0,1],forceExt:Array(32).fill(-1),normal:0,issued:0,gate:0,homeMask:0,queuedHome:0,ack:1,faultHome:1,
    proofs:[0,0,0,0,0,0],fault:Array(8).fill(0),positions:[-1,-1,-1,-1,-1],waiting:Array(5).fill(0),
    times:[1000,1000,300,300,300,300,1000,1000,300,300],autoTargets:3,limits:[0,0,0],
    forceIn:Array(6).fill(-1),forceOut:Array(14).fill(-1),unlocked:0,forcing:0,a6Challenge:0,
    stored:1,installed:[0,0,0],lan:1,wifi:0,wifiEnabled:0,networkPending:0,profilePending:0,
    configPending:0,storageError:0,configGeneration:1,gapMs:4,logCount:0,
    startCondition:'',setup:emptySetup(),
    shortRelease:{direction:0,remainingMs:0},mouldRelease:{direction:0,remainingMs:0},
    loop:{requested:0,active:0,remaining:0,completed:0,serial:0,state:0},
    skip:{mode:2,seconds:20,requested:0,active:0,question:0,source:0,token:0,serial:0,last:0,elapsedMs:0,pending:0,stored:1,storageError:0,generation:1}
  });
  let state=original(),simulatedBand=1;
  // Source-shaped numeric event rows; selection and retention use RAM only.
  function recordEvent(code,result=0,override={}){
    if(!enabled)return;
    const fault=state.fault;
    const number=++logSerial;
    const row=[number,code===3?fault[7]:Math.max(0,now()-started)>>>0,state.jobNumber>>>0,code,state.holds,
      code===3?fault[1]:override.job??state.job,code===3?fault[2]:override.step??state.step,
      code===3?fault[4]:state.holes,code===3?fault[0]:result];
    if(code===3){loggedFaults++;state.faultSerial=(state.faultSerial+1)>>>0||1;}
    if(problemRow(row)){
      if(logProtected.length===problemLimit)logProtected.shift();
      logProtected.push(number);
    }
    if(logEntries.length===logCapacity){
      const oldestUnprotected=logEntries.findIndex(event=>!logProtected.includes(event[0]));
      logEntries.splice(oldestUnprotected,1);
    }
    logEntries.push(row);
    logFirstNormal=logEntries.find(event=>!logProtected.includes(event[0]))?.[0]??0;
    state.logCount=logEntries.length;
  }
  function logChanges(before){
    if(before.step!==state.step)recordEvent(1);
    if(before.pending!==state.pending&&state.pending)recordEvent(8,0,{step:state.pending});
    if(before.holds!==state.holds)recordEvent((state.holds&4)&&!(before.holds&4)?18:2);
    if(before.loggedFaults===loggedFaults&&before.fault!==state.fault[0]+':'+state.fault[7]&&state.fault[0])recordEvent(3);
  }
  const logSnapshot=()=>({step:state.step,pending:state.pending,holds:state.holds,fault:state.fault[0]+':'+state.fault[7],loggedFaults,ownerConnected:state.ownerConnected});
  function logPage(url){
    const value=url.searchParams.get('before');
    if(value!==null&&(!/^\d+$/.test(value)||Number(value)>0xffffffff))throw Error('Ungültige Meldungsgrenze.');
    const before=Number(value||0);
    const problems=url.searchParams.get('problems')==='1';
    const rows=problems?logEntries.filter(row=>logProtected.includes(row[0])):logEntries;
    let finish=rows.length;
    if(before)while(finish&&((rows[finish-1][0]-before)|0)>=0)finish--;
    const begin=Math.max(0,finish-20);
    return {entries:rows.slice(begin,finish).map(row=>row.slice()),count:logEntries.length,more:Number(begin>0),
      capacity:logCapacity,bytes:logBytes,boot:logBoot,...historyMetadata()};
  }
  function expirePreviewForces(){
    const has=(values)=>values.some(value=>value>=0);
    const any=has(state.forceIn)||has(state.forceOut)||has(state.forceExt);
    const fake=has(state.forceIn.slice(0,5))||state.forceExt[16]>=0;
    const process=fake||has(state.forceOut)||state.installed.some((installed,i)=>installed&&state.forceExt[17+i]>=0);
    for(let i=4;i<state.forceOut.length;i++)if(state.forceOut[i]>=0){
      const valve=(i-4)>>1;state.positions[valve]=-1;state.homeMask&=~(valve<3?1:2);
    }
    state.forceIn.fill(-1);state.forceOut.fill(-1);state.forceExt.fill(-1);
    state.forcing=state.unlocked=state.a6Challenge=armedToken=0;pendingA6=null;
    if(process){state.holds|=8;state.active=state.autoWaitingSgm=0;state.skip.requested=state.skip.active=state.skip.question=state.skip.token=0;}
    if(fake){invalidateProofs();state.homeMask&=~2;}
    if(any)recordEvent(5);
  }
  function invalidateProofs(){state.proofs=[0,0,0,0,0,0];}

  // Independent, bounded helper release. Does not create, queue or alter a setup movement.
  function shortReleaseGuard(kind='eject',ongoing=false){
    if(!enabled||!state.ownerConnected)return 'Bedienung übernehmen.';
    if(!state.io)return 'E/A-Verbindung wiederherstellen.';
    if(setupWithoutSgm())return 'Mit SGM erforderlich.';
    if(state.toHand||state.profilePending||state.networkPending)return 'Betriebsarten-/Profil-/Netzübergang abwarten.';
    if(kind==='mould'){
      if(state.setup.state!=='active')return 'Einrichten zuerst aktivieren.';
      if(state.sim||[...state.forceOut,...state.forceIn,...state.forceExt].some(value=>value>=0))return 'Alle Forces und Sensorsimulationen beenden.';
      if(!state.ack||!state.faultHome||state.job||state.holds||state.proofs[4])return 'Störung, Bewegung oder Halt aktiv.';
      if((state.installed[1]&&(state.effectiveExt[1]&4))||(state.installed[2]&&!(state.effectiveExt[1]&8)))return 'Abwickelpause oder Bandende aktiv.';
      if(!(state.effectiveBase&1)||(state.effectiveBase&4)||(!ongoing&&!(state.effectiveBase&2)))return 'Offene Form und SGM-Bereitschaft erforderlich.';
      if(!(state.effectiveBase&16)||(state.effectiveBase&8))return 'Auswerfer muss hinten sein.';
      if(!state.bandValid||!state.band)return 'Gültige Bandposition erforderlich.';
      if(!state.proofs[2]||!(state.homeMask&2)||state.positions[3]!==0||state.positions[4]!==1)return 'Vorschub 2 grundstellen und Übergabe nachweisen.';
    }else if(state.forceOut[0]>=0||state.forceOut[2]>=0)return 'Auswerfer-Forces auf Normal zurückstellen.';
    return '';
  }
  // One short release at a time across both cards; expiry is independent of page and poll rate.
  // Only the wired close permission may affect the simulated output mask.
  function cancelShortRelease(){
    shortReleaseAt=null;
    state.shortRelease={direction:0,remainingMs:0};
    state.mouldRelease={direction:0,remainingMs:0};
  }
  function beginShortRelease(direction,kind='eject'){
    cancelShortRelease();
    shortReleaseAt=now();
    const release=kind==='mould'?state.mouldRelease:state.shortRelease;
    release.direction=direction;
    release.remainingMs=shortReleaseDurationMs;
  }
  function advanceShortRelease(){
    if(shortReleaseAt===null)return;
    const mould=Boolean(state.mouldRelease.direction);
    const remaining=Math.max(0,shortReleaseDurationMs-(now()-shortReleaseAt));
    if(!remaining||shortReleaseGuard(mould?'mould':'eject',true)){
      cancelShortRelease();
      return;
    }
    (mould?state.mouldRelease:state.shortRelease).remainingMs=remaining;
  }
  function automaticCondition(){
    if(!state.io)return 'E/A-Verbindung wiederherstellen';
    if(state.toHand)return 'Begonnene Einzelbewegung wird beendet';
    if(!state.selectedAuto)return '';
    if(!state.ack)return 'Fehler prüfen und quittieren; Korrektur in Hand oder Einrichten möglich';
    const inputs=state.effectiveBase;
    if(!(inputs&1))return 'Warte auf Spritzgussautomatik';
    if(state.installed[2]&&!(state.effectiveExt[1]&8))return 'Bandende: Band bereitstellen';
    if(!state.bandValid)return 'Bandpositionssensor liefert keinen gueltigen Wert';
    if(!state.band)return 'Band in Lochposition bringen (Bandposition muss 1 sein)';
    if((inputs&6)===6)return 'SGM meldet Form offen und geschlossen gleichzeitig';
    if(!(inputs&6))return 'SGM-Formstellung offen oder geschlossen abwarten';
    if((inputs&24)===24)return 'SGM meldet Auswerfer vorne und hinten gleichzeitig';
    if(!(inputs&24))return 'Auswerferstellung herstellen; Kurzfreigaben vor/zurueck verwenden';
    if((state.autoTargets&1)||state.loop.requested>0||!state.faultHome){
      if(state.positions[0]<0)return 'Vorschub 1: Stellung unbekannt; bewusst Hand Zurueck ausfuehren';
      if(state.positions[0]!==0)return 'Vorschub 1 zuerst in Hand zurueckfahren';
    }
    if(state.positions[3]<0)return 'Vorschub 2: Stellung unbekannt; bewusst Handbewegung ausfuehren';
    if(state.positions[4]<0)return 'Zange 2: Stellung unbekannt; bewusst Handbewegung ausfuehren';
    if(!state.positions[3]&&state.positions[4]!==1)return 'Zange 2 in hinterer Vorschubstellung schliessen';
    if(state.positions[3]===1&&!(inputs&2))return 'Form fuer die Vorschub-2-Uebergabe oeffnen';
    if(state.positions[3]===1&&(inputs&8)&&state.positions[4]!==1)return 'Zange 2 vor Auswerferrueckfahrt schliessen';
    return '';
  }
  function prepareAutomatic(){
    state.autoWaitingSgm=0;
    if(state.positions[0]===0)state.homeMask|=1;
    if(state.positions[3]===0)state.homeMask|=2;
    if(state.homeMask===3)state.faultHome=1;
  }
  function ioFault(){
    if(ioFaultLatched)return;ioFaultLatched=true;
    const failedJob=state.job,failedStep=state.step;
    const source=failedJob?(state.setup.state==='active'?1:state.auto?2:1):0;
    state.fault=[1,failedJob,failedStep,source,state.holes,state.band,0,Math.max(0,now()-started)];
    recordEvent(3);clearUi();state.positions.fill(-1);state.homeMask=0;state.normal=0;state.active=0;state.autoWaitingSgm=0;
    state.ack=state.faultHome=0;state.holds|=HmiHold|FaultHold;
    invalidateProofs();
  }
  // The local choice overlays the four process releases used by standalone mode.
  // Never modify the saved profile, safety wiring, SGM inputs, or position reports.
  function setupWithoutSgm(){
    return Boolean(state.standalone||(state.setup.state==='active'&&state.setup.withoutSgm));
  }
  function visibleNormal(){
    return state.setup.withoutSgm?state.normal|standaloneProcessMask:state.normal;
  }
  function localProfileConflict(){
    return !enabled||!state.io||!state.ownerConnected||state.toHand||state.profilePending||
      state.networkPending||state.forceOut.slice(0,4).some(value=>value>=0);
  }
  function endLocalProfile(){
    if(!state.setup.withoutSgm)return;
    state.setup.withoutSgm=0;
    if(!pendingUi)return;
    // An interrupted offline setup sequence must not resume using the other profile.
    const {kind,target,valve}=pendingUi;
    if(kind==='manual')state.positions[valve]=-1;
    else {
      for(let i=0;i<state.positions.length;i++)if(target&(i<3?1:2))state.positions[i]=-1;
    }
    state.homeMask&=~(kind==='manual'?(valve<3?1:2):target);
    invalidateProofs();state.waiting.fill(0);pendingUi=null;
    state.job=state.step=state.pending=0;
    state.setup.busy=state.setup.progress=state.setup.remainingMs=0;state.setup.action='';
    state.setup.last='Einrichtaktion unterbrochen · Stellung prüfen.';
    state.active=state.autoWaitingSgm=0;state.holds|=HmiHold;
  }
  function actionGuard(command){
    if(!enabled)return 'Bedienung nicht freigegeben.';
    if(!state.ownerConnected)return 'Bedienung übernehmen.';
    if(state.setup.state!=='active')return 'Einrichten zuerst aktivieren.';
    if(!state.io)return 'E/A-Verbindung fehlt.';
    if(state.profilePending||state.networkPending)return 'Einstellungswechsel läuft.';
    if(command==='eject-rear'||command==='eject-front')return shortReleaseGuard();
    if(command==='mould-open')return 'Form öffnen: EUROMAP A7 ist unbelegt.';
    if(command==='mould-close')return shortReleaseGuard('mould');
    if(state.mouldRelease.direction&&state.mouldRelease.remainingMs)return 'Formschließfreigabe beenden oder Stopp betätigen.';
    if(command==='setup-without-sgm-on'||command==='setup-without-sgm-off'){
      if(state.standalone)return 'Ohne SGM bereits im Setup eingestellt.';
      if(state.toHand||state.setup.busy)return 'Laufende Einrichtaktion abwarten.';
      if(state.forceOut.slice(0,4).some(value=>value>=0))return 'EUROMAP-Ausgangsforce auf Normal zurückstellen.';
      if(command==='setup-without-sgm-on'&&state.setup.withoutSgm)return 'Ohne SGM bereits aktiv.';
      if(command==='setup-without-sgm-off'&&!state.setup.withoutSgm)return 'Ohne SGM ist aus.';
      return '';
    }
    const manual=command.startsWith('manual,'),home=command.startsWith('home,');
    const target=home?Number(command.split(',')[1]):command==='feed1'?1:command==='feed2'?2:command==='both'?3:0;
    const valveMask=manual?(3<<(Number(command.split(',')[1])&~1)):((target&1)?63:0)|((target&2)?960:0);
    if(state.forceOut.slice(4).some((value,i)=>value>=0&&(valveMask&(1<<i))))return 'Ventilausgangsforce auf Normal zurückstellen.';
    if(state.setup.busy||state.toHand)return 'Laufende Einzelbewegung abwarten';
    if(state.holds&8)return 'Haltegrund beseitigen (Pause, Bandende oder Force)';
    if(manual)return '';
    if(!home){
      if(!state.ack)return 'Fehler quittieren';
      if((state.holds&(FaultHold|4|2))||(state.installed[1]&&(state.effectiveExt[1]&4))||
          (state.installed[2]&&!(state.effectiveExt[1]&8)))return 'Haltegrund beseitigen (Pause, Bandende oder Force)';
      if((state.homeMask&target)!==target||!state.faultHome)return 'Gewählten Vorschub grundstellen';
    }
    if(target&2){
      if(!state.bandValid)return 'Kein gültiges Bandpositionssignal';
      if(!state.band)return 'Band in Lochposition bringen';
      if(!setupWithoutSgm()){
        const inputs=state.effectiveBase;
        if(!(inputs&1))return 'Warte auf Spritzgussautomatik';
        if(!(inputs&2)||(inputs&4))return 'Offene Form abwarten';
        if((inputs&24)===0||(inputs&24)===24||(!home&&!(inputs&16)))return 'Auswerferstellung prüfen';
      }
      if(!home&&(state.positions[3]!==0||state.positions[4]!==1))return 'Vorschub 2 zurückfahren und Zange 2 schließen';
    }
    return '';
  }
  function capabilities(){
    const blocked={},allowed=[];for(const cmd of setupCommands){const reason=actionGuard(cmd);if(reason)blocked[cmd]=reason;else allowed.push(cmd);}
    const enterReason=!enabled?'Bedienung nicht freigegeben.':!state.ownerConnected?'Bedienung übernehmen.':!state.io?'E/A-Verbindung wiederherstellen.':state.profilePending||state.networkPending?'Einstellungswechsel läuft.':state.toHand?'Einrichten momentan nicht verfügbar.':!state.standalone&&state.forceOut.slice(0,4).some(v=>v>=0)?'EUROMAP-Ausgangsforce auf Normal zurückstellen.':state.setup.state!=='inactive'?'Bandeinrichtung ist bereits angefordert oder aktiv.':'';
    const exitReason=!enabled?'Bedienung nicht freigegeben.':!state.ownerConnected?'Bedienung übernehmen.':!state.io?'E/A-Verbindung wiederherstellen.':state.setup.state!=='active'?'Bandeinrichtung ist noch nicht aktiv.':state.setup.busy?'Laufende Einrichtaktion abwarten.':'';
    return {allowed,blocked,canEnter:Number(!enterReason),enterReason,canExit:Number(!exitReason),exitReason};
  }
  function enterReady(){
    state.setup.state='active';state.setup.busy=0;state.setup.action='';state.setup.progress=100;state.setup.remainingMs=0;
    state.setup.last='Einrichten aktiv · Automatik angehalten.';
    state.active=0;state.autoWaitingSgm=0;state.selectedAuto=state.auto=Number(!state.standalone);state.holds&=~HmiHold;
    if(state.standalone){state.released=1;state.normal=standaloneProcessMask;}
    state.job=state.step=state.pending=state.queuedHome=0;
    cancelShortRelease();pendingUi=null;recordEvent(11,1);
  }
  // Offline fixture for V2's forward stroke. Replay all crossed signal edges even
  // if the browser polls slowly; a forced constant value yields no rising edges.
  function sampleSetupHoles(item,elapsed){
    const approach=item.duration/8,stroke=item.duration*3/4;
    const forwardAge=Math.max(0,elapsed-approach);
    const phase=Math.min(8,Math.floor(forwardAge*9/stroke));
    // refresh() reconstructed the input from the configured source before this call.
    const override=state.forceExt[16],inputBand=state.band;
    const sampleBand=phase=>override>=0?override:Number(Boolean(inputBand)&&phase%2===0);
    const observe=level=>{
      if(state.bandValid&&!item.previousBand&&level)++state.holes;
      item.previousBand=level;
    };
    if(elapsed>=approach){
      // Nine sensor phases cover the replayed forward stroke.
      while(item.bandPhase<phase)observe(sampleBand(++item.bandPhase));
      observe(sampleBand(phase));
    }
    state.setup.feed2Holes=state.holes;
    const level=sampleBand(phase);
    state.band=level;
    state.effectiveExt[1]=(state.effectiveExt[1]&~1)|level;
    if(!state.bandValid)return 6;
    if(elapsed>=approach+stroke)return !level?4:state.holes!==4?3:0;
    return 0;
  }
  function failSetupSample(code){
    state.fault=[code,state.job,state.step,1,state.holes,state.band,state.bandValid,Math.max(0,now()-started)];
    state.ack=state.faultHome=state.active=0;state.holds|=FaultHold;
    state.setup.last=code===6?'Bandpositionssignal ungültig.':code===4?'Band nicht in Endposition.':'Lochzahl prüfen.';
    state.setup.busy=0;state.setup.action='';state.setup.remainingMs=0;
    state.setup.withoutSgm=0;
    state.job=state.step=state.pending=0;pendingUi=null;recordEvent(3);
  }
  // Scaled UI animation. Each entry represents the write of one Control.cpp
  // step. Positions are applied on reaching the step, even with sparse polling.
  const [back1,forward1,open1,grip1,release,clamp,back2,forward2,open2,grip2] =
    Array.from({length:10},(_,i)=>i);
  const homeMotion=[
    [0,1,[]], [0.04,2,[clamp,grip2]], [0.32,4,[open1,open2]],
    [0.55,5,[back1,back2]], [0.80,6,[grip2]]
  ];
  const feedMotion=[
    [0,9,[grip1,grip2]], [0.065,10,[release]], [0.125,12,[forward1,forward2]],
    [0.875,13,[clamp]], [0.91,14,[open1]], [0.935,15,[open2]],
    [0.955,16,[back1,back2]], [0.98,17,[grip2]]
  ];
  function fixtureElapsed(item){
    const elapsed=Math.max(0,now()-item.started);
    // At HomeClamp the real sequence requires the rear ejector signal and a
    // valid hole before it issues HomeOpen. Keep the affected commands visible.
    if(item.kind==='home'&&(item.target&2)&&!setupWithoutSgm()){
      const gate=item.duration*homeMotion[2][0];
      const blocked=(state.effectiveBase&24)!==16||!state.bandValid||!state.band;
      if(item.waitingRear){
        item.started+=elapsed-gate;
        item.waitingRear=blocked;
        return blocked?gate-1:gate;
      }
      if(item.phaseIndex<=2&&elapsed>=gate&&blocked){
        item.started=now()-gate;
        item.waitingRear=true;
        return gate-1;
      }
    }
    return elapsed;
  }
  function advanceFixture(item,elapsed){
    const plan=item.kind==='home'?homeMotion:feedMotion;
    while(item.phaseIndex<plan.length){
      const phase=plan[item.phaseIndex],fraction=phase[0];
      if(elapsed<item.duration*fraction)break;
      item.phaseIndex++;
      let [,step,moves]=phase;
      // Without a coupled V2, both grippers that take part open in Step::Open.
      if(item.kind==='feed'&&(setupWithoutSgm()||!(item.target&2))){
        if(step===15)continue;
        if(step===14){step=15;moves=[open1,open2];}
      }
      const applicable=moves.filter(move=>item.target&(move<6?1:2));
      if(moves.length&&!applicable.length)continue;
      state.step=step;
      for(const move of applicable)state.positions[Math.floor(move/2)]=move%2;
    }
    if(item.waitingRear&&(state.effectiveBase&8))state.step=3;
  }
  // Control::remaining reports the selected direction's travel time, at least
  // 100 ms. Control::phaseDone also waits for 20 ms off time after that pulse.
  function startHandMove(move){
    const valve=move>>1,duration=Math.max(100,state.times[move]);
    handMove={valve,at:cycleClock(),duration,busyFor:Math.max(duration,120)};
    state.job=1;state.step=8;state.pending=0;state.stepToken++;
    state.positions[valve]=move%2;state.waiting[valve]=duration;
    if(move>=6){invalidateProofs();state.holes=0;}
    if(valve===0||valve===3)state.homeMask&=~(valve===0?1:2);
  }
  function advanceHandMove(){
    if(!handMove)return;
    const elapsed=Math.max(0,cycleClock()-handMove.at);
    state.waiting[handMove.valve]=Math.max(0,handMove.duration-elapsed);
    const drain=Math.max(0,handMove.busyFor-elapsed);
    if(state.setup.state==='requested'){
      state.setup.remainingMs=drain;state.setup.progress=Math.round(100*(1-drain/handMove.busyFor));
    }
    if(drain)return;
    handMove=null;state.job=state.step=state.pending=0;state.stepToken++;
    if(state.toHand){
      state.toHand=0;state.auto=state.selectedAuto;state.active=0;state.holds|=HmiHold;invalidateProofs();
    }else if(state.setup.state==='requested')enterReady();
  }
  function coldHandStart(){
    state.active=state.auto=state.selectedAuto=state.toHand=0;state.homeMask=0;
    state.holds=0;state.holes=0;state.positions.fill(-1);state.waiting.fill(0);invalidateProofs();
  }
  function advanceUi(){
    if(!pendingUi)return;
    const item=pendingUi,elapsed=fixtureElapsed(item),remaining=Math.max(0,item.duration-elapsed);
    state.setup.remainingMs=remaining;state.setup.progress=Math.min(100,Math.round(elapsed/item.duration*100));
    if(item.bandPhase!==undefined){
      // A fault in the forward stroke prevents all subsequent commands.
      advanceFixture(item,Math.min(elapsed,item.duration*0.875-1));
      const fault=sampleSetupHoles(item,elapsed);
      if(fault){failSetupSample(fault);return;}
    }
    if(item.phaseIndex!==undefined)advanceFixture(item,elapsed);
    if(item.valve!==undefined)state.waiting[item.valve]=remaining;
    if(remaining)return;
    if(item.kind==='entry'){enterReady();return;}
    if(item.kind==='home'){
      if(item.target&2)state.proofs[0]=state.proofs[2]=1;
      state.homeMask|=item.target;state.faultHome=state.faultHome||Number(state.homeMask===3);state.setup.last='Grundstellung '+(item.target===1?'V1':item.target===2?'V2 (SGM)':'beide')+' beendet.';
    }else if(item.kind==='feed'){
      if(item.target&2)state.proofs[1]=1;
      state.homeMask|=item.target;state.setup.last='Ein Takt '+(item.target===1?'V1':item.target===2?'V2 (SGM)':'beide')+' beendet.';
    }else state.setup.last='Einzelbefehl beendet.';
    recordEvent(13,1);
    state.job=state.step=state.pending=0;state.waiting.fill(0);state.active=0;state.holds&=~HmiHold;
    state.setup.busy=0;state.setup.action='';state.setup.progress=100;pendingUi=null;
  }
  function refresh(){
    state.effectiveExt=state.rawExt.slice();
    if(state.sim)state.effectiveExt[1]=(state.effectiveExt[1]&~1)|simulatedBand;
    state.forceExt.forEach((value,index)=>{if(value<0)return;const module=Math.floor(index/16),mask=1<<(index%16);state.effectiveExt[module]=value?state.effectiveExt[module]|mask:state.effectiveExt[module]&~mask;});
    state.band=state.forceExt[16]>=0?state.forceExt[16]:state.sim?simulatedBand:Number(!!(state.rawExt[1]&1));
    state.effectiveBase=state.rawBase;
    state.forceIn.forEach((v,i)=>{if(v>=0)state.effectiveBase=v?state.effectiveBase|(1<<i):state.effectiveBase&~(1<<i);});
    if(state.io||!enabled)ioFaultLatched=false;else ioFault();
    state.automaticCycle=updateCycleMeasurement();
    if(state.setup.withoutSgm&&(localProfileConflict()||state.standalone))endLocalProfile();
    advanceShortRelease();advanceHandMove();advanceUi();
    // A forced bistable coil can contradict its normal command. Keep the
    // last position unknown after force ends, until this valve is issued again.
    for(let valve=0;valve<state.positions.length;valve++){
      const coil=4+2*valve;
      if(state.forceOut[coil]>=0||state.forceOut[coil+1]>=0)state.positions[valve]=-1;
    }
    state.forcing=Number([...state.forceIn,...state.forceOut,...state.forceExt].some(v=>v>=0));
    if(!state.standalone&&state.setup.state==='active')state.normal&=~15;
    state.issued=visibleNormal();if(state.mouldRelease.direction===2)state.issued=(state.issued&~7)|2;if(state.shortRelease.direction)state.issued=(state.issued&~5)|(state.shortRelease.direction===1?4:1);state.forceOut.forEach((v,i)=>{if(v>=0)state.issued=v?state.issued|(1<<i):state.issued&~(1<<i);});
    state.startCondition=automaticCondition();
    if(state.autoWaitingSgm){
      state.normal=0;
      if(state.active&&state.auto&&state.setup.state==='inactive'&&!state.holds&&!state.startCondition)prepareAutomatic();
    }
    if(!state.io||state.profilePending||state.networkPending)state.issued=0;
    state.logCount=logEntries.length;
    state.setup.reason=state.setup.state==='requested'?'Geordneten Halt abwarten.':state.setup.state==='active'?(!state.io?'E/A-Verbindung wiederherstellen.':!state.ownerConnected?'Bedienung übernehmen.':state.setup.busy?'Einrichtaktion läuft.':'Automatik angehalten.'):'Einrichten aktivieren.';
  }
  function values(){refresh();const {testSsid,testPassword,...visible}=structuredClone(state);if(pendingUi?.bandPhase!==undefined&&!state.sim&&state.forceExt[16]<0)
      visible.rawExt[1]=(visible.rawExt[1]&~1)|state.band;
    visible.normal=visibleNormal();if(state.setup.withoutSgm)visible.released=1;
    visible.setup={...visible.setup,effectiveWithoutSgm:Number(setupWithoutSgm()),...capabilities()};return {...visible,logBoot,...historyMetadata(),sgmReady:Number(!!(state.rawBase&1)),enabled,lastCommand,draftOnly:true,scope:'ui-test-only'};}
  function clearUi(){handMove=null;resetCycleObservation();endLocalProfile();state.autoWaitingSgm=0;cancelShortRelease();pendingUi=null;state.setup=emptySetup();state.waiting.fill(0);state.job=state.step=state.pending=0;}
  function configure(input={}){
    const observed=logSnapshot();
    const bootHand=!input.scene&&(input.reset||(!enabled&&input.enabled===true));
    if(input.reset||input.enabled===false){demoForm=false;handMove=null;resetCycleObservation();}
    if(typeof input.enabled==='boolean'){
      if(enabled&&!input.enabled){clearHistory();state=original();simulatedBand=1;pendingSetting=pendingA6=null;armedToken=0;pendingUi=null;shortReleaseAt=null;clockOffset=0;}
      if(!enabled&&input.enabled){state.active=1;enabled=true;recordEvent(0);}enabled=input.enabled;
    }
    if(input.reset){state=original();simulatedBand=1;pendingSetting=pendingA6=null;armedToken=0;lastCommand=null;pendingUi=null;shortReleaseAt=null;clockOffset=0;clearHistory();if(enabled){state.active=1;recordEvent(0);}}
    if(bootHand)coldHandStart();
    if(input.scene){
      demoForm=input.scene==='auto';resetCycleObservation();
      const scenes={'hand-cold':{auto:0,selectedAuto:0,active:0},'auto-wait-sgm':{auto:1,selectedAuto:1,active:1},hand:{auto:0,selectedAuto:0,active:1},'hand-ready':{auto:0,selectedAuto:0,active:0},auto:{auto:1,selectedAuto:1,active:1},'auto-ready':{auto:1,selectedAuto:1,active:0},'auto-no-band':{auto:1,selectedAuto:1,active:0},'auto-no-home':{auto:1,selectedAuto:1,active:0},'io-off':{auto:1,selectedAuto:1,active:0}};
      if(input.scene==='fault'){
        clearUi();state.fault=[1,state.job,state.step,0,state.holes,state.band,state.bandValid,Math.max(0,now()-started)];state.ack=state.faultHome=state.active=0;state.holds|=FaultHold|HmiHold;recordEvent(3);
      }else if(scenes[input.scene]){
        clearUi();Object.assign(state,scenes[input.scene]);state.fault.fill(0);state.ack=state.faultHome=state.io=state.ownerConnected=state.bandValid=1;state.homeMask=3;state.holds&=~(FaultHold|HmiHold);
        state.positions=[0,0,1,0,1];state.proofs=[1,1,1,0,0,0];state.holes=4;state.toHand=0;
        state.rawExt[1]|=1;state.rawBase|=1;state.normal=0;
        if(input.scene==='auto-wait-sgm'){state.rawBase&=~1;state.autoWaitingSgm=1;}
        if(input.scene==='auto-no-band')state.rawExt[1]&=~1;
        if(input.scene==='auto-no-home'){state.homeMask=0;state.positions=[-1,-1,-1,-1,-1];}
        if(input.scene==='io-off')state.io=0;
        if(input.scene==='hand-cold')coldHandStart();
      }
    }
    const patch=input.values||{};
    if(demoForm&&Number.isInteger(patch.rawBase)&&patch.rawBase>=0&&patch.rawBase<=255){
      // Explicit raw inputs take ownership of this fixture until the scene is chosen again.
      demoForm=false;resetCycleObservation();
    }
    if('sgmReady' in patch){if(Number(patch.sgmReady))state.rawBase|=1;else state.rawBase&=~1;}
    if('sim' in patch){if(!state.sim&&Number(patch.sim))simulatedBand=state.band;state.sim=Number(!!Number(patch.sim));}
    if('band' in patch){state.band=Number(!!Number(patch.band));if(state.sim)simulatedBand=state.band;else state.rawExt[1]=state.band?(state.rawExt[1]|1):(state.rawExt[1]&~1);}
    for(const key of ['bandValid','io','active','standalone','ownerConnected','ack','faultHome','tip','selectedAuto','auto','toHand','resumingTransfer','profilePending','networkPending'])if(key in patch)state[key]=Number(!!Number(patch[key]));
    for(const [key,max]of [['homeMask',3],['rawBase',255],['holds',31],['job',8],['step',24],['pending',24],['jobNumber',0xffffffff],['holes',255],['queuedHome',3]])if(Number.isInteger(patch[key])&&patch[key]>=0&&patch[key]<=max)state[key]=patch[key];
    if(Array.isArray(patch.positions)&&patch.positions.length===5&&patch.positions.every(n=>[-1,0,1].includes(n)))state.positions=patch.positions.slice();
    if(Array.isArray(patch.forceOut)&&patch.forceOut.length===14&&patch.forceOut.every(n=>[-1,0,1].includes(n)))state.forceOut=patch.forceOut.slice();
    if(Array.isArray(patch.proofs)&&patch.proofs.length===6&&patch.proofs.every(n=>n===0||n===1))state.proofs=patch.proofs.slice();
    if(Array.isArray(patch.rawExt)&&patch.rawExt.length===2&&patch.rawExt.every(n=>Number.isInteger(n)&&n>=0&&n<=65535))state.rawExt=patch.rawExt.slice();
    if(Array.isArray(patch.fault)&&patch.fault.length===8&&patch.fault.every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff)&&patch.fault[0]<=10&&patch.fault[1]<=8&&patch.fault[2]<=24&&patch.fault[3]<=3&&patch.fault[5]<=1&&patch.fault[6]<=1)state.fault=patch.fault.slice();
    if(state.standalone)state.auto=state.selectedAuto=0;
    if(Number.isFinite(input.advanceMs)&&input.advanceMs>=0&&input.advanceMs<=60000)clockOffset+=input.advanceMs;
    if(!input.reset&&observed.ownerConnected&&!state.ownerConnected)expirePreviewForces();
    const result=values();
    if(!input.reset)logChanges(observed);else if(enabled&&state.fault[0]&&!loggedFaults)recordEvent(3);
    return {...result,faultSerial:state.faultSerial,logCount:logEntries.length,...historyMetadata()};
  }
  function setupAction(command,result){
    if(!setupCommands.includes(command))return {...result,result:8};
    const reason=actionGuard(command);
    if(reason)return {...result,result:16,reason};
    if(command==='eject-rear'||command==='eject-front'){beginShortRelease(command==='eject-front'?1:2);return result;}
    if(command==='mould-close'){beginShortRelease(2,'mould');return result;}
    if(command==='setup-without-sgm-on'||command==='setup-without-sgm-off'){
      cancelShortRelease();
      state.setup.withoutSgm=Number(command==='setup-without-sgm-on');
      return result;
    }
    const [name,field]=command.split(','),arg=Number(field);
    let kind=name==='manual'?'manual':name==='home'?'home':'feed';
    const target=kind==='home'?arg:command==='feed1'?1:command==='feed2'?2:3;
    const duration=kind==='manual'?Math.min(2000,Math.max(150,state.times[arg]||300)):kind==='home'?800:target===1?1200:3600;
    pendingUi={kind,command,target,started:now(),duration};
    state.setup.busy=1;state.setup.action=command;state.setup.progress=0;state.setup.remainingMs=duration;state.setup.last='';
    state.active=0;state.holds&=~HmiHold;state.job=kind==='manual'?1:kind==='home'?2:target===1?3:target===2?4:5;state.step=kind==='manual'?8:kind==='home'?1:9;
    if(kind==='manual'){
      pendingUi.valve=Math.floor(arg/2);state.positions[pendingUi.valve]=arg%2;state.waiting[pendingUi.valve]=duration;
      // Releasing the band or touching the SGM gripper invalidates former process evidence.
      if(arg>=8)invalidateProofs();
    }else{
      pendingUi.phaseIndex=0;
      advanceFixture(pendingUi,0);
      state.homeMask&=~target;invalidateProofs();
      if(kind==='feed'){
        state.jobNumber++;state.holes=0;
        if(target&2){
          state.setup.feed2Holes=0;
          pendingUi.bandPhase=0;pendingUi.previousBand=state.band;
        }
      }
    }
    recordEvent(12,1);return result;
  }
  function command(text,confirmed=false,hasOwner=true){
    refresh();const parts=text.split(','),name=parts[0],arg=Number(parts[1]);
    const result={result:1,draftOnly:true,scope:'ui-test-only'};
    lastCommand=name==='network'?'network · Testwerte ausgeblendet':text.slice(0,240);
    if(name==='netread')return {...result,network:{wifi:state.wifiEnabled,ssid:state.testSsid??'HMI-Draft · Beispieldaten',password:state.testPassword??'nur-ein-beispiel'}};
    if(!enabled)return {...result,result:16};
    if(name==='claim'){cancelShortRelease();state.ownerConnected=1;return result;}
    if(name==='mould-open'||name==='mould-close')return {...result,result:19,reason:'Formfreigabe über die aktive Bandeinrichtung anfordern.'};
    if(name==='setup-without-sgm-on'||name==='setup-without-sgm-off')return {...result,result:19,reason:'Profil über die aktive Bandeinrichtung wählen.'};
    if(name.startsWith('setup-')){
      if((name==='setup-enter'||name==='setup-exit')&&parts.length!==1)return {...result,result:8};
      if(!hasOwner||!state.ownerConnected)return {...result,result:9,reason:'Bedienung übernehmen.'};
      if(!state.io)return {...result,result:6,reason:'E/A-Verbindung wiederherstellen.'};
      if(name==='setup-enter'){
        const cap=capabilities();if(!cap.canEnter)return {...result,result:16,reason:cap.enterReason};
        pendingA6=null;state.a6Challenge=0;
        recordEvent(10,1);
        state.loop.requested=state.loop.active=state.loop.remaining=0;state.loop.state=4;state.skip.requested=state.skip.active=state.skip.question=state.skip.token=0;
        state.autoWaitingSgm=0;cancelShortRelease();if(!state.job)state.holds&=~8;
        const running=state.job||state.pending||state.waiting.some(ms=>ms>0);
        if(handMove){
          state.setup.state='requested';state.setup.action='';state.setup.busy=1;advanceHandMove();
        }else if(running){state.setup.state='requested';state.setup.busy=1;state.setup.action='';state.setup.progress=0;state.setup.remainingMs=500;pendingUi={kind:'entry',started:now(),duration:Math.max(500,state.shortRelease.remainingMs||0)};}
        else enterReady();
      }else if(name==='setup-exit'){
        const cap=capabilities();if(!cap.canExit)return {...result,result:state.setup.busy?2:19,reason:cap.exitReason};
        clearUi();state.active=0;state.holds|=HmiHold;state.setup.last='Einrichtung beendet · Start erforderlich.';recordEvent(14,1);
      }else if(name==='setup-action')return setupAction(parts.slice(1).join(','),result);
      else return {...result,result:8};
      refresh();return result;
    }
    if(state.setup.state!=='inactive'&&['start','hand','auto','profile','feed1','feed2','both','home','manual','tip','next','skip','loop','eject-front','eject-rear'].includes(name))return {...result,result:19,reason:'Bandeinrichtung zuerst bewusst beenden.'};
    if(name==='profile'&&(state.job||state.pending||state.toHand))return {...result,result:2};
    if(['sim','profile','save','inputs','skip-config','network'].includes(name)&&(name==='profile'||state.active&&state.auto)&&!confirmed){pendingSetting={token:++sequence,command:text};return {...result,result:20,settingChallenge:pendingSetting.token,settingText:'Einstellung ändern? Bewusst bestätigen.'};}
    if(name==='setting-confirm'){
      if(!pendingSetting||arg!==pendingSetting.token)return {...result,result:10};const item=pendingSetting;pendingSetting=null;return command(item.command,true,hasOwner);
    }
    if(name==='setting-cancel'){pendingSetting=null;return result;}
    if(handMove&&(name==='stop'||name==='pause'||(name==='auto'&&!state.selectedAuto)||(name==='hand'&&state.selectedAuto))){
      if(name==='auto'&&state.standalone)return {...result,result:17};
      const requested=state.setup.state==='requested';
      if(requested)state.setup=emptySetup();
      if(name==='auto'||name==='hand')state.selectedAuto=Number(name==='auto');
      if(name!=='pause'||requested)state.toHand=1;
      state.holds|=HmiHold;state.autoWaitingSgm=0;cancelShortRelease();return result;
    }
    if(name==='hand'){if(state.selectedAuto){cancelShortRelease();Object.assign(state,{auto:0,selectedAuto:0,active:0,autoWaitingSgm:0,holds:state.holds|HmiHold});}}
    else if(name==='auto'){if(state.standalone)return {...result,result:17};if(!state.selectedAuto){cancelShortRelease();Object.assign(state,{auto:1,selectedAuto:1,active:0,autoWaitingSgm:0,holds:state.holds|HmiHold});}}
    else if(name==='start'){
      if(!state.io)return {...result,result:6};if(!state.ownerConnected)return {...result,result:9};
      if(state.toHand||state.profilePending||state.networkPending)return {...result,result:2,detail:'Einstellungswechsel oder Bewegung beenden.'};
      if(state.selectedAuto&&state.installed[2]&&!(state.effectiveExt[1]&8))return {...result,result:16,detail:'Bandende: Band bereitstellen'};
      if(state.selectedAuto&&!state.ack)return {...result,result:5,detail:state.startCondition};
      const fresh=state.selectedAuto&&!state.active&&!state.queuedHome;
      if(fresh&&(state.effectiveBase&1)&&state.startCondition)return {...result,result:!state.bandValid?14:!state.band?7:16,detail:state.startCondition};
      state.active=1;state.holds&=~(HmiHold|8|4);
      if(fresh){
        state.auto=1;
        if(!(state.effectiveBase&1)){state.autoWaitingSgm=1;state.normal=0;}
        else prepareAutomatic();
      }
      if(state.standalone){state.released=1;state.normal=standaloneProcessMask;}
    }
    else if(name==='stop'||name==='pause'){
      const interruptedLocalAction=Boolean(state.setup.withoutSgm&&state.setup.busy);endLocalProfile();
      state.active=0;state.autoWaitingSgm=0;state.holds|=HmiHold;cancelShortRelease();
      if(state.setup.state==='requested')clearUi();
      if(state.setup.state==='inactive')state.job=0;
      else if(!interruptedLocalAction)state.setup.last='Halt angefordert · Aktion endet geordnet.';
    }
    else if(name==='ack'){
      if(!hasOwner||!state.ownerConnected)return {...result,result:9};
      if(parts.length!==2||!/^[1-9][0-9]*$/.test(parts[1])||arg!==state.faultSerial||!state.fault[0]||state.ack)return {...result,result:10};
      if(!state.io)return {...result,result:ResultIo};state.ack=1;state.holds&=~FaultHold;recordEvent(15,1);
    }
    else if(name==='manual'){
      if(parts.length!==2||!(/^[0-9]$/).test(parts[1]))return {...result,result:8};
      if(!hasOwner||!state.ownerConnected)return {...result,result:9};
      if(state.job||state.toHand)return {...result,result:2};
      if(!state.io)return {...result,result:6};
      if(!state.active)return {...result,result:15};
      if(state.auto)return {...result,result:3};
      if(state.holds&9)return {...result,result:15};
      startHandMove(arg);
    }
    else if(name==='home'||name==='feed1'||name==='feed2'||name==='both')return {...result,result:19,reason:'Diese Aktion gehört zur bewusst aktivierten Bandeinrichtung.'};
    else if(name==='position-ok')return {...result,result:8};
    else if(name==='targets'){if(![1,2,3].includes(arg)||parts.length!==2)return {...result,result:8};if(state.active&&state.auto)return {...result,result:19};state.autoTargets=arg;}
    else if(name==='tip')state.tip=Number(!!arg);
    else if(name==='sim'){if(!state.sim&&arg)simulatedBand=state.band;state.sim=Number(!!arg);}
    else if(name==='profile'){cancelShortRelease();state.standalone=Number(!!arg);state.auto=state.selectedAuto=state.active=state.released=state.normal=0;}
    else if(name==='save'){
      const timing=parts.slice(1).map(Number);if(timing.length!==13||timing.some(v=>!Number.isInteger(v)||v<0||v>0xffffffff))return {...result,result:8};state.times=timing.slice(0,10);state.limits=timing.slice(10);state.configGeneration++;
    }
    else if(name==='inputs'){state.installed=parts.slice(1,4).map(v=>Number(!!Number(v)));state.configGeneration++;}
    else if(name==='network'){
      if(!/^(?:[0-9a-f]{2})*$/i.test(parts[2]||'')||!/^(?:[0-9a-f]{2})*$/i.test(parts[3]||''))return {...result,result:8};endLocalProfile();cancelShortRelease();state.wifiEnabled=Number(!!arg);state.wifi=state.wifiEnabled;state.testSsid=Buffer.from(parts[2]||'','hex').toString('utf8');state.testPassword=Buffer.from(parts[3]||'','hex').toString('utf8');state.configGeneration++;
    }
    else if(name==='skip'){state.skip.requested=1-state.skip.requested;state.skip.source=state.skip.requested?1:0;}
    else if(name==='skip-config'){state.skip.mode=arg;state.skip.seconds=Math.max(5,Math.min(60,Number(parts[2])||20));}
    else if(name==='skip-answer'){state.skip.question=0;state.skip.token=0;state.skip.requested=Number(!!Number(parts[2]));}
    else if(name==='loop'){state.loop.requested=arg===2?-1:arg===1?1:0;state.loop.state=arg?1:0;}
    else if(name==='eject-front'||name==='eject-rear'){if(!hasOwner||!state.ownerConnected)return {...result,result:9};const reason=shortReleaseGuard();if(reason)return {...result,result:state.io?19:6,reason};beginShortRelease(name==='eject-front'?1:2);}
    else if(name==='force-arm'){armedToken=++sequence;armedAt=now();return {...result,armToken:armedToken};}
    else if(name==='force-unlock'){if(!armedToken||arg!==armedToken||now()-armedAt>=15000)return {...result,result:10};state.unlocked=1;armedToken=0;}
    else if(name==='force-cancel')armedToken=0;
    else if(name==='forcein'&&arg>=0&&arg<6){if(!state.unlocked)return {...result,result:16};const forced=Number(parts[2])-1;if(![-1,0,1].includes(forced))return {...result,result:8};state.forceIn[arg]=forced;}
    else if(name==='simext'){
      if(!state.unlocked)return {...result,result:16};const module=arg,index=Number(parts[2]),value=Number(parts[3]);
      if(parts.length!==4||parts.slice(1).some(field=>!/^\d+$/.test(field))||!Number.isInteger(module)||module<0||module>1||!Number.isInteger(index)||index<0||index>15||!Number.isInteger(value)||value<0||value>2)return {...result,result:8};state.forceExt[module*16+index]=value-1;
    }
    else if(name==='forceout'&&arg>=0&&arg<14){
      if(!state.unlocked)return {...result,result:16};const forced=Number(parts[2])-1;if(![-1,0,1].includes(forced))return {...result,result:8};
      if(state.setup.state!=='inactive'&&arg<4&&forced>=0)return {...result,result:19,reason:'EUROMAP-Ausgangsforce während Einrichten gesperrt.'};
      if(arg===1&&forced===1&&!confirmed){state.a6Challenge=++sequence;pendingA6={token:state.a6Challenge,command:text};return {...result,result:18};}state.forceOut[arg]=forced;
    }
    else if(name==='confirmA6'){
      if(state.setup.state!=='inactive')return {...result,result:19,reason:'Formschließfreigabe während Einrichten gesperrt.'};
      if(state.unlocked&&pendingA6&&arg===pendingA6.token){const item=pendingA6;pendingA6=null;state.a6Challenge=0;return command(item.command,true,hasOwner);}return {...result,result:10};
    }
    else if(name==='cancelA6'){pendingA6=null;state.a6Challenge=0;}
    else if(name==='normal'){cancelShortRelease();state.forceIn.fill(-1);state.forceOut.fill(-1);state.forceExt.fill(-1);state.forcing=state.unlocked=0;pendingA6=null;state.a6Challenge=0;armedToken=0;recordEvent(16,1);}
    refresh();return result;
  }
  return {configure,
    get(url){if(url.pathname==='/api/status')return {...values(),stamp:now()-started,owner:state.ownerConnected?Number(url.searchParams.get('sid')||0):0};if(url.pathname==='/api/log')return logPage(url);},
    post(url,data){if(url.pathname==='/api/cmd'){
      const fields=String(data).split(','),text=fields.slice(4).join(','),name=text.split(',')[0];
      if(name==='ack'&&Number(fields[0])!==state.boot)return {result:10,detail:'Fehlerkennung aus einer anderen Sitzung.'};
      const observed=logSnapshot(),response=command(text,false,Number(fields[1])>0);
      if(response.reason&&!response.detail)response.detail=response.reason;
      if(!response.detail&&response.result===ResultIo)response.detail='E/A-Verbindung wiederherstellen.';
      if(!response.detail&&response.result===9)response.detail='Bedienhoheit oder Freischaltung fehlt.';
      if(enabled&&!['netread','heartbeat','setting-cancel'].includes(name)){logChanges(observed);recordEvent(name==='claim'?4:6,response.result);}
      return response;
    }}
  };
}
module.exports={createPreview};
