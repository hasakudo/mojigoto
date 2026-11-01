import { readReferenceSources, readReferenceNotes, referenceWorkKey } from "./shared-note-reader.mjs";

// Own-note preview keeps the live draft; foreign notes use the read-only reader.
export function createNotePreviewWorkController({ state, elements, Option, scopeKey, isNotePreviewOwnerCurrent,
  openNotePreview, renderNotePreviewReference, showLoading, showEmpty, measure, resolveWorks, readSources = readReferenceSources, readNotes = readReferenceNotes }) {
  let owner = null, sources = [], sourceEpoch = 0, notice = "";
  const title = work => work?.title || work?.name || "名称未設定";
  const selected = () => sources.find(source => source.key === elements.notePreviewWorkSelect.value);
  const isForeign = () => Boolean(owner && selected() && selected().work !== owner.work);
  const current = context => owner === context && elements.notePreviewDialog.open
    && isNotePreviewOwnerCurrent(context.previewOwner) && state.provider === context.provider
    && state.selectedWork === context.work && scopeKey() === context.scope;
  function updateSummary() {
    const source = selected();
    const type = elements.notePreviewTypeSelect.value;
    const label = type === "current" ? "編集中" : type === "reference" ? "資料" : "プロット";
    const summary = (isForeign() ? title(source.work) + "（参照のみ）" : "この作品") + "・" + label;
    elements.notePreviewSelectionSummary.textContent = summary + (notice ? "（確認事項あり）" : "");
    elements.notePreviewSelectionSummary.title = summary + (notice ? "\n" + notice : "");
  }
  function setSourceLoading(loading) {
    elements.notePreviewOptionsLoading.hidden = !loading;
    elements.notePreviewSourceLoading.hidden = !loading;
    elements.notePreviewSourceLoadingHelp.hidden = !loading;
    elements.notePreviewWorkSelect.setAttribute("aria-busy", String(loading));
    elements.notePreviewWorkSelect.setAttribute("aria-describedby", loading ? "notePreviewSourceLoadingHelp" : "");
  }
  function updateStatus() {
    updateSummary();
    const source = selected();
    elements.notePreviewReferenceStatus.textContent = `${source ? `参照元：${title(source.work)}${isForeign() ? "（読み取り専用）" : ""}` : ""}${notice ? `\n${notice}` : ""}${owner?.cloudKind === "googleDrive" ? "\nGoogle Driveは追加許可済みのノートだけを表示します。" : ""}`;
    for (const option of elements.notePreviewTypeSelect.options) {
      if (option.value === "current") option.disabled = isForeign();
    }
  }
  function prepare(previewOwner) {
    if (owner?.previewOwner === previewOwner && owner.scope === scopeKey()) { updateSummary(); return; }
    state.notePreviewLoadToken++; state.notePreviewEntries = []; state.notePreviewReferenceId = "";
    if (owner && owner.scope !== scopeKey()) elements.notePreviewTypeSelect.value = "current";
    const context = { previewOwner, provider: state.provider, work: state.selectedWork,
      works: [...state.works], cloudKind: state.cloudKind, scope: scopeKey() };
    owner = context; context.isCurrent = () => current(context);
    context.measure = measure;
    if (resolveWorks) context.getWorks = () => resolveWorks(context);
    sources = [{ key: referenceWorkKey(context.work), work: context.work, relation: "current" }];
    notice = "";
    setSourceLoading(true);
    elements.notePreviewWorkSelect.replaceChildren(new Option(`${title(context.work)}（この作品）`, sources[0].key));
    elements.notePreviewWorkSelect.value = sources[0].key; elements.notePreviewWorkSelect.disabled = true;
    updateStatus();
    const token = ++sourceEpoch;
    // openNotePreview shows the non-modal dialog before source validation begins.
    Promise.resolve().then(async () => {
      if (!current(context)) return;
      try {
        const result = await readSources(context);
        if (!current(context) || token !== sourceEpoch) return;
        sources = result.sources; notice = result.notice;
        elements.notePreviewWorkSelect.replaceChildren(...sources.map(source => new Option(
          `${title(source.work)}${source.relation === "current" ? "（この作品）" : ""}`, source.key)));
        elements.notePreviewWorkSelect.value = sources[0].key;
      } catch (error) {
        if (!current(context) || token !== sourceEpoch) return;
        notice = `関連作品を確認できませんでした。${error.message || ""} プレビューを開き直すと再確認します。`;
      } finally {
        if (current(context) && token === sourceEpoch) { elements.notePreviewWorkSelect.disabled = false; setSourceLoading(false); updateStatus(); }
      }
    });
  }
  async function load() {
    const context = owner, source = selected(), type = elements.notePreviewTypeSelect.value;
    if (!context || !isForeign() || !current(context) || !["plot", "reference"].includes(type)) return;
    const token = ++state.notePreviewLoadToken;
    const active = () => current(context) && token === state.notePreviewLoadToken
      && selected() === source && elements.notePreviewTypeSelect.value === type;
    state.notePreviewEntries = [];
    elements.notePreviewSelect.disabled = true;
    elements.notePreviewSelect.replaceChildren(new Option("読み込み中…", ""));
    elements.notePreviewTitle.textContent = "ノート参照";
    elements.notePreviewHelp.textContent = "参照のみ。大分類を選ぶと開閉します。";
    elements.notePreviewContent.classList.toggle("note-preview-reference-content", true);
    showLoading(elements.notePreviewContent, "ノートを読み込んでいます…");
    try {
      const entries = await readNotes(context, source, type);
      if (!active()) return;
      state.notePreviewEntries = entries;
      if (!entries.length) {
        state.notePreviewReferenceId = "";
        elements.notePreviewSelect.replaceChildren(new Option("ノートがありません", ""));
        showEmpty(elements.notePreviewContent, context.cloudKind === "googleDrive" ? "許可されたノートが見つかりません。追加許可を確認してください。" : "ノートがありません。"); return;
      }
      elements.notePreviewSelect.replaceChildren(...entries.map(entry => new Option(entry.data.title || entry.item.name, entry.referenceKey)));
      const entry = entries.find(entry => entry.referenceKey === state.notePreviewReferenceId) || entries[0];
      state.notePreviewReferenceId = entry.referenceKey; elements.notePreviewSelect.value = entry.referenceKey;
      elements.notePreviewSelect.disabled = false; renderNotePreviewReference();
    } catch (error) {
      if (!active()) return;
      state.notePreviewEntries = []; state.notePreviewReferenceId = "";
      elements.notePreviewSelect.replaceChildren(new Option("読み込めませんでした", ""));
      showEmpty(elements.notePreviewContent, `${error.message || "ノートを読み込めませんでした。"}\n参照元作品または種類を選び直すと再試行できます。`);
    }
  }
  function chooseSource() {
    if (!owner || !current(owner) || !selected()) return;
    state.notePreviewLoadToken++; state.notePreviewEntries = []; state.notePreviewReferenceId = "";
    if (!isForeign()) elements.notePreviewTypeSelect.value = "current";
    else if (elements.notePreviewTypeSelect.value === "current") elements.notePreviewTypeSelect.value = owner.previewOwner.noteType;
    updateStatus(); openNotePreview();
  }
  function close() {
    setSourceLoading(false);
    if (isForeign()) elements.notePreviewTypeSelect.value = "current";
    owner = null; sources = []; notice = ""; sourceEpoch++; state.notePreviewLoadToken++;
    state.notePreviewEntries = []; state.notePreviewReferenceId = "";
    elements.notePreviewContent.replaceChildren(); elements.notePreviewReferenceStatus.textContent = "";
    updateStatus();
  }
  return { prepare, isForeign, load, chooseSource, close };
}
