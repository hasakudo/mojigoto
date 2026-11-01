import { UserAuthClient } from "../lib/user-auth.mjs";
import { adminLoginMethodLabel } from "../lib/admin-user-labels.mjs";
import { appendCognitoIdentityDetails, renderRemovedCognitoUsers } from "../lib/admin-cognito-identity.mjs?v=1.0.0";

const elements = Object.fromEntries([
  "loadingPanel", "accessPanel", "accessTitle", "accessMessage", "loginLink", "adminContent",
  "adminAccount", "reauthenticateLink", "logoutButton", "totalCount", "activeCount", "disabledCount", "adminCount",
  "inviteForm", "inviteEmail", "inviteButton", "reloadButton", "memberCountLabel", "memberList", "statusMessage",
  "activityCountLabel", "activityList", "removedMemberCountLabel", "removedMemberList",
  "announcementForm", "announcementId", "announcementDate", "announcementTitleInput", "announcementSummary",
  "announcementUrl", "saveAnnouncementButton", "cancelAnnouncementEditButton", "adminAnnouncementList",
  "announcementLatestLabel",
  "submissionCountLabel", "submissionList", "reloadSubmissionsButton",
  "adminMailForm", "adminMailAudience", "adminMailUserField", "adminMailUserId", "adminMailSubject",
  "adminMailMessage", "adminMailConfirm", "adminMailSendButton", "mailAudienceCount",
  "sentMailCountLabel", "sentMailList",
  "formSettingsForm", "blockedTermsInput", "saveFormSettingsButton",
  "collapseAllPanelsButton",
].map((id) => [id, document.getElementById(id)]));

const siteRoot = new URL("../", location.href);
let authClient = null;
let session = null;
let usersEndpoint = "";
let announcementsEndpoint = "";
let submissionsEndpoint = "";
let mailEndpoint = "";
let formSettingsEndpoint = "";
let noticeTimer = null;
let currentUsers = [];
let adminSessionTimer = null;
let adminExpiryTimer = null;
let lastActivitySentAt = 0;
let activityPending = false;
let adminExpired = false;

function expireAdminSession() {
  if (adminExpired) return;
  adminExpired = true;
  clearInterval(adminSessionTimer);
  clearTimeout(adminExpiryTimer);
  elements.adminContent.hidden = true;
  location.replace(new URL("admin/login/", siteRoot).href);
}

function adminRequestError(response, payload, fallback) {
  if (response.status === 401 || payload.code === "admin_session_required") expireAdminSession();
  return new Error(payload.message || fallback);
}

