const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const ITEM_FIELDS = "id,name,mimeType,size,modifiedTime,version,parents";
// v3's version is a change counter, not an HTTP ETag. Use the v2 file
// resource only for guarded updates, where the actual ETag is available.
const DRIVE_WRITE_API = "https://www.googleapis.com/drive/v2";
const DRIVE_WRITE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v2";
const WRITE_FIELDS = "id,title,mimeType,fileSize,modifiedDate,version,etag,parents(id)";

export class GoogleDriveConflictError extends Error {
  constructor(message = "別の端末でファイルが更新されています。") {
    super(message);
    this.name = "GoogleDriveConflictError";
    this.code = "conflict";
  }
}

function normalizeItem(item = {}) {
  const folder = item.mimeType === FOLDER_MIME;
  return {
    ...item,
    folder: folder ? {} : undefined,
    file: folder ? undefined : { mimeType: item.mimeType || "text/plain" },
    size: Number(item.size || 0),
    lastModifiedDateTime: item.modifiedTime || "",
    eTag: String(item.version || ""),
    parentReference: item.parents?.[0] ? { id: item.parents[0] } : undefined,
  };
}

function escapeQueryValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class GoogleDriveProvider {
  constructor(auth, fetchImpl = globalThis.fetch) {
    this.auth = auth;
    this.requiresExplicitFileAccess = true;
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  async request(url, options = {}) {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error("Google Driveへ接続してください。");
    const response = await this.fetchImpl(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (!response.ok) {
      let message = `Google Driveエラー (${response.status})`;
      let code = "";
      try {
        const body = await response.json();
        code = String(body?.error?.errors?.[0]?.reason || body?.error?.status || "").trim();
        message = body?.error?.message || message;
      } catch {}
      if (response.status === 401) {
        this.auth.invalidateAccessToken?.(token);
        message = "Google Driveの接続期限が切れました。編集内容を保持したまま、画面の再接続ボタンから接続し直してください。";
      }
      if (response.status === 403) message = "Google Driveへのアクセスが拒否されました。Drive APIとGoogle Driveの読み書き権限を確認してください。";
      const error = new Error(message);
      error.status = response.status;
      error.code = code;
      throw error;
    }
    return response;
  }

  async getRoot() {
    const response = await this.request(`${DRIVE_API}/files/root?fields=${encodeURIComponent(ITEM_FIELDS)}`);
    return normalizeItem(await response.json());
  }

  async listChildren(folderId) {
    const query = `'${escapeQueryValue(folderId)}' in parents and trashed = false`;
    let pageToken = "";
    const items = [];
    do {
      const params = new URLSearchParams({
        q: query,
        fields: `nextPageToken,files(${ITEM_FIELDS})`,
        pageSize: "200",
        orderBy: "folder,name_natural",
        spaces: "drive",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await this.request(`${DRIVE_API}/files?${params}`);
      const page = await response.json();
      items.push(...(page.files || []).map(normalizeItem));
      pageToken = String(page.nextPageToken || "");
    } while (pageToken);
    return items;
  }

  async readText(itemOrId) {
    const id = typeof itemOrId === "object" ? itemOrId?.id : itemOrId;
    const response = await this.request(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`);
    return response.text();
  }

  async getItemMetadata(item) {
    const response = await this.request(
      `${DRIVE_API}/files/${encodeURIComponent(item?.id)}?fields=${encodeURIComponent(ITEM_FIELDS)}`,
    );
    return normalizeItem(await response.json());
  }

  async writeText(item, content, expectedETag = "") {
    const expected = String(expectedETag || item?.eTag || "").trim();
    if (!expected) throw new Error("Google Driveの保存前の版情報がありません。下書きをコピーしてから最新版を読み直してください。");
    const metadataResponse = await this.request(
      `${DRIVE_WRITE_API}/files/${encodeURIComponent(item?.id)}?fields=${encodeURIComponent(WRITE_FIELDS)}`,
      { cache: "no-store" },
    );
    const current = await metadataResponse.json();
    const version = String(current.version || "").trim();
    if (!version) throw new Error("Google Driveの保存前の版情報を確認できませんでした。");
    if (expected !== version) throw new GoogleDriveConflictError();
    const match = String(current.etag || "").trim();
    if (current.id !== item?.id || !/^"[\x21\x23-\x7e\x80-\xff]+"$/.test(match)) {
      throw new Error("Google Driveの条件付き保存に必要な版情報を確認できませんでした。");
    }
    try {
      const response = await this.request(
        `${DRIVE_WRITE_UPLOAD_API}/files/${encodeURIComponent(current.id)}?uploadType=media&fields=${encodeURIComponent(WRITE_FIELDS)}`,
        { method: "PUT", headers: { "Content-Type": "text/plain; charset=utf-8", "If-Match": match }, body: String(content ?? "") },
      );
      const saved = await response.json();
      return normalizeItem({
        ...saved, name: saved.title, size: saved.fileSize, modifiedTime: saved.modifiedDate,
        parents: saved.parents?.map((parent) => parent.id),
      });
    } catch (error) {
      if (error?.status === 409 || error?.status === 412) throw new GoogleDriveConflictError();
      throw error;
    }
  }

  async createTextFile(parentFolder, fileName, content = "") {
    const siblings = await this.listChildren(parentFolder?.id);
    if (siblings.some((item) => !item.folder && item.name === fileName)) {
      throw new GoogleDriveConflictError("同じ名前の原稿ファイルがすでにあります。");
    }
    const boundary = `mojigoto_${Date.now().toString(36)}`;
    const metadata = JSON.stringify({ name: String(fileName || "").trim(), parents: [parentFolder.id] });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${String(content ?? "")}\r\n--${boundary}--`;
    const response = await this.request(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent(ITEM_FIELDS)}`,
      { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    );
    return normalizeItem(await response.json());
  }

  async createFolder(parentFolder, folderName, { reuseExisting = true } = {}) {
    if (reuseExisting) {
      const children = await this.listChildren(parentFolder?.id);
      const existing = children.find((item) => item.folder && item.name === folderName);
      if (existing) return existing;
    }
    const response = await this.request(
      `${DRIVE_API}/files?fields=${encodeURIComponent(ITEM_FIELDS)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ name: String(folderName || "").trim(), mimeType: FOLDER_MIME, parents: [parentFolder.id] }),
      },
    );
    return normalizeItem(await response.json());
  }

  async createBinaryFile(parentFolder, fileName, file) {
    const boundary = `mojigoto_import_${Date.now().toString(36)}`;
    const metadata = JSON.stringify({ name: fileName, parents: [parentFolder.id] });
    const mimeType = file.type || "application/octet-stream";
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ]);
    const response = await this.request(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent(ITEM_FIELDS)}`,
      { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    );
    return normalizeItem(await response.json());
  }

  async deleteItem(item) {
    const itemId = String(item?.id || item || "").trim();
    if (!itemId) throw new Error("削除するファイルを確認できませんでした。");
    await this.request(`${DRIVE_API}/files/${encodeURIComponent(itemId)}`, { method: "DELETE" });
  }

  async renameItem(item, name) {
    const url = DRIVE_WRITE_API + "/files/" + encodeURIComponent(item.id) + "?fields=" + encodeURIComponent(WRITE_FIELDS);
    const response = await this.request(url, { cache: "no-store" });
    const current = await response.json();
    if (current.id !== item.id || current.title !== item.name || !current.version || String(current.version) !== String(item.eTag)) {
      throw new GoogleDriveConflictError("別の端末で更新されています。一覧を読み直してください。");
    }
    const match = String(current.etag || "");
    if (!/^"[\x21\x23-\x7e\x80-\xff]+"$/.test(match)) throw new Error("名前変更前の版情報を確認できませんでした。");
    try {
      const savedResponse = await this.request(url, {
        method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": match }, body: JSON.stringify({ title: name }),
      });
      const saved = await savedResponse.json();
      return normalizeItem({ ...saved, name: saved.title, size: saved.fileSize, modifiedTime: saved.modifiedDate,
        parents: saved.parents?.map((parent) => parent.id) });
    } catch (error) {
      if (error?.status === 409 || error?.status === 412) throw new GoogleDriveConflictError();
      throw error;
    }
  }

  async moveItem(item, destinationFolder) {
    const destinationId = String(destinationFolder?.id || "").trim();
    if (!destinationId) throw new Error("移動先フォルダを確認できませんでした。");
    const current = item?.parentReference?.id ? item : await this.getItemMetadata(item);
    const sourceId = String(current?.parentReference?.id || "").trim();
    if (sourceId === destinationId) return current;
    const params = new URLSearchParams({
      addParents: destinationId,
      fields: ITEM_FIELDS,
    });
    if (sourceId) params.set("removeParents", sourceId);
    try {
      const response = await this.request(
        `${DRIVE_API}/files/${encodeURIComponent(current.id)}?${params}`,
        { method: "PATCH", headers: { "Content-Type": "application/json; charset=utf-8" }, body: "{}" },
      );
      return normalizeItem(await response.json());
    } catch (error) {
      if (error?.status === 409 || error?.status === 412) {
        throw new GoogleDriveConflictError("移動先に同じ名前のファイルがあります。");
      }
      throw error;
    }
  }
}
