const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/preview/vertical-layout-core');
const print = require('../src/export/vertical-print-line-utils');
const { positionMonoRubyAnnotations, getMonoRubyStyle } = require('../src/preview/ruby-spacing');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const sample = '|人《レイ》|族《オン》|の《テール》|国《王国》。';
const textLines = lines => lines.map(line => line.tokens.map(token => token.displayText).join(''));

test('利用者の3字行の例は「人族の｜国。」となり、句読点の設定も本文と一致する', () => {
  for (const split of [core.splitTextIntoDisplayLines, print.normalizeVerticalPrintMeasureLines]) {
    for (const useTypographyAdjustments of [true,false]) {
      for (const punctuationLayoutMode of ['hanging','pushout']) {
        const options = {charsPerLine:3,useTypographyAdjustments,punctuationLayoutMode};
        const lines = split(sample,options);
        assert.deepEqual(textLines(lines),textLines(split('人族の国。',options)));
        assert.deepEqual(textLines(lines),['人族の','国。']);
        assert.equal(lines.flatMap(line=>line.tokens).map(token=>token.raw).join(''),sample);
      }
    }
  }
});

test('前後の本文・行末・ページ用の行でも単一の読みで改行を変えない', () => {
  for (const split of [core.splitTextIntoDisplayLines, core.splitTextIntoMeasureLines, print.normalizeVerticalPrintMeasureLines]) {
    for (const charsPerLine of [1,2,3,4,8]) {
      for (const useTypographyAdjustments of [true,false]) {
        const options = {charsPerLine,useTypographyAdjustments};
        const text = '前「'+sample+'」後\n'+sample;
        assert.deepEqual(textLines(split(text,options)),textLines(split('前「人族の国。」後\n人族の国。',options)));
      }
    }
  }
});

function checkRun(tokens, lower=-0.5, upper=tokens.length+0.5) {
  const original = structuredClone(tokens);
  const placed = positionMonoRubyAnnotations(tokens);
  let end = lower;
  placed.forEach((token,index)=>{
    const {fontEm,positionPercent}=token.monoRubyLayout;
    const length = Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(token.rubyText)).length * fontEm;
    const start = index + positionPercent / 100 - length / 2;
    assert.ok(start >= end - 1e-9,'隣の注釈に重ねない');
    assert.ok(start >= lower - 1e-9);
    end = start + length;
    assert.ok(fontEm > 0 && fontEm <= .5);
    assert.ok(positionPercent >= -1e-6 && positionPercent <= 100+1e-6,'注釈の中心を対応する親文字から半字以上離さない');
    assert.equal(token.displayText,original[index].displayText);
    assert.equal(token.rubyText,original[index].rubyText);
  });
  assert.ok(end <= upper + 1e-9,'行末のはみ出しを半字以内に抑える');
  assert.deepEqual(tokens,original,'元のトークンや原稿を変更しない');
  return placed;
}

test('通常のモノルビは半字以内の空きを使い、本文を動かさず読みの大きさを保つ', () => {
  const tokens = core.tokenizeMojigotoDisplayUnits(sample).slice(0,3);
  const placed = checkRun(tokens);
  assert.ok(placed.every(token=>token.monoRubyLayout.fontEm===.5));
  assert.ok(placed.some(token=>token.monoRubyLayout.positionPercent!==50));
});

test('長短の読みが混在しても対応位置を保ち、極端に長い1件で全ての読みを縮めない', () => {
  const placed=checkRun(core.tokenizeMojigotoDisplayUnits('|字《'+'あ'.repeat(100)+'》|後《ご》'));
  assert.equal(placed[1].monoRubyLayout.fontEm,.5);
  for(let seed=1;seed<=40;seed++) {
    const source=Array.from({length:12},(_,index)=>'|字《'+'あ'.repeat((seed*(index+3))%13+1)+'》').join('');
    checkRun(core.tokenizeMojigotoDisplayUnits(source));
  }
});

