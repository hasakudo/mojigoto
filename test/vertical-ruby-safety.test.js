const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = require('../src/preview/vertical-layout-core');
const print = require('../src/export/vertical-print-line-utils');
const {getMonoRubyAdvance}=require('../src/preview/ruby-spacing');

test('単一ルビの読みの長さは本文の行分割を変えない', () => {
  const text='|人《レイ》|族《オン》|の《テール》|国《王国》';
  const tokens=core.tokenizeMojigotoDisplayUnits(text);
  assert.equal(tokens[2].displayWidth,1,'原稿の親文字数とレイアウトの長さを混同しない');
  for(const token of tokens) {
    const advance=getMonoRubyAdvance(token);
    assert.equal(advance,1);
    assert.equal(core.getRubyVisualMeasureWidth(token),advance);
    assert.equal(print.getRubyVisualMeasureWidth(token),advance);
  }
  for(const split of [core.splitTextIntoDisplayLines,print.normalizeVerticalPrintMeasureLines]) {
    for(const useTypographyAdjustments of [true,false]) {
      const lines=split(text,{charsPerLine:4,useTypographyAdjustments});
      assert.equal(lines.flatMap(line=>line.tokens).map(t=>t.raw).join(''),text);
      assert.equal(lines.length,1,'本文4字を4字行に収める');
      for(const line of lines)assert.ok(line.tokens.reduce((n,t)=>n+getMonoRubyAdvance(t),0)<=4);
    }
  }
});

test('2字の単一ルビに余白を足さず、行に収まる単一ルビを余分に次行へ送らない', () => {
  const sample='|人《レイ》|族《オン》|の《テール》|国《王国》';
  const tokens=core.tokenizeMojigotoDisplayUnits(sample);
  assert.deepEqual(tokens.map(getMonoRubyAdvance),[1,1,1,1]);
  for(const split of [core.splitTextIntoDisplayLines,print.normalizeVerticalPrintMeasureLines]) {
    for(const useTypographyAdjustments of [true,false]) {
      const lines=split('前'.repeat(5)+sample,{charsPerLine:10,useTypographyAdjustments});
      assert.equal(lines.length,1,'本文9字なので10字行に収まる');
    }
  }
});

test('単一の字送りは結合文字・異体字を分断せず、グループを分配しない', () => {
  for(const base of ['人','𠮷','辻\u{E0100}','か\u3099']) {
    const token={type:'ruby',displayText:base,rubyText:'テール'};
    assert.equal(getMonoRubyAdvance(token),getMonoRubyAdvance({...token,displayText:'人'}));
    assert.match(core.renderDisplayTokenHtml(token),/mjm-ruby-mono/);
  }
  assert.equal(getMonoRubyAdvance({type:'ruby',displayText:'人族',rubyText:'レイオン'}),0);
  assert.equal(getMonoRubyAdvance({type:'text',displayText:'人',rubyText:'レイ'}),0);
  assert.equal(getMonoRubyAdvance({type:'ruby',displayText:'人',rubyText:''}),0);
  assert.equal(getMonoRubyAdvance({type:'ruby',displayText:'あ',rubyText:'か\u3099'}),1);
});

test('プレビューは組版調整ON/OFFとも本文1字分で単一ルビを描く', () => {
  for(const useTypographyAdjustments of [true,false]) {
    const lines=core.splitTextIntoDisplayLines('｜命《ティニー》',{useTypographyAdjustments});
    const html=core.renderDisplayLineHtml(lines[0]);
    const advance=Number(/--rubyAdvance:([\d.]+)em/.exec(html)[1]);
    assert.equal(advance,1);
    assert.ok(html.includes('ティニー'));
    assert.ok(!html.includes('--rubyBaseAdvance:'),'短いルビ用の従来の圧縮を適用しない');
  }
});

