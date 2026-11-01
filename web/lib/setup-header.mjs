export function initSetupHeader({ isBusy, onDisconnect, onStatus }) {
  const el = (id) => document.getElementById(id);
  let client, session, guideWindow = null, announcements = [];
  const closeMenu = () => {
    el("headerMenu").classList.remove("open");
    el("headerMenuButton").setAttribute("aria-expanded", "false");
  };
  const message = (text) => { el("setupSettingsStatus").textContent = text; };
  const guarded = (action) => async () => {
    if (isBusy()) { onStatus("処理中です。完了または中断してから操作してください。"); return; }
    try { await action(); } catch (error) { message(error.message); onStatus(error.message, "error"); }
  };
  el("headerMenuButton").addEventListener("click", (event) => {
    event.stopPropagation();
    const open = el("headerMenu").classList.toggle("open");
    el("headerMenuButton").setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (event) => { if (!el("headerMenu").contains(event.target)) closeMenu(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
  document.querySelector(".topbar .brand").addEventListener("click", (event) => {
    if (isBusy()) { event.preventDefault(); onStatus("処理中です。完了または中断してからHOMEへ戻ってください。"); }
  });
  const applyTheme = () => {
    const value = el("displayThemeSelect").value;
    document.documentElement.dataset.theme = value;
    document.documentElement.dataset.colorScheme = ["dark", "navy", "deep-green"].includes(value) || (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  };
  el("displayThemeSelect").value = document.documentElement.dataset.theme || "system";
  el("displayThemeSelect").addEventListener("change", () => { localStorage.setItem("mojigoto.web.theme", el("displayThemeSelect").value); applyTheme(); });
  globalThis.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (el("displayThemeSelect").value === "system") applyTheme(); });
  const fontScale = Number(localStorage.getItem("mojigoto.web.fontScale"));
  el("displayFontScaleSelect").value = String([0.9, 1, 1.1, 1.2].includes(fontScale) ? fontScale : 1);
  const applyFont = () => document.documentElement.style.setProperty("--ui-font-scale", el("displayFontScaleSelect").value);
  applyFont();
  el("displayFontScaleSelect").addEventListener("change", () => { localStorage.setItem("mojigoto.web.fontScale", el("displayFontScaleSelect").value); applyFont(); });
  el("settingsButton").addEventListener("click", () => { closeMenu(); el("settingsDialog").showModal(); });
  const openGuide = () => {
    closeMenu();
    if (el("settingsDialog").open) el("settingsDialog").close();
    if (session?.authenticated) {
      if (!guideWindow || guideWindow.closed) guideWindow = window.open("./guide.html", "mojigotoWebGuide");
      guideWindow?.focus();
      return;
    }
    el("loginGuideContent").hidden = Boolean(session?.authenticated);
    el("appGuideContent").hidden = !session?.authenticated;
    el("guideDialog").showModal();
  };
  el("guideButton").addEventListener("click", openGuide);
  el("openGuideFromSettingsButton").addEventListener("click", openGuide);
  el("closeGuideButton").addEventListener("click", () => el("guideDialog").close());
  el("googleDriveSetupLink").href = "./google-drive-setup.html";
  el("googleDriveSetupLink").hidden = false;
  el("googleDriveSetupLink").addEventListener("click", (event) => { event.preventDefault(); closeMenu(); el("settingsDialog").close(); });
  const renderUser = () => {
    const label = session?.user?.nickname || session?.user?.email || "";
    el("userIdentityBadge").textContent = label;
    el("userIdentityBadge").title = label;
    el("userIdentityBadge").hidden = !label;
    el("accountSessionPanel").hidden = !session?.authenticated;
    el("accountSessionEmail").textContent = label;
    el("nicknameInput").value = session?.user?.nickname || "";
    el("profilePanel").hidden = !session?.authenticated;
    el("adminPageLink").hidden = !session?.isAdmin;
  };
  el("saveNicknameButton").addEventListener("click", guarded(async () => {
    if (!client || !session?.authenticated) return;
    const button = el("saveNicknameButton");
    button.disabled = true;
    try {
      const result = await client.updateProfile(el("nicknameInput").value, session.csrfToken);
      session.user.nickname = result.nickname;
      renderUser();
      message("ニックネームを保存しました。");
    } finally { button.disabled = false; }
  }));
  el("logoutButton").addEventListener("click", guarded(async () => {
    if (!client || !session?.authenticated) return;
    const result = await client.logout(session.csrfToken);
    location.assign(result.logoutUrl || "./");
  }));
  el("disconnectButton").addEventListener("click", guarded(async () => {
    if (!confirm("Google Driveへの接続許可を取り消します。Driveの作品データは削除しません。続けますか？")) return;
    await onDisconnect();
    message("Google Driveの接続を解除しました。");
  }));
  const readKey = () => `mojigoto.announcements.read.v1.${String(session?.user?.email || "device").trim().toLowerCase()}`;
  const readIds = () => { try { return new Set(JSON.parse(localStorage.getItem(readKey()) || "[]")); } catch { return new Set(); } };
  const id = (item, index) => String(item.id || `${item.date || "date"}:${item.title || index}`);
  const updateBadge = () => {
    const ids = readIds();
    const count = announcements.filter((item, index) => !ids.has(id(item, index))).length;
    el("announcementBadge").textContent = count > 99 ? "99+" : String(count);
    el("announcementBadge").hidden = !count;
    el("markAllAnnouncementsReadButton").hidden = !count;
    el("announcementButton").setAttribute("aria-label", count ? `お知らせを開く（未読${count}件）` : "お知らせを開く");
  };
  const make = (tag, className, text) => { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; };
  const renderNews = () => {
    const ids = readIds();
    el("announcementList").replaceChildren(...announcements.map((item, index) => {
      const key = id(item, index), read = ids.has(key);
      const article = make("article", `announcement-item ${read ? "is-read" : "is-unread"}`, "");
      article.append(make("time", "", String(item.date || "")), make("h3", "", String(item.title || "お知らせ")), make("p", "", String(item.summary || "")));
      const actions = make("div", "announcement-item-actions", "");
      if (/^https:\/\//i.test(String(item.url || ""))) {
        const link = make("a", "", "詳しく見る"); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; actions.append(link);
      }
      const button = make("button", "announcement-read-button", read ? "既読" : "既読にする");
      button.type = "button"; button.disabled = read;
      button.addEventListener("click", () => { const ids = readIds(); ids.add(key); localStorage.setItem(readKey(), JSON.stringify([...ids])); updateBadge(); renderNews(); });
      actions.append(button); article.append(actions); return article;
    }));
    if (!announcements.length) el("announcementList").textContent = "現在、新しいお知らせはありません。";
  };
  const loadNews = async () => {
    const response = await fetch("./announcements.json", { cache: "no-store" });
    if (!response.ok) throw new Error("お知らせを読み込めませんでした。");
    const data = await response.json(); announcements = Array.isArray(data.items) ? data.items : []; updateBadge();
  };
  el("announcementButton").addEventListener("click", async () => {
    closeMenu(); el("announcementDialog").showModal(); el("announcementList").textContent = "お知らせを読み込んでいます…";
    try { await loadNews(); renderNews(); } catch (error) { el("announcementList").textContent = error.message; }
  });
  el("closeAnnouncementButton").addEventListener("click", () => el("announcementDialog").close());
  el("markAllAnnouncementsReadButton").addEventListener("click", () => {
    const ids = readIds(); announcements.forEach((item, index) => ids.add(id(item, index))); localStorage.setItem(readKey(), JSON.stringify([...ids])); updateBadge(); renderNews();
  });
  return {
    setSession(value, authClient) { session = value; client = authClient; renderUser(); loadNews().catch(() => {}); },
    setConnected(connected) {
      el("connectionBadge").hidden = !connected;
      el("connectionBadgeLabel").textContent = "Google Drive 接続済み";
      el("disconnectButton").disabled = !connected;
    },
  };
}
