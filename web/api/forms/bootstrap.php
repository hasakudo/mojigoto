<?php

declare(strict_types=1);

require dirname(__DIR__) . '/auth/bootstrap.php';

function forms_text($value, int $maxLength, bool $required = true, int $minLength = 0): string
{
    $text = trim((string) $value);
    $text = preg_replace('/\r\n?|\n/u', "\n", $text) ?? '';
    if (($required && $text === '') || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $text)) {
        throw new InvalidArgumentException('入力内容を確認してください。');
    }
    $length = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
    if ($required && $length < $minLength) throw new InvalidArgumentException($minLength . '文字以上で入力してください。');
    if ($length > $maxLength) throw new InvalidArgumentException('入力できる文字数を超えています。');
    return $text;
}

function forms_submission_path(array $config): string
{
    $configured = trim((string) ($config['form_submission_path'] ?? ''));
    return $configured !== '' ? $configured : dirname(__DIR__) . '/auth/data/form-submissions.json';
}

function forms_rate_path(array $config): string
{
    return dirname(forms_submission_path($config)) . '/form-rate-limits.json';
}

function forms_sent_mail_path(array $config): string
{
    $configured = trim((string) ($config['sent_mail_path'] ?? ''));
    return $configured !== '' ? $configured : dirname(forms_submission_path($config)) . '/sent-mail.json';
}

function forms_maintenance_state_path(array $config): string
{
    return dirname(forms_submission_path($config)) . '/maintenance-state.json';
}

function forms_settings_path(array $config): string
{
    return dirname(forms_submission_path($config)) . '/form-settings.json';
}

function forms_normalize_blocked_terms($terms): array
{
    if (!is_array($terms)) return [];
    $normalized = [];
    foreach ($terms as $value) {
        $term = forms_text($value, 80, false);
        if ($term === '') continue;
        $key = function_exists('mb_strtolower') ? mb_strtolower($term, 'UTF-8') : strtolower($term);
        $normalized[$key] = $term;
        if (count($normalized) >= 100) break;
    }
    return array_values($normalized);
}

function forms_load_settings(array $config): array
{
    $stored = forms_read_json(forms_settings_path($config));
    return ['blockedTerms' => forms_normalize_blocked_terms($stored['blockedTerms'] ?? [])];
}

function forms_save_settings(array $config, array $settings): array
{
    $normalized = ['blockedTerms' => forms_normalize_blocked_terms($settings['blockedTerms'] ?? [])];
    forms_write_json(forms_settings_path($config), ['version' => 1, 'updatedAt' => gmdate('c')] + $normalized);
    return $normalized;
}

function forms_assert_content_allowed(array $config, array $values): void
{
    $settings = forms_load_settings($config);
    $terms = forms_normalize_blocked_terms(array_merge(
        is_array($config['form_blocked_terms'] ?? null) ? $config['form_blocked_terms'] : [],
        $settings['blockedTerms']
    ));
    if (!$terms) return;
    $text = implode("\n", array_map(fn($value): string => (string) $value, $values));
    if (class_exists('Normalizer')) $text = Normalizer::normalize($text, Normalizer::FORM_KC) ?: $text;
    $text = function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
    foreach ($terms as $term) {
        if (class_exists('Normalizer')) $term = Normalizer::normalize($term, Normalizer::FORM_KC) ?: $term;
        $needle = function_exists('mb_strtolower') ? mb_strtolower($term, 'UTF-8') : strtolower($term);
        $matched = function_exists('mb_strpos') ? mb_strpos($text, $needle, 0, 'UTF-8') !== false : strpos($text, $needle) !== false;
        if ($matched) throw new InvalidArgumentException('入力内容に送信できない語句が含まれています。内容を確認してください。');
    }
}

function forms_read_json(string $path): array
{
    if (!is_file($path)) return [];
    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded)) throw new RuntimeException('保存データを読み込めませんでした。');
    return $decoded;
}

function forms_write_json(string $path, array $payload): void
{
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('保存フォルダを作成できませんでした。');
    }
    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($encoded === false) throw new RuntimeException('保存データを作成できませんでした。');
    $temporary = tempnam($directory, '.forms-');
    if ($temporary === false) throw new RuntimeException('保存データを作成できませんでした。');
    try {
        if (file_put_contents($temporary, $encoded . "\n", LOCK_EX) === false || !rename($temporary, $path)) {
            throw new RuntimeException('保存データを更新できませんでした。');
        }
        @chmod($path, 0600);
    } finally {
        if (is_file($temporary)) @unlink($temporary);
    }
}

