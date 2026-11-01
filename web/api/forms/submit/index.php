<?php

declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';

try {
    if ((string) ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') auth_json(['message' => 'Method not allowed'], 405);
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 16384) auth_json(['message' => '送信内容が大きすぎます。'], 413);
    $config = auth_config();
    $origin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    if ($origin === '' || !hash_equals((string) $config['app_origin'], $origin)) auth_json(['message' => '送信元を確認できませんでした。'], 403);
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) auth_json(['message' => '入力内容を確認できませんでした。'], 400);
    if (trim((string) ($input['company'] ?? '')) !== '') auth_json(['ok' => true, 'message' => '送信しました。']);
    if (($input['privacyConsent'] ?? '') !== 'yes') auth_json(['message' => 'プライバシーポリシーへの同意が必要です。'], 400);

    $type = (string) ($input['type'] ?? '');
    if (!in_array($type, ['application', 'contact'], true)) auth_json(['message' => 'フォームの種類を確認できませんでした。'], 400);
    forms_check_rate_limit($config);
    forms_verify_turnstile($config, trim((string) ($input['turnstileToken'] ?? '')), $type);

    $email = strtolower(trim((string) ($input['email'] ?? '')));
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) auth_json(['message' => '正しいメールアドレスを入力してください。'], 400);
    $record = [
        'id' => gmdate('YmdHis') . '-' . bin2hex(random_bytes(4)),
        'type' => $type,
        'status' => 'open',
        'createdAt' => gmdate('c'),
        'completedAt' => '',
        'name' => forms_text($input['name'] ?? '', 50),
        'email' => $email,
        'subject' => '',
        'discovery' => '',
        'requestKind' => 'join',
        'message' => forms_text($input['message'] ?? '', $type === 'application' ? 2000 : 3000, $type !== 'application', $type === 'contact' ? 10 : 0),
    ];
    if ($type === 'application') {
        $requestKind = (string) ($input['requestKind'] ?? 'join');
        if (!in_array($requestKind, ['join', 'withdraw'], true)) auth_json(['message' => '申請の種類を選択してください。'], 400);
        $discovery = (string) ($input['discovery'] ?? '');
        if ($requestKind === 'join' && !in_array($discovery, ['friend', 'social', 'website', 'other'], true)) auth_json(['message' => 'もじごとを知ったきっかけを選択してください。'], 400);
        if ($requestKind === 'withdraw') $discovery = '';
        $record['requestKind'] = $requestKind;
        $record['discovery'] = $discovery;
    } else {
        $record['subject'] = forms_text($input['subject'] ?? '', 100);
    }
    forms_assert_content_allowed($config, [
        $record['name'], $record['email'], $record['subject'], $record['message'],
    ]);
    forms_mutate_submissions($config, function (array &$items) use ($record): void { array_unshift($items, $record); });
    $mailResult = forms_mail($config, $record);
    $mailAccepted = ($mailResult['adminAccepted'] ?? false) && ($mailResult['replyAccepted'] ?? false);
    auth_json([
        'ok' => true,
        'mailAccepted' => $mailAccepted,
        'message' => $mailAccepted
            ? '送信しました。受付メールをご確認ください。'
            : '受付内容は保存されましたが、確認メールを送信できませんでした。管理者が受付内容を確認します。',
    ]);
} catch (DomainException $error) {
    auth_json(['message' => $error->getMessage()], 429);
} catch (InvalidArgumentException $error) {
    auth_json(['message' => $error->getMessage()], 400);
} catch (LogicException $error) {
    error_log('[mojigoto-forms] ' . $error->getMessage());
    auth_json(['message' => 'フォームのサーバー設定が完了していません。管理者へお知らせください。'], 503);
} catch (Throwable $error) {
    error_log('[mojigoto-forms] ' . $error->getMessage());
    auth_json(['message' => '送信できませんでした。時間をおいてもう一度お試しください。'], 500);
}
