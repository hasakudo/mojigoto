<?php

declare(strict_types=1);

require_once __DIR__ . '/token-verification.php';
require_once __DIR__ . '/admin-session.php';
require_once __DIR__ . '/cognito-identities.php';

function auth_config(): array
{
    static $config = null;
    if (is_array($config)) {
        return $config;
    }

    $path = __DIR__ . '/config.php';
    if (!is_file($path)) {
        throw new RuntimeException('認証サーバーの設定ファイルがありません。');
    }
    $loaded = require $path;
    if (!is_array($loaded)) {
        throw new RuntimeException('認証サーバーの設定形式が正しくありません。');
    }

    $required = ['app_origin', 'region', 'user_pool_id', 'client_id', 'client_secret', 'cognito_domain', 'callback_url', 'logout_url', 'session_secret'];
    foreach ($required as $key) {
        if (trim((string) ($loaded[$key] ?? '')) === '') {
            throw new RuntimeException('認証サーバーの必須設定が不足しています。');
        }
    }
    if (strlen((string) $loaded['session_secret']) < 32) {
        throw new RuntimeException('セッション用秘密文字列は32文字以上で設定してください。');
    }

    $loaded['app_origin'] = rtrim((string) $loaded['app_origin'], '/');
    $loaded['cognito_domain'] = rtrim((string) $loaded['cognito_domain'], '/');
    $config = $loaded;
    return $config;
}

function auth_headers(): void
{
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
}

function auth_session_start(): array
{
    $config = auth_admin_mode() ? auth_admin_config(auth_config()) : auth_config();
    if (session_status() === PHP_SESSION_ACTIVE) {
        return $config;
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name((string) ($config['session_cookie'] ?? 'mojigoto_session'));
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    // 許可の取り消し・停止は、既存の審査用セッションにも反映します。
    if (($_SESSION['user']['provider'] ?? '') === 'email'
        && !auth_email_login_allowed($config, (string) ($_SESSION['user']['email'] ?? ''))) {
        unset($_SESSION['user'], $_SESSION['authenticated_at'], $_SESSION['refresh_token'], $_SESSION['csrf_token']);
        session_regenerate_id(true);
    }
    return $config;
}

function auth_base64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function auth_random_token(int $bytes = 32): string
{
    return auth_base64url(random_bytes($bytes));
}

function auth_safe_return_to(?string $value): string
{
    $path = trim((string) $value);
    if ($path === '' || $path[0] !== '/' || substr($path, 0, 2) === '//' || preg_match('/[\x00-\x1F\x7F]/', $path)) {
        return '/';
    }
    $parts = parse_url($path);
    if ($parts === false || isset($parts['scheme']) || isset($parts['host'])) {
        return '/';
    }
    return $path;
}

function auth_json(array $payload, int $status = 200): void
{
    auth_headers();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function auth_redirect(string $url): void
{
    auth_headers();
    header('Location: ' . $url, true, 302);
    exit;
}

function auth_error_page(string $message, int $status = 400): void
{
    $config = null;
    try {
        $config = auth_config();
        if (auth_admin_mode()) $config['logout_url'] = $config['app_origin'] . '/admin/login/';
    } catch (Throwable $ignored) {
    }
    $home = htmlspecialchars((string) ($config['logout_url'] ?? '/'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $safeMessage = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    auth_headers();
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>ログインエラー | もじごと</title><body style="margin:0;padding:32px;font-family:sans-serif;color:#123f52;background:#f8fcfd">';
    echo '<main style="max-width:560px;margin:10vh auto;padding:28px;background:#fff;border:1px solid #cde1e8;border-radius:18px">';
    echo '<h1 style="font-size:1.35rem">ログインできませんでした</h1><p style="line-height:1.8">' . $safeMessage . '</p>';
    echo '<p><a href="' . $home . '" style="color:#005990">もじごとへ戻る</a></p></main></body></html>';
    exit;
}

function auth_http(string $url, string $method = 'GET', array $headers = [], ?string $body = null): array
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('サーバーでcURL拡張が有効になっていません。');
    }
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('認証サーバーへ接続できませんでした。');
    }
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($body !== null) {
        curl_setopt($handle, CURLOPT_POSTFIELDS, $body);
    }
    $responseBody = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $error = curl_error($handle);
    curl_close($handle);
    if ($responseBody === false) {
        throw new RuntimeException('認証サーバーとの通信に失敗しました。' . ($error !== '' ? ' ' . $error : ''));
    }
    return ['status' => $status, 'body' => (string) $responseBody];
}

function auth_decode_jwt_payload(string $jwt): array
{
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) {
        throw new RuntimeException('IDトークンの形式が正しくありません。');
    }
    $value = strtr($parts[1], '-_', '+/');
    $value .= str_repeat('=', (4 - strlen($value) % 4) % 4);
    $decoded = base64_decode($value, true);
    $payload = $decoded === false ? null : json_decode($decoded, true);
    if (!is_array($payload)) {
        throw new RuntimeException('IDトークンを確認できませんでした。');
    }
    return $payload;
}

