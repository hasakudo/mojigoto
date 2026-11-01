<?php
declare(strict_types=1);
define('MOJIGOTO_ADMIN_AUTH', true);
require dirname(__DIR__, 3) . '/auth/bootstrap.php';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') auth_error_page('この操作は許可されていません。', 405);
    $config = auth_session_start();
    $provider = (string) ($_GET['provider'] ?? '');
    if (!in_array($provider, ['google', 'microsoft'], true)) auth_error_page('管理者ログイン方法を選択してください。');
    $idp = trim((string) ($config['identity_providers'][$provider] ?? ''));
    if ($idp === '') auth_error_page('管理者ログイン方法が未設定です。', 503);
    $nonce = auth_random_token();
    $verifier = auth_random_token(48);
    $state = auth_create_oauth_state($config);
    $_SESSION['oauth'] = ['state' => $state, 'nonce' => $nonce, 'verifier' => $verifier,
        'provider' => $provider, 'return_to' => '/admin/', 'created_at' => time()];
    auth_redirect($config['cognito_domain'] . '/oauth2/authorize?' . http_build_query([
        'response_type' => 'code', 'client_id' => $config['client_id'], 'redirect_uri' => $config['callback_url'],
        'scope' => 'openid email', 'state' => $state, 'nonce' => $nonce,
        'code_challenge_method' => 'S256', 'code_challenge' => auth_base64url(hash('sha256', $verifier, true)),
        'identity_provider' => $idp, 'prompt' => 'login',
    ], '', '&', PHP_QUERY_RFC3986));
} catch (Throwable $error) {
    error_log('[mojigoto-admin-auth] ' . $error->getMessage());
    auth_error_page('管理者ログインの設定を確認できませんでした。', 503);
}
