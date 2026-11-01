import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { discoverWorkCatalog, catalogDeltaScope } from "../web/lib/catalog-delta.mjs";
import { OneDriveProvider } from "../web/storage/onedrive-provider.mjs";
import { discoverWorks, createWorkCatalogSnapshot } from "../web/lib/work-discovery.mjs";
import { oneDrivePrefetchFixture } from "./fixtures/onedrive-prefetch-fixture.mjs";

const root = { id: "selected", parentReference: { driveId: "drive" } };
const url = "https://graph.microsoft.com/v1.0/drives/drive/items/selected/delta";
const checkpoint = url + "?token=secret";
const works = [{ id: "work", folder: { id: "work" }, title: "作品" }];
function controller(replies = []) {
  const calls = [], samples = [];
  const provider = { async readCatalogDelta(r, link) {
    calls.push({ root:r, link });
    const result = replies.shift();
    if (result instanceof Error) throw result;
    return result || { changed:false, link:checkpoint, pages:1 };
  }};
  return { provider, calls, samples, options:{ now:()=>1000, measure:(label,details)=>extra=>samples.push({label,...details,...extra}) } };
}

test("verified unchanged catalog skips all ordinary listings and returns an independent snapshot", async () => {
  const f=controller(); let lists=0;
  const result=await discoverWorkCatalog(f.provider,root,{...f.options,cachedWorks:works,deltaState:{scope:catalogDeltaScope(root),link:checkpoint}},()=>{lists++;return works;});
  assert.equal(lists,0); assert.equal(f.calls.length,1); assert.equal(result.works[0].title,"作品");
  result.works[0].title="changed"; assert.equal(works[0].title,"作品");
  assert.equal(result.deltaState.link,checkpoint);
  assert.doesNotMatch(JSON.stringify(f.samples),/secret|graph.microsoft/);
});

test("old catalog without checkpoint requires discovery bracketed by start and unchanged verification", async () => {
  const f=controller(); const sequence=[];
  const read=f.provider.readCatalogDelta;
  f.provider.readCatalogDelta=async(...args)=>{sequence.push(args[1]?'verify':'start');return read(...args);};
  const result=await discoverWorkCatalog(f.provider,root,{...f.options,cachedWorks:works},()=>{sequence.push('discover');return works;});
  assert.deepEqual(sequence,['start','discover','verify']);
  assert.equal(result.deltaState.link,checkpoint);
});

test("any changed or deleted item forces fresh discovery, then verifies its own baseline", async () => {
  const f=controller([{changed:true,link:checkpoint,pages:2}]);let lists=0;
  const fresh=[{...works[0],title:'new title'}];
  const result=await discoverWorkCatalog(f.provider,root,{...f.options,cachedWorks:works,deltaState:{scope:catalogDeltaScope(root),link:checkpoint}},()=>{lists++;return fresh;});
  assert.equal(lists,1);assert.equal(f.calls.length,2);assert.equal(result.works[0].title,'new title');
});

test("changes while enumerating do not create a checkpoint for stale catalog",async()=>{
  const f=controller([{changed:false,link:checkpoint,pages:1},{changed:true,link:checkpoint,pages:1}]);
  const result=await discoverWorkCatalog(f.provider,root,f.options,()=>works);
  assert.equal(result.deltaState,null);
});

test("partial settings or metrics reads and empty catalogs never establish a baseline",async()=>{
  for(const empty of [false,true]){
    const f=controller();const result=await discoverWorkCatalog(f.provider,root,f.options,(incomplete)=>{if(!empty)incomplete();return empty?[]:works;});
    assert.equal(result.deltaState,null);assert.equal(f.calls.length,1);
  }
});

for(const status of [400,403,404,410,429,500])test(`delta ${status} falls back without losing cached data and applies retry delay`,async()=>{
  const f=controller([Object.assign(Error('sensitive remote error'),{status})]);let lists=0;
  const result=await discoverWorkCatalog(f.provider,root,{...f.options,cachedWorks:works,deltaState:{scope:catalogDeltaScope(root),link:checkpoint}},()=>{lists++;return works;});
  assert.equal(lists,1);assert.ok(result.deltaState.retryAfter>1000);assert.equal(result.deltaState.link,undefined);
  await discoverWorkCatalog(f.provider,root,{...f.options,cachedWorks:works,deltaState:result.deltaState},()=>works);
  assert.equal(f.calls.length,1);assert.doesNotMatch(JSON.stringify(f.samples),/sensitive|secret/);
});

