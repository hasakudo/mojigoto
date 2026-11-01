import { bindProjectFolderDrop } from "./lib/project-folder-drop.mjs";
import { GoogleDriveAuth } from "./auth/google-drive.mjs?v=1.0.1";
import { GoogleDriveProvider } from "./storage/google-drive-provider.mjs?v=1.0.4";
import { GoogleDrivePicker } from "./storage/google-drive-picker.mjs?v=1.0.161";
import { loadRuntimeConfig, resolveGoogleClientId } from "./lib/runtime-config.mjs";
import { UserAuthClient } from "./lib/user-auth.mjs";
import { discoverWorks } from "./lib/work-discovery.mjs";
import { planGoogleDriveImport, importGoogleDriveProject, googleDriveImportFolderName } from "./lib/google-drive-import.mjs?v=1.0.148";
import { initSetupHeader } from "./lib/setup-header.mjs?v=1.0.156";
import { initSetupHelp } from "./lib/setup-help.mjs?v=1.0.0";

const el = (id) => document.getElementById(id);
const ROOT_KEY = "mojigoto.googleDrive.workRoot";
const PENDING_KEY = "mojigoto.googleDrive.setupPending";
const FOLDER_MIME = "application/vnd.google-apps.folder";
let auth, provider, picker, plan, candidate, queue = [], visited = new Set();
let busy = false, connected = false, completedRoot = null, importController = null;
let excludedFolders = new Map();
let localImportFiles = null, localImportReading = false, folderDrop = null;
let returnToPermissionActions = false;
const status = (message, kind = "info") => {
  el("setupStatus").textContent = message;
  el("setupPermissionStatus").textContent = candidate ? message : "";
  el("setupNotice").hidden = Boolean(candidate);
  el("setupNotice").dataset.kind = kind;
  el("setupPermissionNotice").dataset.kind = kind;
  const notice = el("setupActionNotice");
  if (["error", "success"].includes(kind) && (kind === "error" || notice.hidden || notice.dataset.kind !== "error")) {
    el("setupActionNoticeText").textContent = message;
    notice.dataset.kind = kind;
    notice.setAttribute("role", kind === "error" ? "alert" : "status");
    notice.hidden = false;
  }
};
el("setupActionNoticeClose").addEventListener("click", () => { el("setupActionNotice").hidden = true; });
const header = initSetupHeader({
  isBusy: () => busy,
  onStatus: status,
  onDisconnect: async () => {
    if (!auth) return;
    await auth.signOut();
    await updateConnection();
    updatePermissions();
    status("Google Driveの接続を解除しました。再接続すると続きから操作できます。");
  },
});
header.setConnected(false);
const setupHelp = initSetupHelp();
function jumpToSetupSection(id) {
  const section = el(id);
  if (!section || section.hidden) return;
  if (setupHelp.contains(section)) { setupHelp.open(id); return; }
  setupHelp.close();
  if (section.tagName === "DETAILS") section.open = true;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}
