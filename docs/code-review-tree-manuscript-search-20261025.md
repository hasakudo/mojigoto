# 作品ツリーから原稿フォルダー内を検索（2026-10-25）

## 変更

ノート置換のモーダル表示は利用者確認済み。エクスプローラーへ移らず、作品ツリーから原稿フォルダーをVS Code検索の対象にする入口を追加。

- 作品ツリーの「原稿」（Single／View／作品一覧側）と原稿ファイルの右クリックへ「原稿フォルダー内を検索…」を追加。
- 章フォルダーには「この章の中を検索…」を追加。その章と配下を対象にする。深い階層の原稿ファイルからの原稿検索は、直属の章ではなく原稿ルート全体を使う。
- 原稿ファイルのルートは既存の`resolveManuscriptRootForTreeItem`を再利用。ツリーの親ルートを優先し、別作品に現在のView側の範囲を混ぜない。
- 指定フォルダーの存在と種類を確認し、`filesExplorer.findInFolder`へフォルダーURIを渡す。自前のglob文字列を組み立てず、VS Code標準のパス解決と検索設定を利用する。
- エクスプローラーを表示・選択し直す操作は不要。検索語・正規表現・置換・結果の確認などは標準検索へ任せる。検索除外設定や検索の表示モードもVS Codeに従う。
- 対象不明・相対パス・ルート不明・非フォルダー・取得失敗では、別の範囲や全作品検索へフォールバックしない。ファイル作成・書込み・作品切り替えは行わない。
- 右クリックだけに入口を出し、ホバーアイコンや対象のないコマンドパレット操作は追加しない。ノート・倉庫・ごみ箱には出さない。ガイドの「原稿を書く」に案内を追加。
- 版は1.0.68。インストール・公開・コミットは行わない。

## 標準動作の確認

VS Codeの一次資料を確認した上で、既存のフォルダー検索を呼び出す。

- [標準コマンドの定義](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/search/common/constants.ts)：`filesExplorer.findInFolder`。
- [フォルダー検索処理](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/search/browser/searchActionsFind.ts)：指定URIからフォルダーを解決し、検索ビューまたは設定された検索エディターへ渡す。
- [コマンドのリソース解決](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/files.ts)：エクスプローラー以外から渡されたURIもリソースとして扱う。
- [標準のファイル横断検索・置換](https://code.visualstudio.com/docs/editing/codebasics#_search-across-files)：検索範囲・置換欄は標準UIで操作できる。

## 検証

- 新規6件。実コマンド登録と操作モジュールへ接続し、原稿ルート・章から指定URIをそのまま渡すこと、Single／Multi、空白・日本語・括弧・カンマを含むパスを確認。
- 原稿ファイルから既存ルート解決へ正しい項目と実パスを渡すこと、対象不明・非フォルダー・取得失敗時に別範囲を検索しないことを確認。
- 実際のルート解決モジュールでも、章が深い場合と別作品の原稿でツリーの親ルートを優先することを確認。
- メニュー対象・コマンド登録・コマンドパレット非表示、検索コマンド失敗時の通知を確認。
- 全1,385件成功、失敗0・スキップ0：`.review-baseline/tree-manuscript-search-after-tests.log`。
- 着手前退避：`.review-baseline/20261025-220641-21d27e/source.zip`（761ファイル）。SHA256 `DC601E861473F59B427032BED3097F93802D9ED7DC50DC6082236BD118480CA6`。
- VS Code実機での標準検索UIの起動確認は未実施。

## 実機確認

原稿ルート・原稿ファイルの「原稿フォルダー内を検索…」、章の「この章の中を検索…」から標準検索が開き、対象範囲が期待するパスになることを確認する。別作品の原稿、View側、深い章、検索画面での検索・置換も対象。

ノート検索の7-C（ルビ内・ふりがな・タグ・範囲・Webへの拡張）は未実装のまま、今後の対象順を別途検討する。

配布照合と完了時退避の情報のみ、VSIX作成・照合後に追記する。

## 配布の照合

- 確認用：`release/mojigoto-1.0.68-tree-manuscript-search.vsix`。
- 540エントリ、配布対象536ファイルのソースハッシュ一致。対象ソース同梱と非公開設定等の除外を`.review-baseline/verify-tree-manuscript-search-vsix.ps1`で確認。
- VSIX SHA256：`CF51AF70B01B943F302E0B330D4D328601172A8DF4625150689AEECBD4946778`。
- 完了時退避：`.review-baseline/20261025-221416-a7dbbc/source.zip`（763ファイル）。SHA256 `4737BEC4CA1434AC71A1A531F87C1E3699DB6B0C76E129C74B84C0DCAF6C2343`。
- この配布情報のみVSIX・退避作成とソース照合後に本文書へ追記した。
