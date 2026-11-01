# 2-C ノート読込画面の表示・操作受付の分離（2026-10-19）

## 現在地

2-Bの動作と、その後の反復確認省略・高さ調整は利用者実機確認済み。2-Cとして通常読込・選択インポートの画面生成と操作受付を整理した。実装・自動検証済み、利用者確認待ち。

## 分離した境界

- `note-import-webview.js`と`note-partial-import-webview.js`にはパネルのキー・作成／再利用・初期表示・登録・破棄を残す。
- 各画面の`*-html.js`はタイトル・CSP・安全な初期データ埋め込み・HTML骨格を担当する。
- 各画面の`*-styles.js`と`*-script.js`には既存CSSと画面内JavaScriptをそのまま移動。画面コードは文字列で生成し、従来のエスケープと改行を維持する。
- 各画面の`*-actions.js`はメッセージ受付を生成する。既存の読込元ファイル表示・再読込・取消・新規・置換え・挿入・上書き・反映後候補更新を担当する。optionsは同じオブジェクトを共有し、再読込後も最新のparsedNoteなどを参照する。
- 通常読込の同一パネル再利用、選択インポートでの旧パネル破棄・再作成という違いを保つ。共通化のために両画面を同じ動作へ揃えていない。

保存処理、パーサー、ノート編集側の適用、Web、2-Bの整形・メモ規則は変更していない。画面の高さ計算とResizeObserver、フッター余白、反復する確認の省略も移動のみ。通信名や公開エントリーポイントの変更、不具合修正は混ぜていない。

## 検証

- 着手前988件成功。`.review-baseline/note-import-view-before-tests.log`。
- 既存関連35件成功。`.review-baseline/note-import-view-focused-tests.log`。移動した画面関数・操作受付のソース抽出を、実モジュール経由の実行へ変更した。未移動のノート編集内の処理の検証は維持する。
- 新規4件は、表示部品のVS Code／保存処理からの独立、CSP・タグ／改行／ルビの安全な埋め込み、両画面の読取失敗時の表示保持と保存抑止、タブ再利用・旧タブ破棄・取消後の再作成を検証。
- 全992件成功、失敗0・スキップ0。`.review-baseline/note-import-view-after-tests.log`。
- 実ホスト全体を分離前後144通りで比較し、生成HTML全体、再読込状態、確認文、保存／適用ペイロード、イベント順が一致。通常新規／置換え、選択挿入／上書き、プロット／資料、メモ未指定／ON／OFF、空／区分／項目／メモ、成功・取消・保存失敗を含む。
- 比較は`.review-baseline/compare-note-import-view.cjs`、結果は`.review-baseline/note-import-view-equivalence.log`。再読込時は同じ実パーサーの結果を両方に渡し、ランダムIDの差を除く。nonceも固定してHTML全体を照合した。
- `.review-baseline/check-note-import-view-boundaries.cjs`で、両メッセージコールバックの関数本体が移動前と同一であることを確認。
- 今回は表示変更を含まず、利用者確認済み画面とのHTML全体一致で検証。新たなブラウザー・実機での画面確認は実施していない。
- 着手前退避 `.review-baseline/20261019-181744-19b92c/source.zip`、572ファイル。SHA256 `14752FF793B97B2AA8E1EEB8E50DBCFD03AF73638C8416F8183E9693DD61A26C`。

## 配布と次の単位

利用者が読込の動作・表示を実機確認済み。続く3-Aは[構想メモ一覧の記録](code-review-concept-list-query-20261019.md)を参照。

確認用VSIXは`release/mojigoto-1.0.68-note-import-view-organized.vsix`。新規／置換えと、選択挿入／上書き・再読込・連続操作・画面下部の表示を確認する。

確認後は予定の3（構想メモ）へ進み、既存の画面部品を活かして一覧条件・並べ替えから調べる。構想メモは未着手。版は1.0.68、インストール・公開・コミットは未実施。

## 配布・退避の照合

- VSIXは433エントリ、配布対象429ファイルのソースハッシュが一致。分離先8ファイルの同梱と非公開設定等の除外を確認。`.review-baseline/verify-note-import-view-vsix-release.ps1`を使用。
- VSIX SHA256: `7D74968BB5ECC057AEA566DCBA2A797496AF1362C5E4656DE56DCFFD0B857136`。
- 完了時退避 `.review-baseline/20261019-182153-6e7f98/source.zip`、582ファイル。SHA256 `594550BBE2DEC802CF3C08FB4BDC9D681C51DF1706BFAF1384CB50F1075D4D6F`。
- この照合結果のみ、配布物・退避の作成後に追記。
