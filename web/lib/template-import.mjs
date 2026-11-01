import { parseMarkdownImport } from "./note-markdown.mjs";
import { createNote, normalizeNote } from "./notes.mjs";
import { decode, restoreHeadings, validateParsedIds, verifyGeneratedMarkdown, applyDetails } from "./generated-note-markdown.mjs";

export const TEMPLATE_FILE_LIMIT = 10 * 1024 * 1024;

export function templatePreviewText(content) {
  // Only build the beginning, even when the selected file is several MB.
  const limit = 800;
  let text = "";
  if (content.note) {
    if (content.generated?.version >= 4) {
      text += `画像の関連付け：${content.note.groups.reduce((n, group) => n + group.images.length, 0)}件（画像ファイルは含みません）\n`;
      text += `作品の呼び名一覧：${content.note.importedAddressBook?.book.characters.length || 0}人（既存の一覧を優先）\n`;
    }
    outer: for (const group of content.note.groups) {
      text += `大分類：${group.title}\n`;
      if (text.length > limit) break;
      for (const item of group.items) {
        text += item.kind === "divider"
          ? `区分：${item.label}\n${item.value ? `補足：${item.value.slice(0, limit + 1)}\n` : ""}`
          : `項目：${item.heading}\n${item.body.slice(0, limit + 1)}\n`;
        if (content.generated?.version >= 3 || item.memo) {
          if (item.headingRuby) text += `ふりがな：${item.headingRuby}\n`;
          if (item.memo?.body) text += `項目メモ：${item.memo.body.slice(0, limit + 1)}\n`;
          if (item.memo?.tags?.length) text += `タグ：${item.memo.tags.join(" / ")}\n`;
          if (item.relatedReferences?.length) text += `関連リンク：${item.relatedReferences.length}件\n`;
        }
        if (text.length > limit) break outer;
      }
    }
  } else {
    text = content.text.slice(0, limit + 1);
  }
  const lines = text.slice(0, limit).split(/\r?\n/);
  const shortened = text.length > limit || lines.length > 12;
  return lines.slice(0, 12).join("\n").trimEnd() + (shortened ? "\n…（以下省略）" : "");
}

export async function readTemplateFile(file, kind, noteType = "plot") {
  const extension = /\.(md|txt)$/i.exec(file?.name || "")?.[0].toLowerCase();
  if (!extension || (kind === "note" && extension !== ".md")) {
    throw new Error(kind === "note" ? "Markdown（.md）を選択してください。" : "テキスト（.txt）かMarkdown（.md）を選択してください。");
  }
  if (file.size > TEMPLATE_FILE_LIMIT) throw new Error("10MB以下のファイルを選択してください。");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error("UTF-8で読み込めませんでした。元のファイルをUTF-8形式で保存して選び直してください。");
  }
  if (text.includes("\uFFFD")) throw new Error("文字化けの可能性がある文字が含まれています。元のファイルの文字コードを確認してください。");
  if (!text.trim()) throw new Error("読み込める内容がありません。");
  let title = file.name.replace(/\.(md|txt)$/i, "");
  if (kind === "manuscript") return { sourceName: file.name, title, extension, text };
  const generated = decode(text);
  if (generated) {
    await verifyGeneratedMarkdown(generated);
    text = generated.body;
    title = generated.metadata.title || title;
  }
  const parsed = parseMarkdownImport(text, { fileName: file.name, noteType, readItemMemos: !generated });
  if (!parsed.ok) throw new Error(parsed.error.message);
  if (generated) restoreHeadings(parsed.parsedNote.groups);
  const note = createNote(noteType, title);
  note.groups = parsed.parsedNote.groups.map(({ importMeta, ...group }) => ({
    ...group, items: group.items.map(({ importMeta, ...item }) => item),
  }));
  if (generated) { validateParsedIds(generated.metadata, note); applyDetails(generated.metadata, note); }
  return { sourceName: file.name, title, text, note: normalizeNote(note, noteType), preview: parsed.previewData, generated: generated?.metadata || null };
}

// A dialog owns one draft. Reading/cancelling never writes to the provider.
// Keep a successful create result across failures in opening/indexing so retry
// opens the same item instead of creating a second file.
export class NewDocumentDraft {
  constructor(isCurrent = () => true) {
    this.isCurrent = isCurrent;
    this.active = true;
    this.busy = false;
    this.reading = false;
    this.revision = 0;
    this.content = null;
    this.created = null;
  }
  current() { return this.active && this.isCurrent(); }
  cancel() { this.active = false; this.revision += 1; }
  clear() {
    if (this.busy || this.created) return;
    this.revision += 1;
    this.reading = false;
    this.content = null;
  }
  async read(file, kind, noteType, inspect = async (content) => content) {
    if (!this.current() || this.busy || this.created) return false;
    const revision = ++this.revision;
    this.reading = true;
    try {
      const parsed = await readTemplateFile(file, kind, noteType);
      if (!this.current() || revision !== this.revision) return false;
      const content = await inspect(parsed);
      if (!this.current() || revision !== this.revision) return false;
      this.content = content;
      return true;
    } catch (error) {
      if (!this.current() || revision !== this.revision) return false;
      throw error;
    } finally {
      if (revision === this.revision) this.reading = false;
    }
  }
  async submit({ prepare, create, open }) {
    if (this.busy || this.reading) return false;
    if (!this.current()) throw new Error("作品・保存先が変わりました。新規作成を開き直してください。");
    this.busy = true;
    try {
      if (!this.created) {
        const plan = await prepare(this.content);
        if (!this.current()) throw new Error("作品・保存先が変わったため、処理を中止しました。");
        this.created = await create(plan);
      }
      if (!this.current()) throw new Error(`「${this.created.item.name}」は${!this.created.operation || this.created.operation === "new" ? "作成済み" : "処理済み"}です。元の作品の一覧から開いてください。`);
      await open(this.created);
      return true;
    } finally {
      this.busy = false;
    }
  }
}
