<?php
declare(strict_types=1);
ob_start();
// Opt-in integration check against local Apache. Never writes application data.
require __DIR__ . '/../../web/api/auth/bootstrap.php';
$config = auth_config();
if ($config['app_origin'] !== 'http://localhost:4173') throw new RuntimeException('Local environment only');
$admin = auth_admin_config($config);
$paths = [];
function check_http(array $config, string $route, string $cookie, string $method = 'GET', string $csrf = '', string $body = '{}'): array {
    $ch = curl_init($config['app_origin'] . $route);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_COOKIE => $cookie,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Origin: ' . $config['app_origin'], 'X-CSRF-Token: ' . $csrf]]);
    if ($method === 'POST') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $raw = curl_exec($ch);
    if ($raw === false) throw new RuntimeException(curl_error($ch));
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$code, json_decode($raw, true)];
}
function seed_session(string $name, array $data, array &$paths): string {
    session_name($name); session_id(bin2hex(random_bytes(24)));
    if (!session_start()) throw new RuntimeException('Cannot create temporary test session');
    $_SESSION = $data; $id = session_id();
    $paths[] = rtrim(session_save_path(), '/\\') . '/sess_' . $id;
    session_write_close(); return $name . '=' . $id;
}
function expect_status(array $response, int $status, string $label, string $code = ''): void {
    if ($response[0] !== $status || ($code !== '' && ($response[1]['code'] ?? '') !== $code)) throw new RuntimeException('Failed: ' . $label . ' (HTTP ' . $response[0] . ')');
    echo 'PASS ' . $label . PHP_EOL;
}
try {
    $now = time(); $csrf = bin2hex(random_bytes(24));
    $data = ['user' => ['email' => $config['admin_emails'][0], 'provider' => 'google'],
        'authenticated_at' => $now, 'admin_last_activity_at' => $now, 'csrf_token' => $csrf];
    $normal = seed_session($config['session_cookie'], $data, $paths);
    $normalResponse = check_http($config, '/api/auth/session/', $normal);
    expect_status($normalResponse, 403, 'existing ordinary admin session denied');
    if (($normalResponse[1]['access'] ?? '') !== 'admin_only' || ($normalResponse[1]['isAdmin'] ?? true) !== false) throw new RuntimeException('Admin-only session classification failed');
    expect_status(check_http($config, '/api/auth/profile/', $normal, 'POST', $csrf), 403, 'admin ordinary profile denied');
    foreach (['users','mail','submissions','announcements','form-settings'] as $route) {
        expect_status(check_http($config, '/api/admin/' . $route . '/', $normal), 401, 'ordinary session denied: ' . $route);
    }
    $data['admin_authenticated'] = true;
    $active = seed_session($admin['session_cookie'], $data, $paths);
    $sessionResponse = check_http($config, '/api/admin/auth/session/', $active);
    if (($sessionResponse[1]['authenticated'] ?? false) !== true) throw new RuntimeException('Dedicated session not authenticated');
    expect_status($sessionResponse, 200, 'dedicated session accepted');
    expect_status(check_http($config, '/api/admin/users/', $active, 'POST', 'wrong'), 403, 'CSRF denied');
    $data['authenticated_at'] = $now - 301;
    $stale = seed_session($admin['session_cookie'], $data, $paths);
    foreach (['users','mail','form-settings'] as $route) {
        expect_status(check_http($config, '/api/admin/' . $route . '/', $stale, 'POST', $csrf), 403, 'stale authentication denied: ' . $route, 'admin_reauthentication_required');
    }
    foreach (['submissions','announcements'] as $route) {
        expect_status(check_http($config, '/api/admin/' . $route . '/', $stale, 'POST', $csrf, '{"action":"remove"}'), 403, 'stale delete denied: ' . $route, 'admin_reauthentication_required');
    }
    $data['admin_last_activity_at'] = $now - 901; $data['authenticated_at'] = $now - 902;
    $expired = seed_session($admin['session_cookie'], $data, $paths);
    expect_status(check_http($config, '/api/admin/users/', $expired), 401, 'idle session denied');
    $data['admin_last_activity_at'] = $now; $data['authenticated_at'] = $now - 3601;
    $expired = seed_session($admin['session_cookie'], $data, $paths);
    expect_status(check_http($config, '/api/admin/users/', $expired), 401, 'absolute session denied');
    expect_status(check_http($config, '/api/admin/auth/activity/', $stale, 'POST', 'wrong'), 403, 'activity CSRF denied');
} finally {
    foreach ($paths as $path) if (is_file($path)) unlink($path);
}
