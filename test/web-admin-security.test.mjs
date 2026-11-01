import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { adminLoginMethodLabel } from "../web/lib/admin-user-labels.mjs";

const php = process.env.PHP_BIN || (fs.existsSync("C:/xampp/php/php.exe") ? "C:/xampp/php/php.exe" : "php");
function runFixture(name, input) {
  const result = spawnSync(php, [fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))], { encoding: "utf8", input });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test("審査ログインと方式未記録を未ログインと混同しない", () => {
  assert.equal(adminLoginMethodLabel({ provider: "email" }), "審査用（メール・パスワード）");
  assert.equal(adminLoginMethodLabel({ lastLoginAt: "2026-10-04T00:00:00Z" }), "ログイン済み（方式未記録）");
  assert.equal(adminLoginMethodLabel({}), "ログイン記録なし");
  assert.equal(adminLoginMethodLabel({ provider: "microsoft" }), "Microsoft");
});

test("古い全文解除セッションでも利用者・受付本文・履歴・メール本文を伏せ字にする", () => {
  runFixture("admin-privacy.php");
});

test("運営者の普段用を表示し、APIで削除を拒否する", () => {
  const api = fs.readFileSync(new URL("../web/api/admin/users/index.php", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../web/admin/admin.mjs", import.meta.url), "utf8");
  assert.match(api, /\$action === 'remove' && auth_is_owner_member\(\$config, \$email\)/);
  assert.ok(api.indexOf("owner_account_protected") < api.indexOf("auth_mutate_user_registry("));
  assert.match(ui, /自分の普段用/);
  assert.match(ui, /user.deletionProtected === true/);
});

test("IDトークンの署名・用途・発行元・対象・期限・nonceを検証する", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const config = { region: "ap-northeast-1", user_pool_id: "test_pool", client_id: "test_client" };
  const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" }] };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: "https://cognito-idp.ap-northeast-1.amazonaws.com/test_pool", aud: "test_client", sub: "user", token_use: "id", iat: now, exp: now + 300, nonce: "expected-nonce" };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = (body = claims, header = { alg: "RS256", kid: "test-key" }) => {
    const data = `${encode(header)}.${encode(body)}`;
    return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
  };
  const valid = token();
  const tampered = `${valid.split(".")[0]}.${encode({ ...claims, sub: "attacker" })}.${valid.split(".")[2]}`;
  const cases = [
    { name: "valid", token: valid, accepted: true },
    { name: "modified signature", token: tampered, accepted: false },
    ...Object.entries({ aud: "other", iss: "https://attacker.example", token_use: "access", exp: now - 1, sub: "", iat: now + 3600, nbf: now + 3600 }).map(([key, value]) => ({ name: key, token: token({ ...claims, [key]: value }), accepted: false })),
    { name: "nonce", token: valid, nonce: "wrong", accepted: false },
    { name: "unknown key", token: token(claims, { alg: "RS256", kid: "missing" }), accepted: false },
    { name: "algorithm", token: token(claims, { alg: "none", kid: "test-key" }), accepted: false },
  ].map((item) => ({ nonce: "expected-nonce", ...item }));
  runFixture("verify-id-token.php", JSON.stringify({ config, jwks, cases }));
});
