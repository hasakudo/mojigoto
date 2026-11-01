<?php

// このファイルを config.php という名前で同じフォルダへ複製し、
// client_secret、session_secret、admin_emails をサーバー上で設定します。
// config.php はGitと配布ZIPへ含めません。
return [
    'app_origin' => 'https://web.mojigoto.com',
    'region' => 'ap-northeast-1',
    'user_pool_id' => 'ap-northeast-1_4rMJhjC3l',
    'client_id' => '7gquj3957t2d9996l5viqke0j4',
    'client_secret' => '',
    'cognito_domain' => 'https://mojigoto-web.auth.ap-northeast-1.amazoncognito.com',
    'callback_url' => 'https://web.mojigoto.com/api/auth/callback',
    'logout_url' => 'https://web.mojigoto.com/',
    'session_cookie' => 'mojigoto_session',
    'session_secret' => '',
    'session_ttl_seconds' => 43200,
    // 同じプール内の別クライアント。未設定時は管理APIを利用できません。
    'admin_client_id' => '',
    'admin_client_secret' => '',
    'admin_session_cookie' => 'mojigoto_admin_session',
    'admin_idle_timeout_seconds' => 900,
    'admin_absolute_timeout_seconds' => 3600,
    'admin_recent_auth_seconds' => 300,
    // 審査用のCognitoローカルユーザー。パスワードはCognitoだけで管理します。
    'email_login_enabled' => false,
    'review_login_notification_enabled' => false,
    // 省略時はform_notification_emailを使用。設定する場合は運営用メールアドレス。
    'review_login_notification_email' => '',
    // 本番・ローカルで別管理。保存先は非公開ディレクトリに置きます。
    'review_login_notification_path' => __DIR__ . '/data/review-login-notifications.json',
    'email_login_allowed_emails' => [
        // 'review@example.com', // 管理者以外の専用アドレス。別途、招待を有効にしてください。
    ],
    'identity_providers' => [
        // Cognitoで登録するプロバイダー名と完全一致させます。
        'microsoft' => 'Microsoft',
        'google' => 'Google',
    ],
    'admin_emails' => [
        // 'you@example.com',
    ],
    // 運営者の普段用アカウント。管理権限を付けず、管理画面で目印と削除保護を付けます。
    'owner_member_email' => '',
    // 管理画面で変更する招待情報の保存先です。公開アクセスは .htaccess で拒否します。
    'user_registry_path' => __DIR__ . '/data/users.json',
    'invited_emails' => [
        // 既存設定との互換用です。管理画面の初回表示時に一覧へ取り込まれます。
    ],
    'disabled_emails' => [],
    // 公開フォーム。Turnstileの秘密キーは必ずこの非公開ファイルだけに設定します。
    'turnstile_secret' => '',
    'form_notification_email' => '',
    'form_from_email' => '',
    'form_submission_path' => __DIR__ . '/data/form-submissions.json',
    // 管理画面で登録する語句に加えて、常に拒否する語句があれば設定します（部分一致・大文字小文字を区別しません）。
    'form_blocked_terms' => [
        // '禁止したい語句',
        // 'spam.example',
    ],
    // 管理画面から送信したメール本文は送信後90日で自動整理します。
    'sent_mail_path' => __DIR__ . '/data/sent-mail.json',
];
