const SCREENS = [
  ["authBoot", "ログイン確認中"], ["loginGate", "ログイン画面"],
  ["readerSection", "原稿編集"], ["noteEditorSection", "ノート編集"],
  ["conceptMemoEditorSection", "構想メモ編集"], ["workSettingsSection", "作品設定"],
  ["filesSection", "原稿一覧"], ["notesSection", "ノート一覧"],
  ["conceptMemosSection", "構想メモ一覧"], ["worksSection", "作品一覧"],
  ["browserSection", "クラウドフォルダ選択"], ["connectionPanel", "HOME（クラウド接続）"],
];
const DIALOGS = {
  settingsDialog: "接続設定", announcementDialog: "お知らせ", guideDialog: "もじごとガイド",
  newFileDialog: "新規原稿", newFolderDialog: "新規フォルダ", moveFileDialog: "原稿の移動",
  newNoteDialog: "新規ノート", relatedNoteDialog: "関連ノートの追加", relatedPreviewDialog: "関連ノート参照",
  addressBookDialog: "呼び名一覧", manuscriptPreviewDialog: "原稿プレビュー", notePreviewDialog: "ノートプレビュー",
  progressShareDialog: "進捗画像", manuscriptBackupDialog: "バックアップ・履歴",
  tagHistoryDialog: "タグ履歴", editorListDialog: "原稿一覧パネル", conflictDialog: "保存競合の確認",
};

// Accept only UI state; never serialize work names, file IDs, paths or content.
export function environmentContext({ visibleSections = [], openDialogs = [], noteType, dirty, saving, externalConflict, manuscriptPreviewMode } = {}) {
  const section = SCREENS.find(([id]) => visibleSections.includes(id));
  let screen = section?.[1] || "画面を確認できませんでした";
  if (["notesSection", "noteEditorSection"].includes(section?.[0])) {
    screen = `${noteType === "reference" ? "資料" : "プロット"}${section[0] === "noteEditorSection" ? "編集" : "一覧"}`;
  }
  const editor = ["readerSection", "noteEditorSection", "conceptMemoEditorSection", "workSettingsSection"].includes(section?.[0]);
  let status = editor ? `編集中（${saving ? "保存中" : externalConflict ? "保存競合あり" : dirty ? "未保存の変更あり" : "未保存の変更なし"}）` : "一覧・案内表示";
  if (openDialogs.includes("manuscriptPreviewDialog")) status = `原稿プレビュー（${manuscriptPreviewMode === "vertical" ? "縦書き" : "横書き"}）`;
  else if (openDialogs.includes("notePreviewDialog")) status = "ノートプレビュー";
  const dialogs = [...new Set(openDialogs.map(id => DIALOGS[id] || "その他の操作画面"))];
  return [`表示画面: ${screen}`, `表示状態: ${status}`, `開いている操作画面: ${dialogs.join("・") || "なし"}`];
}
