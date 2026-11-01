# 第1段階・クラウド：既存ファイルの条件付き保存

確認日：2026-10-12。OneDrive・Google Drive・Dropboxの `writeText` を対象に、保存基準と同時更新時の処理を点検した。実アカウントへの書き込みと本番反映は実施していない。

## 結果

Google Driveは従来、v3のversionを事前比較してから、条件ヘッダーなしで本文をPATCHしていた。事前比較後に別端末が更新すると上書きできることを模擬サーバーで再現した。

OneDriveとDropboxは既に書き込み要求へ更新条件を付けていた。ただし、条件引数を省略した場合に、読み込み時の版を使わず、条件なしで更新したり保存直前の版を採用したりする経路があった。この経路も下書きの基準を保つよう修正した。

| クラウド | 保存基準 | 書き込み時の条件 | 今回の変更 |
|---|---|---|---|
| OneDrive | 引数のeTag、なければitem.eTag | PUTのIf-Match | 条件を必須化し、版不明なら送信前に停止 |
| Google Drive | 引数のversion、なければitem.eTag（従来どおりversionを格納） | v2の実etagを取得し、v2のPUTへIf-Match | 版の事前比較と書き込み時の条件を両方適用 |
| Dropbox | 引数のrev、なければitem.eTag | update: rev、autorename: false、strict_conflict: true | 読み込み済みのrevを優先し、保存直前の最新版へ勝手に置き換えない |

3クラウドとも基準がなければ保存を止める。引数が明示された場合はそれを優先する。元の下書きはアプリ側に保持され、版不明の場合はコピーしてから最新版を読み直す案内を出す。

## Google Driveの設計

一覧・読み込み・作品検出・新規作成はv3を維持し、既存ファイルの更新だけv2を使用する。

1. 読み込み時のversionがあることを確認する。
2. v2のfiles.getでversionと実etagを一緒に取得する。ブラウザキャッシュを利用しない。
3. versionが下書きの基準と異なれば、本文を送らず競合として停止する。
4. etagが欠落・弱いETag・不正形式、または取得したIDが対象と異なる場合も本文を送らない。
5. 実etagをIf-Matchとしてv2のmedia PUTへ付ける。409・412は共通の競合エラーへ変換する。条件なしの更新へは切り替えない。
6. v2のtitle、fileSize、modifiedDate、parentsを、従来の共通形式へ変換して返す。共有ファイル形式や保存される本文は変更しない。

v3のversionをHTTP ETagとして送ってはいけない。v2のetagとversion、v3でetagが削除された対応表、v2の更新URIとdrive.file対応は、[Google v2 File仕様](https://developers.google.com/workspace/drive/api/reference/rest/v2/files)、[v2/v3対応表](https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference)、[v2 files.update](https://developers.google.com/workspace/drive/api/reference/rest/v2/files/update)で確認した。

Googleの現行REST更新ページにはIf-Matchの詳細な説明が見当たらなかったため、ETagによる更新競合検出の実装例はGoogle公開の[Chromium Driveリクエスト定義](https://chromium.googlesource.com/chromium/src/%2B/7c5cfabd6bc582c20e0ae5e56adf8e9c8e22bce0/google_apis/drive/drive_api_requests.h)と[If-Match生成のテスト](https://chromium.googlesource.com/chromium/src/%2B/138.0.7204.157/google_apis/drive/request_util_unittest.cc)も参照した。これは今回のブラウザからのmedia PUTが実クラウドで検証済みであることを意味しない。

Dropboxのupdateとstrict_conflictは、[公式API定義](https://github.com/dropbox/dropbox-api-spec/blob/main/files.stone)と照合した。OneDriveのcontent PUTは[公式更新API](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0)を確認し、既存のIf-Match送信を維持した。

## 自動検証

`test/web-cloud-write-safety.test.mjs` に18件を追加した。実際のproviderを、本文・版を保持する模擬サーバーに接続して実行した。単にヘッダー文字列を見るだけでなく、条件を満たさない書き込みでサーバー側の本文が残ることを確認する。

- 3クラウドで、確認後の同時更新を拒否して別端末の本文を保持。
- 3クラウドで、保存基準なしなら通信せず停止。
- 3クラウドで、引数省略時にitem.eTagを使用。古い版を最新版へ置き換えない。
- 3クラウドで、401を競合と区別し、再試行しない。
- GoogleでETag欠落・弱いETag・version欠落時に本文を送らない。
- Googleの正常更新で、実ETag、v2更新URIとPUT、応答の共通形式への変換を確認。

修正前のソース（前回の保存基準）では18件中12件失敗、修正後は18件すべて成功。全体は**396件すべて成功**。サンドボックスの一時フォルダはワークスペース内へ指定した。

ログ：`.review-baseline/stage1-cloud-original-results.log`、`.review-baseline/stage1-cloud-tests.log`。provider3本、app.mjs、google-drive-setup.mjs、sw.jsの構文確認も成功した。

既存のDropboxテストは、新しく取得したrevではなく、読み込み済みのrevを使う仕様に更新した。providerのモジュール参照へ版を付け、appは1.0.159、Google登録画面は1.0.164、Service Workerはv201へそろえた。

## 公開前の実機確認

利用者の原稿ではなく専用のサンプル作品で、次の確認を行う。今回は未実施。

1. Googleのdrive.file接続でv2メタデータ取得・通常保存が成功すること。日本語名・本文、親フォルダ、更新後のversionも確認する。
2. Googleのv2 media PUTへ古い実ETagを付け、HTTP 412となり、現在の本文が変わらないこと。ブラウザのCORS事前確認も含める。確認できるまで、この変更を実機検証済みとして公開判断に使わない。
3. 3クラウドで両端末が同じ版を読み、片方を保存した後、もう片方の保存が停止して下書きをコピーできること。
4. 保存基準が欠落した場合、通信切断、接続期限切れ、再接続後でも下書きが残り、無条件の更新が送られないこと。
5. 原稿だけでなく、同じwriteTextを使用するノート・構想メモ・作品設定・バックアップ索引について通常保存が成功すること。

GoogleのAPI変更によるエラーは、競合でない場合に通常の保存失敗として表示する。v2が使えない環境でも条件なしのv3更新には戻さない。

次のローカル作業単位はノート・構想メモの保存と双方向同期。執筆記録・バックアップなどの付随データ、復元、改名の途中失敗は、その後に個別に確認する。実クラウド・本番の確認は引き続き未完了。