document.querySelectorAll("[data-setup-jump]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    jumpToSetupSection(link.dataset.setupJump);
  });
});
async function updateConnection() {
  connected = Boolean(await auth.getAccessToken());
  header.setConnected(connected);
  const registered = savedRoot()?.googleDriveScope === auth.scope;
  el("setupUnregister").disabled = !savedRoot()?.id;
  el("setupRegistered").hidden = !registered || Boolean(candidate) || Boolean(completedRoot);
  el("setupRegisteredSummary").textContent = registered ? `Driveの「${savedRoot().name}」を登録済みです。` : "";
  el("setupImportDetails").open = !registered || Boolean(plan);
  el("setupChoices").hidden = Boolean(candidate);
  el("setupConnect").hidden = connected;
  el("setupReconnectLink").hidden = connected;
  el("setupOpen").hidden = savedRoot()?.googleDriveScope !== auth.scope;
  el("setupOpen").disabled = !connected;
  el("setupExisting").disabled = !connected;
  el("setupRestore").disabled = !connected;
  el("setupSwitchRoot").disabled = !connected;
  el("setupLocalFiles").disabled = !connected;
  folderDrop?.updateAvailability();
  el("setupAdditional").disabled = !connected || !savedRoot()?.id;
  el("setupImport").disabled = !connected || !plan || localImportReading;
}
function savedRoot() {
  try { return JSON.parse(localStorage.getItem(ROOT_KEY) || "null"); } catch { return null; }
}
function updatePermissions() {
  el("setupPermissions").hidden = !candidate;
  el("setupReturnToPermissions").hidden = !candidate;
  if (candidate || completedRoot) el("setupRegistered").hidden = true;
  if (auth) el("setupChoices").hidden = Boolean(candidate);
  el("setupFolderLabel").textContent = queue.length ? `選択待ちフォルダ: ${queue[0].name}` : "フォルダの選択が完了しました。";
  el("setupQueueLabel").textContent = queue.length ? `選択待ちフォルダ：残り ${queue.length} フォルダ` : "選択待ちのフォルダはありません。";
  el("setupQueueList").replaceChildren(...queue.map((folder, index) => {
    const row = document.createElement("li");
    row.textContent = `${index === 0 ? "次を選ぶ：" : "この後に次を選ぶ："}${folder.name}`;
    if (index === 0) row.className = "setup-queue-next";
    return row;
  }));
  el("setupQueueHelp").hidden = !queue.length;
  el("setupGrant").disabled = !connected || !queue.length;
  el("setupEmpty").disabled = !connected || !queue.length;
  el("setupExclude").disabled = !connected || !queue.length || queue[0].id === candidate?.id;
  el("setupExcluded").hidden = !excludedFolders.size;
  el("setupExcludedList").replaceChildren(...[...excludedFolders.values()].map((folder) => {
    const row = document.createElement("li");
    row.textContent = folder.name;
    return row;
  }));
  el("setupFinish").disabled = !connected || !candidate || queue.length > 0 || !el("setupConfirmed").checked;
  el("setupFinishHint").textContent = !connected
    ? "Google Driveに接続し直すと、この続きから操作できます。"
    : queue.length ? "未処理のフォルダが残っています。追加の許可がすべて終わると登録できます。空として進む操作は本当に空のフォルダにだけ使ってください。"
    : !el("setupConfirmed").checked ? "必要なファイルをすべて許可できたら、上の確認にチェックを入れてください。" : "登録して作品を開けます。";
  if (candidate) sessionStorage.setItem(PENDING_KEY, JSON.stringify({ candidate, queue, visited: [...visited], excludedFolders: [...excludedFolders.values()] }));
}
async function run(action) {
  if (busy) return;
  folderDrop?.cancel();
  busy = true;
  folderDrop?.updateAvailability();
  const controls = [...document.querySelectorAll("button, input")]
    .filter((control) => !control.matches("[data-setup-help], #setupHelpClose, #setupActionNoticeClose"));
  const disabled = controls.map((control) => control.disabled);
  controls.forEach((control) => { control.disabled = true; });
  try { await action(); } catch (error) { status(error.message || String(error), importController?.signal.aborted ? "info" : "error"); }
  finally {
    busy = false;
    importController = null;
    el("setupCancelImport").hidden = true;
    controls.forEach((control, index) => { control.disabled = disabled[index]; });
    if (auth) {
      await updateConnection();
    }
    updatePermissions();
    if (returnToPermissionActions) {
      returnToPermissionActions = false;
      el("setupPermissionActions").scrollIntoView({ block: "start", behavior: "instant" });
    }
  }
}
async function token() {
  const value = await auth.getAccessToken();
  if (!value) throw new Error("Google Driveへの接続期限が切れました。接続ボタンからもう一度接続してください。");
  return value;
}
function startPermissions(root) {
  candidate = root;
  queue = [{ id: root.id, name: root.name }];
  visited = new Set();
  excludedFolders = new Map((savedRoot()?.id === root.id ? savedRoot().excludedFolders || [] : []).map((folder) => [folder.id, folder]));
  el("setupConfirmed").checked = false;
  updatePermissions();
  el("setupChoices").hidden = true;
  el("setupComplete").hidden = true;
  completedRoot = null;
  status("このフォルダの中身を選択して許可してください。子フォルダも順番に案内します。");
  el("setupPermissions").scrollIntoView({ behavior: "smooth" });
}
async function finishRoot(root) {
  const works = await discoverWorks(provider, root);
  if (!works.length) throw new Error("作品を確認できませんでした。「Driveにある既存作品をそのまま使う」から、原稿フォルダと .mojigoto の追加許可を確認してください。現在の作品登録とDrive内のデータは変更していません。");
  const exclusions = candidate?.id === root.id ? [...excludedFolders.values()] : savedRoot()?.id === root.id ? savedRoot().excludedFolders || [] : [];
  localStorage.setItem(ROOT_KEY, JSON.stringify({ ...root, googleDriveScope: auth.scope, excludedFolders: exclusions }));
  localStorage.setItem("mojigoto.cloud.kind", "googleDrive");
  for (const name of ["characterCounts", "settingsSummaries", "sharedMetrics", "metricSummaries", "catalog"]) {
    localStorage.removeItem(`mojigoto.works.${name}.v1.googleDrive`);
  }
  candidate = null;
  queue = [];
  sessionStorage.removeItem(PENDING_KEY);
  completedRoot = root;
  el("setupComplete").hidden = false;
  el("setupCompleteSummary").textContent = `Driveの「${root.name}」を登録しました。下のボタンからHOMEへ戻ってください。`;
  el("setupImportProgress").textContent = "";
  el("setupProgressBox").hidden = true;
  status("作品の登録が完了しました。", "success");
  el("setupComplete").scrollIntoView({ behavior: "smooth" });
}
el("setupHome").addEventListener("click", () => location.assign("./"));
el("setupPause").addEventListener("click", () => {
  if (busy) return;
  location.assign("./");
});
el("setupReset").addEventListener("click", () => run(async () => {
  if (!confirm("この画面の選択・登録手順をリセットします。Driveのデータ・許可・登録済み作品は残ります。よろしいですか？")) return;
  candidate = null; queue = []; visited = new Set(); plan = null; completedRoot = null;
  excludedFolders = new Map();
  sessionStorage.removeItem(PENDING_KEY);
  folderDrop?.cancel();
  localImportFiles = null;
  el("setupLocalSelection").textContent = "";
  el("setupLocalFiles").value = "";
  el("setupConfirmed").checked = false;
  el("setupImportSummary").textContent = "";
  el("setupImportProgress").textContent = "";
  el("setupProgressBox").hidden = true;
  el("setupComplete").hidden = true;
  status("選択・登録手順をリセットしました。作品フォルダを選び直せます。");
}));
el("setupUnregister").addEventListener("click", () => { setupHelp.close(); return run(async () => {
  const root = savedRoot();
  if (!root?.id || !confirm(`「${root.name}」の作品フォルダ登録をこのブラウザから解除します。途中の登録手順・除外設定・このフォルダの閲覧履歴も消します。DriveのデータとGoogleへの接続許可は変更しません。よろしいですか？`)) return;
  localStorage.removeItem(ROOT_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  for (const name of ["characterCounts", "settingsSummaries", "sharedMetrics", "metricSummaries", "catalog"]) {
    localStorage.removeItem(`mojigoto.works.${name}.v1.googleDrive`);
  }
  const historyKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key) => key?.startsWith("mojigoto.web.recentViews.v1.") || key?.startsWith("mojigoto.web.workRecentViews.v1."));
  for (const key of historyKeys) {
    try {
      const entries = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(entries)) localStorage.setItem(key, JSON.stringify(entries.filter((entry) => entry.cloudKind !== "googleDrive" || entry.root?.id !== root.id)));
    } catch { /* Unrelated or malformed history must not prevent unregistering. */ }
  }
  const pendingHistoryKey = "mojigoto.web.pendingRecentView.v1";
  try {
    const pendingHistory = JSON.parse(sessionStorage.getItem(pendingHistoryKey));
    if (pendingHistory?.entry?.cloudKind === "googleDrive" && pendingHistory.entry.root?.id === root.id) sessionStorage.removeItem(pendingHistoryKey);
  } catch {}
  candidate = null; queue = []; visited = new Set(); plan = null; completedRoot = null;
  excludedFolders = new Map();
  folderDrop?.cancel();
  localImportFiles = null;
  el("setupLocalSelection").textContent = "";
  el("setupLocalFiles").value = "";
  el("setupConfirmed").checked = false;
  el("setupImportSummary").textContent = "";
  el("setupImportProgress").textContent = "";
  el("setupProgressBox").hidden = true;
  el("setupComplete").hidden = true;
  status("作品フォルダの登録を解除しました。PCから取り込むか、Driveにある別の作品フォルダを選んで登録してください。");
  el("setupConnection").scrollIntoView({ block: "start", behavior: "smooth" });
}); });
el("setupCancelImport").addEventListener("click", () => {
  if (!importController) return;
  importController.abort();
  el("setupCancelImport").disabled = true;
  status("中断を受け付けました。現在のファイルの送信が終わったら停止します。取り込み済みのデータはDriveに残ります。");
});
const connectDrive = () => run(async () => {
  await auth.signIn();
  status("Google Driveに接続しました。作品の保存場所を選んでください。");
  await requestedAdditional();
});
el("setupConnect").addEventListener("click", connectDrive);
el("setupReconnectLink").addEventListener("click", connectDrive);
el("setupOpen").addEventListener("click", () => run(async () => {
  await token();
  localStorage.setItem("mojigoto.cloud.kind", "googleDrive");
  location.assign("./");
}));
el("setupExisting").addEventListener("click", () => run(async () => {
  const picked = await picker.pickFolder(await token());
  if (!picked) return;
  const root = await provider.getItemMetadata(picked);
  if (!root.folder) throw new Error("作品フォルダを選択してください。");
  startPermissions(root);
}));
const switchRegisteredRoot = () => run(async () => {
  const picked = await picker.pickFolder(await token());
  if (!picked) return;
  const root = await provider.getItemMetadata(picked);
  if (!root.folder) throw new Error("許可済みの作品フォルダを選択してください。");
  status("許可済みの作品を確認しています。ファイルの再取り込みは行いません。");
  await finishRoot(root);
  el("setupCompleteSummary").textContent = `Driveの「${root.name}」へ切り替え・登録復元しました。HOMEから許可済みの作品を開けます。`;
  status("許可済みの作品フォルダを登録しました。PCで新しく追加したファイルには、別途許可が必要です。", "success");
});
el("setupRestore").addEventListener("click", switchRegisteredRoot);
el("setupSwitchRoot").addEventListener("click", switchRegisteredRoot);
el("setupAdditional").addEventListener("click", () => run(async () => {
  await token();
  const root = await provider.getItemMetadata(savedRoot());
  startPermissions(root);
}));
async function requestedAdditional() {
  if (new URLSearchParams(location.search).get("mode") !== "additional" || candidate || !savedRoot()?.id || !await auth.getAccessToken()) return;
  startPermissions(await provider.getItemMetadata(savedRoot()));
}
el("setupGrant").addEventListener("click", () => run(async () => {
  const current = queue[0];
  if (!current) return;
  status("Googleのファイル選択画面を開いています…");
  let picked;
  try { picked = await picker.pickItems(await token(), { parentId: current.id }); }
  finally { returnToPermissionActions = true; }
  if (!picked) { status("選択をキャンセルしました。このフォルダから再開できます。"); return; }
  status("選択したファイルの許可を確認しています…");
  const items = [];
  for (const item of picked) {
    const metadata = await provider.getItemMetadata(item);
    if (!metadata.parents?.includes(current.id)) throw new Error("案内中のフォルダ直下の項目を選択してください。子フォルダの中身は次の手順で案内します。");
    items.push(metadata);
  }
  visited.add(current.id);
  queue.shift();
  for (const item of items) {
    if (item.mimeType === FOLDER_MIME && !visited.has(item.id) && !excludedFolders.has(item.id) && !queue.some((folder) => folder.id === item.id)) queue.push({ id: item.id, name: `${current.name}/${item.name}` });
  }
  status(`${items.length} 件を許可しました。子フォルダの中身も順番に選択してください。`);
}));
el("setupExclude").addEventListener("click", () => run(async () => {
  const current = queue[0];
  if (!current || current.id === candidate?.id) return;
  if (!confirm(`「${current.name}」とその配下をWebの許可手順から除外します。DriveのデータやVS Codeの同期は変更しません。書き出し専用など、Webで使わないフォルダにだけ使用してください。原稿・.mojigoto・ノート・設定・バックアップは除外しないでください。続けますか？`)) return;
  excludedFolders.set(current.id, current);
  visited.add(queue.shift().id);
  status(`「${current.name}」の配下を許可手順から除外しました。登録完了後もこの設定を記録します。`);
}));
el("setupRestoreExcluded").addEventListener("click", () => run(async () => {
  for (const folder of excludedFolders.values()) {
    visited.delete(folder.id);
    if (!queue.some((entry) => entry.id === folder.id)) queue.push(folder);
  }
  excludedFolders.clear();
  el("setupConfirmed").checked = false;
  status("除外を解除しました。対象フォルダを選択待ちに戻しました。登録を完了すると解除が保存されます。");
}));
el("setupEmpty").addEventListener("click", () => run(async () => {
  if (!confirm(`「${queue[0].name}」がDrive上でも空であることを確認しましたか？未許可の項目はWeb版から確認できません。`)) return;
  visited.add(queue.shift().id);
}));
el("setupConfirmed").addEventListener("change", updatePermissions);
el("setupFinish").addEventListener("click", () => run(async () => {
  if (!candidate || queue.length || !el("setupConfirmed").checked) return;
  status("作品の登録を確認しています…");
  await token();
  await finishRoot(candidate);
}));
function updateImportPlan({ reset = false } = {}) {
  plan = null;
  try {
    const excludedFolders = reset ? [] : [...el("setupImportExclusions").querySelectorAll("input:checked")].map((input) => input.value);
    plan = planGoogleDriveImport(localImportFiles ?? el("setupLocalFiles").files, { excludedFolders });
    if (reset) {
      el("setupImportExclusions").replaceChildren(...plan.optionalFolders.map((folder) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = folder;
        label.append(input, document.createTextNode(` ${folder} を取り込まない`));
        return label;
      }));
      el("setupImportName").value = googleDriveImportFolderName(plan.rootName);
    }
    el("setupLocalSelection").textContent = "選択中: " + plan.rootName;
    el("setupImportSummary").textContent = `${plan.rootName}: 取り込み ${plan.entries.length} ファイル、除外 ${plan.skippedCount} ファイル、約 ${(plan.bytes / 1024 / 1024).toFixed(1)} MB。空フォルダは含まれません。`;
    el("setupImportOptions").hidden = false;
  } catch (error) {
    el("setupLocalSelection").textContent = "";
    el("setupImportSummary").textContent = "";
    el("setupImportOptions").hidden = true;
    status(error.message, "error");
  }
  el("setupImport").disabled = !plan || !connected || localImportReading;
}
folderDrop = bindProjectFolderDrop({
  zone: el("setupLocalDropZone"), document, canRead: () => connected && !busy,
  onFiles(files) {
    planGoogleDriveImport(files); // Validate before replacing the previous selection.
    localImportFiles = files;
    el("setupLocalFiles").value = "";
    updateImportPlan({ reset: true });
  },
  onError: (error) => status(error.message, "error"),
  onReading(reading) {
    localImportReading = reading;
    el("setupLocalDropStatus").textContent = reading ? "フォルダを確認しています…" : "";
    el("setupImport").disabled = !plan || !connected || reading;
  },
  onProgress: (count) => { el("setupLocalDropStatus").textContent = "フォルダを確認しています… " + count + "ファイル"; },
});
el("setupLocalFiles").addEventListener("change", () => {
  folderDrop.cancel();
  localImportFiles = Array.from(el("setupLocalFiles").files || []);
  updateImportPlan({ reset: true });
});
el("setupImportExclusions").addEventListener("change", () => updateImportPlan());
el("setupImport").addEventListener("click", () => { if (localImportReading) return; return run(async () => {
  await token();
  if (!plan || !confirm(`「${plan.rootName}」の ${plan.entries.length} ファイルをDriveの「${el("setupImportName").value}」へ取り込みます。${plan.skippedCount} ファイルは除外します。以後VS Codeでも取り込み先を使ってください。続けますか？`)) return;
  status("取り込み中です。このページを閉じないでください。");
  importController = new AbortController();
  el("setupCancelImport").hidden = false;
  el("setupCancelImport").disabled = false;
  el("setupProgressBox").hidden = false;
  const root = await importGoogleDriveProject(provider, plan, { rootName: el("setupImportName").value, signal: importController.signal, onProgress: ({ completed, total, path }) => {
    el("setupImportProgress").textContent = `${completed}/${total} 件: ${path}`;
  } });
  // The new items are already authorized; no Picker walk is necessary.
  await finishRoot(root);
}); });

