function getScript(dataJson) {
  return `
    const vscode = acquireVsCodeApi();
    const initialData = ${dataJson};

    const titleInput = document.getElementById("noteTitleInput");
    const warningListEl = document.getElementById("warningList");
    const warningsCardEl = document.getElementById("warningsCard");
    const previewRoot = document.getElementById("previewRoot");
    const btnActions = document.getElementById("btnActions");
    const expandAllBtn = document.getElementById("expandAllBtn");
    const collapseAllBtn = document.getElementById("collapseAllBtn");
    const includeItemMemos = document.getElementById("includeItemMemos");
    const memoImportSummary = document.getElementById("memoImportSummary");

    const openSourceFileBtn = document.getElementById("openSourceFileBtn");
    const reloadImportSourceBtn = document.getElementById("reloadImportSourceBtn");
    const openSourceFileBtnSecondary = document.getElementById("openSourceFileBtnSecondary");
    const reloadImportSourceBtnSecondary = document.getElementById("reloadImportSourceBtnSecondary");

    const importShellEl = document.querySelector(".importShell");
    const importTopCardEl = document.querySelector(".importTopCard");
    const previewCardEl = previewRoot?.closest(".card");

    const hideWarningsBtn = document.getElementById("hideWarningsBtn");
    const showWarningsBtn = document.getElementById("showWarningsBtn");
    const warningsCollapsedCardEl = document.getElementById("warningsCollapsedCard");
    const warningsCollapsedTextEl = document.getElementById("warningsCollapsedText");

    const previewGroups = Array.isArray(initialData?.previewData?.preview?.groups)
      ? initialData.previewData.preview.groups
      : [];

    const warnings = Array.isArray(initialData?.previewData?.warnings)
      ? initialData.previewData.warnings
      : [];

    const expandedEntryIds = new Set();

    let warningsHidden = false;

    function esc(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function renderInlineBadges(importMeta) {
      const badges = [];

      if (importMeta?.supplemented) {
        badges.push('<span class="inlineBadge">補完</span>');
      }

      return badges.length
        ? \`<span class="inlineBadges">\${badges.join("")}</span>\`
        : "";
    }

    function renderWarnings() {
      if (!warnings.length) {
        warningsCardEl.hidden = true;
        warningsCollapsedCardEl.hidden = true;
        warningListEl.innerHTML = "";
        syncPreviewHeight();
        return;
      }

      if (warningsHidden) {
        warningsCardEl.hidden = true;
        warningsCollapsedCardEl.hidden = false;
        if (warningsCollapsedTextEl) {
          warningsCollapsedTextEl.textContent = \`警告を閉じています。（\${warnings.length}件）\`;
        }
        syncPreviewHeight();
        return;
      }

      warningsCardEl.hidden = false;
      warningsCollapsedCardEl.hidden = true;
      warningListEl.innerHTML = warnings
        .map((warning) => {
          const isAttention = String(warning?.level || "") === "attention";
          const sampleLine = String(warning?.sampleLine || "").trim();

          return \`
            <div class="warningItem">
              <div class="warningHeaderLine">
                \${isAttention ? '<span class="warningFlag">要確認</span>' : ""}
                <span>\${esc(warning?.message || "")}</span>
              </div>
              \${sampleLine ? \`<div class="warningSample">\${esc(sampleLine)}</div>\` : ""}
            </div>
          \`;
        })
        .join("");

      syncPreviewHeight();
    }

    function syncPreviewHeight() {
      if (!previewRoot || !previewCardEl) return;

      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!viewportHeight) return;

      const previewTop = previewRoot.getBoundingClientRect().top;
      const bottomGap = 24;

      const available = Math.floor(viewportHeight - previewTop - bottomGap);

      const nextMaxHeight = Math.max(180, available);
      previewRoot.style.maxHeight = \`\${nextMaxHeight}px\`;
    }

    function renderPreview() {
      const memoCount = previewGroups.reduce((sum, group) => sum + (group.items || []).filter((item) => item.kind !== "divider" && item.memo).length, 0);
      includeItemMemos.disabled = memoCount === 0;
      memoImportSummary.textContent = memoCount ? "項目メモ " + memoCount + "件：" + (includeItemMemos.checked ? "本文・形式・タグを取り込みます" : "取り込みません") : "読み込み元に項目メモはありません";
      previewRoot.innerHTML = previewGroups.map((group) => {
        const items = Array.isArray(group?.items) ? group.items : [];

        const itemsHtml = items.map((item) => {
          if (item?.kind === "divider") {
            return \`
              <div class="previewDivider">
                <div class="previewDividerLabel">
                  区分: \${esc(item.label || "無題区分")}
                  \${renderInlineBadges(item?.importMeta)}
                </div>
                \${item.value ? \`<div class="previewDividerValue">\${esc(item.value)}</div>\` : ""}
              </div>
            \`;
          }

          const entryId = String(item?.id || "");
          const expanded = expandedEntryIds.has(entryId);

          return \`
            <div class="previewEntry">
              <div class="previewEntryHead">
                <div style="min-width:0;">
                  <div class="previewEntryTitle">
                    項目: \${esc(item?.heading || "無題項目")}
                    \${item.memo ? '<span class="muted">（項目メモ：' + (includeItemMemos.checked ? '取り込む' : '対象外') + '）</span>' : ""}
                    \${renderInlineBadges(item?.importMeta)}
                  </div>
                  \${!expanded ? \`<div class="previewEntryLine">\${esc(item?.previewLine || "")}</div>\` : ""}
                </div>
                <button
                  type="button"
                  class="secondary"
                  data-action="toggleEntry"
                  data-entry-id="\${esc(entryId)}"
                >\${expanded ? "閉じる" : "開く"}</button>
              </div>
              \${expanded ? \`<div class="previewEntryBody">\${esc(item?.body || "")}</div>\` : ""}
              \${expanded && item.memo ? \`<div class="previewEntryBody\${includeItemMemos.checked ? "" : " memoImportExcluded"}"><strong>項目メモ（\${includeItemMemos.checked ? "取り込む" : "対象外"}）</strong><br>\${esc(item.memo.body || "")}\${item.memo.tags?.length ? "<br>タグ: " + esc(item.memo.tags.join(" / ")) : ""}</div>\` : ""}
            </div>
          \`;
        }).join("");

        return \`
          <section class="previewGroup">
            <div class="previewGroupTitle">
              大分類: \${esc(group?.title || "無題大分類")}
              \${renderInlineBadges(group?.importMeta)}
            </div>
            \${itemsHtml || '<div class="muted">内容がありません。</div>'}
          </section>
        \`;
      }).join("");

      syncPreviewHeight();
    }

    function postOpenSourceFile() {
      vscode.postMessage({ type: "openSourceFile" });
    }

    function postReloadImportSource() {
      vscode.postMessage({ type: "reloadImportSource", payload: { includeItemMemos: includeItemMemos.checked } });
    }

    openSourceFileBtn?.addEventListener("click", postOpenSourceFile);
    reloadImportSourceBtn?.addEventListener("click", postReloadImportSource);
    openSourceFileBtnSecondary?.addEventListener("click", postOpenSourceFile);
    reloadImportSourceBtnSecondary?.addEventListener("click", postReloadImportSource);

    function renderFooterActions() {
      const mode = String(initialData?.mode || initialData?.previewData?.target?.mode || "tree_create");
      const existingTitle = String(initialData?.existingNoteTitle || initialData?.previewData?.target?.existingNoteTitle || "").trim();

      const buttons = [];

      if (mode === "note_import") {
        buttons.push(\`
          <button type="button" id="replaceBtn">「\${esc(existingTitle || "現在のノート")}」を置換</button>
        \`);
        buttons.push(\`
          <button type="button" class="secondary" id="createBtn">新規作成</button>
        \`);
      } else {
        buttons.push(\`
          <button type="button" id="createBtn">ノートを新規作成</button>
        \`);
      }

      buttons.push(\`
        <button type="button" class="secondary" id="cancelBtn">閉じる</button>
      \`);

      btnActions.innerHTML = buttons.join("");

      document.getElementById("createBtn")?.addEventListener("click", () => {
        vscode.postMessage({
          type: "confirmImportCreate",
          payload: {
            title: String(titleInput?.value || "").trim(),
            includeItemMemos: includeItemMemos.checked,
          },
        });
      });

      document.getElementById("replaceBtn")?.addEventListener("click", () => {
        vscode.postMessage({
          type: "confirmImportReplace",
          payload: {
            title: String(titleInput?.value || "").trim(),
            includeItemMemos: includeItemMemos.checked,
          },
        });
      });

      document.getElementById("cancelBtn")?.addEventListener("click", () => {
        vscode.postMessage({ type: "cancelImport" });
      });

      syncPreviewHeight();
    }

    previewRoot.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action='toggleEntry']");
      if (!btn) return;

      const entryId = String(btn.dataset.entryId || "");
      if (!entryId) return;

      if (expandedEntryIds.has(entryId)) {
        expandedEntryIds.delete(entryId);
      } else {
        expandedEntryIds.add(entryId);
      }

      renderPreview();
    });

    expandAllBtn.addEventListener("click", () => {
      previewGroups.forEach((group) => {
        (Array.isArray(group?.items) ? group.items : []).forEach((item) => {
          if (item?.kind === "entry" && item?.id) {
            expandedEntryIds.add(String(item.id));
          }
        });
      });
      renderPreview();
    });

    collapseAllBtn.addEventListener("click", () => {
      expandedEntryIds.clear();
      renderPreview();
    });

    hideWarningsBtn?.addEventListener("click", () => {
      warningsHidden = true;
      renderWarnings();
    });

    showWarningsBtn?.addEventListener("click", () => {
      warningsHidden = false;
      renderWarnings();
    });

    renderWarnings();
    includeItemMemos.addEventListener("change", renderPreview);
    renderPreview();
    renderFooterActions();
    syncPreviewHeight();

    window.addEventListener("resize", syncPreviewHeight);
  `;
}

module.exports = { getScript };
