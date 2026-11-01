# 3-B 構想メモの編集表示・操作と受信データを分離（2026-10-19）

## 現在地と対象

3-Aとリンク不整合修正は利用者確認済み。3-Bでは編集の描画と操作、ホストの受信データの組み立てまでに範囲を絞った。実装・自動検証済み、利用者確認待ち。

- `script-editor.js`には描画関連の9関数を残し、入力・ボタン・ショートカット・反映要求など33関数を`script-editor-actions.js`へ移動。従来の`getConceptMemoEditorScript`から両方を組み立てる。関数宣言のみのブロックを分け、呼び出し時の状態・DOM参照・イベント登録は変えない。
- 通常／リスト／TODO、タグ・フォルダ、共通TODO、ピン・保管・Dashboard、出典表示・手動反映・自動反映設定・更新・バックアップなど、42関数の本体はそのまま維持した。
- `edit-message.js`に`buildConceptMemoDataFromMessage`を分離。ホストの薄いラッパーから、その都度最新の`currentData`と自分が保存したrevisionの集合を渡す。外部保存との競合判定に使う基準や、連続保存の同期情報引き継ぎを変更しない。
- 保存キュー、自動反映、バックアップ、共通TODOの保存順序、残りのホスト操作受付、リンク修正、Web、HTML/CSSは対象外。意味上の不具合修正を混ぜていない。

## 検証

- 着手前は全1,006件成功。`.review-baseline/concept-editor-before-tests.log`。
- 既存関連37件成功。`.review-baseline/concept-editor-focused-tests.log`。
- 新規6件で、自分／外部revisionと出典変更、本文・リンク状態の保持、欠落時の初期値、タイトル／本文／リスト／タグ入力、TODOの操作、手動反映・ノート表示・ピン／Dashboard保存要求を検証。
- 42関数の本体が分離前後で同一。通常／リスト／TODO、出典種別・状態、保管などを組み合わせた108通りの操作で、編集結果・送信メッセージ・呼び出し順が一致。576通りのrevision／出典／入力欠落条件で保存データの組み立てが一致し、入力を変更しない。
- 受信組み立てラッパーと追加importを除くホストのソース全体も変更前と一致。比較スクリプト `.review-baseline/compare-concept-editor.cjs`、ログ `.review-baseline/concept-editor-equivalence.log`。
- ソース文字列検査だった更新・バックアップの2件は、実際の生成スクリプト経由で検査する形へ変更。最初の旧配置検査失敗は`.review-baseline/concept-editor-first-tests.log`に保持。
- 全体実行で既存の同時保存テスト1件にEPERMが出たためログを`.review-baseline/concept-editor-rename-tests.log`に保持。該当保存テスト19件の単独実行と全体再実行では成功。保存基盤は変更していない。
- 最終の全1,012件成功、失敗0・スキップ0。`.review-baseline/concept-editor-after-tests.log`。単独再確認は`.review-baseline/concept-editor-save-recheck.log`。
- 見た目を変更していない。新たなブラウザー／実機での表示確認は未実施。
- 着手前退避 `.review-baseline/20261019-194640-0b68ed/source.zip`、589ファイル。SHA256 `E91D04385C6A09F80E73F93844EB4121041ACEE529D929B3A0B57519E38C11C4`。

## 配布と次の単位

利用者が編集保存・項目メモへの反映・表示を実機確認済み。続く[3-Cのホスト整理](code-review-concept-host-20261019.md)へ進んだ。

確認用VSIXは`release/mojigoto-1.0.68-concept-editor-organized.vsix`。通常／リスト／TODOの入力・編集・保存、ピン／保管、項目メモへの反映を実機確認する。確認後の3-Cでは、ホストのメッセージ受付・タイマー・パネル寿命管理を点検し、保存・反映の順序を保って分離する。3-Cは未着手。

版は1.0.68。インストール・公開・コミットは未実施。

## 配布・退避の照合

- VSIXは440エントリ、配布対象436ファイルのソースハッシュが一致。分離先2ファイルの同梱と非公開設定等の除外を`.review-baseline/verify-concept-editor-vsix-release.ps1`で確認。
- VSIX SHA256: `437C810CAF5F228B83DA70B35D2200939BBA1D85027CF2F78D12B99F149492B5`。
- 完了時退避 `.review-baseline/20261019-195153-5bd1f5/source.zip`、594ファイル。SHA256 `933E4D970B256419C00EDD87C0784B7D6DCD9252E0A4F3915BFB4ED4E086FB19`。
- この照合結果のみ、配布物・退避の作成後に追記。
