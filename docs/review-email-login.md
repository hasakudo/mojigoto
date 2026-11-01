# 審査用メールアドレス・パスワードログイン

パスワードの入力と照合はCognitoの画面で行います。もじごとのサーバー・JavaScript・設定ファイルにはパスワードを保存しません。既定では無効です。

## AWS側の準備

1. 本番Cognitoの「アプリクライアント → ログインページ」で、既存のMicrosoft・Googleに加えてCognitoユーザープールのローカルログインを有効にします。パスワードログインを使用し、自己登録は引き続き無効にします。
2. 「ユーザー → ユーザーを作成」で審査専用のローカルユーザーを作成します。管理できるメールアドレスを使用し、email属性を確認済みにします。新しい外部Google／Microsoftアカウントは不要ですが、Cognitoにはローカルユーザーを追加します。
3. 固有の強いパスワードを用意します。仮パスワードの場合、管理者が一度ログインして本パスワードへ変更してから審査へ提供します。もしくはAWSのAdminSetUserPasswordをPermanent=trueで使用します。
4. 既存の外部ログインユーザーや管理者アドレスは流用せず、専用の一般ユーザーにします。同じemailを持つ既存ユーザーがある場合、Cognitoの重複・エイリアス設定を確認し、既存ユーザーのemailやパスワードを変更しないでください。

## サーバー側の準備

管理画面で審査専用メールアドレスを招待し、利用状態を有効にします。管理者には登録しません。

公開サーバーの `api/auth/config.php` に次を追記します。

```php
'email_login_enabled' => true,
'email_login_allowed_emails' => ['実際の審査専用メールアドレス'],
```

公開サーバーの `config.json` のloginProvidersは通常利用者向けのGoogle・Microsoftだけにします。メールログインの有効化・許可一覧はPHP側で管理し、通常画面にはメールログインボタンを表示しません。

```json
"loginProviders": ["microsoft", "google"]
```

ローカルで同じ構成を検証する場合も、画面のloginProvidersからemailを外し、PHPのメールログイン設定は有効のままにします。本番のloginRequired、authApiBase、Cognito実値は既存の本番設定を維持してください。

## 動作確認

- 審査専用ページ `/review-login/` の「審査用アカウントでログイン」からCognito画面へ進み、審査ユーザーでログインします。Cognito画面にMicrosoft／Googleの選択肢が表示されても、審査ユーザーのメールとパスワードを入力してください。
- 初回パスワード変更・追加確認で審査担当者が止まらないことを確認します。
- 審査ユーザーでDropbox接続とサンプル作品の読み書きを確認します。
- 未招待、停止、許可一覧外、未確認email、外部IdP経由のログインはこの入口では許可しません。
- 管理画面に入れないこと、ログアウトできることを確認します。
- 審査終了後はemail_login_enabledをfalseにし、ユーザーも停止します。この方法の既存セッションは次のAPIアクセス時に失効します。通常画面のloginProvidersにはemailを追加しません。
- 専用ページはサーバーの設定から受付状況を確認し、停止中はログインボタンと入力案内を隠して「審査用ログインは現在停止中です」と表示します。通信・設定エラー時もボタンを表示せず、確認できない旨を案内します。通常画面からの戻る操作でも状況を再確認します。
- この表示を本番へ反映する場合は、`api/auth/review-status/index.php`、`review-login/review-login.js`、`review-login/review-login.css`を配置してから`review-login/index.html`を更新します。新規APIが未配置の場合はボタンを表示しません。本番の`api/auth/config.php`をローカル設定で上書きしないでください。

審査用パスワードは申請の専用欄だけで共有します。ZIP・公開ページ・Git・チャットには記載しません。Dropbox側の認可は別で、担当者自身のDropboxとサンプルZIPを使用します。

Google申請済みのログイン手順が変わる場合は、審査担当者へ新しい入口・操作手順を案内してください。

公式資料: [管理者によるユーザー作成](https://docs.aws.amazon.com/cognito/latest/developerguide/how-to-create-user-accounts.html)、[Cognitoログイン画面](https://docs.aws.amazon.com/cognito/latest/developerguide/login-endpoint.html)。

## 専用入口と本番への適用

- ローカル: http://localhost:4173/review-login/
- 本番適用後: https://web.mojigoto.com/review-login/

専用ページは通常画面・フッターからリンクせず、検索対象外（noindex, nofollow）にする。URL非表示はアクセス制御ではない。PHPの許可一覧、検証済みメール、招待有効、非管理者の検査を維持する。パスワードは専用ページには入力させず、既存のCognito認証画面で扱う。

本番ではweb/review-login/のHTMLとCSSを公開し、本番config.jsonのloginProvidersをGoogle・Microsoftのみとする。本番Cognitoに審査用の一般ユーザーを作成し、パスワード変更・メール検証を完了してから、本番PHPの許可一覧と本番招待リストを設定する。ローカルのconfig.php、シークレット、利用者JSONを本番へコピーしない。通常画面、専用入口、対象外アカウントの拒否、審査ユーザーのログアウトを確認してから専用URLを審査申請へ記載する。
