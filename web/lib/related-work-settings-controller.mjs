import { referenceWorkKey } from "./shared-note-reader.mjs";
import { readRelatedWorkCatalog, saveWorkRelation, removeUnresolvedWorkRelation } from "./related-work-settings.mjs";

export function createRelatedWorkSettingsController({ state, elements, document, scopeKey, getWorks, beforeOpen, onOwnRecord, onPendingChange, onClose, readCatalog = readRelatedWorkCatalog, saveRelation = saveWorkRelation, removeUnresolved = removeUnresolvedWorkRelation, onCatalog = () => {}, measure }) {
  let owner = null, catalog = null, epoch = 0, busy = false, writing = false, opening = false, pendingScope = null;
  const pending = new Map();
  let summaryCatalog = null, summaryContext = null, summarySignature = null, summaryPromise = null, recordCache = new Map(), cacheScope = null;
  function contextFor(initial) {
    if (!cacheScope || cacheScope.provider !== initial.provider || cacheScope.scope !== initial.scope) {
      recordCache = new Map(); cacheScope = initial;
    }
    const context = { ...initial, cloudKind: state.cloudKind, recordCache, measure };
    context.getWorks = fresh => getWorks(context, fresh);
    return context;
  }
  function remember(result, context) {
    summaryCatalog = result; summaryContext = context;
    summarySignature = JSON.stringify([context.scope, referenceWorkKey(context.work), state.currentSettings?.data?.relatedWorkIds || []]);
    onCatalog();
  }
  function summary(data) {
    const selected = summaryContext && scopeMatches(summaryContext) ? summaryCatalog : null;
    const names = new Map((selected?.peers || []).filter(row => !row.problem).map(row => [String(row.data?.workId || ""), String(row.data?.title || row.work.title || row.work.name)]));
    const related = [...new Set(data?.relatedWorkIds || [])];
    return { names: related.map(id => names.get(id)).filter(Boolean), unknown: related.filter(id => !names.has(id)).length, loaded: Boolean(selected) };
  }
  function loadSummary() {
    if (!state.currentSettings || !state.selectedWork || writing) return;
    const initial = { provider: state.provider, work: state.selectedWork, root: state.workRoot, scope: scopeKey() };
    const signature = JSON.stringify([initial.scope, referenceWorkKey(initial.work), state.currentSettings.data.relatedWorkIds || []]);
    if (summaryContext?.provider === initial.provider && summarySignature === signature) return summaryPromise;
    summarySignature = signature; const context = contextFor(initial); summaryCatalog = null; summaryContext = context;
    context.isCurrent = () => scopeMatches(context) && summarySignature === signature && summaryContext === context;
    summaryPromise = readCatalog(context).then(result => { if (context.isCurrent()) remember(result, context); }).catch(() => { if (context.isCurrent()) { summaryCatalog = { peers: [] }; onCatalog(); } });
    return summaryPromise;
  }
  const scopeMatches = context => state.provider === context.provider && state.selectedWork === context.work && scopeKey() === context.scope;
  const current = context => owner === context && elements.relatedWorksDialog.open && scopeMatches(context) && Boolean(state.currentSettings);
  const hasPending = () => Boolean(pending.size && pendingScope && state.provider === pendingScope.provider && scopeKey() === pendingScope.scope && referenceWorkKey(state.selectedWork) === pendingScope.workKey);
  const node = (tag, text, className = "") => { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; };
  function status(message, error = false) { elements.relatedWorksStatus.textContent = message; elements.relatedWorksStatus.dataset.tone = error ? "error" : ""; elements.relatedWorksStatus.setAttribute("role", error ? "alert" : "status"); }
  function setBusy(value) { busy = value; elements.closeRelatedWorksButton.disabled = value && writing; elements.reloadRelatedWorksButton.disabled = value; elements.relatedWorksList.setAttribute("aria-busy", String(value)); }
  function render() {
    elements.relatedWorksList.replaceChildren();
    if (!catalog) return;
    elements.relatedWorksNotice.textContent = [catalog.ownProblem, catalog.unresolved ? `表示できない関連が${catalog.unresolved}件あります。既存の関連は保持します。` : "", state.cloudKind === "googleDrive" ? "Google Driveは追加許可済みの作品設定が対象です。" : ""].filter(Boolean).join("\n");
    const rowButton = (row, label, related) => {
      const button = node("button", label, "text-button"); button.type = "button"; button.disabled = busy || Boolean(row.problem);
      button.addEventListener("click", () => apply(row.key, related)); return button;
    };
    for (const id of catalog.unresolvedIds || []) {
      const article = node("article", "", "related-work-setting-row");
      article.append(node("strong", "参照できない関連"), node("small", id, "muted"), node("p", "削除済みのほか、権限不足・移動・ID重複の可能性があります。この作品からだけ解除し、相手作品は変更しません。", "muted"));
      const button = node("button", "この関連を整理", "text-button"); button.type = "button"; button.disabled = busy || Boolean(catalog.ownProblem);
      button.addEventListener("click", () => {
        if (busy) return;
        const confirm = node("button", "この作品から解除する", "text-button"); confirm.type = "button";
        const cancel = node("button", "キャンセル", "text-button"); cancel.type = "button";
        confirm.addEventListener("click", () => apply(id, false, true)); cancel.addEventListener("click", render);
        article.append(node("p", "この関連IDを解除しますか？ 参照権限を戻しても自動では再登録されません。"), confirm, cancel); button.disabled = true;
      });
      article.append(button); elements.relatedWorksList.append(article);
    }
    for (const row of catalog.peers) {
      const article = node("article", "", "related-work-setting-row");
      article.append(node("strong", String(row.data?.title || row.work.title || row.work.name || "名称未設定")));
      if (row.work.name && row.work.name !== row.data?.title) article.append(node("small", row.work.name, "muted"));
      article.append(node("p", row.problem || (pending.has(row.key) ? "前回の保存が未完了です。" : row.outgoing && row.incoming ? "関連付け済み" : row.outgoing || row.incoming ? "片側だけに関連設定があります。" : "未関連"), "muted"));
      const actions = node("div", "", "related-work-setting-actions");
      if (pending.has(row.key)) actions.append(rowButton(row, "再試行", pending.get(row.key)));
      if (!(row.outgoing && row.incoming)) actions.append(rowButton(row, row.outgoing || row.incoming ? "相互に関連付ける" : "関連付ける", true));
      if (row.outgoing || row.incoming) actions.append(rowButton(row, "解除する", false));
      article.append(actions); elements.relatedWorksList.append(article);
    }
    if (!catalog.peers.length) elements.relatedWorksList.append(node("p", "同じ作品ルートに他の作品がありません。", "muted"));
  }
  async function reload({ keepStatus = false } = {}) {
    const context = owner, token = ++epoch;
    if (!context || !current(context)) return;
    setBusy(true); render(); if (!keepStatus) status("作品の関連設定を読み込んでいます…");
    try {
      const result = await readCatalog(context, { fresh: true });
      if (!current(context) || token !== epoch) return;
      catalog = result; remember(result, context); if (!keepStatus) status("相手作品のボタンで関連設定を変更できます。");
    } catch (error) { if (current(context) && token === epoch) { catalog = null; status((keepStatus ? elements.relatedWorksStatus.textContent + "\n一覧を更新できませんでした。" : "") + error.message, true); } }
    finally { if (current(context) && token === epoch) { setBusy(false); render(); } }
  }
  async function open() {
    if (opening || busy) return;
    opening = true;
    const initial = { provider: state.provider, work: state.selectedWork, root: state.workRoot, scope: scopeKey() };
    try {
      await beforeOpen(); if (!scopeMatches(initial)) return;
      if (!pendingScope || pendingScope.provider !== initial.provider || pendingScope.scope !== initial.scope || pendingScope.workKey !== referenceWorkKey(initial.work)) { pending.clear(); onPendingChange(); }
      pendingScope = { ...initial, workKey: referenceWorkKey(initial.work) };
      const context = contextFor(initial);
      owner = context; context.isCurrent = () => current(context); context.getWorks = fresh => getWorks(context, fresh);
      catalog = summaryContext && scopeMatches(summaryContext) ? summaryCatalog : null; elements.relatedWorksList.replaceChildren(); elements.relatedWorksNotice.textContent = "";
      elements.relatedWorksDialog.showModal(); return reload();
    } finally { opening = false; }
  }
  async function apply(key, related, unresolved = false) {
    const context = owner;
    if (busy || !context || !current(context) || state.saving || state.dirty || state.externalConflict) return;
    writing = true; setBusy(true); render(); state.saving = true;
    status(unresolved ? "参照できない関連をこの作品から解除しています…" : related ? "両作品へ関連設定を保存しています…" : "両作品の関連設定を解除しています…");
    try {
      const finish = measure?.(unresolved ? "関連設定・不明な関連解除" : "関連設定・保存全体");
      const result = unresolved ? await removeUnresolved(context, key) : await saveRelation(context, key, related);
      finish?.({ complete: result.complete, writes: result.writes.length });
      if (!current(context)) return;
      if (result.own) onOwnRecord(result.own);
      if (result.complete) pending.delete(key); else if (!unresolved) pending.set(key, related);
      onPendingChange();
      status(result.complete ? (unresolved ? "参照できない関連をこの作品から解除しました。" : related ? "両作品の関連付けが完了しました。" : "両作品の関連付けを解除しました。") : `${result.writes.length ? "一部の保存が完了しましたが、関連設定は未完了です。" : "関連設定を保存できませんでした。"}\n${result.error?.message || ""}\n${unresolved ? "最新状態を確認し「この関連を整理」からやり直せます。" : "最新状態を確認し「再試行」で続けられます。"}`, !result.complete);
      writing = false; state.saving = false;
      if (result.catalog) { catalog = result.catalog; remember(catalog, context); }
      else await reload({ keepStatus: true });
    } catch (error) { if (current(context)) status(error.message, true); }
    finally { writing = false; state.saving = false; if (current(context)) { setBusy(false); render(); } }
  }
  function close() {
    if (writing) return;
    elements.relatedWorksDialog.close();
  }
  elements.closeRelatedWorksButton.addEventListener("click", close);
  elements.reloadRelatedWorksButton.addEventListener("click", () => { if (!busy) reload(); });
  elements.relatedWorksDialog.addEventListener("cancel", event => { if (writing) event.preventDefault(); });
  elements.relatedWorksDialog.addEventListener("close", () => { owner = null; catalog = null; busy = false; epoch++; onClose(); });
  return { open, reload, close, hasPending, summary, loadSummary };
}
