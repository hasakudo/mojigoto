import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const boot=fs.readFileSync(new URL('../web/boot.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
const cacheName=worker.match(/const CACHE_NAME = "([^"]+)"/)[1];
async function settle(){for(let i=0;i<20;i++)await Promise.resolve();}
function bootFixture(storage=new Map()) {
  const listeners={},timers=[],replacements=[],classes=new Set(['auth-pending']);let observer;
  const nodes={authBoot:{hidden:false,dataset:{},removeAttribute(){},querySelector(){return {append:node=>{nodes[node.id]=node;}};}},authBootMessage:{textContent:''}};
  const window={addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent:event=>{listeners[event.type]?.(event);return !event.defaultPrevented;}};
  const context=vm.createContext({URL,Event,Promise,location:{href:'https://example.test/app/?keep=1#here',replace:url=>replacements.push(url)},navigator:{serviceWorker:{register:async(_,options)=>{assert.equal(options.updateViaCache,'none');return {update:async()=>{}};}}},
    document:{currentScript:{dataset:{build:'1.0.181'},src:'https://example.test/app/boot.js'},documentElement:{},body:{classList:{contains:key=>classes.has(key)}},getElementById:id=>nodes[id],createElement:()=>({addEventListener(name,fn){this[name]=fn;}})},
    window,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t;},clearTimeout:t=>{if(t)t.cleared=true;},MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}}});
  vm.runInContext(boot,context);
  return {nodes,listeners,replacements,classes,storage,window,ready:()=>observer(),timeout:async()=>{const t=timers.find(t=>t.ms===20000);if(!t.cleared)t.fn();await settle();}};
}
test('本体読込前の停止は一度だけ更新再試行し、繰り返す失敗は操作可能な案内へ切り替える',async()=>{
  const first=bootFixture();await first.timeout();assert.equal(first.replacements.length,1);
  const url=new URL(first.replacements[0]);assert.equal(url.searchParams.get('keep'),'1');assert.equal(url.hash,'#here');assert.equal(url.searchParams.get('mojigoto_update'),'1.0.181');
  const second=bootFixture(first.storage);await second.timeout();assert.equal(second.replacements.length,0);assert.ok(second.nodes.bootRetryButton);assert.match(second.nodes.authBootMessage.textContent,/完了できません/);
});
test('本体開始後の通信待ちや、起動完了後は自動再読込を行わない',async()=>{
  const waiting=bootFixture();waiting.window.dispatchEvent(new Event('mojigoto:app-started'));await waiting.timeout();assert.equal(waiting.replacements.length,0);
  const done=bootFixture();done.nodes.authBoot.hidden=true;done.classes.clear();done.ready();await done.timeout();assert.equal(done.replacements.length,0);
});
test('未保存・保存中のガードと、起動途中に復旧した画面を再読込しない',async()=>{
  const f=bootFixture();f.listeners['mojigoto:before-startup-reload']=e=>e.preventDefault();await f.timeout();assert.equal(f.replacements.length,0);assert.match(f.nodes.authBootMessage.textContent,/保存/);
  const restored=bootFixture();const pending=restored.timeout();restored.nodes.authBoot.hidden=true;restored.classes.clear();restored.ready();await pending;assert.equal(restored.replacements.length,0);
});
function workerFixture({fail='',request=async()=>new Response('fresh'),cached=null}={}) {
  const events={},added=[],deleted=[],timeouts=[];let activated=false;
  const context=vm.createContext({URL,Response,AbortController,Request:class{constructor(path,options){this.url=new URL(path,'https://example.test/app/').href;this.cache=options.cache;}},
    location:{origin:'https://example.test'},self:{registration:{scope:'https://example.test/app/'},addEventListener:(name,fn)=>events[name]=fn,skipWaiting:async()=>{activated=true;},clients:{claim:async()=>{}}},
    caches:{open:async()=>({add:async req=>{added.push(req);if(fail&&req.url.includes(fail))throw Error('unavailable');}}),delete:async key=>{deleted.push(key);return true;},keys:async()=>['foreign-cache','mojigoto-shell-v216',cacheName],match:async()=>cached},
    fetch:request,setTimeout:(fn,ms)=>{const t={fn,ms};timeouts.push(t);return t;},clearTimeout(){}});
  vm.runInContext(worker,context);
  return {events,added,deleted,timeouts,get activated(){return activated;},install:()=>{let task;events.install({waitUntil:p=>task=p});return task;},fetch:(path,mode='cors')=>{let result;events.fetch({request:{url:'https://example.test/app/'+path,method:'GET',mode},respondWith:p=>result=p});return result;}};
}
test('更新時の事前キャッシュはHTTPキャッシュを再取得し、任意画像の失敗で更新を止めない',async()=>{
  const f=workerFixture({fail:'logo.png'});await f.install();assert.equal(f.activated,true);assert.ok(f.added.length>20);assert.ok(f.added.every(req=>req.cache==='reload'));
  const bad=workerFixture({fail:'app.mjs'});await assert.rejects(bad.install(),/unavailable/);assert.equal(bad.activated,false);assert.deepEqual(bad.deleted,[cacheName]);
});
test('本体・依存モジュールの取得はHTTPキャッシュを使わず、APIと設定は介入しない',async()=>{
  const calls=[];const f=workerFixture({request:async(req,options)=>{calls.push([req.url,options.cache]);return new Response('fresh');}});
  assert.equal(await (await f.fetch('lib/notes.mjs')).text(),'fresh');assert.equal(calls[0][1],'no-store');assert.equal(f.fetch('api/auth/session'),undefined);assert.equal(f.fetch('config.json'),undefined);
});
test('オフライン・時間切れは保存済み画面を返し、他アプリのキャッシュは削除しない',async()=>{
  const f=workerFixture({request:async()=>{throw Error('offline');},cached:new Response('cached')});assert.equal(await (await f.fetch('index.html','navigate')).text(),'cached');
  let activation;f.events.activate({waitUntil:p=>activation=p});await activation;assert.deepEqual(f.deleted,['mojigoto-shell-v216']);
  const timeout=workerFixture({request:async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout')))),cached:new Response('cached')});const result=timeout.fetch('app.mjs');timeout.timeouts.find(t=>t.ms===10000).fn();assert.equal(await (await result).text(),'cached');
});
