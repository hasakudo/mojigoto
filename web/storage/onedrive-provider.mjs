const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const DOWNLOAD_SELECT = "id,name,file,remoteItem,parentReference,@microsoft.graph.downloadUrl";
const CHILDREN_SELECT = "id,name,folder,file,remoteItem,size,lastModifiedDateTime,eTag,cTag,parentReference,@microsoft.graph.downloadUrl";
const GRAPH_BATCH_LIMIT = 20;
const DOWNLOAD_CONCURRENCY = 6;

export class OneDriveConflictError extends Error {
  constructor(message = "別の端末でファイルが更新されています。") {
    super(message);
    this.name = "OneDriveConflictError";
    this.code = "conflict";
  }
}

function getDownloadUrl(item) {
  return String(
    item?.["@microsoft.graph.downloadUrl"] ||
    item?.["@content.downloadUrl"] ||
    item?.remoteItem?.["@microsoft.graph.downloadUrl"] ||
    item?.remoteItem?.["@content.downloadUrl"] ||
    "",
  ).trim();
}

function downloadTextWithXhr(url) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "text";
    request.overrideMimeType?.("text/plain; charset=utf-8");
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.responseText);
        return;
      }
      reject(new Error(`OneDriveのファイル内容を取得できませんでした (${request.status})`));
    };
    request.onerror = () => reject(new Error("OneDriveのダウンロード先へ通信できませんでした。"));
    request.ontimeout = () => reject(new Error("OneDriveのファイル取得がタイムアウトしました。"));
    request.timeout = 30000;
    request.send();
  });
}

export class OneDriveProvider {
  constructor(auth, fetchImpl = globalThis.fetch, { beginPerformanceMeasurement = () => () => {} } = {}) {
    this.auth = auth;
    this.beginPerformanceMeasurement = beginPerformanceMeasurement;
    this.freshWriteMetadata = new Map();
    // Window.fetch is an invocation-sensitive browser API. Binding it here
    // prevents `provider.fetchImpl()` from using the provider as `this`.
    this.fetchImpl = fetchImpl.bind(globalThis);
    this.supportsVersionedContentCache = true;
    this.supportsFolderContentTags = true;
    this.pendingListings = new Map();
    this.activeDownloads = 0;
    this.downloadWaiters = [];
  }

  async withDownloadSlot(task) {
    if (this.activeDownloads >= DOWNLOAD_CONCURRENCY) {
      await new Promise((resolve) => this.downloadWaiters.push(resolve));
    } else {
      this.activeDownloads += 1;
    }
    try {
      return await task();
    } finally {
      const next = this.downloadWaiters.shift();
      if (next) next();
      else this.activeDownloads -= 1;
    }
  }

