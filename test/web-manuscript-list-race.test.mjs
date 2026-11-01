import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function openManuscriptFolder('),end=source.indexOf('\n}\n',start)+2;
const code=source.slice(start,end);
const wait=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){const requests=new Map(),routes=[];const n=()=>({hidden:true,textContent:'',children:[],replaceChildren(...children){this.children=children;}});
 const elements=Object.fromEntries(['browserSection','worksSection','filesSection','readerSection','notesSection','noteEditorSection','selectedWorkTitle','manuscriptBreadcrumbs','filesList','filesCount'].map(k=>[k,n()]));
 const state={provider:{},selectedWork:{id:'w',title:'作品',manuscript:{id:'root'}},workRoot:{id:'cloud-root'},folderListings:new Map(),nestedManuscriptWarnings:new Set()};
 const context={state,elements,folderListingKey:f=>f.id,beginPerformanceMeasurement:()=>()=>{},VIEW_CACHE_DURATION:100,hideConceptViews(){},renderInputAssistVisibility(){},renderRecentManuscripts(){},makeElement:()=>({addEventListener(){}}),showLoading(){},showEmpty(){},listChildrenCached:f=>requests.get(f.id).promise,sortDriveItems:x=>x,isManuscriptFile:i=>!!i.file,MANUSCRIPT_FOLDER_NAMES:new Set(['manuscript']),makeManuscriptRow:item=>item,formatNumber:String,commitRoute:r=>routes.push(r),routeForWork:(_kind,data)=>data,notify(){},openFile(){}};
 vm.createContext(context);vm.runInContext(code,context);return {context,state,elements,requests,routes,open:(folder)=>{const r=wait();requests.set(folder.id,r);return {r,promise:context.openManuscriptFolder(folder,[])};}};
}
test('先に開始した一覧が遅れても、後で選んだフォルダと履歴を維持する',async()=>{const h=fixture(),a=h.open({id:'a'}),b=h.open({id:'b'});b.r.resolve([{id:'b-file',file:{}}]);await b.promise;a.r.resolve([{id:'a-file',file:{}}]);await a.promise;assert.equal(h.elements.filesList.children[0].id,'b-file');assert.equal(h.routes.length,1);assert.equal(h.routes[0].folder.id,'b');});
for(const change of ['work','editor','session'])test('一覧の待機中に'+change+'が変わったら表示・履歴を上書きしない',async()=>{const h=fixture(),a=h.open({id:'a'});if(change==='work')h.state.selectedWork={id:'new'};if(change==='editor')h.elements.filesSection.hidden=true;if(change==='session')h.state.userSession={user:{id:'other'}};h.elements.filesList.children=[{id:'keep'}];a.r.resolve([{id:'old',file:{}}]);await a.promise;assert.equal(h.elements.filesList.children[0].id,'keep');assert.equal(h.routes.length,0);});
test('章の先読み待機中でも、別フォルダへ切り替えた後の表示を守る',async()=>{const h=fixture(),child=wait();h.requests.set('chapter',child);const a=h.open({id:'a'});a.r.resolve([{id:'chapter',folder:{},name:'章'}]);await new Promise(r=>setImmediate(r));const b=h.open({id:'b'});b.r.resolve([{id:'new',file:{}}]);await b.promise;child.resolve([]);await a.promise;assert.equal(h.elements.filesList.children[0].id,'new');assert.equal(h.routes.length,1);});