async function refreshAdminSession() {
  const response = await fetch(new URL("api/admin/auth/session/", siteRoot), { credentials: "include", cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "管理者認証を確認できませんでした。");
  session = payload;
  if (!session.authenticated || !session.isAdmin) return false;
  clearTimeout(adminExpiryTimer);
  const deadline = Math.min(Number(payload.idleExpiresAt), Number(payload.absoluteExpiresAt)) * 1000;
  if (!Number.isFinite(deadline) || deadline <= Date.now()) return false;
  adminExpiryTimer = setTimeout(expireAdminSession, deadline - Date.now());
  return true;
}

async function recordAdminActivity(event) {
  if (!event.isTrusted || !session?.authenticated || adminExpired || activityPending || Date.now() - lastActivitySentAt < 60000) return;
  activityPending = true;
  try {
    const response = await fetch(new URL("api/admin/auth/activity/", siteRoot), {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { "X-CSRF-Token": session.csrfToken, "Content-Type": "application/json" }, body: "{}",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw adminRequestError(response, payload, "操作の有効期間を確認できませんでした。");
    }
    lastActivitySentAt = Date.now();
    if (!(await refreshAdminSession())) expireAdminSession();
  } catch (error) { if (!adminExpired) showNotice(error.message, true); }
  finally { activityPending = false; }
}

function showNotice(message, isError = false) {
  clearTimeout(noticeTimer);
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message visible${isError ? " error" : ""}`;
  noticeTimer = setTimeout(() => { elements.statusMessage.className = "status-message"; }, 3600);
}

function notificationNotice(notification, successMessage) {
  if (!notification) return { message: successMessage, isError: false };
  if (!notification.configured) {
    return { message: `${successMessage} 通知メールの設定が未完了のため、利用者へは送信されていません。`, isError: true };
  }
  if (!notification.accepted) {
    return { message: `${successMessage} ただし、利用者への通知メール送信に失敗しました。`, isError: true };
  }
  const label = notification.action === "removed" ? "利用解除完了メール" : "利用開始メール";
  return { message: `${successMessage} ${label}を送信しました。`, isError: false };
}

function showAccess(message, { login = false } = {}) {
  elements.loadingPanel.hidden = true;
  elements.adminContent.hidden = true;
  elements.accessPanel.hidden = false;
  elements.accessMessage.textContent = message;
  elements.loginLink.hidden = !login;
}

function formatDate(value, emptyLabel = "未ログイン") {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

async function requestUsers(options = {}) {
  const response = await fetch(usersEndpoint, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw adminRequestError(response, payload, "利用者情報を読み込めませんでした。");
  return payload;
}

async function requestAnnouncements(options = {}) {
  const response = await fetch(announcementsEndpoint, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw adminRequestError(response, payload, "お知らせを読み込めませんでした。");
  return payload;
}

async function requestSubmissions(options = {}) {
  const response = await fetch(submissionsEndpoint, { credentials: "include", cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "申込・問い合わせを読み込めませんでした。");
  return payload;
}

async function requestMail(options = {}) {
  const response = await fetch(mailEndpoint, { credentials: "include", cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw adminRequestError(response, payload, "送信ボックスを読み込めませんでした。");
  return payload;
}

async function requestFormSettings(options = {}) {
  const response = await fetch(formSettingsEndpoint, { credentials: "include", cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw adminRequestError(response, payload, "フォーム設定を読み込めませんでした。");
  return payload;
}

async function loadFormSettings() {
  try {
    const payload = await requestFormSettings();
    elements.blockedTermsInput.value = Array.isArray(payload.blockedTerms) ? payload.blockedTerms.join("\n") : "";
  } catch (error) { showNotice(error.message, true); }
}

function renderSubmissions(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const openCount = Number(payload.summary?.open || 0);
  const discoveryLabels = { friend: "知人", social: "SNS", website: "ホームページ", other: "そのほか" };
  elements.submissionCountLabel.textContent = `未対応${openCount}件・全${items.length}件`;
  elements.submissionList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state compact";
    empty.textContent = "申込・問い合わせはまだありません。";
    elements.submissionList.append(empty);
    return;
  }
  const pendingGroup = document.createElement("details");
  pendingGroup.className = "submission-group";
  restoreDetailsState(pendingGroup, "mojigoto.admin.group.submissions.pending", true);
  const pendingSummary = document.createElement("summary");
  pendingSummary.textContent = `未対応 ${openCount}件`;
  const pendingList = document.createElement("div");
  pendingList.className = "submission-group-list";
  pendingGroup.append(pendingSummary, pendingList);
  const completedGroup = document.createElement("details");
  completedGroup.className = "submission-group completed";
  restoreDetailsState(completedGroup, "mojigoto.admin.group.submissions.completed", false);
  const completedSummary = document.createElement("summary");
  completedSummary.textContent = `対応済み ${items.length - openCount}件`;
  const completedList = document.createElement("div");
  completedList.className = "submission-group-list";
  completedGroup.append(completedSummary, completedList);
  items.forEach((item) => {
    const withdrawal = item.type === "application" && item.requestKind === "withdraw";
    const card = document.createElement("article");
    card.className = `submission-card ${item.status || "open"}`;
    const heading = document.createElement("div");
    heading.className = "submission-heading";
    const title = document.createElement("strong");
    title.textContent = item.type === "application" ? (withdrawal ? "利用解除申込" : "利用申込") : (item.subject || "お問い合わせ");
    const selection = document.createElement("input");
    selection.type = "checkbox";
    selection.className = "item-selection";
    selection.value = item.id;
    selection.setAttribute("aria-label", `${title.textContent}を選択`);
    const badge = document.createElement("span");
    badge.className = "status-badge";
    badge.textContent = item.status === "approved" ? "招待済み" : item.status === "handled" ? "対応済み" : "未対応";
    heading.append(selection, title, badge);
    const identity = document.createElement("p");
    identity.className = "submission-identity";
    identity.textContent = `${item.name || "—"} ｜ ${item.email || "—"}`;
    const meta = document.createElement("p");
    meta.className = "submission-meta";
    meta.textContent = `${formatDate(item.createdAt)}${item.discovery ? ` ｜ きっかけ: ${discoveryLabels[item.discovery] || item.discovery}` : ""}`;
    const retention = document.createElement("p");
    retention.className = "submission-retention";
    const baseDate = item.completedAt ? new Date(item.completedAt) : new Date(item.createdAt);
    const ageDays = Number.isNaN(baseDate.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / 86400000));
    if (item.completedAt) {
      const remaining = Math.max(0, 90 - ageDays);
      retention.textContent = `対応完了後90日で自動削除（残り約${remaining}日）`;
    } else if (ageDays >= 83) {
      retention.textContent = `受付から${ageDays}日経過しています。対応状況と受信メールの整理を確認してください。`;
      retention.classList.add("warning");
    } else {
      retention.hidden = true;
    }
    const messageDetails = document.createElement("details");
    messageDetails.className = "submission-message-details";
    const messageSummary = document.createElement("summary");
    messageSummary.textContent = item.message ? "メッセージを表示" : "メッセージなし";
    const message = document.createElement("p");
    message.className = "submission-message";
    message.textContent = item.message || "（メッセージなし）";
    messageDetails.append(messageSummary, message);
    const actions = document.createElement("div");
    actions.className = "submission-actions";
    if (item.type === "application" && !withdrawal && item.status !== "approved") actions.append(createActionButton("招待へ追加", "primary-button", () => updateSubmission("approve", item)));
    actions.append(createActionButton(item.status === "open" ? "対応済みにする" : "未対応に戻す", "secondary-button", () => updateSubmission(item.status === "open" ? "mark_handled" : "mark_open", item)));
    actions.append(createActionButton("受付情報を削除", "danger-button", () => {
      if (confirm(`${item.email} の受付情報だけを削除しますか？\n利用者登録はこの操作では削除されません。`)) updateSubmission("remove", item);
    }));
    card.append(heading, identity, meta, retention, messageDetails, actions);
    (item.status === "open" ? pendingList : completedList).append(card);
  });
  addBulkActions(pendingList, [
    { label: "選択を対応済み", action: "mark_handled" },
    { label: "選択を削除", action: "remove", className: "danger-button" },
  ], updateSubmissionsBulk);
  addBulkActions(completedList, [
    { label: "選択を未対応", action: "mark_open" },
    { label: "選択を削除", action: "remove", className: "danger-button" },
  ], updateSubmissionsBulk);
  elements.submissionList.append(pendingGroup, completedGroup);
}

async function loadSubmissions() {
  elements.reloadSubmissionsButton.disabled = true;
  try { renderSubmissions(await requestSubmissions()); }
  catch (error) { showNotice(error.message, true); }
  finally { elements.reloadSubmissionsButton.disabled = false; }
}

async function updateSubmission(action, item) {
  if (action === "approve" && !confirm(`${item.email} を招待利用者へ追加しますか？`)) return;
  try {
    const payload = await requestSubmissions({
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
      body: JSON.stringify({ action, id: item.id }),
    });
    renderSubmissions(payload);
    if (action === "approve") await loadUsers();
    const notice = notificationNotice(payload.notification, action === "approve" ? "申込メールアドレスを招待へ追加しました。" : "受付情報を更新しました。");
    showNotice(notice.message, notice.isError);
  } catch (error) { showNotice(error.message, true); }
}

async function updateSubmissionsBulk(action, ids) {
  const label = action === "remove" ? "削除" : action === "mark_open" ? "未対応へ変更" : "対応済みへ変更";
  if (!confirm(`選択した${ids.length}件を${label}しますか？${action === "remove" ? "\n利用者登録は削除されません。" : ""}`)) return;
  try {
    const payload = await requestSubmissions({
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
      body: JSON.stringify({ action, ids }),
    });
    renderSubmissions(payload);
    showNotice(`${ids.length}件を${label}しました。`);
  } catch (error) { showNotice(error.message, true); }
}

function createActionButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function initializeCollapsiblePanels() {
  document.querySelectorAll(".admin-panel").forEach((panel, index) => {
    const panelName = [...panel.classList].find((name) => name !== "admin-panel" && name.endsWith("-panel")) || `panel-${index}`;
    const storageKey = `mojigoto.admin.collapsed.${panelName}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-collapse-button";
    const applyState = (collapsed) => {
      panel.classList.toggle("collapsed", collapsed);
      button.textContent = collapsed ? "開く" : "閉じる";
      button.setAttribute("aria-expanded", String(!collapsed));
    };
    applyState(localStorage.getItem(storageKey) === "true");
    button.addEventListener("click", () => {
      const collapsed = !panel.classList.contains("collapsed");
      applyState(collapsed);
      localStorage.setItem(storageKey, String(collapsed));
    });
    panel.append(button);
  });
}

