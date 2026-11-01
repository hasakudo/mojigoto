<?php
declare(strict_types=1);
require __DIR__ . '/../../web/api/auth/bootstrap.php';
require __DIR__ . '/../../web/api/admin/privacy.php';

$_SESSION['admin_email_reveal_until'] = time() + 300;
$email = 'review@example.com';
$config = ['session_secret' => str_repeat('s', 32), 'admin_emails' => [], 'email_login_enabled' => false];
$users = admin_public_users($config, [['email' => $email, 'provider' => 'email', 'nickname' => $email]]);
$submissions = admin_public_submissions([['email' => $email, 'message' => "返信先: $email", 'name' => $email]]);
$audit = admin_redact_emails([['actor' => 'admin@example.com', 'target' => $email]]);
$mail = admin_redact_emails(['subject' => $email, 'message' => "連絡: $email", 'recipientIds' => ['U-123']]);
foreach ([$users, $submissions, $audit, $mail] as $value) {
    if (str_contains(json_encode($value), $email) || str_contains(json_encode($value), 'admin@example.com')) throw new RuntimeException('Full address leaked.');
}
if ($users[0]['provider'] !== 'email' || !$users[0]['emailMasked'] || !$submissions[0]['emailMasked']) throw new RuntimeException('Invalid metadata.');
if (admin_redact_emails($users) !== $users) throw new RuntimeException('Masking must be idempotent.');
$reviewConfig = array_merge($config, ['email_login_enabled' => true, 'email_login_allowed_emails' => [$email]]);
$legacy = admin_public_users($reviewConfig, [['email' => $email, 'provider' => '', 'status' => 'active']]);
if ($legacy[0]['provider'] !== 'email') throw new RuntimeException('Legacy review account must retain its available login method.');
$stopped = admin_public_users($reviewConfig, [['email' => $email, 'provider' => '', 'status' => 'disabled']]);
if ($stopped[0]['provider'] !== '') throw new RuntimeException('Disabled account must not acquire a review method.');
echo "privacy checks passed\n";

$ownerConfig = array_merge($config, ['owner_member_email' => 'owner@example.com']);
$owner = admin_public_users($ownerConfig, [['email' => 'owner@example.com', 'status' => 'active']])[0];
if (!$owner['ownerAccount'] || !$owner['deletionProtected'] || $owner['role'] !== 'member') throw new RuntimeException('Owner must be marked and protected without admin privileges.');
if (!auth_is_owner_member($ownerConfig, ' OWNER@example.com ')) throw new RuntimeException('Owner matching must normalize email.');
if (auth_is_owner_member($config, 'owner@example.com') || auth_is_owner_member($ownerConfig, 'other@example.com')) throw new RuntimeException('Unconfigured or unrelated member must not be marked.');
if (auth_is_owner_member(array_merge($ownerConfig, ['admin_emails' => ['owner@example.com']]), 'owner@example.com')) throw new RuntimeException('Admin must not be marked as ordinary owner.');
if (str_contains(json_encode($owner), 'owner@example.com')) throw new RuntimeException('Owner address leaked.');
