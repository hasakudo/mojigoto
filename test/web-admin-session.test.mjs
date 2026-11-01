import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
test("専用管理認証・一般セッション分離・期限と再認証をサーバー側で判定する", () => {
  const php = process.env.PHP_BIN || (fs.existsSync("C:/xampp/php/php.exe") ? "C:/xampp/php/php.exe" : "php");
  const result = spawnSync(php, [fileURLToPath(new URL("./fixtures/admin-session-policy.php", import.meta.url))], { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("すべての管理データAPIが専用セッションを要求する", () => {
  for (const name of ["users", "mail", "submissions", "announcements", "form-settings"]) {
    const source = read(`../web/api/admin/${name}/index.php`);
    assert.match(source, /define\('MOJIGOTO_ADMIN_AUTH', true\)/);
    assert.match(source, /auth_require_admin_session\(\$config\)/);
    assert.match(source, /auth_require_recent_admin\(\$config\)/);
    assert.match(source, /HTTP_X_CSRF_TOKEN/);
  }
});

test("管理認証は社会IdPだけ・新しい認証時刻・独立した入口を使う", () => {
  const login = read("../web/api/admin/auth/login/index.php");
  const callback = read("../web/api/auth/callback/index.php");
  assert.match(login, /\['google', 'microsoft'\]/);
  assert.match(login, /'prompt' => 'login'/);
  assert.match(callback, /authTime.*120/);
  assert.match(callback, /\$_SESSION\['admin_authenticated'\] = true/);
  assert.match(callback, /!auth_admin_mode\(\) && auth_is_admin\(\$config, \$email\)/);
  assert.match(read("../web/admin/admin.mjs"), /api\/admin\/auth\/session\//);
  assert.match(read("../web/admin/admin.mjs"), /event\.isTrusted/);
  assert.match(read("../web/app.mjs"), /adminPageLink.hidden = true/);
  for (const provider of ["google", "microsoft"]) {
    assert.match(read(`../web/api/auth/login/${provider}/index.php`), /'prompt' => 'select_account'/);
  }
});