function forms_normalize_submission(array $record): ?array
{
    $type = (string) ($record['type'] ?? '');
    if (!in_array($type, ['application', 'contact'], true)) return null;
    $status = (string) ($record['status'] ?? 'open');
    if (!in_array($status, ['open', 'handled', 'approved'], true)) $status = 'open';
    return [
        'id' => trim((string) ($record['id'] ?? '')),
        'type' => $type,
        'status' => $status,
        'createdAt' => trim((string) ($record['createdAt'] ?? '')),
        'completedAt' => trim((string) ($record['completedAt'] ?? '')),
        'name' => trim((string) ($record['name'] ?? '')),
        'email' => strtolower(trim((string) ($record['email'] ?? ''))),
        'subject' => trim((string) ($record['subject'] ?? '')),
        'discovery' => trim((string) ($record['discovery'] ?? '')),
        'requestKind' => in_array(($record['requestKind'] ?? ''), ['join', 'withdraw'], true) ? (string) $record['requestKind'] : 'join',
        'message' => trim((string) ($record['message'] ?? '')),
    ];
}

function forms_load_submissions(array $config): array
{
    $decoded = forms_read_json(forms_submission_path($config));
    $items = [];
    $cutoff = time() - (90 * 86400);
    foreach (($decoded['items'] ?? []) as $record) {
        if (!is_array($record)) continue;
        $item = forms_normalize_submission($record);
        if (!$item || $item['id'] === '') continue;
        $completed = $item['completedAt'] !== '' ? strtotime($item['completedAt']) : false;
        if ($completed !== false && $completed < $cutoff) continue;
        $items[] = $item;
    }
    usort($items, fn(array $left, array $right): int => strcmp($right['createdAt'], $left['createdAt']));
    return $items;
}

function forms_save_submissions(array $config, array $items): void
{
    forms_write_json(forms_submission_path($config), [
        'version' => 1,
        'updatedAt' => gmdate('c'),
        'items' => array_values($items),
    ]);
}

