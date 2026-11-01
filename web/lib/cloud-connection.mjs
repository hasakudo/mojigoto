// Connection preferences and startup sequencing; auth and UI effects are injected.
export function createAutoConnectionController({
  state, elements, localStorage, sessionStorage, AUTO_CONNECT_KEY,
  workCatalogOwner, readJson, cloudAuth, cloudLabel, notify,
}) {
  function autoConnectStorageKey() {
    return `${AUTO_CONNECT_KEY}.${workCatalogOwner()}`;
  }

  function readAutoConnectPreference() {
    try {
      const saved = readJson(localStorage.getItem(autoConnectStorageKey()));
      return { enabled: saved?.enabled === true,
        cloudKind: ["oneDrive", "googleDrive", "dropbox"].includes(saved?.cloudKind) ? saved.cloudKind : state.cloudKind };
    } catch { return { enabled: false, cloudKind: state.cloudKind }; }
  }

  function saveAutoConnectPreference(enabled, cloudKind = state.cloudKind) {
    try { localStorage.setItem(autoConnectStorageKey(), JSON.stringify({ enabled, cloudKind })); }
    catch { notify("自動接続の設定をこのブラウザに保存できませんでした。", true); }
    elements.autoConnectCheckbox.checked = enabled;
  }

  function rememberConnectedCloud() {
    saveAutoConnectPreference(elements.autoConnectCheckbox.checked, state.cloudKind);
    sessionStorage.removeItem(`${autoConnectStorageKey()}.attempt`);
  }

  async function reconnectPreviousCloud() {
    const preference = readAutoConnectPreference();
    if (!preference.enabled) return false;
    const auth = cloudAuth(state.cloudKind);
    if (!auth?.clientId || await auth.getAccessToken()) return false;
    // GIS token renewal needs a user gesture. Valid tokens are restored above.
    if (state.cloudKind === "googleDrive") return false;
    const attemptKey = autoConnectStorageKey() + ".attempt";
    const attempted = readJson(sessionStorage.getItem(attemptKey));
    // 認証をキャンセルした後や失敗後にリダイレクトを繰り返さない。
    if (attempted?.cloudKind === state.cloudKind && Date.now() - attempted.startedAt < 10 * 60 * 1000) return false;
    sessionStorage.setItem(attemptKey, JSON.stringify({ cloudKind: state.cloudKind, startedAt: Date.now() }));
    elements.authBootMessage.textContent = `前回の${cloudLabel()}へ接続しています…`;
    try {
      await auth.signIn();
      return true;
    } catch (error) {
      notify(`自動接続を完了できませんでした。${cloudLabel()}の接続ボタンから再接続してください。${error.message || ""}`, true);
      return false;
    }
  }
  return { autoConnectStorageKey, readAutoConnectPreference, saveAutoConnectPreference, rememberConnectedCloud, reconnectPreviousCloud };
}