test('密集した長い読み・当て字・漢字・英字は読み側を縮め、対応や本文送りを変えない', () => {
  for (const source of ['|人《レイオン》|族《テール》|国《王国王国》','|夜《Night》|空《SKY》','|あ《亜天字》|星《スター★》','|字《'+'あ'.repeat(100)+'》','|𠮷《よし》|辻\u{E0100}《か\u3099》']) {
    checkRun(core.tokenizeMojigotoDisplayUnits(source));
  }
  const placed = checkRun(core.tokenizeMojigotoDisplayUnits('|人《レイオン》|族《テール》|国《王国王国》'));
  assert.ok(placed.every(token=>token.monoRubyLayout.fontEm<.5));
});

test('グループルビ・傍点の隣ではその側の空きを借りず、通常文字や改行で連続を区切る', () => {
  const mono = core.tokenizeMojigotoDisplayUnits('|の《テール》')[0];
  const group = core.tokenizeMojigotoDisplayUnits('|東京《とうきょう》')[0];
  const emphasis = {type:'bouten',displayText:'字'};
  const tokens = [group,mono,emphasis];
  const placed = positionMonoRubyAnnotations(tokens);
  assert.equal(placed[0],group);assert.equal(placed[2],emphasis);
  assert.equal(placed[1].monoRubyLayout.fontEm,1/3);
  assert.equal(placed[1].monoRubyLayout.positionPercent,50);
  const plain = {type:'char',displayText:'の',displayWidth:1};
  const separated = positionMonoRubyAnnotations([mono,plain,mono]);
  assert.equal(separated[0].monoRubyLayout.fontEm,.5);
  assert.equal(separated[2].monoRubyLayout.fontEm,.5);
});

test('行を確定した後で配置を計算し、描画の注釈に位置とサイズを渡す', () => {
  const lines = core.splitTextIntoDisplayLines(sample,{charsPerLine:3});
  const html = core.renderDisplayLineHtml(lines[0]);
  assert.match(html,/--rubyAdvance:1\.000em;/);
  assert.match(html,/--mjm-mono-position:/);
  assert.match(html,/--mjm-mono-font:0\.5em;/);
  assert.ok(html.includes('テール'));
  assert.ok(!html.includes('王国'));
  assert.equal(getMonoRubyStyle({type:'char',displayText:'字'}),'');
});

for (const mode of ['single','2up','real']) {
  test(`${mode}: ページをまたぐ実HTMLでもルビなし原稿と本文の行を一致させる`, () => {
    const result=spawnSync(process.execPath,['-e',`
      const assert=require('node:assert/strict');
      const Module=require('node:module');
      const original=Module._load;
      Module._load=function(request,parent,...rest){
        if(request==='vscode')return {workspace:{getConfiguration:()=>({get:(_k,f)=>f})}};
        if(request==='./manuscript-export' && parent?.filename.endsWith('merged-manuscript-core.js'))return {getWorkNameForStats:()=>''};
        return original.call(this,request,parent,...rest);
      };
      const simple=require('./src/export/merged-manuscript-browser-html');
      const real=require('./src/export/merged-manuscript-browser-realprint-html');
      Module._load=original;
      const render=${mode === 'real' ? 'real.renderMergedManuscriptBrowserRealPrintHtml' : 'simple.renderMergedManuscriptBrowserHtml'};
      const options={htmlDirection:'vertical',htmlPrintLayoutMode:${JSON.stringify(mode)},charsPerLine:3,realPrintCharsPerLine:3,linesPerPage:4,realPrintLinesPerPage:4};
      function output(content,on){return render({workName:'確認',manuscriptRoot:require('node:path').resolve('.review-baseline/ruby-test-context/manuscript'),entries:[{content}]},{...options,useTypographyAdjustments:on});}
      function lines(html){return Array.from(html.matchAll(/<div class="mjm-line[^\"]*">([\\s\\S]*?)<\\/div>/g),m=>m[1].replace(/<span class="mjm-ruby-text">[^<]*<\\/span>/g,'').replace(/<[^>]*>/g,''));}
      for(const on of [true,false]) {
        const html=output((${JSON.stringify(sample)}+'\\n').repeat(40),on);
        const plain=output(('人族の国。\\n').repeat(40),on);
        assert.deepEqual(lines(html),lines(plain));
        assert.ok(lines(html).length>=80);
        assert.equal(lines(html)[0],'人族の');
        assert.ok(html.includes('--mjm-mono-position:'));
      }
      process.stdout.write('ok');
    `],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:5000});
    assert.ifError(result.error);
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,'ok');
  });
}
