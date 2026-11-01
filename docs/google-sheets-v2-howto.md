# Google Sheets連携 v2 — HOW TOサイト更新原稿

最終更新: 2026-09-24

この文書は、公式HOW TOサイトの「ダウンロード」と「Google Sheets 連携」ページをv2へ更新するための原稿です。

## 管理者向け配布方針

- Google Sheets連携はもじごと WebのGoogle Drive OAuthとは独立しているため、Web版のベータ公開を待たずに配布できる
- 各利用者が自分のスプレッドシートへスクリプトを設定し、自分を実行ユーザーとしてデプロイする方式を維持する
- 運営者が所有する1つのApps Scriptへ全利用者の進捗を集約しない
- リポジトリでは `m_progress_v2.gs` として管理し、配布ZIPには安定した名前 `m_progress.gs` で収録する
- VS Code側には旧Apps Scriptへ1件ずつ送る互換処理を残すが、新規配布物と利用者向けREADMEでは案内しない

## 実機検証記録

2026年9月24日、新しいGoogleスプレッドシートへの導入からVS Code接続まで確認済み。

- `setupAll` によるシート生成: 成功
- Apps Scriptのデプロイ: 成功
- VS Codeの「Google Sheets連携を確認」: 成功
- Googleの未確認アプリ警告: 表示されず

公開手順では、発生しなかった警告画面を前提とする回避操作を案内しない。通常の権限確認だけを案内し、想定外の権限が表示された場合は許可せず確認するよう記載する。

## ダウンロードページ差し替え

### Apps Script ファイル

Google Sheets連携を利用する際に必要となるファイルです。

ダウンロードした `mojigoto-google-sheets-v2.zip` を解凍し、`m_progress.gs` をメモ帳やエディタで開いてください。

1. Googleスプレッドシートを新規作成する
2. 「拡張機能」→「Apps Script」を開く
3. `コード.gs` の内容をすべて削除する
4. `m_progress.gs` のコードをすべて貼り付けて保存する
5. 詳しい設定は「Google Sheets 連携」の導入手順へ進む

配布物:

- `m_progress.gs`: Apps Script本体
- `README.md`: 導入・更新・セキュリティの説明
- `LICENSE`: ライセンス

表示ラベル案: **Google Sheets連携 v2**

補足表示案: **開発版／テスター向け**

## Google Sheets連携ページ

### 機能の説明

Google Sheets連携は任意機能です。利用しなくても、もじごとの原稿編集や執筆記録は通常どおり利用できます。

VS Code拡張機能「もじごと」の執筆進捗と日時ログを、利用者自身のGoogleスプレッドシートへ送信します。データは運営者のサーバーへ送信せず、VS Codeから利用者自身が作成したApps Scriptへ直接送信します。

v2では次の改善を行っています。

- 同じ日時ログを再送しても重複しないイベントID
- 最大50件の日時ログ一括送信
- 同時書き込みの衝突防止
- SECRETを使った接続確認
- 導入先スプレッドシートだけに限定したGoogle Sheets権限

### 導入手順

#### 1. スプレッドシートとApps Scriptを作る

1. ダウンロードページから「Google Sheets連携 v2」をダウンロードして解凍する
2. Googleスプレッドシートを新規作成する
3. スプレッドシートの「拡張機能」→「Apps Script」を開く
4. `コード.gs` の内容をすべて削除する
5. `m_progress.gs` のコードをすべて貼り付けて保存する
6. Apps Scriptのプロジェクト名を分かりやすい名前へ変更する（例: もじごと Sheets）

公式サイトから入手したコードだけを使用してください。SECRETやデプロイ後のウェブアプリURLは第三者へ共有しないでください。

#### 2. 初期設定を実行する

1. Apps Script上部の関数一覧から `setupAll` を選ぶ
2. 「実行」を押す
3. 初回だけ表示されるGoogleの認可画面で、アカウントと権限を確認する
4. 許可後、スプレッドシートへ戻る
5. `Setup`、`Progress`、`Daily_Log`、`Monthly`、`Year`、`Dashboard`、`Project_View` が作成されたことを確認する

このスクリプトは `@OnlyCurrentDoc` を使用し、認可対象を導入したスプレッドシートに限定しています。認可画面に想定外の権限が表示された場合は許可せず、ダウンロード元と貼り付けたコードを確認してください。

