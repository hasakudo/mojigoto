<?php
declare(strict_types=1);
require __DIR__ . '/../../web/api/auth/bootstrap.php';
$now = 10000;
$config = ['app_origin' => 'http://localhost:4173', 'client_id' => 'ordinary-client', 'client_secret' => 'ordinary-secret',
    'session_cookie' => 'ordinary_session', 'admin_client_id' => 'admin-client', 'admin_client_secret' => 'admin-secret',
    'admin_emails' => ['admin@example.com'], 'session_ttl_seconds' => 43200];
$active = ['admin_authenticated' => true, 'user' => ['email' => 'admin@example.com', 'provider' => 'google'],
    'authenticated_at' => $now - 100, 'admin_last_activity_at' => $now - 100];
$checks = [
    'admin cannot use ordinary app even if invited' => auth_access_for_email($config, 'ADMIN@example.com') === 'admin_only',
    'valid admin' => auth_admin_status($config, $active, $now) === 'active',
    'ordinary login has no admin grant' => auth_admin_status($config, array_diff_key($active, ['admin_authenticated' => true]), $now) === 'anonymous',
    'allowlist removed immediately' => auth_admin_status(array_merge($config, ['admin_emails' => []]), $active, $now) === 'forbidden',
    'review method rejected' => auth_admin_status($config, array_replace_recursive($active, ['user' => ['provider' => 'email']]), $now) === 'forbidden',
    'member rejected' => auth_admin_status($config, array_replace_recursive($active, ['user' => ['email' => 'member@example.com']]), $now) === 'forbidden',
    'idle boundary' => auth_admin_status($config, array_merge($active, ['authenticated_at' => $now - 1000, 'admin_last_activity_at' => $now - 900]), $now) === 'expired',
    'absolute boundary even after activity' => auth_admin_status($config, array_merge($active, ['authenticated_at' => $now - 3600, 'admin_last_activity_at' => $now - 1]), $now) === 'expired',
    'future time rejected' => auth_admin_status($config, array_merge($active, ['admin_last_activity_at' => $now + 1]), $now) === 'expired',
    'fresh critical action' => auth_admin_recent($config, $active, $now),
    'critical action after five minutes' => !auth_admin_recent($config, array_merge($active, ['authenticated_at' => $now - 300]), $now),
];
$adminConfig = auth_admin_config($config);
$checks['dedicated client'] = $adminConfig['client_id'] === 'admin-client';
$checks['dedicated secret'] = $adminConfig['client_secret'] === 'admin-secret';
$checks['dedicated cookie'] = $adminConfig['session_cookie'] !== $config['session_cookie'];
$checks['dedicated callback'] = $adminConfig['callback_url'] === 'http://localhost:4173/api/admin/auth/callback';
$checks['ordinary unchanged'] = $config['client_id'] === 'ordinary-client' && $config['session_ttl_seconds'] === 43200;
foreach ([array_merge($config, ['admin_client_id' => 'ordinary-client']), array_merge($config, ['admin_client_secret' => '']), array_merge($config, ['admin_session_cookie' => 'ordinary_session'])] as $bad) {
    $rejected = false;
    try { auth_admin_config($bad); } catch (RuntimeException $error) { $rejected = true; }
    $checks['misconfiguration-' . count($checks)] = $rejected;
}
foreach ($checks as $name => $passed) if (!$passed) throw new RuntimeException('Failed: ' . $name);
echo "admin session policy passed\n";
