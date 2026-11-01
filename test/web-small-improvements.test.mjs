import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { recentViewLocationLabel, recentViewKey } from '../web/lib/recent-views.mjs';

test('最近の画面の所在地にフォルダ名を表示し、改名しても履歴の識別を変えない', () => {
  const entry = { cloudKind:'googleDrive', root:{id:'root',name:'シングル作品A'},route:{workId:'single',kind:'note-editor',item:{id:'note'}} };
  const before = recentViewKey(entry);
  assert.equal(recentViewLocationLabel(entry,'Google Drive'),'Google Drive / シングル作品A');
  assert.equal(recentViewLocationLabel(entry,'Google Drive',{id:'root',name:'変更後'}),'Google Drive / 変更後');
  assert.equal(recentViewLocationLabel(entry,'Google Drive',{id:'other',name:'別作品'}),'Google Drive / シングル作品A');
  assert.equal(recentViewLocationLabel(entry,'Google Drive',{id:'root'}),'Google Drive / シングル作品A');
  entry.root.name = '長い名前'.repeat(30);
  assert.equal(recentViewKey(entry),before);
  entry.root.name = '';
  assert.equal(recentViewLocationLabel(entry,'Google Drive'),'Google Drive / フォルダ名未取得');
});

function badgeFixture() {
  const app = fs.readFileSync(new URL('../web/app.mjs',import.meta.url),'utf8');
  const node = () => ({hidden:true,textContent:'',attrs:{},setAttribute(name,value){this.attrs[name]=value;}});
  const elements = Object.fromEntries(['announcementBadge','editorAnnouncementBadge','headerAnnouncementBadge','markAllAnnouncementsReadButton','announcementButton','headerMenuButton'].map(name=>[name,node()]));
  elements.headerMenuButton.attrs['aria-expanded']='false';
  const state = {announcements:[]};
  const read = new Set();
  const context = vm.createContext({state,elements,readAnnouncementIds:()=>read,announcementId:item=>item.id});
  vm.runInContext(app.slice(app.indexOf('function updateAnnouncementBadge()'),app.indexOf('async function loadAnnouncements()')),context);
  return {state,elements,read,update:context.updateAnnouncementBadge};
}

test('ヘッダーメニュー・お知らせ・編集フッターの未読件数と全件既読が一致する', () => {
  const f = badgeFixture();
  f.state.announcements=[{id:'a'},{id:'b'}]; f.read.add('a'); f.update();
  for (const name of ['announcementBadge','editorAnnouncementBadge','headerAnnouncementBadge']) {
    assert.equal(f.elements[name].textContent,'1'); assert.equal(f.elements[name].hidden,false);
  }
  assert.equal(f.elements.headerMenuButton.attrs['aria-label'],'メニュー（未読のお知らせ1件）');
  assert.equal(f.elements.headerMenuButton.attrs['aria-expanded'],'false');
  f.read.add('b'); f.update();
  for (const name of ['announcementBadge','editorAnnouncementBadge','headerAnnouncementBadge']) assert.equal(f.elements[name].hidden,true);
  assert.equal(f.elements.headerMenuButton.attrs['aria-label'],'メニュー');
});

test('未読99件超のバッヂは99+に収め、読み上げには実件数を残す', () => {
  const f = badgeFixture();
  f.state.announcements=Array.from({length:105},(_,i)=>({id:String(i)})); f.update();
  assert.equal(f.elements.headerAnnouncementBadge.textContent,'99+');
  assert.equal(f.elements.headerMenuButton.attrs['aria-label'],'メニュー（未読のお知らせ105件）');
  f.state.announcements=[]; f.read.clear(); f.update();
  assert.equal(f.elements.headerAnnouncementBadge.hidden,true);
});