for (const target of ['preview', 'print']) {
  test(`${target}: 1行より長いルビを次行へ送り続けず、本文と読みを保持して戻る`, () => {
    // Run the former endless loop out of process so a regression is bounded.
    const result = spawnSync(process.execPath, ['-e', `
      const assert=require('node:assert/strict');
      const core=require('./src/preview/vertical-layout-core');
      const print=require('./src/export/vertical-print-line-utils');
      const split=${target === 'preview' ? 'core.splitTextIntoDisplayLines' : 'print.normalizeVerticalPrintMeasureLines'};
      for (const text of ['｜東京都市部《とうきょうとしぶ》','前｜東京都市部《とうきょうとしぶ》後','｜字《'+ 'あ'.repeat(100)+'》','｜'+ '漢'.repeat(50)+'《'+ 'かん'.repeat(50)+'》']) {
        for (const useTypographyAdjustments of [true,false]) {
          const lines=split(text,{charsPerLine:4,useTypographyAdjustments});
          assert.ok(lines.length>0 && lines.length<100);
          assert.equal(lines.flatMap(line=>line.tokens).map(token=>token.raw).join(''),text);
        }
      }
      process.stdout.write('ok');
    `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 4000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'ok');
  });
}

test('既存の一文字ずつのルビは親文字と読みの対応を保って行を分けられる', () => {
  const text='｜東《とう》｜京《きょう》｜都《と》｜市《し》｜部《ぶ》';
  for (const split of [core.splitTextIntoDisplayLines,print.normalizeVerticalPrintMeasureLines]) {
    const lines=split(text,{charsPerLine:4});
    const tokens=lines.flatMap(line=>line.tokens);
    assert.deepEqual(tokens.map(token=>[token.displayText,token.rubyText]),[['東','とう'],['京','きょう'],['都','と'],['市','し'],['部','ぶ']]);
    assert.ok(lines.length>=2);
    assert.equal(tokens.map(token=>token.raw).join(''),text);
  }
});

const nonPhoneticRuby = [
  {text:'｜運《デス》｜命《ティニー》',pairs:[['運','デス'],['命','ティニー']]},
  {text:'｜あ《亜》｜て《天》｜じ《字》',pairs:[['あ','亜'],['て','天'],['じ','字']]},
  {text:'｜夜《Night》｜空《SKY》',pairs:[['夜','Night'],['空','SKY']]},
  {text:'｜星《スター★》｜光《Light光》',pairs:[['星','スター★'],['光','Light光']]},
];
for (const [name,split] of [['preview',core.splitTextIntoDisplayLines],['print',print.normalizeVerticalPrintMeasureLines]]) {
  test(`${name}: 当て字・別読みのルビも指定された対応を変更せず行分割する`, () => {
    for (const sample of nonPhoneticRuby) {
      for (const useTypographyAdjustments of [true,false]) {
        const lines=split('前'+sample.text+'後',{charsPerLine:2,useTypographyAdjustments});
        const tokens=lines.flatMap(line=>line.tokens);
        assert.deepEqual(tokens.filter(token=>token.type==='ruby').map(token=>[token.displayText,token.rubyText]),sample.pairs);
        assert.equal(tokens.map(token=>token.raw).join(''),'前'+sample.text+'後');
        assert.ok(lines.length>=2);
      }
    }
    const group=core.tokenizeMojigotoDisplayUnits('｜運命《デスティニー》');
    assert.equal(group.length,1,'語全体の指定は勝手に文字ごとへ配分しない');
    assert.equal(group[0].rubyText,'デスティニー');
  });
}

test('Webノートも当て字・別読みのルビを同じ対応で解釈する', async () => {
  const {parseNoteInline}=await import('../web/lib/note-inline.mjs');
  for(const sample of nonPhoneticRuby) {
    assert.deepEqual(parseNoteInline(sample.text).map(token=>[token.text,token.reading]),sample.pairs);
  }
  assert.deepEqual(parseNoteInline('｜運命《デスティニー》'),[{type:'ruby',text:'運命',reading:'デスティニー'}]);
});

for (const mode of ['single','2up','real']) {
  test(`${mode}: 長いルビを含む書き出しHTMLを最後まで生成できる`, () => {
    const result = spawnSync(process.execPath,['-e',`
      const assert=require('node:assert/strict');
      const path=require('node:path');
      const Module=require('node:module');
      const originalLoad=Module._load;
      Module._load=function(request,parent,...rest) {
        if(request==='vscode')return {workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback})}};
        if(request==='./manuscript-export' && parent?.filename.endsWith('merged-manuscript-core.js'))return {getWorkNameForStats:()=>''};
        return originalLoad.call(this,request,parent,...rest);
      };
      const simple=require('./src/export/merged-manuscript-browser-html');
      const real=require('./src/export/merged-manuscript-browser-realprint-html');
      Module._load=originalLoad;
      const data={workName:'確認',manuscriptRoot:path.resolve('.review-baseline/ruby-test-context/manuscript'),entries:[{content:${JSON.stringify('前｜東京都市部《とうきょうとしぶ》後。\n｜運《デス》｜命《ティニー》\n｜あ《亜》｜て《天》｜じ《字》\n｜夜《Night》｜空《SKY》\n|人《レイ》|族《オン》|の《テール》|国《王国》')}}]};
      const options={htmlDirection:'vertical',htmlPrintLayoutMode:${JSON.stringify(mode)},charsPerLine:4,linesPerPage:16,realPrintCharsPerLine:4,realPrintLinesPerPage:16,useTypographyAdjustments:true};
      const html=${mode === 'real' ? 'real.renderMergedManuscriptBrowserRealPrintHtml' : 'simple.renderMergedManuscriptBrowserHtml'}(data,options);
      assert.ok(html.endsWith('</html>'));
      assert.ok(html.includes('東京都市部'));
      assert.ok(html.includes('とうきょうとしぶ'));
      assert.ok(html.includes('後'));
      for(const value of ['デス','ティニー','亜','天','字','Night','SKY'])assert.ok(html.includes(value),value);
      assert.ok(html.includes('--mjm-mono-advance:1.000em;'),'本文1字分で描画する');
      assert.ok(html.includes('--mjm-mono-position:'),'行ごとの注釈の配置を渡す');
      assert.ok(html.includes('mjm-ruby mjm-ruby-mono'),'単一用の中央配置を使う');
      process.stdout.write('ok');
    `], {cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:4000});
    assert.ifError(result.error);
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,'ok');
  });
}
