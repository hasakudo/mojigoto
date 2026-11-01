<?php
declare(strict_types=1);

function auth_admin_mode(): bool
{
    return defined('MOJIGOTO_ADMIN_AUTH') && MOJIGOTO_ADMIN_AUTH === true;
}

function auth_admin_config(array $config): array
{
    foreach (['admin_client_id', 'admin_client_secret'] as $key) {
        if (trim((string) ($config[$key] ?? '')) === '') throw new RuntimeException('管理者専用Cognitoクライアントが未設定です。');
    }
    if ($config['admin_client_id'] === $config['client_id']) throw new RuntimeException('管理者クライアントは一般利用者と分けてください。');
    $cookie = (string) ($config['admin_session_cookie'] ?? (($config['session_cookie'] ?? 'mojigoto_session') . '_admin'));
    if ($cookie === ($config['session_cookie'] ?? 'mojigoto_session')) throw new RuntimeException('管理者Cookieは一般利用者と分けてください。');
    return array_merge($config, [
        'client_id' => $config['admin_client_id'],
        'client_secret' => $config['admin_client_secret'],
        'callback_url' => $config['app_origin'] . '/api/admin/auth/callback',
        'logout_url' => $config['app_origin'] . '/admin/login/',
        'session_cookie' => $cookie,
        'session_ttl_seconds' => max(300, min(3600, (int) ($config['admin_absolute_timeout_seconds'] ?? 3600))),
    ]);
}

function auth_admin_status(array $config, array $session, int $now): string
{
    if (empty($session['admin_authenticated']) || !is_array($session['user'] ?? null)) return 'anonymous';
    $user = $session['user'];
    if (!auth_is_admin($config, (string) ($user['email'] ?? '')) || !in_array($user['provider'] ?? '', ['google', 'microsoft'], true)) return 'forbidden';
    $started = (int) ($session['authenticated_at'] ?? 0);
    $active = (int) ($session['admin_last_activity_at'] ?? 0);
    $absolute = max(300, min(3600, (int) ($config['admin_absolute_timeout_seconds'] ?? 3600)));
    $idle = max(60, min(900, (int) ($config['admin_idle_timeout_seconds'] ?? 900)));
    if ($started <= 0 || $active < $started || $started > $now || $active > $now
        || $now - $started >= $absolute || $now - $active >= $idle) return 'expired';
    return 'active';
}

function auth_require_admin_session(array $config): array
{
    $status = auth_admin_status($config, $_SESSION, time());
    if ($status !== 'active') {
        if (!empty($_SESSION['user'])) auth_destroy_session();
        auth_json(['message' => $status === 'forbidden' ? '管理者のみ利用できます。' : '管理者専用入口から再ログインしてください。', 'code' => 'admin_session_required'], $status === 'forbidden' ? 403 : 401);
    }
    return $_SESSION['user'];
}

function auth_admin_recent(array $config, array $session, int $now): bool
{
    $limit = max(60, min(300, (int) ($config['admin_recent_auth_seconds'] ?? 300)));
    return auth_admin_status($config, $session, $now) === 'active'
        && $now - (int) ($session['authenticated_at'] ?? 0) < $limit;
}

function auth_require_recent_admin(array $config): void
{
    if (!auth_admin_recent($config, $_SESSION, time())) {
        auth_json(['message' => 'この操作には管理者の再認証が必要です。再ログイン後に内容を確認して実行してください。', 'code' => 'admin_reauthentication_required'], 403);
    }
}

function auth_admin_csrf(array $config): void
{
    $origin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if (($origin !== '' && !hash_equals((string) $config['app_origin'], $origin))
        || $csrf === '' || $expected === '' || !hash_equals($expected, $csrf)) auth_json(['message' => '管理操作を確認できませんでした。'], 403);
}
