# 進捗共有の整理2-C3c：保存・コピー・共有操作（2026-10-27）

利用者が画像・投稿文生成の表示や操作に問題なしと報告し、次への承認を受領。2-C3bは利用者確認済み（確認環境の個別明示なし）。続いてブラウザ固有の保存・コピー・共有操作を分離した。

## 変更

web/lib/progress-actions.mjsのcreateProgressActionsへファイル名整形・PNG変換の3関数（sanitizeProgressFileName、progressShareBlob、progressShareBlobSync）と、保存・画像コピー・投稿文コピー・共有の4イベント処理本体を移動。イベント処理はsaveProgressImage、copyProgressImage、copyProgressText、shareProgressとして名前を付け、appで各ボタンへ一度だけ登録する。変更前の3関数と4イベントの処理本体一致を独立したverify.cjsで照合した。

共有state、Canvasと設定欄、投稿文生成、ブラウザのDocument／Navigator／URL／Blob／File／ClipboardItem／atob／タイマーを依存として接続。未対応のFile・ClipboardItemを起動時に直接参照せず渡す。画像生成・集計は既存の分離モジュールに残し、進捗ダイアログ、表示設定と再描画の制御はapp側に残す。

PNGのファイル名と作品名OFF時の扱い、Object URLの遅延解放、クリップボードの対応確認、表示中の設定からの投稿文生成を維持。Web Shareは同期PNG変換の後、非同期待機を挟まず共有APIを呼び出す流れを維持し、ファイル共有非対応では投稿文のみ共有する。AbortErrorのキャンセル表示と一般のエラー通知を維持。保存成功の表示も従来どおりダウンロード開始を示す扱いで、OS側の保存完了を新たに検知するものではない。

## 検証

全1,629件成功、失敗0。追加8件で分離モジュールを直接importし、PNG保存と作品名OFFのファイル名・URL解放、PNG変換失敗、画像コピーのMIMEと未対応案内、投稿文コピーの現在設定と拒否、同じ呼出内での共有API実行、画像共有非対応時の投稿文のみ共有、キャンセルと一般エラーの区別、File未対応と共有API未対応を確認。既存の進捗機能テストは移動先へ追従し検証を維持。変更JavaScriptの構文確認を実施。

仮データのブラウザで4ボタンを実際に操作し、保存／コピー／共有のブラウザAPIだけを模擬した。実Canvas（720×944）から保存・画像コピー・共有へ同じ59,648バイトのimage/pngが渡り、投稿文コピーと共有へ同じ文面が渡ること、日付・作品名付きファイル名とURL解放、各操作の結果表示を確認。ブラウザエラー0件。実ファイルのダウンロード、実クリップボードへの書込、実OS共有シートや外部送信は行っていない。実クラウド・モバイルでの対応は未確認。

## 状態と次の確認

Web1.0.240、シェルv285。新モジュールをService Workerへ登録。CSS1.0.187・拡張機能版は変更なし。本番／テスト未反映。コミット・デプロイ・配布物作成・実クラウド書込は実施していない。

証跡は.review-baseline/web-progress-actions-20261027/のbefore、verify.cjs、function-comparison.json、related-tests.log、full-tests.log、browser-result.json、progress-actions.jpg、検証用サーバー／fixtureと模擬API。

反映後、実環境でPNG保存・画像コピー・投稿文コピー・共有とキャンセルを確認する。対応が異なるブラウザでは未対応案内と投稿文のみの共有も確認する。進捗の取得・生成・操作の分離はここで一区切り。後続課題の広い画面の表示ON/OFFが2列で窮屈な配置は未変更で、確認後のUI調整対象として維持する。
