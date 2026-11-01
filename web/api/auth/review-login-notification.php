<?php
declare(strict_types=1);

// Called only after the verified login has created its session. Notification
// failures must never prevent login; no credentials are stored in this ledger.
function auth_notify_review_login(array $config, array $user, ?callable $sender = null, ?int $now = null): string
{
    if (($config['review_login_notification_enabled'] ?? false) !== true || ($user['provider'] ?? '') !== 'email') return 'skipped';
    $email = strtolower(trim((string) ($user['email'] ?? '')));
    try {
        if (!auth_email_login_allowed($config, $email)) return 'skipped';
        $to = trim((string) ($config['review_login_notification_email'] ?? ''));
        if ($to === '') $to = trim((string) ($config['form_notification_email'] ?? ''));
        $from = trim((string) ($config['form_from_email'] ?? ''));
        foreach ([$to, $from] as $address) {
            if (!filter_var($address, FILTER_VALIDATE_EMAIL) || !preg_match('/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$/D', $address)) throw new RuntimeException('Invalid notification mail configuration');
        }
        $now = $now ?? time();
        $path = (string) ($config['review_login_notification_path'] ?? (__DIR__ . '/data/review-login-notifications.json'));
        $directory = dirname($path);
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Cannot create notification ledger');
        $lock = fopen($path . '.lock', 'c');
        if ($lock === false) throw new RuntimeException('Cannot open notification lock');
        try {
            if (!flock($lock, LOCK_EX)) throw new RuntimeException('Cannot lock notification ledger');
            $entries = [];
            if (is_file($path)) {
                $raw = file_get_contents($path);
                $decoded = $raw === false ? null : json_decode($raw, true);
                if (!is_array($decoded) || !is_array($decoded['entries'] ?? null)) throw new RuntimeException('Invalid notification ledger');
                foreach ($decoded['entries'] as $key => $value) {
                    if (is_numeric($value) && (int) $value > $now - 3600) $entries[$key] = (int) $value;
                }
            }
            $key = hash_hmac('sha256', $email, (string) $config['session_secret']);
            if (isset($entries[$key])) return 'throttled';
            // Reserve before mail(), so concurrent successful logins send at
            // most one notification attempt per hour, including mail failures.
            $entries[$key] = $now;
            $data = json_encode(['entries' => $entries], JSON_THROW_ON_ERROR);
            if (file_put_contents($path, $data, LOCK_EX) !== strlen($data)) throw new RuntimeException('Cannot save notification ledger');
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
        [$local, $domain] = explode('@', $email, 2);
        $domainParts = explode('.', $domain);
        $domainName = array_shift($domainParts);
        $masked = substr($local, 0, 2) . '***@' . substr($domainName, 0, 1) . '***' . ($domainParts ? '.' . implode('.', $domainParts) : '');
        $record = auth_load_user_registry($config)[$email] ?? [];
        $id = auth_user_id($config, $email, $record['userId'] ?? '');
        $date = (new DateTimeImmutable('@' . $now))->setTimezone(new DateTimeZone('Asia/Tokyo'))->format('Y-m-d H:i:s T');
        $subject = '[もじごと Web] 審査用ログイン通知';
        $subject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $body = "審査用（メール・パスワード）ログインが成功しました。\n\n日時: {$date}\n利用者ID: {$id}\nアカウント: {$masked}\n環境: {$config['app_origin']}\n\nこの通知は同じ審査アカウントにつき1時間に1回まで送信されます。\n";
        $headers = "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nFrom: mojigoto Web <{$from}>";
        $accepted = $sender ? $sender($to, $subject, $body, $headers, '-f' . $from) : @mail($to, $subject, $body, $headers, '-f' . $from);
        if (!$accepted) throw new RuntimeException('Mail transport rejected notification');
        return 'accepted';
    } catch (Throwable $error) {
        error_log('[mojigoto-review-login] notification failed: ' . $error->getMessage());
        return 'failed';
    }
}
