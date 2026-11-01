import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("管理者メールと招待利用者データをサーバー側で判定する", () => {
  const config = read("../web/api/auth/config.example.php");
  const bootstrap = read("../web/api/auth/bootstrap.php");
  const callback = read("../web/api/auth/callback/index.php");
  const session = read("../web/api/auth/session/index.php");
  assert.match(config, /'admin_emails'/);
  assert.match(config, /'user_registry_path'/);
  assert.match(bootstrap, /function auth_is_admin/);
  assert.match(bootstrap, /function auth_mutate_user_registry/);
  assert.match(bootstrap, /flock\(\$lock, LOCK_EX\)/);
  assert.match(bootstrap, /function auth_normalize_audit_entries/);
  assert.match(bootstrap, /function auth_load_admin_audit/);
  assert.match(bootstrap, /admin-audit\.json/);
  assert.match(bootstrap, /'audit'\s*=>\s*auth_normalize_audit_entries/);
  assert.match(bootstrap, /function auth_set_user_nickname/);
  assert.match(callback, /auth_record_login/);
  assert.doesNotMatch(callback, /\$profile\['name'\]/);
  assert.match(session, /'isAdmin'\s*=>\s*false/);
});

test("管理APIは管理者セッションとCSRFを検証する", () => {
  const api = read("../web/api/admin/users/index.php");
  const dataProtection = read("../web/api/auth/data/.htaccess");
  assert.match(api, /admin_require_user/);
  assert.match(api, /HTTP_X_CSRF_TOKEN/);
  assert.match(api, /管理者アカウントは停止・削除できません/);
  assert.match(api, /\['add', 'set_status', 'remove'\]/);
  assert.match(api, /\$record\['audit'\]\s*=\s*array_slice/);
  assert.doesNotMatch(api, /auth_append_admin_audit/);
  assert.match(api, /\$audit\s*=\s*auth_load_admin_audit/);
  assert.match(api, /'audit'\s*=>\s*\$audit/);
  assert.match(api, /'auditWarning'\s*=>/);
  assert.match(api, /forms_membership_mail/);
  assert.match(api, /'notification'\s*=>/);
  assert.match(api, /admin_public_users/);
  assert.match(read("../web/api/admin/privacy.php"), /auth_user_id/);
  assert.match(read("../web/api/admin/privacy.php"), /'nickname'\s*=>/);
  assert.doesNotMatch(api, /'name'\s*=>/);
  assert.match(dataProtection, /Require all denied/);
});

