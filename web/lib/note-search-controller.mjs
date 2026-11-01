import * as shared from "./note-search-replace.js";
import * as sharedSession from "./note-replace-session.js";

const core = shared.default ?? globalThis.MojigotoNoteSearchReplace;
const PAGE_SIZE = 30;
const FIELD_CONTROLS = { title: "group-title", label: "divider-label", value: "divider-value", heading: "entry-heading", body: "entry-body", "memo.body": "entry-memo" };

const { createNoteReplaceSession } = sharedSession.default ?? globalThis.MojigotoNoteReplaceSession;

// Changes stay in the live draft and use the editor's existing dirty/save pipeline.
export function createNoteSearchController({ state, elements: e, document, scopeKey, onChange = () => {}, extraBusy = () => false, validateChanges = () => "", getNote = () => state.currentNote?.data, getItem = () => state.currentNote?.item, isVisible = () => !e.noteEditorSection.hidden, locateControl, jumpToField, formatLocation, defaultFields = { names: true, details: true, memos: false }, fieldLabels = { names: "名称", details: "詳細", memos: "メモ" }, frame = requestAnimationFrame, schedule = setTimeout, unschedule = clearTimeout }) {
  let owner = null, remembered = null, plan = null, snapshot = "", page = 0, timer = null, composing = false;
  let replacePlan = null, revision = 0, applying = false;
  let replaceControls = [];
  const selection = new Set();
  const replacing = () => Boolean(e.noteReplaceMode?.checked);
  const busy = () => Boolean(extraBusy() || composing || state.saving || state.syncing || state.externalConflict || state.noteConceptSyncPending || state.noteManualSyncPending);
  const session = createNoteReplaceSession({ core, getNote, getRevision: () => revision,
    onChange: () => { revision++; onChange(); } });
  function updateActions() {
    if (!e.noteReplaceApply) return;
    for (const control of replaceControls) control.disabled = busy();
    const valid = new Set(replacePlan?.candidates.map(row => row.id) || []);
    for (const id of selection) if (!valid.has(id)) selection.delete(id);
    e.noteReplaceActions.hidden = !replacing(); e.noteReplaceFields.hidden = !replacing();
    e.noteReplaceUndo.hidden = !session.canUndo;
    e.noteReplaceApply.textContent = "選択した" + selection.size + "箇所を置換";
    e.noteReplaceApply.disabled = busy() || !replacePlan || !selection.size;
    e.noteReplaceSelectAll.disabled = busy() || !replacePlan?.candidates.length;
    e.noteReplaceClear.disabled = !selection.size;
    e.noteReplaceUndo.disabled = busy() || !session.canUndo;
    if (e.noteSearchFilterSummary) {
      const fields = [e.noteSearchNames.checked && fieldLabels.names, e.noteSearchDetails.checked && fieldLabels.details, e.noteSearchMemos.checked && fieldLabels.memos].filter(Boolean);
      e.noteSearchFilterSummary.textContent = "条件：" + (fields.join("・") || "対象なし") + (e.noteSearchCase.checked ? "／大小区別" : "");
    }
  }
  function clearPlan() { revision++; plan = null; replacePlan = null; snapshot = ""; selection.clear(); updateActions(); }
  const visible = text => text === "" ? "（空文字）" : text.replace(/\r\n|\r|\n/g, "↵\n").replace(/\t/g, "⇥");
  const node = (tag, text = "", className = "") => { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; };
  const capture = () => ({ provider: state.provider, work: state.selectedWork, scope: scopeKey(), id: getItem()?.id, noteId: getNote()?.id });
  const same = context => context && isVisible() && getNote()
    && context.provider === state.provider && context.work === state.selectedWork && context.scope === scopeKey()
    && context.id === getItem()?.id && context.noteId === getNote()?.id;
  const current = () => e.noteSearchDialog.open && same(owner);
  function cancelTimer() { if (timer !== null) unschedule(timer); timer = null; }
  function reset() {
    remembered = null; owner = null; clearPlan(); session.clearUndo(); page = 0; cancelTimer();
    if (e.noteReplaceMode) { e.noteReplaceMode.checked = false; e.noteReplaceText.value = ""; }
    updateActions();
    if (e.noteSearchFilter) e.noteSearchFilter.open = false;
    e.noteSearchQuery.value = ""; e.noteSearchNames.checked = defaultFields.names; e.noteSearchDetails.checked = defaultFields.details;
    e.noteSearchMemos.checked = defaultFields.memos; e.noteSearchCase.checked = false;
    e.noteSearchResults.replaceChildren();
  }
  function close() { cancelTimer(); if (e.noteSearchDialog.open) e.noteSearchDialog.close(); clearPlan(); }
  function render() {
    e.noteSearchResults.replaceChildren(); replaceControls = [];
    const matches = plan?.matches || [], pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    e.noteSearchPage.textContent = `${page + 1} / ${pages}`;
    e.noteSearchPrev.disabled = page === 0; e.noteSearchNext.disabled = page + 1 >= pages;
    for (const row of matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const field = plan.fields[row.fieldIndex], card = node("article", "", "note-search-result");
      const button = node("button", formatLocation ? formatLocation(field, row) : `${field.groupTitle || "名称なしの大分類"} / ${field.itemTitle ? field.itemTitle + " / " : ""}${field.label}・${row.line}行 ${row.column}文字目`, "text-button");
      button.type = "button"; button.addEventListener("click", () => jump(row));
      const excerpt = node("p", "", "note-search-excerpt");
      // Use original offsets and text nodes: manuscript strings are never interpreted as HTML.
      let left = Math.max(0, row.start - 35), right = Math.min(field.before.length, row.end + 35);
      if (left && /[\uDC00-\uDFFF]/.test(field.before[left])) left--;
      if (right < field.before.length && /[\uDC00-\uDFFF]/.test(field.before[right])) right++;
      excerpt.append(node("span", (left ? "…" : "") + field.before.slice(left, row.start)), node("mark", field.before.slice(row.start, row.end)), node("span", field.before.slice(row.end, right) + (right < field.before.length ? "…" : "")));
      card.append(button, excerpt);
      const candidate = replacePlan?.candidates.find(candidate => candidate.id === row.id);
      if (replacing() && candidate) {
        const label = node("label", "", "note-replace-choice"), checkbox = node("input"); checkbox.type = "checkbox";
        checkbox.checked = selection.has(row.id); checkbox.disabled = busy();
        checkbox.addEventListener("change", () => { if (checkbox.checked) selection.add(row.id); else selection.delete(row.id); updateActions(); });
        label.append(checkbox, node("span", "選択"));
        const one = node("button", "この箇所を置換", "text-button"); one.type = "button"; one.disabled = busy();
        one.addEventListener("click", () => apply([row.id]));
        replaceControls.push(checkbox, one);
        const rowActions = node("div", "", "note-replace-row-actions"); rowActions.append(label, one);
        card.append(node("p", "変更後：" + visible(candidate.previewAfter), "note-search-excerpt"), rowActions);
      } else if (replacing() && !row.reason) card.append(node("small", "変更前後が同じため置換しません。", "muted"));
      if (row.reason) card.append(node("small", row.reason === "malformed_notation" ? "記法の確認が必要なフィールドです。検索・移動のみ可能です。" : "ルビ・傍点内の一致です。検索・移動のみ可能です。", "muted"));
      e.noteSearchResults.append(card);
    }
    updateActions();
  }
  function search(message = "") {
    cancelTimer(); if (!current() || composing) return;
    page = 0; revision++; selection.clear(); snapshot = JSON.stringify(getNote());
    e.noteSearchTitle.title = `検索対象：${getNote().title || "名称未設定"}`;
    plan = core.buildSearchPlan(getNote(), { query: e.noteSearchQuery.value, caseSensitive: e.noteSearchCase.checked,
      fields: { names: e.noteSearchNames.checked, details: e.noteSearchDetails.checked, memos: e.noteSearchMemos.checked } });
    replacePlan = replacing() ? core.buildReplacePlan(getNote(), { query: e.noteSearchQuery.value, replacement: e.noteReplaceText.value, revision,
      caseSensitive: e.noteSearchCase.checked, fields: { names: e.noteSearchNames.checked, details: e.noteSearchDetails.checked, memos: e.noteSearchMemos.checked } }) : null;
    e.noteSearchStatus.textContent = !e.noteSearchQuery.value ? "検索する文字を入力してください。" : `${message}${plan.matches.length}箇所が一致しました。${replacing() ? " 置換候補は" + replacePlan.candidates.length + "箇所です。" : ""}${plan.issues.length ? " IDを確認できない箇所は結果から除外しています。" : ""}`;
    render();
  }
  function changed() {
    if (remembered && !same(remembered)) { close(); reset(); return; }
    if (applying || !current() || (plan && snapshot === JSON.stringify(getNote()))) return;
    clearPlan(); e.noteSearchResults.replaceChildren();
    e.noteSearchPrev.disabled = true; e.noteSearchNext.disabled = true;
    e.noteSearchStatus.textContent = "編集内容が変わりました。検索結果を更新しています…";
    cancelTimer(); timer = schedule(() => { timer = null; search(); }, 160);
  }
  function apply(ids) {
    if (!current() || !replacing() || applying) return;
    if (busy()) { e.noteSearchStatus.textContent = "保存・反映・文字変換が終わってから置換してください。競合がある場合は先に解決してください。"; updateActions(); return; }
    if (!replacePlan || snapshot !== JSON.stringify(getNote())) { search("編集内容が変わったため置換を中止しました。 "); return; }
    const preview = core.previewReplaceSelection(replacePlan, ids);
    const blocked = preview.ok ? validateChanges(preview.changes) : "";
    if (blocked) { e.noteSearchStatus.textContent = blocked; return; }
    applying = true;
    let result;
    try { result = session.apply(replacePlan, ids); } finally { applying = false; }
    search(result.ok && result.count ? result.count + "箇所を置換しました。 " : result.reason === "notation_change" ? "ルビ・傍点の記法が変わるため置換を中止しました。 " : "置換できませんでした。候補を確認し直してください。 ");
  }
  function undo() {
    if (!current() || applying) return;
    if (busy()) { e.noteSearchStatus.textContent = "保存・反映・文字変換が終わってから戻してください。競合がある場合は先に解決してください。"; updateActions(); return; }
    applying = true;
    let result;
    try { result = session.undo(); } finally { applying = false; }
    search(result.ok ? result.count + "箇所の置換を戻しました。 " : "対象が後から編集・削除されたため戻せませんでした。 ");
  }
  function clearUndo() { session.clearUndo(); clearPlan(); }
  function jump(row) {
    if (composing) return;
    if (!current()) { close(); reset(); return; }
    if (!plan || snapshot !== JSON.stringify(getNote())) { search("編集内容が変わったため結果を更新しました。 "); return; }
    const field = plan.fields[row.fieldIndex], note = getNote();
    if (jumpToField) { close(); jumpToField(field, row); return; }
    const groups = note.groups.map((group, index) => ({ group, index })).filter(({ group }) => group.id === field.groupId);
    if (groups.length !== 1) { search(); return; }
    const { group, index: groupIndex } = groups[0];
    const itemIndex = field.itemId ? group.items.findIndex(item => item.id === field.itemId) : null;
    if (field.itemId && itemIndex < 0) { search(); return; }
    const selector = `[data-note-field="${FIELD_CONTROLS[field.field]}"][data-group-index="${groupIndex}"]` + (itemIndex === null ? "" : `[data-item-index="${itemIndex}"]`);
    const control = locateControl ? locateControl(field) : e.noteGroups.querySelector(selector);
    if (!control || control.value !== field.before) { search("表示内容を再確認してください。 "); return; }
    const context = owner;
    close();
    if (e.notePreviewDialog?.open) e.notePreviewDialog.close();
    frame(() => {
      if (!same(context) || control.isConnected === false || control.value !== field.before) return;
      for (let details = control.closest("details"); details; details = details.parentElement?.closest("details")) details.open = true;
      control.focus({ preventScroll: true }); control.setSelectionRange(row.start, row.end);
      control.scrollIntoView({ block: "center", behavior: "auto" });
      if (control.tagName === "TEXTAREA") state.activeAssistTarget = control;
    });
  }
  function open() {
    if (!getNote() || !isVisible()) return;
    if (!same(remembered)) reset();
    owner = capture(); remembered = owner;
    e.noteSearchTitle.textContent = "検索・置換";
    e.noteSearchTitle.title = `検索対象：${getNote().title || "無題のノート"}`;
    if (!e.noteSearchDialog.open) e.noteSearchDialog.showModal();
    search(); e.noteSearchQuery.focus();
  }
  e.openNoteSearchButton.addEventListener("click", open);
  e.closeNoteSearchButton.addEventListener("click", close);
  e.noteSearchDialog.addEventListener("close", () => { cancelTimer(); clearPlan(); composing = false; });
  e.noteSearchQuery.addEventListener("compositionstart", () => { composing = true; cancelTimer(); clearPlan(); e.noteSearchResults.replaceChildren(); });
  e.noteSearchQuery.addEventListener("compositionend", () => { composing = false; search(); });
  e.noteSearchQuery.addEventListener("input", () => { if (!composing) { clearPlan(); e.noteSearchResults.replaceChildren(); e.noteSearchPrev.disabled = true; e.noteSearchNext.disabled = true; e.noteSearchStatus.textContent = "検索しています…"; cancelTimer(); timer = schedule(() => { timer = null; search(); }, 160); } });
  for (const control of [e.noteSearchNames, e.noteSearchDetails, e.noteSearchMemos, e.noteSearchCase]) control.addEventListener("change", () => search());
  e.noteSearchPrev.addEventListener("click", () => { if (current() && plan && page > 0) { page--; render(); e.noteSearchResults.scrollTop = 0; } });
  e.noteSearchNext.addEventListener("click", () => { if (current() && plan && (page + 1) * PAGE_SIZE < plan.matches.length) { page++; render(); e.noteSearchResults.scrollTop = 0; } });
  if (e.noteReplaceMode) {
    e.noteReplaceMode.addEventListener("change", () => search());
    e.noteReplaceText.addEventListener("input", () => { if (!composing) { clearPlan(); e.noteSearchResults.replaceChildren(); cancelTimer(); timer = schedule(() => { timer = null; search(); }, 160); } });
    e.noteReplaceText.addEventListener("compositionstart", () => { composing = true; clearPlan(); cancelTimer(); e.noteSearchResults.replaceChildren(); });
    e.noteReplaceText.addEventListener("compositionend", () => { composing = false; search(); });
    e.noteReplaceSelectAll.addEventListener("click", () => { if (!current() || busy() || !replacePlan) return; for (const row of replacePlan.candidates) selection.add(row.id); render(); });
    e.noteReplaceClear.addEventListener("click", () => { selection.clear(); render(); });
    e.noteReplaceApply.addEventListener("click", () => apply([...selection]));
    e.noteReplaceUndo.addEventListener("click", undo);
  }
  return { open, close, changed, clearUndo, updateAvailability: updateActions };
}
