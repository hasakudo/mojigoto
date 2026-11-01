import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const php = process.env.PHP_BIN || (fs.existsSync("C:/xampp/php/php.exe") ? "C:/xampp/php/php.exe" : "php");

test("PHPの審査ログインは有効な専用招待だけを許可する", () => {
  const harness = fileURLToPath(new URL("./fixtures/email-login-policy.php", import.meta.url));
  const result = spawnSync(php, [harness], { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /policy checks passed/);
});

test("Cognitoへのメールログインはstate・nonce・PKCEを含みパスワードを受け取らない", () => {
  const route = fs.readFileSync(new URL("../web/api/auth/login/email/index.php", import.meta.url), "utf8");
  assert.match(route, /'code_challenge_method' => 'S256'/);
  assert.match(route, /'state' => \$state/);
  assert.match(route, /'nonce' => \$nonce/);
  assert.match(route, /\/oauth2\/authorize\?/);
  assert.doesNotMatch(route, /\$_POST|password_hash|password_verify|'identity_provider'\s*=>/);
  const callback = fs.readFileSync(new URL("../web/api/auth/callback/index.php", import.meta.url), "utf8");
  assert.match(callback, /auth_email_login_claims_allowed\(\$config, \$email, \$idClaims\)/);
  const bootstrap = fs.readFileSync(new URL("../web/api/auth/bootstrap.php", import.meta.url), "utf8");
  assert.match(bootstrap, /\$_SESSION\['user'\]\['provider'\].*=== 'email'/);
  assert.match(bootstrap, /unset\(\$_SESSION\['user'\], \$_SESSION\['authenticated_at'\], \$_SESSION\['refresh_token'\], \$_SESSION\['csrf_token'\]\)/);
});
