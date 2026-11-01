import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base=new URL('../web/',import.meta.url);
test('アプリのローカル依存はクエリを含めすべて更新復旧用シェルから取得できる',async()=>{
 const html=await readFile(new URL('index.html',base),'utf8'),sw=await readFile(new URL('sw.js',base),'utf8');
 const shell=new Set([...sw.split('];')[0].matchAll(/"(\.\/[^"\n]+)"/g)].map(m=>new URL(m[1],base).href));
 const entry=html.match(/type="module" src="([^"]*app\.mjs[^\"]*)"/)[1],seen=new Set(),missing=[];
 async function visit(url){if(seen.has(url.href))return;seen.add(url.href);if(!shell.has(url.href))missing.push(url.pathname.split('/web/').pop()+url.search);
  const source=await readFile(new URL(url.pathname, url),'utf8');
  for(const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){const next=new URL(m[1],url);if(next.href.startsWith(base.href))await visit(next);}
 }
 await visit(new URL(entry,base));
 const setupHtml=await readFile(new URL('google-drive-setup.html',base),'utf8');
 const setupEntry=setupHtml.match(/type="module" src="([^"]*google-drive-setup[.]mjs[^"]*)"/)[1];
 await visit(new URL(setupEntry,base));assert.deepEqual(missing,[]);assert.ok(seen.size>50);
});
