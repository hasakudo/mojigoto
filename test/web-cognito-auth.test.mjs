import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("Cognito公開識別子と本番URLを設定例へ反映する", () => {
  const config = read("../web/api/auth/config.example.php");
  assert.match(config, /ap-northeast-1_4rMJhjC3l/);
  assert.match(config, /7gquj3957t2d9996l5viqke0j4/);
  assert.match(config, /web\.mojigoto\.com\/api\/auth\/callback/);
  assert.match(config, /'client_secret'\s*=>\s*''/);
  assert.match(config, /'session_secret'\s*=>\s*''/);
});

test("認証APIはstate・PKCE・サーバーセッション・CSRFを使用する", () => {
  const bootstrap = read("../web/api/auth/bootstrap.php");
  const login = read("../web/api/auth/login/microsoft/index.php");
  const callback = read("../web/api/auth/callback/index.php");
  const logout = read("../web/api/auth/logout/index.php");
  assert.match(bootstrap, /'httponly'\s*=>\s*true/);
  assert.match(bootstrap, /'samesite'\s*=>\s*'Lax'/);
  assert.match(login, /code_challenge_method'\s*=>\s*'S256'/);
  assert.match(callback, /hash_equals\(\(string\) \$oauth\['state'\]/);
  assert.match(callback, /oauth2\/userInfo/);
  assert.match(logout, /HTTP_X_CSRF_TOKEN/);
});

test("秘密設定ファイルへの直接アクセスを拒否する", () => {
  const htaccess = read("../web/api/auth/.htaccess");
  assert.match(htaccess, /config/);
  assert.match(htaccess, /Require all denied/);
  assert.match(htaccess, /DirectoryIndex index\.php/);
});

test("既存のHTTP Basic認証と競合しないよう未ログイン状態を200で返す", () => {
  const session = read("../web/api/auth/session/index.php");
  assert.match(session, /auth_json\(\['authenticated' => false, 'access' => 'anonymous'\]\);/);
  assert.doesNotMatch(session, /'anonymous'\],\s*401/);
});
