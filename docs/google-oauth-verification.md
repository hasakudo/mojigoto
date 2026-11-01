# Google OAuth 検証申請チェックリスト

最終更新: 2026-10-14（drive.file方式へ整合）

この文書は、もじごと Web の Google Drive 連携を本番公開するための申請資料と確認手順です。Google Cloud Consoleへ入力する実値や審査用アカウントの認証情報は、このリポジトリへ保存しません。

## 1. 申請対象

| 項目 | 内容 |
| --- | --- |
| アプリ名 | もじごと Web |
| 種別 | 小説執筆支援Webアプリ |
| 公式ホームページ | https://mojigoto.com/ |
| Webアプリ説明 | https://web.mojigoto.com/about/ |
| プライバシーポリシー | https://web.mojigoto.com/privacy/ |
| 利用規約 | https://web.mojigoto.com/terms/ |
| 問い合わせ | https://web.mojigoto.com/contact/ |
| 承認済みJavaScript生成元 | https://web.mojigoto.com |

Googleアカウントによるサービスログインと、Google Driveへの接続認可は別の操作・用途として扱う。

- サービスログイン: `openid email`
- Google Drive接続: `https://www.googleapis.com/auth/drive.file`

現行のdrive.fileは非機密スコープ。旧driveの制限付きスコープ申請理由は使用しない。ブランド・公開状態・実際に要求する全スコープに応じ、Google Cloud Consoleで必要な確認を行う。審査・公開済みとはこの文書だけで判定しない。

## 2. スコープ利用理由

### 日本語

もじごと Webは、小説の原稿・ノート・構想メモ・作品設定・バックアップを扱う生産性向上アプリです。PC作品をWebからDriveへ取り込む場合は、アプリが新しい保存先とファイルを作成します。既存のDrive作品を使う場合は、Google Pickerでルートと各階層のファイル・子フォルダを利用者が選択して許可します。

`drive.file`でアプリ作成項目と利用者が選択して共有した項目を扱います。親フォルダの選択だけで全配下の許可とはしません。PC側で新規作成・再作成した項目には追加許可を案内し、未許可と不存在を区別できない管理ファイルは勝手に作成しません。

権限は利用者の接続操作時にdrive.fileだけを要求します。過去の権限を自動合算しません。アクセストークンはブラウザのSession Storageだけに保持し、作品データはブラウザとGoogle Drive APIの間で直接送受信します。運営サーバーはDriveアクセストークンと作品データを受信・保存しません。サービスログイン用のCognitoセッション・トークン管理とは別です。

### English

Mojigoto Web uses drive.file to access app-created files and items explicitly selected with Google Picker. Local project import creates a new Drive folder and files. Existing projects require the user to select files and subfolders at each level; selecting the root alone does not authorize all descendants.

Files created or recreated by desktop clients need additional selection. The app requests only https://www.googleapis.com/auth/drive.file and does not automatically combine prior grants. It does not request full Drive access.

Drive tokens remain in browser Session Storage. Project content is transferred directly between the browser and Google Drive. The application server does not receive or store Drive tokens or project content. Service login through Cognito is a separate authorization flow.

## 3. データフロー

```text
利用者
  └─「Google Driveに接続」を選択
       └─ Google OAuth認可画面
            └─ アクセストークン → ブラウザのSession Storage

ブラウザ ── Google Picker ── 作品ルートと各階層の項目を利用者が選択・許可
ブラウザ ⇄ Google Drive API ── 原稿・ノート・構想メモ・設定・バックアップ

運営サーバー
  ├─ 招待制ログインと利用者管理
  └─ Driveアクセストークン・作品データは受信／保存しない
```

ブラウザからDrive APIへの直接通信、個別許可、ログインとDrive接続の分離を公開説明と一致させる。Driveの長時間自動更新のためサーバーに更新トークンを置く方式は未実装で、追加する場合はこのデータフロー・公開説明・設定を再点検する。[公式のスコープ分類](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)を参照する。

## 4. Google Cloud Consoleでの確認