function initializeAdminNavigation() {
  document.querySelectorAll(".admin-section-nav a[href^='#']").forEach((link) => {
    link.addEventListener("click", () => {
      const panel = document.querySelector(link.getAttribute("href"));
      if (panel?.classList.contains("collapsed")) panel.querySelector(".panel-collapse-button")?.click();
    });
  });
  elements.collapseAllPanelsButton.addEventListener("click", () => {
    document.querySelectorAll(".admin-panel:not(.collapsed) > .panel-collapse-button").forEach((button) => button.click());
    document.querySelectorAll(".submission-group[open], .sent-mail-group[open]").forEach((details) => { details.open = false; });
  });
}

function restoreDetailsState(details, key, defaultOpen) {
  const stored = localStorage.getItem(key);
  details.open = stored === null ? defaultOpen : stored === "true";
  details.addEventListener("toggle", () => localStorage.setItem(key, String(details.open)));
}

function addBulkActions(list, actions, handler) {
  const checkboxes = [...list.querySelectorAll(".item-selection")];
  if (!checkboxes.length) return;
  const toolbar = document.createElement("div");
  toolbar.className = "bulk-actions";
  const selectLabel = document.createElement("label");
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  const selectText = document.createElement("span");
  selectText.textContent = "すべて選択";
  selectLabel.append(selectAll, selectText);
  const buttons = actions.map(({ label, action, className = "secondary-button" }) => {
    const button = createActionButton(label, className, () => {
      const ids = checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
      if (ids.length) handler(action, ids);
    });
    button.disabled = true;
    toolbar.append(button);
    return button;
  });
  const update = () => {
    const selected = checkboxes.filter((checkbox) => checkbox.checked).length;
    selectAll.checked = selected === checkboxes.length;
    selectAll.indeterminate = selected > 0 && selected < checkboxes.length;
    buttons.forEach((button) => { button.disabled = selected === 0; });
  };
  selectAll.addEventListener("change", () => {
    checkboxes.forEach((checkbox) => { checkbox.checked = selectAll.checked; });
    update();
  });
  checkboxes.forEach((checkbox) => checkbox.addEventListener("change", update));
  toolbar.prepend(selectLabel);
  list.prepend(toolbar);
}

