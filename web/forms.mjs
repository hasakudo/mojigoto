const form = document.querySelector("[data-public-form]");
const status = document.getElementById("formStatus");
const submitButton = document.getElementById("submitButton");
const turnstileArea = document.getElementById("turnstileArea");
let turnstileWidgetId = null;

function showStatus(message, isError = false) {
  status.textContent = message;
  status.className = `form-status${isError ? " error" : ""}`;
  status.hidden = false;
  status.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function loadTurnstile(siteKey) {
  return new Promise((resolve, reject) => {
    if (!siteKey) {
      reject(new Error("フォームのスパム対策が未設定です。管理者へお知らせください。"));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      turnstileWidgetId = window.turnstile.render(turnstileArea, {
        sitekey: siteKey,
        action: form.dataset.publicForm,
        theme: document.documentElement.dataset.colorScheme === "dark" ? "dark" : "light",
        language: "ja",
      });
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("スパム対策を読み込めませんでした。通信環境をご確認ください。")), { once: true });
    document.head.append(script);
  });
}

async function initialize() {
  try {
    const response = await fetch("../config.json", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("フォーム設定を読み込めませんでした。");
    const config = await response.json();
    await loadTurnstile(String(config.turnstileSiteKey || "").trim());
    submitButton.disabled = false;
  } catch (error) {
    showStatus(error.message || "フォームを準備できませんでした。", true);
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.type = form.dataset.publicForm;
  payload.turnstileToken = String(formData.get("cf-turnstile-response") || "");
  submitButton.disabled = true;
  status.hidden = true;
  try {
    const response = await fetch("../api/forms/submit/", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `送信できませんでした（HTTP ${response.status}）。時間をおいてお試しください。`);
    form.reset();
    form.classList.add("completed");
    if (applicationNote) applicationNote.hidden = true;
    if (applicationLead) applicationLead.textContent = payload.requestKind === "withdraw"
      ? "利用解除申込を受け付けました。本人確認後に解除を行います。受付メールをご確認ください。"
      : "利用申込を受け付けました。内容を確認後、登録可否をメールでご案内します。受付メールをご確認ください。";
    showStatus(result.message || "送信しました。受付メールをご確認ください。");
  } catch (error) {
    showStatus(error.message || "送信できませんでした。", true);
    if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
  } finally {
    submitButton.disabled = false;
  }
});

const requestKind = document.getElementById("requestKind");
const discoveryField = document.getElementById("discoveryField");
const discovery = document.getElementById("discovery");
const applicationLead = document.getElementById("applicationLead");
const applicationNote = document.getElementById("applicationNote");
const applicationEmailLabel = document.getElementById("applicationEmailLabel");
function updateApplicationMode() {
  if (!requestKind) return;
  const withdrawal = requestKind.value === "withdraw";
  discoveryField.hidden = withdrawal;
  discovery.disabled = withdrawal;
  discovery.required = !withdrawal;
  submitButton.textContent = withdrawal ? "利用解除を申し込む" : "利用を申し込む";
  applicationEmailLabel.textContent = withdrawal ? "登録を解除するメールアドレス" : "登録申請するメールアドレス";
  applicationLead.textContent = withdrawal
    ? "もじごと Webの利用解除申込です。第三者による申請を防ぐため、登録メールアドレスの確認後に解除します。"
    : "申込後すぐに利用可能になるものではありません。内容を確認後、登録可否をメールでご案内します。";
  applicationNote.textContent = withdrawal
    ? "現在もじごと Webへ登録しているメールアドレスを入力してください。"
    : "Microsoft または Googleアカウントでログインが可能なメールアドレスを入力してください。";
}
requestKind?.addEventListener("change", updateApplicationMode);
updateApplicationMode();

initialize();
