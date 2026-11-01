import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../web/app.mjs", import.meta.url), "utf8");
const navigation = fs.readFileSync(new URL("../web/lib/view-navigation.mjs", import.meta.url), "utf8");

test("ブラウザ履歴で作品内の一覧と編集画面を復元する", () => {
  assert.match(navigation, /history\.pushState\(\{ mojigotoRoute: next \}/);
  assert.match(app, /window\.addEventListener\("popstate"/);
  for (const kind of ["manuscript-list", "manuscript-file", "notes-list", "note-editor", "concept-list", "concept-editor", "settings"]) {
    assert.match(kind === "manuscript-file" ? fs.readFileSync(new URL("../web/lib/manuscript-load.mjs", import.meta.url), "utf8") : app, new RegExp(`routeForWork\\("${kind}"`));
  }
  assert.match(navigation, /state\.viewRoutes\.get\(key\)/);
  assert.match(navigation, /editorScrollTop/);
  assert.match(navigation, /work: routeWorkSnapshot\(\)/);
  assert.match(app, /const fastInitialRestore = Boolean/);
  assert.match(app, /isRestorableWorkSnapshot\(savedWork\)/);
  assert.match(navigation, /if \(!work\) \{[\s\S]*?commitRoute\(\{ kind: "works" \}, \{ replace: true \}\)/);
  assert.match(navigation, /const restoredRoute = \{ \.\.\.savedRoute, work: routeWorkSnapshot\(work\) \}/);
  assert.match(app, /if \(fastInitialRestore\) \{[\s\S]*?restoreRoute\(savedRoute, \{ fromHistory: true \}\)/);
  assert.match(app, /const discovery = discoverWorkCatalog/);
  assert.match(app, /\(reportIncomplete\) => discoverWorks\(provider, root/);
  assert.match(app, /state\.referenceWorkDiscovery = \{/);
  assert.match(app, /discoveredWorks = await discovery/);
});

test("作品一覧と構想メモの表示条件を端末へ保存する", () => {
  assert.match(app, /mojigoto\.web\.viewPreferences\.v1/);
  assert.match(app, /workStatuses: checkedValues\(elements\.workStatusFilter\)/);
  assert.match(app, /conceptFolders: checkedValues\(elements\.conceptFolderFilterOptions\)/);
  assert.match(app, /conceptTags: checkedValues\(elements\.conceptTagFilterOptions\)/);
  assert.match(app, /restoreViewPreferences\(\)/);
});

test("画面復元と編集画面の読込中は途中の画面を表示しない", () => {
  assert.match(app, /前回の画面を開いています/);
  assert.match(app, /showNoteEditorLoading\(\)/);
  assert.match(app, /noteEditorSection\.classList\.add\("is-loading"\)/);
  assert.match(app, /function showNoteEditorLoading\(\) \{[\s\S]*?filesSection\.hidden = true/);
  assert.match(app, /function showNoteEditorLoading\(\) \{[\s\S]*?worksSection\.hidden = true/);
  assert.match(app, /function showManuscriptRouteLoading\(item\) \{[\s\S]*?worksSection\.hidden = true/);
  assert.match(app, /function finishAuthBoot\(\) \{[\s\S]*?finishViewRestoreLoading\(\)/);
  assert.match(app, /function finishViewRestoreLoading\(\) \{[\s\S]*?classList\.remove\("auth-pending"\)/);
  assert.match(navigation, /state\.navigationDestination = routeDestination\(route\)/);
  assert.match(app, /if \(state\.navigationDestination\) return state\.navigationDestination/);
  assert.match(app, /state\.navigationDetailEditor \|\| !elements\.readerSection\.hidden \|\| !elements\.noteEditorSection\.hidden/);
  assert.match(app, /window\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/);
});
