# もじごとWeb 本番設定・ベータ公開の順番

最終更新: 2026-10-03

## 推奨順序

新ドメインの公開ページ整備 → Cognitoの本番ドメイン確定 → Microsoft Entra／Google Cloud／Dropboxの本番設定 → Cognitoへの外部プロバイダー登録 → サーバー設定・実機検証 → Google審査、Microsoft発行元確認、Dropbox申請準備 → 条件を満たした範囲で招待制ベータ公開。

設定する順番と申請する順番は分ける。現行Google Drive接続は非機密のdrive.file方式であり、旧driveの制限付きスコープ申請を前提としない。ブランド等の必要な確認を現行コンソールで判断する。現在の本番登録状態は未確認。

## 1. 新ドメインと公開ページ

- Web: `https://web.mojigoto.com/`
- 公式HP: `https://mojigoto.com/`
- `/about/`、`/privacy/`、`/terms/`、`/contact/` をログインなしで公開する。
- 公式HPからWebの説明・プライバシーポリシー・利用規約へリンクする。
- DNS、HTTPS証明書、PHP、URL書き換え、メール送信を確認する。
- Google Search Consoleで `mojigoto.com` の所有権を確認する。本番プロジェクトのOwnerまたはEditorのGoogleアカウントを使用する。
- Turnstileの許可ホストへ `web.mojigoto.com` を登録する。
- 開発用と本番用の登録・設定を区別する。本番用のIDが確定する前にログイン必須を有効にしない。

## 2. Amazon Cognitoの骨組み

まず本番用ユーザープール、PHPサーバー向けアプリクライアント、Cognitoドメインを確定する。既存プールを本番として使う場合、新しいWebドメインだけを理由に作り直す必要はない。開発と分離する場合は、新プールとクライアントの実値を使用する。

| 項目 | 本番値 |
| --- | --- |
| アプリ種別 | 従来のウェブアプリケーション（PHP側でコード交換） |
| フロー | Authorization code grant |
| スコープ | `openid email` |
| コールバックURL | `https://web.mojigoto.com/api/auth/callback` |
| サインアウトURL | `https://web.mojigoto.com/` |
| クライアントシークレット | PHP側の非公開設定だけに保存 |

ここで外部プロバイダーへ登録する `https://<実際のCognitoドメイン>/oauth2/idpresponse` が決まる。`<実際のCognitoドメイン>` はホスト名であり、`https://` を重複させない。Cognitoドメイン自体を変更しないなら、このURLはWebドメイン変更後も変わらない。

既存の登録値は [cognito-registration.md](cognito-registration.md) にある。別の本番プールを作った場合、`config.example.php` にある旧プールID・クライアントID・Cognitoドメインをそのまま本番へ流用しない。

## 3. Microsoft Entra

| 用途 | 登録する戻り先 | 権限・秘密情報 |
| --- | --- | --- |
| Cognito経由のサービスログイン | WebプラットフォームにCognitoの `/oauth2/idpresponse` | `openid email`。シークレットはCognitoに設定 |
| OneDriveへの直接接続 | SPAに `https://web.mojigoto.com/` | Graph委任権限 `Files.ReadWrite`。SPAにはシークレットを作らない |

ログイン用とOneDrive用は別のアプリ登録にする。現在のOneDrive実装は `/consumers` を使用するので、個人用Microsoftアカウントが対象。職場・学校アカウントへ広げる場合は、登録だけでなく実装・テストも見直す。

ホームページ、プライバシーポリシー、利用規約、ロゴ、発行元ドメインを本番用に整える。発行元ドメインの所有権確認と「確認済み発行元」の取得は別手続き。確認済み発行元にはPartner Centerの確認済み組織アカウント等の要件がある。組織向けの展開では同意ポリシーの影響も確認する。

## 4. Google Cloud

本番プロジェクトを開発・テスト用と分け、Drive APIとPicker APIを有効化する。

| 設定 | 本番値 |
| --- | --- |
| 承認済みドメイン | `mojigoto.com` |
| ホームページ | `https://mojigoto.com/` |
| プライバシーポリシー | `https://web.mojigoto.com/privacy/` |
| 利用規約 | `https://web.mojigoto.com/terms/` |
| 承認済みJavaScript生成元 | `https://web.mojigoto.com`（末尾スラッシュなし） |
| ログイン用OAuthクライアントのリダイレクトURI | Cognitoの `/oauth2/idpresponse` |
| PickerキーのWebサイト制限 | `https://web.mojigoto.com/*` と、現行Picker構成で必要な `https://docs.google.com/*` |
| キーのAPI制限 | Google Picker API、Google Drive API |

