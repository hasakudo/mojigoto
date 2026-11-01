<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/forms/bootstrap.php';

try {
    $config = auth_config();
    $beforeUsers = auth_load_user_registry($config);
    $users = auth_mutate_user_registry($config, static function (array &$records): void {});
    $beforeSubmissions = forms_read_json(forms_submission_path($config));
    $rawSubmissions = is_array($beforeSubmissions['items'] ?? null) ? $beforeSubmissions['items'] : [];
    $beforeSubmissionCount = count($rawSubmissions);
    $expiredSubmissionCount = 0;
    $staleOpenCount = 0;
    foreach ($rawSubmissions as $record) {
        if (!is_array($record)) continue;
        $item = forms_normalize_submission($record);
        if (!$item) continue;
        $completed = $item['completedAt'] !== '' ? strtotime($item['completedAt']) : false;
        $created = $item['createdAt'] !== '' ? strtotime($item['createdAt']) : false;
        if ($completed !== false && $completed < time() - (90 * 86400)) $expiredSubmissionCount++;
        elseif ($completed === false && $created !== false && $created < time() - (83 * 86400)) $staleOpenCount++;
    }
    $submissions = forms_mutate_submissions($config, static function (array &$items): void {});
    $beforeSentMail = forms_read_json(forms_sent_mail_path($config));
    $rawSentMail = is_array($beforeSentMail['items'] ?? null) ? $beforeSentMail['items'] : [];
    $beforeSentMailCount = count($rawSentMail);
    $sentMail = forms_mutate_sent_mail($config, static function (array &$items): void {});
    $expiredSentMailCount = max(0, $beforeSentMailCount - count($sentMail));

    $auditPath = auth_admin_audit_path($config);
    if (is_file($auditPath)) {
        $decoded = forms_read_json($auditPath);
        forms_write_json($auditPath, ['entries' => auth_normalize_audit_entries($decoded['entries'] ?? [], 200)]);
    }
    $legacyAuditPath = dirname($auditPath) . '/admin-audit.jsonl';
    if (is_file($legacyAuditPath)) {
        $source = [];
        $lines = file($legacyAuditPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach (is_array($lines) ? $lines : [] as $line) {
            $entry = json_decode($line, true);
            if (is_array($entry)) $source[] = $entry;
        }
        $encoded = array_map(fn(array $entry): string => (string) json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), auth_normalize_audit_entries($source, 200));
        file_put_contents($legacyAuditPath, $encoded ? implode("\n", $encoded) . "\n" : '', LOCK_EX);
        @chmod($legacyAuditPath, 0600);
    }

    $statePath = forms_maintenance_state_path($config);
    $state = forms_read_json($statePath);
    $lastReminder = strtotime((string) ($state['lastRetentionReminderAt'] ?? '')) ?: 0;
    $needsReminder = $expiredSubmissionCount > 0 || $expiredSentMailCount > 0
        || ($staleOpenCount > 0 && $lastReminder < time() - (7 * 86400));
    if ($needsReminder) {
        $notice = forms_retention_notice_mail($config, $expiredSubmissionCount, $expiredSentMailCount, $staleOpenCount);
        if (($notice['accepted'] ?? false) === true) {
            forms_write_json($statePath, ['lastRetentionReminderAt' => gmdate('c')]);
        } else {
            error_log('[mojigoto-cleanup] retention reminder was not accepted');
        }
    }

    echo sprintf(
        "cleanup complete: users %d -> %d, submissions %d -> %d, sent mail %d -> %d, stale open %d\n",
        count($beforeUsers),
        count($users),
        $beforeSubmissionCount,
        count($submissions),
        $beforeSentMailCount,
        count($sentMail),
        $staleOpenCount
    );
} catch (Throwable $error) {
    fwrite(STDERR, 'cleanup failed: ' . $error->getMessage() . "\n");
    exit(1);
}
