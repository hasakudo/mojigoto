<?php
declare(strict_types=1);
define('MOJIGOTO_ADMIN_AUTH', true);
require dirname(__DIR__, 3) . '/auth/bootstrap.php';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') auth_json(['message' => 'Method not allowed'], 405);
    $config = auth_session_start();
    $status = auth_admin_status($config, $_SESSION, time());
    if ($status !== 'active') {
        if (!empty($_SESSION['user'])) auth_destroy_session();
        auth_json(['authenticated' => false, 'access' => 'anonymous']);
    }
    auth_json(['authenticated' => true, 'access' => 'active', 'isAdmin' => true,
        'csrfToken' => (string) $_SESSION['csrf_token'],
        'user' => ['id' => auth_user_id($config, (string) $_SESSION['user']['email']), 'provider' => $_SESSION['user']['provider']],
        'idleExpiresAt' => (int) $_SESSION['admin_last_activity_at'] + max(60, min(900, (int) ($config['admin_idle_timeout_seconds'] ?? 900))),
        'absoluteExpiresAt' => (int) $_SESSION['authenticated_at'] + (int) $config['session_ttl_seconds'],
        'recentAuthentication' => auth_admin_recent($config, $_SESSION, time())]);
} catch (Throwable $error) {
    error_log('[mojigoto-admin-auth] ' . $error->getMessage());
    auth_json(['message' => '管理者認証の設定を確認できませんでした。'], 503);
}
