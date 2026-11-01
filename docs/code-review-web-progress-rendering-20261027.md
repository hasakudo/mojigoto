# 進捗共有の整理2-C3b：画像・投稿文生成（2026-10-27）

利用者が進捗画像の表示・内訳を確認し問題なしと報告、次への承認を受領。取得・集計の2-C3aは利用者確認済み（確認環境の個別明示なし）。添付画像で示された広い画面の表示ON/OFFが2列で窮屈になる点は、利用者の「あとで良い」に従い後続のレイアウト調整として記録し、今回は変更していない。

## 変更

web/lib/progress-rendering.mjsのcreateProgressRenderingへ7関数を移動。

- roundedRect、formatProgressNumber
- createProgressShareText
- fitProgressTitle、progressCanvasTextLines
- loadProgressShareLogo、drawProgressShareImage

共有state、Canvas参照を含むelements、Imageコンストラクタを受け取り、ロゴの取得Promiseはコントローラ内に保持する。7関数の処理本体が移動前と一致することを照合した。

幅720pxと内容に応じた高さ、日別／月間／年間のグラフ、指標、作品内訳、文字折返し、ロゴと表示選択による画像・投稿文の生成を維持。ロゴ取得失敗時はロゴを省き、Canvas初期化やグラフ系列の失敗は呼出元へ返す既存動作を維持。

読み込みと集計は前回のprogress-loading、フォームと表示設定の保存、再描画の呼出、PNG変換・保存・コピー・共有操作はappに残す。機能追加、表示ON/OFFの配置や生成画像のデザイン変更は行っていない。

## 検証

全1,621件成功、失敗0。追加5件は分離モジュールを直接importし、日別投稿文の選択項目と今日／当日の表記、月間／年間の合計と内訳、3モードのCanvas描画と幅・ロゴ再利用、ロゴ取得失敗時の継続と項目OFF・文字折返し、Canvas未対応と系列不正のエラーを確認。既存の画像機能テストは移動先へ追従し検証を維持した。変更JavaScriptの構文確認を実施。

仮データ2作品のブラウザで日別・月間・年間の画像表示、日別の作品名OFF、同じ生成関数による投稿文を確認。日別の投稿文は作品名OFFで作品名が外れ、年間は全作品30文字・内訳A10／B20とハッシュタグを生成。ブラウザエラー0件。投稿文は検証用DOMに出力して確認し、実クリップボード・保存・SNS共有は操作していない。実クラウド・モバイル幅は未確認。

## 状態と次の確認

Web1.0.239、シェルv284。新モジュールをService Workerへ登録。CSS1.0.187・拡張機能版は変更なし。本番／テスト未反映。コミット・デプロイ・配布物作成・実クラウド書込は実施していない。

証跡は.review-baseline/web-progress-rendering-20261027/のbefore、function-comparison.json、related-tests.log、full-tests.log、browser-result.json、progress-rendered.jpg、検証用サーバー／fixture。

反映後は日別・月間・年間のプレビュー、表示項目ON/OFF、投稿文の内容と作品内訳を確認する。確認後、2-C3cの保存・コピー・共有操作を整理する。後続に広画面の表示ON/OFFの列幅・列数・折返しを調整する。
