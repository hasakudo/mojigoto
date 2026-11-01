(() => {
  const build = document.currentScript?.dataset.build || "1.0.282";
  const base = new URL("./", document.currentScript?.src || document.baseURI);
  const retryKey = `mojigoto.web.bootRetry:${base.href}:${build}`;
  let appStarted = false;
  let retrying = false;
  let complete = false;
  let timer;
  const registration = navigator.serviceWorker
    ? navigator.serviceWorker.register(new URL("sw.js", base), { updateViaCache: "none" }).catch(() => null)
    : Promise.resolve(null);

  function pending() {
    const boot = document.getElementById("authBoot");
    return boot && !boot.hidden;
  }
  function showFailure(message) {
    if (complete || !pending()) return;
    const boot = document.getElementById("authBoot");
    boot.dataset.error = "true";
    boot.removeAttribute("aria-busy");
    const label = document.getElementById("authBootMessage");
    if (label) label.textContent = message;
    if (!document.getElementById("bootRetryButton")) {
      const button = document.createElement("button");
      button.id = "bootRetryButton";
      button.type = "button";
      button.className = "secondary-button";
      button.textContent = "更新を確認して再読み込み";
      button.addEventListener("click", () => retryStartup(false));
      boot.querySelector(".auth-boot-content")?.append(button);
    }
  }
  function firstRetry() {
    try {
      if (sessionStorage.getItem(retryKey)) return false;
      sessionStorage.setItem(retryKey, "1");
      return true;
    } catch { return false; }
  }
  async function refreshWorker() {
    // Registration must not make startup recovery wait indefinitely either.
    await Promise.race([
      registration.then(async (reg) => {
        if (!reg) return;
        await reg.update();
        const worker = reg.installing || reg.waiting;
        if (!worker || worker.state === "activated" || worker.state === "redundant") return;
        await new Promise((resolve) => {
          const changed = () => {
            if (worker.state === "activated" || worker.state === "redundant") {
              worker.removeEventListener("statechange", changed);
              resolve();
            }
          };
          worker.addEventListener("statechange", changed);
          changed();
        });
      }).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  }
  async function retryStartup(automatic) {
    if (retrying || complete || !pending()) return;
    if (automatic && (appStarted || !document.body?.classList.contains("auth-pending") || !firstRetry())) {
      showFailure("読み込みを完了できませんでした。\n接続を確認して、更新を確認し直してください。");
      return;
    }
    if (!window.dispatchEvent(new Event("mojigoto:before-startup-reload", { cancelable: true }))) {
      showFailure("編集中または保存中のため再読み込みできません。\n内容を保存してからお試しください。");
      return;
    }
    retrying = true;
    showFailure("更新を確認しています…");
    const button = document.getElementById("bootRetryButton");
    if (button) button.disabled = true;
    await refreshWorker();
    if (complete || !pending()) { retrying = false; return; }
    if (!window.dispatchEvent(new Event("mojigoto:before-startup-reload", { cancelable: true }))) {
      retrying = false;
      if (button) button.disabled = false;
      showFailure("編集中または保存中のため再読み込みを中止しました。");
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set("mojigoto_update", build);
    location.replace(url.href);
  }
  function checkReady() {
    const boot = document.getElementById("authBoot");
    if (!boot || !boot.hidden || document.body?.classList.contains("auth-pending")) return;
    complete = true;
    clearTimeout(timer);
    observer.disconnect();
    try { sessionStorage.removeItem(retryKey); } catch {}
  }
  window.addEventListener("mojigoto:app-started", () => { appStarted = true; });
  window.addEventListener("mojigoto:boot-failed", () => showFailure("読み込みに失敗しました。\n接続を確認して、更新を確認し直してください。"));
  window.addEventListener("error", (event) => {
    if (event.target?.tagName === "SCRIPT" && !appStarted && pending()) void retryStartup(true);
  }, true);
  const observer = new MutationObserver(checkReady);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
  timer = setTimeout(() => { if (pending() && !complete) void retryStartup(true); }, 20000);
  checkReady();
})();