function forms_mutate_submissions(array $config, callable $mutator): array
{
    $path = forms_submission_path($config);
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('保存フォルダを作成できませんでした。');
    }
    $lock = fopen($path . '.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) throw new RuntimeException('フォームデータを更新できませんでした。');
    try {
        $items = forms_load_submissions($config);
        $mutator($items);
        forms_save_submissions($config, $items);
        return $items;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function forms_normalize_sent_mail(array $record): ?array
{
    $id = trim((string) ($record['id'] ?? ''));
    $sentAt = trim((string) ($record['sentAt'] ?? ''));
    if ($id === '' || $sentAt === '') return null;
    $status = (string) ($record['status'] ?? 'active');
    if (!in_array($status, ['active', 'archived'], true)) $status = 'active';
    $recipientIds = array_values(array_unique(array_filter(array_map(
        fn($value): string => trim((string) $value),
        is_array($record['recipientIds'] ?? null) ? $record['recipientIds'] : []
    ))));
    return [
        'id' => $id,
        'sentAt' => $sentAt,
        'status' => $status,
        'mode' => ($record['mode'] ?? '') === 'all_active' ? 'all_active' : 'individual',
        'recipientIds' => $recipientIds,
        'subject' => trim((string) ($record['subject'] ?? '')),
        'message' => trim((string) ($record['message'] ?? '')),
        'attempted' => max(0, (int) ($record['attempted'] ?? count($recipientIds))),
        'accepted' => max(0, (int) ($record['accepted'] ?? 0)),
        'failed' => max(0, (int) ($record['failed'] ?? 0)),
    ];
}

function forms_load_sent_mail(array $config): array
{
    $decoded = forms_read_json(forms_sent_mail_path($config));
    $items = [];
    $cutoff = time() - (90 * 86400);
    foreach (($decoded['items'] ?? []) as $record) {
        if (!is_array($record)) continue;
        $item = forms_normalize_sent_mail($record);
        if (!$item) continue;
        $sent = strtotime($item['sentAt']);
        if ($sent !== false && $sent < $cutoff) continue;
        $items[] = $item;
    }
    usort($items, fn(array $left, array $right): int => strcmp($right['sentAt'], $left['sentAt']));
    return $items;
}

function forms_save_sent_mail(array $config, array $items): void
{
    forms_write_json(forms_sent_mail_path($config), [
        'version' => 1,
        'updatedAt' => gmdate('c'),
        'items' => array_values($items),
    ]);
}

function forms_mutate_sent_mail(array $config, callable $mutator): array
{
    $path = forms_sent_mail_path($config);
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('送信履歴の保存フォルダを作成できませんでした。');
    }
    $lock = fopen($path . '.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) throw new RuntimeException('送信履歴を更新できませんでした。');
    try {
        $items = forms_load_sent_mail($config);
        $mutator($items);
        forms_save_sent_mail($config, $items);
        return $items;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function forms_client_ip(): string
{
    $candidate = trim((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? ''));
    return filter_var($candidate, FILTER_VALIDATE_IP) ? $candidate : '';
}

function forms_check_rate_limit(array $config): void
{
    $path = forms_rate_path($config);
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('送信制限を確認できませんでした。');
    $lock = fopen($path . '.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) throw new RuntimeException('送信制限を確認できませんでした。');
    try {
        $now = time();
        $cutoff = $now - 3600;
        $key = hash_hmac('sha256', forms_client_ip() ?: 'unknown', (string) $config['session_secret']);
        $decoded = forms_read_json($path);
        $entries = [];
        foreach (($decoded['entries'] ?? []) as $hash => $times) {
            if (!is_array($times)) continue;
            $recent = array_values(array_filter(array_map('intval', $times), fn(int $time): bool => $time >= $cutoff));
            if ($recent) $entries[(string) $hash] = $recent;
        }
        $own = $entries[$key] ?? [];
        if (count($own) >= 5) throw new DomainException('送信回数が多すぎます。時間をおいてお試しください。');
        $own[] = $now;
        $entries[$key] = $own;
        forms_write_json($path, ['updatedAt' => gmdate('c'), 'entries' => $entries]);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function forms_verify_turnstile(array $config, string $token, string $expectedAction): void
{
    $secret = trim((string) ($config['turnstile_secret'] ?? ''));
    if ($secret === '') throw new LogicException('フォームのスパム対策設定が完了していません。');
    if ($token === '') throw new InvalidArgumentException('スパム対策の確認を完了してください。');
    $body = http_build_query(['secret' => $secret, 'response' => $token, 'remoteip' => forms_client_ip()]);
    $response = auth_http('https://challenges.cloudflare.com/turnstile/v0/siteverify', 'POST', ['Content-Type: application/x-www-form-urlencoded'], $body);
    $result = json_decode((string) $response['body'], true);
    if ((int) $response['status'] !== 200 || !is_array($result) || ($result['success'] ?? false) !== true) {
        throw new InvalidArgumentException('スパム対策を確認できませんでした。もう一度お試しください。');
    }
    $action = trim((string) ($result['action'] ?? ''));
    if ($action !== '' && !hash_equals($expectedAction, $action)) throw new InvalidArgumentException('スパム対策を確認できませんでした。');
    $expectedHost = strtolower((string) parse_url((string) $config['app_origin'], PHP_URL_HOST));
    $verifiedHost = strtolower(trim((string) ($result['hostname'] ?? '')));
    if ($expectedHost !== '' && ($verifiedHost === '' || !hash_equals($expectedHost, $verifiedHost))) {
        throw new InvalidArgumentException('スパム対策を確認できませんでした。');
    }
}

function forms_mail(array $config, array $record): array
{
    $admin = trim((string) ($config['form_notification_email'] ?? ''));
    $from = trim((string) ($config['form_from_email'] ?? ''));
    $safeFrom = filter_var($from, FILTER_VALIDATE_EMAIL) && preg_match('/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$/', $from);
    if (!filter_var($admin, FILTER_VALIDATE_EMAIL) || !$safeFrom) {
        error_log('[mojigoto-forms] mail settings are incomplete');
        return ['configured' => false, 'adminAccepted' => false, 'replyAccepted' => false];
    }
    $isApplication = $record['type'] === 'application';
    $isWithdrawal = $isApplication && ($record['requestKind'] ?? 'join') === 'withdraw';
    $label = $isApplication ? ($isWithdrawal ? '利用解除申込' : '利用申込') : 'お問い合わせ';
    $discoveryLabels = ['friend' => '知人', 'social' => 'SNS', 'website' => 'ホームページ', 'other' => 'そのほか'];
    $discoveryLabel = $discoveryLabels[$record['discovery'] ?? ''] ?? (string) ($record['discovery'] ?? '');
    $siteUrl = rtrim((string) ($config['app_origin'] ?? ''), '/') . '/';
    $adminUrl = $siteUrl . 'admin/';
    $contactUrl = $siteUrl . 'contact/';
    $adminSubject = $isApplication
        ? ($isWithdrawal ? '[もじごと Web] 利用解除の申請が届きました' : '[もじごと Web] 利用申込の申請が届きました')
        : '[もじごと Web] お問い合わせが届きました';
    $adminBody = "種別: {$label}\n受付番号: {$record['id']}\n名前: {$record['name']}\n管理画面ではメールアドレスを伏せ字で表示します。受付番号をもとに申請内容をご確認ください。\n";
    if ($isApplication && !$isWithdrawal) $adminBody .= "きっかけ: {$discoveryLabel}\n";
    if (!$isApplication) $adminBody .= "件名: {$record['subject']}\n";
    $adminBody .= "\n{$record['message']}\n\n内容を確認のうえ、管理画面で対応状況の更新や必要な設定操作を行ってください。\n管理画面: {$adminUrl}\n";
    $headers = ['MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'From: mojigoto Web <' . $from . '>', 'Reply-To: ' . $record['email']];
    $encode = fn(string $subject): string => function_exists('mb_encode_mimeheader') ? mb_encode_mimeheader($subject, 'UTF-8') : $subject;
    $envelopeSender = '-f' . $from;
    $adminAccepted = @mail($admin, $encode($adminSubject), $adminBody, implode("\r\n", $headers), $envelopeSender);
    if (!$adminAccepted) error_log('[mojigoto-forms] admin mail failed: ' . $record['id']);

    $replySubject = '[もじごと Web] ' . $label . 'を受け付けました';
    if ($isApplication) {
        $guidance = $isWithdrawal
            ? "利用解除は、管理者が申請内容とご本人であることを確認したうえで行います。\n確認のため、登録メールアドレスへご連絡する場合があります。"
            : "利用は管理者が申請を確認のうえ、開始となります。\nすぐの利用開始とはなりませんので、利用開始のメールをお待ちください。";
        $submitted = "申請種別: {$label}\n名前: {$record['name']}\n登録メールアドレス: {$record['email']}";
        if (!$isWithdrawal) $submitted .= "\nきっかけ: {$discoveryLabel}";
        if ($record['message'] !== '') $submitted .= "\nメッセージ:\n{$record['message']}";
    } else {
        $guidance = '内容を確認のうえ、必要に応じてご連絡いたします。';
        $submitted = "名前: {$record['name']}\nメールアドレス: {$record['email']}\n件名: {$record['subject']}\nメッセージ:\n{$record['message']}";
    }
    $replyBody = $record['name'] . " 様\n\n{$label}を受け付けました。\n受付番号: {$record['id']}\n\n{$guidance}\n\n--- 送信内容 ---\n{$submitted}\n\nお問い合わせにつきましては、もじごと Webのお問い合わせフォームよりご連絡をお願いいたします。\nこちらに返信をいただいても返答ができませんのでご了承ください。\n\n---\nもじごと Web\n{$siteUrl}\nお問い合わせ: {$contactUrl}\n\n※このメールは自動送信です。";
    $replyHeaders = ['MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'From: mojigoto Web <' . $from . '>'];
    $replyAccepted = @mail($record['email'], $encode($replySubject), $replyBody, implode("\r\n", $replyHeaders), $envelopeSender);
    if (!$replyAccepted) error_log('[mojigoto-forms] reply mail failed: ' . $record['id']);
    error_log(sprintf('[mojigoto-forms] mail result %s admin=%s reply=%s', $record['id'], $adminAccepted ? 'accepted' : 'failed', $replyAccepted ? 'accepted' : 'failed'));
    return ['configured' => true, 'adminAccepted' => $adminAccepted, 'replyAccepted' => $replyAccepted];
}

function forms_membership_mail(array $config, string $email, string $action): array
{
    $from = trim((string) ($config['form_from_email'] ?? ''));
    $safeFrom = filter_var($from, FILTER_VALIDATE_EMAIL) && preg_match('/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$/', $from);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !$safeFrom || !in_array($action, ['activated', 'removed'], true)) {
        error_log('[mojigoto-membership] mail settings or request are invalid');
        return ['configured' => false, 'accepted' => false, 'action' => $action];
    }

    $siteUrl = rtrim((string) ($config['app_origin'] ?? ''), '/') . '/';
    $contactUrl = $siteUrl . 'contact/';
    if ($action === 'activated') {
        $subject = '[もじごと Web] 利用登録が完了しました';
        $message = "もじごと Webの利用登録が完了しました。\n\n以下のURLから、利用申込に使用したMicrosoftまたはGoogleアカウントでログインしてください。\n{$siteUrl}\n\nログイン後、OneDriveまたはGoogle Driveへの接続を許可すると作品を開けます。";
    } else {
        $subject = '[もじごと Web] 利用解除が完了しました';
        $message = "もじごと Webの利用解除が完了しました。\n\nこのメールアドレスでは、もじごと Webへログインできなくなります。\nOneDriveまたはGoogle Driveに保存されている作品データは削除していません。";
    }
    $body = "{$message}\n\nこの操作に心当たりがない場合は、もじごと Webのお問い合わせフォームよりご連絡ください。\n{$contactUrl}\n\n---\nもじごと Web\n{$siteUrl}\nお問い合わせ: {$contactUrl}\n\n※このメールは自動送信です。返信ではなく、お問い合わせフォームをご利用ください。";
    $headers = ['MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'From: mojigoto Web <' . $from . '>'];
    $encodedSubject = function_exists('mb_encode_mimeheader') ? mb_encode_mimeheader($subject, 'UTF-8') : $subject;
    $accepted = @mail($email, $encodedSubject, $body, implode("\r\n", $headers), '-f' . $from);
    if (!$accepted) error_log('[mojigoto-membership] mail failed: ' . $action . ' ' . $email);
    else error_log('[mojigoto-membership] mail accepted: ' . $action . ' ' . $email);
    return ['configured' => true, 'accepted' => $accepted, 'action' => $action];
}

function forms_admin_message_mail(array $config, string $email, string $displayName, string $subject, string $message): array
{
    $from = trim((string) ($config['form_from_email'] ?? ''));
    $safeFrom = filter_var($from, FILTER_VALIDATE_EMAIL) && preg_match('/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$/', $from);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !$safeFrom) {
        error_log('[mojigoto-admin-mail] mail settings or recipient are invalid');
        return ['configured' => false, 'accepted' => false];
    }

    $siteUrl = rtrim((string) ($config['app_origin'] ?? ''), '/') . '/';
    $contactUrl = $siteUrl . 'contact/';
    $mailSubject = '[もじごと Web] ' . $subject;
    $recipientName = forms_text($displayName, 80, false);
    $recipientName = trim(str_replace("\n", ' ', $recipientName));
    if ($recipientName === '') $recipientName = 'もじごとWeb利用者';
    $body = "{$recipientName} 様\n\n{$message}\n\n---\nもじごと Web\n{$siteUrl}\nお問い合わせ: {$contactUrl}\n\n※このメールは送信専用です。返信ではなく、お問い合わせフォームをご利用ください。";
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'From: mojigoto Web <' . $from . '>',
        'Auto-Submitted: auto-generated',
        'X-Auto-Response-Suppress: All',
    ];
    $encodedSubject = function_exists('mb_encode_mimeheader') ? mb_encode_mimeheader($mailSubject, 'UTF-8') : $mailSubject;
    $accepted = @mail($email, $encodedSubject, $body, implode("\r\n", $headers), '-f' . $from);
    if (!$accepted) error_log('[mojigoto-admin-mail] delivery was not accepted');
    return ['configured' => true, 'accepted' => $accepted];
}

function forms_retention_notice_mail(array $config, int $removedSubmissions, int $removedSentMail, int $staleOpen): array
{
    $admin = trim((string) ($config['form_notification_email'] ?? ''));
    $from = trim((string) ($config['form_from_email'] ?? ''));
    $safeFrom = filter_var($from, FILTER_VALIDATE_EMAIL) && preg_match('/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$/', $from);
    if (!filter_var($admin, FILTER_VALIDATE_EMAIL) || !$safeFrom) return ['configured' => false, 'accepted' => false];
    $siteUrl = rtrim((string) ($config['app_origin'] ?? ''), '/') . '/';
    $subject = '[もじごと Web] 保存期限とメールボックス整理のお知らせ';
    $body = "定期整理を実行しました。\n\n対応完了後90日を過ぎて削除した受付情報: {$removedSubmissions}件\n送信後90日を過ぎて削除した送信履歴: {$removedSentMail}件\n受付から83日以上経過した未対応情報: {$staleOpen}件\n\n管理者の受信メールボックスはWebアプリから削除できません。対応済みの申込・問い合わせメールや不要になった送信済みメールも、必要に応じてメールサービス側で削除してください。\n\n管理画面: {$siteUrl}admin/";
    $headers = ['MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'From: mojigoto Web <' . $from . '>', 'Auto-Submitted: auto-generated'];
    $encodedSubject = function_exists('mb_encode_mimeheader') ? mb_encode_mimeheader($subject, 'UTF-8') : $subject;
    $accepted = @mail($admin, $encodedSubject, $body, implode("\r\n", $headers), '-f' . $from);
    return ['configured' => true, 'accepted' => $accepted];
}
