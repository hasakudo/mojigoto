<?php

declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        auth_json(['message' => 'Method not allowed'], 405);
    }
    $config = auth_session_start();
    $user = is_array($_SESSION['user'] ?? null) ? $_SESSION['user'] : null;
    $ttl = max(300, (int) ($config['session_ttl_seconds'] ?? 43200));
    if (!$user || time() - (int) ($_SESSION['authenticated_at'] ?? 0) > $ttl) {
        if ($user) auth_destroy_session();
        auth_json(['message' => 'ログインが必要です。'], 401);
    }
    $email = strtolower(trim((string) ($user['email'] ?? '')));
    if (auth_access_for_email($config, $email) !== 'active') {
        auth_json(['message' => 'このアカウントは現在利用できません。'], 403);
    }
    $origin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    if ($origin !== '' && !hash_equals($config['app_origin'], $origin)) {
        auth_json(['message' => 'プロフィール更新を確認できませんでした。'], 403);
    }
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($csrf === '' || $expected === '' || !hash_equals($expected, $csrf)) {
        auth_json(['message' => 'プロフィール更新を確認できませんでした。ページを再読み込みしてください。'], 403);
    }
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) auth_json(['message' => '入力内容を確認できませんでした。'], 400);
    try {
        $nickname = auth_set_user_nickname($config, $email, (string) ($input['nickname'] ?? ''));
    } catch (InvalidArgumentException $error) {
        auth_json(['message' => $error->getMessage()], 400);
    }
    $_SESSION['user']['nickname'] = $nickname;
    auth_json(['ok' => true, 'nickname' => $nickname]);
} catch (Throwable $error) {
    error_log('[mojigoto-auth] profile: ' . $error->getMessage());
    auth_json(['message' => 'ニックネームを保存できませんでした。'], 500);
}