function renderUsers(payload) {
  const summary = payload.summary || {};
  const users = Array.isArray(payload.users) ? payload.users : [];
  currentUsers = users;
  renderRemovedCognitoUsers(elements.removedMemberList, elements.removedMemberCountLabel, payload.removedUsers, { onNotice: showNotice });
  elements.totalCount.textContent = String(summary.total || 0);
  elements.activeCount.textContent = String(summary.active || 0);
  elements.disabledCount.textContent = String(summary.disabled || 0);
  elements.adminCount.textContent = String(summary.admins || 0);
  elements.memberCountLabel.textContent = `${users.length}件`;
  elements.memberList.replaceChildren();
  renderMailRecipients();
  renderAudit(Array.isArray(payload.audit) ? payload.audit : []);

  if (!users.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "招待利用者はまだ登録されていません。";
    elements.memberList.append(empty);
    return;
  }

  users.forEach((user) => {
    const card = document.createElement("article");
    card.className = "member-card";
    const identity = document.createElement("div");
    identity.className = "member-identity";
    const name = document.createElement("strong");
    name.textContent = user.nickname || user.email;
    const email = document.createElement("span");
    email.textContent = user.email || "";
    identity.append(name, email);

    const badges = document.createElement("div");
    badges.className = "member-badges";
    const status = document.createElement("span");
    status.className = `status-badge ${user.status === "disabled" ? "disabled" : "active"}`;
    status.textContent = user.status === "disabled" ? "停止中" : "有効";
    badges.append(status);
    if (user.ownerAccount === true) {
      const owner = document.createElement("span");
      owner.className = "role-badge";
      owner.textContent = "自分の普段用";
      badges.append(owner);
    }
    if (user.role === "admin") {
      const role = document.createElement("span");
      role.className = "role-badge";
      role.textContent = "管理者";
      badges.append(role);
    }

    const meta = document.createElement("dl");
    meta.className = "member-meta";
    const provider = adminLoginMethodLabel(user);
    [["利用者ID", user.id || "—"], ["利用開始日", formatDate(user.createdAt, "未記録")], ["ログイン方法", provider], ["最終ログイン", formatDate(user.lastLoginAt, "記録なし")]].forEach(([term, description]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = description;
      meta.append(dt, dd);
    });

    const actions = document.createElement("div");
    actions.className = "member-actions";
    if (user.role === "admin") {
      const protectedLabel = document.createElement("span");
      protectedLabel.textContent = "保護されています";
      actions.append(protectedLabel);
    } else {
      const nextStatus = user.status === "disabled" ? "active" : "disabled";
      actions.append(createActionButton(user.status === "disabled" ? "利用を再開" : "利用を停止", "secondary-button", () => updateUser({
        action: "set_status", userId: user.id, status: nextStatus,
      })));
      if (user.deletionProtected === true) {
        const protectedLabel = document.createElement("span");
        protectedLabel.textContent = "削除から保護されています";
        actions.append(protectedLabel);
      } else actions.append(createActionButton("削除", "danger-button", () => {
        if (confirm(`${user.id}（${user.email}）を招待一覧から削除しますか？\nCognitoの利用者は削除されません。解除後の一覧で照合用IDを確認できます。`)) updateUser({ action: "remove", userId: user.id });
      }));
    }
    card.append(identity, badges, meta, actions);
    appendCognitoIdentityDetails(card, user, { onNotice: showNotice });
    elements.memberList.append(card);
  });
}

