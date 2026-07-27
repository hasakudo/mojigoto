function getTemplatePanelScript() {
  return `
    function getTemplateModeLabel(saveMode) {
      if (saveMode === "structureOnly") return "大枠だけ";
      if (saveMode === "structureWithDividers") return "大分類・区分";
      if (saveMode === "structureWithHeadings") return "大枠と内容";
      if (saveMode === "full") return "全内容";
      return "不明";
    }

    function closeTemplatePanel() {
      resetTemplateInsertPending();
      openTemplatePreviewId = "";
      setTemplatePanelOpen(false);
    }

    function applyTemplateToEditor(template) {
      const nextGroups = cloneTemplateGroupsForEditor(template?.groups);

      state.groups = nextGroups.length ? nextGroups : [createGroup()];

      markDirty();
      renderGroups();
      renderPreview();
      setTemplatePanelOpen(false);
      setMoreMenuOpen(false);

      const templateLabel = String(template?.label || "テンプレート");
      clearStatus();
      setStatus(\`テンプレート「\${templateLabel}」を置換えました。\`, true);
    }

    function cloneTemplateItemsForInsert(groups) {
      const result = [];

      (groups || []).forEach((group) => {
        const items = Array.isArray(group.items) ? group.items : [];
        items.forEach((item) => {
          result.push(cloneImportedItem(item));
        });
      });

      return result;
    }

    function cloneTemplateGroupsForInsert(groups) {
      return (Array.isArray(groups) ? groups : []).map((group) =>
        cloneTemplateGroup(group),
      );
    }

    function applyTemplateInsert(template, options = {}) {
      const {
        mode = "append",
        afterGroupId = "",
        afterItemId = "",
        targetGroupId = "",
      } = options;

      const currentGroups = Array.isArray(state.groups) ? [...state.groups] : [];

      if (mode === "afterItem" && targetGroupId && afterItemId) {
        const targetGroup = currentGroups.find((g) => g.id === targetGroupId);
        if (!targetGroup) {
          showTemplatePanelMessage("挿入先の大分類が見つかりませんでした。");
          return;
        }

        const nextItems = cloneTemplateItemsForInsert(template?.groups || []);
        if (!nextItems.length) {
          showTemplatePanelMessage("挿入できる区分・項目がありません。");
          return;
        }

        if (!Array.isArray(targetGroup.items)) {
          targetGroup.items = [];
        }

        const itemIndex = targetGroup.items.findIndex((item) => item.id === afterItemId);
        if (itemIndex >= 0) {
          targetGroup.items.splice(itemIndex + 1, 0, ...nextItems);
        } else {
          targetGroup.items.push(...nextItems);
        }

        state.groups = currentGroups;

        openTemplatePreviewId = "";
        setTemplatePanelOpen(false);

        markDirty();
        renderGroups();
        renderPreview();
        updateDirtyUi();

        setStatus(\`テンプレート「\${template.label || ""}」を項目の後に挿入しました。\`, true);
        return;
      }

      if (mode === "groupContent" && afterGroupId) {
        const targetGroup = currentGroups.find((g) => g.id === afterGroupId);
        if (!targetGroup) {
          showTemplatePanelMessage("挿入先の大分類が見つかりませんでした。");
          return;
        }

        const nextItems = cloneTemplateItemsForInsert(template?.groups || []);
        if (!nextItems.length) {
          showTemplatePanelMessage("挿入できる区分・項目がありません。");
          return;
        }

        if (!Array.isArray(targetGroup.items)) {
          targetGroup.items = [];
        }

        targetGroup.items.push(...nextItems);
        state.groups = currentGroups;

        openTemplatePreviewId = "";
        setTemplatePanelOpen(false);

        markDirty();
        renderGroups();
        renderPreview();
        updateDirtyUi();

        setStatus(\`テンプレート「\${template.label || ""}」を大分類の中に挿入しました。\`, true);
        return;
      }

      const nextGroups = cloneTemplateGroupsForInsert(template?.groups || []);
      if (!nextGroups.length) {
        showTemplatePanelMessage("挿入できる大分類がありません。");
        return;
      }

      if (mode === "afterGroup" && afterGroupId) {
        const index = currentGroups.findIndex((g) => g.id === afterGroupId);

        if (index >= 0) {
          currentGroups.splice(index + 1, 0, ...nextGroups);
          state.groups = currentGroups;
        } else {
          state.groups = [...currentGroups, ...nextGroups];
        }
      } else {
        state.groups = [...currentGroups, ...nextGroups];
      }

      openTemplatePreviewId = "";
      setTemplatePanelOpen(false);

      markDirty();
      renderGroups();
      renderPreview();
      updateDirtyUi();

      setStatus(\`テンプレート「\${template.label || ""}」を挿入しました。\`, true);
    }

    function resetTemplateInsertPending() {
      pendingTemplateInsertAfterGroupId = "";
      pendingTemplateInsertAfterGroupTitle = "";

      pendingTemplateInsertIntoGroupId = "";
      pendingTemplateInsertIntoGroupTitle = "";

      pendingTemplateInsertAfterItemId = "";
      pendingTemplateInsertAfterItemTitle = "";
      pendingTemplateInsertAfterItemGroupId = "";
      pendingTemplateInsertAfterItemGroupTitle = "";
    }

    function openTemplatePanelForGroupInsert(groupId, groupTitle) {
      resetTemplateInsertPending();

      pendingTemplateInsertAfterGroupId = String(groupId || "");
      pendingTemplateInsertAfterGroupTitle = String(groupTitle || "").trim();

      setGroupMoreMenuOpen("");
      setSearchOpen(false);
      setTemplatePanelOpen(true);
      requestTemplateList();
      updateTemplateInsertTargetLabel();
    }

    function openTemplatePanelForGroupContentInsert(groupId, groupTitle) {
      resetTemplateInsertPending();

      pendingTemplateInsertIntoGroupId = String(groupId || "");
      pendingTemplateInsertIntoGroupTitle = String(groupTitle || "").trim();

      setGroupMoreMenuOpen("");
      setSearchOpen(false);
      setTemplatePanelOpen(true);
      requestTemplateList();
      updateTemplateInsertTargetLabel();
    }

    function openTemplatePanelForItemContentInsert(itemId, itemTitle, groupId, groupTitle) {
      resetTemplateInsertPending();

      pendingTemplateInsertAfterItemId = String(itemId || "");
      pendingTemplateInsertAfterItemTitle = String(itemTitle || "").trim();
      pendingTemplateInsertAfterItemGroupId = String(groupId || "");
      pendingTemplateInsertAfterItemGroupTitle = String(groupTitle || "").trim();

      setItemMoreMenuOpen("");
      setSearchOpen(false);
      setTemplatePanelOpen(true);
      requestTemplateList();
      updateTemplateInsertTargetLabel();
    }

    function openTemplatePanelForAppend() {
      resetTemplateInsertPending();

      setSearchOpen(false);
      setTemplatePanelOpen(true);
      requestTemplateList();
      updateTemplateInsertTargetLabel();
    }

    function updateTemplateInsertTargetLabel() {
      const el = document.getElementById("templateInsertTarget");
      if (!el) return;

      if (pendingTemplateInsertAfterItemId && pendingTemplateInsertAfterItemGroupId) {
        const groupLabel = pendingTemplateInsertAfterItemGroupTitle || "指定した大分類";
        const itemLabel = pendingTemplateInsertAfterItemTitle || "指定した項目";
        el.textContent = \`挿入先: 「\${groupLabel}」の「\${itemLabel}」の後\`;
        el.hidden = false;
        return;
      }

      if (pendingTemplateInsertIntoGroupId) {
        const label = pendingTemplateInsertIntoGroupTitle || "指定した大分類";
        el.textContent = \`挿入先: 「\${label}」の中\`;
        el.hidden = false;
        return;
      }

      if (pendingTemplateInsertAfterGroupId) {
        const label = pendingTemplateInsertAfterGroupTitle || "指定した大分類";
        el.textContent = \`挿入先: 「\${label}」の下\`;
        el.hidden = false;
        return;
      }

      el.textContent = "挿入先: ノート末尾";
      el.hidden = false;
    }

    function renderTemplateList() {
      if (!templateListRoot) return;

      if (!Array.isArray(templateListState) || !templateListState.length) {
        templateListRoot.innerHTML =
          '<div class="templateEmpty">自作テンプレートはまだありません。</div>';
        return;
      }

      templateListRoot.innerHTML = templateListState
        .map((tpl) => {
          const groups = Array.isArray(tpl.groups) ? tpl.groups.length : 0;
          const isOpen = openTemplatePreviewId === tpl.templateId;
          const isUser = String(tpl.templateId || "").startsWith("user:");
          const modeLabel = getTemplateModeLabel(tpl.saveMode);
          const canDelete = String(tpl.templateId || "").startsWith("user:");

          const previewHtml = isOpen
            ? \`<div class="templatePreviewBox">\${buildTemplateSummary(tpl).trim()}</div>\`
            : "";

          const deleteButtonHtml = canDelete
            ? \`
              <button
                class="danger templateDeleteBtn"
                type="button"
                data-template-id="\${esc(tpl.templateId || "")}"
                data-template-label="\${esc(tpl.label || "")}"
              >
                削除
              </button>
            \`
            : "";
            
          const subText = isUser && modeLabel !== "不明"
            ? \`\${esc(tpl.description || "")} / 大分類 \${groups} / \${esc(modeLabel)}\`
            : \`\${esc(tpl.description || "")} / 大分類 \${groups}\`;


        return \`
          <div class="templateRow">
            <div class="templateRowHead">
              <div class="templateMeta">
                <div class="templateName">\${esc(tpl.label || "")}</div>
                <div class="templateSub">\${subText}</div>
              </div>

              <div class="templateActions">
                <button
                  class="secondary templatePreviewBtn"
                  type="button"
                  data-template-id="\${esc(tpl.templateId || "")}"
                >
                  \${isOpen ? "閉じる" : "内容確認"}
                </button>

                <button
                  class="secondary templateInsertBtn"
                  type="button"
                  data-template-id="\${esc(tpl.templateId || "")}"
                  data-template-label="\${esc(tpl.label || "")}"
                >
                  挿入
                </button>

                <button
                  class="secondary templateApplyBtn"
                  type="button"
                  data-template-id="\${esc(tpl.templateId || "")}"
                  data-template-label="\${esc(tpl.label || "")}"
                >
                  置き換え
                </button>

                \${deleteButtonHtml}

              </div>
            </div>

            \${previewHtml}
          </div>
        \`;
        })
        .join("");

      const previewButtons = templateListRoot.querySelectorAll(".templatePreviewBtn");
      const insertButtons = templateListRoot.querySelectorAll(".templateInsertBtn");
      const applyButtons = templateListRoot.querySelectorAll(".templateApplyBtn");
      const deleteButtons = templateListRoot.querySelectorAll(".templateDeleteBtn");

      showTemplatePanelMessage(\`テンプレート \${applyButtons.length} 件を表示しました。\`);

      groupsRoot.addEventListener("click", (e) => {
        const el = e.target.closest("[data-group-id]");
        if (!el) return;

        lastActiveGroupId = el.dataset.groupId || "";
      });

      groupsRoot.addEventListener("input", (e) => {
        const el = e.target.closest("[data-group-id]");
        if (!el) return;

        lastActiveGroupId = el.dataset.groupId || "";
      });

      previewButtons.forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const templateId = btn.dataset.templateId || "";

          if (openTemplatePreviewId === templateId) {
            openTemplatePreviewId = "";
          } else {
            openTemplatePreviewId = templateId;
          }

          renderTemplateList();
        });
      });

      insertButtons.forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const templateId = btn.dataset.templateId || "";
          const template = templateListState.find((tpl) => tpl.templateId === templateId);

          if (!template) {
            showTemplatePanelMessage("挿入するテンプレートが見つかりませんでした。");
            return;
          }

          if (pendingTemplateInsertAfterItemId && pendingTemplateInsertAfterItemGroupId) {
            applyTemplateInsert(template, {
              mode: "afterItem",
              afterItemId: pendingTemplateInsertAfterItemId,
              targetGroupId: pendingTemplateInsertAfterItemGroupId,
            });
            resetTemplateInsertPending();
            return;
          }

          if (pendingTemplateInsertIntoGroupId) {
            applyTemplateInsert(template, {
              mode: "groupContent",
              afterGroupId: pendingTemplateInsertIntoGroupId,
            });
            resetTemplateInsertPending();
            return;
          }

          if (pendingTemplateInsertAfterGroupId) {
            applyTemplateInsert(template, {
              mode: "afterGroup",
              afterGroupId: pendingTemplateInsertAfterGroupId,
            });
            resetTemplateInsertPending();
            return;
          }

          applyTemplateInsert(template, {
            mode: "append",
          });
          resetTemplateInsertPending();
        });
      });

      applyButtons.forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const templateId = btn.dataset.templateId || "";
          const templateLabel = btn.dataset.templateLabel || "このテンプレート";

          if (!templateId) {
            showTemplatePanelMessage("置換えするテンプレートが見つかりませんでした。");
            return;
          }

          const template = templateListState.find((tpl) => tpl.templateId === templateId);
          if (!template) {
            showTemplatePanelMessage("置換えするテンプレートが見つかりませんでした。");
            return;
          }

          showTemplatePanelMessage(\`テンプレート「\${templateLabel}」を読み込みます...\`);
          applyTemplateToEditor(template);
        });
      });

      deleteButtons.forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const templateId = btn.dataset.templateId || "";
          const templateLabel = btn.dataset.templateLabel || "このテンプレート";

          if (!templateId) {
            showTemplatePanelMessage("削除対象のテンプレートIDが取得できませんでした。");
            return;
          }

          showTemplatePanelMessage(\`「\${templateLabel}」の削除確認を開いています...\`);

          vscode.postMessage({
            type: "deleteTemplate",
            templateId,
          });
        });
      });
      updateTemplateInsertTargetLabel();
    }

    function requestTemplateList() {
      vscode.postMessage({
        type: "requestTemplateList"
      });
    }

    function showTemplatePanelMessage(message) {
      if (typeof templatePanelMessageEl === "undefined" || !templatePanelMessageEl) {
        return;
      }

      if (!message) {
        templatePanelMessageEl.hidden = true;
        templatePanelMessageEl.textContent = "";
        return;
      }

      templatePanelMessageEl.hidden = false;
      templatePanelMessageEl.textContent = message;
    }

    function buildTemplateSummary(tpl) {
      const groups = Array.isArray(tpl?.groups) ? tpl.groups : [];

      if (!groups.length) {
        return '<div class="templatePreviewEmpty">内容がありません。</div>';
      }

      function summarizeBody(body) {
        const text = String(body || "").trim();
        if (!text) return null;

        const oneLine = text
          .replace(/\\r?\\n/g, " ")
          .replace(/\\s+/g, " ")
          .trim();

        const limit = 60;
        const summary =
          oneLine.length > limit
            ? oneLine.slice(0, limit) + "…"
            : oneLine;

        return {
          full: text,
          summary,
          hasBody: true,
        };
      }

      return groups
        .map((group) => {
          const items = Array.isArray(group?.items) ? group.items : [];

          const itemHtml = items
            .map((item) => {
              if (item?.kind === "divider") {
                const label = String(item?.label || "区分");
                const value = String(item?.value || "").trim();

                return ''
                  + '<div class="templatePreviewDivider">'
                  +   '<span class="templatePreviewMark">─</span>'
                  +   '<span class="templatePreviewDividerLabel">' + esc(label) + '</span>'
                  +   (value
                        ? '<span class="templatePreviewDividerValue">' + esc(value) + '</span>'
                        : '')
                  + '</div>';
              }

              const heading = String(item?.heading || "項目");
              const bodyInfo = summarizeBody(item?.body);

              const bodyHtml = bodyInfo
                ? ''
                  + '<details class="templatePreviewBodyDetails">'
                  +   '<summary>'
                  +     '<span class="templatePreviewBodySummary">' + esc(bodyInfo.summary) + '</span>'
                  +     '<span class="templatePreviewBodyToggle">全文</span>'
                  +   '</summary>'
                  +   '<div class="templatePreviewBodyFull">' + esc(bodyInfo.full) + '</div>'
                  + '</details>'
                : '';

              return ''
                + '<div class="templatePreviewItem">'
                +   '<div class="templatePreviewItemHead">'
                +     '<span class="templatePreviewMark">・</span>'
                +     '<span class="templatePreviewItemTitle">' + esc(heading) + '</span>'
                +   '</div>'
                +   bodyHtml
                + '</div>';
            })
            .join("");

          return ''
            + '<section class="templatePreviewGroup">'
            +   '<div class="templatePreviewGroupTitle">■ ' + esc(group?.title || "無題大分類") + '</div>'
            +   '<div class="templatePreviewItems">'
            +     (itemHtml || '<div class="templatePreviewEmpty">項目がありません。</div>')
            +   '</div>'
            + '</section>';
        })
        .join("");
    }
  `;
}

module.exports = {
  getTemplatePanelScript,
};
