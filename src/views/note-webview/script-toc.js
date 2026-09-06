function getNoteTocScript() {
  return `
    const noteTocStorageKey = (() => {
      const filePath = String(initial?.filePath || "").trim();
      const noteType = String(initial?.type || initial?.noteType || "").trim();
      const fallbackTitle = String(initial?.title || "").trim();
      return "mojigoto.noteToc:" + (filePath || (noteType + ":" + fallbackTitle));
    })();

    let noteTocState = {
      open: false,
      collapsed: false,
      showGroups: true,
      showDividers: true,
      showItems: true,
    };

    function loadNoteTocState() {
      try {
        const saved = JSON.parse(localStorage.getItem(noteTocStorageKey) || "{}");
        noteTocState = {
          ...noteTocState,
          open: Boolean(saved.open),
          collapsed: Boolean(saved.collapsed),
          showGroups: saved.showGroups !== false,
          showDividers: saved.showDividers !== false,
          showItems: saved.showItems !== false,
        };
      } catch {}
    }

    function saveNoteTocState() {
      try {
        localStorage.setItem(noteTocStorageKey, JSON.stringify(noteTocState));
      } catch {}
    }

    function truncateNoteTocLabel(value, fallback) {
      const text = String(value || "").trim() || fallback;
      const chars = Array.from(text);
      return chars.length <= 20 ? text : chars.slice(0, 19).join("") + "…";
    }

    function getNoteTocEntries() {
      const entries = [];
      const groups = Array.isArray(state?.groups) ? state.groups : [];

      groups.forEach((group, groupIndex) => {
        if (noteTocState.showGroups) {
          entries.push({
            level: "group",
            navId: "group:" + group.id,
            label: truncateNoteTocLabel(group.title, "大分類 " + (groupIndex + 1)),
          });
        }

        (Array.isArray(group.items) ? group.items : []).forEach((item, itemIndex) => {
          const isDivider = item?.kind === "divider";
          if (isDivider && !noteTocState.showDividers) return;
          if (!isDivider && !noteTocState.showItems) return;

          entries.push({
            level: isDivider ? "divider" : "item",
            navId: "item:" + item.id,
            label: truncateNoteTocLabel(
              isDivider ? item.label : item.heading,
              (isDivider ? "区分 " : "項目 ") + (itemIndex + 1),
            ),
          });
        });
      });

      return entries;
    }

    function renderNoteToc() {
      const panel = document.getElementById("noteTocPanel");
      const list = document.getElementById("noteTocList");
      const collapseButton = document.getElementById("collapseNoteTocBtn");
      const toggleButton = document.getElementById("toggleNoteTocBtn");
      if (!panel || !list) return;

      panel.hidden = !noteTocState.open;
      panel.classList.toggle("isCollapsed", noteTocState.collapsed);
      toggleButton?.classList.toggle("isActive", noteTocState.open);
      toggleButton?.setAttribute("aria-expanded", noteTocState.open ? "true" : "false");
      if (collapseButton) {
        collapseButton.textContent = noteTocState.collapsed ? "＋" : "−";
        collapseButton.title = noteTocState.collapsed ? "目次を開く" : "目次を折りたたむ";
      }

      ["Groups", "Dividers", "Items"].forEach((suffix) => {
        const checkbox = document.getElementById("noteTocShow" + suffix);
        const key = "show" + suffix;
        if (checkbox) checkbox.checked = Boolean(noteTocState[key]);
      });

      const entries = getNoteTocEntries();
      list.innerHTML = "";

      if (!entries.length) {
        const empty = document.createElement("div");
        empty.className = "noteTocEmpty";
        empty.textContent = "表示する目次項目がありません。";
        list.appendChild(empty);
        return;
      }

      entries.forEach((entry) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "noteTocEntry noteTocEntry-" + entry.level;
        button.dataset.tocNavId = entry.navId;
        button.textContent = entry.label;
        button.title = entry.label;
        list.appendChild(button);
      });
    }

    function setNoteTocOpen(open, options = {}) {
      noteTocState.open = Boolean(open);
      if (noteTocState.open && options.expand) {
        noteTocState.collapsed = false;
      }
      saveNoteTocState();
      renderNoteToc();

      if (noteTocState.open && options.focusSettings) {
        requestAnimationFrame(() => {
          document.getElementById("noteTocSettings")?.scrollIntoView({ block: "nearest" });
          document.getElementById("noteTocShowGroups")?.focus();
        });
      }
    }

    function bindNoteTocEvents() {
      document.getElementById("toggleNoteTocBtn")?.addEventListener("click", () => {
        setNoteTocOpen(!noteTocState.open, { expand: true });
      });

      document.getElementById("closeNoteTocBtn")?.addEventListener("click", () => {
        setNoteTocOpen(false);
      });

      document.getElementById("collapseNoteTocBtn")?.addEventListener("click", () => {
        noteTocState.collapsed = !noteTocState.collapsed;
        saveNoteTocState();
        renderNoteToc();
      });

      document.getElementById("noteTocList")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-toc-nav-id]");
        if (!button) return;
        scrollToEditorNavId(button.dataset.tocNavId || "");
      });

      ["Groups", "Dividers", "Items"].forEach((suffix) => {
        document.getElementById("noteTocShow" + suffix)?.addEventListener("change", (event) => {
          noteTocState["show" + suffix] = Boolean(event.target.checked);
          saveNoteTocState();
          renderNoteToc();
        });
      });
    }

    loadNoteTocState();
  `;
}

module.exports = {
  getNoteTocScript,
};
