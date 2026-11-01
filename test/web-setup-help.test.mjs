import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { initSetupHelp } from "../web/lib/setup-help.mjs";

function helpFixture({ wide = false, hash = "" } = {}) {
  const nodes = new Map(), events = {}, modes = [], media = { matches: wide, addEventListener(_name, callback) { this.change = callback; } };
  const documentRef = {
    getElementById: (id) => nodes.get(id),
    createElement: () => make("link"),
    querySelectorAll: () => [nodes.get("setupHelpButton")],
  };
  const make = (id, tagName = "DIV") => {
    const node = { id, tagName, children: [], events: {}, dataset: {}, isConnected: true, scrollTop: 120,
      addEventListener(name, callback) { this.events[name] = callback; },
      setAttribute(name, value) { this[name] = value; },
      focus(options) { documentRef.activeElement = this; this.focusOptions = options; },
      contains(target) { return target === this || this.children.some((child) => child.contains(target)); },
      append(...children) {
        for (const child of children) {
          if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
          child.parentNode = this;
          this.children.push(child);
        }
      },
      insertBefore(child, before) {
        this.append(child);
        this.children = this.children.filter((item) => item !== child);
        this.children.splice(this.children.indexOf(before), 0, child);
      },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      querySelector: () => ({ textContent: id }),
      getBoundingClientRect: () => ({ top: id === "setupVscodeDetails" ? 200 : 100 }),
    };
    nodes.set(id, node);
    return node;
  };
  const main = make("main"), notice = make("setupActionNotice"), launcher = make("setupHelpButton");
  launcher.dataset.setupHelp = "";
  main.append(notice, launcher);
  const dialog = make("setupHelpDialog"), close = make("setupHelpClose"), content = make("setupHelpContent"), nav = make("setupHelpContents");
  const topics = [make("setupFolderExamples", "SECTION"), make("setupVscodeDetails", "DETAILS")];
  content.append(nav, ...topics); dialog.append(close, content);
  dialog.querySelectorAll = () => topics;
  dialog.show = () => { dialog.open = true; modes.push("side"); };
  dialog.showModal = () => { dialog.open = true; modes.push("modal"); };
  dialog.close = () => { dialog.open = false; };
  documentRef.activeElement = launcher;
  const windowRef = { matchMedia: () => media, location: { hash }, addEventListener(name, callback) { events[name] = callback; } };
  const controller = initSetupHelp({ documentRef, windowRef });
  return { controller, nodes, media, modes, events, documentRef, windowRef, dialog, notice, main, content, launcher };
}

test("狭い画面のヘルプはモーダルで開き、閉じると操作元へ戻り通知もメインへ戻す", () => {
  const f = helpFixture();
  f.launcher.events.click();
  assert.deepEqual(f.modes, ["modal"]);
  assert.equal(f.launcher["aria-expanded"], "true");
  assert.equal(f.notice.parentNode, f.dialog);
  assert.equal(f.documentRef.activeElement.id, "setupHelpClose");
  f.controller.close();
  f.dialog.events.close();
  assert.equal(f.launcher["aria-expanded"], "false");
  assert.equal(f.notice.parentNode, f.main);
  assert.equal(f.documentRef.activeElement, f.launcher);
  assert.deepEqual(f.launcher.focusOptions, { preventScroll: true });
});

test("広い画面のヘルプはサイド表示となり、幅変更後も開いた項目と読んでいた位置を保持する", () => {
  const f = helpFixture({ wide: true });
  f.controller.open("setupVscodeDetails");
  assert.deepEqual(f.modes, ["side"]);
  assert.equal(f.nodes.get("setupVscodeDetails").open, true);
  f.content.scrollTop = 246;
  f.media.matches = false;
  f.media.change();
  f.dialog.events.close(); // Previous close event can arrive after reopening.
  assert.deepEqual(f.modes, ["side", "modal"]);
  assert.equal(f.dialog.open, true);
  assert.equal(f.content.scrollTop, 246);
  assert.equal(f.notice.parentNode, f.dialog);
  assert.equal(f.launcher["aria-expanded"], "true");
  f.controller.close(); f.dialog.events.close();
  assert.equal(f.documentRef.activeElement, f.launcher);
});