- [ ] 本番用と開発・テスト用のGoogle Cloudプロジェクトを分離する
- [ ] 本番プロジェクトでGoogle Drive APIとGoogle Picker APIを有効にする
- [ ] OAuth同意画面のアプリ名を現在の「もじごと」から「もじごと Web」へ変更する
- [ ] OAuth同意画面のロゴ・サポートメールを公開ページと一致させる
- [ ] アプリのホームページへ `https://mojigoto.com/` を登録する
- [ ] プライバシーポリシーへ `/privacy/` を登録する
- [ ] 利用規約へ `/terms/` を登録する
- [ ] 承認済みドメインへ `mojigoto.com` を登録する
- [ ] Search Consoleで `mojigoto.com` の所有権を確認する
- [ ] 承認済みJavaScript生成元へ `https://web.mojigoto.com` を登録する
- [ ] データアクセスへ `https://www.googleapis.com/auth/drive.file` を登録し、旧driveの申請理由を残さない
- [ ] OAuthクライアントID、Picker APIキー、プロジェクト番号が同じ本番プロジェクトの値であることを確認する
- [ ] APIキーのウェブサイト制限とAPI制限を確認する
- [ ] 本番設定ファイルに秘密鍵を置いていないことを確認する
- [ ] ブランド確認等、現在の構成に必要な手続きをコンソールで確認する

## 5. 公開ページ確認

- [ ] 公式HOW TOサイトから、Webアプリ説明・プライバシーポリシー・利用規約へリンクする
- [ ] `/about/` がログインなしで表示でき、アプリの目的とDrive利用理由が分かる
- [ ] `/privacy/` がログインなしで表示でき、ホームページと同じドメインにある
- [ ] プライバシーポリシーに取得、利用、保存、共有、削除・失効方法が記載されている
- [ ] Google API Services User Data PolicyとLimited Useへの準拠が明記されている
- [ ] `/terms/` と `/contact/` がログインなしで表示できる
- [ ] すべてのURLがHTTPSで、リンク切れや工事中表示がない
- [ ] 公開ページと認可画面でアプリ名・ロゴ・ドメインが一致する

## 6. 審査動画

限定公開のYouTube動画を1本用意し、ブラウザ表示を英語にして次を途切れずに撮影する。

1. 公式ホームページ、Webアプリ説明、プライバシーポリシー、利用規約を表示する
2. もじごと Webへログインし、アプリ名が確認できる状態を映す
3. 「Google Driveに接続」を選ぶ
4. Googleの認可画面でアプリ名、OAuthクライアントID、要求スコープを映す
5. 専用登録ページでPCのサンプル作品を取り込む、またはGoogle Pickerでルートと各階層のファイル・子フォルダを許可する
6. 既存の入れ子フォルダから原稿を開いて編集・保存する
7. ノートまたは構想メモ、作品設定、バックアップ履歴のいずれかを開き、スコープで可能になる機能を示す
8. 接続設定からGoogle Driveとの接続を解除する

動画説明欄または申請欄へ、使用した本番OAuthクライアントIDを記載する。個人の原稿や秘密情報は映さず、専用の審査データを使用する。

## 7. 審査担当者向け手順

申請時に、招待制ログインを通過できる審査専用Googleアカウントを用意する。認証情報はGoogle Cloud Consoleの申請欄だけへ記載し、Git、動画、公開ページには載せない。

1. `https://web.mojigoto.com/` を開く
2. 「Googleでログイン」から審査用アカウントでログインする
3. HOMEで「Google Driveに接続」を選択し、アクセスを許可する
4. 専用登録ページでサンプル作品を取り込む、または既存作品のファイル・子フォルダを順に選択して許可する
5. 原稿を開き、編集して保存する
6. 接続設定を開き、「Google Driveとの接続を解除」を実行する

審査用アカウントには、Single／Multiのいずれか一方だけでなく、既存の原稿・ノート・構想メモ・作品設定・バックアップを含む最小限のサンプル作品を配置する。

## 8. 申請前に手入力・確認が必要な項目

- [ ] 本番Google CloudプロジェクトID
- [ ] 本番Google OAuthウェブクライアントID
- [ ] Google Picker用APIキーとプロジェクト番号
- [ ] OAuth同意画面のサポートメール
- [ ] デベロッパー連絡先メール
- [ ] Search Consoleのドメイン所有権確認結果
- [ ] 審査用Googleアカウントと招待状態
- [ ] 審査用Driveサンプル作品
- [ ] 限定公開YouTube動画URL
- [ ] 公開サイトへ今回の公開ページ変更を反映済み

## 9. 申請後

- Googleからの問い合わせには、申請時と同じ連絡先から期限内に回答する。
- スコープ、データフロー、公開ドメイン、プライバシーポリシーを変更した場合は、再検証の要否を確認する。
- 本番クライアントへテスト用のリダイレクト先・生成元・テストユーザーを残さない。
- Google Cloud Consoleと公開ページの内容を定期的に照合する。