function auth_normalize_emails($values): array
{
    if (!is_array($values)) {
        return [];
    }
    $emails = [];
    foreach ($values as $value) {
        $email = strtolower(trim((string) $value));
        if ($email !== '') {
            $emails[$email] = true;
        }
    }
    return array_keys($emails);
}

function auth_is_admin(array $config, string $email): bool
{
    $normalized = strtolower(trim($email));
    return $normalized !== '' && in_array($normalized, auth_normalize_emails($config['admin_emails'] ?? []), true);
}

function auth_registry_path(array $config): string
{
    $configured = trim((string) ($config['user_registry_path'] ?? ''));
    return $configured !== '' ? $configured : __DIR__ . '/data/users.json';
}

function auth_admin_audit_path(array $config): string
{
    $configured = trim((string) ($config['admin_audit_path'] ?? ''));
    return $configured !== '' ? $configured : dirname(auth_registry_path($config)) . '/admin-audit.json';
}

function auth_normalize_audit_entries($value, int $limit = 50): array
{
    if (!is_array($value)) return [];
    $entries = [];
    $cutoff = time() - (365 * 86400);
    foreach ($value as $entry) {
        if (!is_array($entry)) continue;
        $normalized = [
            'at' => trim((string) ($entry['at'] ?? '')),
            'actor' => strtolower(trim((string) ($entry['actor'] ?? ''))),
            'action' => trim((string) ($entry['action'] ?? '')),
            'target' => strtolower(trim((string) ($entry['target'] ?? ''))),
        ];
        if ($normalized['at'] === '' || $normalized['action'] === '' || $normalized['target'] === '') continue;
        $timestamp = strtotime($normalized['at']);
        if ($timestamp !== false && $timestamp < $cutoff) continue;
        $entries[] = $normalized;
        if (count($entries) >= max(1, min($limit, 200))) break;
    }
    return $entries;
}

