# 2-B ノート読込データの組み立て分離（2026-10-19）

## 対象と結果

2-Aのノート・作品設定書き出しは利用者実機確認済み。続いて、ノート読込画面のデータ整形をUI・ファイル操作から分離した。2-Bは実装・自動検証済み、利用者確認待ち。

- `src/import/note-import-preview.js`へ、対象大分類・対象項目、挿入元・上書き元の候補一覧、再読込時の選択復元の5関数をそのまま移動。
- `src/import/note-import-content.js`へ、新規／置換えのタイトル優先順位と置換保存データの組み立てを分離。新規は生成元の題、置換えは既存の題も候補とする違いを維持。対象のID・順序・storageRevisionを保持する。
- `note-import-webview.js`と`note-partial-import-webview.js`は分離先を参照。新規のグループ作成は既存の`prepareImportedGroups`を引き続き利用する。
- 既存テストの移動対象の関数ソース抽出を実モジュール参照に変更。新規の`test/note-import-data.test.js`と`test/fixtures/note-import-harness.cjs`では、実モジュールと画面ホスト全体を実行し、ファイル操作とVS Code UIだけを捕捉する。

HTML/CSS・画面内スクリプト、パーサー、Webソース、メモの取り込み規則、ノート編集側の挿入／上書き、保存処理、競合検出は変更していない。画面ホストの取消・再読込・確認・保存・通知の順序も維持した。表示と保存の不具合修正は混ぜていない。

## 検証

- 着手前の全980件成功。ログ `.review-baseline/note-import-before-tests.log`。
- 既存関連27件成功。ログ `.review-baseline/note-import-focused-tests.log`。実ファイルでの新規・置換え、メモON/OFF、挿入・上書き、再読込、外部変更の競合、取消を含む。
- 新規6件成功。候補順序・空欄補完・範囲、メモ正規化と入力不変、選択復元、タイトル優先順位、保存基準、ホスト全体の再利用・取消・保存失敗・反映後候補更新を確認。
- 変更後の全986件成功、失敗0・スキップ0。ログ `.review-baseline/note-import-after-tests.log`。
- 分離前後の144通りで、生成HTML全体、再読込状態、確認文、保存／反映ペイロード、イベント順序が一致。新規／置換えと選択挿入／上書き、プロット／資料、空の入力・区分・項目・メモ、未指定／ON／OFF、成功・取消・保存失敗を含む。
- 比較 `.review-baseline/compare-note-import.cjs`、結果 `.review-baseline/note-import-equivalence.log`。再読込比較は同じ実パーサー出力を両方へ渡し、ランダムIDの差だけを除外。パーサー自体は既存テストと実ファイル保存テストで確認する。
- `.review-baseline/check-note-import-boundaries.cjs`で、両画面のHTML生成関数、移動した5関数、部分読込ホストの関数本体が変更前と一致することを確認。
- 着手前退避 `.review-baseline/20261019-165412-2f3aaf/source.zip`、565ファイル。SHA256 `7C4C92AA5FD1B3F9203D960E19F948DA77AD35B54599CA65B3EE98BA44E6AC61`。

## 配布と次の単位

利用者が2-Bの基本動作を実機確認済み。反復する挿入／上書きのモーダル確認については、別の[操作改善記録](code-review-note-import-confirm-20261019.md)で対応した。

確認用VSIXは`release/mojigoto-1.0.68-note-import-organized.vsix`。新規・置換え、選択挿入・上書き、項目メモON/OFFと再読込を実機確認する。確認後は2-Cとして読込画面のHTML・画面スクリプトと操作受付の分離範囲を点検し、表示と保存の挙動を保って進める。2-Cは未着手。

拡張の版は1.0.68。VS Codeへのインストール・公開・コミットはしていない。

## 配布・退避の照合

- VSIXは422エントリ。配布対象418ファイルのソースハッシュが一致。分離先2ファイルの同梱と設定・ユーザーデータの除外を確認。検証スクリプト `.review-baseline/verify-note-import-organized-vsix-release.ps1`。
- VSIX SHA256: `2E1AB4CC4BA2E4D03C59ABB68F0D49832BEABEA55FF2499FA1F9953BDFCADE4A`。
- 完了時退避 `.review-baseline/20261019-165828-4d8ca4/source.zip`、570ファイル。SHA256 `2D25F9C3AC8F4416A22D2F1AA9CD1AAFF9F9378AC3097E38A669D83B72D31129`。
- この照合結果の追記のみ、配布物・退避の作成後に実施した。
