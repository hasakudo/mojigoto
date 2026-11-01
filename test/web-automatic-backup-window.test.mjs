import test from "node:test";
import assert from "node:assert/strict";
import { confirmedBackupTime, rememberBackupTime } from "../web/lib/automatic-backup-window.mjs";
const now = Date.parse("2026-10-27T00:00:00Z");
function storage(){const values=new Map();return {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};}
test("間隔は確認した時刻ではなく実際の作成時刻から数える",()=>{
 const s=storage();rememberBackupTime(s,"key",new Date(now-120000).toISOString(),now);
 assert.equal(confirmedBackupTime(s,"key",300000,now),now-120000);
 assert.equal(confirmedBackupTime(s,"key",300000,now+180000),0);
 assert.equal(confirmedBackupTime(s,"key",60000,now),0);
});
test("不正・未来・別形式の時刻を使ってバックアップを省略しない",()=>{
 const s=storage();for(const value of ["broken","null",JSON.stringify({version:1,createdAt:now+1}),JSON.stringify({version:2,createdAt:now}),JSON.stringify({version:1,createdAt:"date"})]){
 s.setItem("key",value);assert.equal(confirmedBackupTime(s,"key",300000,now),0);}
});
test("記録には時刻だけを保存し未来の作成時刻は採用しない",()=>{
 const s=storage();rememberBackupTime(s,"key",new Date(now+1).toISOString(),now);assert.equal(s.getItem("key"),undefined);
 rememberBackupTime(s,"key",new Date(now).toISOString(),now);assert.deepEqual(JSON.parse(s.getItem("key")),{version:1,createdAt:now});
});
