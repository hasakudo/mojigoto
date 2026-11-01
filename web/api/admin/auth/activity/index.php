<?php
declare(strict_types=1);
define('MOJIGOTO_ADMIN_AUTH', true);
require dirname(__DIR__, 3) . '/auth/bootstrap.php';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') auth_json(['message' => 'Method not allowed'], 405);
    $config = auth_session_start();
    auth_require_admin_session($config);
    auth_admin_csrf($config);
    $_SESSION['admin_last_activity_at'] = time();
    auth_json(['ok' => true]);
} catch (Throwable $error) { auth_json(['message' => '管理セッションを更新できませんでした。'], 503); }
