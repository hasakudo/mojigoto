const vscode = require("vscode");
const { getNonce, escapeHtml } = require("../core/path-utils");

function getSetupWebviewHtml(webview, initialState = {}) {
  const nonce = getNonce();

  const state = {
    mode: initialState.mode || "single",
    workRoot: initialState.workRoot || "",
    manuscriptRoot: initialState.manuscriptRoot || "",
    defaultExtension: initialState.defaultExtension || ".txt",
    createWorkNow: initialState.createWorkNow ?? true,
    workTitle: initialState.workTitle || "",
    genre: initialState.genre || "",
    targetChars: initialState.targetChars || "",
    deadline: initialState.deadline || "",
    summary: initialState.summary || "",
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>初回セットアップ</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      padding: 20px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }

    .wrap {
      max-width: 960px;
      margin: 0 auto;
    }

    .card {
      border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.35));
      border-radius: 12px;
      padding: 18px;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      margin-bottom: 16px;
    }

    h1 {
      margin: 0 0 10px;
      font-size: 22px;
    }

    h2 {
      margin: 0 0 10px;
      font-size: 17px;
    }

    p {
      line-height: 1.7;
      margin: 0 0 10px;
    }

    .muted {
      font-size: 12px;
      opacity: 0.85;
      line-height: 1.6;
    }

    .stepRow {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 0 0 18px;
    }

    .stepChip {
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.35));
      font-size: 12px;
      opacity: 0.8;
    }

    .stepChip.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      opacity: 1;
    }

    .field {
      margin-bottom: 14px;
    }

    .field label {
      display: block;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .radioList {
      display: grid;
      gap: 10px;
    }

    .radioCard {
      border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.35));
      border-radius: 10px;
      padding: 12px;
    }

    .radioCard input {
      margin-right: 8px;
    }

    .radioTitle {
      font-weight: 700;
    }

    .radioDesc {
      margin-top: 6px;
      font-size: 12px;
      opacity: 0.85;
      line-height: 1.6;
    }

    input[type="text"],
    input[type="number"],
    input[type="date"],
    textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 9px 10px;
      font: inherit;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 8px;
    }

    textarea {
      min-height: 140px;
      resize: vertical;
      line-height: 1.7;
    }

    .infoBox {
      border-left: 4px solid var(--vscode-textLink-foreground);
      padding: 10px 12px;
      background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.08));
      border-radius: 8px;
      line-height: 1.7;
      margin-top: 8px;
    }

    .followList {
      margin: 10px 0 0;
      padding-left: 1.4em;
      line-height: 1.8;
    }

    .followNote {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.08));
      line-height: 1.7;
    }

    .finishBoardTitle {
      margin-bottom: 8px;
    }

    .actions {
      display: flex;
      gap: 10px;
      margin-top: 18px;
      flex-wrap: wrap;
    }

    button {
      padding: 9px 14px;
      font: inherit;
      border-radius: 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
    }

    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .secondary {
      background: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    }

    .status {
      min-height: 1.5em;
      margin-top: 10px;
      font-size: 12px;
      opacity: 0.9;
    }

    .hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>初回セットアップ</h1>
    <p class="muted">最初の設定を順番に行います。あとから変更できる項目もあります。</p>

    <div class="stepRow">
      <div class="stepChip active" data-step-chip="1">1. モード</div>
      <div class="stepChip" data-step-chip="2">2. パス</div>
      <div class="stepChip" data-step-chip="3">3. 拡張子</div>
      <div class="stepChip" data-step-chip="4">4. 作品作成</div>
      <div class="stepChip" data-step-chip="5">5. 入力 / 説明</div>
    </div>

    <section class="card" data-step="1">
      <h2>モードを選択</h2>

      <div class="radioList">
        <label class="radioCard">
          <div>
            <input type="radio" name="mode" value="single" ${state.mode === "single" ? "checked" : ""}>
            <span class="radioTitle">Single モード</span>
          </div>
          <div class="radioDesc">
            1作品を集中的に扱うモードです。ワークスペース内の manuscript をそのまま使います。
          </div>
        </label>

        <label class="radioCard">
          <div>
            <input type="radio" name="mode" value="multi" ${state.mode === "multi" ? "checked" : ""}>
            <span class="radioTitle">Multi モード</span>
          </div>
          <div class="radioDesc">
            複数作品を切り替えながら扱うモードです。workRoot 配下に _WORK/manuscript を作成し、View 用に使います。
          </div>
        </label>
      </div>
    </section>

    <section class="card hidden" data-step="2">
      <h2>保存先・監視先を確認</h2>

      <div class="field" id="singleRootField">
        <label for="manuscriptRoot">manuscriptRoot</label>
        <input id="manuscriptRoot" type="text" value="${escapeHtml(state.manuscriptRoot)}" />
        <div class="muted">Single モードではこのフォルダを原稿の監視先にします。</div>
      </div>

      <div class="field hidden" id="multiRootField">
        <label for="workRoot">workRoot</label>
        <input id="workRoot" type="text" value="${escapeHtml(state.workRoot)}" />
        <div class="muted">Multi モードではこの配下に作品フォルダが並びます。View 用の _WORK/manuscript もここに作成します。</div>
      </div>

      <p class="muted">
        モード変更だけ行う場合は「ここで完了」で保存できます。
      </p>

      <div class="infoBox hidden" id="multiQuickFinishNotice">
        Multi モードで「ここで完了」を押すと、既存作品の選択画面が開きます。作品へ切り替えるか、作品を選択せず従来どおり完了するかを選べます。
      </div>

      <div id="migrationSection" class="hidden">
        <h3>既存データの移行</h3>

        <p>Single の原稿・設定を作品フォルダへ移行できます。</p>

        <label>
          <input type="radio" name="migrate" value="yes">
          移行する
        </label>

        <label>
          <input type="radio" name="migrate" value="no" checked>
          移行しない
        </label>
      </div>

      <div id="migrationNameSection" class="hidden">
        <label>移行先の作品フォルダ名</label>
        <input id="migrationWorkNameInput" type="text" />
      </div>
    </section>

    <section class="card hidden" data-step="3">
      <h2>新規ファイルの拡張子</h2>

      <div class="radioList">
        <label class="radioCard">
          <div>
            <input type="radio" name="defaultExtension" value=".txt" ${state.defaultExtension === ".txt" ? "checked" : ""}>
            <span class="radioTitle">.txt</span>
          </div>
          <div class="radioDesc">プレーンテキストで作成します。</div>
        </label>

        <label class="radioCard">
          <div>
            <input type="radio" name="defaultExtension" value=".md" ${state.defaultExtension === ".md" ? "checked" : ""}>
            <span class="radioTitle">.md</span>
          </div>
          <div class="radioDesc">Markdown 形式で作成します。</div>
        </label>
      </div>

      <div class="infoBox">
        もじごと 自体は .txt / .md の両方に対応しています。ここで選ぶのは新規作成時の初期拡張子です。
      </div>
    </section>

    <section class="card hidden" data-step="4">
      <h2>作品を新規作成しますか？</h2>

      <div class="radioList">
        <label class="radioCard">
          <div>
            <input type="radio" name="createWorkNow" value="yes" ${state.createWorkNow ? "checked" : ""}>
            <span class="radioTitle">はい</span>
          </div>
          <div class="radioDesc">作品名や目標、締切などを入力して初期状態を作成します。</div>
        </label>

        <label class="radioCard">
          <div>
            <input type="radio" name="createWorkNow" value="no" ${!state.createWorkNow ? "checked" : ""}>
            <span class="radioTitle">いいえ</span>
          </div>
          <div class="radioDesc">基本構成だけ作成し、作品情報や原稿はあとから追加します。</div>
        </label>
      </div>
      <div class="infoBox hidden" id="singleCreateOverwriteNotice">
        Single モードで既存の作品設定がある場合、「はい」を選んで完了すると作品設定の内容が新しい入力内容で更新されます。<br>
        既存の設定をそのまま使いたい場合は「いいえ」を選んでください。
      </div>
    </section>

    <section class="card hidden" data-step="5" id="step5Create">
      <h2>作品情報を入力</h2>

      <div class="field">
        <label for="workTitle">作品名</label>
        <input id="workTitle" type="text" value="${escapeHtml(state.workTitle)}" />
      </div>

      <div class="field">
        <label for="genre">ジャンル</label>
        <input id="genre" type="text" value="${escapeHtml(state.genre)}" />
      </div>

      <div class="field">
        <label for="targetChars">目標文字数</label>
        <input id="targetChars" type="number" min="0" step="100" value="${escapeHtml(state.targetChars)}" />
      </div>

      <div class="field">
        <label for="deadline">締切</label>
        <input id="deadline" type="date" value="${escapeHtml(state.deadline)}" />
      </div>

      <div class="field">
        <label for="summary">あらすじ</label>
        <textarea id="summary">${escapeHtml(state.summary)}</textarea>
      </div>

      <div class="infoBox">
        入力した内容はあとから設定画面で変更できます。
      </div>
    </section>

    <section class="card hidden" data-step="5" id="step5Guide">
      <h2>次にやること</h2>

      <div class="infoBox" id="guideBox"></div>
    </section>

    <section class="card hidden" id="setupFollowBoard">
      <h2 class="finishBoardTitle" id="setupFollowTitle">作品を作成しました</h2>

      <p id="setupFollowIntro">次にできること：</p>

      <ul class="followList">
        <li>作品設定を確認する</li>
        <li>原稿ファイルを作成する</li>
        <li>プロット / 資料ノートを作る</li>
        <li>縦書きプレビューを開く</li>
        <li>書き出しメニューを確認する</li>
        <li>ダッシュボードを開く</li>
      </ul>

      <div class="followNote hidden" id="multiFollowNote">
        Multi モードでは、縦書きプレビューやダッシュボードは View 連携中の作品に連動しています。
      </div>
    </section>

    <div class="actions">
      <button class="secondary" id="prevBtn">戻る</button>
      <button class="primary" id="nextBtn">次へ</button>
      <button id="quickFinishBtn" class="secondary hidden">ここで完了</button>
      <button class="primary hidden" id="finishBtn">完了</button>
      <button class="secondary" id="closeBtn">閉じる</button>
    </div>

    <div class="status" id="status"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const initialState = ${JSON.stringify({
      mode: initialState.mode || "single",
      workRoot: initialState.workRoot || "",
      manuscriptRoot: initialState.manuscriptRoot || "",
      defaultExtension: initialState.defaultExtension || ".txt",
      createWorkNow: initialState.createWorkNow ?? true,
      workTitle: initialState.workTitle || "",
      genre: initialState.genre || "",
      targetChars: initialState.targetChars || "",
      deadline: initialState.deadline || "",
      summary: initialState.summary || "",
      singleMigrationAvailable: !!initialState.singleMigrationAvailable,
    })};

    const recommendedRoots = ${JSON.stringify({
      single: {
        workRoot: "",
        manuscriptRoot: initialState.singleRecommendedManuscriptRoot || "",
      },
      multi: {
        workRoot: initialState.multiRecommendedWorkRoot || "",
        manuscriptRoot: initialState.multiRecommendedManuscriptRoot || "",
      },
    })};

    let migrateSingle = false;
    let migrationWorkName = "";

    let currentStep = 1;
    const maxStep = 5;

    const statusEl = document.getElementById("status");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const quickFinishBtn = document.getElementById("quickFinishBtn");
    const finishBtn = document.getElementById("finishBtn");
    const closeBtn = document.getElementById("closeBtn");

    const setupFollowBoard = document.getElementById("setupFollowBoard");
    const multiFollowNote = document.getElementById("multiFollowNote");

    let setupFinished = false;

    const workRootInput = document.getElementById("workRoot");
    const manuscriptRootInput = document.getElementById("manuscriptRoot");
    const singleRootField = document.getElementById("singleRootField");
    const multiRootField = document.getElementById("multiRootField");
    const migrationSection = document.getElementById("migrationSection");
    const migrationNameSection = document.getElementById("migrationNameSection");
    const migrationWorkNameInput = document.getElementById("migrationWorkNameInput");
    const singleCreateOverwriteNotice = document.getElementById("singleCreateOverwriteNotice");
    const multiQuickFinishNotice = document.getElementById("multiQuickFinishNotice");

    function setStatus(message) {
      statusEl.textContent = message || "";
    }

    function getMode() {
      return document.querySelector('input[name="mode"]:checked')?.value || "single";
    }

    function getDefaultExtension() {
      return document.querySelector('input[name="defaultExtension"]:checked')?.value || ".txt";
    }

    function getCreateWorkNow() {
      return (document.querySelector('input[name="createWorkNow"]:checked')?.value || "yes") === "yes";
    }

    function getMigrateSingle() {
      return (document.querySelector('input[name="migrate"]:checked')?.value || "no") === "yes";
    }

    function applyRecommendedRoots(force = false) {
      const mode = getMode();

      if (mode === "multi") {
        if (workRootInput && (force || !workRootInput.value.trim())) {
          workRootInput.value = recommendedRoots.multi.workRoot || "";
        }
        if (manuscriptRootInput && (force || !manuscriptRootInput.value.trim())) {
          manuscriptRootInput.value = recommendedRoots.multi.manuscriptRoot || "";
        }
        return;
      }

      if (workRootInput && force) {
        workRootInput.value = "";
      }
      if (manuscriptRootInput && (force || !manuscriptRootInput.value.trim())) {
        manuscriptRootInput.value = recommendedRoots.single.manuscriptRoot || "";
      }
    }

    function collectPayload() {
      const mode = getMode();
      const createWorkNow = getCreateWorkNow();

      return {
        mode,
        manuscriptRoot:
          mode === "single"
            ? (manuscriptRootInput?.value?.trim() || "")
            : (recommendedRoots.multi.manuscriptRoot || ""),
        workRoot:
          mode === "multi"
            ? (workRootInput?.value?.trim() || "")
            : "",
        defaultExtension: getDefaultExtension(),
        createWorkNow,
        work: {
          title: document.getElementById("workTitle")?.value?.trim() || "",
          genre: document.getElementById("genre")?.value?.trim() || "",
          targetChars: Number(document.getElementById("targetChars")?.value || 0) || 0,
          deadline: document.getElementById("deadline")?.value || "",
          summary: document.getElementById("summary")?.value || "",
        },
        migrateSingleToMulti: getMigrateSingle(),
        migrationWorkName: migrationWorkNameInput?.value?.trim() || "",
      };
    }

    function collectQuickFinishPayload() {
      const payload = collectPayload();
      return {
        ...payload,
        createWorkNow: false,
        selectExistingWork:
          payload.mode === "multi" && !payload.migrateSingleToMulti,
        work: {
          title: "",
          genre: "",
          targetChars: 0,
          deadline: "",
          summary: "",
        },
      };
    }

    function validateStep(step) {
      const payload = collectPayload();

      if (step === 2) {
        if (payload.mode === "single" && !payload.manuscriptRoot) {
          setStatus("manuscriptRoot を入力してください。");
          return false;
        }
        if (payload.mode === "multi" && !payload.workRoot) {
          setStatus("workRoot を入力してください。");
          return false;
        }

        if (payload.mode === "multi" && payload.migrateSingleToMulti && !payload.migrationWorkName) {
          setStatus("移行先の作品フォルダ名を入力してください。");
          return false;
        }
      }

      if (step === 5 && payload.createWorkNow) {
        if (!payload.work.title) {
          setStatus("作品名を入力してください。");
          return false;
        }
      }

      setStatus("");
      return true;
    }

    function showSetupFollowBoard(result) {
      setupFinished = true;

      document.querySelectorAll("[data-step]").forEach((el) => {
        el.classList.add("hidden");
      });

      document.querySelectorAll("[data-step-chip]").forEach((chip) => {
        chip.classList.remove("active");
      });

      setupFollowBoard?.classList.remove("hidden");

      const followTitle = document.getElementById("setupFollowTitle");
      const followIntro = document.getElementById("setupFollowIntro");
      const followList = setupFollowBoard?.querySelector(".followList");
      const needsCreateWork = !!result?.needsCreateWork;

      if (needsCreateWork) {
        if (followTitle) followTitle.textContent = "セットアップが完了しました";
        if (followIntro) {
          followIntro.textContent = "連携中の作品はまだありません。次の操作を行ってください。";
        }
        if (followList) {
          followList.innerHTML = [
            "<li>作品ツリーの「新規作品」から作品を作成する</li>",
            "<li>作成した作品の <strong>manuscript</strong> に原稿ファイルを入れる</li>",
            "<li>作品切り替えで、縦書きプレビューやダッシュボードの対象作品を確認する</li>"
          ].join("");
        }
      }

      const isMulti = result?.mode === "multi";
      multiFollowNote?.classList.toggle("hidden", !isMulti);

      prevBtn.classList.add("hidden");
      nextBtn.classList.add("hidden");
      quickFinishBtn.classList.add("hidden");
      finishBtn.classList.add("hidden");

      closeBtn.textContent = "閉じる";

      setStatus("");
    }

    function updateSingleCreateOverwriteNotice() {
      const mode = getMode();
      const createWorkNow = getCreateWorkNow();

      singleCreateOverwriteNotice?.classList.toggle(
        "hidden",
        !(currentStep === 4 && mode === "single" && createWorkNow),
      );
    }

    function updateStepVisibility() {
      const mode = getMode();
      const createWorkNow = getCreateWorkNow();
      const isSingleToMulti =
        initialState.mode === "single" && mode === "multi";
      const canMigrateSingle =
        isSingleToMulti && !!initialState.singleMigrationAvailable;
      const migrateNow = canMigrateSingle && getMigrateSingle();

      migrationSection.classList.toggle("hidden", !canMigrateSingle);
      migrationNameSection.classList.toggle("hidden", !migrateNow);
      multiQuickFinishNotice?.classList.toggle(
        "hidden",
        !(currentStep === 2 && mode === "multi" && !migrateNow),
      );

      document.querySelectorAll("[data-step]").forEach((el) => {
        el.classList.add("hidden");
      });

      document.querySelectorAll("[data-step-chip]").forEach((chip) => {
        chip.classList.remove("active");
      });

      document.querySelector('[data-step-chip="' + currentStep + '"]')?.classList.add("active");

      if (currentStep < 5) {
        document.querySelector('[data-step="' + currentStep + '"]')?.classList.remove("hidden");
      } else {
        if (createWorkNow) {
          document.getElementById("step5Create").classList.remove("hidden");
          document.getElementById("step5Guide").classList.add("hidden");
        } else {
          document.getElementById("step5Create").classList.add("hidden");
          document.getElementById("step5Guide").classList.remove("hidden");

          const guideBox = document.getElementById("guideBox");
          if (mode === "single") {
            guideBox.innerHTML = [
              "Single モードの初期構成を作成します。<br>",
              "作成された <strong>manuscript</strong> に既存の章フォルダや原稿ファイルを入れてください。<br>",
              "設定・プロット・資料はあとから作品ツリーから作成・編集できます。"
            ].join("");
          } else {
            guideBox.innerHTML = [
              "Multi モードの初期構成を作成します。<br>",
              "<strong>_WORK/manuscript</strong> は View 用として自動作成されます。<br>",
              "既存の作品フォルダがある場合は、その中に <strong>manuscript</strong> を作成して原稿を入れてください。<br>",
              "もじごと の作品切り替えで、プレビュー対象作品を変更できます。"
            ].join("");
          }
        }
      }

      singleRootField.classList.toggle("hidden", mode !== "single");
      multiRootField.classList.toggle("hidden", mode !== "multi");

      if (currentStep === 2) {
        applyRecommendedRoots(false);
      }

      prevBtn.disabled = currentStep === 1;
      nextBtn.classList.toggle("hidden", currentStep === maxStep);
      finishBtn.classList.toggle("hidden", currentStep !== maxStep);
      quickFinishBtn.classList.toggle("hidden", currentStep !== 2);

      updateSingleCreateOverwriteNotice();
    }

    function goNext() {
      if (!validateStep(currentStep)) return;
      if (currentStep < maxStep) {
        currentStep += 1;
        updateStepVisibility();
      }
    }

    function goPrev() {
      if (currentStep > 1) {
        currentStep -= 1;
        setStatus("");
        updateStepVisibility();
      }
    }

    prevBtn.addEventListener("click", goPrev);
    nextBtn.addEventListener("click", goNext);

    finishBtn.addEventListener("click", () => {
      if (!validateStep(currentStep)) return;

      vscode.postMessage({
        type: "finish",
        payload: collectPayload(),
      });

      setStatus("セットアップを実行中...");
    });

    quickFinishBtn.addEventListener("click", () => {
      if (!validateStep(currentStep)) return;

      vscode.postMessage({
        type: "finish",
        payload: collectQuickFinishPayload(),
      });

      setStatus("セットアップを実行中...");
    });

    closeBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "close" });
    });

    document.querySelectorAll('input[name="mode"]').forEach((el) => {
      el.addEventListener("change", () => {
        applyRecommendedRoots(true);
        setStatus("");
        updateStepVisibility();
      });
    });

    document.querySelectorAll('input[name="createWorkNow"]').forEach((el) => {
      el.addEventListener("change", () => {
        setStatus("");
        updateStepVisibility();
      });
    });

    document.querySelectorAll("input[name='migrate']").forEach((el) => {
      el.addEventListener("change", () => {
        setStatus("");
        updateStepVisibility();
      });
    });

    migrationWorkNameInput?.addEventListener("input", () => {
      setStatus("");
    });

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === "error") {
        setStatus(msg.message || "セットアップに失敗しました。");
        return;
      }

      if (msg.type === "setupCancelled") {
        setStatus(msg.message || "作品の選択をキャンセルしました。");
        return;
      }

      if (msg.type === "setupFollow") {
        showSetupFollowBoard(msg.result || {});
        return;
      }
    });

    applyRecommendedRoots(false);
    updateStepVisibility();
  </script>
</body>
</html>`;
}

async function openInitialSetupWebview(context, initialState, onFinish) {
  const panel = vscode.window.createWebviewPanel(
    "mojigoto.initialSetup",
    "もじごと 初回セットアップ",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    },
  );

  panel.webview.html = getSetupWebviewHtml(panel.webview, initialState);

  panel.webview.onDidReceiveMessage(
    async (message) => {
      try {
        if (message?.type === "close") {
          panel.dispose();
          return;
        }

        if (message?.type === "finish") {
          const result = await onFinish(message.payload || {});

          if (result?.cancelled) {
            panel.webview.postMessage({
              type: "setupCancelled",
              message: result.message || "作品の選択をキャンセルしました。",
            });
            return;
          }

          if (result?.createdWork || result?.needsCreateWork) {
            panel.webview.postMessage({
              type: "setupFollow",
              result,
            });
            return;
          }

          panel.dispose();
          return;
        }
      } catch (e) {
        panel.webview.postMessage({
          type: "error",
          message: `初回セットアップに失敗しました: ${String(e)}`,
        });
      }
    },
    null,
    context.subscriptions,
  );

  return panel;
}

module.exports = {
  openInitialSetupWebview,
};
