<?php
declare(strict_types=1);
require __DIR__ . '/../../web/api/auth/bootstrap.php';

$registryPath = tempnam(sys_get_temp_dir(), 'mojigoto-review-');
try {
    $config = [
        'email_login_enabled' => true,
        'email_login_allowed_emails' => ['review@example.com', 'stopped@example.com', 'admin@example.com', 'missing@example.com'],
        'admin_emails' => ['admin@example.com'],
        'invited_emails' => [],
        'disabled_emails' => [],
        'session_secret' => str_repeat('x', 32),
        'user_registry_path' => $registryPath,
    ];
    file_put_contents($registryPath, json_encode(['users' => [
        'review@example.com' => ['email' => 'review@example.com', 'status' => 'active'],
        'stopped@example.com' => ['email' => 'stopped@example.com', 'status' => 'disabled'],
        'other@example.com' => ['email' => 'other@example.com', 'status' => 'active'],
    ]]));
    $checks = [
        'dedicated active' => auth_email_login_allowed($config, ' REVIEW@EXAMPLE.COM '),
        'disabled login' => !auth_email_login_allowed(array_merge($config, ['email_login_enabled' => false]), 'review@example.com'),
        'default disabled' => !auth_email_login_allowed([], 'review@example.com'),
        'not allowed' => !auth_email_login_allowed($config, 'other@example.com'),
        'stopped' => !auth_email_login_allowed($config, 'stopped@example.com'),
        'not invited' => !auth_email_login_allowed($config, 'missing@example.com'),
        'admin rejected' => !auth_email_login_allowed($config, 'admin@example.com'),
        'verified local identity' => auth_email_login_claims_allowed($config, 'review@example.com', ['email_verified' => true]),
        'unverified identity' => !auth_email_login_claims_allowed($config, 'review@example.com', ['email_verified' => false]),
        'missing verification' => !auth_email_login_claims_allowed($config, 'review@example.com', []),
        'federated identity' => !auth_email_login_claims_allowed($config, 'review@example.com', ['email_verified' => true, 'identities' => [['providerName' => 'Google']]]),
    ];
    foreach ($checks as $name => $passed) {
        if (!$passed) throw new RuntimeException('Failed: ' . $name);
    }
    echo "policy checks passed\n";
} finally {
    unlink($registryPath);
}
