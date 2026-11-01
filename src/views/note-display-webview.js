const path = require("path");
const { registerRestorableWebview } = require("./shared/restored-webviews");
const { randomUUID } = require("crypto");
const { createNoteDisplayRenderer } = require("./note-webview/display-renderer");

const { getDisplayHtml } = require("./note-webview/display-html");

function fileKey(file) {
  const normalized = path.resolve(file);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isDisposedError(error) { return /webview.*disposed/i.test(String(error)); }
function postMessage(panel, message) {
  if (!panel) return false;
  try {
    const result = panel.webview.postMessage(message);
    result?.catch?.(error => { if (!isDisposedError(error)) console.warn("[mojigoto] note display notification failed", error); });
    return true;
  } catch (error) {
    if (!isDisposedError(error)) throw error;
    return false;
  }
}

class NoteDisplayManager {
  constructor({ vscode, css, getNonce, attachImages, getAssetsRoot, readNote, openEditor }) {
    Object.assign(this, { vscode, css, getNonce, attachImages, getAssetsRoot, readNote, openEditor });
    this.sources = new Map();
    this.views = new Map();
  }
  attach(panel, options) {
    const key = fileKey(options.filePath);
    const previous = this.sources.get(key);
    const source = { ...options, assetsRoot:options.assetsRoot || this.getAssetsRoot?.(options.workDir), panel, key, session:randomUUID(), incoming:0, sequence:previous?.sequence || 0,
      snapshot:previous?.snapshot || { note:options.note, dirty:false, warning:"" }, closed:false, editorReady:false, editorColumn:panel.viewColumn || previous?.editorColumn };
    this.sources.set(key, source);
    if (this.hasViews(key)) postMessage(panel, {type:"noteDisplay.request", session:source.session, active:true});
    return source.session;
  }
  hasViews(key) { return [...this.views.values()].some(view => view.key === key); }
  editorReady(panel) {
    const source = this.sources.get(fileKey(panel.__mojigotoFilePath));
    if (source?.panel !== panel || source.closed) return;
    source.session = randomUUID();
    source.incoming = 0;
    source.editorReady = true;
    if (this.hasViews(source.key)) postMessage(panel, {type:"noteDisplay.request", session:source.session, active:true});
    if (source.pendingFocus) { postMessage(panel, {type:"noteDisplay.focus", target:source.pendingFocus}); source.pendingFocus = null; }
  }
  captureDraft(panel, note) {
    const source = this.sources.get(fileKey(panel.__mojigotoFilePath));
    if (source?.panel !== panel || source.closed || !Array.isArray(note?.groups)) return;
    source.snapshot = { ...source.snapshot, note:{title:String(note.title || ""), type:source.type, groups:note.groups}, dirty:true };
  }
  setDirty(panel, dirty) {
    const source = this.sources.get(fileKey(panel.__mojigotoFilePath));
    if (source?.panel !== panel || source.closed) return;
    source.snapshot.dirty = dirty;
  }
  accept(panel, message) {
    const key = fileKey(panel.__mojigotoFilePath);
    const source = this.sources.get(key);
    if (!source || source.panel !== panel || source.session !== message.session || source.closed) return false;
    if (!Number.isSafeInteger(message.sequence) || message.sequence <= source.incoming) return false;
    if (!message.note || !Array.isArray(message.note.groups)) return false;
    source.incoming = message.sequence;
    source.snapshot = { note:{ title:String(message.note.title || ""), type:source.type, groups:message.note.groups },
      dirty:message.dirty === true, warning:String(message.warning || "") };
    this.broadcast(source);
    return true;
  }
  send(view, source) {
    if (!view.ready || !source) return;
    try {
    // The source fixes identity and resource roots; a client snapshot cannot change them.
    const note = { ...source.snapshot.note, filePath:source.filePath, workDir:source.workDir,
      workTitle:source.workTitle, workName:source.workName };
    const assetsRoot = source.assetsRoot;
    note.groups = (note.groups || []).map(group => ({ ...group, images:(group.images || []).filter(image => {
      const relative = String(image.relativePath || "");
      const resolved = path.relative(assetsRoot, path.resolve(assetsRoot, relative));
      return relative && !path.isAbsolute(relative) && resolved !== ".." && !resolved.startsWith(".." + path.sep) && !path.isAbsolute(resolved);
    }) }));
    const payload = this.attachImages(note, view.panel, source.workDir, assetsRoot);
    view.panel.title = `${source.snapshot.dirty ? "● " : ""}${note.title || "無題ノート"} / ${view.mode === "board" ? "ボード" : "プレビュー"}`;
    if (!postMessage(view.panel, {type:"noteDisplay.snapshot", note:payload, dirty:source.snapshot.dirty,
      warning:source.snapshot.warning, closed:source.closed, sequence:++source.sequence})) this.views.delete(view.id);
    } catch (error) {
      if (!isDisposedError(error)) throw error;
      this.views.delete(view.id);
    }
  }
  broadcast(source) {
    for (const view of this.views.values()) if (view.key === source.key) this.send(view, source);
  }
  open(panel, mode) {
    if (!["list", "board"].includes(mode)) return false;
    const key = fileKey(panel.__mojigotoFilePath), source = this.sources.get(key);
    if (!source || source.panel !== panel || source.closed) return false;
    const id = `${key}:${mode}`, existing = this.views.get(id);
    if (existing) {
      try { existing.panel.reveal(undefined, false); return true; }
      catch (error) { if (!isDisposedError(error)) throw error; this.views.delete(id); }
    }
    const target = this.vscode.window.createWebviewPanel("mojigoto.noteDisplay", "ノート表示", this.vscode.ViewColumn.Beside,
      {enableScripts:true, retainContextWhenHidden:true, localResourceRoots:[this.vscode.Uri.file(source.assetsRoot)]});
    this.bindView(target, source, mode);
    return true;
  }
  bindView(target, source, mode) {
    const key = source.key, id = `${key}:${mode}`;
    const view = {id, panel:target, key, mode, ready:false};
    this.views.set(id, view);
    target.webview.onDidReceiveMessage(message => {
      if (message?.type === "noteDisplay.navigate") return this.navigate(view, message);
      if (message?.type !== "noteDisplay.ready") return;
      view.ready = true;
      const current = this.sources.get(key);
      if (current) postMessage(target, {type:"noteDisplay.identity", identity:{version:1, filePath:current.filePath,
        type:current.type, mode, workName:current.workName, workTitle:current.workTitle}});
      if (current?.closed) this.send(view, current);
      else postMessage(current?.panel, {type:"noteDisplay.request", session:current.session, active:true});
    });
    target.onDidDispose(() => {
      if (this.views.get(id) !== view) return;
      this.views.delete(id);
      const current = this.sources.get(key);
      if (!this.hasViews(key)) {
        if (!current?.closed) postMessage(current?.panel, {type:"noteDisplay.request", session:current.session, active:false});
        else this.sources.delete(key);
      }
    });
    target.webview.html = getDisplayHtml({webview:target.webview, css:this.css, nonce:this.getNonce(), mode});
    // VS Code owns the panel lifetime, including serialization on shutdown.
    // Only the serializer registration belongs in extension subscriptions.
    return view;
  }
  registerSerializer(context, treeProvider) {
    return registerRestorableWebview(this.vscode, "mojigoto.noteDisplay", {
      deserializeWebviewPanel:(panel, state) => this.restore(context, treeProvider, panel, state),
    });
  }
  async restore(context, treeProvider, panel, state) {
    let disposed = false;
    const guard = panel.onDidDispose(() => { disposed = true; });
    try {
      if (state?.version !== 1 || !["list","board"].includes(state.mode) || typeof state.filePath !== "string" || !path.isAbsolute(state.filePath)) throw new Error("復元用の状態が見つかりません。元ノートから「別タブ」を実行してください。");
      const filePath = path.normalize(state.filePath), folder = path.dirname(filePath), assetsRoot = path.dirname(folder);
      const type = path.basename(folder) === "plots" ? "plot" : path.basename(folder) === "references" ? "reference" : "";
      if (!type || state.type !== type || path.basename(assetsRoot) !== ".mojigoto" || path.extname(filePath).toLowerCase() !== ".json") throw new Error("ノートの保存先を確認できません。元ノートから開き直してください。");
      const key = fileKey(filePath);
      const options = {context, treeProvider, key, filePath, type, assetsRoot, workDir:path.dirname(assetsRoot),
        workName:String(state.workName || ""), workTitle:String(state.workTitle || "")};
      const saved = await this.readNote(options);
      if (disposed) return;
      let source = this.sources.get(key);
      if (!source) {
        source = {...options, session:randomUUID(), incoming:0, sequence:0, closed:true, editorReady:false,
          snapshot:{note:saved, dirty:false, warning:""}};
        this.sources.set(key, source);
      }
      const existing = this.views.get(`${key}:${state.mode}`);
      if (existing) { panel.dispose(); return; }
      panel.webview.options = {enableScripts:true, localResourceRoots:[this.vscode.Uri.file(assetsRoot)]};
      this.bindView(panel, source, state.mode);
    } catch (error) {
      if (disposed || isDisposedError(error)) return;
      const escape = createNoteDisplayRenderer().escape;
      panel.title = "ノート表示の復元エラー";
      panel.webview.options = {enableScripts:false, localResourceRoots:[]};
      panel.webview.html = `<html lang="ja"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head><body><p>表示用ノートを復元できませんでした。</p><p>${escape(error.message || String(error))}</p><p>ファイルの場所を確認し、元ノートから開き直してください。</p></body></html>`;
    } finally { guard?.dispose?.(); }
  }
  async navigate(view, message) {
    if (this.views.get(view.id) !== view || view.navigating) return;
    view.navigating = true;
    try {
      let source = this.sources.get(view.key);
      if (!source) throw new Error("元ノートが見つかりません。");
      const target = {groupId:String(message.groupId || ""), itemId:String(message.itemId || "")};
      const note = source.closed ? await this.readNote(source) : source.snapshot.note;
      const group = (note.groups || []).find(group => group.id === target.groupId);
      if (!group || (target.itemId && !(group.items || []).some(item => item.id === target.itemId))) throw new Error("対象の項目が見つかりません。最新の目次を確認してください。");
      if (this.views.get(view.id) !== view) return;
      if (source.closed) {
        await this.openEditor(source);
        source = this.sources.get(view.key);
      }
      if (!source || source.closed) throw new Error("編集画面を開けませんでした。");
      source.panel.reveal(source.panel.viewColumn, false);
      if (source.editorReady) postMessage(source.panel, {type:"noteDisplay.focus", target});
      else source.pendingFocus = target;
      postMessage(view.panel, {type:"noteDisplay.navigationResult"});
    } catch (error) {
      postMessage(view.panel, {type:"noteDisplay.navigationResult", message:`編集位置を開けませんでした: ${error.message || String(error)}`});
    } finally { view.navigating = false; }
  }
  detach(panel) {
    const key = fileKey(panel.__mojigotoFilePath), source = this.sources.get(key);
    if (source?.panel !== panel) return;
    source.closed = true;
    this.broadcast(source);
    if (!this.hasViews(key)) this.sources.delete(key);
  }
  closeByPath(file) {
    const key = fileKey(file); let count = 0;
    for (const view of [...this.views.values()]) if (view.key === key) { view.panel.dispose(); count++; }
    this.sources.delete(key);
    return count;
  }
  closeUnderFolder(folder) {
    let count = 0;
    for (const source of [...this.sources.values()]) {
      const relative = path.relative(path.resolve(folder), path.resolve(source.filePath));
      if (relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))) count += this.closeByPath(source.filePath);
    }
    return count;
  }
}

module.exports = { NoteDisplayManager, getDisplayHtml };
