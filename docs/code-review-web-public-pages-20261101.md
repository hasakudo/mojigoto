# Web公開ページの仕様照合（2026-11-01）

## 対象と公開方針

`web/about/index.html`、`web/privacy/index.html`、`web/terms/index.html` を現行のログイン・クラウド認可・データ保存・バックアップ・共有・削除の実装と照合した。利用者は、今回の公開後は「招待制のクローズドベータを開始する」と回答。3ページはその公開時点の表記へ更新した。実際の本番反映はしていない。

## 修正した内容

| 対象 | 旧記載・不足 | 修正 |
| --- | --- | --- |
| about／terms | 開発検証段階・ベータ公開を目標・今後予定 | 招待制クローズドベータとして提供する表記へ統一 |
| about | 検索・置換、全体プレビュー、関連作品参照などが機能紹介にない | 主要機能として短く追記 |
| about／terms | VS Codeとの同期説明がGoogle Driveに限定 | OneDrive／Google Drive／Dropboxそれぞれの同期機能で同じ作品を開く説明へ変更 |
| about | サービスログインとクラウド認可の違いが不明瞭 | ログインとクラウド接続は別の手続きと明記 |
| 全3ページ | バックアップ対象の範囲が分かりにくい | 原稿・プロット／資料ノート・構想メモを対象とし、作品設定・呼び名一覧・画像等は対象外と明記 |
| privacy／terms | ログイン方法がMicrosoft／Googleだけ | 審査用アカウントのメール・パスワードによる専用ログインを追記 |
| privacy | サービス用認証情報とクラウドトークンの保存先が区別されていない | ログイン維持用認証情報は運営サーバーのセッション、クラウド接続トークンはブラウザSession Storageと区別 |
| privacy | 自動接続・書体・反映設定、一覧キャッシュの項目や差分追跡情報が不足 | 現行の端末保存情報へ補足 |
| privacy | SNS画像・投稿文の処理と共有先の説明がない | ブラウザ内生成と、利用者が操作した保存・コピー・共有を明記 |
| privacy | ログアウトで端末情報がすべて消えるように読める可能性 | 設定・閲覧履歴・キャッシュ等は残る場合があり、共有端末ではサイトデータ削除を案内 |
| privacy | Service WorkerのCache Storageが説明されていない | アプリ画面・プログラムの端末キャッシュを補足 |

プライバシーポリシーと利用規約の最終改定日は2026年11月1日。責任・権利・保存期間等の既存条項は維持し、今回新しい保持期間や料金条件を作っていない。既存の法令・免責等の条項について法律上の有効性を判定したレビューではない。

## 一致を確認した主な仕様と根拠

- `web/auth/pkce.mjs`：OneDriveは `Files.ReadWrite` を含む認可。アクセストークンと取得した更新トークンをSession Storageへ保持し、接続解除時に削除。
- `web/auth/google-drive.mjs`：`drive.file` に限定、Session Storageで期限付きトークンを保持。接続解除でローカルトークンを削除し失効要求。失効要求失敗でデータを削除した扱いにはしない。
- `web/auth/dropbox.mjs`：PKCE、短期アクセストークン、Session Storage、接続解除時の失効要求。更新トークンを保存する方式ではない。
- 各 `web/storage/*-provider.mjs`：原稿等の読み書きは各クラウドAPIへ直接送信。運営APIを作品ファイルの中継に使用しない。
- `web/api/auth/callback/index.php`／`bootstrap.php`：Microsoft・Googleと審査用メールログインを区別し、Cognitoのログイン維持用情報をサーバー側セッションで扱う。CookieはSecure／HttpOnly／SameSite=Lax。
- `web/app.mjs`、`web/lib/work-discovery.mjs`、`catalog-delta.mjs`、`cloud-connection.mjs`：作品一覧の要約・ファイル名・識別情報・集計・差分追跡情報と利用者ごとの自動接続設定を端末保存する。
- `web/api/forms/bootstrap.php`：完了した受付情報・送信履歴の90日フィルターと、不正送信抑止用のIP由来HMAC識別子。
- `web/api/auth/bootstrap.php`：招待解除済みの情報を90日、管理操作履歴を365日の期限で扱う処理あり。
- `web/api/maintenance/cleanup.php`：CLI専用の保存期限整理処理と、メールボックス整理を促す管理者通知あり。

Google Driveの権限・失効の説明は公式資料でも確認した。

- [Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Identity Services: Use the token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)

## 本番運用の確認状況（2026-11-01・利用者報告）

前回の確認事項について、利用者から次の回答を受けた。

1. 本番で `api/maintenance/cleanup.php` の定期実行設定を行った。
2. 保管期間が過ぎた情報は削除する運用とする。申込・問い合わせの受信／送信メールなど、アプリ外で保持する情報も保存期間に従って管理する。
3. サーバーアクセスログの保存期間は12か月。この回答に合わせ、プライバシーポリシーと既存テストの24か月表記を12か月へ訂正した。
4. テストは本番環境で行っている。

定期実行設定とアクセスログの保存期間は利用者報告として記録した。こちらから本番設定・実行ログ・メールボックス・Cognitoの情報を取得／変更したものではない。本番テストの個別項目・結果は未報告のため、認証サービス側の削除を含む全項目の検証完了とは扱わない。前回の「本番未確認」は、この回答前にエージェント側で確認できていなかった範囲の記録。

公開ページ側は保存期間経過後の削除方針を既存の記載で示しているため、アクセスログ以外の期間は変更していない。訂正内容をキャッシュへ反映するためシェルをv329へ更新。Web本体1.0.282／共有CSS1.0.211／拡張2.0.0は維持。この追加作業でも公開・本番反映は行っていない。

訂正後の公開ページ・シェル依存テストは3件成功、失敗0。ログは `.review-baseline/web-retention-confirmation-20261101/tests.log`。以下は初回照合時の検証記録。

## 検証と変更範囲

- 関連テスト36件成功、失敗0・スキップ0。公開ページ・Google Drive・Dropbox・利用者認証・シェル依存を確認。
- 既存の公開ページテストの、開発検証段階を期待する箇所をクローズドベータ表記へ更新。
- 3ページのHTMLタグの対応、h1が各1件、全ローカルリンクと画像・CSS・JSの存在を確認。旧事前受付表記がないことを確認。
- ガイド同期チェックとService Workerの構文確認成功。
- 公開ページが旧キャッシュのまま残らないよう、シェルキャッシュのみv327からv328へ更新。Web本体1.0.282／共有CSS1.0.211／拡張2.0.0は維持。
- 変更前ファイルと検証ログは `.review-baseline/web-public-pages-20261101/`。
- 本番設定・認証データ・実作品は表示／変更していない。公開・配布物作成・インストール・コミットは未実施。
