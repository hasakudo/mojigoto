# Amazon Cognito 登録手順（もじごとWeb）

この手順は、招待制ベータ版のログイン基盤を作るためのものです。OneDriveへのファイル接続とは別の設定です。

## 確定済みURL

- アプリURL: `https://web.mojigoto.com/`
- Cognitoからアプリへ戻るURL: `https://web.mojigoto.com/api/auth/callback`
- ログアウト後URL: `https://web.mojigoto.com/`

URLは末尾の `/` やパスを含めて完全一致させます。

## 1. ユーザープールを作る

AWS Management Consoleでリージョンを東京 `ap-northeast-1` にし、Amazon Cognitoの「ユーザープールを作成」を開きます。

推奨値:

| 項目 | 値 |
| --- | --- |
| アプリケーションタイプ | 従来のウェブアプリケーション（Traditional web application） |
| アプリケーション名 | `mojigoto-web` |
| サインイン識別子 | メールアドレス |
| 必須属性 | email |
| 自己登録 | 無効 |
| MFA | 初期段階では必須にしない |
| ユーザープール名 | `mojigoto-beta-users` |

自己登録を無効にしても、Microsoft／Googleなど外部IDプロバイダーで初めてログインした利用者はCognito側に作成されます。そのため、もじごと側の認証APIでも招待済みメールアドレスを照合し、未招待者にはセッションを発行しません。

## 2. アプリクライアントを設定する

| 項目 | 値 |
| --- | --- |
| クライアントシークレット | 生成する |
| OAuthフロー | Authorization code grant のみ |
| OpenID Connectスコープ | `openid`、`email` |
| コールバックURL | `https://web.mojigoto.com/api/auth/callback` |
| サインアウトURL | `https://web.mojigoto.com/` |

Implicit grantは有効にしません。クライアントシークレットは、さくらサーバーの非公開設定だけに保存します。`web/config.json`、JavaScript、Git、配布ZIPには記載しません。

## 3. Cognitoドメインを作る

ユーザープールの「ドメイン」でCognitoドメインを作ります。候補は `mojigoto-tools` ですが、Cognito全体で使用済みの場合は `mojigoto-tools-beta` などへ変更します。

作成後のURL例:

```text
https://mojigoto-tools.auth.ap-northeast-1.amazoncognito.com
```

実際に発行された完全なドメインを記録します。

## 4. この段階で記録する値

次の値を控えます。

- AWSリージョン: `ap-northeast-1`
- ユーザープールID
- アプリクライアントID
- Cognitoドメイン
- アプリクライアントシークレット

クライアントシークレットだけはチャットや公開ファイルへ貼り付けません。`web/api/auth/config.example.php` を複製して作る非公開の `web/api/auth/config.php` に、サーバー上で直接設定します。

現在の登録値:

- リージョン: `ap-northeast-1`
- ユーザープールID: `ap-northeast-1_4rMJhjC3l`
- アプリクライアントID: `7gquj3957t2d9996l5viqke0j4`
- Cognitoドメイン: `https://mojigoto-web.auth.ap-northeast-1.amazoncognito.com`

## 5. Microsoft／Google連携時の戻り先

外部ログイン側へ登録する戻り先は、もじごとWebのURLではなくCognitoの次のURLです。

```text
https://<Cognitoドメイン>/oauth2/idpresponse
```

Microsoftログイン用のEntraアプリと、OneDriveファイル接続用のSPAアプリは分ける方針です。ログイン用は本人確認に必要な `openid email` のみにし、氏名を含む `profile` は要求しません。OneDrive用だけに `Files.ReadWrite` を許可します。GoogleログインとGoogle Drive接続は操作・要求スコープを分けます。現行Web構成では同じGoogle CloudのウェブOAuthクライアントを使います。本番準備の全体手順は [beta-production-setup.md](beta-production-setup.md) を参照してください。

## さくらサーバーへ置く非公開設定

配布物の `api/auth/config.example.php` を同じ場所へ `config.php` という名前で複製し、次の項目だけをサーバー上で設定します。

- `client_secret`: Cognitoのアプリクライアントシークレット
- `session_secret`: 32バイト以上の推測できないランダム文字列
- `invited_emails`: ログインを許可するメールアドレス

`config.php` はGitと配布ZIPの生成対象から除外します。認証APIはHttpOnly・Secure・SameSite付きCookieを使用し、ログイン後に招待状態をサーバー側で確認します。
