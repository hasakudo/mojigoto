const vscode = require("vscode");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function openFirstRunBoardWebview(context, handlers = {}) {
  const panel = vscode.window.createWebviewPanel(
    "mojigotoFirstRunBoard",
    "もじごと案内板",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    },
  );

  panel.webview.html = getFirstRunBoardHtml(panel.webview);

  panel.webview.onDidReceiveMessage(
    async (message) => {
      const command = String(message?.command || "");

      try {
        if (command === "openInitialSetup") {
          panel.dispose();
          await handlers.openInitialSetup?.();
          return;
        }

        if (command === "openGuide") {
          panel.dispose();
          await handlers.openGuide?.();
          return;
        }

        if (command === "close") {
          panel.dispose();
          return;
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `もじごと: 案内板の操作に失敗しました: ${String(error)}`,
        );
      }
    },
    undefined,
    context.subscriptions,
  );

  return panel;
}

function getFirstRunBoardHtml(webview) {
  const title = escapeHtml("もじごとへようこそ");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      padding: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.7;
    }

    .page {
      box-sizing: border-box;
      max-width: 860px;
      margin: 0 auto;
      padding: 40px 28px 48px;
    }

    .hero {
      padding: 28px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 14px;
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 78%, transparent);
    }

    h1 {
      margin: 0 0 14px;
      font-size: 1.8rem;
      line-height: 1.35;
    }

    h2 {
      margin: 28px 0 10px;
      font-size: 1.2rem;
    }

    p {
      margin: 0 0 12px;
    }

    .lead {
      font-size: 1.05rem;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 24px;
    }

    button {
      appearance: none;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 8px;
      padding: 9px 14px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font: inherit;
      cursor: pointer;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }

    .card {
      padding: 14px 16px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 12px;
      background: var(--vscode-editorWidget-background);
    }

    .card strong {
      display: block;
      margin-bottom: 6px;
    }

    ul {
      margin: 8px 0 0;
      padding-left: 1.4em;
    }

    .note {
      margin-top: 18px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.92rem;
    }

    .callout {
      margin-top: 16px;
      padding: 16px 18px;
      border-left: 4px solid var(--vscode-textLink-foreground);
      border-radius: 10px;
      background: var(--vscode-textBlockQuote-background, var(--vscode-editorWidget-background));
    }

    .callout h2 {
      margin: 0 0 8px;
    }

    code {
      padding: 0.1em 0.35em;
      border-radius: 4px;
      background: var(--vscode-textCodeBlock-background);
    }

    details {
      margin-top: 14px;
      padding: 12px 14px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
    }

    summary {
      cursor: pointer;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <h1>もじごとへようこそ</h1>

      <p class="lead">
        もじごとは、VS Code で小説や長文を書くための執筆補助拡張です。
      </p>

      <p>
        原稿管理、縦書きプレビュー、作品設定、プロット・資料ノート、構想メモ、執筆メモ、文字数集計、書き出しなどをまとめて扱えます。
      </p>

      <div class="actions">
        <button id="openInitialSetupButton">初回セットアップを開く</button>
        <button class="secondary" id="openGuideButton">もじごとガイドを開く</button>
        <button class="secondary" id="closeButton">閉じる</button>
      </div>

      <p class="note">
        はじめて使う場合は、まず「初回セットアップ」を開いて、作品の管理方法と原稿フォルダを決めてください。
      </p>
    </section>

    <h2>最初にやること</h2>

    <div class="cards">
      <div class="card">
        <strong>1. 小説用フォルダを開く</strong>
        空のフォルダでも問題ありません。必要なフォルダや設定ファイルはセットアップで作成できます。
      </div>

      <div class="card">
        <strong>2. 初回セットアップ</strong>
        Single / Multi モード、原稿フォルダ、新規作成時の拡張子などを設定します。
      </div>

      <div class="card">
        <strong>3. 原稿を書く</strong>
        原稿は <code>.txt</code> または <code>.md</code> で扱います。作品ツリーから原稿やノートを管理できます。
      </div>
    </div>

    <section class="callout">
      <h2>既存の原稿を使う場合</h2>

      <p>次のどちらかの方法で原稿を配置してください。</p>

      <ul>
        <li>既存の作品フォルダ内に <code>manuscript</code> または <code>原稿</code> フォルダを作り、その中に原稿ファイルを入れる</li>
        <li>初回セットアップで新規作品を作り、作成された作品フォルダ内の <code>manuscript</code> に原稿ファイルを入れる</li>
      </ul>

      <p class="note">原稿ファイルは <code>.txt</code> または <code>.md</code> を使用してください。</p>
    </section>

    <h2>利用時の補足</h2>

    <ul>
      <li>運用モードは Multi モード がオススメですが、とりあえず触ってみたい場合は Single モード で始めて、あとから変更も可能です。</li>
      <li>縦書きプレビューを使う場合は Node.js 18 LTS 以上が必要です。</li>
      <li>初回セットアップ と もじごとガイド は作品ツリーのヘッダーからいつでも開くことができます。</li>
    </ul>

    <details>
      <summary>既存原稿が文字化けした場合</summary>
      <p class="note">他のエディタから書き出した原稿は <code>Shift JIS</code> の場合があります。</p>
      <ul>
        <li>VS Code右下の文字コード表示、または「エンコード付きで再度開く」から <code>Japanese (Shift JIS)</code> などを選びます。</li>
        <li>正しく読めることを確認してから <code>UTF-8</code> で保存し直してください。</li>
        <li><code>Files: Auto Guess Encoding</code> を有効にすると、文字コードを自動判定できます。</li>
        <li><code>UTF-8 with BOM</code> ではなく、基本的に <code>UTF-8</code> を使用してください。</li>
      </ul>
    </details>
  </main>

  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById("openInitialSetupButton")?.addEventListener("click", () => {
      vscode.postMessage({ command: "openInitialSetup" });
    });

    document.getElementById("openGuideButton")?.addEventListener("click", () => {
      vscode.postMessage({ command: "openGuide" });
    });

    document.getElementById("closeButton")?.addEventListener("click", () => {
      vscode.postMessage({ command: "close" });
    });
  </script>
</body>
</html>`;
}

module.exports = {
  openFirstRunBoardWebview,
};
