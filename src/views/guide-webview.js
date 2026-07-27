const vscode = require("vscode");
const { getNonce, escapeHtml } = require("../core/path-utils");
const { getGuideSections } = require("../guide/guide-sections");

let guidePanel = null;

function openGuideWebview(context, initialSectionId = "") {
  if (guidePanel) {
    guidePanel.reveal(vscode.ViewColumn.One);
    if (initialSectionId) {
      guidePanel.webview.postMessage({
        type: "selectSection",
        sectionId: initialSectionId,
      });
    }
    return;
  }

  guidePanel = vscode.window.createWebviewPanel(
    "mojigotoGuide",
    "もじごとガイド",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  guidePanel.onDidDispose(() => {
    guidePanel = null;
  });

  guidePanel.webview.html = getGuideHtml(
    guidePanel.webview,
    context,
    initialSectionId,
  );
}

function getGuideHtml(webview, context, initialSectionId) {
  const nonce = getNonce();
  const sections = getGuideSections();

  const safeInitialSectionId = sections.some(
    (section) => section.id === initialSectionId,
  )
    ? initialSectionId
    : sections[0]?.id || "";

  const sectionsJson = JSON.stringify(
    sections.map((section) => ({
      id: section.id,
      title: section.title,
      body: section.body,
    })),
  ).replace(/</g, "\\u003c");

  const navHtml = sections
    .map((section) => {
      const isActive = section.id === safeInitialSectionId;
      return `
        <button
          class="guideNavButton${isActive ? " isActive" : ""}"
          type="button"
          data-section-id="${escapeHtml(section.id)}"
        >
          ${escapeHtml(section.title)}
        </button>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>もじごとガイド</title>
  <style>
    :root {
      --guide-border: var(--vscode-panel-border);
      --guide-bg: var(--vscode-editor-background);
      --guide-fg: var(--vscode-editor-foreground);
      --guide-muted: var(--vscode-descriptionForeground);
      --guide-button-bg: var(--vscode-button-secondaryBackground);
      --guide-button-fg: var(--vscode-button-secondaryForeground);
      --guide-button-hover: var(--vscode-button-secondaryHoverBackground);
      --guide-active-bg: var(--vscode-button-background);
      --guide-active-fg: var(--vscode-button-foreground);
      --guide-code-bg: var(--vscode-textCodeBlock-background);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: var(--guide-fg);
      background: var(--guide-bg);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.7;
    }

    button {
      font: inherit;
    }

    .guideRoot {
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      height: 100vh;
      min-height: 0;
    }

    .guideSide {
      min-height: 0;
      border-right: 1px solid var(--guide-border);
      display: flex;
      flex-direction: column;
      background: var(--vscode-sideBar-background);
    }

    .guideSideHeader {
      padding: 14px 14px 10px;
      border-bottom: 1px solid var(--guide-border);
    }

    .guideTitle {
      margin: 0;
      font-size: 1.15rem;
      line-height: 1.4;
    }

    .guideLead {
      margin: 6px 0 0;
      color: var(--guide-muted);
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .guideNav {
      padding: 10px;
      overflow: auto;
      min-height: 0;
    }

    .guideNavButton {
      display: block;
      width: 100%;
      margin: 0 0 5px;
      padding: 7px 9px;
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--guide-button-fg);
      background: transparent;
      text-align: left;
      cursor: pointer;
    }

    .guideNavButton[hidden] {
      display: none;
    }

    .guideNavButton:hover {
      background: var(--guide-button-hover);
    }

    .guideNavButton.isActive {
      color: var(--guide-active-fg);
      background: var(--guide-active-bg);
    }

    .guideMain {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .guideToolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--guide-border);
      background: var(--vscode-editor-background);
    }

    .guideCurrentTitle {
      min-width: 0;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .guideSearch {
      width: min(260px, 40vw);
      padding: 5px 8px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      outline: none;
    }

    .guideContentWrap {
      min-height: 0;
      overflow: auto;
      padding: 24px 28px 48px;
    }

    .guideContent {
      max-width: 860px;
    }

    .guideContent h1 {
      margin: 0 0 18px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--guide-border);
      color: var(--guide-fg);
      font-size: 1.7rem;
      line-height: 1.35;
      letter-spacing: 0.02em;
    }

    .guideContent h2 {
      margin: 34px 0 12px;
      padding: 6px 0 6px 10px;
      border-left: 4px solid var(--guide-border);
      border-bottom: 1px solid var(--guide-border);
      color: var(--guide-fg);
      font-size: 1.22rem;
      line-height: 1.45;
      letter-spacing: 0.02em;
    }

    .guideContent h3 {
      margin: 24px 0 9px;
      padding-left: 10px;
      border-left: 3px solid var(--guide-border);
      color: var(--guide-fg);
      font-size: 1.05rem;
      line-height: 1.45;
      font-weight: 700;
    }

    .guideContent h4 {
      margin: 18px 0 8px;
      color: var(--guide-muted);
      font-size: 0.98rem;
      line-height: 1.45;
      font-weight: 700;
    }

    .guideContent h2 + p,
    .guideContent h3 + p,
    .guideContent h4 + p,
    .guideContent h2 + ul,
    .guideContent h3 + ul,
    .guideContent h4 + ul,
    .guideContent h2 + ol,
    .guideContent h3 + ol,
    .guideContent h4 + ol {
      margin-top: 0;
    }

    .guideLocalToc {
      margin: 0 0 18px;
      border: 1px solid var(--guide-border);
      border-radius: 8px;
      background: color-mix(
        in srgb,
        var(--vscode-sideBar-background) 82%,
        transparent
      );
      overflow: hidden;
    }

    .guideLocalTocRoot {
      display: block;
    }

    .guideLocalTocRootSummary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      color: var(--guide-muted);
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
      border-bottom: 1px solid transparent;
    }

    .guideLocalTocRoot[open] .guideLocalTocRootSummary {
      border-bottom-color: var(--guide-border);
    }

    .guideLocalTocRootSummary::before {
      content: "▾";
      flex: 0 0 auto;
      opacity: 0.8;
    }

    .guideLocalTocRoot:not([open]) .guideLocalTocRootSummary::before {
      content: "▸";
    }

    .guideLocalTocBody {
      max-height: min(34vh, 260px);
      overflow: auto;
      padding: 8px 12px 10px;
    }

    .guideLocalTocList {
      display: grid;
      gap: 2px;
    }

    .guideLocalTocH2Row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 4px;
      align-items: center;
    }

    .guideLocalTocButton,
    .guideLocalTocToggle {
      min-height: 28px;
      line-height: 1.35;
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--guide-button-fg);
      background: transparent;
      cursor: pointer;
    }

    .guideLocalTocButton {
      display: block;
      width: 100%;
      padding: 4px 7px;
      text-align: left;
    }

    .guideLocalTocToggle {
      width: 1.8em;
      min-height: 28px;
      padding: 3px 4px;
      text-align: center;
      opacity: 0.85;
    }

    .guideLocalTocToggleSpacer {
      width: 1.8em;
      min-height: 28px;
    }

    .guideLocalTocButton:hover,
    .guideLocalTocToggle:hover {
      background: var(--guide-button-hover);
    }

    .guideLocalTocGroup {
      display: grid;
      gap: 1px;
    }

    .guideLocalTocToggle::before {
      content: "▸";
    }

    .guideLocalTocGroup.isOpen .guideLocalTocToggle::before {
      content: "▾";
    }

    .guideLocalTocChildren[hidden] {
      display: none;
    }

    .guideLocalTocChildren {
      display: grid;
      gap: 1px;
      margin: 1px 0 5px 1.8em;
      padding-left: 8px;
      border-left: 1px solid var(--guide-border);
    }

    .guideLocalTocButton.isH2 {
      font-weight: 650;
      color: var(--guide-fg);
    }

    .guideLocalTocButton.isH3 {
      position: relative;
      margin-left: 6px;
      padding-left: 14px;
      font-size: 0.9em;
      opacity: 0.82;
    }

    .guideLocalTocButton.isH3::before {
      content: "";
      position: absolute;
      left: 4px;
      top: 50%;
      width: 4px;
      height: 4px;
      border-radius: 999px;
      background: var(--guide-muted);
      opacity: 0.65;
      transform: translateY(-50%);
    }

    .guideHeadingAnchor {
      scroll-margin-top: 18px;
    }

    .guideContent p {
      margin: 0 0 14px;
    }

    .guideContent ul,
    .guideContent ol {
      margin: 0 0 16px;
      padding-left: 1.4em;
    }

    .guideContent li {
      margin: 0 0 6px;
    }

    .guideContent code {
      padding: 0.1em 0.35em;
      border-radius: 4px;
      background: var(--guide-code-bg);
      font-family: var(--vscode-editor-font-family);
    }

    .guideEmpty {
      color: var(--guide-muted);
    }

    @media (max-width: 760px) {
      .guideRoot {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .guideSide {
        border-right: none;
        border-bottom: 1px solid var(--guide-border);
        max-height: 42vh;
      }

      .guideNav {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 5px;
      }

      .guideNavButton {
        margin: 0;
      }

      .guideToolbar {
        align-items: stretch;
        flex-direction: column;
      }

      .guideSearch {
        width: 100%;
      }

      .guideContentWrap {
        padding: 18px 16px 40px;
      }
    }
  </style>
</head>
<body>
  <div class="guideRoot">
    <aside class="guideSide">
      <div class="guideSideHeader">
        <h1 class="guideTitle">もじごとガイド</h1>
        <p class="guideLead">使い方・設定・困ったときの案内</p>
      </div>

      <nav class="guideNav" id="guideNav" aria-label="ガイド目次">
        ${navHtml}
      </nav>
    </aside>

    <main class="guideMain">
      <div class="guideToolbar">
        <div class="guideCurrentTitle" id="guideCurrentTitle"></div>
        <input
          class="guideSearch"
          id="guideSearch"
          type="search"
          placeholder="目次や本文を絞り込み"
          aria-label="目次や本文を絞り込み"
        />
      </div>

      <div class="guideContentWrap" id="guideContentWrap">
        <article class="guideContent" id="guideContent"></article>
      </div>
    </main>
  </div>

  <script nonce="${nonce}">
    const sections = ${sectionsJson};
    let currentSectionId = ${JSON.stringify(safeInitialSectionId)};

    const navEl = document.getElementById("guideNav");
    const contentEl = document.getElementById("guideContent");
    const contentWrapEl = document.getElementById("guideContentWrap");
    const titleEl = document.getElementById("guideCurrentTitle");
    const searchEl = document.getElementById("guideSearch");

    function getSection(sectionId) {
      return sections.find((section) => section.id === sectionId) || sections[0];
    }

    function buildLocalToc(section) {
      if (!section) {
        return;
      }

      const headings = Array.from(contentEl.querySelectorAll("h2, h3")).filter(
        (heading) => {
          return String(heading.textContent || "").trim();
        },
      );

      if (headings.length < 2) {
        return;
      }

      const items = headings.map((heading, index) => {
        const id = heading.id || makeHeadingId(section.id, index);
        heading.id = id;
        heading.classList.add("guideHeadingAnchor");

        const tag = String(heading.tagName || "").toLowerCase();
        const text = String(heading.textContent || "").trim();

        return {
          id,
          text,
          tag,
        };
      });

      const hasH3 = items.some((item) => item.tag === "h3");

      const toc = document.createElement("div");
      toc.className = "guideLocalToc";

      if (!hasH3) {
        toc.innerHTML =
          '<details class="guideLocalTocRoot">' +
            '<summary class="guideLocalTocRootSummary">この項目の目次</summary>' +
            '<div class="guideLocalTocBody">' +
              '<div class="guideLocalTocList">' +
                items
                  .map((item) => {
                    return (
                      '<button type="button" class="guideLocalTocButton isH2" data-guide-heading-id="' +
                      escapeHtml(item.id) +
                      '">' +
                      escapeHtml(item.text) +
                      "</button>"
                    );
                  })
                  .join("") +
              "</div>" +
            "</div>" +
          "</details>";
      } else {
        const groups = [];
        let currentGroup = null;

        for (const item of items) {
          if (item.tag === "h2") {
            currentGroup = {
              heading: item,
              children: [],
            };
            groups.push(currentGroup);
            continue;
          }

          if (item.tag === "h3") {
            if (!currentGroup) {
              currentGroup = {
                heading: null,
                children: [],
              };
              groups.push(currentGroup);
            }

            currentGroup.children.push(item);
          }
        }

        toc.innerHTML =
          '<details class="guideLocalTocRoot">' +
            '<summary class="guideLocalTocRootSummary">この項目の目次</summary>' +
            '<div class="guideLocalTocBody">' +
              '<div class="guideLocalTocList">' +
                groups
                  .map((group, index) => {
                    if (!group.heading) {
                      return group.children
                        .map((child) => {
                          return (
                            '<button type="button" class="guideLocalTocButton isH3" data-guide-heading-id="' +
                            escapeHtml(child.id) +
                            '">' +
                            escapeHtml(child.text) +
                            "</button>"
                          );
                        })
                        .join("");
                    }

                    const childrenHtml = group.children.length
                      ? '<div class="guideLocalTocChildren" hidden>' +
                        group.children
                          .map((child) => {
                            return (
                              '<button type="button" class="guideLocalTocButton isH3" data-guide-heading-id="' +
                              escapeHtml(child.id) +
                              '">' +
                              escapeHtml(child.text) +
                              "</button>"
                            );
                          })
                          .join("") +
                        "</div>"
                      : "";

                    const groupId = "guide-toc-group-" + String(section.id || "section") + "-" + index;

                    return (
                      '<div class="guideLocalTocGroup" id="' +
                      escapeHtml(groupId) +
                      '">' +
                        '<div class="guideLocalTocH2Row">' +
                          (
                            group.children.length
                              ? '<button type="button" class="guideLocalTocToggle" data-guide-toc-toggle="' +
                                escapeHtml(groupId) +
                                '" title="下位目次を開閉"></button>'
                              : '<span class="guideLocalTocToggleSpacer"></span>'
                          ) +
                          '<button type="button" class="guideLocalTocButton isH2" data-guide-heading-id="' +
                          escapeHtml(group.heading.id) +
                          '">' +
                          escapeHtml(group.heading.text) +
                          "</button>" +
                        "</div>" +
                        childrenHtml +
                      "</div>"
                    );
                  })
                  .join("") +
              "</div>" +
            "</div>" +
          "</details>";
      }

      const firstHeading = contentEl.querySelector("h1");
      if (firstHeading && firstHeading.nextSibling) {
        firstHeading.parentNode.insertBefore(toc, firstHeading.nextSibling);
      } else {
        contentEl.insertBefore(toc, contentEl.firstChild);
      }

      toc.querySelectorAll("[data-guide-heading-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const headingId = button.getAttribute("data-guide-heading-id") || "";
          const target = headingId ? document.getElementById(headingId) : null;
          if (!target) return;

          target.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      });

      toc.querySelectorAll("[data-guide-toc-toggle]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const id = button.getAttribute("data-guide-toc-toggle") || "";
          const group = id ? document.getElementById(id) : null;
          if (!group) return;

          const children = group.querySelector(".guideLocalTocChildren");
          if (!children) return;

          const nextOpen = children.hidden;
          children.hidden = !nextOpen;
          group.classList.toggle("isOpen", nextOpen);
        });
      });
    }

    function selectSection(sectionId) {
      const section = getSection(sectionId);
      if (!section) {
        contentEl.innerHTML = '<p class="guideEmpty">表示できるガイド項目がありません。</p>';
        titleEl.textContent = "";
        return;
      }

      currentSectionId = section.id;
      titleEl.textContent = section.title;
      contentEl.innerHTML = section.body;
      buildLocalToc(section);
      contentWrapEl.scrollTop = 0;

      navEl.querySelectorAll("[data-section-id]").forEach((button) => {
        button.classList.toggle("isActive", button.dataset.sectionId === section.id);
      });
    }

    function escapeHtml(text) {
      return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function makeHeadingId(sectionId, index) {
      return "guide-heading-" + String(sectionId || "section") + "-" + index;
    }

    function stripHtml(value) {
      return String(value || "").replace(/<[^>]*>/g, " ");
    }

    function filterNav(keyword) {
      const normalized = String(keyword || "").trim().toLowerCase();

      navEl.querySelectorAll("[data-section-id]").forEach((button) => {
        const sectionId = button.dataset.sectionId;
        const section = getSection(sectionId);

        const haystack = section
          ? \`\${section.title} \${stripHtml(section.body)}\`.toLowerCase()
          : "";

        button.hidden = Boolean(normalized && !haystack.includes(normalized));
      });
    }

    navEl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-section-id]");
      if (!button) return;

      selectSection(button.dataset.sectionId);
    });

    searchEl.addEventListener("input", () => {
      filterNav(searchEl.value);
    });

    window.addEventListener("message", (event) => {
      const message = event.data || {};
      if (message.type === "selectSection" && message.sectionId) {
        selectSection(message.sectionId);
      }
    });

    selectSection(currentSectionId);
  </script>
</body>
</html>`;
}

module.exports = {
  openGuideWebview,
};
