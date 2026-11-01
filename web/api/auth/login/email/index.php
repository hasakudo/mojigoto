<?php

declare(strict_types=1);

require dirname(__DIR__, 2) . '/bootstrap.php';

try {
    $config = auth_session_start();
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_error_page('この操作は許可されていません。', 405);
    }
    $allowed = auth_normalize_emails($config['email_login_allowed_emails'] ?? []);
    if (($config['email_login_enabled'] ?? false) !== true || !$allowed) {
        auth_error_page('メールアドレス・パスワードログインは現在利用できません。', 503);
    }
    $state = auth_create_oauth_state($config);
    $nonce = auth_random_token();
    $verifier = auth_random_token(48);
    $_SESSION['oauth'] = [
        'state' => $state,
        'nonce' => $nonce,
        'verifier' => $verifier,
        'provider' => 'email',
        'return_to' => auth_safe_return_to($_GET['return_to'] ?? '/'),
        'created_at' => time(),
    ];
    // IdPを指定せず、Cognitoのログイン画面へ進みます。
    // もじごとのPHP・JavaScriptではパスワードを受け取りません。
    $query = http_build_query([
        'response_type' => 'code',
        'client_id' => $config['client_id'],
        'redirect_uri' => $config['callback_url'],
        'scope' => 'openid email',
        'state' => $state,
        'nonce' => $nonce,
        'code_challenge_method' => 'S256',
        'code_challenge' => auth_base64url(hash('sha256', $verifier, true)),
        'prompt' => 'login',
    ], '', '&', PHP_QUERY_RFC3986);
    auth_redirect($config['cognito_domain'] . '/oauth2/authorize?' . $query);
} catch (Throwable $error) {
    error_log('[mojigoto-auth] ' . $error->getMessage());
    auth_error_page('ログイン設定を確認できませんでした。管理者へ連絡してください。', 500);
}