function auth_load_admin_audit(array $config, int $limit = 30): array
{
    $path = auth_admin_audit_path($config);
    $source = [];
    foreach (auth_load_user_registry($config) as $record) {
        foreach (auth_normalize_audit_entries($record['audit'] ?? [], 50) as $entry) {
            $source[] = $entry;
        }
    }
    // 1.0.33以前の独立ファイルが残っている場合も表示対象に含める。
    if (is_file($path)) {
        $decoded = json_decode((string) file_get_contents($path), true);
        if (is_array($decoded) && is_array($decoded['entries'] ?? null)) {
            $source = array_merge($source, $decoded['entries']);
        }
    }
    $legacyPath = dirname($path) . '/admin-audit.jsonl';
    if (is_file($legacyPath)) {
        $lines = file($legacyPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (is_array($lines)) {
            foreach ($lines as $line) {
                $decoded = json_decode($line, true);
                if (is_array($decoded)) $source[] = $decoded;
            }
        }
    }

    $entries = auth_normalize_audit_entries($source, 200);
    usort($entries, fn(array $left, array $right): int => strcmp($right['at'], $left['at']));
    $unique = [];
    foreach ($entries as $entry) {
        $key = implode('|', [$entry['at'], $entry['actor'], $entry['action'], $entry['target']]);
        $unique[$key] = $entry;
    }
    return array_slice(array_values($unique), 0, max(1, min($limit, 200)));
}

function auth_normalize_nickname($value): string
{
    $nickname = trim((string) $value);
    $nickname = preg_replace('/\s+/u', ' ', $nickname) ?? '';
    if ($nickname === '' || preg_match('/[\x00-\x1F\x7F]/u', $nickname)) return '';
    $length = function_exists('mb_strlen') ? mb_strlen($nickname, 'UTF-8') : strlen($nickname);
    return $length <= 30 ? $nickname : '';
}

function auth_user_id(array $config, string $email, $existing = ''): string
{
    $current = trim((string) $existing);
    if (preg_match('/^U-[A-F0-9]{12}$/', $current)) return $current;
    $secret = (string) ($config['session_secret'] ?? 'mojigoto-user-id');
    return 'U-' . strtoupper(substr(hash_hmac('sha256', strtolower(trim($email)), $secret), 0, 12));
}

function auth_registry_seed(array $config): array
{
    $users = [];
    foreach (auth_normalize_emails($config['invited_emails'] ?? []) as $email) {
        $users[$email] = [
            'userId' => auth_user_id($config, $email),
            'email' => $email,
            'nickname' => '',
            'provider' => '',
            'role' => auth_is_admin($config, $email) ? 'admin' : 'member',
            'status' => 'active',
            'createdAt' => '',
            'updatedAt' => '',
            'lastLoginAt' => '',
            'removedAt' => '',
            'audit' => [],
        ];
    }
    foreach (auth_normalize_emails($config['disabled_emails'] ?? []) as $email) {
        $users[$email] = [
            'userId' => auth_user_id($config, $email),
            'email' => $email,
            'nickname' => '',
            'provider' => '',
            'role' => auth_is_admin($config, $email) ? 'admin' : 'member',
            'status' => auth_is_admin($config, $email) ? 'active' : 'disabled',
            'createdAt' => '',
            'updatedAt' => '',
            'lastLoginAt' => '',
            'removedAt' => '',
            'audit' => [],
        ];
    }
    foreach (auth_normalize_emails($config['admin_emails'] ?? []) as $email) {
        $existing = $users[$email] ?? [];
        $users[$email] = array_merge([
            'userId' => auth_user_id($config, $email),
            'email' => $email,
            'nickname' => '',
            'provider' => '',
            'createdAt' => '',
            'updatedAt' => '',
            'lastLoginAt' => '',
            'removedAt' => '',
            'audit' => [],
        ], $existing, ['role' => 'admin', 'status' => 'active']);
    }
    return $users;
}

function auth_load_user_registry(array $config): array
{
    $users = auth_registry_seed($config);
    $path = auth_registry_path($config);
    if (!is_file($path)) {
        return $users;
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded) || !is_array($decoded['users'] ?? null)) {
        throw new RuntimeException('招待利用者データの形式が正しくありません。');
    }
    foreach ($decoded['users'] as $record) {
        if (!is_array($record)) {
            continue;
        }
        $email = strtolower(trim((string) ($record['email'] ?? '')));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            continue;
        }
        $status = in_array(($record['status'] ?? ''), ['active', 'disabled', 'removed'], true)
            ? (string) $record['status']
            : 'active';
        $removedAt = trim((string) ($record['removedAt'] ?? ''));
        if ($status === 'removed' && $removedAt === '') $removedAt = trim((string) ($record['updatedAt'] ?? ''));
        $removedTimestamp = $removedAt !== '' ? strtotime($removedAt) : false;
        if ($status === 'removed' && $removedTimestamp !== false && $removedTimestamp < time() - (90 * 86400)) continue;
        $users[$email] = [
            'userId' => auth_user_id($config, $email, $record['userId'] ?? ''),
            'email' => $email,
            'nickname' => auth_normalize_nickname($record['nickname'] ?? ''),
            'provider' => trim((string) ($record['provider'] ?? '')),
            'cognitoIdentities' => auth_normalize_cognito_identities($record['cognitoIdentities'] ?? []),
            'role' => auth_is_admin($config, $email) ? 'admin' : 'member',
            'status' => auth_is_admin($config, $email) ? 'active' : $status,
            'createdAt' => trim((string) ($record['createdAt'] ?? '')),
            'updatedAt' => trim((string) ($record['updatedAt'] ?? '')),
            'lastLoginAt' => trim((string) ($record['lastLoginAt'] ?? '')),
            'removedAt' => $removedAt,
            'audit' => auth_normalize_audit_entries($record['audit'] ?? [], 50),
        ];
    }
    return $users;
}

