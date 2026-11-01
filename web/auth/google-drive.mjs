const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const TOKEN_PREFIX = "mojigoto.googleDrive";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let libraryPromise = null;

export function loadGoogleIdentityServices(documentRef = globalThis.document) {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve(globalThis.google);
  if (!documentRef) return Promise.reject(new Error("Google認可画面を読み込めませんでした。"));
  if (libraryPromise) return libraryPromise;
  libraryPromise = new Promise((resolve, reject) => {
    const existing = documentRef.querySelector?.(`script[src="${GIS_SCRIPT_URL}"]`);
    const script = existing || documentRef.createElement("script");
    const finish = () => globalThis.google?.accounts?.oauth2
      ? resolve(globalThis.google)
      : reject(new Error("Google認可ライブラリを読み込めませんでした。"));
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Google認可ライブラリへ接続できませんでした。")), { once: true });
    if (!existing) {
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      documentRef.head.append(script);
    }
  });
  return libraryPromise;
}

export class GoogleDriveAuth {
  constructor({ clientId, googleApi = null, storage = globalThis.sessionStorage } = {}) {
    this.clientId = String(clientId || "").trim();
    this.googleApi = googleApi;
    this.storage = storage;
    this.scope = GOOGLE_DRIVE_SCOPE;
  }

  storeToken(result) {
    const granted = String(result?.scope || "").split(/\s+/).filter(Boolean);
    if (!granted.includes(this.scope) || granted.some((scope) => scope.startsWith("https://www.googleapis.com/auth/drive") && scope !== this.scope)) {
      throw new Error("作品ごとのGoogle Drive権限を確認できませんでした。接続を解除して、もう一度接続してください。");
    }
    const token = String(result?.access_token || "").trim();
    if (!token) throw new Error("Google Driveのアクセストークンを取得できませんでした。");
    const lifetimeSeconds = Number(result.expires_in ?? 3600);
    if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0) throw new Error("Google Driveの接続期限を確認できませんでした。");
    const issuedAt = Date.now();
    const expiresAt = issuedAt + Math.max(0, lifetimeSeconds - 60) * 1000;
    this.storage?.setItem?.(`${TOKEN_PREFIX}.accessToken`, token);
    this.storage?.setItem?.(`${TOKEN_PREFIX}.expiresAt`, String(expiresAt));
    this.storage?.setItem?.(`${TOKEN_PREFIX}.scope`, this.scope);
    this.storage?.setItem?.(`${TOKEN_PREFIX}.issuedAt`, String(issuedAt));
    this.storage?.setItem?.(`${TOKEN_PREFIX}.lifetimeSeconds`, String(lifetimeSeconds));
    return token;
  }

  async oauth2() {
    if (this.googleApi?.accounts?.oauth2) return this.googleApi.accounts.oauth2;
    const library = await loadGoogleIdentityServices();
    return library.accounts.oauth2;
  }

  async signIn({ prompt = "consent" } = {}) {
    if (!this.clientId) throw new Error("Google Drive接続用のクライアントIDが設定されていません。");
    const oauth2 = await this.oauth2();
    return new Promise((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: this.scope,
        include_granted_scopes: false,
        callback: (response) => {
          if (response?.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          try { resolve(this.storeToken(response)); } catch (error) { reject(error); }
        },
        error_callback: (response) => reject(new Error(
          response?.type === "popup_closed" ? "Google Driveへの接続が中止されました。" : "Google Driveへ接続できませんでした。",
        )),
      });
      client.requestAccessToken({ prompt });
    });
  }

  async getAccessToken() {
    const token = String(this.storage?.getItem?.(`${TOKEN_PREFIX}.accessToken`) || "").trim();
    const expiresAt = Number(this.storage?.getItem?.(`${TOKEN_PREFIX}.expiresAt`) || 0);
    const scope = String(this.storage?.getItem?.(`${TOKEN_PREFIX}.scope`) || "").trim();
    return token && scope === this.scope && Date.now() < expiresAt ? token : "";
  }

  connectionStatus() {
    const expiresAt = Number(this.storage?.getItem?.(`${TOKEN_PREFIX}.expiresAt`) || 0);
    const scope = this.storage?.getItem?.(`${TOKEN_PREFIX}.scope`);
    const connected = Boolean(this.storage?.getItem?.(`${TOKEN_PREFIX}.accessToken`)) && scope === this.scope && Date.now() < expiresAt;
    return { connected, expiresAt, remainingMs: Math.max(0, expiresAt - Date.now()),
      issuedAt: Number(this.storage?.getItem?.(`${TOKEN_PREFIX}.issuedAt`) || 0),
      lifetimeSeconds: Number(this.storage?.getItem?.(`${TOKEN_PREFIX}.lifetimeSeconds`) || 0) };
  }

  invalidateAccessToken(token) {
    if (this.storage?.getItem?.(`${TOKEN_PREFIX}.accessToken`) === token) this.storage?.setItem?.(`${TOKEN_PREFIX}.expiresAt`, "0");
  }

  async signOut() {
    const token = String(this.storage?.getItem?.(`${TOKEN_PREFIX}.accessToken`) || "").trim();
    this.storage?.removeItem?.(`${TOKEN_PREFIX}.accessToken`);
    this.storage?.removeItem?.(`${TOKEN_PREFIX}.expiresAt`);
    this.storage?.removeItem?.(`${TOKEN_PREFIX}.scope`);
    this.storage?.removeItem?.(`${TOKEN_PREFIX}.issuedAt`);
    this.storage?.removeItem?.(`${TOKEN_PREFIX}.lifetimeSeconds`);
    if (!token) return;
    try {
      const oauth2 = await this.oauth2();
      await new Promise((resolve) => oauth2.revoke(token, resolve));
    } catch {
      // ローカルのトークン破棄は完了しているため、失効APIの通信失敗では停止しない。
    }
  }
}
