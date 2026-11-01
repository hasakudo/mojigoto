# ノート・作品設定の整理 2-A：書き出しの整形を分離（2026-10-19）

## 現在地と変更

利用者が原稿書き出しパネルと出力の動作を確認済み。次の機能としてノート・作品設定の書き出しを整理した。読込機能の整理は未着手。

- `single-export-formatters.js`：ノート・作品設定の単体TXT／Markdown／CSV／HTMLへの整形、日時・CSVエスケープ・単体HTMLのスタイルを担当。
- `bundle-export-formatters.js`：作品全体、プロット、資料のまとめTXT／Markdown／HTMLへの整形と専用スタイルを担当。
- `export-service.js`と`export-bundle-service.js`：選択画面、データ読込、保存先・保存名、メモ出力の確認、ファイル保存、完了通知を担当。既存の公開exportsは維持。

整形モジュールにはVS Codeやファイル読書きへの依存を持たせず、出力項目設定とジャンル表示の取得関数を呼び出し元から渡す。取得タイミングは各整形の実行時のままとし、モジュール作成時の設定を固定しない。

単体とまとめでは見出し、無題項目の扱い、更新日時、HTMLスタイルが異なる。その差を保持し、共通化のために仕様を揃えていない。Markdownコア・項目メモの形式・Webの製品ソースも変更していない。

## 検証

- 着手前の全975件成功、失敗0・スキップ0。ログ `.review-baseline/note-export-format-before-tests.log`。
- 既存の関連40件成功。ログ `.review-baseline/note-export-format-focused-tests.log`。初回は制限環境のrenameで既存の保存テスト3件がEPERMとなったが、ファイル操作を許可した環境ではすべて成功。初回ログは `note-export-format-focused-sandbox.log` に保持。
- 変更後の全980件成功、失敗0・スキップ0。ログ `.review-baseline/note-export-format-after-tests.log`。
- 追加5件は、単体／まとめの見出し差、動的な出力設定と作品別指定、ジャンル・日時、HTMLエスケープ、CSVの引用とBOM、既存の公開APIと保存名、各形式、メモON/OFF、取消を検証した。
- `test/fixtures/note-export-harness.cjs`は製品のサービス全体と新しい整形モジュール、製品のジャンル処理・出力設定のマージ処理を実行する。ファイルへの書き込みは捕捉し、実作品データへアクセスしない。
- 分離前後のサービスを640通りで実行し、出力文字列全体、ファイル名、選択画面の呼び出し、保存先の呼び出しが一致。単体ノート・作品設定・View／作品全体・プロット／資料まとめ、TXT/MD/CSV/HTML、出力項目設定、項目メモON/OFF、空欄・改行・ルビ・HTML文字列を含む。
- 比較スクリプト `.review-baseline/compare-note-export-formatters.cjs`、結果 `.review-baseline/note-export-format-equivalence.log`。
- サービスに残った選択・読込・保存先・保存名・保存・通知の関数本体と、既存の公開exportsが分離前と一致することを確認した。
- メモ出力・Markdown読戻しの既存テストは、整形関数のソース抽出をやめて実モジュールを呼ぶ形へ変更。読込・挿入など対象外の検証は維持した。新しいテストでは実サービスを通じた出力も確認する。
- 着手前退避 `.review-baseline/20261019-162745-12f0db/source.zip`、560ファイル。SHA256 `E7F00FF02480D07CDEA457697E7B764AA1D85E65E96E25CB513606B1B11312D2`。

## 配布と次の単位

利用者がノート・作品設定の書き出しを実機確認済み。続く2-Bの実装・検証は[ノート読込の記録](code-review-note-import-data-20261019.md)を参照。

書き出し側の整形分離は完了し、利用者確認待ち。確認用VSIXは `release/mojigoto-1.0.68-note-export-organized.vsix`。ノート単体・まとめ・作品設定の書き出しを確認した後、次の2-Bとしてノート読込のプレビューと取込内容の組み立てを調査・分離する。保存・競合検出・パーサーの仕様変更は混ぜない。

拡張の版は1.0.68のまま。VS Codeへのインストール・公開・コミットはしていない。

## 配布・退避の照合

- VSIXは419エントリ。配布対象415ファイルのソースハッシュを照合し、一致した。検証スクリプト `.review-baseline/verify-note-export-organized-vsix-release.ps1`。
- VSIX SHA256: `B68A79222EDD2304609E771BDA4F9132FBAF774869D41320C62E78652C9ECEC8`。
- 完了時退避 `.review-baseline/20261019-163705-7fabdd/source.zip`、565ファイル。SHA256 `20A66F109A268F86535279298CB4715EB296DED4CA1E21032DAB70343E919196`。
- この照合結果の追記のみ、配布物・退避の作成後に実施した。
