<?php
declare(strict_types=1);
require __DIR__ . '/../../web/api/auth/bootstrap.php';
require __DIR__ . '/../../web/api/admin/privacy.php';

$directory = $argv[1];
$email = 'member@example.com';
$config = ['region' => 'ap-northeast-1', 'user_pool_id' => 'ap-northeast-1_Test',
    'session_secret' => str_repeat('s', 32), 'admin_emails' => [],
    'user_registry_path' => $directory . '/users.json'];
$issuer = 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_Test';
$sub = '11111111-2222-3333-4444-555555555555';
$second = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
function check(bool $condition, string $name): void {
    if (!$condition) throw new RuntimeException($name);
}
auth_save_user_registry($config, [$email => ['email' => $email, 'status' => 'active', 'nickname' => $email]]);
check(auth_load_user_registry($config)[$email]['cognitoIdentities'] === [], 'legacy user must be unrecorded');
$user = ['email' => $email, 'provider' => 'google', 'id' => 'untrusted-legacy-id'];
auth_record_login($config, $user);
check(auth_load_user_registry($config)[$email]['cognitoIdentities'] === [], 'legacy id must not become Cognito sub');
auth_record_login($config, $user, ['issuer' => $issuer, 'sub' => $sub]);
auth_record_login($config, $user, ['issuer' => $issuer, 'sub' => strtoupper($sub)]);
$users = auth_load_user_registry($config);
check(count($users[$email]['cognitoIdentities']) === 1, 'repeat login must deduplicate identifiers');
check($users[$email]['cognitoIdentities'][0]['sub'] === $sub, 'verified sub must survive disk round trip');
auth_record_login($config, array_merge($user, ['provider' => 'microsoft']), ['issuer' => $issuer, 'sub' => $second]);
$otherConfig = array_merge($config, ['user_pool_id' => 'ap-northeast-1_Other']);
auth_record_login($otherConfig, $user, ['issuer' => str_replace('_Test', '_Other', $issuer), 'sub' => $sub]);
$users = auth_load_user_registry($config);
check(count($users[$email]['cognitoIdentities']) === 3, 'different subjects and pools must all remain available');
$identities = $users[$email]['cognitoIdentities'];
foreach ([['issuer' => $issuer . 'attacker', 'sub' => $sub], ['issuer' => $issuer, 'sub' => $email]] as $bad) {
    auth_record_login($config, $user, $bad);
    check(auth_load_user_registry($config)[$email]['cognitoIdentities'] === $identities, 'invalid identity must not be recorded');
}
$removedAt = gmdate('c', time() - 7 * 86400);
auth_mutate_user_registry($config, function (array &$users) use ($email, $removedAt): void {
    $users[$email]['status'] = 'removed';
    $users[$email]['removedAt'] = $removedAt;
});
auth_record_login($config, $user, ['issuer' => $issuer, 'sub' => '00000000-0000-0000-0000-000000000000']);
$users = auth_load_user_registry($config);
check($users[$email]['removedAt'] === $removedAt, 'removed sign-in must not extend retention');
check($users[$email]['cognitoIdentities'] === $identities, 'removed sign-in must not add new identifiers');
check(admin_public_users($config, $users) === [], 'removed user must not return to active list');
$removed = admin_public_users($config, $users, true);
check(count($removed) === 1 && count($removed[0]['cognitoIdentities']) === 3, 'removed list must retain all identifiers');
check(strtotime($removed[0]['retentionExpiresAt']) === strtotime($removedAt) + 90 * 86400, 'expiry must follow removedAt');
check(!str_contains(json_encode($removed), $email), 'removed projection must not expose full email in any field');
check(!str_contains(json_encode($removed), 'access_token'), 'no tokens may be exposed');
check(auth_access_for_email($config, $email) !== 'active', 'removed account must remain blocked');
auth_mutate_user_registry($config, function (array &$users) use ($email): void {
    $users[$email]['removedAt'] = gmdate('c', time() - 91 * 86400);
});
auth_mutate_user_registry($config, static function (array &$users): void {});
check(!isset(auth_load_user_registry($config)[$email]), 'expired removed record must disappear');
check(!str_contains(file_get_contents($config['user_registry_path']), $sub), 'expiry must physically remove stored subjects');
echo "Cognito identity round-trip, privacy and retention checks passed\n";