#### 3. ウェブアプリとしてデプロイする

1. 「デプロイ」→「新しいデプロイ」を開く
2. 種類で「ウェブアプリ」を選ぶ
3. 次のように設定する
   - 実行ユーザー: 自分
   - アクセスできるユーザー: 全員
4. 「デプロイ」を押す
5. 表示された `/exec` で終わるウェブアプリURLをコピーする

「全員」は、VS CodeからGoogleログインなしでPOST送信するために必要です。受信データはSetupシートで生成されたSECRETが一致する場合だけ処理します。URLとSECRETの両方を認証情報として安全に管理してください。

#### 4. VS Codeへ接続情報を設定する

1. スプレッドシートの `Setup` シートを開く
2. `SECRET` の値をコピーする
3. VS Codeで「もじごと」の設定を開く
4. `Webhook Url` へウェブアプリURLを入力する
5. `Webhook Secret` へSECRETを入力する
6. コマンドパレットから「もじごと: Google Sheets連携を確認」を実行する
7. プロトコルv2の接続成功が表示されたら `Sheets Enabled` をONにする

接続確認に失敗した場合は、URLがテスト用の `/dev` ではなく公開用の `/exec` で終わっているか、SECRETの前後に空白がないか、新しいデプロイが反映されているかを確認してください。

### 送信設定

- `Sheets Enabled`
  - OFF: Google Sheets連携全体を停止
  - ON: 下記の送信設定を有効化
- `Webhook Progress Mode`
  - OFF: 進捗ログを送信しない
  - onSave: 保存時にProgressへ送信
- `Webhook Events Mode`
  - OFF: 日時ログを送信しない
  - onSave: 保存時にDaily_Logへ送信
  - onCommand: Dashboardの「日時ログを送信」でまとめて送信

`Event Log Interval Minutes` で日時ログを保存する最小間隔を調整できます。

### v2のシート

- `Setup`: SECRET、プロトコルバージョン、設定値
- `Progress`: 日別進捗
- `Daily_Log`: 日時ログ。K列のイベントIDで再送時の重複を防止
- `Monthly`: 月別集計
- `Year`: 年別集計
- `Dashboard`: 集計とグラフ
- `Project_View`: 作品別の簡易表示

自動生成された集計シートを直接編集すると、再生成時に変更が失われる場合があります。独自の集計やグラフは新しいシートへ作成してください。

### スクリプトを更新する

1. 更新前にスプレッドシートをバックアップする
2. Apps Scriptで既存コードを新しい `m_progress.gs` に置き換えて保存する
3. `setupAll` を実行する
4. 「デプロイ」→「デプロイを管理」→編集を開く
5. バージョンで「新バージョン」を選び、再デプロイする
6. VS Codeから「もじごと: Google Sheets連携を確認」を実行する

`setupAll` は既存のProgressとDaily_Logを削除しません。通常はウェブアプリURLとSECRETを変更せず更新できます。

### 不具合が起きた場合

- 接続確認が失敗する: ウェブアプリURL、SECRET、最新デプロイを確認
- 集計シートだけ直したい: `setupReports` を実行
- Setupの値を反映したい: `applySetupValues` を実行
- 全シート構成を確認・再生成したい: `setupAll` を実行

問い合わせ時は、SECRETとウェブアプリURLを伏せ、VS Codeに表示されたエラー内容とApps Scriptの実行ログだけを共有してください。

## 公開切替チェック

- [ ] WordPress Download ManagerのパッケージID 1873へv2 ZIPを差し替える
- [ ] 表示名を「Google Sheets連携 v2」へ変更する
- [ ] ダウンロードページのファイル名を `m_progress.gs` のまま案内する
- [ ] Google Sheets連携ページの導入順序を「setupAll → デプロイ → 接続確認 → Sheets Enabled」に変更する
- [ ] `DailyLog` 表記を実際のシート名 `Daily_Log` へ修正する
- [ ] 接続確認コマンドとv2の重複防止を追記する
- [ ] 公開ZIPをダウンロードし、内容とハッシュを確認する
- [ ] 新規スプレッドシートで最初から導入できることを確認する