test("管理画面で招待利用者と利用状態を操作できる", () => {
  const home = read("../web/index.html");
  const html = read("../web/admin/index.html");
  const app = read("../web/admin/admin.mjs");
  assert.match(home, /id="adminPageLink"/);
  assert.match(home, /id="nicknameInput"/);
  assert.match(home, /id="managedConnectionNotice" hidden/);
  assert.doesNotMatch(home, /利用者によるアプリIDの入力は不要です/);
  const appVersion = home.match(/app\.mjs\?v=([\d.]+)/)?.[0];
  assert.ok(appVersion);
  assert.ok(read("../web/sw.js").includes(appVersion));
  assert.match(html, /招待利用者/);
  assert.match(html, /id="inviteForm"/);
  assert.match(html, /id="activityList"/);
  assert.doesNotMatch(html, /id="toggleEmailVisibilityButton"/);
  assert.match(app, /api\/admin\/users\//);
  assert.match(app, /"X-CSRF-Token": session\.csrfToken/);
  assert.match(app, /action: "set_status"/);
  assert.match(app, /function renderAudit/);
  assert.match(html, /id="announcementForm"/);
  assert.match(html, /id="adminAnnouncementList"/);
  assert.match(app, /api\/admin\/announcements\//);
  assert.match(app, /function renderAnnouncements/);
  assert.match(app, /function initializeCollapsiblePanels/);
  assert.match(app, /submission-message-details/);
  assert.match(html, /theme-init\.js/);
  const announcementsApi = read("../web/api/admin/announcements/index.php");
  assert.match(announcementsApi, /announcements_require_admin/);
  assert.match(html, /id="submissionList"/);
  assert.match(app, /api\/admin\/submissions\//);
  assert.match(announcementsApi, /HTTP_X_CSRF_TOKEN/);
  assert.match(announcementsApi, /announcements_save/);
  assert.match(announcementsApi, /'updatedAt'\s*=>\s*gmdate\('c'\)/);
  assert.match(announcementsApi, /filemtime\(\$path\)/);
  assert.doesNotMatch(app, /innerHTML/);
});

test("プロフィールAPIは利用状態とCSRFを確認してニックネームだけを保存する", () => {
  const profile = read("../web/api/auth/profile/index.php");
  const session = read("../web/api/auth/session/index.php");
  const microsoftLogin = read("../web/api/auth/login/microsoft/index.php");
  const googleLogin = read("../web/api/auth/login/google/index.php");
  const oneDriveAuth = read("../web/auth/pkce.mjs");
  assert.match(profile, /auth_access_for_email/);
  assert.match(profile, /HTTP_X_CSRF_TOKEN/);
  assert.match(profile, /auth_set_user_nickname/);
  assert.match(session, /auth_nickname_for_email/);
  assert.doesNotMatch(session, /'name'\s*=>/);
  assert.match(microsoftLogin, /'scope'\s*=>\s*'openid email'/);
  assert.match(googleLogin, /'scope'\s*=>\s*'openid email'/);
  assert.doesNotMatch(microsoftLogin, /openid email profile/);
  assert.doesNotMatch(googleLogin, /openid email profile/);
  assert.doesNotMatch(oneDriveAuth, /openid profile/);
});

test("利用停止と招待解除を開いている画面へ反映する", () => {
  const app = read("../web/app.mjs");
  assert.match(app, /USER_ACCESS_CHECK_INTERVAL\s*=\s*60000/);
  assert.match(app, /function startUserAccessMonitor/);
  assert.match(app, /function suspendForUserAccess/);
  assert.match(app, /checkUserAccess\(\{ force: true \}\)/);
  assert.match(app, /if \(session\.access === "active"\) restoreUserAccess\(session\)/);
});

test("利用者IDで管理しメールアドレス全文の解除経路を持たない", () => {
  const auth = read("../web/api/auth/bootstrap.php");
  const usersApi = read("../web/api/admin/users/index.php");
  const submissionsApi = read("../web/api/admin/submissions/index.php");
  const html = read("../web/admin/index.html");
  const adminApp = read("../web/admin/admin.mjs");
  assert.match(auth, /function auth_user_id/);
  assert.doesNotMatch(usersApi, /admin_email_reveal_until/);
  assert.match(read("../web/api/admin/privacy.php"), /admin_mask_email/);
  assert.doesNotMatch(usersApi, /unlock_emails/);
  assert.match(usersApi, /userId/);
  assert.match(submissionsApi, /admin_public_submissions/);
  assert.match(adminApp, /利用開始日/);
  assert.doesNotMatch(adminApp, /unlock_emails/);
  assert.match(adminApp, /submission-group completed/);
  assert.match(html, /id="adminMailForm"/);
  assert.match(html, /id="adminMailUserId"/);
  assert.match(html, /class="admin-section-nav"/);
  assert.match(html, /id="sentMailList"/);
  assert.match(adminApp, /api\/admin\/mail\//);
  assert.match(adminApp, /function sendAdminMail/);
  assert.match(html, /id="collapseAllPanelsButton"/);
  assert.match(adminApp, /function restoreDetailsState/);
  assert.match(adminApp, /function addBulkActions/);
  assert.match(adminApp, /JSON\.stringify\(\{ action, ids \}\)/);
  assert.match(html, /id="announcementLatestLabel"/);
  assert.match(adminApp, /latest\.updatedAt \|\| latest\.date/);
  assert.match(read("../web/admin/admin.css"), /announcements-panel:not\(\.collapsed\) \.panel-latest-label/);
});

test("管理者メールは利用者IDから宛先を解決して個別配送する", () => {
  const api = read("../web/api/admin/mail/index.php");
  const forms = read("../web/api/forms/bootstrap.php");
  assert.match(api, /admin_mail_require_user/);
  assert.match(api, /HTTP_X_CSRF_TOKEN/);
  assert.match(api, /\['individual', 'all_active'\]/);
  assert.match(api, /auth_user_id/);
  assert.match(api, /count\(\$recipients\) > 50/);
  assert.match(api, /admin_mail_last_sent_at/);
  assert.match(api, /foreach \(\$recipients as \$userId => \$recipient\)/);
  assert.match(api, /'action'\s*=>\s*'mail_sent'/);
  assert.match(forms, /function forms_admin_message_mail/);
  assert.match(forms, /もじごとWeb利用者/);
  assert.match(forms, /Auto-Submitted: auto-generated/);
  assert.match(forms, /function forms_load_sent_mail/);
  assert.match(forms, /90 \* 86400/);
  assert.match(api, /\['archive', 'restore', 'remove'\]/);
  assert.match(api, /forms_mutate_sent_mail/);
  assert.match(api, /\$input\['ids'\]/);
});

test("公開領域に基本セキュリティヘッダーを設定する", () => {
  const rules = read("../web/.htaccess");
  assert.match(rules, /Options -Indexes/);
  assert.match(rules, /Strict-Transport-Security/);
  assert.match(rules, /Content-Security-Policy/);
  assert.match(rules, /frame-ancestors 'none'/);
  assert.match(rules, /Permissions-Policy/);
});