操作と要求スコープを分け、Cognitoログインは `openid email`、Drive接続は `https://www.googleapis.com/auth/drive.file` を要求する。OAuthクライアントを分ける場合、config.jsonのgoogleClientIdにはDrive接続用を設定し、Cognitoにはログイン用を設定する。Pickerキー・Drive用クライアント・プロジェクト番号は同じ本番プロジェクトにそろえる。通常／管理ログインのCognitoクライアント・Cookie・入口は分離する（admin-auth-setup.md参照）。

テストユーザーで本番URLの接続・個別許可・保存を確認し、ブランド・公開状態・要求スコープに応じた手続きを確認する。招待制というだけで手続き完了とは判定しない。少人数の開発テストと公開ベータを区別する。

作品とDriveトークンはブラウザとGoogle間で直接扱う。PC取り込みでアプリが作成する項目、既存作品の階層ごとの許可、新規／再作成された項目への追加許可を説明・実機手順に含める。詳細は [google-oauth-verification.md](google-oauth-verification.md) を参照。

## 5. Dropbox App Console

- 本番用にScoped access / Full Dropboxを設定する。
- `files.metadata.read`、`files.content.read`、`files.content.write` を設定する。
- Redirect URIに `https://web.mojigoto.com/` を登録する。
- PKCEを使用し、公開設定にはApp keyだけを置く。App secretは置かない。
- アプリ名、アイコン、説明、ホームページ、プライバシーポリシーを整える。
- 開発ステータスで追加利用者の接続を有効にし、少人数で動作確認する。

公式ガイドでは、開発ステータスは最大500ユーザーだが、50ユーザー接続に到達すると2週間以内に本番承認が必要。申請は事前に可能だが、原則50ユーザー到達まで審査されない。早期審査を希望する場合は申請のRequest early review欄へ根拠を記載する。したがって「承認後に初めてベータ利用者を招待する」という一律の順序にはしない。50ユーザー到達前から申請資料を準備する。

## 6. Cognito連携、サーバー設定、公開前検証

1. Entraのログイン用アプリをCognitoへOIDCプロバイダーとして登録し、Googleログイン用クライアントも登録する。email属性のマッピングと各IdPの有効化を確認する。
2. サーバーの `api/auth/config.php` に本番のCognito値、`app_origin`、`callback_url`、`logout_url`、セッション秘密値、管理者情報を設定する。
3. `config.json` に各クラウドの本番クライアントID、Pickerキー・番号、Turnstileサイトキーを設定する。ログイン疎通確認後に `deploymentMode: managed`、`loginRequired: true`、`authApiBase: ./api/auth` を反映する。
4. 招待済み／未招待／停止済みのアクセス、Microsoft／Googleログイン、ログアウト、管理画面を確認する。
5. OneDrive・Google Drive・Dropboxで作品検出、読み書き、競合停止、バックアップ、期限切れ再接続、接続解除を実アカウントで確認する。
6. 公開ページは未ログインでも開けること、非公開設定と認証データはHTTPで取得できないことを確認する。Turnstile、メール通知、日次データ整理も確認する。
7. Google Cloud Consoleで現在の公開状態・要求スコープに必要な手続きを確認し、求められる場合は本番URLで動画と申請資料を用意する。drive.fileを旧driveの制限付きスコープとして申請しない。Microsoftの発行元手続きとDropboxの資料準備は並行して進める。
8. 各サービスの利用条件・審査状況に合わせてベータ範囲を決める。Google審査が未完了なら開発テストの範囲を守り、必要なら公開ベータはOneDriveから開始する。

ドメイン更新だけでは各コンソールやサーバー上の設定は変わらない。ブラウザの旧オリジンに保存された設定も新オリジンへ自動移行しないため、移行後は再ログイン・クラウド再接続を案内する。

## 公式資料

- [Cognitoアプリクライアント](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html)
- [Cognito OIDCプロバイダー](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-idp.html)
- [Microsoft 発行元確認](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
- [Google OAuth公開準備](https://developers.google.com/identity/protocols/oauth2/production-readiness)
- [Google Driveスコープ](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Dropbox 開発・本番ステータス](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide)