async function boot() {
  const config = await loadRuntimeConfig();
  if (config.loginRequired) {
    const userAuth = new UserAuthClient({ apiBase: config.authApiBase });
    const session = await userAuth.getSession();
    header.setSession(session, userAuth);
    if (!session.authenticated || session.access !== "active") {
      status("招待済みのアカウントでログインしてから設定してください。");
      el("setupLogin").hidden = false;
      for (const name of config.loginProviders || []) {
        const link = document.createElement("a");
        link.href = userAuth.loginUrl(name);
        link.textContent = `${name === "email" ? "メールアドレス・パスワード" : name}でログイン `;
        el("setupLogin").append(link);
      }
      return;
    }
  }
  auth = new GoogleDriveAuth({ clientId: resolveGoogleClientId(config) });
  provider = new GoogleDriveProvider(auth);
  picker = new GoogleDrivePicker({ apiKey: config.googleApiKey, appId: config.googleAppId });
  if (!auth.clientId || !picker.configured) {
    status("Google Driveの接続設定が不足しています。管理者にクライアントID・Pickerキー・プロジェクト番号の確認を依頼してください。");
    return;
  }
  el("setupConnect").disabled = false;
  await updateConnection();
  status(connected ? savedRoot()?.googleDriveScope === auth.scope ? "Google Driveに接続済みです。登録済みの作品はHOMEから開けます。" : "Google Driveに接続済みです。PCの作品フォルダを選んで取り込めます。" : "Google Driveに接続して設定を始めてください。");
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
    if (pending?.candidate?.id && Array.isArray(pending.queue) && Array.isArray(pending.visited)) {
      candidate = pending.candidate; queue = pending.queue; visited = new Set(pending.visited);
      excludedFolders = new Map((pending.excludedFolders || []).map((folder) => [folder.id, folder]));
      updatePermissions();
      status(connected ? "途中の登録から再開できます。残っているフォルダを順番に許可してください。" : "Google Driveへの接続が必要です。「ドライブに接続し直す」から、この続きから操作できます。");
    }
  } catch { sessionStorage.removeItem(PENDING_KEY); }
  await requestedAdditional();
}
boot().catch((error) => status(error.message, "error"));
