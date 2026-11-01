const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { spawn } = require("node:child_process");
const fonts = require("../src/preview/font-defaults");

test("共通フォントを継承し、既存の個別指定と既定値への復帰を区別する", () => {
  assert.equal(fonts.resolveManuscriptFont(undefined, '"共通明朝",serif'), '"共通明朝",serif');
  assert.equal(fonts.resolveManuscriptFont({sizePx:18}, '共通書体'), '"共通書体"');
  assert.equal(fonts.resolveManuscriptFont({family:'個別書体'}, '共通書体'), '"個別書体"');
  assert.equal(fonts.resolveManuscriptFont({family:'個別書体',useDefault:true}, '共通書体'), '"共通書体"');
  assert.equal(fonts.safeFontFamily('"名前,別名", "Yu Mincho", serif'), '"名前,別名","Yu Mincho",serif');
  for (const value of ['a; color:red', '</style><script>', 'a/*b', 'a\\b', 'a"b']) {
    assert.equal(fonts.safeFontFamily(value), fonts.DEFAULT_MANUSCRIPT_FONT);
  }
  const setting = require("../package.json").contributes.configuration.properties['mojigoto.defaultManuscriptFontFamily'];
  assert.equal(setting.scope, 'application');
  assert.equal(setting.default, fonts.DEFAULT_MANUSCRIPT_FONT);
});

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mojigoto-font-'));
  t.after(() => { assert.ok(path.basename(dir).startsWith('mojigoto-font-')); fs.rmSync(dir,{recursive:true,force:true}); });
  const root = path.join(dir,'manuscript'); fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'sample.txt'),'確認用の原稿本文。');
  return root;
}

test("原稿の通常・二面・実寸・Word用HTMLが共通設定と個別設定を同じ順で解決する", t => {
  const root=fixture(t), config=path.join(root,'.mojigoto.json');
  let common='"共通明朝","Yu Mincho",serif';
  const modules=new Map();
  const exportDir=path.resolve(__dirname,'../src/export');
  function load(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const file=path.join(exportDir,name+'.js'), localRequire=createRequire(file), module={exports:{}};
    modules.set(name,module);
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,console,require(request){
      if(request==='vscode')return {workspace:{getConfiguration:()=>({get:(key,fallback)=>key==='defaultManuscriptFontFamily'?common:fallback})}};
      if(request==='./manuscript-export')return {getWorkNameForStats:()=> '作品'};
      if(request.startsWith('./merged-manuscript-'))return load(request.slice(2));
      return localRequire(request);
    }},{filename:file});
    return module.exports;
  }
  const core=load('merged-manuscript-core');
  const data={manuscriptRoot:root,workName:'作品',files:[{relativePath:'sample.txt',text:'確認用の原稿本文。'}]};
  for(const [font,want] of [[undefined,common],[{family:'個別書体'},'"個別書体"'],[{family:'古い指定',useDefault:true},common]]) {
    fs.writeFileSync(config,JSON.stringify({font}));
    assert.equal(core.resolveMergedManuscriptHtmlOptions(data).fontFamily,want);
    for(const [name,fn,opts] of [
      ['merged-manuscript-browser-html','renderMergedManuscriptBrowserHtml',{}],
      ['merged-manuscript-browser-html','renderMergedManuscriptBrowserHtml',{htmlPrintLayoutMode:'spread'}],
      ['merged-manuscript-browser-realprint-html','renderMergedManuscriptBrowserRealPrintHtml',{}],
      ['merged-manuscript-word-html','renderMergedManuscriptWordHtml',{}],
    ]) assert.ok(load(name)[fn](data,{...core.resolveMergedManuscriptHtmlOptions(data),...opts}).includes(`font-family: ${want};`), name);
  }
  common='"更新後の共通書体",sans-serif';
  assert.equal(core.resolveMergedManuscriptHtmlOptions(data).fontFamily,common);
});

async function startServer(t, root) {
  const child=spawn(process.execPath,[path.resolve(__dirname,'../server/vertical-dev.mjs'),root],{
    windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:'0',HOST:'127.0.0.1',MOJIGOTO_DEFAULT_FONT_FAMILY:'共通明朝'},
  });
  t.after(async()=>{ if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;} });
  return new Promise((resolve,reject)=>{
    let output=''; const timer=setTimeout(()=>reject(Error('server startup timeout: '+output)),12000);
    child.on('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error('server exited: '+output));});
    child.stderr.on('data',chunk=>{output+=chunk;});
    child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/ready (http:\/\/127\.0\.0\.1:\d+)\//);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
}

test("縦書きサーバーで共通設定の変更、サイズだけの保存、個別指定、既定への復帰を保持する", {timeout:20000}, async t => {
  const root=fixture(t), base=await startServer(t,root), config=path.join(root,'.mojigoto.json');
  const get=async()=> (await fetch(base+'/api/chapters')).json();
  const patch=async data=>{const response=await fetch(base+'/api/settings',{method:'POST',body:JSON.stringify(data)});assert.equal(response.status,200);return response.json();};
  assert.equal((await get()).font.family,'"共通明朝"');
  await patch({defaultFontFamily:'共通ゴシック'});
  assert.equal(fs.existsSync(config),false,'共通設定の通知だけでは作品の設定ファイルを書かない');
  await patch({font:{sizePx:18}});
  assert.equal((await get()).font.useDefault,true);
  assert.equal(JSON.parse(fs.readFileSync(config,'utf8')).font.family,undefined);
  await patch({font:{family:'個別明朝',useDefault:false}});
  await patch({defaultFontFamily:'さらに変更'});
  assert.equal((await get()).font.family,'"個別明朝"');
  await patch({font:{useDefault:true}});
  assert.equal((await get()).font.family,'"さらに変更"');
  assert.equal(JSON.parse(fs.readFileSync(config,'utf8')).font.useDefault,true);
  const index=await (await fetch(base+'/')).text();
  assert.match(index,/id="useDefaultFont"/);
  for (const script of index.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
});
