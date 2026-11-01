function getReferenceLinksScript() {
  return `
    let referenceSearchState = {
      open: false,
      loading: false,
      query: "",
      requestId: 0,
      results: [],
      sourceGroupId: "",
      sourceItemId: "",
      targetNoteType: "reference",
    };
    let referenceSearchTimer = null;
    let referenceLabelRequestId = 0;
    let pendingReferenceLabel = null;

    function getReferenceSource() {
      const group = (Array.isArray(state?.groups) ? state.groups : []).find(
        (entry) => String(entry?.id || "") === referenceSearchState.sourceGroupId,
      );
      const item = (Array.isArray(group?.items) ? group.items : []).find(
        (entry) => String(entry?.id || "") === referenceSearchState.sourceItemId,
      );
      return item ? { group, item } : null;
    }

    function getReferenceSourceLabel() {
      const source = getReferenceSource();
      if (!source) return "関連付け先が見つかりません";
      const isDivider = source.item.kind === "divider";
      const label = String(
        isDivider
          ? (String(source.item.value || "").trim() || source.item.label)
          : source.item.heading,
      ).trim();
      return (isDivider ? "区分" : "項目") + "「" + (label || "無題") + "」";
    }

    function getRelatedReferences(item) {
      return Array.isArray(item?.relatedReferences) ? item.relatedReferences : [];
    }

    function getRelatedNoteTypeLabel(noteType) {
      return noteType === "plot" ? "プロット" : "資料";
    }

    function referenceLinkKey(link) {
      return (link?.importTarget?.workId ? link.importTarget.workId + ":" : "") + [link?.noteType === "plot" ? "plot" : "reference", link?.noteId || "", link?.groupId || "", link?.itemId || ""].join(":");
    }

    function isReferenceLinked(result) {
      const source = getReferenceSource();
      if (!source) return false;
      const key = referenceLinkKey(result);
      return getRelatedReferences(source.item).some((link) => referenceLinkKey(link) === key);
    }

    function renderRelatedReferenceSummary(item, groupId) {
      const links = getRelatedReferences(item);
      if (!links.length) return "";

      const chips = links.map((link) => {
        const key = esc(referenceLinkKey(link));
        const typeLabel = getRelatedNoteTypeLabel(link.noteType);
        const label = esc(typeLabel + ": " + (link.noteTitle || typeLabel)) + " › "
          + esc(link.itemLabel || (link.itemKind === "divider" ? "区分" : "項目"));
        return '<span class="relatedReferenceChip">'
          + '<button class="relatedReferenceOpen" type="button" data-reference-action="open-linked"'
          + ' data-group-id="' + esc(groupId) + '" data-item-id="' + esc(item.id) + '"'
          + ' data-reference-key="' + key + '" title="関連ノートを右側で開く">' + label + '</button>'
          + (link.itemKind === "divider" ? '<button class="relatedReferenceRename" type="button" data-reference-action="choose-label"'
            + ' data-group-id="' + esc(groupId) + '" data-item-id="' + esc(item.id) + '" data-reference-key="' + key
            + '" title="リンク名を区分名・補足から選ぶ" aria-label="リンク名を区分名・補足から選ぶ">✎</button>' : '')
          + '<button class="relatedReferenceRemove" type="button" data-reference-action="remove-link"'
          + ' data-group-id="' + esc(groupId) + '" data-item-id="' + esc(item.id) + '"'
          + ' data-reference-key="' + key + '" title="関連付けを解除" aria-label="関連付けを解除">×</button>'
          + '</span>';
      }).join("");
      const open = links.length <= 2 ? " open" : "";
      return '<details class="relatedReferenceSummary"' + open + '>'
        + '<summary class="relatedReferenceSummaryTitle">関連ノート（' + links.length + '）</summary>'
        + '<div class="relatedReferenceChips">' + chips + '</div></details>';
    }

    function renderReferenceSearchPanel() {
      const panel = document.getElementById("referenceSearchPanel");
      const sourceLabel = document.getElementById("referenceSearchSource");
      const status = document.getElementById("referenceSearchStatus");
      const resultsRoot = document.getElementById("referenceSearchResults");
      if (!panel || !resultsRoot) return;

      panel.hidden = !referenceSearchState.open;
      document.body.classList.toggle("referenceSearchActive", referenceSearchState.open);
      if (sourceLabel) sourceLabel.textContent = "関連付け先: " + getReferenceSourceLabel();

      const sourceNoteType = String(state?.type || state?.noteType || "") === "plot"
        ? "plot"
        : "reference";
      document.querySelectorAll("[data-reference-search-type]").forEach((button) => {
        const type = button.dataset.referenceSearchType === "plot" ? "plot" : "reference";
        button.hidden = sourceNoteType === "reference" && type === "plot";
        button.classList.toggle("isActive", type === referenceSearchState.targetNoteType);
        button.setAttribute("aria-pressed", type === referenceSearchState.targetNoteType ? "true" : "false");
      });

      if (!referenceSearchState.query.trim()) {
        if (status) status.textContent = "語句や名前を入力して、" + getRelatedNoteTypeLabel(referenceSearchState.targetNoteType) + "を検索します。";
        resultsRoot.innerHTML = "";
        return;
      }

      if (referenceSearchState.loading) {
        if (status) status.textContent = "検索中…";
        resultsRoot.innerHTML = "";
        return;
      }

      if (status) {
        status.textContent = referenceSearchState.results.length
          ? referenceSearchState.results.length + "件見つかりました。"
          : "該当するノートはありません。";
      }

      resultsRoot.innerHTML = referenceSearchState.results.map((result) => {
        const linked = isReferenceLinked(result);
        const kindLabel = result.itemKind === "divider" ? "区分" : "項目";
        const resultIndex = referenceSearchState.results.indexOf(result);
        const groupLabel = result.groupTitle ? '<span>› ' + esc(result.groupTitle) + '</span>' : "";
        const preview = result.preview
          ? '<div class="referenceSearchPreview">' + esc(result.preview) + '</div>'
          : "";
        const linkedReference = getRelatedReferences(getReferenceSource()?.item).find((link) => referenceLinkKey(link) === referenceLinkKey(result));
        const selectedLabel = linkedReference?.itemLabel || result.itemLabel;
        const labelChoice = result.itemKind === "divider" && result.dividerLabel && result.dividerValue && result.dividerLabel !== result.dividerValue
          ? '<label class="referenceLinkLabelChoice">リンク名 <select data-reference-label-index="' + resultIndex + '" aria-label="関連リンクの表示名">'
            + (selectedLabel && selectedLabel !== result.dividerLabel && selectedLabel !== result.dividerValue ? '<option value="current" selected>現在の名前：' + esc(selectedLabel) + '</option>' : '')
            + '<option value="label"' + (selectedLabel === result.dividerLabel ? ' selected' : '') + '>区分名：' + esc(result.dividerLabel) + '</option>'
            + '<option value="value"' + (selectedLabel !== result.dividerLabel ? ' selected' : '') + '>補足：' + esc(result.dividerValue) + '</option></select></label>'
          : "";
        return '<article class="referenceSearchResult">'
          + '<div class="referenceSearchResultMeta"><span class="referenceSearchKind">' + kindLabel + '</span>'
          + '<span>' + esc(getRelatedNoteTypeLabel(result.noteType) + ": " + (result.noteTitle || "無題")) + '</span>' + groupLabel + '</div>'
          + '<div class="referenceSearchResultTitle">' + esc(selectedLabel || "無題") + '</div>'
          + preview
          + labelChoice
          + '<div class="referenceSearchResultActions">'
          + '<button class="secondary" type="button" data-reference-action="open-result" data-result-index="' + resultIndex + '">右側で開く</button>'
          + '<button class="' + (linked ? "secondary" : "primary") + '" type="button" data-reference-action="toggle-result-link" data-result-index="' + resultIndex + '">'
          + (linked ? "関連付けを解除" : "関連付ける") + '</button></div></article>';
      }).join("");
    }

    function setReferenceSearchOpen(open, groupId = "", itemId = "") {
      referenceSearchState.open = Boolean(open);
      if (groupId) referenceSearchState.sourceGroupId = String(groupId);
      if (itemId) referenceSearchState.sourceItemId = String(itemId);
      if (referenceSearchState.open) {
        const sourceNoteType = String(state?.type || state?.noteType || "") === "plot"
          ? "plot"
          : "reference";
        if (sourceNoteType === "reference") referenceSearchState.targetNoteType = "reference";
      }
      renderReferenceSearchPanel();

      if (referenceSearchState.open) {
        requestAnimationFrame(() => document.getElementById("referenceSearchInput")?.focus());
      }
    }

    function requestReferenceSearch() {
      const query = String(referenceSearchState.query || "").trim();
      referenceSearchState.requestId += 1;
      const requestId = referenceSearchState.requestId;
      if (!query) {
        referenceSearchState.loading = false;
        referenceSearchState.results = [];
        renderReferenceSearchPanel();
        return;
      }

      referenceSearchState.loading = true;
      renderReferenceSearchPanel();
      vscode.postMessage({
        type: "searchRelatedNotes",
        query,
        requestId,
        noteType: referenceSearchState.targetNoteType,
      });
    }

    function scheduleReferenceSearch() {
      if (referenceSearchTimer) clearTimeout(referenceSearchTimer);
      referenceSearchTimer = setTimeout(() => {
        referenceSearchTimer = null;
        requestReferenceSearch();
      }, 180);
    }

    function findSourceItem(groupId, itemId) {
      const group = (Array.isArray(state?.groups) ? state.groups : []).find(
        (entry) => String(entry?.id || "") === String(groupId || ""),
      );
      const item = (Array.isArray(group?.items) ? group.items : []).find(
        (entry) => String(entry?.id || "") === String(itemId || ""),
      );
      return item || null;
    }

    function addOrRemoveReferenceLink(result) {
      const source = getReferenceSource();
      if (!source || !result) return;
      const current = getRelatedReferences(source.item);
      const key = referenceLinkKey(result);
      const exists = current.some((link) => referenceLinkKey(link) === key);
      source.item.relatedReferences = exists
        ? current.filter((link) => referenceLinkKey(link) !== key)
        : [...current, {
            noteType: result.noteType === "plot" ? "plot" : "reference",
            noteId: String(result.noteId || ""),
            noteFileName: String(result.noteFileName || ""),
            noteTitle: String(result.noteTitle || ""),
            groupId: String(result.groupId || ""),
            groupTitle: String(result.groupTitle || ""),
            itemId: String(result.itemId || ""),
            itemKind: result.itemKind === "divider" ? "divider" : "entry",
            itemLabel: String(result.itemLabel || ""),
          }];
      markDirty();
      renderGroups();
      renderPreview();
      renderReferenceSearchPanel();
      setStatus(exists ? "ノートの関連付けを解除しました。" : "ノートを関連付けました。", true);
    }

    function openReferenceTarget(target) {
      if (!target) return;
      vscode.postMessage({ type: "openRelatedNoteTarget", target });
    }

    function registerReferenceLinkEvents() {
      document.addEventListener("change", (event) => {
        const select = event.target.closest("[data-reference-label-index]");
        if (!select) return;
        const result = referenceSearchState.results[Number(select.dataset.referenceLabelIndex)];
        if (!result || result.itemKind !== "divider" || !["label", "value"].includes(select.value)) return;
        result.itemLabel = String(select.value === "label" ? result.dividerLabel : result.dividerValue);
        const link = getRelatedReferences(getReferenceSource()?.item).find((entry) => referenceLinkKey(entry) === referenceLinkKey(result));
        if (link && link.itemLabel !== result.itemLabel) {
          link.itemLabel = result.itemLabel;
          markDirty();
          renderGroups();
          renderPreview();
        }
        renderReferenceSearchPanel();
      });
      document.getElementById("closeReferenceSearchBtn")?.addEventListener("click", () => {
        setReferenceSearchOpen(false);
      });

      document.getElementById("referenceSearchInput")?.addEventListener("input", (event) => {
        referenceSearchState.query = event.target.value || "";
        scheduleReferenceSearch();
      });

      document.querySelectorAll("[data-reference-search-type]").forEach((button) => {
        button.addEventListener("click", () => {
          const nextType = button.dataset.referenceSearchType === "plot" ? "plot" : "reference";
          if (nextType === referenceSearchState.targetNoteType) return;
          referenceSearchState.targetNoteType = nextType;
          referenceSearchState.results = [];
          requestReferenceSearch();
        });
      });

      document.getElementById("clearReferenceSearchBtn")?.addEventListener("click", () => {
        const input = document.getElementById("referenceSearchInput");
        if (input) input.value = "";
        referenceSearchState.query = "";
        requestReferenceSearch();
        input?.focus();
      });

      document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-reference-action]");
        if (!button) return;
        const action = button.dataset.referenceAction || "";

        if (action === "search-for-item") {
          setReferenceSearchOpen(true, button.dataset.groupId, button.dataset.itemId);
          return;
        }

        if (action === "open-result" || action === "toggle-result-link") {
          const result = referenceSearchState.results[Number(button.dataset.resultIndex)];
          if (action === "open-result") openReferenceTarget(result);
          else addOrRemoveReferenceLink(result);
          return;
        }

        const sourceItem = findSourceItem(button.dataset.groupId, button.dataset.itemId);
        const link = getRelatedReferences(sourceItem).find(
          (entry) => referenceLinkKey(entry) === String(button.dataset.referenceKey || ""),
        );
        if (!link) return;
        if (action === "choose-label") {
          pendingReferenceLabel = {
            requestId: ++referenceLabelRequestId, groupId: button.dataset.groupId,
            itemId: button.dataset.itemId, key: referenceLinkKey(link), itemLabel: link.itemLabel,
          };
          vscode.postMessage({ type: "chooseRelatedNoteLabel", requestId: referenceLabelRequestId, target: link });
        } else if (action === "open-linked") {
          openReferenceTarget(link);
        } else if (action === "remove-link") {
          sourceItem.relatedReferences = getRelatedReferences(sourceItem).filter(
            (entry) => referenceLinkKey(entry) !== referenceLinkKey(link),
          );
          markDirty();
          renderGroups();
          renderPreview();
          renderReferenceSearchPanel();
          setStatus("ノートの関連付けを解除しました。", true);
        }
      });
    }

    function handleReferenceSearchMessage(msg) {
      if (msg.type === "relatedNoteLabelChosen") {
        const pending = pendingReferenceLabel;
        if (!pending || msg.requestId !== pending.requestId) return true;
        pendingReferenceLabel = null;
        const item = findSourceItem(pending.groupId, pending.itemId);
        const link = getRelatedReferences(item).find((entry) => referenceLinkKey(entry) === pending.key);
        if (!link || link.itemLabel !== pending.itemLabel || !msg.itemLabel || link.itemLabel === msg.itemLabel) return true;
        link.itemLabel = String(msg.itemLabel);
        markDirty();
        renderGroups();
        renderPreview();
        renderReferenceSearchPanel();
        return true;
      }
      if (msg.type !== "referenceSearchResults") return false;
      if (Number(msg.requestId) !== referenceSearchState.requestId) return true;
      referenceSearchState.loading = false;
      referenceSearchState.results = Array.isArray(msg.results) ? msg.results : [];
      renderReferenceSearchPanel();
      return true;
    }
  `;
}

module.exports = {
  getReferenceLinksScript,
};
