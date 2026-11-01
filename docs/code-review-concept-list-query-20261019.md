# 3-A 構想メモの一覧条件・並べ替えを分離（2026-10-19）

## 対象と結果

読込画面の2-Cは利用者が動作・表示を実機確認済み。次の3-AはVS Code構想メモの一覧のみに絞った。実装・自動検証済み、利用者確認待ち。

- `src/views/concept-memo/list-query.js`へ、一覧の形式・状態・出典・フォルダ・タグ・検索・ノートの絞り込み、日時／タイトル／ノート項目順の並べ替えを分離。
- `createConceptMemoListQuery`は選択条件とデータを引数で受け、DOM・localStorage・VS Code・保存処理に触れない。日本語比較、日時補正、フォルダ正規化、検索文字列の生成は従来の画面ヘルパーを注入する。既存のノート項目順の共用処理もそのまま使う。
- `script-list.js`は関数をブラウザーへ埋め込み、呼び出すたびに最新の画面状態を渡す。表示・イベント登録・選択変更・保存するUI設定の処理は残す。ホスト・編集・保存・反映・バックアップ・復元とWebソースは変更していない。
- 通常並び順のピン優先と、ノート項目順でのピンより項目順を優先する違いを維持。タグ／フォルダ各選択内のOR、条件間のAND、通常時の保管メモ除外、存在しないフォルダ選択を表示状態から黙って削除しない扱いも保持する。
- 出典判定は従来の一覧用判定を移動し、別用途の`matchesQuickFilter`へ統一しない。例えば出典状態の判定範囲の違いを整理のついでに変えない。

## 検証

- 着手前は全992件成功。`.review-baseline/concept-list-before-tests.log`。
- 関連29件成功。`.review-baseline/concept-list-focused-tests.log`。ノート項目順、生成スクリプト、非同期応答、未保存内容保持、Web既存機能を含む。
- 新規6件は、ピンと昇降順・不正日時と同値順序、保管と複合状態、タグ／フォルダ、検索対象、ノート順と出典、ブラウザーとの橋渡し・最新状態・入力不変を確認。`test/fixtures/concept-list-harness.cjs`で実際の画面ヘルパーと生成スクリプトを実行する。
- 変更後の全998件成功、失敗0・スキップ0。`.review-baseline/concept-list-after-tests.log`。
- 3,450通りの条件で、分離前後の表示対象・順序・件数・絞り込みラベルが一致し、メモと選択条件が変わらないことを確認。日時・タイトル・ノート順、昇降順、形式、保管／ピン／Dashboard、出典、タグ、フォルダ、未分類、存在しない候補、関連なし、検索を組み合わせた。
- 比較スクリプト `.review-baseline/compare-concept-list.cjs`、結果 `.review-baseline/concept-list-equivalence.log`。
- `.review-baseline/check-concept-list-boundaries.cjs`で、残した一覧描画・イベント関数が変更されていないことを確認。生成HTMLの画面内スクリプト以外はCSSを含めて一致。生成スクリプト全体のコンパイルも成功。
- 見た目と画面操作の変更を含まないため、今回は新たなブラウザー／実機での表示確認を完了したとは扱わない。
- 着手前退避 `.review-baseline/20261019-185001-0841df/source.zip`、582ファイル。SHA256 `78B06C3A21A86EA632AB8F3B97D6848C7CAFA4131AD99A4F13E9253C5AFEF03E`。

## 配布と次の単位

リンク修正後、利用者からほかの動作に問題なしと確認済み。次は[3-Bの整理](code-review-concept-editor-20261019.md)へ進む。

確認用VSIXは`release/mojigoto-1.0.68-concept-list-organized.vsix`。一覧の検索・複合絞り込み、ピン／保管、昇降順、ノートの項目順・ノート絞り込みを実機確認する。確認後の3-Bは既存の編集スクリプトとホスト操作受付の境界を点検し、小さい単位から整理する。保存・反映・バックアップをまとめて変更しない。3-Bは未着手。

版は1.0.68。インストール・公開・コミットは未実施。

## 配布・退避の照合

- VSIXは435エントリ、配布対象431ファイルのソースハッシュが一致。新しい一覧判定モジュールの同梱と非公開設定等の除外を`.review-baseline/verify-concept-list-vsix-release.ps1`で確認。
- VSIX SHA256: `0EE3E6BD5DDAA6F799FCA3EABCEDE1C63147BDD5B0F5F4A0A8AA363B2F9CCF30`。
- 完了時退避 `.review-baseline/20261019-185423-e9571a/source.zip`、586ファイル。SHA256 `9FFDF2055C9B166C6E07A6B56409EFE586F5FDAA6235C8A42190DE1E6E4BA207`。
- この照合結果のみ、配布物・退避の作成後に追記。
