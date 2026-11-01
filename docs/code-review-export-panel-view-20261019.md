# 原稿書き出しの整理 1-C：画面生成を分離（2026-10-19）

## 変更

原稿書き出しパネルから画面生成を取り出し、次の責務に分けた。

- `merged-manuscript-browser-panel.js`：パネルの再利用・寿命管理・メッセージ通信。約3,200行から210行へ縮小。
- `merged-manuscript-panel-html.js`：HTMLの組み立て、表示値のエスケープ、nonce・CSP。437行。
- `merged-manuscript-panel-styles.js`：設定画面・プレビューモーダルのCSS。509行。
- `merged-manuscript-panel-script.js`：初期値とリセット値を受け取り、Webview内で動作するスクリプトを生成。2,066行。

CSS・画面スクリプトのテンプレート内容、HTMLのタグや空白、埋め込み値の補間をそのまま保った。外部スクリプト読込方式へ変更せず、nonce付きの埋め込み方式とCSPを維持した。1-Aの値補正、1-Bの保存、ホストの通信・終了処理、章出力と版面／ルビ計算は変更していない。

パネルテストはホストの非公開関数をexportsへ追加する方法をやめ、実際の画面生成モジュールを呼ぶ。プレビュー要求、古い結果の排除、保存順序などの既存検証も維持した。

## 検証

- 着手前の全962件成功、失敗0・スキップ0。ログ `.review-baseline/export-view-before-tests.log`。
- 関連45件成功。ログ `.review-baseline/export-view-focused-tests.log`。
- 変更後の全965件成功、失敗0・スキップ0。ログ `.review-baseline/export-view-after-tests.log`。
- 通常／二面、簡易／実寸、5判型、通常／二段の40設定で、生成nonceを除くHTML全文が分離前後で一致。生成された全スクリプトの構文も確認。ホストの再利用・通信・終了に関する関数はソース本文が一致。
- 比較スクリプト `.review-baseline/compare-export-panel-view.cjs`、結果 `.review-baseline/export-view-equivalence.log`。
- 追加3件はCSPとnonce、通常／二面／判型別の生成、現在値とリセット値の区別、単位換算、章なしと章名・説明のエスケープを検証する。
- 架空原稿とテスト用VS Code APIを使い、実際の分離後スクリプトとレンダラーをブラウザーで確認。章切り替え、通常／二面、A5二段、実寸優先を確認。420px幅で設定画面が一列になり、モーダルが幅内に収まることも確認。ブラウザーのエラーログは0件。
- ブラウザー用fixtureは製品のCSPにローカルAPI通信の許可を追加する。製品のCSPは変更していない。スクリーンショット `.review-baseline/export-view-wide.png`、`export-view-narrow.png`、`export-view-narrow-settings.png`。一時サーバー・タブは終了し、画面幅の上書きも解除済み。
- 着手前退避 `.review-baseline/20261019-150917-4713f2/source.zip`、554ファイル。SHA256 `04D597D6BB3F07A89974B2FD85E03C4010B6D0375BE3EE9B7AD2B6A1650C97AA`。

## 次の単位・配布

1-Cは完了。次は1-Dとして薄くなったホストの通信・再利用・終了処理を点検し、原稿書き出しの整理を機能単位で締める。必要な検証を追加し、確認用VSIXで新モジュールの同梱も確認する。

今回は画面の生成結果が一致する内部整理のため、VSIX再作成・インストール・公開はしていない。配布物は前回の`mojigoto-1.0.68-export-preview.vsix`のままで、1-A〜1-Cは未同梱。Webの製品ソースも変更していない。
