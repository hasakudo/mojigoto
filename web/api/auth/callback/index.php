<?php

declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';

try {
    $config = auth_session_start();
    $oauth = is_array($_SESSION['oauth'] ?? null) ? $_SESSION['oauth'] : [];
    if (isset($_GET['error'])) {
        unset($_SESSION['oauth']);
        auth_error_page('ログインが中止されたか、認証サービスで拒否されました。');
    }
    if (!$oauth || time() - (int) ($oauth['created_at'] ?? 0) > 600) {
        unset($_SESSION['oauth']);
        auth_error_page('ログイン操作の有効時間が切れました。もう一度お試しください。');
    }
    $receivedState = (string) ($_GET['state'] ?? '');
    if ($receivedState === '' || !hash_equals((string) $oauth['state'], $receivedState)) {
        unset($_SESSION['oauth']);
        auth_error_page('ログイン状態を確認できませんでした。もう一度お試しください。');
    }
    $code = trim((string) ($_GET['code'] ?? ''));
    if ($code === '') {
        throw new RuntimeException('認可コードがありません。');
    }

    $tokenBody = http_build_query([
        'grant_type' => 'authorization_code',
        'client_id' => $config['client_id'],
        'code' => $code,
        'code_verifier' => $oauth['verifier'],
        'redirect_uri' => $config['callback_url'],
    ], '', '&', PHP_QUERY_RFC3986);
    $tokenResponse = auth_http($config['cognito_domain'] . '/oauth2/token', 'POST', [
        'Accept: application/json',
        'Content-Type: application/x-www-form-urlencoded',
        'Authorization: Basic ' . base64_encode($config['client_id'] . ':' . $config['client_secret']),
    ], $tokenBody);
    $tokens = json_decode($tokenResponse['body'], true);
    if ($tokenResponse['status'] !== 200 || !is_array($tokens) || empty($tokens['access_token']) || empty($tokens['id_token'])) {
        throw new RuntimeException('Cognitoのトークン交換に失敗しました。');
    }

    $idClaims = auth_verify_id_token((string) $tokens['id_token'], $config, (string) $oauth['nonce']);

    $userResponse = auth_http($config['cognito_domain'] . '/oauth2/userInfo', 'GET', [
        'Accept: application/json',
        'Authorization: Bearer ' . $tokens['access_token'],
    ]);
    $profile = json_decode($userResponse['body'], true);
    if ($userResponse['status'] !== 200 || !is_array($profile)) {
        throw new RuntimeException('ログインユーザー情報を取得できませんでした。');
    }
    if (($profile['sub'] ?? '') !== $idClaims['sub']) {
        throw new RuntimeException('ログインユーザーとIDトークンが一致しません。');
    }
    $email = strtolower(trim((string) ($profile['email'] ?? $idClaims['email'] ?? '')));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('ログインアカウントのメールアドレスを取得できませんでした。');
    }

    if (!auth_admin_mode() && auth_is_admin($config, $email)) {
        auth_destroy_session();
        auth_error_page('このアカウントは管理専用です。普段の利用アカウントでログインしてください。管理操作は管理者専用入口から行ってください。', 403);
    }

    if (($oauth['provider'] ?? '') === 'email') {
        // メール文字列だけで既存アカウントの権限を引き継がせないため、
        // 確認済みemailを持つCognitoローカルユーザーに限定します。
        if (!auth_email_login_claims_allowed($config, $email, $idClaims)) {
            unset($_SESSION['oauth']);
            auth_error_page('このアカウントではメールアドレス・パスワードログインを利用できません。', 403);
        }
    }

    $sessionUser = [
        'id' => (string) ($profile['sub'] ?? $idClaims['sub'] ?? ''),
        'email' => $email,
        'nickname' => '',
        'provider' => (string) $oauth['provider'],
    ];
    if (auth_admin_mode()) {
        if (!auth_is_admin($config, $email) || !in_array($sessionUser['provider'], ['google', 'microsoft'], true)) {
            auth_destroy_session();
            auth_error_page('このアカウントには管理者権限がありません。', 403);
        }
        $authTime = (int) ($idClaims['auth_time'] ?? 0);
        if ($authTime <= 0 || $authTime > time() + 60 || time() - $authTime > 120) {
            unset($_SESSION['oauth']);
            auth_error_page('新しい管理者認証を確認できませんでした。専用入口からやり直してください。', 403);
        }
    }
    try {
        auth_record_login($config, $sessionUser, ['issuer' => $idClaims['iss'], 'sub' => $idClaims['sub']]);
        $sessionUser['nickname'] = auth_nickname_for_email($config, $email);
    } catch (Throwable $registryError) {
        error_log('[mojigoto-auth] login record: ' . $registryError->getMessage());
    }

    session_regenerate_id(true);
    $_SESSION['user'] = $sessionUser;
    $_SESSION['authenticated_at'] = time();
    if (auth_admin_mode()) {
        $_SESSION['admin_authenticated'] = true;
        $_SESSION['admin_last_activity_at'] = time();
    }
    $_SESSION['csrf_token'] = auth_random_token();
    $_SESSION['refresh_token'] = (string) ($tokens['refresh_token'] ?? '');
    $returnTo = auth_safe_return_to((string) ($oauth['return_to'] ?? '/'));
    unset($_SESSION['oauth']);
    if ($sessionUser['provider'] === 'email') {
        try {
            require_once dirname(__DIR__) . '/review-login-notification.php';
            auth_notify_review_login($config, $sessionUser);
        } catch (Throwable $notificationError) {
            error_log('[mojigoto-review-login] notification unavailable');
        }
    }
    auth_redirect($config['app_origin'] . $returnTo);
} catch (Throwable $error) {
    unset($_SESSION['oauth']);
    error_log('[mojigoto-auth] ' . $error->getMessage());
    auth_error_page('認証処理を完了できませんでした。時間をおいてもう一度お試しください。', 500);
}
