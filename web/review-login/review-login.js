async function updateReviewLoginStatus() {
  const status = document.getElementById('reviewLoginStatus');
  const available = document.getElementById('reviewLoginAvailable');
  available.hidden = true;
  status.textContent = '審査用ログインの受付状況を確認しています。';
  try {
    const response = await fetch('../api/auth/review-status/', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Status unavailable');
    const data = await response.json();
    if (data.enabled === true) {
      status.textContent = '審査用ログインを受け付けています。';
      available.hidden = false;
    } else if (data.enabled === false) {
      status.textContent = '審査用ログインは現在停止中です。審査の実施期間にのみご利用いただけます。';
    } else {
      throw new Error('Invalid status');
    }
  } catch {
    status.textContent = '審査用ログインの受付状況を確認できませんでした。時間をおいてページを再読み込みしてください。';
  }
}

// 戻る操作でページが復元された場合も、サーバーの現在の設定を確認します。
window.addEventListener('pageshow', updateReviewLoginStatus);
