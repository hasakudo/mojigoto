function escapeAttr(value) {
  return String(value ?? "").replace(/"/g, "&quot;");
}

function getInputAssistToolbarCss() {
  return `
    .inputAssistWrap {
      margin-top: 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-sideBar-background);
      overflow: hidden;
    }

    .inputAssistHead {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .inputAssistTitle {
      font-size: 12px;
      opacity: 0.85;
      font-weight: 600;
    }

    .inputAssistBody {
      padding: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .inputAssistWrap.isCollapsed .inputAssistBody {
      display: none;
    }

    .inputAssistButton {
      padding: 5px 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      cursor: pointer;
      font: inherit;
      line-height: 1.3;
      white-space: nowrap;
    }

    .inputAssistButton:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }

    .inputAssistHint {
      margin-left: auto;
      font-size: 11px;
      opacity: 0.7;
    }
  `;
}

function getInputAssistToolbarHtml(options = {}) {
  const {
    rootId = "inputAssistToolbar",
    title = "入力補助",
    showToggle = true,
    showHeader = true,
    collapsed = true,
  } = options;

  return `
    <div
      id="${escapeAttr(rootId)}"
      class="inputAssistWrap${showToggle && collapsed ? " isCollapsed" : ""}"
      data-input-assist-root
    >
      ${
        showHeader
          ? showToggle
            ? `
                  <div class="inputAssistHead">
                    <button
                      type="button"
                      class="inputAssistButton"
                      data-input-assist-toggle
                      aria-expanded="${collapsed ? "false" : "true"}"
                    >
                      ${collapsed ? "＋" : "－"} ${title}
                    </button>
                    <div class="inputAssistHint">直前にフォーカスした入力欄へ挿入</div>
                  </div>
                `
            : `
                  <div class="inputAssistHead">
                    <div class="inputAssistTitle">${title}</div>
                    <div class="inputAssistHint">直前にフォーカスした入力欄へ挿入</div>
                  </div>
                `
          : ""
      }

      <div class="inputAssistBody">
        <button type="button" class="inputAssistButton" data-input-assist-action="ellipsis">……</button>
        <button type="button" class="inputAssistButton" data-input-assist-action="dash">――</button>

        <button type="button" class="inputAssistButton" data-input-assist-action="ruby">ルビ</button>
        <button type="button" class="inputAssistButton" data-input-assist-action="sideDots">傍点</button>

        <button type="button" class="inputAssistButton" data-input-assist-action="wrap" data-left="「" data-right="」">「」</button>
        <button type="button" class="inputAssistButton" data-input-assist-action="wrap" data-left="『" data-right="』">『』</button>
        <button type="button" class="inputAssistButton" data-input-assist-action="wrap" data-left="（" data-right="）">（）</button>
        <button type="button" class="inputAssistButton" data-input-assist-action="wrap" data-left="〝" data-right="〟">〝〟</button>
        <button type="button" class="inputAssistButton" data-input-assist-action="wrap" data-left="《" data-right="》">《》</button>
        <button type="button" class="inputAssistButton" data-input-assist-action="unwrap">ルビ・記号解除</button>
        <button type="button" class="inputAssistButton" data-input-assist-action="heading1"># </button>
        <button type="button" class="inputAssistButton" data-input-assist-action="heading2">## </button>
        <button type="button" class="inputAssistButton" data-input-assist-action="heading3">### </button>
        
      </div>
    </div>
  `;
}

function getInputAssistToolbarScript(options = {}) {
  const {
    rootId = "inputAssistToolbar",
    targetSelector = 'textarea, input[type="text"]',
    toastFunctionName = "showToast",
  } = options;

  return `
    function createInputAssistController() {
      const root = document.getElementById(${JSON.stringify(rootId)});
      if (!root) return null;

      let lastFocusedField = null;

      function isTextField(el) {
        if (!el) return false;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          return false;
        }
        if (el instanceof HTMLInputElement && el.type !== "text") {
          return false;
        }
        return !el.readOnly && !el.disabled;
      }

      function setLastFocusedField(el) {
        if (isTextField(el) && el.matches(${JSON.stringify(targetSelector)})) {
          lastFocusedField = el;
        }
      }

      function getTargetField() {
        const active = document.activeElement;
        if (isTextField(active) && active.matches(${JSON.stringify(targetSelector)})) {
          lastFocusedField = active;
          return active;
        }
        if (isTextField(lastFocusedField) && document.contains(lastFocusedField)) {
          return lastFocusedField;
        }
        return null;
      }

      function triggerInput(el) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }

      function replaceSelection(el, nextText, options = {}) {
        const start = Number(el.selectionStart ?? 0);
        const end = Number(el.selectionEnd ?? start);

        el.focus();
        el.setRangeText(nextText, start, end, "end");

        const caret =
          typeof options.caret === "number"
            ? start + options.caret
            : start + nextText.length;

        el.setSelectionRange(caret, caret);
        triggerInput(el);
      }

      function wrapSelection(el, left, right) {
        const start = Number(el.selectionStart ?? 0);
        const end = Number(el.selectionEnd ?? start);
        const selected = el.value.slice(start, end);
        const nextText = left + selected + right;
        const caret = selected
          ? start + nextText.length
          : start + left.length;

        const before = el.value.slice(0, start);
        const after = el.value.slice(end);
        el.value = before + nextText + after;
        el.focus();

        if (selected) {
          el.setSelectionRange(start + left.length, start + left.length + selected.length);
        } else {
          el.setSelectionRange(caret, caret);
        }

        triggerInput(el);
      }

      function insertSideDots() {
        const el = getTargetField();
        if (!el) {
            showToast?.("入力欄を選択してから使ってください。", { isError: true });
            return;
        }

        const start = Number(el.selectionStart ?? 0);
        const end = Number(el.selectionEnd ?? start);
        const selected = el.value.slice(start, end);
        const baseText = selected || "文字列";

        replaceSelection(el, \`《《\${baseText}》》\`);
      }

      function insertPlain(text) {
        const el = getTargetField();
        if (!el) {
          showToast?.("入力欄を選択してから使ってください。", { isError: true });
          return;
        }

        replaceSelection(el, text);
      }

      function unwrapOuterPair(text) {
        const pairs = [
          ["「", "」"],
          ["『", "』"],
          ["（", "）"],
          ["【", "】"],
          ["〈", "〉"],
          ["《", "》"],
          ["〝", "〟"],
        ];

        for (const [left, right] of pairs) {
          if (text.startsWith(left) && text.endsWith(right) && text.length >= 2) {
            return text.slice(left.length, text.length - right.length);
          }
        }

        return text;
      }

      function normalizeUnwrapText(text) {
        let next = String(text ?? "");

        // 1. 傍点解除を最優先
        if (next.startsWith("《《") && next.endsWith("》》") && next.length >= 4) {
          return next.slice(2, -2);
        }

        // 2. ルビ解除
        next = next.replace(/[|｜]?([^《]+)《[^》]*》/g, "$1");

        // 3. 外側1層の囲み解除
        next = unwrapOuterPair(next);

        return next;
      }

      function removeAssistNotation() {
        const el = getTargetField();
        if (!el) {
          showToast?.("入力欄を選択してから使ってください。", { isError: true });
          return;
        }

        const start = Number(el.selectionStart ?? 0);
        const end = Number(el.selectionEnd ?? start);

        if (start === end) {
          showToast?.("解除したい範囲を選択してください。", { isError: true });
          return;
        }

        const selected = el.value.slice(start, end);
        const nextText = normalizeUnwrapText(selected);

        replaceSelection(el, nextText);
      }

      function insertRuby() {
        const el = getTargetField();
        if (!el) {
          showToast?.("入力欄を選択してから使ってください。", { isError: true });
          return;
        }

        const start = Number(el.selectionStart ?? 0);
        const end = Number(el.selectionEnd ?? start);
        const selected = el.value.slice(start, end) || "漢字";
        const nextText = \`|\${selected}《》\`;

        replaceSelection(el, nextText, {
          caret: nextText.length - 1, // 《》の中
        });
      }

      function bindFieldTracking() {
        document.addEventListener("focusin", (event) => {
          setLastFocusedField(event.target);
        });
        document.addEventListener("click", (event) => {
          setLastFocusedField(event.target);
        });
      }

      function bindToolbar() {
        const toggleBtn = root.querySelector("[data-input-assist-toggle]");
        if (toggleBtn) {
          toggleBtn.addEventListener("click", () => {
            const nextCollapsed = !root.classList.contains("isCollapsed");
            root.classList.toggle("isCollapsed", nextCollapsed);
            toggleBtn.textContent = (nextCollapsed ? "＋" : "－") + " 入力補助";
            toggleBtn.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");
          });
        }

        root.querySelectorAll("[data-input-assist-action]").forEach((button) => {

          button.addEventListener("mousedown", (event) => {
            event.preventDefault();
          });
          
          button.addEventListener("click", () => {
            const action = button.dataset.inputAssistAction;

            if (action === "ruby") {
              insertRuby();
              return;
            }

            if (action === "sideDots") {
              insertSideDots();
              return;
            }

            if (action === "ellipsis") {
              insertPlain("……");
              return;
            }

            if (action === "dash") {
              insertPlain("――");
              return;
            }

            if (action === "heading1") {
              insertPlain("# ");
              return;
            }

            if (action === "heading2") {
              insertPlain("## ");
              return;
            }

            if (action === "heading3") {
              insertPlain("### ");
              return;
            }

            if (action === "unwrap") {
              removeAssistNotation();
              return;
            }

            if (action === "wrap") {
              const el = getTargetField();
              if (!el) {
                ${toastFunctionName}?.("入力欄を選択してから使ってください。", { isError: true });
                return;
              }
              wrapSelection(el, button.dataset.left || "", button.dataset.right || "");
            }
          });
        });
      }

      bindFieldTracking();
      bindToolbar();

      return {
        focusField: setLastFocusedField,
      };
    }
  `;
}

module.exports = {
  getInputAssistToolbarCss,
  getInputAssistToolbarHtml,
  getInputAssistToolbarScript,
};
