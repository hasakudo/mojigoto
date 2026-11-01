<?php

declare(strict_types=1);

define('MOJIGOTO_ADMIN_AUTH', true);

require dirname(__DIR__, 2) . '/forms/bootstrap.php';
require_once dirname(__DIR__) . '/privacy.php';

function admin_mail_require_user(array $config): array
{
    return auth_require_admin_session($config);
}

function admin_mail_response(array $config, array $extra = [], int $status = 200): void
{
    auth_json(admin_redact_emails(array_merge(['ok' => true, 'items' => forms_load_sent_mail($config), 'retentionDays' => 90], $extra)), $status);
}

try {
    $method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, ['GET', 'POST'], true)) auth_json(['message' => 'Method not allowed'], 405);
    $config = auth_session_start();
    $actor = admin_mail_require_user($config);
    if ($method === 'GET') admin_mail_response($config);

    $origin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    if ($origin !== '' && !hash_equals((string) $config['app_origin'], $origin)) auth_json(['message' => '管理操作を確認できませんでした。'], 403);
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($csrf === '' || $expected === '' || !hash_equals($expected, $csrf)) {
        auth_json(['message' => '管理操作を確認できませんでした。ページを再読み込みしてください。'], 403);
    }

    auth_require_recent_admin($config);
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) auth_json(['message' => '入力内容を確認できませんでした。'], 400);
    $action = trim((string) ($input['action'] ?? 'send'));
    if (in_array($action, ['archive', 'restore', 'remove'], true)) {
        $ids = is_array($input['ids'] ?? null) ? $input['ids'] : [$input['id'] ?? ''];
        $ids = array_values(array_unique(array_filter(array_map(fn($value): string => trim((string) $value), $ids))));
        if (!$ids || count($ids) > 100) auth_json(['message' => '対象の送信履歴が見つかりません。'], 400);
        $found = false;
        $items = forms_mutate_sent_mail($config, function (array &$items) use ($action, $ids, &$found): void {
            if ($action === 'remove') {
                $before = count($items);
                $items = array_values(array_filter($items, fn(array $item): bool => !in_array((string) $item['id'], $ids, true)));
                $found = count($items) !== $before;
                return;
            }
            foreach ($items as &$item) {
                if (!in_array((string) $item['id'], $ids, true)) continue;
                $item['status'] = $action === 'archive' ? 'archived' : 'active';
                $found = true;
            }
            unset($item);
        });
        if (!$found) auth_json(['message' => '対象の送信履歴が見つかりません。'], 404);
        admin_mail_response($config, ['items' => $items, 'message' => $action === 'remove' ? '送信履歴を削除しました。' : '送信履歴を更新しました。']);
    }
    if ($action !== 'send') auth_json(['message' => '管理操作が正しくありません。'], 400);
    if ((int) ($_SESSION['admin_mail_last_sent_at'] ?? 0) > time() - 30) {
        auth_json(['message' => '連続送信を防ぐため、30秒ほど待ってからお試しください。'], 429);
    }

    $mode = trim((string) ($input['mode'] ?? ''));
    $subject = forms_text($input['subject'] ?? '', 100);
    $message = forms_text($input['message'] ?? '', 5000);
    if (preg_match('/[\r\n]/', $subject)) auth_json(['message' => '件名に改行は使用できません。'], 400);
    if (!in_array($mode, ['individual', 'all_active'], true)) auth_json(['message' => '送信先が正しくありません。'], 400);

    $users = auth_load_user_registry($config);
    $recipients = [];
    $requestedUserId = trim((string) ($input['userId'] ?? ''));
    foreach ($users as $email => $record) {
        $normalizedEmail = strtolower(trim((string) ($record['email'] ?? $email)));
        if (!filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL)) continue;
        if (($record['status'] ?? 'active') !== 'active' || auth_is_admin($config, $normalizedEmail)) continue;
        $userId = auth_user_id($config, $normalizedEmail, $record['userId'] ?? '');
        if ($mode === 'individual' && !hash_equals($requestedUserId, $userId)) continue;
        $recipients[$userId] = [
            'email' => $normalizedEmail,
            'displayName' => trim((string) ($record['nickname'] ?? '')) ?: 'もじごとWeb利用者',
        ];
    }
    if (!$recipients) auth_json(['message' => '送信対象の有効な利用者が見つかりません。'], 404);
    if (count($recipients) > 50) auth_json(['message' => '安全のため一度に送信できるのは50件までです。配信サービスへの切り替えを検討してください。'], 400);

    $_SESSION['admin_mail_last_sent_at'] = time();
    session_write_close();
    $accepted = 0;
    $failed = 0;
    $acceptedUserIds = [];
    foreach ($recipients as $userId => $recipient) {
        $result = forms_admin_message_mail($config, $recipient['email'], $recipient['displayName'], $subject, $message);
        if (($result['accepted'] ?? false) === true) {
            $accepted++;
            $acceptedUserIds[] = $userId;
        } else {
            $failed++;
        }
    }

    $archiveWarning = '';
    try {
        $sentAt = gmdate('c');
        $sentId = 'MAIL-' . strtoupper(substr(bin2hex(random_bytes(10)), 0, 16));
        forms_mutate_sent_mail($config, function (array &$items) use ($sentId, $sentAt, $mode, $recipients, $subject, $message, $accepted, $failed): void {
            array_unshift($items, [
                'id' => $sentId, 'sentAt' => $sentAt, 'status' => 'active', 'mode' => $mode,
                'recipientIds' => array_keys($recipients), 'subject' => $subject, 'message' => $message,
                'attempted' => count($recipients), 'accepted' => $accepted, 'failed' => $failed,
            ]);
        });
    } catch (Throwable $archiveError) {
        $archiveWarning = '送信は実行されましたが、送信ボックスへ保存できませんでした。再送せず管理者へ確認してください。';
        error_log('[mojigoto-admin-mail] archive write failed: ' . $archiveError->getMessage());
    }

    if ($acceptedUserIds) {
        try {
            $actorEmail = strtolower(trim((string) ($actor['email'] ?? '')));
            auth_mutate_user_registry($config, function (array &$records) use ($config, $acceptedUserIds, $actorEmail): void {
                $now = gmdate('c');
                foreach ($records as $email => &$record) {
                    $userId = auth_user_id($config, (string) $email, $record['userId'] ?? '');
                    if (!in_array($userId, $acceptedUserIds, true)) continue;
                    $record['audit'] = array_slice(array_merge([[
                        'at' => $now, 'actor' => $actorEmail, 'action' => 'mail_sent', 'target' => $userId,
                    ]], auth_normalize_audit_entries($record['audit'] ?? [], 49)), 0, 50);
                }
                unset($record);
            });
        } catch (Throwable $auditError) {
            error_log('[mojigoto-admin-mail] audit write failed: ' . $auditError->getMessage());
        }
    }
    error_log(sprintf('[mojigoto-admin-mail] actor=%s mode=%s attempted=%d accepted=%d failed=%d',
        auth_user_id($config, (string) ($actor['email'] ?? '')), $mode, count($recipients), $accepted, $failed));
    admin_mail_response($config, [
        'ok' => $failed === 0,
        'attempted' => count($recipients), 'accepted' => $accepted, 'failed' => $failed,
        'archiveWarning' => $archiveWarning,
        'message' => $failed === 0 ? $accepted . '件の送信を受け付けました。' : $accepted . '件を受け付け、' . $failed . '件は送信できませんでした。',
    ]);
} catch (InvalidArgumentException $error) {
    auth_json(['message' => $error->getMessage()], 400);
} catch (Throwable $error) {
    error_log('[mojigoto-admin-mail] ' . $error->getMessage());
    auth_json(['message' => 'お知らせメールを処理できませんでした。'], 500);
}
