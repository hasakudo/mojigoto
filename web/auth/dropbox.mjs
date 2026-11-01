const PREFIX = "mojigoto.dropbox";
export const DROPBOX_SCOPES = "files.metadata.read files.content.read files.content.write";

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export class DropboxAuth {
  constructor({ clientId, redirectUri = new URL("./", globalThis.location.href).href,
    storage = globalThis.sessionStorage, locationRef = globalThis.location,
    historyRef = globalThis.history, fetchImpl = globalThis.fetch } = {}) {
    this.clientId = String(clientId || "").trim();
    this.redirectUri = redirectUri;
    this.storage = storage;
    this.location = locationRef;
    this.history = historyRef;
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  async signIn() {
    if (!this.clientId) throw new Error("Dropbox接続用のアプリキーが設定されていません。");
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
    const state = `dropbox_${base64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
    const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    this.storage.setItem(`${PREFIX}.pending`, JSON.stringify({ verifier, state, clientId: this.clientId, createdAt: Date.now() }));
    const params = new URLSearchParams({ client_id: this.clientId, response_type: "code",
      redirect_uri: this.redirectUri, state, scope: DROPBOX_SCOPES, token_access_type: "online",
      code_challenge: challenge, code_challenge_method: "S256" });
    this.location.assign(`https://www.dropbox.com/oauth2/authorize?${params}`);
  }

  async completeRedirect() {
    const raw = this.storage.getItem(`${PREFIX}.pending`);
    if (!raw) return false;
    const params = new URLSearchParams(this.location.search);
    if (!params.has("code") && !params.has("error")) return false;
    if (!params.get("state")?.startsWith("dropbox_")) return false;
    let pending;
    try { pending = JSON.parse(raw); } catch {}
    this.storage.removeItem(`${PREFIX}.pending`);
    this.history.replaceState({}, "", this.redirectUri);
    if (!pending?.verifier || !pending.state || params.get("state") !== pending.state
      || pending.clientId !== this.clientId || Date.now() - pending.createdAt > 10 * 60 * 1000) {
      throw new Error("Dropboxの接続応答を確認できませんでした。もう一度接続してください。");
    }
    if (params.has("error")) throw new Error("Dropboxへの接続が中止されました。");
    const response = await this.fetchImpl("https://api.dropboxapi.com/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, grant_type: "authorization_code",
        code: params.get("code"), code_verifier: pending.verifier, redirect_uri: this.redirectUri }),
    });
    const result = await response.json();
    if (!response.ok || !result.access_token || !(Number(result.expires_in) > 0)) {
      throw new Error("Dropboxのアクセストークンを取得できませんでした。もう一度接続してください。");
    }
    this.storage.setItem(`${PREFIX}.accessToken`, result.access_token);
    this.storage.setItem(`${PREFIX}.expiresAt`, String(Date.now() + Math.max(0, Number(result.expires_in) - 60) * 1000));
    this.storage.setItem(`${PREFIX}.clientId`, this.clientId);
    return true;
  }

  async getAccessToken() {
    return this.storage.getItem(`${PREFIX}.clientId`) === this.clientId
      && Date.now() < Number(this.storage.getItem(`${PREFIX}.expiresAt`))
      ? this.storage.getItem(`${PREFIX}.accessToken`) || "" : "";
  }

  async signOut() {
    const token = this.storage.getItem(`${PREFIX}.accessToken`);
    for (const key of ["accessToken", "expiresAt", "clientId", "pending"]) this.storage.removeItem(`${PREFIX}.${key}`);
    if (token) {
      try { await this.fetchImpl("https://api.dropboxapi.com/2/auth/token/revoke", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      }); } catch { /* ローカルの接続情報は破棄済み。 */ }
    }
  }
}