export function createConnectionInitializer({
  state, elements, sessionStorage, PENDING_RECENT_VIEW_KEY,
  measureConnectionStep, loadRuntimeConfig, initializeUserAccess,
  readAutoConnectPreference, startUserAccessMonitor, configureAuth,
  workCatalogOwner, activateCloud, renderRecentViews, finishAuthBoot,
  readJson, isRecentViewEntry, cloudAuth, restoreRecentView, finishViewRestoreLoading,
  reconnectPreviousCloud, renderConnectedCloud, loadWorks, showFolder, notify,
}) {
  async function initializeConnection() {
    state.runtimeConfig = await measureConnectionStep("接続・公開設定", loadRuntimeConfig);
    if (!await measureConnectionStep("接続・利用者認証", initializeUserAccess)) return;
    const preference = readAutoConnectPreference();
    elements.autoConnectCheckbox.checked = preference.enabled;
    if (preference.enabled) state.cloudKind = preference.cloudKind;
    startUserAccessMonitor();
    const { microsoftClientId, googleClientId } = configureAuth();
    let connectionProvider = state.provider;
    let connectionCloud = state.cloudKind;
    const connectionOwner = workCatalogOwner();
    const isCurrentConnection = () => connectionProvider === state.provider
      && connectionCloud === state.cloudKind && connectionOwner === workCatalogOwner();
    const activateConnectionCloud = (kind) => {
      activateCloud(kind);
      connectionProvider = state.provider;
      connectionCloud = state.cloudKind;
    };
    const measureStep = async (label, operation) => {
      if (!isCurrentConnection()) throw new Error("接続先が切り替わりました。");
      const result = await measureConnectionStep(label, operation);
      if (!isCurrentConnection()) throw new Error("接続先が切り替わりました。");
      return result;
    };
    renderRecentViews();
    finishAuthBoot();
    const checkingMessage = "クラウド接続を確認しています…";
    elements.connectionDescription.textContent = checkingMessage;
    if (!microsoftClientId) {
      elements.connectionDescription.textContent = state.managedDeployment
        ? "管理者によるOneDrive接続設定が完了していません。"
        : "先にMicrosoft アプリIDを設定してください。";
      elements.connectButton.textContent = state.managedDeployment ? "OneDrive設定なし" : "接続設定を開く";
      elements.connectButton.disabled = state.managedDeployment;
    }
  
    try {
      const dropboxRedirect = state.dropboxAuth.clientId ? await measureStep("接続・Dropbox認証応答", () => state.dropboxAuth.completeRedirect()) : false;
      if (dropboxRedirect) activateConnectionCloud("dropbox");
      else if (microsoftClientId && await measureStep("接続・OneDrive認証応答", () => state.microsoftAuth.completeRedirect())) activateConnectionCloud("oneDrive");
      const pending = readJson(sessionStorage.getItem(PENDING_RECENT_VIEW_KEY));
      sessionStorage.removeItem(PENDING_RECENT_VIEW_KEY);
      if (pending?.owner === workCatalogOwner() && isRecentViewEntry(pending.entry)
        && await cloudAuth(pending.entry.cloudKind)?.getAccessToken()) {
        if (!isCurrentConnection()) return;
        try {
          await measureConnectionStep("接続・履歴復元", () => restoreRecentView(pending.entry));
        } finally {
          // History restoration intentionally activates its saved cloud provider.
          if (state.cloudKind === pending.entry.cloudKind && connectionOwner === workCatalogOwner()) {
            connectionProvider = state.provider;
            connectionCloud = state.cloudKind;
          }
        }
        finishViewRestoreLoading();
        return;
      }
      if (!isCurrentConnection()) return;
      const redirecting = await reconnectPreviousCloud();
      if (!isCurrentConnection() || redirecting) return;
      if (state.cloudKind === "dropbox" && await measureStep("接続・Dropboxトークン", () => state.dropboxAuth.getAccessToken())) {
        renderConnectedCloud();
        if (state.workRoot?.id) await loadWorks(state.workRoot);
        else {
          const root = await measureStep("接続・クラウドルート", () => state.provider.getRoot());
          state.folderTrail = [root];
          await showFolder(root, [root]);
          finishViewRestoreLoading();
        }
        return;
      }
      if (state.cloudKind === "dropbox") {
        elements.connectionDescription.textContent = "Dropboxへ接続して作品フォルダを選んでください。";
        finishViewRestoreLoading();
        return;
      }
      const googleToken = state.cloudKind === "googleDrive" && googleClientId ? await measureStep("接続・Google Driveトークン", () => state.googleDriveAuth.getAccessToken()) : "";
      const microsoftToken = state.cloudKind === "oneDrive" && microsoftClientId ? await measureStep("接続・OneDriveトークン", () => state.microsoftAuth.getAccessToken()) : "";
      if (state.cloudKind === "googleDrive" && googleToken) {
        activateConnectionCloud("googleDrive");
        renderConnectedCloud();
        if (state.workRoot?.id) await loadWorks(state.workRoot);
        else {
          elements.connectionDescription.textContent = state.googleDrivePicker?.configured
            ? "Google Driveと接続しました。作品フォルダを選んでください。"
            : "Google Driveと接続しました。管理者によるフォルダ選択設定が必要です。";
          finishViewRestoreLoading();
        }
        return;
      }
      if (state.cloudKind === "googleDrive") {
        elements.connectionDescription.textContent = preference.enabled
          ? "前回の接続先はGoogle Driveです。有効な接続がないため、「Google Driveに再接続」を押してください。"
          : "Google Driveへの接続が必要です。Google Driveに接続ボタンから続けてください。";
        if (preference.enabled && elements.connectGoogleDriveButton) {
          elements.connectGoogleDriveButton.hidden = false;
          elements.connectGoogleDriveButton.disabled = false;
          elements.connectGoogleDriveButton.textContent = "Google Driveに再接続";
        }
        finishViewRestoreLoading();
        return;
      }
      if (!microsoftToken) {
        finishViewRestoreLoading();
        return;
      }
      activateConnectionCloud("oneDrive");
      // Files.ReadWrite does not grant Microsoft Graph /me profile access.
      // Go directly to OneDrive so the app does not require the unrelated
      // User.Read permission just to show an account name.
      renderConnectedCloud();
      if (state.workRoot?.id) await loadWorks(state.workRoot);
      else {
        const root = await measureStep("接続・クラウドルート", () => state.provider.getRoot());
        root.name = "OneDrive";
        state.folderTrail = [root];
        await showFolder(root, [root]);
        finishViewRestoreLoading();
      }
    } catch (error) {
      if (!isCurrentConnection()) return;
      finishViewRestoreLoading();
      notify(error.message || String(error), true);
    } finally {
      if (isCurrentConnection() && elements.connectionDescription.textContent === checkingMessage) {
        elements.connectionDescription.textContent = "クラウドを選んで接続してください。";
      }
    }
  }
  return { initializeConnection };
}
