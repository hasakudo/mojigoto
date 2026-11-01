// Pure rendering helpers shared by the editor and its read-only display tabs.
function createNoteDisplayRenderer() {
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
  function text(value, query = "") {
    const source = String(value ?? "");
    const needle = String(query || "").toLowerCase();
    if (!needle) return escape(source);
    // Match original characters so case conversion cannot shift source offsets.
    const chars = Array.from(source);
    let result = "";
    for (let i = 0; i < chars.length;) {
      let candidate = "", end = i;
      while (end < chars.length && candidate.length < needle.length) candidate += chars[end++].toLowerCase();
      if (candidate === needle) {
        result += `<mark class="noteSearchMatch">${escape(chars.slice(i, end).join(""))}</mark>`;
        i = end;
      } else result += escape(chars[i++]);
    }
    return result;
  }
  // Only accepts HTML generated here; attributes and ruby structure stay untouched.
  function highlightRendered(html, query) {
    if (!query) return html;
    return html.split(/(<[^>]*>)/g).map(part => part.startsWith("<") ? part : text(
      part.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[entity]), query,
    )).join("");
  }
  function body(value, query = "") {
    const html = escape(value)
      .replace(/《《([^《]*?)》》/g, '<span class="previewSideDots">$1</span>')
      .replace(/[|｜]([^《<]+)《([^》<]*)》/g, "<ruby>$1<rt>$2</rt></ruby>")
      .replace(/\n/g, "<br>") || '<span class="muted">詳細未入力</span>';
    return value ? highlightRendered(html, query) : html;
  }
  function heading(item, query = "") {
    const name = text(item?.heading || "無題項目", query);
    return item?.headingRuby ? `<ruby>${name}<rt>${text(item.headingRuby, query)}</rt></ruby>` : name;
  }
  function related(count) {
    const number = Number(count);
    if (!Number.isSafeInteger(number) || number <= 0) return "";
    return `<span class="previewRelatedMarker" title="関連ノート ${number}件" aria-label="関連ノート ${number}件"><svg class="noteLinkIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 4 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/></svg>${number}</span>`;
  }
  function memo(item, editable = false, query = "") {
    if (!item?.memo?.body && !item?.memo?.tags?.length) return "";
    const tags = (item.memo.tags || []).map(tag => String(tag).replace(/^#+/, "").trim()).filter(Boolean);
    const tagsHtml = tags.length ? `<div class="noteMemoTags" aria-label="タグ">${tags.map(tag => `<span class="noteMemoTag">${text("#" + tag, query)}</span>`).join("")}</div>` : "";
    const edit = editable ? `<button type="button" class="previewMemoIcon" data-action="openPreviewItemMemo" data-item-id="${escape(item.id)}" title="項目メモを編集" aria-label="項目メモを編集">📝</button>` : "";
    return `<details class="noteDisplayMemo" data-display-key="memo:${escape(item.id)}"><summary>項目メモ${edit}</summary>${item.memo.body ? `<div>${body(item.memo.body, query)}</div>` : ""}${tagsHtml}</details>`;
  }
  function images(group) {
    const thumbnails = (group.images || []).filter((image) => image.webviewUri).map((image) =>
      `<figure><button type="button" class="noteDisplayThumbnail" aria-label="画像を拡大: ${escape(image.name || "ノート画像")}"><img src="${escape(image.webviewUri)}" alt="${escape(image.name || "ノート画像")}" title="${escape(image.name || "ノート画像")}" loading="lazy"></button></figure>`).join("");
    return thumbnails ? `<div class="noteDisplayImages" aria-label="大分類の画像">${thumbnails}</div>` : "";
  }
  function itemContent(item, board) {
    const count = Array.isArray(item.relatedReferences) ? item.relatedReferences.length : 0;
    if (item.kind === "divider") return `<section class="${board ? "noteBoardDivider" : "previewDivider"}"><h4>${escape(item.label || "区分")}${related(count)}</h4>${item.value ? `<p>${escape(item.value)}</p>` : ""}</section>`;
    const content = `<div class="previewBody">${body(item.body)}</div>${memo(item)}`;
    if (board) return `<details class="noteBoardCard isExpanded" data-display-key="item:${escape(item.id)}" open><summary>${heading(item)}${related(count)}</summary>${content}</details>`;
    return `<article class="previewItem"><h4>${heading(item)}${related(count)}</h4>${content}</article>`;
  }
  function groups(note, board = false) {
    return (note.groups || []).map((group, index) => {
      const items = Array.isArray(group.items) ? group.items : [];
      const content = items.map((item) => itemContent(item, board)).join("") || '<p class="muted">項目がありません。</p>';
      if (board) return `<section class="noteBoardColumn" data-display-key="group:${escape(group.id)}"><header class="noteBoardColumnHead"><h3>${escape(group.title || `大分類 ${index + 1}`)}</h3></header><div class="noteBoardColumnBody" data-display-scroll="${escape(group.id)}">${content}${images(group)}</div></section>`;
      return `<details class="previewGroup" data-display-key="group:${escape(group.id)}" open><summary>${escape(group.title || "無題大分類")}</summary><div class="previewItems">${content}${images(group)}</div></details>`;
    }).join("") || '<p class="muted">大分類がありません。</p>';
  }
  function toc(note) {
    return (note.groups || []).map(group => `<details open data-display-key="toc:${escape(group.id)}"><summary><button type="button" data-display-group="${escape(group.id)}">${escape(group.title || "無題大分類")}</button></summary><ul>${(group.items || []).map(item => `<li><button type="button" data-display-group="${escape(group.id)}" data-display-item="${escape(item.id)}">${item.kind === "divider" ? "区分: " + escape(item.label || "区分") : escape(item.heading || "無題項目")}</button></li>`).join("")}</ul></details>`).join("") || '<p class="muted">大分類がありません。</p>';
  }
  return { escape, text, body, heading, related, memo, groups, toc };
}

function getNoteDisplayRendererScript() {
  return `const noteDisplayRenderer = (${createNoteDisplayRenderer.toString()})();`;
}

module.exports = { createNoteDisplayRenderer, getNoteDisplayRendererScript };
