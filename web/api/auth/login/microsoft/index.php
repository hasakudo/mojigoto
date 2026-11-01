<?php

declare(strict_types=1);

require dirname(__DIR__, 2) . '/bootstrap.php';

try {
    $config = auth_session_start();
    $provider = trim((string) (($config['identity_providers']['microsoft'] ?? '')));
    if ($provider === '') {
        auth_error_page('Microsoftログインはまだ設定されていません。', 503);
    }
    $state = auth_create_oauth_state($config);
    $nonce = auth_random_token();
    $verifier = auth_random_token(48);
    $_SESSION['oauth'] = [
        'state' => $state,
        'nonce' => $nonce,
        'verifier' => $verifier,
        'provider' => 'microsoft',
        'return_to' => auth_safe_return_to($_GET['return_to'] ?? '/'),
        'created_at' => time(),
    ];
    $query = http_build_query([
        'response_type' => 'code',
        'client_id' => $config['client_id'],
        'redirect_uri' => $config['callback_url'],
        'scope' => 'openid email',
        'state' => $state,
        'nonce' => $nonce,
        'code_challenge_method' => 'S256',
        'code_challenge' => auth_base64url(hash('sha256', $verifier, true)),
        'identity_provider' => $provider,
        'prompt' => 'select_account',
    ], '', '&', PHP_QUERY_RFC3986);
    auth_redirect($config['cognito_domain'] . '/oauth2/authorize?' . $query);
} catch (Throwable $error) {
    error_log('[mojigoto-auth] ' . $error->getMessage());
    auth_error_page('ログイン設定を確認できませんでした。管理者へ連絡してください。', 500);
}