  async request(url, options = {}) {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error("OneDriveへ接続してください。");
    const response = await this.fetchImpl(url.startsWith("http") ? url : `${GRAPH_ROOT}${url}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (!response.ok) {
      let message = `OneDriveエラー (${response.status})`;
      let code = "";
      try {
        const body = await response.json();
        code = String(body?.error?.code || "").trim();
        message = body?.error?.message || message;
      } catch {}
      if (response.status === 403) {
        message = `OneDriveへのアクセスが拒否されました。Microsoft Graphの委任されたアクセス許可 Files.ReadWrite と、ログイン時の同意を確認してください。${code ? ` (${code})` : ""}`;
      }
      const error = new Error(message);
      error.status = response.status;
      error.code = code;
      throw error;
    }
    return response;
  }

  async readCatalogDelta(root, link = "") {
    const drive = String(root?.parentReference?.driveId || "");
    if (!drive || !root?.id) throw new Error("差分の対象を確認できません。");
    const path = `/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(root.id)}/delta`;
    const validate = (value) => {
      if (typeof value !== "string" || !value || value.length > 32768) throw new Error("差分リンクを確認できません。");
      const url = new URL(value, GRAPH_ROOT + "/");
      // Never widen a selected folder to the entire drive, or forward auth off Graph.
      if (url.origin !== "https://graph.microsoft.com" || url.username || url.password || url.hash
        || !(url.pathname === "/v1.0" + path || url.pathname.startsWith("/v1.0" + path + "("))) {
        throw new Error("差分リンクの範囲を確認できません。");
      }
      return url.href;
    };
    let next = link ? validate(link) : `${GRAPH_ROOT}${path}?token=latest`;
    const visited = new Set();
    let changed = false, entries = 0;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      for (let pages = 1; pages <= 10; pages += 1) {
        if (visited.has(next)) throw new Error("差分の続きを確認できません。");
        visited.add(next);
        const response = await this.request(next, { signal: abort.signal });
        const page = await response.json();
        if (!Array.isArray(page?.value) || page.value.some(item => !item || typeof item.id !== "string" || !item.id)) {
          throw new Error("差分の応答を確認できません。");
        }
        entries += page.value.length;
        if (entries > 2000) throw new Error("差分の件数が上限を超えています。");
        changed ||= page.value.length > 0;
        const following = page["@odata.nextLink"], final = page["@odata.deltaLink"];
        if (Boolean(following) === Boolean(final)) throw new Error("差分の完了を確認できません。");
        if (final) return { changed, link: validate(final), pages };
        next = validate(following);
      }
      throw new Error("差分のページ数が上限を超えています。");
    } finally { clearTimeout(timer); }
  }

  async getProfile() {
    const response = await this.request("/me?$select=displayName,userPrincipalName");
    return response.json();
  }

  async getRoot() {
    const response = await this.request("/me/drive/root?$select=id,name,folder,parentReference");
    return response.json();
  }

  async listChildren(folderId) {
    const key = String(folderId);
    let pending = this.pendingListings.get(key);
    if (!pending) {
      pending = this.readChildren(folderId);
      this.pendingListings.set(key, pending);
    }
    try {
      // Only concurrent requests share a network operation, never completed data.
      return structuredClone(await pending);
    } finally {
      if (this.pendingListings.get(key) === pending) this.pendingListings.delete(key);
    }
  }

  async readChildren(folderId) {
    let next = `/me/drive/items/${encodeURIComponent(folderId)}/children?$select=${CHILDREN_SELECT}&$top=200`;
    const items = [], visited = new Set();
    while (next) {
      if (visited.has(next)) throw new Error("一覧の続きを確認できません。");
      visited.add(next);
      const response = await this.request(next);
      const page = await response.json();
      if (!Array.isArray(page?.value) || page.value.some(item => !item?.id)) throw new Error("一覧の応答を確認できません。");
      items.push(...page.value);
      next = page["@odata.nextLink"] || "";
    }
    return items;
  }

  async listChildrenBatch(folderIds) {
    return this.readChildrenBatch(folderIds);
  }

  // Speculative reads can address removed folders. Keep their failure separate
  // from current work listings; callers validate the current parent before use.
  async listChildrenBatchSettled(folderIds) {
    return this.readChildrenBatch(folderIds, true);
  }

  async readChildrenBatch(folderIds, settled = false) {
    const ids = [...new Set(folderIds.map((id) => String(id || "").trim()).filter(Boolean))];
    const childrenById = new Map();
    for (let offset = 0; offset < ids.length; offset += GRAPH_BATCH_LIMIT) {
      const chunk = ids.slice(offset, offset + GRAPH_BATCH_LIMIT);
      const requests = chunk.map((folderId, index) => ({
        id: String(index + 1), method: "GET",
        url: "/me/drive/items/" + encodeURIComponent(folderId) + "/children?$select=" + CHILDREN_SELECT + "&$top=200",
      }));
      const response = await this.request("/$batch", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requests }),
      });
      const payload = await response.json();
      const batchResponses = new Map((payload.responses || []).map((item) => [String(item.id), item]));
      await Promise.all(chunk.map(async (folderId, index) => {
        try {
          const result = batchResponses.get(String(index + 1));
          if (!result || result.status < 200 || result.status >= 300 || !Array.isArray(result.body?.value)) {
            if (settled) {
              const error = new Error("OneDriveのフォルダ一覧を取得できませんでした (" + (result?.status || "応答なし") + ")。");
              error.status = result?.status; error.code = result?.body?.error?.code || "";
              throw error;
            }
            childrenById.set(folderId, await this.listChildren(folderId));
            return;
          }
          if (result.body.value.some(item => !item?.id)) throw new Error("一覧の応答を確認できません。");
          const items = [...result.body.value];
          let next = result.body?.["@odata.nextLink"] || "";
          const visited = new Set();
          while (next) {
            if (visited.has(next)) throw new Error("一覧の続きを確認できません。");
            visited.add(next);
            const pageResponse = await this.request(next), page = await pageResponse.json();
            if (!Array.isArray(page?.value) || page.value.some(item => !item?.id)) throw new Error("一覧の続きを確認できません。");
            items.push(...page.value); next = page["@odata.nextLink"] || "";
          }
          childrenById.set(folderId, items);
        } catch (error) {
          if (!settled) throw error;
          childrenById.set(folderId, error);
        }
      }));
    }
    return childrenById;
  }

  async readText(itemOrId) {
    // `/content` responds with a 302. Browsers cannot follow that redirect
    // when the Graph request has an Authorization header because it triggers
    // a CORS preflight. Ask Graph for its short-lived preauthenticated URL,
    // then fetch that URL without an Authorization header instead.
    const sourceItem = typeof itemOrId === "object" && itemOrId
      ? itemOrId
      : { id: String(itemOrId || "") };
    const itemId = String(sourceItem.id || "").trim();
    let downloadUrl = getDownloadUrl(sourceItem);
    let metadata = sourceItem;

    if (!downloadUrl) {
      const driveId = String(sourceItem?.parentReference?.driveId || "").trim();
      const itemPath = driveId
        ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`
        : `/me/drive/items/${encodeURIComponent(itemId)}`;
      const metadataResponse = await this.request(`${itemPath}?select=${DOWNLOAD_SELECT}`);
      metadata = await metadataResponse.json();
      downloadUrl = getDownloadUrl(metadata);
    }

