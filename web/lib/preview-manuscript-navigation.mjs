import { manuscriptBodyKey } from './whole-manuscript-body.mjs';
import { isManuscriptFile } from './work-discovery.mjs';
import { manuscriptParentMatches } from './recent-manuscripts.mjs';

export function manuscriptCatalogLocation(rows, root, key) {
  const ancestors = [];
  for (const row of rows) {
    if (row.kind === 'folder') { ancestors.length = row.depth; if (row.status === 'loaded') ancestors[row.depth] = row.item; }
    if (row.key !== key || row.kind !== 'file' || row.status !== 'listed') continue;
    const trail = ancestors.slice(0, row.depth);
    if (trail.length !== row.depth || Array.from({length:row.depth}, (_, i) => !trail[i]?.id).some(Boolean)) throw Error('原稿の章を確認できません。目次を更新してください。');
    return { file: row.item, folder: trail.at(-1) || root, trail };
  }
  throw Error('原稿を確認できません。目次を更新してください。');
}

export function createPreviewManuscriptOpener({ state, elements, saveCurrentFile, openFile,
  cancelAutoSave, scheduleAutoSave, stopExternalMonitor, startExternalMonitor }) {
  return async function open({ file, folder, trail, isCurrent }) {
    if (!isCurrent()) return false;
    const provider = state.provider, work = state.selectedWork;
    const reader = !elements.readerSection.hidden;
    const originKey = manuscriptBodyKey(state.currentFile);
    if (reader && originKey === manuscriptBodyKey(file)) return true;
    if (state.saving || state.syncing || state.deleting || state.openingPreviewManuscript) throw Error('保存・処理中です。完了後にもう一度開いてください。');
    if (state.externalConflict) throw Error('競合を解消してから原稿を開いてください。');
    if (state.dirty && !reader) throw Error('未保存の編集があります。編集画面で保存してください。');
    const draft = elements.readerContent.value, request = state.fileLoadRequest;
    const valid = () => isCurrent() && provider === state.provider && work === state.selectedWork
      && state.fileLoadRequest === request && manuscriptBodyKey(state.currentFile) === originKey
      && elements.readerContent.value === draft;
    state.openingPreviewManuscript = true; cancelAutoSave(); stopExternalMonitor();
    try {
      if (reader && state.dirty) {
        await saveCurrentFile();
        if (!valid()) return false;
        if (state.dirty || state.externalConflict || state.saving || state.originalContent !== draft) throw Error('保存できなかったため移動していません。保存状態を確認してください。');
      }
      if (!valid()) return false;
      const folders = [work.manuscript, ...trail];
      const [metadata, ...parents] = await Promise.all([provider.getItemMetadata(file), ...folders.map(item => provider.getItemMetadata(item))]);
      if (!valid()) return false;
      const target = {...file, ...metadata}, freshFolders = folders.map((item, i) => ({...item, ...parents[i]}));
      if (metadata.id !== file.id || parents.some((item, i) => item.id !== folders[i].id) || !isManuscriptFile(target) || target.folder || freshFolders.some(item => !item.folder)
        || (file.parentReference?.driveId && metadata.parentReference?.driveId && file.parentReference.driveId !== metadata.parentReference.driveId)
        || !manuscriptParentMatches(target, freshFolders.at(-1))
        || freshFolders.some((item, i) => i && !manuscriptParentMatches(item, freshFolders[i - 1]))
        || folder.id !== folders.at(-1).id) throw Error('原稿の場所が変わっています。目次を更新してください。');
      const content = await provider.readText(target);
      if (!valid() || state.dirty || state.externalConflict || state.saving || state.deleting) return false;
      return await openFile(target, { content, location: { folder: freshFolders.at(-1), trail: freshFolders.slice(1) } });
    } finally {
      state.openingPreviewManuscript = false;
      if (provider === state.provider && work === state.selectedWork) {
        if (!elements.readerSection.hidden) startExternalMonitor();
        if (state.dirty) scheduleAutoSave();
      }
    }
  };
}
