const { createNoteSearchReplace } = require("../../../web/lib/note-search-replace");
const { createNoteReplaceSession } = require("./search-replace-session");

function getNoteReplaceHtml() {
  return `<dialog id="noteReplacePanel" class="noteReplacePanel" aria-labelledby="noteReplaceTitle">
    <header class="noteReplaceHeader">
      <h2 id="noteReplaceTitle">ノートの置換</h2>
      <button type="button" class="secondary" id="closeNoteReplaceBtn">閉じる <span class="kbdHint">Esc</span></button>
    </header>
    <div class="noteReplaceBody">
    <div class="noteReplaceFields">
    <label>検索する文字<input id="noteReplaceQuery" type="text" autocomplete="off" /></label>
    <label>置換後の文字<textarea id="noteReplaceText" rows="2" placeholder="空欄にすると削除"></textarea></label>
    </div>
    <div class="noteReplaceOptions">
      <label title="大分類名・区分名・補足・項目名"><input id="noteReplaceNames" type="checkbox" checked />名称</label>
      <label><input id="noteReplaceDetails" type="checkbox" checked />項目詳細</label>
      <label><input id="noteReplaceMemos" type="checkbox" />項目メモ</label>
      <label><input id="noteReplaceCase" type="checkbox" />大文字・小文字を区別する</label>
    </div>
    <p class="muted">このノートの編集内容が対象です。ルビ・傍点内、ふりがな・タグは置換しません。</p>
    <p id="noteReplaceSyncHint" class="muted" hidden>保存時は項目メモの自動反映設定にも従います。</p>
    <div id="noteReplaceStatus" role="status" aria-live="polite"></div>
    <div id="noteReplaceResults"></div>
    </div>
    <footer class="noteReplaceFooter">
    <div class="noteReplaceActions">
      <button type="button" class="secondary" id="noteReplaceSelectAll">全候補を選択</button>
      <button type="button" class="secondary" id="noteReplaceClear">選択解除</button>
      <button type="button" id="noteReplaceApply" disabled>選択した0箇所を置換</button>
      <button type="button" class="secondary" id="noteReplaceUndo" disabled>直前の置換を戻す</button>
    </div>
    <div class="noteReplaceActions">
      <button type="button" class="secondary" id="noteReplacePrev">前へ</button>
      <span id="noteReplacePage"></span>
      <button type="button" class="secondary" id="noteReplaceNext">次へ</button>
    </div>
    </footer>
  </dialog>`;
}