    if (!downloadUrl && metadata?.remoteItem?.id) {
      const remoteItem = metadata.remoteItem;
      const remoteDriveId = String(remoteItem?.parentReference?.driveId || "").trim();
      if (remoteDriveId) {
        const remoteResponse = await this.request(
          `/drives/${encodeURIComponent(remoteDriveId)}/items/${encodeURIComponent(remoteItem.id)}?select=${DOWNLOAD_SELECT}`,
        );
        const remoteMetadata = await remoteResponse.json();
        downloadUrl = getDownloadUrl(remoteMetadata);
      }
    }

    if (!downloadUrl) {
      const kind = metadata?.remoteItem ? "共有ファイル" : metadata?.file ? "ファイル" : "不明な項目";
      throw new Error(`OneDriveからダウンロードURLを取得できませんでした（種類: ${kind}）。`);
    }

    if (typeof XMLHttpRequest !== "undefined") {
      return this.withDownloadSlot(() => downloadTextWithXhr(downloadUrl));
    }

    // Node-based tests and non-browser runtimes do not provide XHR.
    return this.withDownloadSlot(async () => {
      const response = await this.fetchImpl(downloadUrl, { method: "GET" });
      if (!response.ok) throw new Error(`OneDriveのファイル内容を取得できませんでした (${response.status})`);
      return response.text();
    });
  }

  itemPath(item) {
    const itemId = String(item?.id || "").trim();
    const driveId = String(item?.parentReference?.driveId || "").trim();
    return driveId
      ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`
      : `/me/drive/items/${encodeURIComponent(itemId)}`;
  }

  // Reference discovery only: read .mojigoto and its children in the same request.
  // Missing/unsupported/failed expansions are omitted so discovery can use its normal path.
  async inspectReferenceFolders(folders) {
    const result = new Map();
    for (let offset = 0; offset < folders.length; offset += GRAPH_BATCH_LIMIT) {
      const chunk = folders.slice(offset, offset + GRAPH_BATCH_LIMIT);
      let replies;
      try {
        const response = await this.request("/$batch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: chunk.map((folder, index) => ({
            id: String(index + 1), method: "GET",
            url: this.itemPath(folder) + ":/.mojigoto?$select=id,name,folder,parentReference&$expand=children($select=" + CHILDREN_SELECT + ")",
          })) }),
        });
        const payload = await response.json();
        replies = new Map((payload.responses || []).map(reply => [String(reply.id), reply]));
      } catch { continue; }
      await Promise.all(chunk.map(async (folder, index) => {
        const reply = replies.get(String(index + 1)), body = reply?.body;
        if (!(reply?.status >= 200 && reply.status < 300) || !body?.id || !body.folder
          || body.name !== ".mojigoto" || body.parentReference?.id !== String(folder.id)
          || !Array.isArray(body.children)) return;
        try {
          let children = [...body.children], next = body["children@odata.nextLink"] || "";
          const visited = new Set();
          while (next) {
            if (visited.has(next)) throw new Error("一覧の続きを確認できません。");
            visited.add(next);
            const response = await this.request(next), page = await response.json();
            if (!Array.isArray(page.value)) throw new Error("一覧を確認できません。");
            children.push(...page.value); next = page["@odata.nextLink"] || "";
          }
          if (Number(body.folder.childCount) > children.length) children = await this.listChildren(body.id);
          const { children: _children, "children@odata.nextLink": _next, ...mojigoto } = body;
          result.set(String(folder.id), { mojigoto, children });
        } catch { /* Discovery will retry this folder using ordinary listings. */ }
      }));
    }
    return result;
  }

  // Read-only metadata batch; do not register these results as write preflight verification.
  async getItemMetadataBatch(items) {
    const results = new Map();
    for (let offset = 0; offset < items.length; offset += GRAPH_BATCH_LIMIT) {
      const chunk = items.slice(offset, offset + GRAPH_BATCH_LIMIT);
      let replies = new Map();
      try {
        const response = await this.request("/$batch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: chunk.map((item, index) => ({
            id: String(index + 1), method: "GET",
            url: this.itemPath(item) + "?select=id,name,folder,file,size,eTag,lastModifiedDateTime,parentReference,@microsoft.graph.downloadUrl",
          })) }),
        });
        const payload = await response.json();
        replies = new Map((payload.responses || []).map(reply => [String(reply.id), reply]));
      } catch { /* Individual reads preserve partial success and permission diagnostics. */ }
      await Promise.all(chunk.map(async (item, index) => {
        const reply = replies.get(String(index + 1));
        if (reply?.status >= 200 && reply.status < 300 && reply.body?.id === item.id) {
          results.set(item, reply.body);
        } else {
          try { results.set(item, await this.getItemMetadata(item)); }
          catch (error) { results.set(item, error); }
        }
      }));
    }
    return results;
  }

  async getItemMetadata(item) {
    const response = await this.request(
      `${this.itemPath(item)}?select=id,name,folder,file,size,eTag,lastModifiedDateTime,parentReference,@microsoft.graph.downloadUrl`,
    );
    const current = await response.json();
    // Share a just-completed verification only until this event-loop turn ends.
    const key = this.itemPath(item);
    const verification = { item: structuredClone(current), expiresAt: performance.now() + 50 };
    this.freshWriteMetadata.set(key, verification);
    setTimeout(() => {
      if (this.freshWriteMetadata.get(key) === verification) this.freshWriteMetadata.delete(key);
    }, 0);
    return current;
  }

  async writeText(item, content, expectedETag = "") {
    const expected = String(expectedETag || item?.eTag || "").trim();
    if (!expected) throw new Error("OneDriveの保存前の版情報がありません。下書きをコピーしてから最新版を読み直してください。");
    const finish = this.beginPerformanceMeasurement("OneDrive・既存ファイル書込");
    const key = this.itemPath(item);
    const checked = this.freshWriteMetadata.get(key);
    this.freshWriteMetadata.delete(key);
    const metadataReused = Boolean(checked && performance.now() <= checked.expiresAt);
    let preflightMs = 0, putMs = 0, failed = true;
    const verificationStarted = performance.now();
    try {
      let current;
      try { current = metadataReused ? checked.item : await this.getItemMetadata(item); }
      finally { preflightMs = Math.round(performance.now() - verificationStarted); }
      this.freshWriteMetadata.delete(key);
      const actual = String(current?.eTag || "").trim();
      if (expected && actual && expected !== actual) throw new OneDriveConflictError();
      const putStarted = performance.now();
      try {
        const response = await this.request(this.itemPath(current) + "/content", {
          method: "PUT",
          headers: { "Content-Type": "text/plain; charset=utf-8", "If-Match": expected },
          body: String(content ?? ""),
        });
        const saved = await response.json();
        failed = false;
        return saved;
      } finally { putMs = Math.round(performance.now() - putStarted); }
    } catch (error) {
      if (error?.status === 409 || error?.status === 412) throw new OneDriveConflictError();
      throw error;
    } finally {
      this.freshWriteMetadata.delete(key);
      finish({ metadataReused, preflightMs, putMs, failed });
    }
  }

  async createTextFile(parentFolder, fileName, content = "") {
    const parentId = String(parentFolder?.id || "").trim();
    const driveId = String(parentFolder?.parentReference?.driveId || "").trim();
    const parentPath = driveId
      ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}`
      : `/me/drive/items/${encodeURIComponent(parentId)}`;
    try {
      const response = await this.request(
        `${parentPath}:/${encodeURIComponent(fileName)}:/content`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "If-None-Match": "*",
          },
          body: String(content ?? ""),
        },
      );
      return response.json();
    } catch (error) {
      if (error?.status === 409 || error?.status === 412) {
        throw new OneDriveConflictError("同じ名前の原稿ファイルがすでにあります。");
      }
      throw error;
    }
  }

  async createFolder(parentFolder, folderName) {
    const parentId = String(parentFolder?.id || "").trim();
    const driveId = String(parentFolder?.parentReference?.driveId || "").trim();
    const parentPath = driveId
      ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}`
      : `/me/drive/items/${encodeURIComponent(parentId)}`;
    try {
      const response = await this.request(`${parentPath}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(folderName || "").trim(),
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      });
      return response.json();
    } catch (error) {
      if (error?.status !== 409) throw error;
      const children = await this.listChildren(parentId);
      const existing = children.find((item) => item?.folder && item.name === folderName);
      if (existing) return existing;
      throw error;
    }
  }

  async deleteItem(item) {
    await this.request(this.itemPath(item), { method: "DELETE" });
  }

  async renameItem(item, name) {
    if (!item?.eTag) throw new Error("名前変更前の版情報を確認できませんでした。");
    try {
      const response = await this.request(this.itemPath(item), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": item.eTag },
        body: JSON.stringify({ name, "@microsoft.graph.conflictBehavior": "fail" }),
      });
      this.freshWriteMetadata.delete(this.itemPath(item));
      return response.json();
    } catch (error) {
      if (error?.status === 409 || error?.status === 412) throw new OneDriveConflictError("名前が重複しているか、別の端末で更新されています。一覧を読み直してください。");
      throw error;
    }
  }

  async moveItem(item, destinationFolder) {
    const destinationId = String(destinationFolder?.id || "").trim();
    if (!destinationId) throw new Error("移動先フォルダを確認できませんでした。");
    try {
      const response = await this.request(this.itemPath(item), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentReference: { id: destinationId } }),
      });
      return response.json();
    } catch (error) {
      if (error?.status === 409 || error?.status === 412) {
        throw new OneDriveConflictError("移動先に同じ名前のファイルがあります。");
      }
      throw error;
    }
  }
}
