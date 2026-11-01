import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createConnectionInitializer } from '../web/lib/cloud-connection.mjs';
const app=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');
const source=name=>{const start=app.indexOf(`function ${name}(`),end=/\r?\n}\r?\n/.exec(app.slice(start));assert.ok(start>=0&&end,name);return app.slice(start,start+end.index+end[0].length);};
function fixture({visible=false,route={kind:'manuscript-file'},initialized=false}={}){
 const classes=new Set(),attrs=new Map();const elements={authBoot:{hidden:!visible,classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)},authBootMessage:{textContent:'起動しています…'}};
 const state={historyInitialized:initialized};const bodyClasses=new Set(['auth-pending']);const history={state:{mojigotoRoute:route}};
 const context=vm.createContext({state,elements,history,document:{body:{classList:{remove:v=>bodyClasses.delete(v)}}}});
 vm.runInContext(['hasPendingInitialViewRestore','showInitialViewRestoreLoading','finishViewRestoreLoading','finishAuthBoot'].map(source).join('\n'),context);
 return {context,state,elements,classes,attrs,bodyClasses,history};
}
test('HOME表示後は前回ルートが残っていても作品一覧取得の待機表示で画面を覆わない',()=>{
 const h=fixture();assert.equal(h.context.hasPendingInitialViewRestore(),true);
 assert.equal(h.context.showInitialViewRestoreLoading(),false);
 assert.equal(h.elements.authBoot.hidden,true);assert.equal(h.classes.size,0);assert.equal(h.attrs.size,0);
 assert.equal(h.elements.authBootMessage.textContent,'起動しています…');
 h.context.finishAuthBoot();assert.equal(h.bodyClasses.has('auth-pending'),false);
 // A later connection/list-loading call cannot resurrect it either.
 assert.equal(h.context.showInitialViewRestoreLoading(),false);
});
test('起動直後の表示中のカバーは前回画面の復元まで維持する',()=>{
 const h=fixture({visible:true});h.context.showInitialViewRestoreLoading();
 assert.equal(h.elements.authBoot.hidden,false);assert.equal(h.classes.has('view-restore'),true);
 assert.equal(h.attrs.get('aria-busy'),'true');assert.equal(h.bodyClasses.has('auth-pending'),true);
 assert.match(h.elements.authBootMessage.textContent,/前回の画面/);
});
test('作品一覧ルートまたは履歴初期化後は起動表示を終了する',()=>{
 for(const options of [{visible:true,route:{kind:'works'}},{visible:true,initialized:true}]){
  const h=fixture(options);h.context.finishAuthBoot();assert.equal(h.elements.authBoot.hidden,true);assert.equal(h.classes.size,0);assert.equal(h.bodyClasses.has('auth-pending'),false);
 }
});

test('ログイン確認後は復元ルートがあっても接続確認を待たずHOMEへ戻す',()=>{
 const h=fixture({visible:true});h.context.showInitialViewRestoreLoading();h.context.finishAuthBoot();
 assert.equal(h.elements.authBoot.hidden,true);assert.equal(h.classes.has('view-restore'),false);assert.equal(h.attrs.has('aria-busy'),false);assert.equal(h.bodyClasses.has('auth-pending'),false);
});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('認証確認中だけカバーを残し、遅い自動接続の応答中はHOME内に状態を表示する',async()=>{
 const h=fixture({visible:true}),access=deferred(),redirect=deferred(),entered=deferred();
 Object.assign(h.state,{cloudKind:'oneDrive',provider:{},workRoot:{id:'root'},dropboxAuth:{clientId:''},microsoftAuth:{completeRedirect:async()=>{entered.resolve();await redirect.promise;return false;},getAccessToken:async()=>''}});
 const elements={...h.elements,autoConnectCheckbox:{},connectionDescription:{},connectButton:{}};
 const controller=createConnectionInitializer({state:h.state,elements,sessionStorage:{getItem:()=>null,removeItem(){}},PENDING_RECENT_VIEW_KEY:'pending',measureConnectionStep:(_name,f)=>f(),loadRuntimeConfig:async()=>({}),initializeUserAccess:()=>access.promise,readAutoConnectPreference:()=>({enabled:true,cloudKind:'oneDrive'}),startUserAccessMonitor(){},configureAuth:()=>({microsoftClientId:'test',googleClientId:''}),workCatalogOwner:()=> 'owner',activateCloud(){},renderRecentViews(){},finishAuthBoot:()=>h.context.finishAuthBoot(),readJson:()=>null,isRecentViewEntry:()=>false,cloudAuth:()=>null,restoreRecentView(){},finishViewRestoreLoading:()=>h.context.finishViewRestoreLoading(),reconnectPreviousCloud:async()=>false,renderConnectedCloud(){},loadWorks(){},showFolder(){},notify(){}});
 const loading=controller.initializeConnection();assert.equal(h.elements.authBoot.hidden,false);
 access.resolve(true);await entered.promise;
 assert.equal(h.elements.authBoot.hidden,true);assert.match(elements.connectionDescription.textContent,/接続を確認/);
 redirect.resolve();await loading;assert.equal(h.elements.authBoot.hidden,true);assert.equal(elements.connectionDescription.textContent,'クラウドを選んで接続してください。');
});
