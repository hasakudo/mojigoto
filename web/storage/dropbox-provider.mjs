const API = "https://api.dropboxapi.com/2";
const CONTENT_API = "https://content.dropboxapi.com/2";
export const DROPBOX_ROOT_ID = "dropbox:root";

export class DropboxConflictError extends Error {
  constructor(message = "別の端末でファイルが更新されています。") {
    super(message);
    this.name = "DropboxConflictError";
    this.code = "conflict";
  }
}

function normalizeItem(item) {
  const folder = item[".tag"] === "folder";
  const path = item.path_lower || item.path_display || "";
  const parent = path.slice(0, path.lastIndexOf("/"));
  return { ...item, folder: folder ? {} : undefined,
    file: folder ? undefined : { mimeType: "text/plain" }, size: Number(item.size || 0),
    lastModifiedDateTime: item.server_modified || "", eTag: item.rev || "",
    parentReference: { id: parent || DROPBOX_ROOT_ID } };
}

function pathFor(item) {
  const id = typeof item === "object" ? item?.id : item;
  if (id === DROPBOX_ROOT_ID) return "";
  if (!id) throw new Error("Dropboxのファイルまたはフォルダを確認できませんでした。");
  return String(id);
}

// HTTPヘッダーはASCIIで送り、日本語のファイル名はJSONのUnicodeエスケープにする。
function headerJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function containsConflict(error) {
  if (!error || typeof error !== "object") return false;
  return error[".tag"] === "conflict" || Object.values(error).some(containsConflict);
}

export class DropboxProvider {
  constructor(auth, fetchImpl = globalThis.fetch) {
    this.auth = auth;
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  async request(url, options) {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error("Dropboxの接続期限が切れました。もう一度接続してください。");
    const response = await this.fetchImpl(url, { ...options,
      headers: { Authorization: `Bearer ${token}`, ...options?.headers } });
    if (!response.ok) {
      let body;
      try { body = await response.json(); } catch {}
      if (response.status === 409 && containsConflict(body?.error)) throw new DropboxConflictError();
      const error = new Error(response.status === 401 ? "Dropboxの接続期限が切れました。もう一度接続してください。"
        : response.status === 403 ? "Dropboxへのアクセスが拒否されました。アプリの読み書き権限を確認してください。"
        : response.status === 429 ? "Dropboxへの通信が集中しています。少し待ってからもう一度お試しください。"
        : `Dropboxのファイル操作に失敗しました (${response.status})。`);
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async rpc(route, args) {
    const response = await this.request(`${API}/${route}`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
    return response.json();
  }

  async getRoot() { return { id: DROPBOX_ROOT_ID, name: "Dropbox", folder: {} }; }

  async listChildren(folderId) {
    let page = await this.rpc("files/list_folder", { path: pathFor(folderId), recursive: false, include_deleted: false });
    const items = [...page.entries];
    while (page.has_more) {
      page = await this.rpc("files/list_folder/continue", { cursor: page.cursor });
      items.push(...page.entries);
    }
    // list_folder returns direct children; its path-based parent differs from a stable id: ID.
    // Use the requested parent identity, including for continuation pages, without another request.
    return items.filter((item) => item[".tag"] !== "deleted").map((item) => ({
      ...normalizeItem(item), parentReference: { id: folderId },
    }));
  }

  async getItemMetadata(item) {
    if (pathFor(item) === "") return this.getRoot();
    return normalizeItem(await this.rpc("files/get_metadata", { path: pathFor(item) }));
  }

  async readText(item) {
    const response = await this.request(`${CONTENT_API}/files/download`, { method: "POST",
      headers: { "Dropbox-API-Arg": headerJson({ path: pathFor(item) }) } });
    return response.text();
  }

  async upload(path, content, mode) {
    const response = await this.request(`${CONTENT_API}/files/upload`, { method: "POST",
      headers: { "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": headerJson({ path, mode, autorename: false, strict_conflict: true }) },
      body: new TextEncoder().encode(String(content ?? "")) });
    return normalizeItem(await response.json());
  }

  async writeText(item, content, expectedETag = "") {
    const rev = String(expectedETag || item?.eTag || "").trim();
    if (!rev) throw new Error("Dropboxの保存前の版情報がありません。下書きをコピーしてから最新版を読み直してください。");
    return this.upload(pathFor(item), content, { ".tag": "update", update: rev });
  }

  async childPath(parent, name) {
    if (!name || /[\\/]/.test(name) || [".", ".."].includes(name)) throw new Error("ファイル名またはフォルダ名を確認してください。");
    const metadata = await this.getItemMetadata(parent);
    if (!metadata.folder) throw new Error("Dropboxの保存先フォルダを確認してください。");
    if (metadata.id !== DROPBOX_ROOT_ID && !metadata.path_display && !metadata.path_lower) {
      throw new Error("Dropboxの保存先フォルダのパスを確認できませんでした。");
    }
    return `${metadata.path_display || metadata.path_lower || ""}/${name}`;
  }

  async createTextFile(parent, name, content = "") {
    return this.upload(await this.childPath(parent, name), content, { ".tag": "add" });
  }

  async createFolder(parent, name) {
    const existing = (await this.listChildren(parent.id)).find((item) => item.folder && item.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const result = await this.rpc("files/create_folder_v2", { path: await this.childPath(parent, name), autorename: false });
    return normalizeItem({ ...result.metadata, ".tag": "folder" });
  }

  async deleteItem(item) { await this.rpc("files/delete_v2", { path: pathFor(item) }); }

  async renameItem(item, name) {
    const path = String(item.path_display || item.path_lower || "");
    if (!path.startsWith("/")) throw new Error("名前変更前のパスを確認できませんでした。");
    if (item.name !== name && item.name.toLowerCase() === name.toLowerCase()) {
      throw new Error("Dropboxでは大文字・小文字だけの名前変更はできません。別の名前に変更してからお試しください。");
    }
    const target = path.slice(0, path.lastIndexOf("/") + 1) + name;
    const result = await this.rpc("files/move_v2", { from_path: pathFor(item), to_path: target, autorename: false });
    return normalizeItem(result.metadata);
  }

  async moveItem(item, destinationFolder) {
    const current = await this.getItemMetadata(item);
    const target = await this.childPath(destinationFolder, current.name);
    if (current.path_lower === target.toLowerCase()) return current;
    const result = await this.rpc("files/move_v2", { from_path: pathFor(item), to_path: target, autorename: false });
    return normalizeItem(result.metadata);
  }
}
