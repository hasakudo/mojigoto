// Shared source for the in-app and standalone guides. Run sync-web-guide.cjs after editing.
const topics = [
  ['guide-section-1', '接続して作品を開く', `
    <ol class="guide-steps"><li>HOMEでクラウドを選び、接続を許可します。</li><li>作品フォルダ、または作品をまとめた親フォルダを選びます。</li><li>作品を開き、原稿・プロット・資料・構想メモを選びます。</li></ol>
    <p>Google Driveは<a href="./google-drive-setup.html">専用登録ページ</a>から接続・登録します。初回はパソコンでの操作がおすすめです。</p>
    <details class="guide-more"><summary>Google Driveでファイルが見つからないとき</summary><div><p>既存作品は、使うファイルと子フォルダへのアクセス許可が必要です。VS Codeで追加・作り直した項目は、HOMEの「登録済み作品の追加ファイルを許可」から許可してください。</p><p><a href="./google-drive-setup.html#setupFolderExamples">作品フォルダの選び方を見る</a></p></div></details>`],
  ['guide-section-2', '編集とプレビュー', `
    <p>作品内のメニューで画面を切り替えます。「履歴」から前回開いていた一覧や編集画面へ戻れます。</p>
    <p>歯車の上段はよく使う操作、下段は保存設定やガイドです。</p>
    <dl class="guide-icon-legend"><div><dt>雲</dt><dd>接続設定</dd></div><div><dt>虫眼鏡</dt><dd>検索・置換</dd></div><div><dt>キーボード</dt><dd>入力補助</dd></div><div><dt>本</dt><dd>ノートの参照</dd></div><div><dt>時計</dt><dd>バックアップ</dd></div></dl>
    <details class="guide-more"><summary>ノートや関連作品を参照する</summary><div><p>原稿の本アイコンから、原稿を編集したままプロット・資料を選んで確認できます。ノート画面は「プレビュー」、構想メモは本アイコンまたはSOURCEから開きます。</p><p>作品設定の「関連作品を設定」で登録した作品も参照できます。同じクラウド・作品ルート内が対象です。「参照元・表示設定」を閉じると本文を広く表示できます。</p></div></details>
    <details class="guide-more"><summary>原稿・フォルダの名前を変える</summary><div><p>原稿一覧の「名前変更」から変更します。原稿の拡張子（.txt・.md）は保持されます。</p></div></details>
    <details class="guide-more"><summary>原稿全体を読む</summary><div><p>原稿一覧の歯車→「全体プレビュー」、または原稿画面の「プレビュー」→「全体」から開きます。目次で原稿を選び、「続きを読む」「前を読む」で順に読めます。</p><p>プレビューの「表示設定」で縦横・書体・文字サイズを変更が可能です。<br>「ページ」と設定を共用し、原稿画面の「表示設定」をから変更できます。<br>「編集」からプレビュー表示中の原稿を開けます。</p><p>別原稿へ移る際は未保存の内容を保存し、保存に失敗した場合は移動しません。読み込みを中止した場合は目次から開き直してください。</p></div></details>
    <details class="guide-more"><summary>文字サイズ・書体を変える</summary><div><p>接続設定で画面と入力欄の文字サイズ・書体を選びます。原稿の「プレビュー」では、本文とは別に書体・横書き／縦書き・行間を設定できます。</p></div></details>`],
  ['guide-section-3', '入力補助とショートカット', `
    <p>キーボードのアイコンから、字下げ・記号・見出し・ルビ・傍点を挿入できます。</p><p>文字を選んでから押すと記法を付けます。「解除」は、選択範囲に付いた括弧・ルビ・傍点の記法を外します。</p>
    <details class="guide-more" data-guide-section="guide-section-5"><summary>キーボードで操作する</summary><div><dl class="guide-shortcuts"><div><dt>Ctrl + S／Command + S</dt><dd>保存</dd></div><div><dt>Esc</dt><dd>メニューやポップアップを閉じる</dd></div><div><dt>Alt + 1〜6／Option + 1〜6</dt><dd>作品・原稿・プロット・資料・構想・作品設定へ切り替え</dd></div></dl></div></details>`],
  ['guide-search', '検索・置換', `
    <ol class="guide-steps"><li>歯車の虫眼鏡を押し、検索する文字を入力します。</li><li>結果の場所を押すと、該当箇所へ移動します。</li><li>変更するときは「置換する」をONにし、変更後を確認して実行します。</li></ol>
    <div class="guide-search-scopes"><section data-guide-section="guide-manuscript-search"><h3>原稿</h3><p>編集中の1ファイルの本文が対象です。</p></section><section data-guide-section="guide-note-search"><h3>ノート</h3><p>編集中の1ノートの名称・項目詳細が対象です。項目メモは「条件」でONにします。</p></section><section data-guide-section="guide-concept-search"><h3>構想メモ</h3><p>一覧の歯車から、作品内の全メモのタイトル・本文を検索します。絞り込みで隠れたメモも対象です。</p></section></div>
    <details class="guide-more"><summary>置換の範囲と取り消し</summary><div><p>1箇所、または選択した候補をまとめて置換できます。空欄への置換は削除です。ルビ・傍点内は検索・移動のみ対応し、リスト・TODOの行構造やチェック記号を変える置換は止めます。</p><p>置換後は通常の保存設定に従います。保存後も「直前の置換を戻す」を使えますが、対象を後から編集した場合や、別の編集画面へ移動・再読み込みした場合は戻せません。</p></div></details>`],
  ['guide-saving', '保存と同期', `
    <span class="guide-anchor" data-guide-section="guide-section-4"></span><p>「保存」でクラウドへ保存します。歯車の「自動保存」をONにすると、入力後しばらくして保存します。</p>
    <div class="guide-callout"><strong>「保存済み」を確認してから移動</strong><p>反映中・バックアップ中の表示がある間は、完了を待ってください。</p></div>
    <details class="guide-more"><summary>VS Codeでも編集するとき</summary><div><p>同じクラウドの作品フォルダを使います。別の画面や端末でも変更した場合は、内容を確認してから保存してください。競合時は自動で上書きしません。</p></div></details>`],
  ['guide-auto-reflect', '項目メモと構想メモの連携', `
    <p><strong>自動保存</strong>は編集中の内容を保存し、<strong>自動反映</strong>は保存したメモを連携先へ反映します。自動保存とは別なので、手動保存時に自動反映することもできます。</p>
    <ol class="guide-steps"><li>ノート・構想メモの歯車で、反映する方向の「全体の既定」をONにします。</li><li>項目メモを保存すると、構想メモの作成・連携も行います。</li><li>構想メモの変更も反映したいときは、逆方向もONにします。</li></ol>
    <details class="guide-more"><summary>個別設定と、反映が止まったとき</summary><div><p>項目メモ内やSOURCEで「全体設定に従う／このメモはON／このメモはOFF」を選べます。個別指定が優先されます。全体設定は、このブラウザの利用者・クラウド・作品ルートごとに使います。</p><p>両方に変更がある場合は自動反映を止めます。残したい側から「構想メモへ反映」または「項目メモへ反映」を押してください。出典のない構想メモには反映先を自動作成しません。</p></div></details>`],
  ['guide-backup', 'バックアップと復元', `
    <p>原稿・ノートは編集画面の歯車、構想メモは一覧の歯車にある時計アイコンから開きます。</p>
    <ul><li>手動保存、履歴の比較・保護・復元ができます。</li><li>自動バックアップの間隔も履歴画面で設定できます。</li></ul>
    <div class="guide-callout"><strong>構想メモの復元は、作品内の全メモが対象です。</strong><p>原稿・ノートはファイル単位です。復元前の内容も履歴に残ります。</p></div>
    <details class="guide-more"><summary>対象と履歴の保持</summary><div><p>対象は原稿フォルダ内の .txt／.md、プロット・資料ノート、構想メモです。作品設定や画像などは含みません。履歴は対象ごとに50件まで、自動履歴は90日で整理されます。保護した履歴は残ります。</p><p>Google Driveでは、VS Codeで作成したバックアップとその中身への追加許可が必要です。作品全体の保全には、作品フォルダのコピーも利用してください。</p></div></details>`],
  ['guide-file-import', 'ファイルから読み込む', `
    <ol class="guide-steps"><li>「新規原稿」または「新規ノート」を開きます。</li><li>ファイルを選ぶか、作成画面へ1つドロップします。</li><li>プレビュー・名前・作成先を確認して実行します。</li></ol><p>原稿はUTF-8の .txt／.md、ノートは .md（10MB以下）に対応します。</p>
    <details class="guide-more"><summary>VS Codeのノートを取り込む</summary><div><p>Dashboard → 保存設定の「Web読込用Markdown」で生成したファイルを使います。「原本を開く」は共有ノートを編集、「新しいコピーを作成」は別ノートを作成します。「既存ノートに上書き」は差分と保存先を確認して実行してください。</p><p>画像は関連付けだけを取り込みます。別作品へ移す場合は .mojigoto/note-images の画像もコピーしてください。呼び名一覧は参照用に表示します。構想メモの連携ID・自動反映設定はコピーへ引き継ぎません。</p></div></details>`],
  ['guide-section-6', '困ったとき', `
    <details class="guide-more"><summary>作品・ファイルが見つからない</summary><div><p>作品フォルダとクラウド接続を確認してください。Google Driveは<a href="./google-drive-setup.html">登録・追加許可</a>も確認します。</p></div></details>
    <details class="guide-more"><summary>読み込みが終わらない・更新が見えない</summary><div><ol class="guide-steps"><li>未保存の入力を保存します。保存できない場合は、本文をコピーして控えます。</li><li>接続設定 →「再読み込み」を試します。</li><li>改善しない場合は「アプリのキャッシュを削除して再読み込み」を使います。作品データ・ログイン情報・履歴・設定は残ります。</li></ol></div></details>
    <details class="guide-more"><summary>競合・反映失敗と表示される</summary><div><p>残したい内容を確認してから、最新版の読み込みや手動反映を選びます。通信エラーが続く場合はクラウドへ再接続してください。</p></div></details>
    <p>解決しない場合は<a href="./contact/">お問い合わせ</a>へ。</p>`],
  ['guide-section-7', 'データとアカウント', `
    <span class="guide-anchor" data-guide-section="guide-section-8"></span><span class="guide-anchor" data-guide-section="guide-section-9"></span><p>作品データは接続したクラウドに保存され、もじごとのサーバーには保存されません。共用端末では、利用後にクラウド接続を解除し、ログアウトしてください。</p><p>VS CodeとWebは同じ作品フォルダを開き、対応する最新版を使ってください。</p>
    <p>登録メールアドレスはログインや運営からの連絡に使います。変更は<a href="./contact/">お問い合わせ</a>、利用解除は<a href="./apply/">利用・解除申込</a>へ。詳しくは<a href="./privacy/">プライバシーポリシー</a>をご確認ください。</p>`],
];
const login = `<p class="guide-lead">ログインから作品を開くまで、3ステップ。</p><ol class="guide-start-steps"><li><strong>もじごとにログイン</strong><p>利用申請時に登録したメールアドレスでログインします。</p></li><li><strong>クラウドへ接続</strong><p>作品のあるOneDriveまたはGoogle Drive、Dropboxへ接続します。ログインとクラウド接続は別の操作です。</p></li><li><strong>作品フォルダを選ぶ</strong><p>クラウド内の原稿・ノートを開いて編集します。</p></li></ol><p class="guide-footer">作品データはもじごとのサーバーには保存されません。<a href="./privacy/">データの取り扱い</a>／<a href="./contact/">お問い合わせ</a></p>`;
function renderGuide(page = false) {
  const attributes = id => `${page ? `id="${id}" ` : ''}data-guide-section="${id}"`;
  const quick = `<nav class="guide-page-toc guide-quicklinks" aria-label="ガイドの目次"><a href="#guide-section-1">はじめる</a><a href="#guide-search">検索・置換</a><a href="#guide-saving">保存・同期</a><a href="#guide-section-6">困ったとき</a></nav>`;
  const body = topics.map(([id,title,body]) => `<details class="guide-topic" ${attributes(id)}><summary>${title}</summary><div>${body.replace(/data-guide-section="([^"]+)"/g,(_,id)=>attributes(id))}</div></details>`).join('\n');
  return `<p class="guide-lead">知りたい項目を開いて確認できます。</p>${quick}<div class="guide-sections">${body}</div><p class="guide-footer">${page ? '<a href="#guide-section-1">はじめに戻る</a>' : '<a href="./guide.html" target="_blank" rel="noopener">別タブでガイドを開く</a>'}</p>`;
}
module.exports = { renderGuide, login };

