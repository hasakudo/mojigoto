import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('審査ログイン通知の宛先・伏せ字・時間制限・失敗時継続', () => {
  const php = process.env.PHP_BIN || (fs.existsSync('C:/xampp/php/php.exe') ? 'C:/xampp/php/php.exe' : 'php');
  const result = spawnSync(php, [fileURLToPath(new URL('./fixtures/review-login-notification.php', import.meta.url))], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('成功セッション作成後だけ通知し、ヘルパーを公開しない', () => {
  const source = fs.readFileSync(new URL('../web/api/auth/callback/index.php', import.meta.url), 'utf8');
  assert.ok(source.indexOf('auth_notify_review_login') > source.indexOf("$_SESSION['user'] = $sessionUser"));
  assert.match(source, /\$sessionUser\['provider'\] === 'email'/);
  const protection = fs.readFileSync(new URL('../web/api/auth/.htaccess', import.meta.url), 'utf8');
  assert.match(protection, /review-login-notification/);
});