function auth_save_user_registry(array $config, array $users): void
{
    $path = auth_registry_path($config);
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('招待利用者データの保存フォルダを作成できませんでした。');
    }
    $payload = json_encode([
        'version' => 1,
        'updatedAt' => gmdate('c'),
        'users' => array_values($users),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($payload === false) {
        throw new RuntimeException('招待利用者データを作成できませんでした。');
    }
    $temporary = tempnam($directory, '.users-');
    if ($temporary === false) {
        throw new RuntimeException('招待利用者データを保存できませんでした。');
    }
    try {
        if (file_put_contents($temporary, $payload, LOCK_EX) === false || !rename($temporary, $path)) {
            throw new RuntimeException('招待利用者データを保存できませんでした。');
        }
        @chmod($path, 0600);
    } finally {
        if (is_file($temporary)) {
            @unlink($temporary);
        }
    }
}

function auth_mutate_user_registry(array $config, callable $mutator): array
{
    $path = auth_registry_path($config);
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('招待利用者データの保存フォルダを作成できませんでした。');
    }
    $lock = fopen($path . '.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) fclose($lock);
        throw new RuntimeException('招待利用者データを更新できませんでした。');
    }
    try {
        $users = auth_load_user_registry($config);
        $mutator($users);
        auth_save_user_registry($config, $users);
        return $users;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function auth_record_login(array $config, array $user, array $verifiedIdentity = []): void
{
    $email = strtolower(trim((string) ($user['email'] ?? '')));
    $existing = auth_load_user_registry($config);
    if (!isset($existing[$email]) && !auth_is_admin($config, $email)) {
        return;
    }
    auth_mutate_user_registry($config, function (array &$users) use ($config, $email, $user, $verifiedIdentity): void {
        // A later sign-in attempt must not reset a removed member's retention deadline.
        if (($users[$email]['status'] ?? '') === 'removed') return;
        $now = gmdate('c');
        $record = $users[$email] ?? [
            'userId' => auth_user_id($config, $email),
            'email' => $email,
            'createdAt' => $now,
            'status' => 'active',
        ];
        unset($record['name']);
        $record['userId'] = auth_user_id($config, $email, $record['userId'] ?? '');
        if (trim((string) ($record['createdAt'] ?? '')) === '') $record['createdAt'] = $now;
        $record['nickname'] = auth_normalize_nickname($record['nickname'] ?? '');
        $record['provider'] = trim((string) ($user['provider'] ?? ''));
        $record['cognitoIdentities'] = auth_remember_cognito_identity(
            $config, $record['cognitoIdentities'] ?? [], $verifiedIdentity, $record['provider'], $now
        );
        $record['role'] = auth_is_admin($config, $email) ? 'admin' : 'member';
        $record['status'] = auth_is_admin($config, $email) ? 'active' : ($record['status'] ?? 'active');
        $record['removedAt'] = '';
        $record['updatedAt'] = $now;
        $record['lastLoginAt'] = $now;
        $users[$email] = $record;
    });
}

function auth_nickname_for_email(array $config, string $email): string
{
    $normalized = strtolower(trim($email));
    $record = auth_load_user_registry($config)[$normalized] ?? null;
    return auth_normalize_nickname($record['nickname'] ?? '');
}

function auth_set_user_nickname(array $config, string $email, string $nickname): string
{
    $normalizedEmail = strtolower(trim($email));
    $normalizedNickname = auth_normalize_nickname($nickname);
    if (trim($nickname) !== '' && $normalizedNickname === '') {
        throw new InvalidArgumentException('ニックネームは30文字以内で入力してください。');
    }
    auth_mutate_user_registry($config, function (array &$users) use ($config, $normalizedEmail, $normalizedNickname): void {
        if (!isset($users[$normalizedEmail]) || ($users[$normalizedEmail]['status'] ?? '') !== 'active') {
            throw new RuntimeException('利用者情報を更新できませんでした。');
        }
        unset($users[$normalizedEmail]['name']);
        $users[$normalizedEmail]['nickname'] = $normalizedNickname;
        $users[$normalizedEmail]['role'] = auth_is_admin($config, $normalizedEmail) ? 'admin' : 'member';
        $users[$normalizedEmail]['updatedAt'] = gmdate('c');
    });
    return $normalizedNickname;
}

function auth_create_oauth_state(array $config): string
{
    $seed = auth_random_token();
    $signature = hash_hmac('sha256', $seed, (string) $config['session_secret'], true);
    return $seed . '.' . auth_base64url($signature);
}

function auth_access_for_email(array $config, string $email): string
{
    $normalized = strtolower(trim($email));
    // 管理者リストのアカウントは専用入口だけで利用します。
    // 招待データや古い一般セッションが残っていても通常利用を許可しません。
    if (auth_is_admin($config, $normalized)) return 'admin_only';
    $record = auth_load_user_registry($config)[$normalized] ?? null;
    if (($record['status'] ?? '') === 'disabled') return 'disabled';
    if (($record['status'] ?? '') === 'active') return 'active';
    return 'not_invited';
}

function auth_is_owner_member(array $config, string $email): bool
{
    $owner = strtolower(trim((string) ($config['owner_member_email'] ?? '')));
    $email = strtolower(trim($email));
    return $owner !== '' && $email !== '' && hash_equals($owner, $email) && !auth_is_admin($config, $email);
}

function auth_email_login_allowed(array $config, string $email): bool
{
    $normalized = strtolower(trim($email));
    return ($config['email_login_enabled'] ?? false) === true
        && $normalized !== ''
        && in_array($normalized, auth_normalize_emails($config['email_login_allowed_emails'] ?? []), true)
        && !auth_is_admin($config, $normalized)
        && auth_access_for_email($config, $normalized) === 'active';
}

function auth_email_login_claims_allowed(array $config, string $email, array $claims): bool
{
    return auth_email_login_allowed($config, $email)
        && ($claims['email_verified'] ?? false) === true
        && empty($claims['identities']);
}

function auth_destroy_session(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => 'Lax',
        ]);
    }
    session_destroy();
}
