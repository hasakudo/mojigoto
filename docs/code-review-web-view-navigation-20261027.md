# 接続・履歴の整理2-B3：ブラウザ履歴と画面・位置の復元（2026-10-27）

## 利用者確認と範囲

利用者が3クラウドで履歴表示・ピン留め・再読み込み等を確認し、現在問題なしと報告。2-B2は利用者確認済みとする。確認環境の個別明示や全操作の網羅確認までを意味しない。次へ進む承認を受け、ブラウザの戻る／進む、作品内の画面移動、画面と位置の復元の境界を整理する。

## 変更

web/lib/view-navigation.mjsのcreateViewNavigationControllerへ以下の13関数を移した。

- routeDestination、routeSignature、routeWorkSnapshot、isRestorableWorkSnapshot
- captureRoutePosition、rememberRoute、commitRoute、routeForWork
- selectRouteWork、restoreRoutePosition、restoreRoute
- navigateWorkDestination、initializeViewHistory

既存のpopstateイベントの処理本体もhandlePopStateとして移し、app側で従来どおり一度だけ登録する。13関数とイベント処理本体が変更前と一致することを確認した。

コントローラは共有state、DOM参照、ブラウザhistoryとwindow、requestAnimationFrame、各画面の読込と表示、未保存判断、通知を受け取る。履歴の同一画面は置換、別画面への移動は追加する扱いを維持。復元中の画面処理で履歴を追加しない。作品一覧にない保存済み作品参照の利用と、別作品への切替時の編集用状態初期化も維持する。

未保存時の戻る／進むでは既存のcanDiscardDraftを通し、破棄しない場合は画面を復元せずhistory.forwardで戻す既存動作を維持する。破棄を許可した場合は自動保存予約を取り消して復元する。復元中の一時的な画面種別はfinallyで解除し、失敗時も残さない。原稿のスクロール・選択範囲とページのスクロールはrequestAnimationFrameで復元する。今回、移動・破棄確認・失敗時の仕様は変更していない。

各画面の具体的な読み込み・描画、読込中の表示、画面全体の表示切替、履歴一覧、最近の原稿とノート履歴のタイトル補完、beforeunloadと起動更新時の離脱保護はapp側と既存モジュールに残す。

初期化は履歴保存モジュールより前に行い、まだ初期化していないrecordRecentView・openFile・cancelAutoSaveは遅延コールバックで接続する。構造整理だけであり、認証方式・保存形式・権限・履歴件数は変更しない。

## 検証

全1,583件成功・失敗0。追加15件で、元の画面の位置保存と履歴追加／置換、復元中の履歴追加抑止、原稿一覧／原稿／ノート一覧／ノート／構想一覧／構想／作品設定の7画面の復元、作品切替、復元通信失敗後の状態解除、未保存時の戻る抑止と許可時の復元、再読み込みで作品参照がない場合の一覧復帰、記憶した作品内画面への移動を確認。

既存のソース配置を検証するテストは移動先を参照するよう追従し、挙動の検証は維持。13関数とpopstate処理の一致はfunction-comparison.json、全体テストはfull-tests.log。変更JavaScriptの構文確認を実施。

実データ・実認証を使わないローカル検証画面でHOME履歴から原稿を開き、先頭から1文字目の位置へカーソルを移動して一覧へ戻った。ブラウザの戻るで原稿を復元し、selectionStart=1・selectionEnd=1を確認。進むで一覧表示、さらに戻るで原稿表示を確認し、ブラウザエラー0件だった。スクロール値・範囲選択と未保存の破棄判断は自動テストで検証し、実ブラウザではすべての条件を網羅していない。

検証用providerと公開設定だけを配信し、実クラウドや実際のOAuthへは接続していない。画面はnavigation-restored.jpg、結果はbrowser-result.json。

## 状態と次の作業

Web1.0.231、シェルv276。CSS1.0.185・拡張機能版は変更なし。Service Workerにview-navigation.mjsを登録。本番／テスト環境未反映。実クラウドへの書込、コミット、デプロイ、配布物作成は行っていない。証跡は.review-baseline/web-view-navigation-20261027/。

反映後は原稿・ノート・構想・作品設定と一覧の移動、ブラウザの戻る／進む、再読み込み後の復元、未保存時の確認を確かめる。確認後は予定どおりバックアップ・進捗共有の責務整理へ進む。作品共通ノート、検索／置換え、全体プレビューは後続の設計・機能追加として維持する。
