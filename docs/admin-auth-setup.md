# 管理者専用ログインの設定

## 審査用ログインの運営通知

本番 `api/auth/config.php` に `'review_login_notification_enabled' => true,` を追加すると、審査用メール・パスワードログインの成功後に既存の `form_notification_email` へ通知する。送信元は既存の `form_from_email`、配送は既存フォームと同じPHP mail()を利用する。宛先を分ける場合のみ `review_login_notification_email` を設定する。通常のGoogle/Microsoftログインやログイン失敗は通知しない。

同じ審査アカウントへの送信試行は1時間に1回まで。通知は日本時間の日時・利用者ID・伏せ字メール・環境URLだけを含み、認証情報は含めない。通知失敗でもログインを継続し、PHPログに `[mojigoto-review-login]` を記録する。送信失敗も1時間の制限対象で、その後のログイン時に再試行する。通知に成功したログイン以降、抑制期間内のログインをまとめて後から送信する機能はない。

制限台帳は `api/auth/data/review-login-notifications.json`（`.htaccess`で非公開）にHMAC識別子と送信試行時刻だけを保存する。利用者データと同様、更新ZIPには含めない。`review_login_notification_path` で公開領域外へ変更する場合は、そのディレクトリにPHPの書き込み権限を付ける。本番とローカルで台帳を共有しない。

転送時は新規 `api/auth/review-login-notification.php` と `api/auth/.htaccess` を先に置いてから、`api/auth/callback/index.php` を更新する。その後、本番の審査アカウントでログインし、運営受信箱への到着・連続ログインで通知が増えないことを確認する。mail()の成功は配送システムへの受付を示し、実際の受信を保証するものではない。

ローカルには既存の通知先・送信元が設定されていないため、ローカルの通知は無効のまま。送信関数を差し替えた自動テストで通知内容・宛先・1時間境界・失敗・ヘッダー注入拒否を検証済み。実メール配送は未検証。

管理入口は `/admin/login/`。一般画面のログインや審査用メールログインでは管理APIを利用できない。管理者は許可リストのGoogleまたはMicrosoftアカウントで専用入口から認証する。

## 管理と普段のアカウント分離（追加更新）

普段用の目印・削除保護: 本番 `api/auth/config.php` に `'owner_member_email' => 'lovetwo.smile@gmail.com',` を追加する。管理画面では「自分の普段用」「削除から保護されています」と表示し、削除ボタンを出さない。APIへの削除要求も拒否する。管理権限は付与せず、一般利用者のまま扱う。利用停止・再開は従来どおり操作できる。アドレスは引き続き伏せ字で返す。意図して削除する場合は先にサーバー設定のこの指定を外す。

管理専用は `mojigoto.web@gmail.com`、普段用は `lovetwo.smile@gmail.com`。ローカルの稼働設定と準備設定はこの割り当てに変更済み。普段用は既存の有効な招待を維持する。

`admin_emails` に含まれるアカウントは通常ログインを403で拒否する。既存の通常セッションも `admin_only` と判定し、通常画面とプロフィール更新を拒否する。通常セッションAPIは管理権限を返さない。管理専用Cookieによる管理アクセスは従来どおり許可する。

本番はアップロード前に次を確認する。

1. 普段用が有効な招待利用者として登録されていること。
2. 本番 `api/auth/config.php` の `admin_emails` を `['mojigoto.web@gmail.com']` に変更する。普段用を管理者リストに残さない。他の本番設定・秘密値は保持する。
3. 管理専用アカウントで `/admin/login/` からログインできること。
4. 更新ZIP全体を転送し、普段用で通常ホームを開けること、管理用の通常ログインが拒否されること、普段用の管理ログインが拒否されることを確認する。

アカウント分離にCognitoユーザー削除や新規プール作成は不要。普段用・管理用のブラウザプロファイルを分け、管理用ではクラウド作品フォルダに接続しない。Google/Microsoftの別名だけではなく、独立したアカウントを使用する。

通常Google/Microsoftログインには `prompt=select_account` を追加した。同じプロファイルで管理アカウントのCognito SSOが残っていても、普段用の選択へ進めるようにする。AWSのマネージドログイン方式が前提で、クラシック方式ではpromptは対応しない。プロファイル分離は引き続き推奨する。

追加更新の検証: 自動テスト28件、ApacheへのHTTP検証17件成功。Google実機で管理用の通常ログイン拒否、普段用の通常ホーム表示、普段用の管理ログイン拒否、管理用の専用管理画面表示を確認した。両アカウントの通常・管理セッションを同時に保持し、別タブでそれぞれの画面を表示できることも確認した。Microsoftのアカウント分離は共通コールバック・共通権限判定で保護するが、今回の変更後のMicrosoft実機ログインは未実施。本番設定・アップロードは未実施。

