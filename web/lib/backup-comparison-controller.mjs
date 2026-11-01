import { selectDiffContext, summarizeLineDiff } from "./text-diff.mjs";
import { createBackupComparisonRows } from "./backup-comparison.mjs";
import { backupContentLabel, summarizeBackupContent } from "./backup-format.mjs";

export function createBackupComparisonController({
  state, elements, document, makeElement, currentBackupTarget, formatDate, backupReasonLabel, backupSourceLabel,
}) {
  function appendInlineDifference(target, value, counterpart) {
    const text = [...String(value ?? "")];
    const other = [...String(counterpart ?? "")];
    let prefix = 0;
    while (prefix < text.length && prefix < other.length && text[prefix] === other[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < text.length - prefix && suffix < other.length - prefix
      && text[text.length - suffix - 1] === other[other.length - suffix - 1]) suffix += 1;
    if (prefix) target.append(document.createTextNode(text.slice(0, prefix).join("")));
    const changedEnd = suffix ? text.length - suffix : text.length;
    const changed = text.slice(prefix, changedEnd).join("");
    if (changed) target.append(makeElement("mark", "diff-inline-change", changed));
    if (suffix) target.append(document.createTextNode(text.slice(text.length - suffix).join("")));
    if (!text.length) target.append(document.createTextNode(" "));
  }

  function renderManuscriptBackupDiff() {
    const summary = summarizeLineDiff(state.manuscriptBackupDiffRows);
    const differenceCount = summary.changed + summary.inserted + summary.deleted;
    elements.backupComparisonSummary.textContent = differenceCount
      ? `変更 ${summary.changed}行・追加 ${summary.inserted}行・削除 ${summary.deleted}行`
      : "差分はありません";
    elements.backupDiffPreviousButton.disabled = differenceCount === 0;
    elements.backupDiffNextButton.disabled = differenceCount === 0;
    elements.backupDiffViewToggle.disabled = differenceCount === 0;
    elements.backupDiffViewToggle.textContent = state.manuscriptBackupDiffShowAll ? "変更箇所のみ" : "全文表示";
    const visibleRows = selectDiffContext(state.manuscriptBackupDiffRows, {
      context: 3,
      showAll: state.manuscriptBackupDiffShowAll,
    });
    const nodes = visibleRows.map((row) => {
      if (row.type === "gap") {
        const gap = makeElement("button", "manuscript-diff-gap", `… ${row.omitted.toLocaleString("ja-JP")}行を省略（全文表示）`);
        gap.type = "button";
        gap.addEventListener("click", () => {
          state.manuscriptBackupDiffShowAll = true;
          renderManuscriptBackupDiff();
        });
        return gap;
      }
      const line = makeElement("div", `manuscript-diff-row is-${row.type}`);
      line.setAttribute("role", "row");
      if (row.type !== "equal") line.dataset.diffChange = "true";
      const oldNumber = makeElement("span", "manuscript-diff-number old-number", row.oldLine ?? "");
      const oldText = makeElement("span", "manuscript-diff-text old-text");
      const newNumber = makeElement("span", "manuscript-diff-number new-number", row.newLine ?? "");
      const newText = makeElement("span", "manuscript-diff-text new-text");
      if (row.type === "change") {
        appendInlineDifference(oldText, row.oldText, row.newText);
        appendInlineDifference(newText, row.newText, row.oldText);
      } else {
        oldText.textContent = row.oldText || " ";
        newText.textContent = row.newText || " ";
      }
      line.append(oldNumber, oldText, newNumber, newText);
      return line;
    });
    elements.backupComparisonDiff.replaceChildren(...nodes);
    state.manuscriptBackupDiffCursor = -1;
  }

  function moveManuscriptBackupDiff(direction) {
    const changes = [...elements.backupComparisonDiff.querySelectorAll("[data-diff-change='true']")];
    if (!changes.length) return;
    state.manuscriptBackupDiffCursor = (state.manuscriptBackupDiffCursor + direction + changes.length) % changes.length;
    const target = changes[state.manuscriptBackupDiffCursor];
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("is-current");
    setTimeout(() => target.classList.remove("is-current"), 1200);
  }

  function closeManuscriptBackupComparison() {
    state.manuscriptBackupComparisonEntry = null;
    state.manuscriptBackupComparisonStorage = null;
    elements.manuscriptBackupComparison.hidden = true;
    elements.manuscriptBackupList.hidden = false;
  }

  function showManuscriptBackupComparison(storage, entry, snapshot) {
    const target = currentBackupTarget();
    state.manuscriptBackupComparisonEntry = entry;
    state.manuscriptBackupComparisonStorage = storage;
    const previousLabel = backupContentLabel({ ...entry, contentSummary: summarizeBackupContent(snapshot.content, target.targetType) });
    const currentLabel = backupContentLabel({ targetType: target.targetType, characters: [...target.content].length, contentSummary: summarizeBackupContent(target.content, target.targetType) });
    elements.backupComparisonOldTitle.textContent = `${formatDate(entry.createdAt)}・${backupReasonLabel(entry.reason)}・${backupSourceLabel(entry.source)}・${previousLabel}`;
    elements.backupComparisonCurrentTitle.textContent = `現在の${target.label}・${currentLabel}`;
    state.manuscriptBackupDiffRows = createBackupComparisonRows(String(snapshot.content || ""), target.content, target.targetType);
    state.manuscriptBackupDiffShowAll = false;
    renderManuscriptBackupDiff();
    elements.manuscriptBackupComparison.hidden = false;
    elements.manuscriptBackupList.hidden = true;
    elements.manuscriptBackupComparison.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return { appendInlineDifference, renderManuscriptBackupDiff, moveManuscriptBackupDiff, closeManuscriptBackupComparison, showManuscriptBackupComparison };
}
