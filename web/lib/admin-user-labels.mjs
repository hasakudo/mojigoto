export function adminLoginMethodLabel(user = {}) {
  if (user.provider === "google") return "Google";
  if (user.provider === "microsoft") return "Microsoft";
  if (user.provider === "email") return "審査用（メール・パスワード）";
  return user.lastLoginAt ? "ログイン済み（方式未記録）" : "ログイン記録なし";
}
