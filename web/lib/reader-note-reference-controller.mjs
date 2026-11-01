import { readReferenceSources, readReferenceNotes, referenceWorkKey } from "./shared-note-reader.mjs";

export function createReaderNoteReferenceController({ state, elements, Option, scopeKey, renderReaderNoteReference, showLoading, showEmpty, measure, resolveWorks, readSources = readReferenceSources, readNotes = readReferenceNotes }) {
  let owner = null, sources = [], sourceEpoch = 0, noteEpoch = 0, notice = "";
  const title = work => work?.title || work?.name || "名称未設定";
  const current = context => owner === context && !elements.readerNoteReferencePanel.hidden
    && state.provider === context.provider && state.selectedWork === context.work && scopeKey() === context.scope;
  const optionTitle = source => `${title(source.work)}${source.relation === "current" ? "（この作品）" : ""}`;
  const selected = () => sources.find(source => source.key === elements.readerNoteWorkSelect.value);
  function updateSummary(type = elements.readerNoteTypeSelect.value) {
    const source = selected();
    const note = state.readerNoteReferenceEntries.find(entry => entry.referenceKey === state.readerNoteReferenceId);
    const workLabel = source?.relation === "current" || !source ? "この作品" : title(source.work) + "（参照のみ）";
    const summary = workLabel + "・" + (type === "reference" ? "資料" : "プロット") + (note ? "／" + (note.data.title || note.item.name) : "");
    elements.readerNoteSelectionSummary.textContent = summary + (notice ? "（確認事項あり）" : "");
    elements.readerNoteSelectionSummary.title = summary + (notice ? "\n" + notice : "");
  }
  function setSourceLoading(loading) {
    elements.readerNoteOptionsLoading.hidden = !loading;
    elements.readerNoteSourceLoading.hidden = !loading;
    elements.readerNoteSourceLoadingHelp.hidden = !loading;
    elements.readerNoteWorkSelect.setAttribute("aria-busy", String(loading));
    elements.readerNoteWorkSelect.setAttribute("aria-describedby", loading ? "readerNoteSourceLoadingHelp" : "");
  }
  function updateStatus() {
    updateSummary();
    const source = selected();
    elements.readerNoteReferenceStatus.textContent = `${source ? `参照元：${title(source.work)}（読み取り専用）` : ""}${notice ? `\n${notice}` : ""}${owner?.cloudKind === "googleDrive" ? "\nGoogle Driveは追加許可済みのノートだけを表示します。" : ""}`;
  }
  async function load(type = elements.readerNoteTypeSelect.value) {
    const context = owner, source = selected();
    if (!context || !source || !current(context)) return;
    const token = ++noteEpoch; state.readerNoteReferenceLoadToken++;
    state.readerNoteReferenceEntries = [];
    updateSummary(type);
    elements.readerNoteSelect.disabled = true;
    elements.readerNoteSelect.replaceChildren(new Option("読み込み中…", ""));
    showLoading(elements.readerNoteReferenceContent, "ノートを読み込んでいます…");
    try {
      const entries = await readNotes(context, source, type);
      if (!current(context) || token !== noteEpoch) return;
      state.readerNoteReferenceEntries = entries;
      if (!entries.length) {
        elements.readerNoteSelect.replaceChildren(new Option("ノートがありません", ""));
        showEmpty(elements.readerNoteReferenceContent, context.cloudKind === "googleDrive" ? "許可されたノートが見つかりません。追加許可を確認してください。" : "ノートがありません"); return;
      }
      elements.readerNoteSelect.replaceChildren(...entries.map(entry => new Option(entry.data.title || entry.item.name, entry.referenceKey)));
      const entry = entries.find(entry => entry.referenceKey === state.readerNoteReferenceId) || entries[0];
      state.readerNoteReferenceId = entry.referenceKey;
      elements.readerNoteSelect.value = entry.referenceKey; elements.readerNoteSelect.disabled = false;
      updateSummary(type);
      renderReaderNoteReference(entry);
    } catch (error) {
      if (!current(context) || token !== noteEpoch) return;
      elements.readerNoteSelect.replaceChildren(new Option("読み込み失敗", ""));
      showEmpty(elements.readerNoteReferenceContent, `${error.message || "ノートを読み込めませんでした。"}\n参照元作品または種類を選び直すと再試行できます。`);
    }
  }
  async function open() {
    elements.readerNoteReferencePanel.hidden = false;
    elements.readerSection.classList.add("note-reference-open"); elements.readerNoteReferenceButton.setAttribute("aria-expanded", "true");
    const context = { provider: state.provider, work: state.selectedWork, works: [...state.works], cloudKind: state.cloudKind, scope: scopeKey() };
    context.isCurrent = () => current(context);
    context.measure = measure;
    if (resolveWorks) context.getWorks = () => resolveWorks(context);
    owner = context;
    sources = [{ key: referenceWorkKey(context.work), work: context.work, relation: "current" }];
    notice = "";
    setSourceLoading(true);
    elements.readerNoteWorkSelect.replaceChildren(new Option(`${title(context.work)}（この作品）`, sources[0].key));
    elements.readerNoteWorkSelect.value = sources[0].key; elements.readerNoteWorkSelect.disabled = true;
    state.readerNoteReferenceId = ""; updateStatus();
    const loading = load(); const token = ++sourceEpoch;
    try {
      const result = await readSources(context);
      if (!current(context) || token !== sourceEpoch) return;
      sources = result.sources; notice = result.notice;
      elements.readerNoteWorkSelect.replaceChildren(...sources.map(source => new Option(optionTitle(source), source.key)));
      elements.readerNoteWorkSelect.value = sources[0].key;
    } catch (error) {
      if (!current(context) || token !== sourceEpoch) return;
      notice = `関連作品を確認できませんでした。${error.message || ""} パネルを開き直すと再確認します。`;
    } finally {
      if (current(context) && token === sourceEpoch) { elements.readerNoteWorkSelect.disabled = false; setSourceLoading(false); updateStatus(); }
    }
    await loading;
  }
  function close() {
    setSourceLoading(false);
    owner = null; sourceEpoch++; noteEpoch++; state.readerNoteReferenceLoadToken++;
    sources = []; notice = ""; state.readerNoteReferenceEntries = []; state.readerNoteReferenceId = "";
    updateSummary();
    elements.readerNoteReferenceContent.replaceChildren(); elements.readerNoteReferenceStatus.textContent = "";
    elements.readerNoteReferencePanel.hidden = true;
    elements.readerSection.classList.remove("note-reference-open"); elements.readerNoteReferenceButton.setAttribute("aria-expanded", "false");
  }
  function reset() {
    close(); elements.readerNoteTypeSelect.value = "plot"; updateSummary();
    elements.readerNoteWorkSelect.replaceChildren(new Option("この作品", ""));
    elements.readerNoteSelect.disabled = true; elements.readerNoteSelect.replaceChildren(new Option("ノートを選択", ""));
    elements.readerNoteReferenceStatus.textContent = ""; elements.readerNoteReferenceContent.replaceChildren();
  }
  function chooseSource() { state.readerNoteReferenceId = ""; updateStatus(); return load(); }
  function chooseNote() {
    if (!owner || !current(owner)) return;
    state.readerNoteReferenceId = elements.readerNoteSelect.value;
    updateSummary();
    renderReaderNoteReference(state.readerNoteReferenceEntries.find(entry => entry.referenceKey === state.readerNoteReferenceId));
  }
  return { open, close, reset, load, chooseSource, chooseNote };
}
