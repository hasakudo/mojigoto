const path = require('path');
const { createHash } = require('crypto');

function normalizedPath(value) {
  const result = path.normalize(String(value || '').trim());
  return process.platform === 'win32' ? result.toLowerCase() : result;
}
function contentFingerprint(memo) {
  return createHash('sha256').update(JSON.stringify({
    title: String(memo?.title || ''), body: String(memo?.body || ''), type: String(memo?.type || 'text'),
    listItems: Array.isArray(memo?.listItems) ? memo.listItems : [],
    todoItems: Array.isArray(memo?.todoItems) ? memo.todoItems : [],
  })).digest('hex');
}
function isCopyOf(memo, input) {
  const source = memo?.source;
  if (!input.memoId || source?.kind !== 'writingMemo' || String(source.memoId || '') !== input.memoId) return false;
  if (source.writingMemoFilePath || input.writingMemoFilePath) {
    if (source.writingMemoFilePath && input.writingMemoFilePath) return normalizedPath(source.writingMemoFilePath) === normalizedPath(input.writingMemoFilePath);
    if (source.writingMemoFilePath) return false;
  }
  // Older copies have no store identity. Match only the same memo and manuscript path.
  return Boolean(input.filePath) && normalizedPath(source.filePath) === normalizedPath(input.filePath);
}

function createWritingMemoConceptCopier({ vscode, readConceptMemos, writeConceptMemos }) {
  const queues = new Map();
  async function apply(targetFilePath, input) {
    const initial = await readConceptMemos(targetFilePath);
    const candidates = (Array.isArray(initial?.memos) ? initial.memos : []).filter(memo => memo?.id && isCopyOf(memo, input));
    let selected = null;
    let skipFutureConfirmation = false;
    if (candidates.length) {
      const choice = await vscode.window.showQuickPick([
        { label: '既存を更新', action: 'update', description: candidates.length === 1 ? String(candidates[0].title || '無題') : `${candidates.length}件から更新先を選択` },
        { label: '新しく作成', action: 'create', description: '既存の構想メモを残して、別のメモを追加' },
      ], { title: '構想メモへの反映', placeHolder: 'この執筆メモから作成した構想メモがあります', ignoreFocusOut: true });
      if (!choice) return null;
      if (choice.action === 'update') {
        selected = candidates.length === 1 ? candidates[0] : (await vscode.window.showQuickPick(
          candidates.map(memo => ({ label: String(memo.title || '無題'), description: memo.isArchived ? '保管中' : '', detail: String(memo.body || '').slice(0, 160), memo })),
          { title: '更新する構想メモを選択', placeHolder: '選んだメモのタイトル・本文を更新します', ignoreFocusOut: true },
        ))?.memo;
        if (!selected) return null;
        const baseline = selected.source?.writingMemoCopyFingerprint;
        const confirmationEnabled = vscode.workspace?.getConfiguration?.('mojigoto')?.get('confirmWritingMemoConceptOverwrite', true) !== false;
        if (confirmationEnabled) {
          const confirmed = await vscode.window.showWarningMessage(
            `構想メモ「${String(selected.title || '無題')}」を上書き更新しますか？`,
            { modal: true, detail: (!baseline ? '以前の反映内容を確認できないコピーです。'
              : baseline !== contentFingerprint(selected) ? '構想メモ側で内容が編集されています。'
                : '現在の内容と反映する内容をご確認ください。') +
              '\n形式・タイトル・本文を置き換えます。タグ・フォルダ・ピン・保管状態は残ります。\n\n現在：' +
              String(selected.title || '') + '\n' + String(selected.body || '').slice(0, 240) +
              '\n\n反映後：' + input.title + '\n' + input.body.slice(0, 240) },
            '上書き更新', '上書き更新して次回から省略',
          );
          if (!['上書き更新', '上書き更新して次回から省略'].includes(confirmed)) return null;
          skipFutureConfirmation = confirmed === '上書き更新して次回から省略';
        }
      } else if (choice.action !== 'create') return null;
    }

    // Dialogs may be open for some time. Preserve other changes and the latest storage revision.
    const data = await readConceptMemos(targetFilePath);
    const memos = Array.isArray(data?.memos) ? [...data.memos] : [];
    if (!candidates.length && memos.some(memo => isCopyOf(memo, input))) {
      throw new Error('処理中に同じ執筆メモの反映先が追加されました。もう一度反映方法を選んでください。');
    }
    let index = -1;
    if (selected) {
      const matches = memos.map((memo, index) => ({ memo, index })).filter(entry => entry.memo?.id === selected.id);
      if (matches.length !== 1 || !isCopyOf(matches[0].memo, input) || JSON.stringify(matches[0].memo) !== JSON.stringify(selected)) {
        throw new Error('選択中に更新先の構想メモが変更されました。内容を確認して、もう一度反映してください。');
      }
      index = matches[0].index;
    }
    const writingFolderId = Array.isArray(data?.folders) && data.folders.some(folder => folder?.id === 'writing') ? 'writing' : '';
    const now = new Date().toISOString();
    const previous = index >= 0 ? memos[index] : null;
    const nextMemo = previous ? {
      ...previous, type: 'text', title: input.title, body: input.body, listItems: [], todoItems: [], updatedAt: now,
    } : {
      id: `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'text', folderId: writingFolderId, title: input.title, body: input.body,
      tags: [], isPinned: false, isArchived: false, showInDashboard: false,
      createdAt: now, updatedAt: now,
    };
    nextMemo.source = {
      ...(previous?.source || {}), kind: 'writingMemo', filePath: input.filePath, excerpt: input.excerpt, memoId: input.memoId,
      ...(input.writingMemoFilePath ? { writingMemoFilePath: input.writingMemoFilePath } : {}),
      writingMemoCopyFingerprint: contentFingerprint(nextMemo),
    };
    if (index >= 0) memos[index] = nextMemo; else memos.unshift(nextMemo);
    await writeConceptMemos(targetFilePath, { ...data, memos, updatedAt: now });
    if (skipFutureConfirmation) {
      try {
        await vscode.workspace.getConfiguration('mojigoto').update('confirmWritingMemoConceptOverwrite', false, vscode.ConfigurationTarget.Global);
      } catch (error) {
        vscode.window.showWarningMessage('もじごと: 構想メモの更新は完了しましたが、比較確認の省略設定を保存できませんでした。' + String(error?.message || error));
      }
    }
    return { updated: index >= 0 };
  }
  function copy(targetFilePath, input) {
    const key = normalizedPath(targetFilePath);
    const task = (queues.get(key) || Promise.resolve()).catch(() => {}).then(() => apply(targetFilePath, input));
    queues.set(key, task);
    const cleanup = () => { if (queues.get(key) === task) queues.delete(key); };
    task.then(cleanup, cleanup);
    return task;
  }
  return { copy };
}
module.exports = { createWritingMemoConceptCopier };