test("ヘルプの目次と既存URLの見本リンクは対応する項目を開き、他の画面のhashでは開かない", () => {
  const f = helpFixture({ hash: "#setupFolderExamples" });
  assert.equal(f.dialog.open, true);
  f.nodes.get("setupHelpContents").children[1].events.click({ preventDefault() {} });
  assert.equal(f.nodes.get("setupVscodeDetails").open, true);
  const other = helpFixture({ hash: "#setupPermissions" });
  assert.equal(other.dialog.open, undefined);
  assert.equal(other.controller.open("main"), false);
  other.windowRef.location.hash = "#setupVscodeDetails";
  other.events.hashchange();
  assert.equal(other.dialog.open, true);
});

test("ヘルプのEscapeは画面の登録状態を変えずに閉じる", () => {
  const f = helpFixture({ wide: true });
  f.controller.open();
  let prevented = false;
  f.dialog.events.keydown({ key: "Escape", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(f.dialog.open, false);
});

const setupSource = fs.readFileSync(new URL("../web/google-drive-setup.mjs", import.meta.url), "utf8");
function rootSwitchFixture({ picked = { id: "new" }, fails = false } = {}) {
  const nodes = new Map(), current = { id: "old" }, calls = [], stored = [];
  const el = (id) => { if (!nodes.has(id)) nodes.set(id, { addEventListener() {} }); return nodes.get(id); };
  const context = vm.createContext({ el, run: (action) => action(), token: async () => "token",
    picker: { pickFolder: async () => picked }, provider: { getItemMetadata: async () => ({ id: "new", name: "既存のSingle作品", folder: {} }) },
    status: (...args) => calls.push(args), finishRoot: async (root) => { if (fails) throw new Error("permission"); stored.push(root); current.id = root.id; },
  });
  const start = setupSource.indexOf("const switchRegisteredRoot =");
  vm.runInContext(setupSource.slice(start, setupSource.indexOf('\nel("setupAdditional")', start)) + "\nglobalThis.switchRoot = switchRegisteredRoot;", context);
  return { context, nodes, current, calls, stored };
}

test("許可済みの既存Single作品も切り替え経路から登録でき、キャンセル・失敗時は前の登録を保持する", async () => {
  const f = rootSwitchFixture();
  await f.context.switchRoot();
  assert.equal(f.current.id, "new");
  assert.equal(f.stored[0].name, "既存のSingle作品");
  assert.match(f.nodes.get("setupCompleteSummary").textContent, /切り替え・登録復元/);
  const cancelled = rootSwitchFixture({ picked: null });
  await cancelled.context.switchRoot();
  assert.equal(cancelled.current.id, "old");
  const failed = rootSwitchFixture({ fails: true });
  await assert.rejects(failed.context.switchRoot(), /permission/);
  assert.equal(failed.current.id, "old");
});

test("登録済みでも新しいフォルダを選ぶ入口を残し、許可作業中は隠す", async () => {
  const nodes = new Map();
  const el = (id) => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); };
  const context = vm.createContext({ el, connected: false, auth: { getAccessToken: async () => "token", scope: "file" },
    header: { setConnected() {} }, savedRoot: () => ({ id: "old", name: "登録済み作品", googleDriveScope: "file" }),
    candidate: null, completedRoot: null, plan: null, folderDrop: null, localImportReading: false,
  });
  const start = setupSource.indexOf("async function updateConnection()");
  vm.runInContext(setupSource.slice(start, setupSource.indexOf("function savedRoot()", start)), context);
  await context.updateConnection();
  assert.equal(el("setupRegistered").hidden, false);
  assert.equal(el("setupChoices").hidden, false);
  assert.equal(el("setupSwitchRoot").disabled, false);
  context.candidate = { id: "pending" };
  await context.updateConnection();
  assert.equal(el("setupChoices").hidden, true);
});
