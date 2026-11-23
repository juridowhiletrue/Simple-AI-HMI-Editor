/* Simple-AI-HMI-Editor: pure three-way merge for JSON draft models. No I/O. */
(function (factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.HMIDraftState = api;
})(function () {
  'use strict';
  const MISSING = Symbol('missing');
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const object = value => value !== null && Object.prototype.toString.call(value) === '[object Object]';
  const set = (target, key, value) => Object.defineProperty(target, key, {value, writable:true, enumerable:true, configurable:true});
  function clone(value) {
    if (value === MISSING) return MISSING;
    if (Array.isArray(value)) return value.map(clone);
    if (object(value)) {
      const result = {};
      for (const key of Object.keys(value)) set(result, key, clone(value[key]));
      return result;
    }
    return value;
  }
  function equal(left, right) {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item,index) => equal(item,right[index]));
    if (!object(left) || !object(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => own(right,key) && equal(left[key],right[key]));
  }
  const field = (value,key) => object(value) && own(value,key) ? value[key] : MISSING;
  const shown = value => value === MISSING ? null : clone(value);
  const rootCollections = new Set(['pages','actions','comments']);
  function conflict(conflicts,path,kind,base,local,remote,resolution,blocking=false) {
    conflicts.push({path,kind,blocking,needsReview:true,resolution,
      base:shown(base),local:shown(local),remote:shown(remote),
      baseMissing:base===MISSING,localMissing:local===MISSING,remoteMissing:remote===MISSING});
  }
  function identity(record,replies=false) {
    if (object(record) && typeof record.id === 'string' && record.id) return 'id:'+record.id;
    if (replies && object(record)) return 'reply:'+JSON.stringify([String(record.text||''),String(record.at??record.createdAt??'')]);
    return null;
  }
  function indexes(records,replies=false) {
    const map = new Map();
    for (const record of records) map.set(identity(record,replies),record);
    return map;
  }
  function sequence(records,replies=false) { return records.map(record=>identity(record,replies)); }
  function sameOrder(left,right) { return left.length===right.length && left.every((key,index)=>key===right[index]); }
  function reordered(base,side) {
    const baseSet=new Set(base),sideSet=new Set(side);
    return !sameOrder(base.filter(key=>sideSet.has(key)),side.filter(key=>baseSet.has(key)));
  }
  function orderRecords(base,local,remote,merged,path,conflicts) {
    const localReordered=reordered(base,local),remoteReordered=reordered(base,remote);
    let primary,secondary;
    if (localReordered || (!remoteReordered && !sameOrder(base,local))) {primary=local;secondary=remote;}
    else {primary=remote;secondary=local;}
    const common = new Set(local.filter(key=>remote.includes(key) && merged.has(key)));
    const localCommon=local.filter(key=>common.has(key)),remoteCommon=remote.filter(key=>common.has(key));
    const sharedNew=local.filter(key=>!base.includes(key)&&remote.includes(key));
    if ((localReordered&&remoteReordered || sharedNew.length) && !sameOrder(localCommon,remoteCommon)) {
      conflict(conflicts,path+'.order','order-conflict',base,local,remote,'local-order-kept');
      primary=local;secondary=remote;
    }
    const result=primary.filter(key=>merged.has(key));
    for (let i=0;i<secondary.length;i++) {
      const key=secondary[i];
      if (!merged.has(key)||result.includes(key)) continue;
      const next=secondary.slice(i+1).find(item=>result.includes(item));
      const previous=secondary.slice(0,i).reverse().find(item=>result.includes(item));
      if (next && (!previous || result.indexOf(previous)<result.indexOf(next))) result.splice(result.indexOf(next),0,key);
      else if (previous) result.splice(result.indexOf(previous)+1,0,key);
      else result.push(key);
    }
    for (const key of merged.keys()) if(!result.includes(key))result.push(key);
    return result;
  }
  function mergeCollection(base,local,remote,path,conflicts,replies=false) {
    const baseList=base===MISSING?[]:base,localList=local===MISSING?[]:local,remoteList=remote===MISSING?[]:remote;
    const baseMap=indexes(baseList,replies),localMap=indexes(localList,replies),remoteMap=indexes(remoteList,replies);
    const keys=[...new Set([...baseMap.keys(),...localMap.keys(),...remoteMap.keys()])];
    const merged=new Map();
    for (const key of keys) {
      const value=mergeValue(baseMap.has(key)?baseMap.get(key):MISSING,
        localMap.has(key)?localMap.get(key):MISSING,remoteMap.has(key)?remoteMap.get(key):MISSING,
        path+'['+key+']',conflicts);
      if(value!==MISSING)merged.set(key,value);
    }
    let result=orderRecords(sequence(baseList,replies),sequence(localList,replies),sequence(remoteList,replies),merged,path,conflicts).map(key=>merged.get(key));
    if(replies && result.every(reply=>Number.isFinite(Date.parse(reply.at??reply.createdAt??'')))) {
      result=result.map((reply,index)=>({reply,index})).sort((a,b)=>Date.parse(a.reply.at??a.reply.createdAt)-Date.parse(b.reply.at??b.reply.createdAt)||a.index-b.index).map(item=>item.reply);
    }
    return result;
  }
  function mergeValue(base,local,remote,path,conflicts) {
    if(equal(local,remote))return clone(local);
    if(equal(local,base))return clone(remote);
    if(equal(remote,base))return clone(local);
    if(local===MISSING || remote===MISSING) {
      const result=local===MISSING?remote:local;
      conflict(conflicts,path,'delete-vs-change',base,local,remote,local===MISSING?'remote-change-kept-local-deletion-pending':'local-change-kept-remote-deletion-pending');
      return clone(result);
    }
    const name=path.slice(path.lastIndexOf('.')+1);
    if((rootCollections.has(name)&&path==='$.'.concat(name) || name==='replies') &&
        Array.isArray(local)&&Array.isArray(remote)&&(base===MISSING||Array.isArray(base))) {
      return mergeCollection(base,local,remote,path,conflicts,name==='replies');
    }
    if(object(local)&&object(remote)&&(base===MISSING||object(base))) {
      const result={};
      for(const key of new Set([...Object.keys(base===MISSING?{}:base),...Object.keys(local),...Object.keys(remote)])) {
        if(path==='$'&&['serial','savedAt'].includes(key)) {
          const metadata=field(remote,key)===MISSING?field(local,key):field(remote,key);
          if(metadata!==MISSING)set(result,key,clone(metadata));
          continue;
        }
        const value=mergeValue(field(base,key),field(local,key),field(remote,key),path+'.'+key,conflicts);
        if(value!==MISSING)set(result,key,value);
      }
      return result;
    }
    conflict(conflicts,path,'value-conflict',base,local,remote,'local-value-kept');
    return clone(local);
  }
  function copyRemoteMetadata(model,remote) {
    if(object(model)&&object(remote))for(const key of ['serial','savedAt'])if(own(remote,key))set(model,key,clone(remote[key]));
    return model;
  }
  function uniqueCommentNumbers(model,remote) {
    if(!Array.isArray(model.comments))return model;
    const numbered=model.comments.filter(comment=>Number.isSafeInteger(comment.number)&&comment.number>0);
    const remoteById=new Map((Array.isArray(remote.comments)?remote.comments:[]).map(comment=>[comment.id,comment]));
    const priority=numbered.filter(comment=>remoteById.get(comment.id)?.number===comment.number);
    const others=numbered.filter(comment=>!priority.includes(comment));
    const used=new Set(),duplicates=[];
    for(const comment of [...priority,...others]) {
      if(used.has(comment.number))duplicates.push(comment);
      else used.add(comment.number);
    }
    let next=Math.max(0,...used)+1;
    if(!Number.isSafeInteger(next))next=1;
    for(const comment of duplicates) {
      while(used.has(next))next++;
      comment.number=next;used.add(next);next++;
    }
    return model;
  }
  function validateCollections(models,conflicts) {
    for(const [side,model] of Object.entries(models))for(const name of rootCollections) {
      if(!own(model,name))continue;
      const records=model[name];
      if(!Array.isArray(records)) {
        conflicts.push({path:'$.'+name,kind:'invalid-collection',blocking:true,needsReview:true,side,resolution:'local-model-kept'});continue;
      }
      const ids=new Set();
      for(const record of records) {
        const id=identity(record);
        if(!id||ids.has(id))conflicts.push({path:'$.'+name,kind:id?'duplicate-id':'missing-id',blocking:true,needsReview:true,side,record:clone(record),resolution:'local-model-kept'});
        if(id)ids.add(id);
      }
    }
  }
  function mergeModels(base,local,remote) {
    const conflicts=[];
    if(!object(base)||!object(local)||!object(remote))return {model:clone(local),conflicts:[{path:'$',kind:'invalid-model',blocking:true,needsReview:true,resolution:'local-model-kept'}]};
    const hashes=[base,local,remote].map(model=>model.baseline?.sourceSha256);
    const supplied=hashes.filter(hash=>typeof hash==='string'&&hash);
    if(new Set(supplied).size>1 || supplied.length>0&&supplied.length!==3) {
      conflict(conflicts,'$.baseline.sourceSha256','baseline-mismatch',hashes[0]??MISSING,hashes[1]??MISSING,hashes[2]??MISSING,'local-model-kept',true);
      return {model:copyRemoteMetadata(clone(local),remote),conflicts};
    }
    validateCollections({base,local,remote},conflicts);
    if(conflicts.some(item=>item.blocking))return {model:copyRemoteMetadata(clone(local),remote),conflicts};
    const model=uniqueCommentNumbers(copyRemoteMetadata(mergeValue(base,local,remote,'$',conflicts),remote),remote);
    return {model,conflicts};
  }
  return Object.freeze({mergeModels});
});
