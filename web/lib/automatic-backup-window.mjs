// Remember only confirmed automatic snapshots, for this browser tab's session.
export function confirmedBackupTime(storage, key, intervalMs, now = Date.now()) {
  if (!storage || !key || !(intervalMs > 0)) return 0;
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    const time = value?.createdAt;
    if (value?.version !== 1 || !Number.isFinite(time) || time <= 0 || now < time || now - time >= intervalMs) return 0;
    return time;
  } catch { return 0; }
}

export function rememberBackupTime(storage, key, createdAt, now = Date.now()) {
  const time = Date.parse(createdAt);
  if (!storage || !key || !Number.isFinite(time) || time <= 0 || time > now) return;
  try { storage.setItem(key, JSON.stringify({ version: 1, createdAt: time })); } catch { /* Storage is optional. */ }
}
