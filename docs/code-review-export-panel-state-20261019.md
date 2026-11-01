# 原稿書き出しの整理 1-A：設定値の補正を分離（2026-10-19）

## 変更

`src/export/merged-manuscript-browser-panel.js`から設定値を補正する関数を`src/export/merged-manuscript-panel-state.js`へ移した。新モジュールはVS Codeやファイル保存に依存せず、`normalizePanelState`と、画面のリセット値生成でも使う`pxToPt`を提供する。数値の補正・pt/px変換を含む関数本体は変更していない。

パネルは新モジュールを呼び出す。HTML/CSS・画面スクリプト・CSP・メッセージ処理・設定保存・章出力・版面／ルビ計算は変更していない。既存のパネルテストも、補正処理をモックせず実モジュールを読み込む形にした。

新しい直接テスト6件で、全既定値、数値の上下限・不正値、空値の数値変換、pt/pxの優先順位と丸め、判型と二段の組み合わせ、真偽値の型、章なしと章名、判型別の保存値、入力を変更しないことを検証する。

初期値や補正順序の見直しは行っていない。例えばptの上下限補正とpxへの換算の順序も従来どおりに保ち、この整理に仕様変更を混ぜていない。

## 検証

- 着手前の全946件成功、失敗0・スキップ0。ログ `.review-baseline/export-state-before-tests.log`。
- 関連32件成功。ログ `.review-baseline/export-state-focused-tests.log`。
- 変更後の全952件成功、失敗0・スキップ0。ログ `.review-baseline/export-state-after-tests.log`。
- 分離前の実装と5,003通りの補正結果を比較して一致。通常・二面・実寸・章セレクトを含む6設定の生成HTMLも、生成nonceを固定して全文一致を確認した。比較スクリプト `.review-baseline/compare-export-panel-state.cjs`、結果 `.review-baseline/export-state-equivalence.log`。
- 移した関数本体の一致と、パネルの変更が関数の取り出し・require追加だけであることを確認した。
- 着手前退避 `.review-baseline/20261019-142611-66ed89/source.zip`、548ファイル。SHA256 `E5E2A539D351758853F0FD05B0186E05AF42D03A496D2C3A7F8CE788113F701E`。

## 次の単位

1-Aは完了。次は実施案の1-Bとして、panelとexport-uiの設定保存を調査・整理する。画面操作中の保存と書き出し時の保存には異なるマージ規則があるため、その違いを先に検証する。

今回の単位は生成HTMLまで一致する内部整理のため、実機確認の依頼・VSIX再作成・インストール・公開はしていない。配布物は前回の`mojigoto-1.0.68-export-preview.vsix`のままで、今回の新モジュールはまだ含まれていない。機能単位の整理をまとめる際に再作成する。Webの製品ソースは変更していない。
