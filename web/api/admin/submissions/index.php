<?php

declare(strict_types=1);

define('MOJIGOTO_ADMIN_AUTH', true);

require dirname(__DIR__, 2) . '/forms/bootstrap.php';
require_once dirname(__DIR__) . '/privacy.php';

function submissions_require_admin(array $config): array
{
    return auth_require_admin_session($config);
}

function submissions_response(array $items, ?array $notification = null): void
{
    $summary = ['total' => count($items), 'open' => 0, 'applications' => 0, 'contacts' => 0];
    foreach ($items as $item) {
        if ($item['status'] === 'open') $summary['open']++;
        if ($item['type'] === 'application') $summary['applications']++;
        if ($item['type'] === 'contact') $summary['contacts']++;
    }
    $items = admin_public_submissions($items);
    auth_json(['ok' => true, 'summary' => $summary, 'items' => $items, 'notification' => $notification]);
}

try {
    $method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, ['GET', 'POST'], true)) auth_json(['message' => 'Method not allowed'], 405);
    $config = auth_session_start();
    $actor = submissions_require_admin($config);
    if ($method === 'GET') submissions_response(forms_load_submissions($config));

    $origin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    if ($origin !== '' && !hash_equals((string) $config['app_origin'], $origin)) auth_json(['message' => '管理操作を確認できませんでした。'], 403);
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($csrf === '' || $expected === '' || !hash_equals($expected, $csrf)) auth_json(['message' => '管理操作を確認できませんでした。ページを再読み込みしてください。'], 403);
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) auth_json(['message' => '入力内容を確認できませんでした。'], 400);
    $action = (string) ($input['action'] ?? '');
    if (in_array($action, ['approve', 'remove'], true)) auth_require_recent_admin($config);
    $ids = is_array($input['ids'] ?? null) ? $input['ids'] : [$input['id'] ?? ''];
    $ids = array_values(array_unique(array_filter(array_map(fn($value): string => trim((string) $value), $ids))));
    if (!in_array($action, ['mark_open', 'mark_handled', 'approve', 'remove'], true) || !$ids || count($ids) > 100) auth_json(['message' => '管理操作が正しくありません。'], 400);
    if ($action === 'approve' && count($ids) !== 1) auth_json(['message' => '招待への追加は1件ずつ行ってください。'], 400);
    $id = $ids[0];

    $current = forms_load_submissions($config);
    $targets = array_values(array_filter($current, fn(array $item): bool => in_array((string) $item['id'], $ids, true)));
    if (count($targets) !== count($ids)) auth_json(['message' => '対象の受付情報が見つかりません。再読み込みしてください。'], 404);
    $target = $targets[0];
    if ($action === 'approve' && ($target['type'] !== 'application' || ($target['requestKind'] ?? 'join') !== 'join')) auth_json(['message' => '利用申込だけを招待へ追加できます。'], 400);

    $notification = null;
    if ($action === 'approve') {
        $email = $target['email'];
        $actorEmail = strtolower(trim((string) ($actor['email'] ?? '')));
        auth_mutate_user_registry($config, function (array &$users) use ($config, $email, $actorEmail): void {
            $now = gmdate('c');
            $record = $users[$email] ?? ['userId' => auth_user_id($config, $email), 'email' => $email, 'nickname' => '', 'provider' => '', 'createdAt' => $now, 'lastLoginAt' => '', 'audit' => []];
            if (($record['createdAt'] ?? '') === '') $record['createdAt'] = $now;
            $record['role'] = auth_is_admin($config, $email) ? 'admin' : 'member';
            $record['status'] = 'active';
            $record['removedAt'] = '';
            $record['updatedAt'] = $now;
            $record['audit'] = array_slice(array_merge([['at' => $now, 'actor' => $actorEmail, 'action' => 'add', 'target' => auth_user_id($config, $email, $record['userId'] ?? '')]], auth_normalize_audit_entries($record['audit'] ?? [], 49)), 0, 50);
            $users[$email] = $record;
        });
        $notification = forms_membership_mail($config, $email, 'activated');
    }

    $items = forms_mutate_submissions($config, function (array &$items) use ($action, $ids): void {
        if ($action === 'remove') {
            $items = array_values(array_filter($items, fn(array $item): bool => !in_array((string) $item['id'], $ids, true)));
            return;
        }
        foreach ($items as &$item) {
            if (!in_array((string) $item['id'], $ids, true)) continue;
            $item['status'] = $action === 'mark_open' ? 'open' : ($action === 'approve' ? 'approved' : 'handled');
            $item['completedAt'] = $item['status'] === 'open' ? '' : gmdate('c');
        }
        unset($item);
    });
    submissions_response($items, $notification);
} catch (Throwable $error) {
    error_log('[mojigoto-submissions] ' . $error->getMessage());
    auth_json(['message' => '受付情報を更新できませんでした。'], 500);
}
