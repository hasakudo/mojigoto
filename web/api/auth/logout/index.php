<?php

declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        auth_json(['message' => 'Method not allowed'], 405);
    }
    $config = auth_session_start();
    $origin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    if ($origin !== '' && !hash_equals($config['app_origin'], $origin)) {
        auth_json(['message' => 'ログアウト要求を確認できませんでした。'], 403);
    }
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($csrf === '' || $expected === '' || !hash_equals($expected, $csrf)) {
        auth_json(['message' => 'ログアウト要求を確認できませんでした。'], 403);
    }
    $refreshToken = (string) ($_SESSION['refresh_token'] ?? '');
    if ($refreshToken !== '') {
        try {
            auth_http($config['cognito_domain'] . '/oauth2/revoke', 'POST', [
                'Accept: application/json',
                'Content-Type: application/x-www-form-urlencoded',
                'Authorization: Basic ' . base64_encode($config['client_id'] . ':' . $config['client_secret']),
            ], http_build_query([
                'token' => $refreshToken,
                'client_id' => $config['client_id'],
            ], '', '&', PHP_QUERY_RFC3986));
        } catch (Throwable $ignored) {
        }
    }
    auth_destroy_session();
    $logoutUrl = $config['cognito_domain'] . '/logout?' . http_build_query([
        'client_id' => $config['client_id'],
        'logout_uri' => $config['logout_url'],
    ], '', '&', PHP_QUERY_RFC3986);
    auth_json(['ok' => true, 'logoutUrl' => $logoutUrl]);
} catch (Throwable $error) {
    error_log('[mojigoto-auth] ' . $error->getMessage());
    auth_json(['message' => 'ログアウトできませんでした。'], 500);
}
