<?php
declare(strict_types=1);
require __DIR__ . '/../../web/api/auth/bootstrap.php';
require __DIR__ . '/../../web/api/auth/review-login-notification.php';
$dir = sys_get_temp_dir() . '/mojigoto-notification-' . bin2hex(random_bytes(8));
mkdir($dir, 0700);
$config = ['session_secret' => str_repeat('s', 32), 'admin_emails' => [], 'email_login_enabled' => true,
    'email_login_allowed_emails' => ['review@example.com'], 'invited_emails' => ['review@example.com'],
    'user_registry_path' => $dir . '/users.json', 'review_login_notification_path' => $dir . '/notices.json',
    'review_login_notification_enabled' => true, 'form_notification_email' => 'ops@example.com',
    'form_from_email' => 'noreply@example.com', 'app_origin' => 'http://localhost:4173'];
$user = ['email' => 'review@example.com', 'provider' => 'email'];
$sent = [];
$sender = function (...$args) use (&$sent): bool { $sent[] = $args; return true; };
function check_notice(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
try {
    check_notice(auth_notify_review_login($config, ['email' => $user['email'], 'provider' => 'google'], $sender, 10000) === 'skipped', 'Google must not send');
    check_notice(auth_notify_review_login(array_merge($config, ['review_login_notification_enabled' => false]), $user, $sender, 10000) === 'skipped', 'Disabled must not send');
    check_notice(auth_notify_review_login($config, ['email' => 'unknown@example.com', 'provider' => 'email'], $sender, 10000) === 'skipped', 'Unapproved account must not send');
    check_notice(auth_notify_review_login($config, $user, $sender, 10000) === 'accepted', 'First accepted');
    check_notice(count($sent) === 1 && $sent[0][0] === 'ops@example.com', 'Correct recipient');
    check_notice(!str_contains($sent[0][2], $user['email']) && str_contains($sent[0][2], 're***@e***.com') && str_contains($sent[0][2], '利用者ID:'), 'Masked notification');
    check_notice(!str_contains(file_get_contents($config['review_login_notification_path']), $user['email']), 'Ledger stores no email');
    check_notice(auth_notify_review_login($config, $user, $sender, 13599) === 'throttled' && count($sent) === 1, 'Within hour must throttle');
    check_notice(auth_notify_review_login($config, $user, $sender, 13600) === 'accepted' && count($sent) === 2, 'Hour boundary must allow');
    check_notice(auth_notify_review_login($config, $user, fn() => false, 17200) === 'failed', 'Mail failure nonfatal');
    check_notice(auth_notify_review_login($config, $user, $sender, 17201) === 'throttled', 'Mail failure must throttle retry');
    check_notice(auth_notify_review_login(array_merge($config, ['form_from_email' => "bad\r\nBcc: x@example.com"]), $user, $sender, 20800) === 'failed', 'Header injection rejected');
    echo "Notification policy checks passed\n";
} finally {
    foreach (glob($dir . '/*') as $file) unlink($file);
    rmdir($dir);
}
