<?php

declare(strict_types=1);

define('MOJIGOTO_ADMIN_AUTH', true);

require dirname(__DIR__, 2) . '/auth/bootstrap.php';

function announcements_require_admin(array $config): array
{
    return auth_require_admin_session($config);
}

function announcements_path(): string
{
    return dirname(__DIR__, 3) . '/announcements.json';
}

function announcements_load(): array
{
    $path = announcements_path();
    if (!is_file($path)) return [];
    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded) || !is_array($decoded['items'] ?? null)) {
        throw new RuntimeException('お知らせデータの形式が正しくありません。');
    }
    $modifiedAt = filemtime($path);
    $fallbackUpdatedAt = gmdate('c', $modifiedAt === false ? time() : $modifiedAt);
    $items = [];
    foreach ($decoded['items'] as $index => $item) {
        if (!is_array($item)) continue;
        $date = trim((string) ($item['date'] ?? ''));
        $title = trim((string) ($item['title'] ?? ''));
        $summary = trim((string) ($item['summary'] ?? ''));
        if ($title === '' || $summary === '') continue;
        $id = trim((string) ($item['id'] ?? ''));
        if ($id === '') $id = substr(hash('sha256', $date . "\n" . $title . "\n" . $index), 0, 20);
        $items[] = [
            'id' => $id,
            'date' => $date,
            'title' => $title,
            'summary' => $summary,
            'url' => trim((string) ($item['url'] ?? '')),
            'updatedAt' => trim((string) ($item['updatedAt'] ?? '')) ?: $fallbackUpdatedAt,
        ];
    }
    usort($items, fn(array $left, array $right): int => strcmp($right['date'], $left['date']));
    return $items;
}

function announcements_save(array $items): void
{
    $path = announcements_path();
    $payload = json_encode(['items' => array_values($items)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($payload === false) throw new RuntimeException('お知らせデータを作成できませんでした。');
    $temporary = tempnam(dirname($path), '.announcements-');
    if ($temporary === false) throw new RuntimeException('お知らせデータを保存できませんでした。');
    try {
        if (file_put_contents($temporary, $payload . "\n", LOCK_EX) === false || !rename($temporary, $path)) {
            throw new RuntimeException('お知らせデータを保存できませんでした。');
        }
        @chmod($path, 0644);
    } finally {
        if (is_file($temporary)) @unlink($temporary);
    }
}

try {
    $method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, ['GET', 'POST'], true)) auth_json(['message' => 'Method not allowed'], 405);
    $config = auth_session_start();
    announcements_require_admin($config);
    $items = announcements_load();
    if ($method === 'GET') auth_json(['ok' => true, 'items' => $items]);

    $origin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    if ($origin !== '' && !hash_equals($config['app_origin'], $origin)) {
        auth_json(['message' => '管理操作を確認できませんでした。'], 403);
    }
    $csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string) ($_SESSION['csrf_token'] ?? '');
    if ($csrf === '' || $expected === '' || !hash_equals($expected, $csrf)) {
        auth_json(['message' => '管理操作を確認できませんでした。ページを再読み込みしてください。'], 403);
    }
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) auth_json(['message' => '入力内容を確認できませんでした。'], 400);
    $action = (string) ($input['action'] ?? '');
    if ($action === 'remove') auth_require_recent_admin($config);
    $id = trim((string) ($input['id'] ?? ''));
    if ($action === 'remove') {
        $next = array_values(array_filter($items, fn(array $item): bool => !hash_equals((string) $item['id'], $id)));
        if (count($next) === count($items)) auth_json(['message' => '削除するお知らせが見つかりません。'], 404);
        announcements_save($next);
        auth_json(['ok' => true, 'items' => $next]);
    }
    if ($action !== 'save') auth_json(['message' => '管理操作が正しくありません。'], 400);

    $date = trim((string) ($input['date'] ?? ''));
    $title = trim((string) ($input['title'] ?? ''));
    $summary = trim((string) ($input['summary'] ?? ''));
    $url = trim((string) ($input['url'] ?? ''));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) auth_json(['message' => '日付を入力してください。'], 400);
    if ($title === '' || strlen($title) > 400) auth_json(['message' => 'タイトルは100文字以内で入力してください。'], 400);
    if ($summary === '' || strlen($summary) > 2000) auth_json(['message' => '概要は500文字以内で入力してください。'], 400);
    if ($url !== '' && (!filter_var($url, FILTER_VALIDATE_URL) || strtolower((string) parse_url($url, PHP_URL_SCHEME)) !== 'https')) {
        auth_json(['message' => 'リンクはhttpsから始まるURLを入力してください。'], 400);
    }
    if ($id === '') $id = gmdate('YmdHis') . '-' . bin2hex(random_bytes(4));
    $record = ['id' => $id, 'date' => $date, 'title' => $title, 'summary' => $summary, 'url' => $url, 'updatedAt' => gmdate('c')];
    $updated = false;
    foreach ($items as $index => $item) {
        if (!hash_equals((string) $item['id'], $id)) continue;
        $items[$index] = $record;
        $updated = true;
        break;
    }
    if (!$updated) array_unshift($items, $record);
    usort($items, fn(array $left, array $right): int => strcmp($right['date'], $left['date']));
    announcements_save($items);
    auth_json(['ok' => true, 'items' => $items]);
} catch (Throwable $error) {
    error_log('[mojigoto-announcements] ' . $error->getMessage());
    auth_json(['message' => 'お知らせを更新できませんでした。'], 500);
}
