import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
const move = app.match(/^function moveToNotePreviewTarget\([^]*?\r?\n}/m)[0];

function harness(targetPresent = true, overlapping = false) {
  const calls = [], frames = [], attributes = {};
  const state = { noteTocOpen:true, dirty:true, currentNote:{data:{title:"未保存のノート",groups:[]}} };
  const elements = {
    notePreviewDialog:{open:true,getBoundingClientRect:()=>({left:overlapping ? 200 : 900,right:1320,width:420}),close() { this.open = false; }},
    notePreviewContent:{scrollTop:180}, noteToc:{hidden:false},
    noteTocToggle:{setAttribute:(key,value) => { attributes[key] = value; }},
  };
  const input = {focus:options => calls.push(["focus",options])};
  const target = {
    getBoundingClientRect:()=>({left:100,right:850,width:750}),
    scrollIntoView:options => calls.push(["scroll",options]),
    querySelector:selector => { calls.push(["input",selector]); return input; },
  };
  const context = {state,elements,requestAnimationFrame:callback => frames.push(callback),
    document:{getElementById:id => { calls.push(["target",id]); return targetPresent ? target : null; }}};
  vm.createContext(context);
  vm.runInContext(move, context);
  return {state,elements,attributes,calls,move:context.moveToNotePreviewTarget,flush:() => frames.splice(0).forEach(callback => callback())};
}

test("編集欄と重ならない場合は移動後もプレビューと未保存内容を保持する", () => {
  for (const itemIndex of [0, 1, null]) {
    const h = harness();
    h.move(2, itemIndex);
    h.flush();
    assert.equal(h.elements.notePreviewDialog.open, true);
    assert.equal(h.elements.notePreviewContent.scrollTop, 180);
    assert.equal(h.state.dirty, true);
    assert.equal(h.state.currentNote.data.title, "未保存のノート");
    assert.equal(h.state.noteTocOpen, false);
    assert.equal(h.elements.noteToc.hidden, true);
    assert.equal(h.attributes["aria-expanded"], "false");
    assert.equal(h.calls[0][1], itemIndex == null ? "note-group-2" : `note-item-2-${itemIndex}`);
    assert.equal(h.calls[1][1].block, itemIndex == null ? "start" : "center");
    assert.equal(h.calls[2][1], itemIndex == null ? ".note-group-title" : "input, textarea");
    assert.equal(h.calls[3][1].preventScroll, true);
  }
});

test("対象が見つからない場合もプレビューを閉じず入力を変更しない", () => {
  const h = harness(false);
  h.move(2, 1);
  assert.doesNotThrow(h.flush);
  assert.equal(h.elements.notePreviewDialog.open, true);
  assert.equal(h.state.dirty, true);
  assert.deepEqual(h.calls, [["target","note-item-2-1"]]);
});

test("編集欄に重なるプレビューは移動時に閉じ、本文と未保存状態を保持する", () => {
  for (const itemIndex of [0,1,null]) {
    const h=harness(true,true);h.move(2,itemIndex);h.flush();
    assert.equal(h.elements.notePreviewDialog.open,false);
    assert.equal(h.state.dirty,true);assert.equal(h.state.currentNote.data.title,"未保存のノート");
    assert.equal(h.calls[1][0],"scroll");assert.equal(h.calls[3][0],"focus");
  }
});

test("重なる配置でも対象が見つからない場合はプレビューを残す",()=>{
  const h=harness(false,true);h.move(2,1);h.flush();
  assert.equal(h.elements.notePreviewDialog.open,true);assert.equal(h.state.dirty,true);
});