test("scope mismatch cannot reuse checkpoint or cooldown; unsupported provider uses original discovery",async()=>{
  const f=controller();
  await discoverWorkCatalog(f.provider,root,{...f.options,cachedWorks:works,deltaState:{scope:'wrong',link:checkpoint,retryAfter:999999}},()=>works);
  assert.equal(f.calls[0].link,'');
  const result=await discoverWorkCatalog({},root,{},()=>works);assert.equal(result.works,works);
  await discoverWorkCatalog(f.provider,{id:'no-drive'},f.options,()=>works);assert.equal(f.calls.length,2);
});

test("changing owner/load during probe prevents discovery and checkpoint publication",async()=>{
  let current=true; const f=controller();f.provider.readCatalogDelta=async()=>{current=false;return {changed:false,link:checkpoint,pages:1};};
  let lists=0;const result=await discoverWorkCatalog(f.provider,root,{...f.options,isCurrent:()=>current,cachedWorks:works,deltaState:{scope:catalogDeltaScope(root),link:checkpoint}},()=>{lists++;return works;});
  assert.equal(lists,0);assert.equal(result.works,null);assert.equal(result.deltaState,null);
});

function providerFixture(pages){
  const provider=new OneDriveProvider({getAccessToken:async()=>"private-auth"}); const requests=[];
  provider.request=async (address,options)=>{
    requests.push({address,options});const page=pages.shift();
    if(page instanceof Error)throw page;
    return {json:async()=>page};
  };
  return {provider,requests};
}

test("provider probes only selected folder and follows all delta pages including deletions",async()=>{
  const f=providerFixture([{value:[{id:'deleted',deleted:{}}],'@odata.nextLink':url+'?next=1'},{value:[],'@odata.deltaLink':checkpoint}]);
  const result=await f.provider.readCatalogDelta(root);
  assert.equal(result.changed,true);assert.equal(result.pages,2);assert.equal(result.link,checkpoint);
  assert.equal(f.requests[0].address,url+'?token=latest');assert.ok(f.requests[0].options.signal);
});

for(const invalid of [
  'https://evil.example/v1.0/drives/drive/items/selected/delta?token=private',
  'http://graph.microsoft.com/v1.0/drives/drive/items/selected/delta',
  'https://graph.microsoft.com/v1.0/drives/other/items/selected/delta',
  'https://graph.microsoft.com/v1.0/drives/drive/root/delta',
  url+'-other?token=1', url+'#fragment',
])test(`provider rejects off-scope link ${invalid.split('?')[0]}`,async()=>{
  const f=providerFixture([]);await assert.rejects(f.provider.readCatalogDelta(root,invalid));assert.equal(f.requests.length,0);
});

for(const page of [{}, {value:[]}, {value:[{}],'@odata.deltaLink':checkpoint}, {value:[],'@odata.deltaLink':checkpoint,'@odata.nextLink':url+'?next=1'}, {value:[],'@odata.deltaLink':'https://evil.example'}])test('malformed or incomplete page cannot confirm unchanged',async()=>{
  const f=providerFixture([page]);await assert.rejects(f.provider.readCatalogDelta(root));
});

test("repeated pagination and page/item limits fall back instead of hanging or retaining an entire drive",async()=>{
  const looping=providerFixture(Array.from({length:3},()=>({value:[],'@odata.nextLink':url+'?loop=1'})));
  await assert.rejects(looping.provider.readCatalogDelta(root));assert.equal(looping.requests.length,2);
  const many=providerFixture(Array.from({length:11},(_,i)=>({value:[],'@odata.nextLink':url+'?page='+i})));
  await assert.rejects(many.provider.readCatalogDelta(root));assert.equal(many.requests.length,10);
  const large=providerFixture([{value:Array.from({length:2001},(_,i)=>({id:String(i)})),'@odata.deltaLink':checkpoint}]);
  await assert.rejects(large.provider.readCatalogDelta(root));
});

test("ordinary discovery reports settings parse failures to baseline validation",async()=>{
  let incomplete=0;
  const folder={id:'meta',name:'.mojigoto',folder:{}};
  const provider={listChildren:async id=>id==='selected'?[folder]:[{id:'settings',name:'work.json',file:{}}],readText:async()=>'{invalid'};
  const result=await discoverWorks(provider,root,{reportIncomplete:()=>incomplete++});
  assert.equal(result.length,1);assert.equal(incomplete,1);
});

