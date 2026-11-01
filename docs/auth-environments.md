# 本番・ローカル認証の整理

確認日: 2026-10-04（AWSコンソール・XAMPP・ローカル実設定を確認）

## 決定

管理入口の分離: ローカルプールに管理専用クライアント `mojigoto-local-admin`（`o8ttv78c56ivonplv9b91gv1s`）を作成した。専用戻り先は `/api/admin/auth/callback`、サインアウトは `/admin/login/`。一般クライアント・Cookieとは分離。設定詳細と本番の適用順序は [admin-auth-setup.md](admin-auth-setup.md)。

Cognitoユーザープール、Microsoft Entraアプリ、Google Cloudプロジェクトを本番／ローカルで分離する。ログイン用MicrosoftアプリとOneDriveアクセス用SPAアプリも用途別に分ける。

| 項目 | 本番 | ローカル |
| --- | --- | --- |
| Web URL | https://web.mojigoto.com/ | http://localhost:4173/ |
| Cognitoプール | ap-northeast-1_4rMJhjC3l | ap-northeast-1_QxuTyxhSN（新規作成） |
| Cognitoクライアント | 7gquj3957t2d9996l5viqke0j4 | 411tuk3ao67bfe68tr4qc2ph7e（新規作成） |
| Cognitoドメイン | https://mojigoto-web.auth.ap-northeast-1.amazoncognito.com | https://ap-northeast-1qxutyxhsn.auth.ap-northeast-1.amazoncognito.com |
| Cognito → PHP | https://web.mojigoto.com/api/auth/callback | http://localhost:4173/api/auth/callback |
| ログアウト後 | https://web.mojigoto.com/ | http://localhost:4173/ |
| 外部IdP → Cognito | https://mojigoto-web.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse | https://ap-northeast-1qxutyxhsn.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse |
| OneDriveのSPA戻り先 | https://web.mojigoto.com/ | http://localhost:4173/ |
| Google JS生成元 | https://web.mojigoto.com | http://localhost:4173 |

本番の実サーバー設定は未取得。表の本番クライアントは既存プールの記録による。本番へ適用する前にサーバー設定と照合する。

## 確認できた問題

追記（2026-10-04）: ローカル稼働設定を新プール・新クライアント・新ドメインへ切り替えた。当初、Google認証後のトークン交換で `invalid_client` が返ったが、新Cognitoクライアントのシークレット修正で解消。Google管理者ログインと `/admin/` 表示を実機確認済み（利用者2名、有効2名、管理者1名）。Microsoftも復旧済み。シークレット修正後の `Bad id_token issuer` は、発行者を個人用Microsoftアカウントの実際のissuerへ変更して解消。Microsoftログイン後の管理画面と利用者一覧のログイン方法「Microsoft」を実機確認した。シークレットIDやクライアントIDをシークレット値として使用しない。

- ApacheのDocumentRootは `C:/dev/mojigoto/web`。PHPセッションAPIは200、Google／Microsoftログイン入口は302で動作する。
- 移行前のローカルは、本番プール内のクライアント `1p8i4ohc344ptt3bq8q92ounii` を使用。クライアントが別でもユーザー、ドメイン、Google／Microsoftプロバイダー設定はプール内で共有される。
- 旧手順書・本番設定例には古いCognitoドメインが残っていた。AWSで確認した現在のドメインへ訂正した。
- 旧ローカルクライアントの許可IdP表示はCognitoのみ。ただし実際のGoogleログインはGoogleのアカウント選択まで到達したため、これだけを400の確定原因とはしない。
- 移行前はGoogleで管理者アカウントを選ぶとCognitoの `/error` に到達し、Chromeで `ERR_BLOCKED_BY_CLIENT` が表示された。新ローカル環境ではGoogle認証と管理画面復帰を確認済み。

## 設定ファイルの扱い

- Apacheが実際に読むのは `web/config.json` と `web/api/auth/config.php`。
- 移行前の2ファイルは、公開ルート外・Git対象外の `.local-config/` にバックアップした。
- 新しいローカル用の準備ファイルは `.local-config/local/` に置く。Cognitoのシークレット・セッション秘密値はこのPHPファイルだけに設定する。
- 全項目が揃うまで稼働ファイルは置き換えない。本番サーバーへローカル設定をアップロードしない。
- 配布物に `config.json`、`api/auth/config.php`、`api/auth/data/` の利用者情報を含めない。本番の招待リストとローカルの招待リストも別管理にする。
- `npm run web:dev` は静的NodeサーバーでPHPを実行しない。ログイン・管理画面の検証には現在のXAMPP Apacheを使う。

## ローカル切り替えの順番

現在の進捗: 新プールとクライアントの作成、プール名 `mojigoto-local-users` への変更、コールバック／サインアウトURL、認証コード付与、openid・emailのみの設定を完了。Google・Microsoftプロバイダーの作成と新クライアントでの有効化も確認。ローカル設定は適用済み。Google・Microsoftログインと管理画面は復旧済み。メールログインも検証済み属性の設定後に成功し、hasakudo@gmail.comの一般利用者ホーム表示を実機確認済み。

ローカルPHP: `.local-config/local/auth.php`（新しいプール／クライアント／ドメイン、独立したセッション秘密値・Cookie名、`users-local.json` を指定）。ローカル公開設定: `.local-config/local/config.json`。両方とも稼働ファイルへ適用済み。シークレット修正後は準備PHPと稼働PHPを同期してから検証する。

