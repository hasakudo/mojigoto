<?php

declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_json(['message' => 'Method not allowed'], 405);
    }
    $config = auth_session_start();
    $user = is_array($_SESSION['user'] ?? null) ? $_SESSION['user'] : null;
    $ttl = max(300, (int) ($config['session_ttl_seconds'] ?? 43200));
    if (!$user || time() - (int) ($_SESSION['authenticated_at'] ?? 0) > $ttl) {
        if ($user) {
            auth_destroy_session();
        }
        // サイト全体にHTTP Basic認証が設定されている環境では、APIの401が
        // ブラウザーの再認証と競合するため、未ログイン状態は正常なJSONとして返す。
        auth_json(['authenticated' => false, 'access' => 'anonymous']);
    }
    $access = auth_access_for_email($config, (string) ($user['email'] ?? ''));
    $email = strtolower(trim((string) ($user['email'] ?? '')));
    $registryRecord = auth_load_user_registry($config)[$email] ?? [];
    $publicUser = [
        'id' => auth_user_id($config, $email, $registryRecord['userId'] ?? ''),
        'email' => (string) ($user['email'] ?? ''),
        'nickname' => auth_nickname_for_email($config, (string) ($user['email'] ?? '')),
        'provider' => (string) ($user['provider'] ?? ''),
    ];
    $_SESSION['user'] = $publicUser;
    auth_json([
        'authenticated' => true,
        'access' => $access,
        'isAdmin' => false,
        'csrfToken' => (string) ($_SESSION['csrf_token'] ?? ''),
        'user' => $publicUser,
    ], $access === 'active' ? 200 : 403);
} catch (Throwable $error) {
    error_log('[mojigoto-auth] ' . $error->getMessage());
    auth_json(['message' => 'ログイン設定を確認できませんでした。'], 500);
}