test("real provider/discovery pipeline: cold baseline, warm empty delta, then remote rename and deletion",async()=>{
  const h=oneDrivePrefetchFixture(10), originalRequest=h.provider.request;
  const deltaUrl='https://graph.microsoft.com/v1.0/drives/test-drive/items/root/delta';
  let changed=false, deltaRequests=0;
  h.provider.request=async(address,options)=>{
    if(address.startsWith(deltaUrl)){
      deltaRequests++;
      const value=changed?[{id:'settings-work-0'},{id:'work-9',deleted:{}}]:[];changed=false;
      return {json:async()=>({value,'@odata.deltaLink':deltaUrl+'?token='+deltaRequests})};
    }
    return originalRequest(address,options);
  };
  const run=(cachedWorks=[],deltaState)=>discoverWorkCatalog(h.provider,h.root,{cachedWorks,deltaState},reportIncomplete=>discoverWorks(h.provider,h.root,{cachedWorks,reportIncomplete}));
  const baseline=await run();assert.equal(deltaRequests,2);assert.equal(baseline.works.length,10);
  const cache=createWorkCatalogSnapshot(baseline.works);h.reset();
  const warm=await run(cache,baseline.deltaState);
  assert.equal(deltaRequests,3);assert.equal(h.paths.length,0);assert.equal(h.batches.length,0);assert.equal(h.reads.length,0);
  changed=true;h.data.get('root').pop();h.data.get('meta-work-0')[0].eTag='v2';h.titles.set('settings-work-0','新しい作品名');
  const fresh=await run(warm.works,warm.deltaState);
  assert.equal(fresh.works.length,9);assert.equal(fresh.works.find(w=>w.id==='work-0').title,'新しい作品名');
  assert.ok(h.batches.length>0);assert.equal(deltaRequests,5);assert.ok(fresh.deltaState.link);
});

test("malformed ordinary listings cannot be saved as a verified baseline",async()=>{
  for(const batch of [false,true]){
    const f=providerFixture([{}]);
    if(batch){f.provider.request=async()=>({json:async()=>({responses:[{id:'1',status:200,body:{}}]})});}
    await assert.rejects(batch?f.provider.listChildrenBatch(['folder']):f.provider.listChildren('folder'));
  }
});

test("delta confirmation times out and releases its timer",async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=providerFixture([]);
  f.provider.request=(_address,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
  const pending=assert.rejects(f.provider.readCatalogDelta(root),/aborted/);
  t.mock.timers.tick(8000);await pending;
});

const app=fs.readFileSync(new URL('../web/app.mjs',import.meta.url),'utf8');
function source(name){const start=new RegExp(`^function ${name}\\(`,'m').exec(app).index;const rest=app.slice(start);return rest.slice(0,/\r?\n}\r?\n/.exec(rest).index+3);}
test("catalog checkpoint is atomically paired with its exact owner/root snapshot; edits clear it",()=>{
  let raw='';const context=vm.createContext({localStorage:{getItem:()=>raw,setItem:(_,value)=>raw=value,removeItem:()=>raw=''},workCatalogStorageKey:()=> 'catalog',workCatalogOwner:()=> 'owner',readJson:value=>value?JSON.parse(value):null,createWorkCatalogSnapshot});
  vm.runInContext(source('persistWorkCatalog')+'\n'+source('readWorkCatalogDelta'),context);
  context.persistWorkCatalog(root,works,{scope:catalogDeltaScope(root),link:checkpoint});
  const snapshot=JSON.parse(raw).works;
  assert.equal(context.readWorkCatalogDelta(root,snapshot).link,checkpoint);
  assert.equal(context.readWorkCatalogDelta({id:'other'},snapshot),null);
  assert.equal(context.readWorkCatalogDelta(root,[{...snapshot[0],title:'old concurrent snapshot'}]),null);
  const different=JSON.parse(raw);different.owner='other';raw=JSON.stringify(different);
  assert.equal(context.readWorkCatalogDelta(root,snapshot),null);
  context.persistWorkCatalog(root,works);assert.equal(JSON.parse(raw).deltaState,undefined);
});
