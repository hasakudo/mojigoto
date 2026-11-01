<?php
declare(strict_types=1);

function admin_mask_email(string $email): string
{
    [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
    $parts = explode('.', $domain);
    $name = array_shift($parts) ?: '';
    return substr($local, 0, 2) . '***@' . substr($name, 0, 1) . '***' . ($parts ? '.' . implode('.', $parts) : '');
}

// Also redact addresses typed into nicknames, messages and legacy audit fields.
function admin_redact_emails($value)
{
    if (is_array($value)) {
        foreach ($value as $key => $item) $value[$key] = admin_redact_emails($item);
        return $value;
    }
    if (!is_string($value)) return $value;
    return preg_replace_callback('/[A-Z0-9.!#$%&\x27*+\/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,63}\b/i',
        fn(array $match): string => admin_mask_email($match[0]), $value);
}

function admin_public_submissions(array $items): array
{
    foreach ($items as &$item) {
        $item['email'] = admin_mask_email((string) ($item['email'] ?? ''));
        $item['emailMasked'] = true;
    }
    unset($item);
    return admin_redact_emails($items);
}

function admin_public_users(array $config, array $users, bool $removedOnly = false): array
{
    $visible = [];
    $reviewEmails = ($config['email_login_enabled'] ?? false) === true
        ? auth_normalize_emails($config['email_login_allowed_emails'] ?? []) : [];
    foreach ($users as $record) {
        if ((($record['status'] ?? '') === 'removed') !== $removedOnly) continue;
        $email = strtolower(trim((string) ($record['email'] ?? '')));
        if ($email === '') continue;
        $visible[] = [
            'id' => auth_user_id($config, $email, $record['userId'] ?? ''),
            'email' => admin_mask_email($email),
            'emailMasked' => true,
            'ownerAccount' => auth_is_owner_member($config, $email),
            'deletionProtected' => auth_is_owner_member($config, $email),
            'nickname' => (string) ($record['nickname'] ?? ''),
            'provider' => (string) ($record['provider'] ?? '') ?: (in_array($email, $reviewEmails, true)
                && ($record['status'] ?? '') === 'active' && !auth_is_admin($config, $email) ? 'email' : ''),
            'role' => auth_is_admin($config, $email) ? 'admin' : 'member',
            'status' => auth_is_admin($config, $email) ? 'active' : (string) ($record['status'] ?? 'active'),
            'createdAt' => (string) ($record['createdAt'] ?? ''),
            'lastLoginAt' => (string) ($record['lastLoginAt'] ?? ''),
            'cognitoIdentities' => auth_normalize_cognito_identities($record['cognitoIdentities'] ?? []),
            'removedAt' => $removedOnly ? (string) ($record['removedAt'] ?? '') : '',
            'retentionExpiresAt' => $removedOnly && strtotime((string) ($record['removedAt'] ?? '')) !== false
                ? gmdate('c', strtotime($record['removedAt']) + 90 * 86400) : '',
        ];
    }
    usort($visible, function (array $left, array $right): int {
        $roleOrder = ($left['role'] === 'admin' ? 0 : 1) <=> ($right['role'] === 'admin' ? 0 : 1);
        return $roleOrder !== 0 ? $roleOrder : strnatcasecmp($left['email'], $right['email']);
    });
    return admin_redact_emails($visible);
}

