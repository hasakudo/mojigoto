// Shared by single-note and bundled HTML. Keep headings with the following
// content, while allowing long details and memos to use the rest of a page.
function notePrintStyle() {
  return `@media print {
    .noteEntry, .noteEntryBody, .noteItemMemo, .noteItemMemoBody,
    .dividerBlock, .dividerSupplement {
      break-inside: auto;
      page-break-inside: auto;
      orphans: 2;
      widows: 2;
      overflow-wrap: anywhere;
    }
    .dividerBlock, .dividerTitle, .noteEntryTitle, .noteItemMemoLabel {
      break-after: avoid-page;
      page-break-after: avoid;
    }
    .noteEntryBody, .noteItemMemoBody {
      box-decoration-break: slice;
      -webkit-box-decoration-break: slice;
    }
  }`;
}

module.exports = { notePrintStyle };