## Cognito

各環境の既存プール内に、一般利用者とは別のシークレット付きWebアプリクライアントを作成する。プール、外部IdP、ユーザーは同じ環境内で共有する。本番とローカルのプールは引き続き分離する。

| 設定 | ローカル | 本番 |
| --- | --- | --- |
| クライアント名 | mojigoto-local-admin | mojigoto-web-admin（新規作成） |
| クライアントID | o8ttv78c56ivonplv9b91gv1s | 本番で作成後に設定 |
| コールバック | http://localhost:4173/api/admin/auth/callback | https://web.mojigoto.com/api/admin/auth/callback |
| サインアウト | http://localhost:4173/admin/login/ | https://web.mojigoto.com/admin/login/ |

許可IdPはGoogleとMicrosoftのみ。Cognitoユーザープールのメールログインは選択しない。OAuthは認証コード付与のみ、スコープはopenid・emailのみ。IdP側の戻り先は従来のCognito `/oauth2/idpresponse` と同じなので、Google/Entraの新規アプリ作成は不要。

再認証には `prompt=login` を使用する。AWSの仕様ではマネージドログインでのみ有効で、クラシックUIでは対応しない。ドメインの方式とクライアントのスタイル割り当てを確認すること。既存セッションを使った認証が返ってきた場合は、署名検証済みトークンのauth_timeを検査し、古い認証を拒否する。

## PHP設定

本番サーバーの `api/auth/config.php` に以下を追加する。既存の一般クライアント、プール、招待情報を保持する。

```php
'admin_client_id' => '本番の管理者専用クライアントID',
'admin_client_secret' => 'そのクライアントのシークレット値',
'admin_session_cookie' => 'mojigoto_admin_session',
'admin_idle_timeout_seconds' => 900,
'admin_absolute_timeout_seconds' => 3600,
'admin_recent_auth_seconds' => 300,
```

一般と管理のCookie名は必ず別にする。ローカルのCookie名は `mojigoto_local_admin_session`。秘密値をJSON、JavaScript、チャット、更新ZIPへ含めない。クライアント未設定では管理APIを拒否するため、**本番クライアント作成・設定の完了後にプログラムをアップロードする**。

## 保護と確認

- 管理セッションは無操作15分、ログインから最大1時間。サーバー側でも毎回判定する。
- 画面の自動更新は無操作時間を延長しない。ブラウザの実操作でのみ活動通知を送る。期限切れ時に編集内容は失われるため、長時間の下書きは別途保存する。
- 利用者変更、メール操作、フォーム設定、申請の承認・削除、お知らせの削除は、認証から5分以内だけ許可する。再認証後に内容を確認して手動で再実行する。
- 管理CookieはSecure・HttpOnly・SameSite=Lax。OAuthはstate・nonce・PKCEを使用し、IDトークン署名・issuer・audience等を検証する。
- 専用ログアウトは管理セッションだけを破棄する。一般利用セッションは別Cookieで維持する。

実機では、一般ログイン中の管理API拒否、専用ログイン後の管理画面、非管理者の拒否、管理ログアウト後の一般ログイン維持を確認する。期限境界・再認証境界はPHPテストでも検証する。

この実装だけではGoogle/MicrosoftのMFAを保証しない。管理者アカウントの多要素認証・復旧方法は各IdPで別途確認する。CognitoのMFA設定は外部IdP利用者に適用されない。

ローカル実機では、Googleの既存SSOからアカウント選択のみで新しいCognito認証が完了した。auth_timeはCognitoの認証時刻であり、Google/Microsoftのパスワード再入力やMFA実施時刻の証明にはならない。5分条件は「新しいCognito認証の確認」として扱う。盗まれたIdPセッションに対する強制的な追加認証が必要な場合は、アプリ側のWebAuthn等を別途設計する。

ローカル検証: Google専用ログインで管理画面を表示、非管理者アカウントを403で拒否、専用ログアウトで入口へ復帰。自動テスト25件成功。ApacheへのHTTP検証15件成功（一般Cookieで全5管理APIを拒否、専用Cookieの受入れ、CSRF拒否、重要操作の5分期限、無操作/絶対期限）。HTTP検証は `C:/xampp/php/php.exe test/fixtures/admin-http-local.php` で明示実行する。ローカル専用・一時テストセッションのみを作成し、アプリデータは変更しない。

実ブラウザでも一般ログインした管理者は管理画面を開けず、専用ログイン後に管理ログアウトしても一般ホームのログインが残ることを確認した。MicrosoftはWindowsの本人確認をユーザーへ引き継ぎ中で、専用ログインの完了は未確認。

参考: [AWS認可エンドポイント](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html)、[AWS MFA](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)。
