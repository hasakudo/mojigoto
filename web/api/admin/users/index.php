<?php

declare(strict_types=1);

define('MOJIGOTO_ADMIN_AUTH', true);

require dirname(__DIR__, 2) . '/forms/bootstrap.php';
require_once dirname(__DIR__) . '/privacy.php';

function admin_require_user(array $config): array
{
    return auth_require_admin_session($config);
}

function admin_response(array $config, array $users, string $auditWarning = '', ?array $notification = null): void
{
    $visible = admin_public_users($config, $users);
    $summary = ['total' => count($visible), 'active' => 0, 'disabled' => 0, 'admins' => 0];
    foreach ($visible as $record) {
        if ($record['status'] === 'active') $summary['active']++;
        if ($record['status'] === 'disabled') $summary['disabled']++;
        if ($record['role'] === 'admin') $summary['admins']++;
    }
    $audit = [];
    try {
        $audit = auth_load_admin_audit($config, 30);
        $audit = admin_redact_emails($audit);
    } catch (Throwable $auditError) {
        error_log('[mojigoto-admin] audit load: ' . $auditError->getMessage());
    }
    auth_json([
        'ok' => true,
        'summary' => $summary,
        'users' => $visible,
        'removedUsers' => admin_public_users($config, $users, true),
        'audit' => $audit,
        'auditWarning' => $auditWarning,
        'notification' => $notification,
        'emailsUnlocked' => false,
        'emailRevealUntil' => '',
    ]);
}

try {
    $method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, ['GET', 'POST'], true)) {
        auth_json(['message' => 'Method not allowed'], 405);
    }
    $config = auth_session_start();
    $actor = admin_require_user($config);
    if ($method === 'GET') {
        admin_response($config, auth_load_user_registry($config));
    }

    $origin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    if ($origin !== '' && !hash_equals($config['app_origin'], $origin)) {
        auth_json(['message' => '管理操作を確認できませんでした。'], 403);
    }
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($csrf === '' || $expected === '' || !hash_equals($expected, $csrf)) {
        auth_json(['message' => '管理操作を確認できませんでした。ページを再読み込みしてください。'], 403);
    }
    auth_require_recent_admin($config);
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) auth_json(['message' => '入力内容を確認できませんでした。'], 400);
    $action = (string) ($input['action'] ?? '');
    if (!in_array($action, ['add', 'set_status', 'remove'], true)) {
        auth_json(['message' => '管理操作が正しくありません。'], 400);
    }
    $currentUsers = auth_load_user_registry($config);
    $email = '';
    if ($action === 'add') {
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        if ($email === '' || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            auth_json(['message' => '正しいメールアドレスを入力してください。'], 400);
        }
    } else {
        $userId = trim((string) ($input['userId'] ?? ''));
        foreach ($currentUsers as $candidateEmail => $record) {
            if (hash_equals(auth_user_id($config, $candidateEmail, $record['userId'] ?? ''), $userId)) {
                $email = $candidateEmail;
                break;
            }
        }
        if ($email === '') auth_json(['message' => '対象の利用者が見つかりません。'], 404);
    }
    if (auth_is_admin($config, $email) && $action !== 'add') auth_json(['message' => '管理者アカウントは停止・削除できません。'], 400);
    if ($action === 'remove' && auth_is_owner_member($config, $email)) auth_json(['message' => '自分の普段用アカウントは削除から保護されています。', 'code' => 'owner_account_protected'], 403);
    $status = (string) ($input['status'] ?? '');
    if ($action === 'set_status' && !in_array($status, ['active', 'disabled'], true)) {
        auth_json(['message' => '利用状態が正しくありません。'], 400);
    }
    if ($action === 'add' && isset($currentUsers[$email]) && ($currentUsers[$email]['status'] ?? '') === 'active') {
        auth_json(['message' => 'このメールアドレスはすでに招待利用者へ追加されています。'], 400);
    }
    if ($action !== 'add' && (!isset($currentUsers[$email]) || ($currentUsers[$email]['status'] ?? '') === 'removed')) {
        auth_json(['message' => '対象の利用者が見つかりません。'], 404);
    }

    $auditAction = $action === 'set_status' ? ($status === 'active' ? 'enabled' : 'disabled') : $action;
    $actorEmail = strtolower(trim((string) ($actor['email'] ?? '')));
    $users = auth_mutate_user_registry($config, function (array &$records) use ($config, $action, $email, $status, $auditAction, $actorEmail): void {
        $now = gmdate('c');
        $record = $records[$email] ?? [
            'userId' => auth_user_id($config, $email),
            'email' => $email,
            'nickname' => '',
            'provider' => '',
            'role' => auth_is_admin($config, $email) ? 'admin' : 'member',
            'createdAt' => $now,
            'lastLoginAt' => '',
        ];
        if ($action === 'add') {
            if (($record['createdAt'] ?? '') === '') $record['createdAt'] = $now;
            $record['status'] = 'active';
            $record['removedAt'] = '';
        } elseif ($action === 'set_status') {
            $record['status'] = $status;
        } elseif ($action === 'remove') {
            $record['status'] = 'removed';
            $record['removedAt'] = $now;
        }
        $record['role'] = auth_is_admin($config, $email) ? 'admin' : 'member';
        $record['updatedAt'] = $now;
        $record['audit'] = array_slice(array_merge([[
            'at' => $now,
            'actor' => $actorEmail,
            'action' => $auditAction,
            'target' => auth_user_id($config, $email, $record['userId'] ?? ''),
        ]], auth_normalize_audit_entries($record['audit'] ?? [], 49)), 0, 50);
        $records[$email] = $record;
    });

    error_log('[mojigoto-admin] ' . $actorEmail . ' ' . $auditAction . ' ' . $email);
    $notification = in_array($action, ['add', 'remove'], true)
        ? forms_membership_mail($config, $email, $action === 'add' ? 'activated' : 'removed')
        : null;
    admin_response($config, $users, '', $notification);
} catch (Throwable $error) {
    error_log('[mojigoto-admin] ' . $error->getMessage());
    auth_json(['message' => '招待利用者を更新できませんでした。'], 500);
}
