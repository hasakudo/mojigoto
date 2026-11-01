const encoder = new TextEncoder();

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomValue(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export class MicrosoftAuth {
  constructor({ clientId, redirectUri = new URL("./", location.href).href }) {
    this.clientId = String(clientId || "").trim();
    this.redirectUri = redirectUri;
    this.authority = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
    this.scopes = "openid offline_access Files.ReadWrite";
  }

  async signIn() {
    if (!this.clientId) throw new Error("Microsoft アプリIDを設定してください。");
    const verifier = randomValue(64);
    const state = randomValue(24);
    sessionStorage.setItem("mojigoto.oauth.verifier", verifier);
    sessionStorage.setItem("mojigoto.oauth.state", state);

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      response_mode: "query",
      scope: this.scopes,
      state,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: "S256",
    });
    location.assign(`${this.authority}/authorize?${params}`);
  }

  async completeRedirect() {
    const params = new URLSearchParams(location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      const message = params.get("error_description") || oauthError;
      history.replaceState({}, "", this.redirectUri);
      throw new Error(`Microsoft ログインに失敗しました: ${message}`);
    }

    const code = params.get("code");
    if (!code) return false;
    const expectedState = sessionStorage.getItem("mojigoto.oauth.state");
    const verifier = sessionStorage.getItem("mojigoto.oauth.verifier");
    if (!expectedState || params.get("state") !== expectedState || !verifier) {
      throw new Error("ログイン応答を確認できませんでした。もう一度接続してください。");
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: this.redirectUri,
      scope: this.scopes,
      code_verifier: verifier,
    });
    const response = await fetch(`${this.authority}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) {
      throw new Error(result.error_description || "アクセストークンを取得できませんでした。");
    }

    this.storeTokens(result);
    sessionStorage.removeItem("mojigoto.oauth.state");
    sessionStorage.removeItem("mojigoto.oauth.verifier");
    history.replaceState({}, "", this.redirectUri);
    return true;
  }

  storeTokens(result) {
    const expiresAt = Date.now() + Math.max(0, Number(result.expires_in || 0) - 60) * 1000;
    sessionStorage.setItem("mojigoto.oauth.accessToken", result.access_token);
    sessionStorage.setItem("mojigoto.oauth.expiresAt", String(expiresAt));
    if (result.refresh_token) sessionStorage.setItem("mojigoto.oauth.refreshToken", result.refresh_token);
  }

  async getAccessToken() {
    const token = sessionStorage.getItem("mojigoto.oauth.accessToken");
    const expiresAt = Number(sessionStorage.getItem("mojigoto.oauth.expiresAt") || 0);
    if (token && Date.now() < expiresAt) return token;

    const refreshToken = sessionStorage.getItem("mojigoto.oauth.refreshToken");
    if (!refreshToken) return "";
    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: this.redirectUri,
      scope: this.scopes,
    });
    const response = await fetch(`${this.authority}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) {
      this.signOut();
      return "";
    }
    this.storeTokens(result);
    return result.access_token;
  }

  signOut() {
    for (const key of ["accessToken", "expiresAt", "refreshToken", "state", "verifier"]) {
      sessionStorage.removeItem(`mojigoto.oauth.${key}`);
    }
  }
}
