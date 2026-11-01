<?php

declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_json(['message' => 'Method not allowed'], 405);
    }
    $config = auth_config();
    $enabled = ($config['email_login_enabled'] ?? false) === true
        && count(auth_normalize_emails($config['email_login_allowed_emails'] ?? [])) > 0;
    // 許可メールアドレスや認証設定は公開しません。
    auth_json(['enabled' => $enabled]);
} catch (Throwable $error) {
    error_log('[mojigoto-auth] ' . $error->getMessage());
    auth_json(['message' => '受付状況を確認できませんでした。'], 500);
}
