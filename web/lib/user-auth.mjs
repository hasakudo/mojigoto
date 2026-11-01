const PROVIDERS = new Set(["microsoft", "google", "email"]);

function endpoint(apiBase, path, baseUrl) {
  const root = String(apiBase || "").replace(/\/+$/, "");
  return new URL(`${root}${path}`, baseUrl).href;
}

export function safeReturnTo(locationLike) {
  const pathname = String(locationLike?.pathname || "/");
  const safePath = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
  return `${safePath}${String(locationLike?.search || "")}${String(locationLike?.hash || "")}`;
}

export function normalizeUserSession(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const authenticated = source.authenticated === true;
  const access = ["active", "not_invited", "disabled", "admin_only"].includes(source.access)
    ? source.access
    : authenticated ? "not_invited" : "anonymous";
  return {
    authenticated,
    access,
    isAdmin: authenticated && source.isAdmin === true,
    csrfToken: String(source.csrfToken || ""),
    user: authenticated ? {
      id: String(source.user?.id || ""),
      email: String(source.user?.email || ""),
      nickname: String(source.user?.nickname || ""),
      provider: PROVIDERS.has(source.user?.provider) ? source.user.provider : "",
    } : null,
  };
}

export class UserAuthClient {
  constructor({ apiBase, location = globalThis.location, request = globalThis.fetch?.bind(globalThis) }) {
    this.apiBase = String(apiBase || "").trim();
    this.location = location;
    this.request = request;
    this.baseUrl = String(location?.href || "http://localhost/");
  }

  loginUrl(provider) {
    if (!PROVIDERS.has(provider)) throw new Error("対応していないログイン方法です。");
    const url = new URL(endpoint(this.apiBase, `/login/${provider}`, this.baseUrl));
    url.searchParams.set("return_to", safeReturnTo(this.location));
    return url.href;
  }

  async getSession() {
    if (!this.apiBase || typeof this.request !== "function") throw new Error("ログインAPIが設定されていません。");
    const response = await this.request(endpoint(this.apiBase, "/session", this.baseUrl), {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (response.status === 401) return normalizeUserSession();
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 403) throw new Error(payload.message || "ログイン状態を確認できませんでした。");
    return normalizeUserSession(payload);
  }

  async logout(csrfToken) {
    if (!this.apiBase || typeof this.request !== "function") throw new Error("ログインAPIが設定されていません。");
    // DirectoryIndex型のAPIでは末尾なしURLがリダイレクトされ、POSTがGETへ
    // 変わるサーバーがあるため、最初からディレクトリURLへ送信する。
    const response = await this.request(endpoint(this.apiBase, "/logout/", this.baseUrl), {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": String(csrfToken || ""),
      },
      body: "{}",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "ログアウトできませんでした。");
    return { logoutUrl: String(payload.logoutUrl || "") };
  }

  async updateProfile(nickname, csrfToken) {
    if (!this.apiBase || typeof this.request !== "function") throw new Error("ログインAPIが設定されていません。");
    const response = await this.request(endpoint(this.apiBase, "/profile/", this.baseUrl), {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": String(csrfToken || ""),
      },
      body: JSON.stringify({ nickname: String(nickname || "") }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "ニックネームを保存できませんでした。");
    return { nickname: String(payload.nickname || "") };
  }
}
