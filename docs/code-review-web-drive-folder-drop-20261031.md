# Google Drive専用ページのフォルダドロップ（2026-10-31）

利用者が新規作成のEnter送信を確認し、問題なしと報告。継続課題に進む際の追加要望として、Google Drive専用ページの「PCから取り込む」に、フォルダのドラッグ＆ドロップ指定を追加した。

## 実装範囲

- 「PCの作品フォルダ」のドロップ枠を追加。フォルダを1つ受け取り、選択中の名前・読取中の進捗を表示する。従来のwebkitdirectoryによる選択も維持する。
- File and Directory Entries APIから、dropイベント内で同期的にEntryを取得し、子階層を列挙する。readEntriesを空のバッチまで繰り返し、Chromiumの100件区切りを越えて取得する。階層はwebkitRelativePathへ与え、Fileのバイト列・種類・更新時刻を保持する。
- .mojigotoなどの隠し階層、ノート画像、既存バックアップを保持し、.git／_WORK／node_modules等の除外は既存planGoogleDriveImportへ任せる。ファイルの中身をプレビュー目的で読み出さず、フォルダ選択時と同じ取込計画へ渡す。
- ドロップだけではDriveへ送らない。件数・除外・取込先名の確認後、既存の「Driveへ取り込む」とconfirmで実行する。既存の新規コピー、重複防止、途中中断・権限・再試行を変更しない。
- 複数フォルダ、単独ファイル、空フォルダ、未対応ブラウザ、読取失敗は案内を表示し、前の有効な選択を維持する。途中で取得できたファイルだけを成功扱いにしない。
- 新しいドロップ、通常の選択、リセット・接続等の操作で旧列挙を失効させる。読取中は取込ボタンを無効にする。ページの枠外にドロップしてもブラウザがファイルへ移動しないよう防ぐ。

web/lib/project-folder-drop.mjsに読取とUIイベントを分離し、google-drive-setup.mjsは選択状態・既存計画へ接続する。専用HTML・CSSへ枠と状態表示を追加。共有CSSは変更していない。

Web1.0.277／シェルv322／共有CSS1.0.210。Drive専用JS・CSSの読込版は1.0.277。新モジュールをシェルへ登録し、専用ページも含む依存検査で見つかったPickerの版付きURL（1.0.161）の登録漏れも補った。アプリ用の1.0.162も保持する。公開・反映・コミットは未実施。

## 検証

13件追加、全体1,899件成功（失敗0・スキップ0・終了コード0）。205原稿のバッチ列挙、隠し階層、画像バイト列、Entryの同期取得、無効な入力、読取失敗、旧応答の破棄、未接続・枠外、既存除外設定の再集計と取込データの接続を検証した。既存の注入テストは追加した選択状態に追従させ、アプリとDrive専用ページの実際の起動URLから再帰的にシェル依存を確認する。

ブラウザでは実HTML／CSS／JSを使い、合成DirectoryEntryと実Fileによるdropイベントを通して、幅406pxで「取込206ファイル・除外1ファイル」と選択フォルダ、確認欄を表示できることを確認した。実OSからのドラッグ操作、実Google認証・アップロードは未実施。テスト用ボタンと合成フォルダはローカル検証にだけ注入し、製品ソースには含めていない。

証跡：C:\dev\mojigoto\.review-baseline\web-drive-folder-drop-20261031（full-tests-final.log、drive-folder-drop-mobile.png、before）。

## 反映後のPC確認

1. Google Driveに接続し、原稿と.mojigotoを含む検証用作品フォルダを枠内へドロップ。選択中の名前、取込・除外件数、取込先名を確認する。
2. 除外設定を変更して件数が更新され、従来のフォルダ選択に切り替えても正常に表示されることを確認する。
3. 「Driveへ取り込む」の確認後に新しいコピーができ、原稿・ノート・画像などの元データが保たれることを確認する。100件超またはMulti形式も確認対象とする。
4. 単独ファイルや複数フォルダ、空フォルダは案内され、元の選択を勝手に置き換えないことを確認する。

この追加機能の確認後、保留のOneDrive追加最適化・Android自動接続時の全画面待機表示の発生元調査へ進む。

API挙動の参照：[DataTransferItem.webkitGetAsEntry](https://developer.mozilla.org/en-US/docs/Web/API/DataTransferItem/webkitGetAsEntry)、[FileSystemDirectoryReader.readEntries](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryReader/readEntries)。
