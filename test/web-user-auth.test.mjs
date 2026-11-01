import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUserSession, safeReturnTo, UserAuthClient } from "../web/lib/user-auth.mjs";
import fs from "node:fs";

test("審査用ログインはCognitoへ進むAPIのURLを作り、providerを保持する", () => {
  const client = new UserAuthClient({ apiBase: "./api/auth", location: { href: "https://example.com/", pathname: "/", search: "", hash: "" } });
  assert.equal(client.loginUrl("email"), "https://example.com/api/auth/login/email?return_to=%2F");
  assert.throws(() => client.loginUrl("password-bypass"));
  const session = normalizeUserSession({ authenticated: true, access: "active", user: { email: "review@example.com", provider: "email" } });
  assert.equal(session.user.provider, "email");
});

test("ログイン後の戻り先を同一サイト内の相対URLへ限定する", () => {
  assert.equal(safeReturnTo({ pathname: "/app/", search: "?tab=works", hash: "#top" }), "/app/?tab=works#top");
  assert.equal(safeReturnTo({ pathname: "//outside.example/path" }), "/");
});

test("MicrosoftとGoogleのログイン開始URLを認証API配下に作る", () => {
  const client = new UserAuthClient({
    apiBase: "./api/auth",
    location: { href: "https://example.com/mojigoto/", pathname: "/mojigoto/", search: "", hash: "" },
  });
  assert.equal(client.loginUrl("microsoft"), "https://example.com/mojigoto/api/auth/login/microsoft?return_to=%2Fmojigoto%2F");
  assert.equal(client.loginUrl("google"), "https://example.com/mojigoto/api/auth/login/google?return_to=%2Fmojigoto%2F");
});

test("招待済みの有効ユーザーだけをactiveとして扱う", () => {
  const active = normalizeUserSession({ authenticated: true, access: "active", user: { id: "u1", email: "user@example.com", nickname: "葉月", name: "Provider Name", provider: "microsoft" } });
  assert.equal(active.access, "active");
  assert.equal(active.user.email, "user@example.com");
  assert.equal(active.user.nickname, "葉月");
  assert.equal("name" in active.user, false);
  assert.equal(normalizeUserSession({ authenticated: true, access: "unknown" }).access, "not_invited");
  assert.equal(normalizeUserSession({ authenticated: true, access: "admin_only" }).access, "admin_only");
});

test("ニックネームをCSRF付きでプロフィールAPIへ保存する", async () => {
  let received;
  const client = new UserAuthClient({
    apiBase: "/api/auth",
    location: { href: "https://example.com/", pathname: "/", search: "", hash: "" },
    request: async (url, options) => {
      received = { url, options };
      return { ok: true, async json() { return { ok: true, nickname: "葉月" }; } };
    },
  });
  assert.deepEqual(await client.updateProfile("葉月", "csrf-token"), { nickname: "葉月" });
  assert.equal(received.url, "https://example.com/api/auth/profile/");
  assert.equal(received.options.method, "POST");
  assert.equal(received.options.headers["X-CSRF-Token"], "csrf-token");
});

test("セッション確認はCookieを含めキャッシュしない", async () => {
  let received;
  const client = new UserAuthClient({
    apiBase: "/api/auth",
    location: { href: "https://example.com/", pathname: "/", search: "", hash: "" },
    request: async (url, options) => {
      received = { url, options };
      return { ok: true, status: 200, async json() { return { authenticated: true, access: "active", user: {} }; } };
    },
  });
  assert.equal((await client.getSession()).access, "active");
  assert.equal(received.options.credentials, "include");
  assert.equal(received.options.cache, "no-store");
});

test("ログアウト後のCognito移動先を受け取る", async () => {
  let received;
  const client = new UserAuthClient({
    apiBase: "/api/auth",
    location: { href: "https://example.com/", pathname: "/", search: "", hash: "" },
    request: async (url, options) => {
      received = { url, options };
      return {
        ok: true,
        async json() { return { ok: true, logoutUrl: "https://auth.example.com/logout" }; },
      };
    },
  });
  assert.deepEqual(await client.logout("csrf-token"), { logoutUrl: "https://auth.example.com/logout" });
  assert.equal(received.url, "https://example.com/api/auth/logout/");
  assert.equal(received.options.method, "POST");
  assert.equal(received.options.headers["X-CSRF-Token"], "csrf-token");
});

test("認証確認中はログイン画面ではなく読み込み表示を使う", () => {
  const html = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../web/styles.css", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../web/app.mjs", import.meta.url), "utf8");
  assert.match(html, /<body class="auth-pending">/);
  assert.match(html, /id="authBoot"/);
  assert.match(css, /\.auth-pending > \.login-gate \{ display: none; \}/);
  assert.doesNotMatch(app, /showLoginGate\("ログイン状態を確認しています…"\)/);
  assert.match(app, /function finishAuthBoot\(\)/);
});
