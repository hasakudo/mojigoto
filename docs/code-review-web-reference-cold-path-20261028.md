# キャッシュなしの関連作品初回探索を直接取得へ変更（2026-10-28）

## 背景と方針

実機の確認3区間は、1.0.245の約17.5秒から1.0.246で約12.1秒へ短縮したが、候補取得が8,934ms残った。2回目は候補取得0msで、合計約3.2秒。明示的なクラウド切断では前回一覧を削除するため、その経路では前回一覧に依存した最適化を利用できない。利用者が次の改善を承認。切断時のデータ削除を維持し、OneDriveの初回探索そのものを短縮した。

## 変更

OneDriveProvider.inspectReferenceFoldersを追加。Microsoft Graphのパス指定とchildren展開を使い、各作品直下の.mojigotoと中の一覧を同じ要求で取得する。20件ずつの読み取りbatchにまとめ、ルート一覧→各作品の子一覧→管理フォルダ一覧の3段階を、直接取得成功時はルート一覧→管理フォルダの一括取得の2段階へ変更。

参照用のdiscoverReferenceWorksだけで使い、通常の作品一覧検出は従来どおり。権限不足・404・非対応・別親フォルダの返答・不完全な展開・通信失敗ではその作品だけ通常探索へ戻す。ページ分割の続きを取得し、childCountと実件数が合わなければ管理フォルダを再列挙する。Single設定を含めて一覧内の設定ファイル探索を維持し、新規作成・書込は行わない。

現在作品の設定と候補の設定本文、関連解除・重複IDの確認、編集中の作品・保存先・dirty保持は維持。新しい永続キャッシュは追加せず、切断時の一覧削除も変更しない。

「関連作品・作品候補取得」の計測へsource（discovery／memory／active-discovery／loaded-catalog）、cachedWorks、expandedFolders、fallbackFolders、managementFoldersを追加。名前やクラウドIDは記録しない。次の実機測定で、直接取得が使えたか、通常探索に戻ったかを確認できる。

使用した公式仕様：[Get driveItemのchildren展開](https://learn.microsoft.com/en-us/graph/api/driveitem-get?view=graph-rest-1.0)、[パス指定による子一覧](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0)。実クラウドでの対応状況や秒数は未確認で、非対応時は上記の従来探索を利用する。

## 検証

全1,701件成功・失敗0（10件追加）。初回の並列全件実行では既存の保存関連2件が一時ファイルrenameのEPERMで失敗したため、全件をtest-concurrency=1で再実行し成功。実装を合わせるための保存処理や既存テストの変更は行っていない。

新テストでは20件分割・返答順・別ドライブ・GETだけの要求、展開のページ続きと件数不足、404・権限不足・親違い・一覧欠損・batch／継続ページ失敗を確認。検出側ではキャッシュなしの子／管理フォルダ列挙省略、部分失敗だけの通常探索、全体失敗からの復帰、通常作品一覧への非適用、初回／メモリ再利用と件数の計測を確認。変更JSの構文確認も成功。

実認証を使わないブラウザで前回一覧を明示的に削除し、state.works空・履歴復元からノートプレビューを開いた。3作品の候補取得はルート一覧1回＋folder-batch1回（3要求）で、作品の子・管理フォルダの個別列挙は0回。現在作品設定の確認、候補設定のmetadata-batch1回、設定本文の取得は維持。関連作品のプロットを表示し、currentWork=qa-own、currentNote=plot-own、dirty=true、未保存の項目詳細を保持、書込0件、エラーログ0件を確認。

## 状態と次の確認

Web1.0.247／シェルv292、CSS1.0.190。拡張機能版は変更なし。本番／テスト未反映。デプロイ・コミット・実クラウド書込は行っていない。実機での秒数短縮は未確認。

反映後、同じ切断→接続→原稿／ノートの関連プレビューで、確認3区間とexpandedFolders／fallbackFoldersを取得する。追加の通常フォルダや非対応の展開がある場合は通常探索の通信待ちが残る。

証跡：.review-baseline/web-reference-cold-path-20261028/（before／after、full-tests-first.log、full-tests.log、browser-result.json、direct-reference.jpg、検証サーバー／fixture）。