| 開発用項目 | 確認した値 |
| --- | --- |
| Google Cloudプロジェクト | mojigoto-tools |
| Googleプロジェクト番号 | 456103060685（OAuth IDの接頭辞） |
| GoogleウェブOAuthクライアント | 456103060685-8vsvi45id6eup8duone1h3kd5kbtl2uk.apps.googleusercontent.com |
| Microsoftログイン用アプリ | もじごとWeb ローカルログイン / a64b5fe3-05cd-45b1-8b13-e1302ef0b878 |
| Microsoft OneDrive用SPA | もじごとローカル / 5a4f72d3-24ca-4e93-aff7-fe69f37af42f |
| Microsoftログイン発行者 | https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0 |

GoogleとMicrosoftログイン用アプリの戻り先は、新プールの `/oauth2/idpresponse` に設定済み。OneDrive用SPAに `http://localhost:4173/` があることも確認した。ただしOneDrive用アプリの登録済みGraph権限はFiles.Read・User.Readであり、書き込み権限の検証は未完了。ローカル用Picker APIキーも未設定。

1. 新プールの名前を `mojigoto-local-users` に揃える。自己登録無効、必須属性emailを維持する。
2. 新クライアントのコールバック／ログアウトURLを表に揃え、認証コード付与、openid・emailに限定する。
3. 既存の開発用Entraログインアプリ（Web）と開発用Google OAuthクライアントへ、新しいCognitoの `/oauth2/idpresponse` を登録する。本番用アプリやプロジェクトは変更しない。
4. 新プールへ `Microsoft`（OIDC）・`Google` を登録。必要なemailマッピングを設定し、新クライアントでも両方を有効化する。
5. 開発用OneDrive SPA ID、Google Drive OAuth ID、Pickerキー・プロジェクト番号をローカル公開設定へ入力する。GoogleのDriveテストユーザーは開発プロジェクト側で登録する。
6. 新Cognitoクライアントの秘密値を準備PHPへ保存。セッション秘密値は本番と別にする。
7. 準備ファイルを稼働ファイルへ適用し、既存セッションを終了して再ログイン。管理者のログイン、招待利用者のログイン、未招待／停止時の拒否、ログアウトを確認する。
8. 新環境の動作確認後に、旧プール内のローカルクライアントを廃止する。今は削除しない。

## Dropbox審査用メールログイン

対象メール: `hasakudo@gmail.com`。一般利用者として登録し、管理者にはしない。

新ローカルプールのユーザーは確認済み状態で、本人によるパスワード変更は完了。2026-10-04、本人の所有確認と明示承認を受けてemail属性を検証済みに変更し、AWSの保存成功と検証済み表示を確認した。ローカルPHPのメールログイン許可・招待設定は有効。未検証メールを拒否するコードは維持している。保存済みの既存資格情報でメール／パスワードログインに成功し、ホームにhasakudo@gmail.comが表示されることを確認した。

次の3つが必要:

1. 審査担当者がアクセスする環境のCognitoに、外部Googleユーザーとは別のメール／パスワードユーザーを作る。email確認済み、初回パスワード変更が残っていない状態にする。
2. 同じ環境のPHP設定で `email_login_enabled: true` と `email_login_allowed_emails` に対象メールを設定する。
3. 同じ環境のもじごとの招待利用者として追加し、有効にする。公開設定の `loginProviders` はGoogle・Microsoftのみとし、審査用の専用入口 `/review-login/` を使用する。

ローカルで登録しても、本番の審査用アカウントは作られない。本番URLでDropbox審査を行う場合は、本番プール・本番PHP設定・本番招待リストにも設定が必要。パスワードはユーザー本人が設定し、チャットや設定JSONへ記載しない。

Google Cloudのテストユーザー登録はGoogle Driveの認可用であり、このCognitoメールログインとは別。DropboxのApp Consoleの開発ユーザーも別の設定。

## 公式資料

- [Cognito認可エンドポイント](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html)
- [Cognito外部プロバイダーの戻り先](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html)
- [Googleのテスト公開とテストユーザー](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

Microsoft発行者の補足: `consumers` は個人用アカウント向けの別名だが、今回返されたIDトークンのissuerは上表のテナントGUIDだった。Microsoft公式の公開OIDCメタデータで同じissuerを確認し、Cognitoの自動入力方式で設定した。発行者検証は無効化していない。

- [Microsoft OIDC](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
- [CognitoのOIDCトークン検証](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-flow.html)

## ローカルDropbox設定（2026-10-04追記）

既存の開発用Dropboxアプリ「もじごと」を使用する。App Consoleでlocalhostの戻り先と公開クライアント許可、files.metadata.read・files.content.read・files.content.writeを確認した。切り替え前のバックアップのApp keyと一致し、本番バックアップのApp keyとは異なる。既存App keyをweb/config.jsonと.local-config/local/config.jsonのdropboxClientIdへ復元し、ホームの「Dropboxに接続」表示を実機確認した。App secretは使用しない。

開発ユーザーの設定はOnly youで、追加ユーザーは未有効。CognitoでメールログインできてもDropboxの利用許可は別の設定。実際のDropbox認可・フォルダ読み書きは未確認。

## 審査用入口の分離（2026-10-04）

ローカルの通常画面からメールログインボタンを外し、/review-login/に審査担当者用の専用ページを追加。PHPのメールログイン許可条件は維持。本番への適用手順はreview-email-login.mdを参照。本番サーバー設定はこの変更では未適用。

専用ページから既存のメール／パスワード認証に成功し、ホームへ復帰することを確認。ログアウト後の通常画面はMicrosoft・Googleの2ボタンのみで、メール入口が表示されないことを実機確認。関連テスト17件成功。
