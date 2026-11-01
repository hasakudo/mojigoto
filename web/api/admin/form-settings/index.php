<?php

declare(strict_types=1);

define('MOJIGOTO_ADMIN_AUTH', true);

require dirname(__DIR__, 2) . '/forms/bootstrap.php';

function form_settings_require_admin(array $config): void
{
    auth_require_admin_session($config);
}

try {
    $method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, ['GET', 'POST'], true)) auth_json(['message' => 'Method not allowed'], 405);
    $config = auth_session_start();
    form_settings_require_admin($config);
    if ($method === 'GET') auth_json(['ok' => true] + forms_load_settings($config));

    $origin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    if ($origin !== '' && !hash_equals((string) $config['app_origin'], $origin)) auth_json(['message' => '管理操作を確認できませんでした。'], 403);
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($csrf === '' || $expected === '' || !hash_equals($expected, $csrf)) auth_json(['message' => '管理操作を確認できませんでした。ページを再読み込みしてください。'], 403);
    auth_require_recent_admin($config);
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) auth_json(['message' => '入力内容を確認できませんでした。'], 400);
    $settings = forms_save_settings($config, ['blockedTerms' => $input['blockedTerms'] ?? []]);
    auth_json(['ok' => true, 'message' => 'フォームの禁止ワードを保存しました。'] + $settings);
} catch (InvalidArgumentException $error) {
    auth_json(['message' => $error->getMessage()], 400);
} catch (Throwable $error) {
    error_log('[mojigoto-form-settings] ' . $error->getMessage());
    auth_json(['message' => 'フォーム設定を保存できませんでした。'], 500);
}
