# 執筆メモ反映の比較確認を省略する設定（2026-10-22）

## 変更

反映方法の選択機能は利用者動作確認済み。比較確認を次回から省略し、設定から再表示する要望に対応した。

- 編集済み・古いコピーの上書き比較ダイアログに「上書き更新して次回から省略」を追加。通常の「上書き更新」と取消は従来どおり。
- 新設定`mojigoto.confirmWritingMemoConceptOverwrite`は初期true、applicationスコープで全作品共通。省略を選び、構想メモの更新が成功した後にGlobal設定へfalseを保存する。VS Codeの設定画面でONに戻すと、以後の比較確認を再表示する。設定検索は`@id:mojigoto.confirmWritingMemoConceptOverwrite`。
- 省略するのは上書き前の追加比較確認だけ。「既存を更新／新しく作成」と複数候補の選択は残す。対象の変更・削除の検出、再読込、storageRevisionによる競合保護も維持する。
- 設定は反映ごとに読み直すため、画面を閉じたり再起動したりせずONへ戻せる。構想メモの内容を更新できなかった場合は、省略設定も保存しない。
- 設定の保存だけが失敗した場合は、構想メモの更新済み内容を維持して設定保存の失敗を知らせる。更新自体を失敗扱いにしない。
- 既定動作・保存データ・Webは変更しない。版は1.0.68。インストール・公開・コミットは行わない。

## 検証

- 新規6件：更新成功後のGlobal設定保存、以後の比較省略とON復帰、通常更新／取消で設定を変えないこと、更新失敗時の省略不保存、設定保存だけの失敗、候補選択と外部変更保護の維持、設定の初期値・スコープを検証。
- 関連30件成功：`.review-baseline/writing-copy-confirm-setting-focused.log`。
- 全1,132件成功、失敗0・スキップ0：`.review-baseline/writing-copy-confirm-setting-after-tests.log`。
- 着手前退避：`.review-baseline/20261022-175707-ebddb7/source.zip`（652ファイル）。SHA256 `0E1BBB7A98599CEFE90CE3F1523ABAA466A9CC202E10251948D31EBAB6B2C4D8`。
- 今回のVS Code実機UI確認は未実施。

## 確認と次の段階

比較確認で省略付きの更新を選んだ後、構想メモ側を編集して再反映すると、反映方法の選択を残して比較確認だけが省略されることを確認する。VS Code設定で`mojigoto.confirmWritingMemoConceptOverwrite`をONに戻し、比較確認が再表示されることも確認対象。

確認後は5-C（SNS画像保存→集計補正）へ進む。検索／置換えは別の後続機能として保持する。


## 配布の照合

- 確認用：`release/mojigoto-1.0.68-writing-copy-confirm-setting.vsix`。
- 480エントリ、配布対象476ファイルのハッシュ一致。必要モジュールの同梱と非公開設定等の除外を`.review-baseline/verify-writing-copy-confirm-setting-vsix-release.ps1`で確認。
- VSIX SHA256：`61BCA29A9B7EFC82EB779F1AB0F855305D71C60EB0EEB403BCEAB0EC7A0862C0`。
- 完了時退避：`.review-baseline/20261022-180046-2fee06/source.zip`（653ファイル）。SHA256 `F1C8A19014C7FFD0A07229FB68E86D8A0F7D49672F39BDCECC8431CDA042293F`。
- この配布情報のみVSIX・退避作成とソース照合後に本文書へ追記した。