function renderMailRecipients() {
  const users = currentUsers.filter((user) => user.status === "active" && user.role !== "admin");
  const selected = elements.adminMailUserId.value;
  elements.adminMailUserId.replaceChildren();
  users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.nickname || user.id}（${user.id}・${user.email}）`;
    elements.adminMailUserId.append(option);
  });
  if (users.some((user) => user.id === selected)) elements.adminMailUserId.value = selected;
  elements.adminMailUserId.disabled = users.length === 0;
  elements.mailAudienceCount.textContent = `有効利用者${users.length}件（管理者を除く）`;
}

function updateMailAudience() {
  const bulk = elements.adminMailAudience.value === "all_active";
  elements.adminMailUserField.hidden = bulk;
  elements.adminMailUserId.required = !bulk;
}

async function sendAdminMail(event) {
  event.preventDefault();
  const mode = elements.adminMailAudience.value;
  const targetLabel = mode === "all_active"
    ? `${currentUsers.filter((user) => user.status === "active" && user.role !== "admin").length}人の有効利用者全員`
    : elements.adminMailUserId.selectedOptions[0]?.textContent || "選択した利用者";
  if (!confirm(`${targetLabel}へメールを送信しますか？\n送信後は取り消せません。`)) return;
  elements.adminMailSendButton.disabled = true;
  try {
    const response = await fetch(mailEndpoint, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
      body: JSON.stringify({
        action: "send",
        mode,
        userId: mode === "individual" ? elements.adminMailUserId.value : "",
        subject: elements.adminMailSubject.value.trim(),
        message: elements.adminMailMessage.value.trim(),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "メールを送信できませんでした。");
    renderSentMail(payload);
    const notice = [payload.message || "メールの送信を受け付けました。", payload.archiveWarning].filter(Boolean).join(" ");
    showNotice(notice, Boolean(payload.failed || payload.archiveWarning));
    elements.adminMailForm.reset();
    updateMailAudience();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    elements.adminMailSendButton.disabled = false;
  }
}

function renderSentMail(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const current = items.filter((item) => item.status !== "archived");
  const archived = items.filter((item) => item.status === "archived");
  elements.sentMailCountLabel.textContent = `${items.length}件・送信後${payload.retentionDays || 90}日で自動削除`;
  elements.sentMailList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state compact";
    empty.textContent = "管理画面から送信したメールはまだありません。";
    elements.sentMailList.append(empty);
    return;
  }
  const appendGroup = (label, entries, key, defaultOpen) => {
    const group = document.createElement("details");
    group.className = "sent-mail-group";
    restoreDetailsState(group, `mojigoto.admin.group.sent.${key}`, defaultOpen);
    const summary = document.createElement("summary");
    summary.textContent = `${label} ${entries.length}件`;
    const list = document.createElement("div");
    list.className = "sent-mail-group-list";
    entries.forEach((item) => {
      const card = document.createElement("article");
      card.className = "sent-mail-card";
      const heading = document.createElement("div");
      heading.className = "sent-mail-card-heading";
      const subject = document.createElement("strong");
      subject.textContent = item.subject || "（件名なし）";
      const selection = document.createElement("input");
      selection.type = "checkbox";
      selection.className = "item-selection";
      selection.value = item.id;
      selection.setAttribute("aria-label", `${subject.textContent}を選択`);
      const time = document.createElement("time");
      time.textContent = formatDate(item.sentAt, "日時不明");
      heading.append(selection, subject, time);
      const meta = document.createElement("p");
      const recipientLabel = item.mode === "all_active" ? `有効利用者全員（${item.attempted || 0}件）` : (item.recipientIds || []).join("、");
      meta.className = "sent-mail-meta";
      meta.textContent = `送信先: ${recipientLabel} ｜ 受付${item.accepted || 0}件${item.failed ? `・失敗${item.failed}件` : ""}`;
      const content = document.createElement("details");
      content.className = "sent-mail-content";
      const contentSummary = document.createElement("summary");
      contentSummary.textContent = "本文を表示";
      const message = document.createElement("p");
      message.textContent = item.message || "";
      content.append(contentSummary, message);
      const actions = document.createElement("div");
      actions.className = "sent-mail-actions";
      actions.append(createActionButton(item.status === "archived" ? "元に戻す" : "アーカイブ", "secondary-button", () => updateSentMail(item.status === "archived" ? "restore" : "archive", item)));
      actions.append(createActionButton("削除", "danger-button", () => {
        if (confirm(`「${item.subject || "件名なし"}」の送信履歴を削除しますか？\n実際に送信されたメールは削除されません。`)) updateSentMail("remove", item);
      }));
      card.append(heading, meta, content, actions);
      list.append(card);
    });
    addBulkActions(list, [
      { label: key === "archived" ? "選択を元に戻す" : "選択をアーカイブ", action: key === "archived" ? "restore" : "archive" },
      { label: "選択を削除", action: "remove", className: "danger-button" },
    ], updateSentMailBulk);
    group.append(summary, list);
    elements.sentMailList.append(group);
  };
  appendGroup("送信済み", current, "current", true);
  if (archived.length) appendGroup("アーカイブ", archived, "archived", false);
}

async function loadSentMail() {
  try { renderSentMail(await requestMail()); }
  catch (error) { showNotice(error.message, true); }
}

async function updateSentMail(action, item) {
  try {
    const payload = await requestMail({
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
      body: JSON.stringify({ action, id: item.id }),
    });
    renderSentMail(payload);
    showNotice(payload.message || "送信履歴を更新しました。");
  } catch (error) { showNotice(error.message, true); }
}

async function updateSentMailBulk(action, ids) {
  const label = action === "remove" ? "削除" : action === "restore" ? "送信済みに戻す" : "アーカイブ";
  if (!confirm(`選択した${ids.length}件を${label}しますか？${action === "remove" ? "\n実際に送信されたメールは削除されません。" : ""}`)) return;
  try {
    const payload = await requestMail({
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
      body: JSON.stringify({ action, ids }),
    });
    renderSentMail(payload);
    showNotice(`${ids.length}件を${label}しました。`);
  } catch (error) { showNotice(error.message, true); }
}

function renderAudit(entries) {
  const labels = {
    add: "招待に追加",
    enabled: "利用を再開",
    disabled: "利用を停止",
    remove: "招待から削除",
    mail_sent: "メール送信",
  };
  elements.activityCountLabel.textContent = `直近${entries.length}件`;
  elements.activityList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state compact";
    empty.textContent = "管理操作の履歴はまだありません。";
    elements.activityList.append(empty);
    return;
  }
  entries.forEach((entry) => {
    const row = document.createElement("article");
    row.className = "activity-row";
    const description = document.createElement("div");
    const action = document.createElement("strong");
    const target = document.createElement("span");
    action.textContent = labels[entry.action] || "利用者情報を更新";
    target.textContent = entry.target || "—";
    description.append(action, target);
    const meta = document.createElement("div");
    const time = document.createElement("time");
    const actor = document.createElement("span");
    time.textContent = formatDate(entry.at);
    if (entry.at) time.dateTime = entry.at;
    actor.textContent = `操作: ${entry.actor || "管理者"}`;
    meta.append(time, actor);
    row.append(description, meta);
    elements.activityList.append(row);
  });
}

function resetAnnouncementForm() {
  elements.announcementForm.reset();
  elements.announcementId.value = "";
  const today = new Date();
  elements.announcementDate.value = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  elements.saveAnnouncementButton.textContent = "追加";
  elements.cancelAnnouncementEditButton.hidden = true;
}

function editAnnouncement(item) {
  elements.announcementId.value = item.id || "";
  elements.announcementDate.value = item.date || "";
  elements.announcementTitleInput.value = item.title || "";
  elements.announcementSummary.value = item.summary || "";
  elements.announcementUrl.value = item.url || "";
  elements.saveAnnouncementButton.textContent = "更新";
  elements.cancelAnnouncementEditButton.hidden = false;
  elements.announcementForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderAnnouncements(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  elements.adminAnnouncementList.replaceChildren();
  if (!items.length) {
    elements.announcementLatestLabel.textContent = "最終更新：お知らせはまだありません";
    const empty = document.createElement("p");
    empty.className = "empty-state compact";
    empty.textContent = "お知らせはまだありません。";
    elements.adminAnnouncementList.append(empty);
    return;
  }
  const latest = [...items].sort((left, right) => String(right.updatedAt || right.date || "").localeCompare(String(left.updatedAt || left.date || "")))[0];
  elements.announcementLatestLabel.textContent = `最終更新：${formatDate(latest.updatedAt || latest.date, "日時不明")} ｜ ${latest.title || "お知らせ"}`;
  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "admin-announcement-row";
    const content = document.createElement("div");
    const date = document.createElement("time");
    const title = document.createElement("strong");
    const summary = document.createElement("p");
    date.textContent = item.date || "";
    title.textContent = item.title || "お知らせ";
    summary.textContent = item.summary || "";
    content.append(date, title, summary);
    const actions = document.createElement("div");
    actions.className = "admin-announcement-actions";
    actions.append(
      createActionButton("編集", "secondary-button", () => editAnnouncement(item)),
      createActionButton("削除", "danger-button", () => {
        if (confirm(`「${item.title || "お知らせ"}」を削除しますか？`)) updateAnnouncement({ action: "remove", id: item.id });
      }),
    );
    row.append(content, actions);
    elements.adminAnnouncementList.append(row);
  });
}

async function loadAnnouncements() {
  try {
    renderAnnouncements(await requestAnnouncements());
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function updateAnnouncement(input) {
  try {
    const payload = await requestAnnouncements({
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrfToken,
      },
      body: JSON.stringify(input),
    });
    renderAnnouncements(payload);
    resetAnnouncementForm();
    showNotice(input.action === "remove" ? "お知らせを削除しました。" : "お知らせを保存しました。");
    return true;
  } catch (error) {
    showNotice(error.message, true);
    return false;
  }
}

async function loadUsers() {
  elements.reloadButton.disabled = true;
  try {
    renderUsers(await requestUsers());
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    elements.reloadButton.disabled = false;
  }
}

async function updateUser(input) {
  try {
    const payload = await requestUsers({
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrfToken,
      },
      body: JSON.stringify(input),
    });
    renderUsers(payload);
    const successMessage = input.action === "add"
      ? "利用者を追加しました。"
      : input.action === "remove" ? "招待を解除しました。Cognito側の削除は手動で行ってください。" : "利用状態を更新しました。";
    const notice = notificationNotice(payload.notification, successMessage);
    const message = [notice.message, payload.auditWarning].filter(Boolean).join(" ");
    showNotice(message, notice.isError || Boolean(payload.auditWarning));
    return true;
  } catch (error) {
    showNotice(error.message, true);
    return false;
  }
}

elements.inviteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = elements.inviteEmail.value.trim().toLowerCase();
  if (!email) return;
  elements.inviteButton.disabled = true;
  try {
    if (await updateUser({ action: "add", email })) elements.inviteForm.reset();
  } finally {
    elements.inviteButton.disabled = false;
  }
});

elements.reloadButton.addEventListener("click", loadUsers);
elements.reloadSubmissionsButton.addEventListener("click", loadSubmissions);
elements.adminMailAudience.addEventListener("change", updateMailAudience);
elements.adminMailForm.addEventListener("submit", sendAdminMail);
elements.formSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.saveFormSettingsButton.disabled = true;
  try {
    const blockedTerms = elements.blockedTermsInput.value.split(/\r?\n/).map((term) => term.trim()).filter(Boolean);
    const payload = await requestFormSettings({
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
      body: JSON.stringify({ blockedTerms }),
    });
    elements.blockedTermsInput.value = Array.isArray(payload.blockedTerms) ? payload.blockedTerms.join("\n") : "";
    showNotice(payload.message || "フォーム設定を保存しました。");
  } catch (error) { showNotice(error.message, true); }
  finally { elements.saveFormSettingsButton.disabled = false; }
});
elements.cancelAnnouncementEditButton.addEventListener("click", resetAnnouncementForm);
elements.announcementForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.saveAnnouncementButton.disabled = true;
  try {
    await updateAnnouncement({
      action: "save",
      id: elements.announcementId.value,
      date: elements.announcementDate.value,
      title: elements.announcementTitleInput.value.trim(),
      summary: elements.announcementSummary.value.trim(),
      url: elements.announcementUrl.value.trim(),
    });
  } finally {
    elements.saveAnnouncementButton.disabled = false;
  }
});
elements.logoutButton.addEventListener("click", async () => {
  elements.logoutButton.disabled = true;
  try {
    const result = await authClient.logout(session.csrfToken);
    location.assign(result.logoutUrl || siteRoot.href);
  } catch (error) {
    elements.logoutButton.disabled = false;
    showNotice(error.message || "ログアウトできませんでした。", true);
  }
});

async function initialize() {
  initializeCollapsiblePanels();
  initializeAdminNavigation();
  try {
    const apiBase = new URL("api/admin/auth", siteRoot).href;
    authClient = new UserAuthClient({ apiBase });
    usersEndpoint = new URL("api/admin/users/", siteRoot).href;
    announcementsEndpoint = new URL("api/admin/announcements/", siteRoot).href;
    submissionsEndpoint = new URL("api/admin/submissions/", siteRoot).href;
    mailEndpoint = new URL("api/admin/mail/", siteRoot).href;
    formSettingsEndpoint = new URL("api/admin/form-settings/", siteRoot).href;
    elements.loginLink.href = new URL("admin/login/", siteRoot).href;
    elements.loginLink.textContent = "管理者専用ログインへ";
    if (!(await refreshAdminSession())) {
      showAccess("管理者専用入口からログインしてください。通常のログインでは管理画面を利用できません。", { login: true });
      return;
    }
    adminSessionTimer = setInterval(async () => {
      try { if (!(await refreshAdminSession())) expireAdminSession(); }
      catch (error) { showNotice(error.message, true); }
    }, 30000);
    document.addEventListener("pointerdown", recordAdminActivity);
    document.addEventListener("keydown", recordAdminActivity);
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      try { if (!(await refreshAdminSession())) expireAdminSession(); }
      catch (error) { showNotice(error.message, true); }
    });
    elements.adminAccount.textContent = "管理者";
    elements.logoutButton.hidden = false;
    elements.loadingPanel.hidden = true;
    elements.accessPanel.hidden = true;
    elements.adminContent.hidden = false;
    resetAnnouncementForm();
    updateMailAudience();
    await Promise.all([loadUsers(), loadAnnouncements(), loadSubmissions(), loadSentMail(), loadFormSettings()]);
  } catch (error) {
    elements.loginLink.href = new URL("admin/login/", siteRoot).href;
    elements.loginLink.textContent = "管理者専用ログインへ";
    showAccess(error.message || "管理画面を読み込めませんでした。", { login: true });
  }
}

initialize();
