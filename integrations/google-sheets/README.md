# Google Sheets 連携

`m_progress.gs` は、もじごとの執筆進捗を利用者自身のGoogleスプレッドシートへ記録するApps Scriptです。

## 送信とデータの保護

- `Daily_Log` のK列へイベントIDを保存し、再送時に同じ行を追加しない
- 未送信の日時ログを最大50件ずつ一括受信
- `LockService` で同時書き込みを直列化
- SECRETを確認してから接続先との通信をテスト

## 新規導入

1. Googleスプレッドシートを作成し、`拡張機能 → Apps Script`を開きます。
2. エディタの既存コードを `m_progress.gs` の内容へ置き換えます。
3. `setupAll` を実行して権限を承認します。
4. `デプロイ → 新しいデプロイ → ウェブアプリ`を選びます。
5. 実行ユーザーを「自分」、アクセスを「全員」にしてデプロイします。
6. ウェブアプリURLと、`Setup`シートに表示されたSECRETをVS Code設定へ入力します。
7. コマンドパレットから `もじごと: Google Sheets連携を確認` を実行します。
8. 接続成功を確認してから `Sheets Enabled` をONにします。

## スクリプトを更新する

1. 既存のApps Scriptコードを `m_progress.gs` へ置き換えます。
2. `setupAll` を実行します。既存の `Progress` と `Daily_Log` は削除されません。
3. ウェブアプリのデプロイを編集し、「新バージョン」として再デプロイします。
4. VS Codeから `Google Sheets連携を確認` を実行します。

既存の `Progress` と `Daily_Log` のデータはそのまま保持されます。

## セキュリティ

- SECRETとウェブアプリURLは公開しないでください。
- Debugシートを共有する場合は、送信内容に作品名やファイル名が含まれることに注意してください。
- Apps Scriptは利用者自身のGoogleアカウント権限で、そのスプレッドシートだけを更新します。
- `@OnlyCurrentDoc` を指定し、Google Sheetsへの認可範囲をスクリプトを設定したスプレッドシートに限定しています。