function getNoteReplaceScript() {
  return `
    const noteReplaceCore = (${createNoteSearchReplace.toString()})();
    const noteReplaceSession = (${createNoteReplaceSession.toString()})({
      core: noteReplaceCore, getNote: () => state, getRevision: () => changeRevision,
      onChange: () => {
        markDirty(); renderGroups(); renderPreview(); renderNoteToc();
        if (isBoardOpen) renderBoard();
      },
    });
    let noteReplacePlan = null, noteReplaceTimer = null, noteReplacePage = 0, noteReplaceComposing = false;
    let noteReplaceSelection = new Set();
    const noteReplacePageSize = 20;
    const noteReplaceEl = id => document.getElementById(id);
    function openNoteReplaceModal() {
      const panel = noteReplaceEl("noteReplacePanel");
      noteReplaceEl("noteReplaceQuery").value = noteSearchInput.value;
      if (!panel.open) panel.showModal();
      if (!noteReplacePlan || noteReplacePlan.revision !== changeRevision || noteReplacePlan.query !== noteSearchInput.value) rebuildNoteReplacePlan();
      else updateNoteReplaceButtons();
      const focus = noteSearchInput.value ? noteReplaceEl("noteReplaceText") : noteReplaceEl("noteReplaceQuery");
      focus.focus();
    }
    function closeNoteReplaceModal() {
      const panel = noteReplaceEl("noteReplacePanel");
      if (panel.open) panel.close();
    }
    function noteReplaceRows() {
      return noteReplacePlan ? [...noteReplacePlan.candidates, ...noteReplacePlan.excluded]
        .sort((a,b) => a.fieldIndex - b.fieldIndex || a.start - b.start) : [];
    }
    function updateNoteReplaceButtons() {
      const ready = Boolean(noteReplacePlan?.valid) && !noteReplaceComposing;
      const apply = noteReplaceEl("noteReplaceApply");
      apply.disabled = !ready || !noteReplaceSelection.size;
      apply.textContent = "選択した" + noteReplaceSelection.size + "箇所を置換";
      noteReplaceEl("noteReplaceSelectAll").disabled = !ready || !noteReplacePlan.candidates.length;
      noteReplaceEl("noteReplaceClear").disabled = !noteReplaceSelection.size;
      noteReplaceEl("noteReplaceUndo").disabled = !noteReplaceSession.canUndo || noteReplaceComposing;
      const panel = noteReplaceEl("noteReplacePanel"), active = document.activeElement;
      if (panel.open && (!panel.contains(active) || active?.disabled)) noteReplaceEl("noteReplaceQuery").focus({preventScroll:true});
    }
    function noteReplaceVisibleText(value) {
      return value ? (value.trim() ? value.replace(/\\r\\n|\\r|\\n/g,"↵\\n").replace(/\\t/g,"⇥") : "（空白 " + value.length + "文字）") : "（空文字）";
    }
    function renderNoteReplaceCandidates() {
      const rows = noteReplaceRows(), pages = Math.max(1, Math.ceil(rows.length / noteReplacePageSize));
      noteReplacePage = Math.min(noteReplacePage, pages - 1);
      noteReplaceEl("noteReplaceResults").innerHTML = rows.slice(noteReplacePage * noteReplacePageSize, (noteReplacePage + 1) * noteReplacePageSize).map(row => {
        const field = noteReplacePlan.fields[row.fieldIndex];
        const place = [field.groupTitle,field.itemTitle,field.label,row.line + "行目"].filter(Boolean).join(" › ");
        return '<article class="noteReplaceResult">'
          + (row.reason ? '' : '<label><input type="checkbox" data-replace-select="' + esc(row.id) + '"' + (noteReplaceSelection.has(row.id) ? ' checked' : '') + ' />選択</label>')
          + '<button type="button" class="secondary noteReplaceLocation" data-replace-jump="' + esc(row.id) + '">' + esc(place) + '</button>'
          + '<div class="noteReplaceBefore">変更前：' + esc(noteReplaceVisibleText(row.previewBefore)) + '</div>'
          + (row.reason ? '<div class="muted">' + (row.reason === 'malformed_notation' ? '不完全なルビ等の記法があるため対象外' : 'ルビ・傍点の保護範囲のため対象外') + '</div>'
            : '<div class="noteReplaceAfter">変更後：' + esc(noteReplaceVisibleText(row.previewAfter)) + '</div><button type="button" class="secondary" data-replace-one="' + esc(row.id) + '">この箇所を置換</button>')
          + '</article>';
      }).join("");
      noteReplaceEl("noteReplacePage").textContent = rows.length ? (noteReplacePage + 1) + " / " + pages : "";
      noteReplaceEl("noteReplacePrev").disabled = !rows.length || noteReplacePage === 0;
      noteReplaceEl("noteReplaceNext").disabled = !rows.length || noteReplacePage + 1 >= pages;
      updateNoteReplaceButtons();
    }
    function rebuildNoteReplacePlan() {
      clearTimeout(noteReplaceTimer);
      if (noteReplaceComposing || !noteReplaceEl("noteReplacePanel").open) return;
      noteReplacePlan = noteReplaceCore.buildReplacePlan(state, {
        query: noteSearchInput.value, replacement: noteReplaceEl("noteReplaceText").value,
        revision: changeRevision, caseSensitive: noteReplaceEl("noteReplaceCase").checked,
        fields: { names: noteReplaceEl("noteReplaceNames").checked, details: noteReplaceEl("noteReplaceDetails").checked, memos: noteReplaceEl("noteReplaceMemos").checked },
      });
      noteReplaceSelection.clear(); noteReplacePage = 0;
      noteReplaceEl("noteReplaceSyncHint").hidden = !noteReplaceEl("noteReplaceMemos").checked;
      noteReplaceEl("noteReplaceStatus").textContent = !noteReplacePlan.valid ? "検索する文字を入力してください。"
        : "置換候補 " + noteReplacePlan.candidates.length + "箇所 ／ 保護対象 " + noteReplacePlan.excluded.length + "箇所"
          + (noteReplacePlan.issues.length ? " ／ 識別情報を確認できない対象 " + noteReplacePlan.issues.length + "件" : "");
      renderNoteReplaceCandidates();
    }
    function invalidateNoteReplacePlan() {
      clearTimeout(noteReplaceTimer); noteReplacePlan = null; noteReplaceSelection.clear();
      if (!noteReplaceEl("noteReplacePanel")) return;
      noteReplaceEl("noteReplaceResults").innerHTML = "";
      updateNoteReplaceButtons();
      if (noteReplaceEl("noteReplacePanel").open) {
        noteReplaceEl("noteReplaceStatus").textContent = "候補を計算しています…";
        noteReplaceTimer = setTimeout(rebuildNoteReplacePlan, 120);
      }
    }
    function resetNoteReplaceSession() { noteReplaceSession.clearUndo(); invalidateNoteReplacePlan(); }
    function syncNoteReplaceQuery() {
      if (noteReplacePlan && noteReplacePlan.query !== noteSearchInput.value) invalidateNoteReplacePlan();
    }
    function performNoteReplace(ids, undo = false) {
      if (noteReplaceComposing) return;
      if (!undo && noteReplacePlan && noteReplacePlan.query !== noteSearchInput.value) {
        rebuildNoteReplacePlan();
        noteReplaceEl("noteReplaceStatus").textContent = "検索条件が変わったため候補を更新しました。";
        return;
      }
      const result = undo ? noteReplaceSession.undo() : noteReplaceSession.apply(noteReplacePlan, ids);
      if (result.ok) {
        rebuildNoteReplacePlan();
        noteReplaceEl("noteReplaceStatus").textContent = result.count + (undo ? "箇所の置換を戻しました。" : "箇所を置換しました。");
      } else {
        const messages = { notation_change: "ルビ等の記法が変わるため置換できません。通常の編集で確認してください。", undo_conflict: "対象に別の編集があるため戻せません。", nothing_to_undo: "戻せる置換がありません。" };
        if (result.reason === "stale_plan" || result.reason === "invalid_selection") rebuildNoteReplacePlan();
        noteReplaceEl("noteReplaceStatus").textContent = messages[result.reason] || "内容が変わったため候補を更新しました。選び直してください。";
      }
      updateNoteReplaceButtons();
    }
    function jumpToNoteReplaceCandidate(id) {
      const row = noteReplaceRows().find(row => row.id === id);
      if (!row || !noteReplacePlan || noteReplacePlan.revision !== changeRevision) return;
      const field = noteReplacePlan.fields[row.fieldIndex];
      const fields = { title:"groupTitle", label:"dividerLabel", value:"dividerValue", heading:"itemHeading", body:"itemBody", "memo.body":"itemMemoBody" };
      closeNoteReplaceModal();
      if (isBoardOpen) closeBoard();
      collapsedGroupIds.delete(field.groupId);
      if (field.field === "memo.body") setNoteItemMemoOpen(field.itemId,true);
      renderGroups();
      revealEditorPaneBeforeJump(() => {
        const input = [...groupsRoot.querySelectorAll("[data-field]")].find(input => input.dataset.field === fields[field.field] && input.dataset.groupId === field.groupId && (!field.itemId || input.dataset.itemId === field.itemId));
        if (!input) return;
        input.focus({preventScroll:true}); input.setSelectionRange(row.start,row.end);
        scrollEditorElementIntoView(input,"center");
      });
    }
    function registerNoteReplaceEvents() {
      const panel = noteReplaceEl("noteReplacePanel");
      noteReplaceEl("openNoteReplaceBtn").addEventListener("click", openNoteReplaceModal);
      noteReplaceEl("closeNoteReplaceBtn").addEventListener("click", closeNoteReplaceModal);
      panel.addEventListener("cancel", event => { event.preventDefault(); if (!noteReplaceComposing) closeNoteReplaceModal(); });
      panel.addEventListener("keydown", event => {
        if (event.isComposing || noteReplaceComposing) {
          if (event.key === "Escape") event.stopPropagation();
          return;
        }
        if (event.key === "Tab") {
          const controls = [...panel.querySelectorAll("button,input,textarea,select,[tabindex]")]
            .filter(control => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length);
          const edge = event.shiftKey ? controls[0] : controls[controls.length - 1];
          if (document.activeElement === edge) {
            event.preventDefault(); (event.shiftKey ? controls[controls.length - 1] : controls[0])?.focus();
          }
        } else if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); closeNoteReplaceModal();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
          event.preventDefault(); event.stopPropagation();
          noteReplaceEl("noteReplaceQuery").focus(); noteReplaceEl("noteReplaceQuery").select();
        }
      });
      noteReplaceEl("noteReplaceQuery").addEventListener("input", event => {
        noteSearchInput.value = event.target.value;
        noteSearchInput.dispatchEvent(new Event("input", { bubbles:true }));
      });
      document.addEventListener("compositionstart", () => { noteReplaceComposing = true; invalidateNoteReplacePlan(); });
      document.addEventListener("compositionend", () => { noteReplaceComposing = false; invalidateNoteReplacePlan(); });
      noteSearchInput.addEventListener("input", invalidateNoteReplacePlan);
      noteReplaceEl("noteReplaceText").addEventListener("input", invalidateNoteReplacePlan);
      ["noteReplaceNames","noteReplaceDetails","noteReplaceMemos","noteReplaceCase"].forEach(id => noteReplaceEl(id).addEventListener("change",invalidateNoteReplacePlan));
      noteReplaceEl("clearSearchBtn").addEventListener("click",invalidateNoteReplacePlan);
      panel.addEventListener("change", event => {
        const id = event.target.dataset.replaceSelect;
        if (!id || !noteReplacePlan) return;
        if (event.target.checked) noteReplaceSelection.add(id); else noteReplaceSelection.delete(id);
        updateNoteReplaceButtons();
      });
      panel.addEventListener("click", event => {
        const button = event.target.closest("button"); if (!button) return;
        if (button.dataset.replaceOne) performNoteReplace([button.dataset.replaceOne]);
        if (button.dataset.replaceJump) jumpToNoteReplaceCandidate(button.dataset.replaceJump);
      });
      noteReplaceEl("noteReplaceSelectAll").addEventListener("click", () => { if (!noteReplacePlan) return; noteReplaceSelection = new Set(noteReplacePlan.candidates.map(row => row.id)); renderNoteReplaceCandidates(); });
      noteReplaceEl("noteReplaceClear").addEventListener("click", () => { noteReplaceSelection.clear(); renderNoteReplaceCandidates(); });
      noteReplaceEl("noteReplaceApply").addEventListener("click", () => performNoteReplace([...noteReplaceSelection]));
      noteReplaceEl("noteReplaceUndo").addEventListener("click", () => performNoteReplace([],true));
      noteReplaceEl("noteReplacePrev").addEventListener("click", () => { noteReplacePage--; renderNoteReplaceCandidates(); });
      noteReplaceEl("noteReplaceNext").addEventListener("click", () => { noteReplacePage++; renderNoteReplaceCandidates(); });
      updateNoteReplaceButtons();
    }
  `;
}

module.exports = { getNoteReplaceHtml, getNoteReplaceScript };
