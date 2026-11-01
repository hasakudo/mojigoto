import { adminLoginMethodLabel } from "./admin-user-labels.mjs";

export function appendCognitoIdentityDetails(container, user, {
  documentRef = globalThis.document,
  clipboard = globalThis.navigator?.clipboard,
  onNotice = () => {},
} = {}) {
  const details = documentRef.createElement("details");
  details.className = "member-cognito-identities";
  const identities = Array.isArray(user.cognitoIdentities) ? user.cognitoIdentities : [];
  const summary = documentRef.createElement("summary");
  summary.textContent = `Cognito照合用ID${identities.length ? `（${identities.length}件）` : "（未記録）"}`;
  details.append(summary);
  if (!identities.length) {
    const empty = documentRef.createElement("p");
    empty.className = "muted";
    empty.textContent = "この機能の導入後にログインすると照合用IDが記録されます。もじごとの利用者IDとは別のIDです。";
    details.append(empty);
  }
  for (const identity of identities) {
    const item = documentRef.createElement("div");
    item.className = "cognito-identity";
    const provider = documentRef.createElement("strong");
    provider.textContent = adminLoginMethodLabel(identity);
    const issuer = documentRef.createElement("p");
    issuer.textContent = `照合先ユーザープール：${identity.issuer}`;
    const sub = documentRef.createElement("code");
    sub.textContent = identity.sub;
    const copy = documentRef.createElement("button");
    copy.type = "button";
    copy.className = "secondary-button";
    copy.textContent = "subをコピー";
    copy.addEventListener("click", async () => {
      copy.disabled = true;
      try {
        if (!clipboard?.writeText) throw new Error("clipboard unavailable");
        await clipboard.writeText(identity.sub);
        onNotice("Cognito照合用のsubをコピーしました。");
      } catch {
        onNotice("コピーできませんでした。表示中のsubを選択してコピーしてください。", true);
      } finally { copy.disabled = false; }
    });
    item.append(provider, issuer, sub, copy);
    details.append(item);
  }
  container.append(details);
  return details;
}

export function renderRemovedCognitoUsers(container, countLabel, users, options = {}) {
  const documentRef = options.documentRef || globalThis.document;
  const removed = Array.isArray(users) ? users : [];
  countLabel.textContent = `${removed.length}件`;
  container.replaceChildren();
  if (!removed.length) {
    const empty = documentRef.createElement("p");
    empty.className = "empty-state compact";
    empty.textContent = "保存期間内の招待解除済み利用者はいません。";
    container.append(empty);
  }
  for (const user of removed) {
    const card = documentRef.createElement("article");
    card.className = "member-card removed-member-card";
    const identity = documentRef.createElement("div");
    identity.className = "member-identity";
    const title = documentRef.createElement("strong");
    title.textContent = user.nickname || user.id;
    const id = documentRef.createElement("span");
    id.textContent = `${user.id} ｜ ${user.email}`;
    identity.append(title, id);
    const retention = documentRef.createElement("p");
    retention.className = "muted";
    const date = (value) => {
      const parsed = new Date(value);
      return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("ja-JP") : "未記録";
    };
    retention.textContent = `招待解除：${date(user.removedAt)} ／ 照合情報の保存期限：${date(user.retentionExpiresAt)}`;
    card.append(identity, retention);
    appendCognitoIdentityDetails(card, user, { ...options, documentRef });
    container.append(card);
  }
}
