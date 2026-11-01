import { discoverWorkCatalog } from "./lib/catalog-delta.mjs";
import { bindCreateDialogForm } from "./lib/create-dialog-form.mjs";
import { createManuscriptRenameController, renameManuscriptReferences } from "./lib/manuscript-rename.mjs";
import { createPreviewManuscriptOpener } from './lib/preview-manuscript-navigation.mjs';
import { createManuscriptCatalogController } from "./lib/manuscript-catalog-controller.mjs";
import { createConceptBatchSaveController } from "./lib/concept-batch-save.mjs";
import { createConceptSearchController } from "./lib/concept-search-controller.mjs";
import { createManuscriptSearchController } from "./lib/manuscript-search-controller.mjs";
import { createNoteSearchController } from "./lib/note-search-controller.mjs";
import { createRelatedWorkSettingsController } from "./lib/related-work-settings-controller.mjs";
import { referenceWorkKey } from "./lib/shared-note-reader.mjs";
import { createReferenceWorkCatalog } from "./lib/reference-work-catalog.mjs";
import { createNotePreviewWorkController } from "./lib/note-preview-work-controller.mjs";
import { createReaderNoteReferenceController } from "./lib/reader-note-reference-controller.mjs";
import { createProgressActions } from "./lib/progress-actions.mjs";
import { createProgressRendering } from "./lib/progress-rendering.mjs";
import { createProgressLoading } from "./lib/progress-loading.mjs";
import { createBackupRestoreController } from "./lib/backup-restore.mjs";
import { createBackupComparisonController } from "./lib/backup-comparison-controller.mjs";
import { createBackupCreation } from "./lib/backup-creation.mjs";
import { createBackupStorage } from "./lib/backup-storage.mjs";
import { createViewNavigationController } from "./lib/view-navigation.mjs";
import { createRecentViewHistory, createRecentViewRestorer } from "./lib/recent-view-history.mjs";
import { createAutoConnectionController, createConnectionInitializer } from "./lib/cloud-connection.mjs";
import { createWorkSettingsPersistence } from "./lib/work-settings-persistence.mjs";
import { createConceptSourceResolver } from "./lib/concept-source-resolver.mjs";
import { autoReflectSelection, setAutoReflectSelection, conceptAutoReflectEnabled } from "./lib/memo-auto-reflect.mjs";
import { keepExistingMemoDefaultsOff } from "./lib/memo-auto-reflect-settings.mjs";
import { createConceptSaveController } from "./lib/concept-save.mjs";
import { createConceptMemoSyncController } from "./lib/concept-memo-sync.mjs";
import { createNoteSaveController } from "./lib/note-save.mjs";
import { createManuscriptLoadController } from "./lib/manuscript-load.mjs";
import { createEditorExternalUpdateController } from "./lib/editor-external-update.mjs";
import { createManuscriptSaveController } from "./lib/manuscript-save.mjs";
import { createEditorSaveScheduler } from "./lib/editor-save-scheduler.mjs";
import { MicrosoftAuth } from "./auth/pkce.mjs";
import { environmentContext } from "./lib/environment-context.mjs";
import { clearAppCache } from "./lib/app-recovery.mjs";
import { GoogleDriveAuth } from "./auth/google-drive.mjs?v=1.0.1";
import { DropboxAuth } from "./auth/dropbox.mjs";
import { DropboxProvider } from "./storage/dropbox-provider.mjs?v=1.0.1";
import { OneDriveConflictError, OneDriveProvider } from "./storage/onedrive-provider.mjs?v=1.0.281";
import { GoogleDriveProvider } from "./storage/google-drive-provider.mjs?v=1.0.4";
import { GoogleDrivePicker } from "./storage/google-drive-picker.mjs";
import { collectWorkIndex, collectWorkIndexes, collectWorkMetrics, createWorkCatalogSnapshot, discoverReferenceWorks, discoverWorks, isManuscriptFile, safeDriveItemSnapshot, sortDriveItems, workMetricSummaryKey } from "./lib/work-discovery.mjs";
import { normalizeManuscriptFileName, normalizeManuscriptFolderName } from "./lib/file-names.mjs";
import { hasExternalVersion, hasSameExternalContent, writeTextWithBaseline } from "./lib/editor-sync.mjs";
import { deleteEditorItem } from "./lib/editor-delete.mjs";
import { appendWritingEvent, makeWritingEvent } from "./lib/writing-records.mjs?v=1.0.1";
import { applyInputAssistToTextarea } from "./lib/input-assist.mjs";
import { countTextByMode } from "./lib/text-count.mjs";
import { normalizePreviewLineCharacters, parseManuscriptPreview } from "./lib/manuscript-preview.mjs";
import { parseNoteInline } from "./lib/note-inline.mjs";
import { locateConceptSource } from "./lib/concept-source.mjs";
import {
  BACKUP_AUTO_INTERVAL_MS,
  backupContentLabel,
  summarizeBackupContent,
  emptyBackupIndex,
} from "./lib/backup-format.mjs";
import { makeNoteIndexEntry, matchesNoteIndexEntry, mergeNoteIndexEntries, normalizeNoteIndex } from "./lib/note-index.mjs";
import { isManagedDeployment, loadRuntimeConfig, resolveGoogleClientId, resolveMicrosoftClientId } from "./lib/runtime-config.mjs";
import { UserAuthClient } from "./lib/user-auth.mjs";
import { groupRecentViews, homeRecentViews, isRecentEditorRoute, isRecentViewEntry, normalizeRecentViews, recentViewKey, recentViewLabel, recentViewLocationLabel, recentViewsForWork, recentWorkDestination, updateRecentViews, updateWorkRecentViews, setWorkRecentViewPinned } from "./lib/recent-views.mjs";
import { createEditorPopupLayout } from "./lib/editor-popup-layout.mjs";
import { NewDocumentDraft, templatePreviewText } from "./lib/template-import.mjs";
import { inspectNoteTemplate, templateDestinations, prepareTemplateDestination, applyTemplateDestination, attachImportSource, textHash, resolveImportedNoteLink } from "./lib/note-template-sync.mjs";
import { findImportedTarget } from "./lib/generated-note-markdown.mjs";
import { loadPreviewAddressBook } from "./lib/imported-address-book.mjs";
import { templateDestinationPresentation, createTemplateComparison, templateComparisonPage } from "./lib/note-template-presentation.mjs";
import { normalizeRecentManuscripts, updateRecentManuscripts, manuscriptParentMatches } from "./lib/recent-manuscripts.mjs";
import {
  NOTE_TYPES,
  addRelatedTarget,
  collectRelatedTargets,
  createNote,
  createNoteDivider,
  createNoteEntry,
  matchesNoteQuery,
  matchesRelatedTarget,
  moveNoteItem,
  moveNoteItemToGroup,
  normalizeAddressBook,
  normalizeNote,
  notePreview,
  slugifyNoteTitle,
} from "./lib/notes.mjs";
import {
  applyMemoEditableText,
  conceptMemoFolderIds,
  conceptMemoPreview,
  createConceptMemo,
  matchesConceptMemo,
  memoEditableText,
  normalizeConceptDocument,
  sortConceptMemos,
} from "./lib/concept-memos.mjs";
import "./lib/concept-note-order.js";
const { buildConceptNoteIndex, conceptMemoNotePositions, matchesConceptNote, sortConceptMemosByNote } = globalThis.MojigotoConceptNoteOrder;
import {
  noteMemoPayload,
  syncFingerprint,
} from "./lib/concept-sync.mjs";
import { normalizeGenres, normalizeWorkSettings } from "./lib/work-settings.mjs";

const CLIENT_ID_KEY = "mojigoto.microsoft.clientId";
const ROOT_KEY = "mojigoto.onedrive.workRoot";
const GOOGLE_ROOT_KEY = "mojigoto.googleDrive.workRoot";
const DROPBOX_ROOT_KEY = "mojigoto.dropbox.workRoot";
const CLOUD_KIND_KEY = "mojigoto.cloud.kind";
const AUTO_CONNECT_KEY = "mojigoto.cloud.autoConnect.v1";
const AUTO_SAVE_KEY = "mojigoto.editor.autoSave";
const NOTE_AUTO_REFLECT_KEY = "mojigoto.web.noteToConceptAutoReflect";
const CONCEPT_AUTO_REFLECT_KEY = "mojigoto.web.conceptToNoteAutoReflect";
const INPUT_ASSIST_KEY = "mojigoto.editor.inputAssist";
const CONCEPT_EDITOR_LIST_KEY = "mojigoto.editor.conceptList";
const COUNT_MODE_KEY = "mojigoto.editor.countMode";
const WORK_METRICS_KEY = "mojigoto.works.collectMetrics";
const WORK_CHARACTER_CACHE_KEY = "mojigoto.works.characterCounts.v1";
const WORK_SETTINGS_CACHE_KEY = "mojigoto.works.settingsSummaries.v1";
const WORK_SHARED_METRICS_CACHE_KEY = "mojigoto.works.sharedMetrics.v1";
const WORK_METRIC_SUMMARY_CACHE_KEY = "mojigoto.works.metricSummaries.v1";
const WORK_CATALOG_CACHE_KEY = "mojigoto.works.catalog.v1";
const VIEW_PREFERENCES_KEY = "mojigoto.web.viewPreferences.v1";
const RECENT_VIEWS_KEY = "mojigoto.web.recentViews.v1";
const WORK_RECENT_VIEWS_KEY = "mojigoto.web.workRecentViews.v1";
const RECENT_MANUSCRIPTS_KEY = "mojigoto.web.recentManuscripts.v1";
const PENDING_RECENT_VIEW_KEY = "mojigoto.web.pendingRecentView.v1";
const THEME_KEY = "mojigoto.web.theme";
const FONT_SCALE_KEY = "mojigoto.web.fontScale";
const WRITING_FONT_KEY = "mojigoto.web.writingFont";
const DISPLAY_FONT_SCALES = [0.9, 1, 1.1, 1.2];
const DISPLAY_THEMES = ["system", "light", "beige", "green", "dark", "navy", "deep-green"];
const DARK_DISPLAY_THEMES = new Set(["dark", "navy", "deep-green"]);
const ANNOUNCEMENT_READ_KEY = "mojigoto.announcements.read.v1";
const TAG_HISTORY_KEY = "mojigoto.tags.history.v1";
const MANUSCRIPT_PREVIEW_MODE_KEY = "mojigoto.editor.previewMode";
const MANUSCRIPT_PREVIEW_FONT_KEY = "mojigoto.editor.previewFont";
const MANUSCRIPT_PREVIEW_FONT_SIZE_KEY = "mojigoto.editor.previewFontSize";
const MANUSCRIPT_PREVIEW_LINE_CHARACTERS_KEY = "mojigoto.editor.previewLineCharacters";
const MANUSCRIPT_PREVIEW_AUTO_FIT_KEY = "mojigoto.editor.previewAutoFit";
const MANUSCRIPT_PREVIEW_LINE_HEIGHT_KEY = "mojigoto.editor.previewLineHeight";
const MANUSCRIPT_PREVIEW_FONT_SIZES = [13, 14, 15, 16, 17, 18];
const BACKUP_INTERVAL_KEY = "mojigoto.editor.backupIntervalMinutes";
const PROGRESS_SHARE_OPTIONS_KEY = "mojigoto.progressShare.options.v1";
const PROGRESS_SHARE_DATE_KEY = "mojigoto.progressShare.date.v1";
const PROGRESS_SHARE_MODE_KEY = "mojigoto.progressShare.mode.v1";
const PROGRESS_SHARE_YEAR_KEY = "mojigoto.progressShare.year.v1";
const MANUSCRIPT_FOLDER_NAMES = new Set(["manuscript", "原稿"]);
const AUTO_SAVE_DELAY = 2000;
const EXTERNAL_CHECK_INTERVAL = 3000;
const USER_ACCESS_CHECK_INTERVAL = 60000;
const VIEW_CACHE_DURATION = 30000;

const elements = Object.fromEntries([
  "deleteManuscriptButton", "deleteNoteButton", "deleteConceptMemoButton",
  "recentViewsPanel", "recentViewsList", "recentViewsCount",
  "workRecentViewsDialog", "workRecentViewsTitle", "workRecentViewsList", "closeWorkRecentViewsButton",
  "wholeBodyEdit", "wholeBodyNavigation", "wholeBodySettings", "wholeBodyFileInfo", "wholeBodySource", "readerPreviewSettings", "wholeBodyMode", "wholeBodyFont", "wholeBodyFontSize", "wholeBodyAutoFit", "wholeBodyLineCharacters", "wholeBodyLineHeight", "wholeBodyVerticalSettings", "wholeManuscriptPagination", "wholeManuscriptToolbar", "wholeManuscriptHelp", "wholeBodyPane", "wholeBodyOpen", "wholeBodyBack", "wholeBodyPrevious", "wholeBodyNext", "wholeBodyRetry", "wholeBodyStop", "wholeBodyStatus", "wholeBodyContent", "openWholeManuscriptButton", "readerWholeManuscriptButton", "wholeManuscriptDialog", "wholeManuscriptTitle", "wholeManuscriptStatus", "wholeManuscriptList", "wholeManuscriptNotice", "closeWholeManuscriptButton", "stopWholeManuscriptButton", "refreshWholeManuscriptButton", "retryWholeManuscriptButton", "wholeManuscriptPrev", "wholeManuscriptNext", "wholeManuscriptPage",
  "authBoot", "authBootMessage", "loginGate", "loginTitle", "loginMessage", "loginProviderActions", "microsoftLoginLink",
  "googleLoginLink", "emailLoginLink", "loginGuideButton", "connectionPanel", "connectionDescription", "connectButton", "connectGoogleDriveButton",
  "selectGoogleDriveFolderButton", "googleDriveSetupLink", "googleDriveAdditionalButton", "googleDriveAdditionalHelp", "googleDriveAdditionalActions", "connectDropboxButton", "autoConnectCheckbox", "autoConnectHelp", "googleDriveReconnectNotice", "googleDriveReconnectMessage", "reconnectGoogleDriveButton",
  "browserSection", "breadcrumbs",
  "folderList", "selectFolderButton", "worksSection", "workRootLabel", "worksList", "worksCount",
  "workStatusFilter", "workStatusFilterLabel", "workSortField", "workSortDirection", "workMetricsToggle", "worksLoadingStatus",
  "globalWorkNav", "connectionBadge", "connectionBadgeLabel", "userIdentityBadge", "headerMenuButton", "headerMenu",
  "changeFolderButton", "filesSection", "selectedWorkTitle", "filesList", "filesCount", "backToWorksButton",
  "recentManuscriptsPanel", "recentManuscriptsCount", "recentManuscriptsList", "recentManuscriptsNotice",
  "manuscriptBreadcrumbs",
  "readerSection", "readerTitle", "readerMeta", "readerContent", "readerStatus", "backToFilesButton",
  "autoSaveToggle", "saveFileButton", "newFileButton", "newFileDialog", "newFileForm",
  "newFolderButton", "newFolderDialog", "newFolderForm", "newFolderNameInput", "newFolderError", "createFolderButton",
  "renameManuscriptDialog", "renameManuscriptForm", "renameManuscriptTitle", "renameManuscriptInput", "renameManuscriptExtension", "renameManuscriptHelp", "renameManuscriptError", "renameManuscriptButton", "cancelRenameManuscriptButton",
  "moveFileDialog", "moveFileTitle", "moveFileName", "moveFileDestinations", "closeMoveFileButton",
  "inputAssistToggle", "inputAssistBar", "inputAssistSymbolsButton", "inputAssistSymbolsMenu", "readerAddressBookButton", "readerPreviewLauncher", "readerPreviewButton", "readerListButton", "readerCountModeDetails", "readerCountMode", "readerJumpControls", "jumpToTopButton", "jumpToBottomButton",
  "manuscriptPreviewDialog", "manuscriptPreviewTitle", "manuscriptPreviewMode", "manuscriptPreviewFont", "manuscriptPreviewFontSize", "manuscriptPreviewAutoFitWrap", "manuscriptPreviewAutoFit", "manuscriptPreviewLineCharactersWrap", "manuscriptPreviewLineCharacters", "manuscriptPreviewLineHeightWrap", "manuscriptPreviewLineHeight", "manuscriptPreviewContent", "closeManuscriptPreviewButton",
  "readerNoteReferenceButton", "readerNoteReferencePanel", "closeReaderNoteReferenceButton", "readerNoteTypeSelect", "readerNoteSelect", "readerNoteReferenceContent", "readerNoteOptions", "readerNoteOptionsLoading", "readerNoteSelectionSummary", "readerNoteSourceLoading", "readerNoteSourceLoadingHelp", "readerNoteWorkSelect", "readerNoteReferenceStatus",
  "readerBackupButton", "manuscriptBackupDialog", "manuscriptBackupTitle", "createManuscriptBackupButton", "closeManuscriptBackupButton", "manuscriptBackupStatus", "manuscriptBackupNotice", "manuscriptBackupNoticeText", "closeManuscriptBackupNotice", "manuscriptBackupList", "backupIntervalSelect",
  "openProgressShareButton", "progressShareDialog", "closeProgressShareButton", "progressShareCanvas", "progressShareStatus", "saveProgressShareButton", "copyProgressShareButton", "copyProgressShareTextButton", "shareProgressButton", "progressShareOptions", "progressShareMode", "progressShareDateSelect", "progressShareDateField", "progressShareYearSelect", "progressShareYearField",
  "manuscriptBackupComparison", "closeManuscriptBackupComparisonButton", "backupComparisonOldTitle", "backupComparisonCurrentTitle", "restoreComparedBackupButton", "cancelComparedBackupButton", "backupComparisonSummary", "backupDiffPreviousButton", "backupDiffNextButton", "backupDiffViewToggle", "backupComparisonDiff",
  "openPlotsButton", "openReferencesButton", "notesSection", "notesBackToWorksButton",
  "notesOpenManuscriptsButton", "notesPlotsButton", "notesReferencesButton", "notesTitle",
  "newNoteButton", "noteSearchInput", "notesList", "notesCount", "noteEditorSection", "noteEditorLoading", "backToNotesButton",
  "openConceptSearchButton", "closeConceptSearchButton", "conceptSearchDialog", "conceptSearchTitle", "conceptSearchQuery", "conceptSearchNames", "conceptSearchDetails", "conceptSearchMemos", "conceptSearchCase", "conceptSearchResults", "conceptSearchStatus", "conceptSearchPrev", "conceptSearchNext", "conceptSearchPage", "conceptSearchFilter", "conceptSearchFilterSummary", "conceptReplaceMode", "conceptReplaceFields", "conceptReplaceText", "conceptReplaceActions", "conceptReplaceSelectAll", "conceptReplaceClear", "conceptReplaceApply", "conceptReplaceUndo",
  "openManuscriptSearchButton", "closeManuscriptSearchButton", "manuscriptSearchDialog", "manuscriptSearchTitle", "manuscriptSearchQuery", "manuscriptSearchNames", "manuscriptSearchDetails", "manuscriptSearchMemos", "manuscriptSearchCase", "manuscriptSearchResults", "manuscriptSearchStatus", "manuscriptSearchPrev", "manuscriptSearchNext", "manuscriptSearchPage", "manuscriptSearchFilter", "manuscriptSearchFilterSummary", "manuscriptReplaceMode", "manuscriptReplaceFields", "manuscriptReplaceText", "manuscriptReplaceActions", "manuscriptReplaceSelectAll", "manuscriptReplaceClear", "manuscriptReplaceApply", "manuscriptReplaceUndo",
  "noteReplaceMode", "noteReplaceFields", "noteReplaceText", "noteReplaceActions", "noteReplaceSelectAll", "noteReplaceClear", "noteReplaceApply", "noteReplaceUndo",
  "openNoteSearchButton", "noteSearchDialog", "closeNoteSearchButton", "noteSearchTitle", "noteSearchQuery", "noteSearchNames", "noteSearchDetails", "noteSearchMemos", "noteSearchCase", "noteSearchResults", "noteSearchStatus", "noteSearchPrev", "noteSearchNext", "noteSearchPage", "noteSearchFilter", "noteSearchFilterSummary",
  "noteInputAssistToggle", "noteListButton", "noteAutoSaveToggle", "noteStatus", "noteBackupButton", "saveNoteButton", "noteTitleInput",
  "noteEditorTypeBadge", "noteTocToggle", "noteToc", "notePreviewButton", "notePreviewDialog", "notePreviewTitle",
  "notePreviewOptions", "notePreviewOptionsLoading", "notePreviewSelectionSummary", "notePreviewSourceLoading", "notePreviewSourceLoadingHelp", "notePreviewWorkSelect", "notePreviewReferenceStatus", "notePreviewContent", "notePreviewTypeSelect", "notePreviewSelect", "notePreviewHelp", "closeNotePreviewButton", "toggleNoteItemsButton",
  "toggleNoteMemosButton", "addNoteGroupButton", "noteGroups", "currentNoteGroupIndicator",
  "noteJumpControls", "noteJumpToTopButton", "noteJumpToBottomButton", "newNoteDialog", "newNoteForm", "newNoteTitleInput",
  "newNoteError", "createNoteButton",
  "addressBookButton", "addressBookDialog", "addressBookMeta", "addressBookContent",
  "closeAddressBookButton", "relatedNoteDialog", "relatedNoteSearchInput", "relatedNoteResults",
  "closeRelatedNoteButton",
  "relatedPreviewDialog", "relatedPreviewType", "relatedPreviewTitle", "relatedPreviewPath",
  "relatedPreviewContent", "closeRelatedPreviewButton", "openRelatedPreviewNoteButton", "relatedPreviewNotice",
  "openConceptMemosButton", "notesOpenConceptMemosButton", "conceptMemosSection",
  "conceptBackToWorksButton", "conceptOpenManuscriptsButton", "conceptOpenPlotsButton",
  "conceptOpenReferencesButton", "conceptMemosTitle", "newConceptMemoButton", "conceptSearchInput",
  "conceptFolderFilter", "conceptFolderFilterLabel", "conceptFolderFilterOptions", "conceptTagFilter", "conceptTagFilterLabel", "conceptTagFilterOptions", "conceptStatusFilter", "conceptSortField",
  "conceptSortDirection", "conceptNoteFilter", "conceptNoteFilterStatus", "conceptMemosList", "conceptMemosCount", "conceptPagination",
  "conceptPreviousPageButton", "conceptPageStatus", "conceptNextPageButton", "conceptListJumpControls",
  "conceptListSaveButton", "conceptListStatus",
  "conceptJumpToTopButton", "conceptJumpToBottomButton", "conceptMemoEditorSection", "backToConceptMemosButton",
  "conceptInputAssistToggle", "conceptListButton", "conceptAutoSaveToggle", "conceptAutoReflectToggle", "noteAutoReflectToggle", "conceptMemoStatus", "conceptMemoBackupButton", "saveConceptMemoButton",
  "conceptMemoTitleInput", "conceptMemoTypeSelect", "conceptMemoFolderSelect", "conceptMemoFolderLabel", "conceptMemoFolderOptions", "conceptMemoBodyLabel",
  "conceptMemoBodyInput", "conceptMemoTagsInput", "conceptMemoPinnedInput", "conceptMemoArchivedInput",
  "conceptTagHistoryButton", "tagHistoryDialog", "tagHistoryList", "closeTagHistoryButton",
  "conceptMemoDashboardInput", "conceptMemoSource", "conceptMemoSourceText", "applyConceptToNoteButton",
  "previewConceptSourceMenuButton", "previewConceptSourceButton", "conceptNoteReferencePanel", "conceptNoteReferenceTitle",
  "conceptNoteReferencePath", "conceptNoteReferenceContent", "closeConceptNoteReferenceButton", "openConceptSourceNoteButton",
  "conceptMemoSyncStatus", "conceptMemoAutoReflectInput", "conceptMemoAutoReflectHelp", "memoAutoReflectDialog", "memoAutoReflectDialogTitle",
  "openWorkSettingsButton", "notesOpenWorkSettingsButton", "conceptOpenWorkSettingsButton",
  "workSettingsSection", "settingsBackToWorksButton", "settingsAutoSaveToggle", "workSettingsStatus",
  "saveWorkSettingsButton", "settingsOpenManuscriptsButton", "settingsOpenPlotsButton",
  "openRelatedWorksButton", "relatedWorksSummary", "relatedWorksPendingNotice", "relatedWorksDialog", "relatedWorksList", "relatedWorksStatus", "relatedWorksNotice", "closeRelatedWorksButton", "reloadRelatedWorksButton",
  "settingsOpenReferencesButton", "settingsOpenConceptMemosButton", "workSettingsHeading", "workSettingsLoading", "workSettingsForm",
  "workSettingsMeta", "workTitleInput", "workSubtitleInput", "workStatusSelect", "workPenNameInput",
  "workTargetCharsInput", "workDeadlineInput", "workGenresInput", "workSummaryInput", "workMemoInput",
  "exportSubtitleInput", "exportFolderNameInput", "exportGenreInput", "exportTargetCharsInput", "exportDeadlineInput",
  "exportPenNameInput", "exportMemoInput", "exportUpdatedAtInput",
  "newFileNameInput", "newFileExtension", "newFileError", "createFileButton",
  "conflictDialog", "conflictCloudMessage", "copyDraftButton", "reloadLatestButton", "closeConflictButton",
  "statusMessage", "announcementButton", "announcementBadge", "headerAnnouncementBadge", "editorFooterMenu", "editorAnnouncementBadge", "announcementDialog", "announcementList", "closeAnnouncementButton",
  "markAllAnnouncementsReadButton",
  "editorListDialog", "editorListType", "editorListTitle", "editorListContent", "closeEditorListButton",
  "conceptEditorListPanel", "conceptEditorListContent", "conceptEditorListPreference", "conceptEditorListToggle", "conceptSwitchDialog",
  "guideButton", "guideDialog", "closeGuideButton", "openGuideFromSettingsButton",
  "loginGuideContent", "appGuideContent", "settingsButton", "settingsDialog", "settingsForm",
  "reloadAppButton", "clearAppCacheButton",
  "clientIdField", "clientIdInput", "clientIdHelp", "personalSetupHelp", "displayThemeSelect", "displayFontScaleSelect", "displayWritingFontSelect",
  "accountSessionPanel", "accountSessionEmail", "adminPageLink", "logoutButton", "profilePanel", "nicknameInput", "copyEnvironmentButton", "copyPerformanceButton",
  "saveNicknameButton", "saveConnectionSettingsButton", "disconnectButton",
  "redirectUriValue", "copyRedirectUriButton",
].map((id) => [id, document.getElementById(id)]));

const { positionEditorOptionsPanels } = createEditorPopupLayout({ window, document, elements });

const state = {
  auth: null,
  microsoftAuth: null,
  googleDriveAuth: null,
  dropboxAuth: null,
  googleDrivePicker: null,
  provider: null,
  cloudKind: ["googleDrive", "dropbox"].includes(localStorage.getItem(CLOUD_KIND_KEY)) ? localStorage.getItem(CLOUD_KIND_KEY) : "oneDrive",
  runtimeConfig: null,
  managedDeployment: false,
  userAuth: null,
  userSession: null,
  userAccessCheckTimer: null,
  checkingUserAccess: false,
  lastUserAccessCheck: 0,
  accessSuspended: false,
  announcements: [],
  currentFolder: null,
  folderTrail: [],
  workRoot: null,
  works: [],
  worksLoadToken: 0,
  worksOrderPending: false,
  workMetricsLoadToken: 0,
  workMetricsEnabled: localStorage.getItem(WORK_METRICS_KEY) !== "false",
  workCharacterCounts: new Map(),
  workSettingsSummaries: new Map(),
  workSharedMetrics: new Map(),
  workMetricSummaries: new Map(),
  notesLoadToken: 0,
  selectedWork: null,
  manuscriptFolder: null,
  manuscriptTrail: [],
  openingRecentManuscript: false,
  nestedManuscriptWarnings: new Set(),
  currentFile: null,
  movingFileContext: null,
  originalContent: "",
  dirty: false,
  saving: false,
  fileLoadRequest: 0,
  autoSaveEnabled: localStorage.getItem(AUTO_SAVE_KEY) === "true",
  memoAutoReflectDefaults: null,
  noteToConceptAutoReflect: localStorage.getItem(NOTE_AUTO_REFLECT_KEY) !== "false",
  conceptToNoteAutoReflect: localStorage.getItem(CONCEPT_AUTO_REFLECT_KEY) !== "false",
  inputAssistVisible: localStorage.getItem(INPUT_ASSIST_KEY) === "true",
  conceptEditorListVisible: localStorage.getItem(CONCEPT_EDITOR_LIST_KEY) === "true",
  conceptSwitchPending: false,
  conceptSyncBlocked: false,
  countMode: localStorage.getItem(COUNT_MODE_KEY) || "compact",
  manuscriptPreviewMode: localStorage.getItem(MANUSCRIPT_PREVIEW_MODE_KEY) === "vertical" ? "vertical" : "horizontal",
  manuscriptPreviewFont: resolveManuscriptPreviewFont(localStorage.getItem(MANUSCRIPT_PREVIEW_FONT_KEY), localStorage.getItem(WRITING_FONT_KEY)),
  manuscriptPreviewFontSize: MANUSCRIPT_PREVIEW_FONT_SIZES.includes(Number(localStorage.getItem(MANUSCRIPT_PREVIEW_FONT_SIZE_KEY)))
    ? Number(localStorage.getItem(MANUSCRIPT_PREVIEW_FONT_SIZE_KEY))
    : 15,
  manuscriptPreviewLineCharacters: normalizePreviewLineCharacters(localStorage.getItem(MANUSCRIPT_PREVIEW_LINE_CHARACTERS_KEY)),
  manuscriptPreviewAutoFit: localStorage.getItem(MANUSCRIPT_PREVIEW_AUTO_FIT_KEY) !== "false",
  manuscriptPreviewLineHeight: [1.6, 1.9, 2.2, 2.5].includes(Number(localStorage.getItem(MANUSCRIPT_PREVIEW_LINE_HEIGHT_KEY)))
    ? Number(localStorage.getItem(MANUSCRIPT_PREVIEW_LINE_HEIGHT_KEY))
    : 1.9,
  autoSaveTimer: null,
  readerScrollTimer: null,
  externalCheckTimer: null,
  checkingExternalUpdate: false,
  externalConflict: false,
  noteType: "plot",
  noteFolders: {},
  notes: [],
  noteIndex: null,
  noteIndexFile: null,
  noteIndexWorkId: "",
  noteIndexCheckedAt: 0,
  folderListings: new Map(),
  currentNote: null,
  activeAssistTarget: null,
  relatedContext: null,
  relatedCandidates: [],
  noteTocOpen: false,
  noteDisclosure: {},
  noteScrollTimer: null,
  conceptPage: 1,
  conceptPageSize: 12,
  conceptScrollTimer: null,
  conceptDocument: null,
  conceptFile: null,
  conceptOriginalContent: "",
  conceptWorkId: "",
  conceptLoadedAt: 0,
  currentConceptMemo: null,
  deleting: false,
  conceptSyncContext: null,
  currentSettings: null,
  workSettingsDocuments: new Map(),
  navigationRestoring: false,
  navigationDestination: "",
  navigationDetailEditor: false,
  historyInitialized: false,
  viewRoutes: new Map(),
  viewPreferences: {},
  noteEntriesCache: new Map(),
  relatedNoteEntries: new Map(),
  relatedPreviewRequest: 0,
  relatedPreviewContext: null,
  relatedOpening: false,
  readerNoteReferenceEntries: [],
  readerNoteReferenceLoadToken: 0,
  readerNoteReferenceId: "",
  notePreviewOwner: null,
  notePreviewEntries: [],
  notePreviewLoadToken: 0,
  notePreviewReferenceId: "",
  conceptNoteReferenceLoadToken: 0,
  conceptNoteReferenceContext: null,
  manuscriptBackupStorage: null,
  activeBackupTarget: null,
  manuscriptAutomaticBackups: new Map(),
  manuscriptBackupIntervalMinutes: [0, 5, 15, 30, 60].includes(Number(localStorage.getItem(BACKUP_INTERVAL_KEY)))
    ? Number(localStorage.getItem(BACKUP_INTERVAL_KEY))
    : BACKUP_AUTO_INTERVAL_MS / 60000,
  manuscriptBackupDiffRows: [],
  manuscriptBackupDiffShowAll: false,
  manuscriptBackupDiffCursor: -1,
  manuscriptBackupComparisonEntry: null,
  manuscriptBackupComparisonStorage: null,
  activeTagInput: null,
  performanceSamples: [],
  progressMonthlySummaries: new Map(),
  theme: DISPLAY_THEMES.includes(localStorage.getItem(THEME_KEY)) ? localStorage.getItem(THEME_KEY) : "system",
  fontScale: DISPLAY_FONT_SCALES.includes(Number(localStorage.getItem(FONT_SCALE_KEY)))
    ? Number(localStorage.getItem(FONT_SCALE_KEY))
    : 1,
};

const { roundedRect, formatProgressNumber, createProgressShareText, fitProgressTitle, progressCanvasTextLines, loadProgressShareLogo, drawProgressShareImage } = createProgressRendering({ state, elements, Image });

const { sanitizeProgressFileName, progressShareBlob, progressShareBlobSync, saveProgressImage, copyProgressImage, copyProgressText, shareProgress } = createProgressActions({
  state, elements, document, navigator, URL, Blob, File: globalThis.File, atob: value => atob(value),
  ClipboardItem: globalThis.ClipboardItem, globalThis, setTimeout: (callback, delay) => setTimeout(callback, delay), createProgressShareText,
});

const { readProgressDocument, previousProgressDate, recentProgressDates, normalizeProgressShareDate, loadProgressSummaries, loadMonthlyOverallSummary } = createProgressLoading({ state });

const { measureBackupStep, loadManuscriptBackupStorage, readWebBackupIndex, rebuildWebBackupIndexFromSnapshots, saveWebBackupIndex, planWebBackupPruning, deletePrunedWebBackups, readWebBackupSnapshot, setWebBackupProtection } = createBackupStorage({
  state, beginPerformanceMeasurement, currentBackupTarget: () => currentBackupTarget(),
});

const { automaticBackupWindowKey, createWebManuscriptBackup, maybeCreateWebAutomaticBackup } = createBackupCreation({
  state, workCatalogOwner, currentBackupTarget, manuscriptBackupTarget, backupSessionStorage,
  beginPerformanceMeasurement, measureBackupStep, loadManuscriptBackupStorage, readWebBackupIndex,
  planWebBackupPruning, saveWebBackupIndex, deletePrunedWebBackups, notify,
});

const { scheduleRoutePositionCapture, rememberCurrentRoutePosition, routeDestination, routeSignature, routeWorkSnapshot, isRestorableWorkSnapshot, captureRoutePosition, rememberRoute, commitRoute, routeForWork, selectRouteWork, restoreRoutePosition, restoreRoute, navigateWorkDestination, initializeViewHistory, handlePopState } = createViewNavigationController({
  state, elements, history, window, requestAnimationFrame: (callback) => requestAnimationFrame(callback),
  updateShellContext, recordRecentView: (route) => recordRecentView(route), resetReaderNoteReference, showWorksHome,
  showManuscriptRouteLoading, showNoteEditorLoading, openManuscriptFolder, openFile: (...args) => openFile(...args),
  openNotes, openNote, openConceptMemos, openConceptMemo, openWorkSettings,
  canDiscardDraft, cancelAutoSave: () => cancelAutoSave(), notify, finishViewRestoreLoading,
});
const { recentViewsStorageKey, readRecentViews, workRecentViewsStorageKey, readHomeRecentViews, readWorkRecentViews, recordRecentView } = createRecentViewHistory({
  state, localStorage, RECENT_VIEWS_KEY, WORK_RECENT_VIEWS_KEY,
  workCatalogOwner, readJson, routeWorkSnapshot, createWorkCatalogSnapshot,
  safeDriveItemSnapshot, renderRecentViews,
});
const { ensureWorkSettingsFile, loadWorkSettings, reloadWorkSettings, saveCurrentWorkSettings } = createWorkSettingsPersistence({
  state, elements, cancelAutoSave: () => cancelAutoSave(), scheduleAutoSave: () => scheduleAutoSave(),
  setWorkSettingsStatus, renderWorkSettings, startExternalMonitor: () => startExternalMonitor(), persistWorkCatalog, renderWorksList,
  notify, cloudLabel,
});
const { findConceptSourceEntry, cacheConceptSourceEntry } = createConceptSourceResolver({ state, ensureNoteFolder, beginPerformanceMeasurement });

const { cancelAutoSave, scheduleAutoSave, stopExternalMonitor, startExternalMonitor } = createEditorSaveScheduler({
  state, updateGoogleDriveConnectionNotice,
  // Lazy forwarding connects the two controllers without initializing either during a save.
  saveCurrentFile: (options) => saveCurrentFile(options),
  saveCurrentNote: (options) => saveCurrentNote(options), saveCurrentConceptMemo: (options) => saveCurrentConceptMemo(options), saveCurrentWorkSettings,
  checkExternalUpdate: () => checkExternalUpdate(),
  autoSaveDelay: AUTO_SAVE_DELAY, externalCheckInterval: EXTERNAL_CHECK_INTERVAL,
});

const { saveCurrentFile } = createManuscriptSaveController({
  onStateChange: () => { if (elements.manuscriptSearchDialog) { manuscriptSearchController.changed(); manuscriptSearchController.updateAvailability(); } },
  state, elements, cancelAutoSave, scheduleAutoSave, setEditorStatus, updateReaderMeta,
  captureRecentManuscriptContext, recordRecentManuscript, countCharacters, makeWritingEvent,
  appendWritingEvent, updateSharedWorkMetrics, maybeCreateWebAutomaticBackup, notify, cloudLabel,
});

const { openFile } = createManuscriptLoadController({
  onLoaded: () => { if (elements.manuscriptSearchDialog) manuscriptSearchController.clearUndo(); },
  state, elements, beginPerformanceMeasurement, cancelAutoSave, stopExternalMonitor,
  hideConceptViews, formatSize, formatDate, renderInputAssistVisibility, updateReaderMeta,
  setEditorStatus, startExternalMonitor, commitRoute, routeForWork,
});

const { checkExternalUpdate } = createEditorExternalUpdateController({
  state, elements, document, cancelAutoSave, scheduleAutoSave,
  updateGoogleDriveConnectionNotice, checkConceptSourceUpdate: () => checkConceptSourceUpdate(), updateReaderMeta,
  setWorkSettingsStatus, setConceptStatus, setNoteStatus, setEditorStatus,
  reloadWorkSettings, reloadConceptDocument, openNote, openFile,
});

const { saveCurrentNote, createConceptFromNoteItem, reflectNoteItemToConceptMemos, syncSavedNoteToConceptMemos } = createNoteSaveController({
  state, elements, cancelAutoSave, scheduleAutoSave, setNoteStatus, refreshNoteDerivedViews, measure: measureConnectionStep,
  recordRecentView, routeForWork, rememberTags, updateSharedWorkMetrics, updateNoteIndex,
  maybeCreateWebAutomaticBackup, noteBackupTarget, notify, cloudLabel, renderNoteEditor, refreshNoteAutoReflectActions,
});

const { saveCurrentConceptMemo: saveSingleConceptMemo } = createConceptSaveController({
  onStateChange: () => { if (elements.conceptSearchDialog) { conceptSearchController.changed(); conceptSearchController.updateAvailability(); } },
  state, elements, cancelAutoSave, scheduleAutoSave, setConceptStatus, rememberTags, measure: measureConnectionStep,
  maybeCreateWebAutomaticBackup, conceptMemoBackupTarget, notify, cloudLabel,
  syncCurrentConceptMemo: (options) => syncCurrentConceptMemo(options),
  setConceptSyncStatus, renderConceptEditorList,
});

const conceptBatchSave = createConceptBatchSaveController({ state, save: saveSingleConceptMemo,
  sync: options => syncCurrentConceptMemo(options), prepareMemo: prepareConceptSearchMemo,
  changed: () => { renderConceptMemosList(); conceptSearchController.changed(); conceptSearchController.updateAvailability(); },
  status: setConceptStatus, notify, cancelAutoSave,
});
function saveCurrentConceptMemo(options) { return conceptBatchSave.save(options); }

const { refreshConceptSyncStatus, checkConceptSourceUpdate, syncCurrentConceptMemo } = createConceptMemoSyncController({
  state, elements, findConceptSourceEntry, cacheConceptSourceEntry, setConceptSyncStatus, notify,
  cancelAutoSave, saveCurrentConceptMemo, updateConceptBodyLabel, setConceptStatus, scheduleAutoSave,
});

const { restoreRecentView, openRecentView } = createRecentViewRestorer({
  state, localStorage, sessionStorage, PENDING_RECENT_VIEW_KEY, CLOUD_KIND_KEY,
  activateCloud, rootStorageKey, renderConnectedCloud, restoreRoute, showWorksHome,
  canDiscardDraft, cancelAutoSave, stopExternalMonitor, cloudAuth, workCatalogOwner,
});
const { autoConnectStorageKey, readAutoConnectPreference, saveAutoConnectPreference, rememberConnectedCloud, reconnectPreviousCloud } = createAutoConnectionController({
  state, elements, localStorage, sessionStorage, AUTO_CONNECT_KEY,
  workCatalogOwner, readJson, cloudAuth, cloudLabel, notify,
});
const { initializeConnection } = createConnectionInitializer({
  state, elements, sessionStorage, PENDING_RECENT_VIEW_KEY,
  measureConnectionStep, loadRuntimeConfig, initializeUserAccess,
  readAutoConnectPreference, startUserAccessMonitor, configureAuth,
  workCatalogOwner, activateCloud, renderRecentViews, finishAuthBoot,
  readJson, isRecentViewEntry, cloudAuth, restoreRecentView, finishViewRestoreLoading,
  reconnectPreviousCloud, renderConnectedCloud, loadWorks, showFolder, notify,
});

function readJson(value) {
  try { return JSON.parse(value || "null"); } catch { return null; }
}

const { appendInlineDifference, renderManuscriptBackupDiff, moveManuscriptBackupDiff, closeManuscriptBackupComparison, showManuscriptBackupComparison } = createBackupComparisonController({
  state, elements, document, makeElement, currentBackupTarget, formatDate, backupReasonLabel, backupSourceLabel,
});

const { restoreWebManuscriptBackup, refreshBackupHistoryAfterSave } = createBackupRestoreController({
  onManuscriptRestored: () => { if (elements.manuscriptSearchDialog) manuscriptSearchController.clearUndo(); },
  state, elements, window, requestAnimationFrame: callback => requestAnimationFrame(callback), currentBackupTarget, noteBackupTarget, conceptMemoBackupTarget, manuscriptBackupTarget,
  cancelAutoSave, setBusy, readWebBackupSnapshot, formatDate, createWebManuscriptBackup, notify, setEditorStatus,
  renderNoteEditor, setNoteStatus, updateNoteIndex, openConceptMemo, refreshConceptFilterOptions, renderConceptMemosList,
  commitRoute, routeForWork, setConceptStatus, updateReaderMeta, makeWritingEvent, countCharacters, appendWritingEvent,
  updateSharedWorkMetrics, renderManuscriptBackupHistory,
});

const openPreviewManuscript = createPreviewManuscriptOpener({ state, elements, saveCurrentFile, cancelAutoSave, scheduleAutoSave, stopExternalMonitor, startExternalMonitor,
  openFile: async (...args) => { const opened = await openFile(...args); if (opened) resetPageScroll(); return opened; },
});
const wholeManuscriptController = createManuscriptCatalogController({ state, elements, document, notify, openManuscript: openPreviewManuscript, beginMeasurement: beginPerformanceMeasurement,
  onSettingChange: (field, value) => {
    const control = elements['manuscriptPreview' + field];
    if (field === 'AutoFit') control.checked = value; else control.value = String(value);
    control.dispatchEvent(new Event('change'));
  },
  scopeKey: () => JSON.stringify([workCatalogOwner(), state.cloudKind, state.workRoot?.id || "", state.workRoot?.parentReference?.driveId || ""]),
});

const referenceWorkCatalog = createReferenceWorkCatalog({
  state, discoverWorks: discoverReferenceWorks, readCachedWorks: root => readWorkCatalog(root),
  scopeKey: () => JSON.stringify([workCatalogOwner(), state.cloudKind, state.workRoot?.id || "", state.workRoot?.parentReference?.driveId || ""]),
});

const readerNoteReferenceController = createReaderNoteReferenceController({
  measure: beginPerformanceMeasurement,
  resolveWorks: context => referenceWorkCatalog.resolve(context),
  state, elements, Option, renderReaderNoteReference, showLoading, showEmpty,
  scopeKey: () => JSON.stringify([workCatalogOwner(), state.cloudKind, state.workRoot?.id || "", state.workRoot?.parentReference?.driveId || ""]),
});

const notePreviewWorkController = createNotePreviewWorkController({
  measure: beginPerformanceMeasurement,
  resolveWorks: context => referenceWorkCatalog.resolve(context),
  state, elements, Option, isNotePreviewOwnerCurrent, openNotePreview, renderNotePreviewReference, showLoading, showEmpty,
  scopeKey: () => JSON.stringify([workCatalogOwner(), state.cloudKind, state.workRoot?.id || "", state.workRoot?.parentReference?.driveId || ""]),
});

const conceptSearchController = createConceptSearchController({ state, elements, document,
  scopeKey: () => JSON.stringify([workCatalogOwner(), state.cloudKind, state.workRoot?.id || "", state.workRoot?.parentReference?.driveId || ""]),
  commit: ids => {
    if (!ids.length) return;
    conceptBatchSave.queue(ids);
    state.currentConceptMemo = state.conceptDocument.memos.find(memo => memo.id === ids[0]);
    prepareConceptSearchMemo(state.currentConceptMemo);
    markConceptDirty(); renderConceptMemosList();
  },
  jumpToMemo: async (id, field, before, start, end) => {
    const provider = state.provider, work = state.selectedWork, fileId = state.conceptFile?.id;
    try {
      if (!await requestConceptMemoSwitch(id)) return;
      if (state.provider !== provider || state.selectedWork !== work || state.conceptFile?.id !== fileId || state.currentConceptMemo?.id !== id) return;
      const control = field === "title" ? elements.conceptMemoTitleInput : elements.conceptMemoBodyInput;
      if (control.value !== before) return;
      requestAnimationFrame(() => {
        if (state.provider !== provider || state.selectedWork !== work || state.conceptFile?.id !== fileId || state.currentConceptMemo?.id !== id || control.value !== before) return;
        control.focus({ preventScroll: true }); control.setSelectionRange(start, end);
        control.scrollIntoView({ block: "center", behavior: "auto" });
      });
    } catch (error) { notify(error.message, true); }
  },
});

const manuscriptSearchController = createManuscriptSearchController({ state, elements, document,
  scopeKey: () => JSON.stringify([workCatalogOwner(), state.cloudKind, state.workRoot?.id || "", state.workRoot?.parentReference?.driveId || ""]),
  notifyInput: () => elements.readerContent.dispatchEvent(new Event("input", { bubbles: true })),
});

const noteSearchController = createNoteSearchController({ state, elements, document,
  onChange: () => { markNoteDirty(); renderNoteEditor(); refreshNoteDerivedViews(); },
  scopeKey: () => JSON.stringify([workCatalogOwner(), state.cloudKind, state.workRoot?.id || "", state.workRoot?.parentReference?.driveId || ""]),
});

const relatedWorksController = createRelatedWorkSettingsController({
  state, elements, document,
  scopeKey: () => JSON.stringify([workCatalogOwner(), state.cloudKind, state.workRoot?.id || "", state.workRoot?.parentReference?.driveId || ""]),
  getWorks: (context, fresh) => fresh ? discoverReferenceWorks(context.provider, context.root, { cachedWorks: state.works.length ? state.works : readWorkCatalog(context.root) || [] }) : referenceWorkCatalog.resolve(context),
  beforeOpen: async () => {
    if (!state.currentSettings || state.saving || state.syncing) throw new Error("作品設定の保存が終わってから開いてください。");
    if (state.dirty) await saveCurrentWorkSettings({ automatic: true });
    if (state.dirty || state.externalConflict) throw new Error("作品設定を保存できませんでした。保存状態を確認してください。");
    cancelAutoSave(); stopExternalMonitor();
  },
  onCatalog: renderRelatedWorkSummary, measure: beginPerformanceMeasurement,
  onOwnRecord: acceptRelatedWorkRecord,
  onPendingChange: renderRelatedWorkSummary,
  onClose: () => { if (state.currentSettings && !elements.workSettingsSection.hidden) startExternalMonitor(); },
});

state.viewPreferences = readJson(localStorage.getItem(VIEW_PREFERENCES_KEY)) || {};
elements.backupIntervalSelect.value = String(state.manuscriptBackupIntervalMinutes);

function parseTags(value) {
  return [...new Set(String(value || "").split(/[,、]/).map((tag) => tag.trim()).filter(Boolean))];
}

function storedTagHistory() {
  const saved = readJson(localStorage.getItem(TAG_HISTORY_KEY));
  return Array.isArray(saved) ? saved.map(String).filter(Boolean).slice(0, 100) : [];
}

function rememberTags(tags) {
  const history = [...new Set([...tags, ...storedTagHistory()])].slice(0, 100);
  localStorage.setItem(TAG_HISTORY_KEY, JSON.stringify(history));
}

function availableTags() {
  const noteTags = (state.currentNote?.data?.groups || []).flatMap((group) => (group.items || []).flatMap((item) => item.memo?.tags || []));
  const conceptTags = (state.conceptDocument?.memos || []).flatMap((memo) => memo.tags || []);
  return [...new Set([...storedTagHistory(), ...noteTags, ...conceptTags])].sort((a, b) => a.localeCompare(b, "ja"));
}

function openTagHistory(input) {
  state.activeTagInput = input;
  const tags = availableTags();
  elements.tagHistoryList.replaceChildren();
  if (!tags.length) elements.tagHistoryList.append(makeElement("p", "muted", "使用済みのタグはまだありません。"));
  for (const tag of tags) {
    const button = makeElement("button", "tag-history-chip", tag);
    button.type = "button";
    button.addEventListener("click", () => {
      const next = [...new Set([...parseTags(input.value), tag])];
      input.value = next.join(", ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      rememberTags(next);
      elements.tagHistoryDialog.close();
      input.focus();
    });
    elements.tagHistoryList.append(button);
  }
  elements.tagHistoryDialog.showModal();
}

function cloudLabel(kind = state.cloudKind) {
  return kind === "dropbox" ? "Dropbox" : kind === "googleDrive" ? "Google Drive" : "OneDrive";
}

function cloudAuth(kind) {
  return kind === "dropbox" ? state.dropboxAuth : kind === "googleDrive" ? state.googleDriveAuth : state.microsoftAuth;
}

function isGoogleDriveEditingScreen() {
  return state.cloudKind === "googleDrive" && Boolean(state.selectedWork)
    && [elements.readerSection, elements.noteEditorSection, elements.conceptMemoEditorSection, elements.workSettingsSection]
      .some((section) => section && !section.hidden);
}

function updateGoogleDriveConnectionNotice() {
  const status = state.googleDriveAuth?.connectionStatus?.();
  const googleSession = state.cloudKind === "googleDrive" && state.provider
    && (state.workRoot?.id || state.selectedWork || status?.issuedAt);
  if (googleSession && status) {
    const renew = !status.connected || status.remainingMs < 5 * 60 * 1000;
    elements.connectionPanel?.classList.toggle("needs-reconnect", renew);
    if (elements.connectGoogleDriveButton) {
      elements.connectGoogleDriveButton.hidden = false;
      elements.connectGoogleDriveButton.disabled = !!state.syncing || (!renew && status.connected);
      elements.connectGoogleDriveButton.textContent = renew ? "Google Driveに再接続" : "接続済み";
    }
    if (elements.connectionDescription) elements.connectionDescription.textContent = renew
      ? "Google Driveに再接続してください。ファイル・フォルダの追加許可とは別の操作です。"
      : "Google Driveと接続中";
    elements.connectionBadgeLabel.textContent = renew ? "Google Drive 再接続が必要" : "Google Drive 接続済み";
  } else elements.connectionPanel?.classList.remove("needs-reconnect");
  const visible = isGoogleDriveEditingScreen()
    && status && (!status.connected || status.remainingMs < 5 * 60 * 1000);
  elements.googleDriveReconnectNotice.hidden = !visible;
  if (!visible) return;
  elements.googleDriveReconnectMessage.textContent = status.connected
    ? "Google Driveの接続期限が近づいています。編集内容を保持したまま、接続を更新できます。"
    : "入力内容はこの画面に保持しています。再接続してから保存してください。";
  elements.connectionBadgeLabel.textContent = status.connected ? "Google Drive 更新時期" : "Google Drive 再接続が必要";
}

async function reconnectGoogleDriveForEditing() {
  if (state.cloudKind !== "googleDrive" || !state.provider || state.saving || state.syncing || state.deleting) return;
  const editing = isGoogleDriveEditingScreen();
  const auth = state.googleDriveAuth;
  const provider = state.provider;
  let connected = false;
  state.syncing = true;
  cancelAutoSave();
  stopExternalMonitor();
  setBusy(elements.reconnectGoogleDriveButton, true, "再接続中…");
  if (elements.connectGoogleDriveButton) setBusy(elements.connectGoogleDriveButton, true, "再接続中…");
  try {
    await auth.signIn({ prompt: "" });
    if (state.googleDriveAuth !== auth || state.provider !== provider) return;
    connected = true;
    elements.connectionBadgeLabel.textContent = "Google Drive 接続済み";
    notify(editing ? "Google Driveに再接続しました。編集中の内容は保持しています。" : "Google Driveに再接続しました。");
    if (!editing && state.workRoot?.id) await loadWorks(state.workRoot);
  } catch (error) {
    notify(error.message || "Google Driveへ再接続できませんでした。編集内容は保持しています。", true);
  } finally {
    state.syncing = false;
    setBusy(elements.reconnectGoogleDriveButton, false);
    if (elements.connectGoogleDriveButton) setBusy(elements.connectGoogleDriveButton, false);
    updateGoogleDriveConnectionNotice();
    if (editing) startExternalMonitor();
    if (editing && connected && state.dirty) scheduleAutoSave();
  }
}

function beginPerformanceMeasurement(label, details = {}) {
  const startedAt = performance.now();
  let finished = false;
  return (extra = {}) => {
    if (finished) return null;
    finished = true;
    const sample = {
      measuredAt: new Date().toISOString(),
      label: String(label || "読み込み"),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      cloud: cloudLabel(),
      ...details,
      ...extra,
    };
    state.performanceSamples.push(sample);
    state.performanceSamples = state.performanceSamples.slice(-30);
    console.info("[mojigoto:performance]", sample);
    return sample;
  };
}

async function measureConnectionStep(label, operation) {
  const finish = beginPerformanceMeasurement(label);
  try {
    const value = await operation();
    finish();
    return value;
  } catch (error) {
    finish({ failed: true });
    throw error;
  }
}

function formatPerformanceSamples() {
  if (!state.performanceSamples.length) {
    return "速度計測結果はまだありません。作品一覧や各画面を開いてから、もう一度コピーしてください。";
  }
  const lines = [
    "【もじごと Web 速度計測】",
    `取得日時: ${new Date().toLocaleString("ja-JP")}`,
    `クラウド: ${cloudLabel()}`,
    `文字数・ノート数集計: ${state.workMetricsEnabled ? "ON" : "OFF"}`,
    `画面サイズ: ${window.innerWidth} × ${window.innerHeight}`,
    `ブラウザ情報: ${navigator.userAgent}`,
    "",
    "直近の計測（古い順）:",
  ];
  if (state.cloudKind === "googleDrive") {
    const status = state.googleDriveAuth?.connectionStatus();
    if (status) lines.splice(lines.length - 2, 0,
      `Google Drive接続の有効期間: ${status.lifetimeSeconds || "未記録"}秒`,
      `Google Drive接続の発行日時: ${status.issuedAt ? new Date(status.issuedAt).toISOString() : "未記録"}`,
      `Google Drive接続の利用期限: ${status.expiresAt ? new Date(status.expiresAt).toISOString() : "期限切れ"}`);
  }
  state.performanceSamples.forEach((sample) => {
    const details = Object.entries(sample)
      .filter(([key, value]) => !["measuredAt", "label", "durationMs", "cloud"].includes(key) && value !== "" && value != null)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    lines.push(`${new Date(sample.measuredAt).toLocaleTimeString("ja-JP")} / ${sample.label}: ${sample.durationMs}ms${details ? `（${details}）` : ""}`);
  });
  return lines.join("\n");
}

function folderListingKey(folder) {
  return `${state.cloudKind}:${String(folder?.id || "")}`;
}

async function listChildrenCached(folder, { refresh = false } = {}) {
  const key = folderListingKey(folder);
  const cached = state.folderListings.get(key);
  if (!refresh && cached && Date.now() - cached.loadedAt < VIEW_CACHE_DURATION) return cached.items;
  const items = await state.provider.listChildren(folder.id);
  state.folderListings.set(key, { items, loadedAt: Date.now() });
  return items;
}

function invalidateFolderListing(folder) {
  if (folder?.id) state.folderListings.delete(folderListingKey(folder));
}

function rootStorageKey() {
  return state.cloudKind === "dropbox" ? DROPBOX_ROOT_KEY : state.cloudKind === "googleDrive" ? GOOGLE_ROOT_KEY : ROOT_KEY;
}

function activateCloud(kind) {
  state.cloudKind = ["googleDrive", "dropbox"].includes(kind) ? kind : "oneDrive";
  localStorage.setItem(CLOUD_KIND_KEY, state.cloudKind);
  if (elements.autoConnectHelp) elements.autoConnectHelp.textContent = state.cloudKind === "googleDrive"
    ? "このブラウザに保存します。Google Driveは有効な接続がある間は自動復帰します。接続期限切れなどの場合はボタンで再接続してください。"
    : "このブラウザに保存します。認証の確認や接続ボタンの操作が必要になる場合があります。";
  elements.googleDriveSetupLink.hidden = state.cloudKind !== "googleDrive";
  elements.googleDriveAdditionalButton.hidden = true;
  elements.googleDriveAdditionalHelp.hidden = true;
  elements.googleDriveAdditionalActions.hidden = true;
  if (state.cloudKind === "dropbox") {
    state.auth = state.dropboxAuth;
    state.provider = new DropboxProvider(state.auth);
  } else if (state.cloudKind === "googleDrive") {
    state.auth = state.googleDriveAuth;
    state.provider = new GoogleDriveProvider(state.auth);
  } else {
    state.auth = state.microsoftAuth;
    state.provider = new OneDriveProvider(state.auth, globalThis.fetch, { beginPerformanceMeasurement });
  }
  state.workRoot = readJson(localStorage.getItem(rootStorageKey()));
  if (elements.wholeManuscriptDialog) wholeManuscriptController.changed();
  state.workCharacterCounts = new Map(Object.entries(
    readJson(localStorage.getItem(`${WORK_CHARACTER_CACHE_KEY}.${state.cloudKind}`)) || {},
  ));
  state.workSettingsSummaries = new Map(Object.entries(
    readJson(localStorage.getItem(`${WORK_SETTINGS_CACHE_KEY}.${state.cloudKind}`)) || {},
  ));
  state.workSharedMetrics = new Map(Object.entries(
    readJson(localStorage.getItem(`${WORK_SHARED_METRICS_CACHE_KEY}.${state.cloudKind}`)) || {},
  ));
  state.workMetricSummaries = new Map(Object.entries(
    readJson(localStorage.getItem(`${WORK_METRIC_SUMMARY_CACHE_KEY}.${state.cloudKind}`)) || {},
  ));
  renderRecentViews();
}

function persistWorkCharacterCounts() {
  const entries = [...state.workCharacterCounts.entries()].slice(-2000);
  localStorage.setItem(
    `${WORK_CHARACTER_CACHE_KEY}.${state.cloudKind}`,
    JSON.stringify(Object.fromEntries(entries)),
  );
}

function persistWorkSettingsSummaries() {
  const entries = [...state.workSettingsSummaries.entries()].slice(-500);
  localStorage.setItem(
    `${WORK_SETTINGS_CACHE_KEY}.${state.cloudKind}`,
    JSON.stringify(Object.fromEntries(entries)),
  );
}

function persistWorkSharedMetrics() {
  const entries = [...state.workSharedMetrics.entries()].slice(-500);
  localStorage.setItem(
    `${WORK_SHARED_METRICS_CACHE_KEY}.${state.cloudKind}`,
    JSON.stringify(Object.fromEntries(entries)),
  );
}

function persistWorkMetricSummaries() {
  const entries = [...state.workMetricSummaries.entries()].slice(-500);
  localStorage.setItem(
    `${WORK_METRIC_SUMMARY_CACHE_KEY}.${state.cloudKind}`,
    JSON.stringify(Object.fromEntries(entries)),
  );
}

function workCatalogOwner() {
  return String(state.userSession?.user?.id || state.userSession?.user?.email || "device").trim().toLowerCase();
}

function workCatalogStorageKey() {
  return `${WORK_CATALOG_CACHE_KEY}.${state.cloudKind}`;
}

function readWorkCatalog(root) {
  const catalog = readJson(localStorage.getItem(workCatalogStorageKey()));
  if (Number(catalog?.schemaVersion) !== 2
    || String(catalog?.owner || "") !== workCatalogOwner()
    || String(catalog?.rootId || "") !== String(root?.id || "")
    || !Array.isArray(catalog?.works)
    || !catalog.works.length
    || catalog.works.some((work) => !work?.id || !work.folder?.id || typeof work.title !== "string")) return null;
  return catalog.works;
}

function readWorkCatalogDelta(root, works) {
  const catalog = readJson(localStorage.getItem(workCatalogStorageKey()));
  if (!works || Number(catalog?.schemaVersion) !== 2 || catalog?.owner !== workCatalogOwner()
    || catalog?.rootId !== String(root?.id || "")
    || JSON.stringify(catalog.works) !== JSON.stringify(works)) return null;
  return catalog.deltaState || null;
}

function persistWorkCatalog(root, works, deltaState = null) {
  if (!root?.id) return;
  if (!works?.length) {
    localStorage.removeItem(workCatalogStorageKey());
    return;
  }
  try {
    localStorage.setItem(workCatalogStorageKey(), JSON.stringify({
      schemaVersion: 2,
      owner: workCatalogOwner(),
      rootId: String(root.id),
      savedAt: new Date().toISOString(),
      works: createWorkCatalogSnapshot(works),
      ...(deltaState ? { deltaState } : {}),
    }));
  } catch {
    // 一覧キャッシュの保存失敗はクラウド上の本体データへ影響させない。
  }
}

function renderConnectedCloud() {
  rememberConnectedCloud();
  hydrateRecentNoteTitles();
  const label = cloudLabel();
  elements.connectionDescription.textContent = `${label}と接続中`;
  elements.conflictCloudMessage.textContent = `スマホで編集中の本文は消していません。コピーして残すか、${label}の最新版を読み直してください。`;
  elements.connectionPanel.classList.add("connected");
  elements.connectionPanel.classList.toggle(
    "needs-folder-selection",
    state.cloudKind === "googleDrive" && !state.workRoot?.id,
  );
  elements.connectionBadge.hidden = false;
  elements.connectionBadgeLabel.textContent = `${label} 接続済み`;
  elements.connectButton.hidden = state.cloudKind !== "oneDrive";
  elements.connectGoogleDriveButton.hidden = state.cloudKind !== "googleDrive";
  elements.connectDropboxButton.hidden = state.cloudKind !== "dropbox";
  const registeredGoogleWork = state.cloudKind === "googleDrive" && state.workRoot?.googleDriveScope === state.googleDriveAuth.scope;
  elements.googleDriveAdditionalButton.hidden = !registeredGoogleWork;
  elements.googleDriveAdditionalHelp.hidden = !registeredGoogleWork;
  elements.googleDriveAdditionalActions.hidden = !registeredGoogleWork;
  elements.selectGoogleDriveFolderButton.hidden = state.cloudKind !== "googleDrive" || registeredGoogleWork;
  // The setup page explains missing Picker configuration. Keep its entry point
  // available even when the Picker key has not yet been configured.
  elements.selectGoogleDriveFolderButton.disabled = false;
  elements.selectGoogleDriveFolderButton.textContent = "作品の登録・追加読み込み";
  const activeButton = state.cloudKind === "dropbox" ? elements.connectDropboxButton : state.cloudKind === "googleDrive" ? elements.connectGoogleDriveButton : elements.connectButton;
  activeButton.textContent = "接続済み";
  activeButton.disabled = true;
}

function formatDate(value) {
  if (!value) return "更新日時なし";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`;
}

const WORK_STATUS_LABELS = {
  preparing: "準備中", planning: "構想中", draft: "執筆中", revision: "改稿中", hold: "保留", complete: "完結", "": "未設定",
};

function formatNumber(value) {
  return new Intl.NumberFormat("ja-JP").format(Number(value || 0));
}

function setListCount(element, visibleCount, totalCount = visibleCount) {
  if (!element) return;
  element.textContent = visibleCount === totalCount
    ? `${formatNumber(visibleCount)}件`
    : `${formatNumber(visibleCount)}件 / 全${formatNumber(totalCount)}件`;
}

function checkedValues(container) {
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

function setCheckedValues(container, values) {
  const selected = new Set(Array.isArray(values) ? values.map(String) : []);
  for (const input of container.querySelectorAll('input[type="checkbox"]')) input.checked = selected.has(input.value);
}

function updateMultiFilterLabel(container, label, allLabel = "すべて") {
  const selected = checkedValues(container);
  if (!selected.length) label.textContent = allLabel;
  else if (selected.length === 1) label.textContent = container.querySelector(`input[value="${CSS.escape(selected[0])}"]`)?.parentElement?.textContent.trim() || "1件選択";
  else label.textContent = `${selected.length}件選択`;
}

function applyTheme(theme = state.theme) {
  state.theme = DISPLAY_THEMES.includes(theme) ? theme : "system";
  const dark = DARK_DISPLAY_THEMES.has(state.theme)
    || (state.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.colorScheme = dark ? "dark" : "light";
  elements.displayThemeSelect.value = state.theme;
  const themeColors = {
    beige: "#806438",
    green: "#47745a",
    navy: "#071426",
    "deep-green": "#0d1c17",
  };
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    themeColors[state.theme] || (dark ? "#0c1a20" : "#123f52"),
  );
}

function applyFontScale(value = state.fontScale) {
  const scale = Number(value);
  state.fontScale = DISPLAY_FONT_SCALES.includes(scale) ? scale : 1;
  document.documentElement.style.setProperty("--ui-font-scale", String(state.fontScale));
  elements.displayFontScaleSelect.value = String(state.fontScale);
}

function applyWritingFont(value = localStorage.getItem(WRITING_FONT_KEY)) {
  const font = value === "gothic" ? "gothic" : "mincho";
  document.documentElement.dataset.writingFont = font;
  elements.displayWritingFontSelect.value = font;
}

function resolveManuscriptPreviewFont(saved, writingFont) {
  return ["mincho", "gothic"].includes(saved) ? saved : writingFont === "gothic" ? "gothic" : "mincho";
}

function applyManuscriptPreviewFont(value = state.manuscriptPreviewFont) {
  state.manuscriptPreviewFont = value === "gothic" ? "gothic" : "mincho";
  document.documentElement.dataset.manuscriptPreviewFont = state.manuscriptPreviewFont;
  elements.manuscriptPreviewFont.value = state.manuscriptPreviewFont;
  // Capture the legacy choice once; later writing-font changes must stay independent.
  try { localStorage.setItem(MANUSCRIPT_PREVIEW_FONT_KEY, state.manuscriptPreviewFont); } catch {}
}

function currentWorkDestination() {
  if (state.navigationDestination) return state.navigationDestination;
  if (!elements.workSettingsSection.hidden) return "settings";
  if (!elements.conceptMemosSection.hidden || !elements.conceptMemoEditorSection.hidden) return "concept";
  if (!elements.notesSection.hidden || !elements.noteEditorSection.hidden) return state.noteType;
  if (!elements.filesSection.hidden || !elements.readerSection.hidden) return "manuscript";
  return "";
}

function persistViewPreferences() {
  state.viewPreferences = {
    ...state.viewPreferences,
    workStatuses: checkedValues(elements.workStatusFilter),
    workSortField: elements.workSortField.value,
    workSortDirection: elements.workSortDirection.dataset.direction,
    conceptFolders: checkedValues(elements.conceptFolderFilterOptions),
    conceptFolder: checkedValues(elements.conceptFolderFilterOptions)[0] || "",
    conceptTags: checkedValues(elements.conceptTagFilterOptions),
    conceptStatus: elements.conceptStatusFilter.value,
    conceptSortField: elements.conceptSortField.value,
    conceptSortDirection: elements.conceptSortDirection.dataset.direction,
  };
  localStorage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify(state.viewPreferences));
}

function conceptNotePreferenceKey() {
  return `${state.cloudKind}:${state.selectedWork?.id || ""}`;
}

function currentConceptNoteIndex() {
  return state.conceptNoteContext?.work === state.selectedWork && state.conceptNoteContext?.provider === state.provider
    ? state.conceptNoteContext.notes : [];
}

function renderConceptNoteFilter() {
  let selected = state.viewPreferences.conceptNotes?.[conceptNotePreferenceKey()] || "";
  const notes = currentConceptNoteIndex();
  const relatedKeys = new Set((state.conceptDocument?.memos || [])
    .flatMap((memo) => conceptMemoNotePositions(memo, notes).map((position) => position.key)));
  const clearedEmptyNote = notes.some((note) => note.key === selected) && !relatedKeys.has(selected);
  if (clearedEmptyNote) {
    selected = "";
    state.viewPreferences.conceptNotes = { ...state.viewPreferences.conceptNotes, [conceptNotePreferenceKey()]: "" };
  }
  const choices = [
    { id: "__unlinked__", name: "関連なし・参照不可" },
    ...notes.filter((note) => relatedKeys.has(note.key))
      .map((note) => ({ id: note.key, name: `${note.type === "plot" ? "プロット" : "資料"} / ${note.title}` })),
  ];
  if (selected && !choices.some((choice) => choice.id === selected)) choices.push({ id: selected, name: "対象ノート（未取得・参照不可）" });
  fillSelect(elements.conceptNoteFilter, "すべてのノート", choices, selected);
  if (clearedEmptyNote) persistViewPreferences();
}

async function loadConceptNoteIndex() {
  const context = { work: state.selectedWork, provider: state.provider, notes: [] };
  state.conceptNoteContext = context;
  elements.conceptNoteFilter.disabled = true;
  elements.conceptNoteFilterStatus.textContent = "ノートを確認中…";
  renderConceptNoteFilter();
  try {
    const results = await Promise.allSettled(["plot", "reference"].map((type) =>
      loadNoteEntriesForType(type, { preferCache: true, createFolder: false })));
    if (state.conceptNoteContext !== context || state.selectedWork !== context.work || state.provider !== context.provider) return;
    context.notes = buildConceptNoteIndex(results.flatMap((result) => result.status === "fulfilled" ? result.value : []));
    elements.conceptNoteFilterStatus.textContent = results.some((result) => result.status === "rejected")
      || ["plot", "reference"].some((type) => state.noteEntriesCache.get(`${context.work?.id || ""}:${type}`)?.failedCount)
      ? "一部のノートを確認できませんでした。一覧を開き直すと再確認します。" : "";
  } catch (error) {
    if (state.conceptNoteContext !== context || state.selectedWork !== context.work || state.provider !== context.provider) return;
    elements.conceptNoteFilterStatus.textContent = "ノートを確認できませんでした。一覧を開き直すと再確認します。";
  }
  if (state.conceptNoteContext !== context || state.selectedWork !== context.work || state.provider !== context.provider) return;
  elements.conceptNoteFilter.disabled = false;
  renderConceptNoteFilter();
  // List updates do not disturb the memo editor or its unsaved draft.
  if (!elements.conceptMemosSection.hidden) renderConceptMemosList();
}

function restoreViewPreferences() {
  const preferences = state.viewPreferences;
  const workStatuses = Array.isArray(preferences.workStatuses)
    ? preferences.workStatuses
    : (preferences.workStatus ? [preferences.workStatus] : []);
  setCheckedValues(elements.workStatusFilter, workStatuses);
  updateMultiFilterLabel(elements.workStatusFilter, elements.workStatusFilterLabel);
  elements.workSortField.value = String(preferences.workSortField || "updatedAt");
  const workDirection = preferences.workSortDirection === "asc" ? "asc" : "desc";
  elements.workSortDirection.dataset.direction = workDirection;
  elements.workSortDirection.textContent = workDirection === "asc" ? "昇順 ↑" : "降順 ↓";
  elements.conceptStatusFilter.value = String(preferences.conceptStatus || "");
  elements.conceptSortField.value = String(preferences.conceptSortField || "updatedAt");
  const conceptDirection = preferences.conceptSortDirection === "asc" ? "asc" : "desc";
  elements.conceptSortDirection.dataset.direction = conceptDirection;
  elements.conceptSortDirection.textContent = conceptDirection === "asc" ? "昇順 ↑" : "降順 ↓";
}









function renderRecentViews() {
  const entries = readHomeRecentViews();
  const groups = groupRecentViews(entries, Infinity);
  elements.recentViewsCount.textContent = `${groups.length}作品・${entries.length}件`;
  const expanded = new Set([...elements.recentViewsList.querySelectorAll(".recent-work-group[open]")].map((group) => group.dataset.workKey));
  const hadGroups = Boolean(elements.recentViewsList.querySelector(".recent-work-group"));
  elements.recentViewsList.replaceChildren();
  if (!entries.length) {
    elements.recentViewsList.append(makeElement("p", "muted", "このクラウドで最近開いた画面はまだありません。"));
    return;
  }
  const openButton = (label, target, className) => {
    const button = makeElement("button", className, label);
    button.type = "button";
    button.addEventListener("click", () => openRecentView(target).catch((error) => notify(error.message, true)));
    return button;
  };
  for (const [index, { entry, entries: workEntries }] of groups.entries()) {
    const section = makeElement("details", "recent-work-group");
    section.dataset.workKey = JSON.stringify([entry.cloudKind, entry.root.id, entry.route.workId]);
    section.open = expanded.has(section.dataset.workKey) || (!hadGroups && index === 0);
    const work = entry.route.work;
    const heading = makeElement("summary", "recent-work-summary");
    const pinnedCount = workEntries.filter((view) => view.pinned).length;
    const workName = makeElement("span", "recent-work-name");
    workName.append(makeElement("strong", "", work.title || work.name || "作品"),
      makeElement("span", "muted recent-work-cloud", recentViewLocationLabel(entry, cloudLabel(entry.cloudKind), entry.cloudKind === state.cloudKind ? state.workRoot : null)));
    heading.append(workName,
      makeElement("span", "muted", `${pinnedCount ? `📌 ${pinnedCount}・` : ""}${workEntries.length}件`));
    const content = makeElement("div", "recent-work-content");
    const links = makeElement("details", "recent-work-links");
    links.append(makeElement("summary", "", "作品の一覧を開く"));
    const nav = makeElement("nav", "recent-work-nav");
    nav.setAttribute("aria-label", `${work.title || work.name || "作品"}の一覧`);
    const manuscript = openButton("原稿", recentWorkDestination(entry, "manuscript"), "text-button");
    manuscript.disabled = !work.manuscript?.id;
    nav.append(manuscript,
      openButton("プロット", recentWorkDestination(entry, "plot"), "text-button"),
      openButton("資料", recentWorkDestination(entry, "reference"), "text-button"),
      openButton("構想メモ", recentWorkDestination(entry, "concept"), "text-button"),
      openButton("作品設定", recentWorkDestination(entry, "settings"), "text-button"));
    links.append(nav);
    content.append(links);
    for (const view of workEntries) {
      const button = openButton("", view, "recent-view-button");
      if (view.pinned) button.classList.add("is-pinned");
      button.append(makeElement("strong", "", `${view.pinned ? "📌 " : ""}${recentViewLabel(view)}`), makeElement("span", "muted", formatDate(view.openedAt)));
      content.append(button);
    }
    section.append(heading, content);
    elements.recentViewsList.append(section);
  }
}

function captureRecentManuscriptContext() {
  if (!state.workRoot?.id || !state.selectedWork?.manuscript?.id) return null;
  const scope = {
    cloudKind: state.cloudKind, rootId: String(state.workRoot.id),
    workId: String(state.selectedWork.id), manuscriptId: String(state.selectedWork.manuscript.id),
  };
  return {
    scope, storageKey: `${RECENT_MANUSCRIPTS_KEY}.${JSON.stringify([workCatalogOwner(), scope.cloudKind, scope.rootId, scope.workId])}`,
    folder: safeDriveItemSnapshot(state.manuscriptFolder),
    trail: (state.manuscriptTrail || []).map(safeDriveItemSnapshot).filter(Boolean),
  };
}

function readRecentManuscripts(context = captureRecentManuscriptContext()) {
  if (!context) return [];
  try { return normalizeRecentManuscripts(readJson(localStorage.getItem(context.storageKey)), context.scope); }
  catch { return []; }
}

function recordRecentManuscript(item, context) {
  if (!context?.folder?.id) return;
  try {
    const entry = { ...context.scope, item: safeDriveItemSnapshot(item), folder: context.folder,
      trail: context.trail, editedAt: new Date().toISOString() };
    const entries = updateRecentManuscripts(readRecentManuscripts(context), entry, context.scope);
    localStorage.setItem(context.storageKey, JSON.stringify(entries));
    if (context.storageKey === captureRecentManuscriptContext()?.storageKey) renderRecentManuscripts();
  } catch { /* 履歴の保存失敗で原稿の保存を失敗扱いにしない。 */ }
}

function removeRecentManuscript(fileId, context = captureRecentManuscriptContext()) {
  if (!context) return false;
  try {
    localStorage.setItem(context.storageKey, JSON.stringify(readRecentManuscripts(context).filter((entry) => entry.item.id !== fileId)));
    if (context.storageKey === captureRecentManuscriptContext()?.storageKey) renderRecentManuscripts();
    return true;
  } catch { return false; }
}

function renderRecentManuscripts() {
  const context = captureRecentManuscriptContext();
  elements.recentManuscriptsPanel.hidden = !context;
  if (!context) return;
  const entries = readRecentManuscripts(context);
  elements.recentManuscriptsCount.textContent = `${entries.length}件`;
  elements.recentManuscriptsNotice.hidden = true;
  const rows = entries.map((entry) => {
    const row = makeElement("div", "recent-manuscript-row");
    const open = makeElement("button", "recent-manuscript-open");
    const path = entry.trail.map((folder) => folder.name).filter(Boolean).join(" / ") || "原稿直下";
    open.type = "button";
    open.title = `${path} / ${entry.item.name}`;
    open.append(makeElement("strong", "", entry.item.name || "原稿"),
      makeElement("span", "", path), makeElement("span", "", `保存 ${formatDate(entry.editedAt)}`));
    open.addEventListener("click", async () => {
      open.disabled = true;
      open.setAttribute("aria-busy", "true");
      try { await openRecentManuscript(entry); }
      finally { open.disabled = false; open.removeAttribute("aria-busy"); }
    });
    const remove = makeElement("button", "icon-button", "×");
    remove.type = "button";
    remove.title = "履歴から外す（原稿は削除しません）";
    remove.setAttribute("aria-label", `${entry.item.name}を履歴から外す`);
    remove.addEventListener("click", () => {
      if (!removeRecentManuscript(entry.item.id, context)) {
        elements.recentManuscriptsNotice.textContent = "履歴を更新できませんでした。";
        elements.recentManuscriptsNotice.hidden = false;
      }
    });
    row.append(open, remove);
    return row;
  });
  elements.recentManuscriptsList.replaceChildren(...rows);
  if (!rows.length) showEmpty(elements.recentManuscriptsList, "まだWebで保存した原稿はありません。");
}

async function openRecentManuscript(entry) {
  const context = captureRecentManuscriptContext();
  if (!context || !normalizeRecentManuscripts([entry], context.scope).length
    || state.openingRecentManuscript || !canDiscardDraft()) return false;
  const provider = state.provider;
  const work = state.selectedWork;
  const target = state.currentSettings || state.currentConceptMemo || state.currentNote || state.currentFile;
  const draft = elements.readerContent.value;
  const wasDirty = state.dirty;
  const fileRequest = state.fileLoadRequest;
  state.openingRecentManuscript = true;
  cancelAutoSave();
  elements.recentManuscriptsNotice.textContent = "原稿を読み込んでいます…";
  elements.recentManuscriptsNotice.hidden = false;
  try {
    const folders = [work.manuscript, ...entry.trail];
    const [fileMetadata, ...folderMetadata] = await Promise.all([
      provider.getItemMetadata(entry.item), ...folders.map((folder) => provider.getItemMetadata(folder)),
    ]);
    const file = { ...entry.item, ...fileMetadata };
    const freshFolders = folders.map((folder, index) => ({ ...folder, ...folderMetadata[index] }));
    if (file.folder || !isManuscriptFile(file) || freshFolders.some((folder) => !folder.folder)
      || !manuscriptParentMatches(file, freshFolders.at(-1))
      || freshFolders.some((folder, index) => index > 0 && !manuscriptParentMatches(folder, freshFolders[index - 1]))) {
      throw new Error("原稿または章フォルダの場所が変わっています。原稿一覧から開き直してください。");
    }
    const content = await provider.readText(file);
    const currentTarget = state.currentSettings || state.currentConceptMemo || state.currentNote || state.currentFile;
    if (provider !== state.provider || work !== state.selectedWork || context.storageKey !== captureRecentManuscriptContext()?.storageKey
      || target !== currentTarget || draft !== elements.readerContent.value || wasDirty !== state.dirty
      || fileRequest !== state.fileLoadRequest || state.saving || state.syncing || state.deleting || state.externalConflict) return false;
    const previousFolder = state.manuscriptFolder;
    const previousTrail = state.manuscriptTrail;
    state.manuscriptFolder = freshFolders.at(-1);
    state.manuscriptTrail = freshFolders.slice(1);
    const opened = await openFile(file, { content });
    if (!opened && state.provider === provider && state.selectedWork === work) {
      state.manuscriptFolder = previousFolder;
      state.manuscriptTrail = previousTrail;
    }
    if (opened) {
      resetPageScroll();
      try {
        const entries = readRecentManuscripts(context).map((saved) => saved.item.id === entry.item.id ? {
          ...saved, item: safeDriveItemSnapshot(file), folder: safeDriveItemSnapshot(freshFolders.at(-1)),
          trail: freshFolders.slice(1).map(safeDriveItemSnapshot),
        } : saved);
        localStorage.setItem(context.storageKey, JSON.stringify(entries));
      } catch { /* 開くだけでは保存順を変えず、履歴更新失敗で編集を止めない。 */ }
    }
    return opened;
  } catch (error) {
    if (state.provider === provider && state.selectedWork === work) {
      elements.recentManuscriptsNotice.textContent = `原稿を開けませんでした。移動・削除や追加許可を確認してください。${error.message || ""}`;
      elements.recentManuscriptsNotice.hidden = false;
    }
    return false;
  } finally {
    state.openingRecentManuscript = false;
    if (state.dirty) scheduleAutoSave();
  }
}




function openWorkRecentViews() {
  if (!state.selectedWork) return;
  closeEditorOptions();
  elements.workRecentViewsTitle.textContent = `${state.selectedWork.title || state.selectedWork.name || "作品"} / 最近開いた画面`;
  const buttons = readWorkRecentViews().map((entry) => {
    const row = makeElement("div", `recent-view-row${entry.pinned ? " is-pinned" : ""}`);
    const button = makeElement("button", "recent-view-button");
    button.type = "button";
    button.append(makeElement("strong", "", recentViewLabel(entry)), makeElement("span", "muted", formatDate(entry.openedAt)));
    button.addEventListener("click", async () => {
      setBusy(button, true, "読込中…");
      try {
        if (await openRecentView(entry)) elements.workRecentViewsDialog.close();
      } catch (error) { notify(error.message || "履歴を開けませんでした。", true); }
      finally { setBusy(button, false); }
    });
    const pin = makeElement("button", "recent-view-pin", entry.pinned ? "解除" : "ピン留め");
    pin.type = "button";
    pin.setAttribute("aria-pressed", String(Boolean(entry.pinned)));
    pin.setAttribute("aria-label", `${recentViewLabel(entry)}を${entry.pinned ? "ピン留め解除" : "ピン留め"}`);
    pin.dataset.recentViewKey = recentViewKey(entry);
    pin.addEventListener("click", () => {
      try {
        const next = setWorkRecentViewPinned(readWorkRecentViews(), recentViewKey(entry), !entry.pinned);
        localStorage.setItem(workRecentViewsStorageKey(), JSON.stringify(next));
        renderRecentViews();
        openWorkRecentViews();
        [...elements.workRecentViewsList.querySelectorAll(".recent-view-pin")]
          .find((target) => target.dataset.recentViewKey === recentViewKey(entry))?.focus();
      } catch (error) { notify(error.message || "ピン留めを保存できませんでした。", true); }
    });
    row.append(button, pin);
    return row;
  });
  elements.workRecentViewsList.replaceChildren(...buttons);
  if (!buttons.length) showEmpty(elements.workRecentViewsList, "この作品で最近開いた画面はまだありません。");
  if (!elements.workRecentViewsDialog.open) elements.workRecentViewsDialog.showModal();
}

const recentNoteTitleAttempts = new Set();
async function hydrateRecentNoteTitles() {
  const storageKey = recentViewsStorageKey();
  const provider = state.provider;
  const missing = readRecentViews().filter((entry) => entry.cloudKind === state.cloudKind
    && entry.route.kind === "note-editor" && !entry.route.noteTitle
    && !recentNoteTitleAttempts.has(`${storageKey}:${recentViewKey(entry)}`));
  const results = await Promise.allSettled(missing.map(async (entry) => {
    recentNoteTitleAttempts.add(`${storageKey}:${recentViewKey(entry)}`);
    const note = JSON.parse(await provider.readText(entry.route.item));
    return { key: recentViewKey(entry), title: String(note.title || "無題のノート") };
  }));
  if (storageKey !== recentViewsStorageKey()) return;
  const titles = new Map(results.filter((result) => result.status === "fulfilled").map((result) => [result.value.key, result.value.title]));
  if (!titles.size) return;
  const updated = readRecentViews().map((entry) => {
    const title = titles.get(recentViewKey(entry));
    return title && !entry.route.noteTitle ? { ...entry, route: { ...entry.route, noteTitle: title } } : entry;
  });
  try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch { return; }
  renderRecentViews();
}








function showManuscriptRouteLoading(item) {
  elements.browserSection.hidden = true;
  elements.worksSection.hidden = true;
  elements.filesSection.hidden = true;
  elements.notesSection.hidden = true;
  elements.noteEditorSection.hidden = true;
  elements.workSettingsSection.hidden = true;
  hideConceptViews();
  elements.readerSection.hidden = false;
  elements.readerTitle.textContent = item?.name || "原稿";
  elements.readerMeta.textContent = "原稿を読み込んでいます…";
  elements.readerContent.disabled = true;
  elements.readerContent.value = "読み込んでいます…";
  setEditorStatus("読み込み中", "saving");
}

function showNoteEditorLoading() {
  elements.browserSection.hidden = true;
  elements.worksSection.hidden = true;
  elements.filesSection.hidden = true;
  elements.notesSection.hidden = true;
  elements.readerSection.hidden = true;
  elements.workSettingsSection.hidden = true;
  hideConceptViews();
  elements.noteEditorSection.hidden = false;
  elements.noteEditorSection.classList.add("is-loading");
  elements.noteEditorLoading.hidden = false;
  setNoteStatus("読み込み中", "saving");
}

function finishViewRestoreLoading() {
  document.body.classList.remove("auth-pending");
  elements.authBoot.classList.remove("view-restore");
  elements.authBoot.removeAttribute("aria-busy");
  elements.authBoot.hidden = true;
}




function updateShellContext() {
  if (elements.wholeManuscriptDialog) wholeManuscriptController.changed();
  const destination = currentWorkDestination();
  const inWork = Boolean(state.selectedWork && destination);
  elements.globalWorkNav.hidden = !inWork;
  document.body.classList.toggle("work-context", inWork);
  document.body.classList.toggle("home-context", !inWork);
  elements.recentViewsPanel.hidden = inWork || !elements.browserSection.hidden;
  if (elements.conceptSearchDialog) conceptSearchController.changed();
  if (elements.manuscriptSearchDialog) manuscriptSearchController.changed();
  if (elements.noteSearchDialog) noteSearchController.changed();
  if (elements.relatedWorksDialog?.open && elements.workSettingsSection.hidden) relatedWorksController.close();
  if (elements.noteEditorSection.hidden && elements.notePreviewDialog.open) elements.notePreviewDialog.close();
  if (elements.conceptMemoEditorSection.hidden && !elements.conceptNoteReferencePanel.hidden) closeConceptNoteReference();
  const detailEditor = state.navigationDetailEditor || !elements.readerSection.hidden || !elements.noteEditorSection.hidden || !elements.conceptMemoEditorSection.hidden || !elements.workSettingsSection.hidden;
  document.body.classList.toggle("detail-editor-context", detailEditor);
  document.body.classList.toggle("manuscript-editor-context", !elements.readerSection.hidden);
  elements.editorFooterMenu.hidden = !inWork;
  if (!inWork) elements.editorFooterMenu.open = false;
  for (const button of elements.globalWorkNav.querySelectorAll("button[data-work-destination]")) {
    const active = button.dataset.workDestination === destination;
    button.classList.toggle("active", active);
    button.toggleAttribute("aria-current", active);
  }
  updateGoogleDriveConnectionNotice();
}

function showWorksHome() {
  if (!canDiscardDraft()) return;
  cancelAutoSave();
  stopExternalMonitor();
  state.currentFile = null;
  state.currentNote = null;
  state.currentConceptMemo = null;
  state.currentSettings = null;
  state.dirty = false;
  elements.browserSection.hidden = true;
  elements.filesSection.hidden = true;
  elements.readerSection.hidden = true;
  elements.notesSection.hidden = true;
  elements.noteEditorSection.hidden = true;
  hideConceptViews();
  elements.worksSection.hidden = false;
  renderInputAssistVisibility();
  updateShellContext();
  commitRoute({ kind: "works" });
  if (state.recentWorkCatalogPending) {
    state.recentWorkCatalogPending = false;
    loadWorks(state.workRoot).catch((error) => notify(error.message, true));
  }
}

function resetPageScroll() {
  const reset = () => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };
  reset();
  requestAnimationFrame(() => {
    reset();
    requestAnimationFrame(reset);
  });
}

function progressShareOptions() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PROGRESS_SHARE_OPTIONS_KEY) || "{}"); } catch {}
  return Object.fromEntries([...elements.progressShareOptions.querySelectorAll('input[type="checkbox"]')].map((input) => {
    const checked = saved[input.value] !== false;
    input.checked = checked;
    return [input.value, checked];
  }));
}

function updateProgressShareModeControls() {
  const mode = elements.progressShareMode.value;
  const monthly = mode === "monthly";
  const annual = mode === "annual";
  elements.progressShareOptions.querySelectorAll(".progress-share-daily-only").forEach((label) => { label.hidden = monthly || annual; });
  elements.progressShareOptions.querySelectorAll(".progress-share-monthly-only").forEach((label) => { label.hidden = !monthly; });
  elements.progressShareOptions.querySelectorAll(".progress-share-annual-only").forEach((label) => { label.hidden = !annual; });
  elements.progressShareDateField.hidden = annual;
  elements.progressShareYearField.hidden = !annual;
  const graphLabel = document.getElementById("progressShareGraphLabel");
  if (graphLabel) graphLabel.textContent = annual ? "12か月グラフ" : monthly ? "6か月グラフ" : "7日間グラフ";
}















async function refreshProgressShareImage() {
  if (!state.progressSummaries) return;
  const mode = ["monthly", "annual"].includes(elements.progressShareMode.value) ? elements.progressShareMode.value : "daily";
  const selectedYear = Math.min(2100, Math.max(2000, Number(elements.progressShareYearSelect.value) || new Date().getFullYear()));
  const date = mode === "annual"
    ? `${selectedYear}-12-31`
    : normalizeProgressShareDate(elements.progressShareDateSelect.value, state.progressSummaries);
  if (mode !== "annual") elements.progressShareDateSelect.value = date;
  else elements.progressShareYearSelect.value = String(selectedYear);
  updateProgressShareModeControls();
  if (mode === "monthly" || mode === "annual") {
    const cacheKey = `${mode}:${date}`;
    if (!state.progressMonthlySummaries.has(cacheKey)) {
      elements.progressShareStatus.textContent = mode === "annual" ? "全作品の年間進捗を集計しています…" : "全作品の月間進捗を集計しています…";
      state.progressMonthlySummaries.set(cacheKey, await loadMonthlyOverallSummary(date));
    }
    state.progressSummary = state.progressMonthlySummaries.get(cacheKey);
  } else {
    state.progressSummary = state.progressSummaries.byDate[date];
  }
  const options = Object.fromEntries([...elements.progressShareOptions.querySelectorAll('input[type="checkbox"]')]
    .map((input) => [input.value, input.checked]));
  localStorage.setItem(PROGRESS_SHARE_OPTIONS_KEY, JSON.stringify(options));
  localStorage.setItem(PROGRESS_SHARE_MODE_KEY, mode);
  if (mode === "annual") localStorage.setItem(PROGRESS_SHARE_YEAR_KEY, String(selectedYear));
  await drawProgressShareImage(state.progressSummary, options, mode);
  elements.progressShareStatus.textContent = "幅720px・内容に合わせた縦長PNGです。";
}

async function openProgressShareDialog() {
  state.progressSummary = null;
  state.progressSummaries = null;
  state.progressMonthlySummaries.clear();
  elements.saveProgressShareButton.disabled = true;
  elements.copyProgressShareButton.disabled = true;
  elements.copyProgressShareTextButton.disabled = true;
  elements.shareProgressButton.disabled = true;
  const shareAvailable = typeof navigator.share === "function";
  elements.shareProgressButton.hidden = !shareAvailable;
  elements.shareProgressButton.parentElement?.classList.toggle("has-share", shareAvailable);
  elements.progressShareStatus.textContent = "進捗データを読み込んでいます…";
  elements.progressShareDialog.showModal();
  const options = progressShareOptions();
  const savedMode = localStorage.getItem(PROGRESS_SHARE_MODE_KEY);
  elements.progressShareMode.value = ["monthly", "annual"].includes(savedMode) ? savedMode : "daily";
  elements.progressShareYearSelect.value = localStorage.getItem(PROGRESS_SHARE_YEAR_KEY) || String(new Date().getFullYear());
  updateProgressShareModeControls();
  const savedDate = localStorage.getItem(PROGRESS_SHARE_DATE_KEY) || "today";
  try {
    state.progressSummaries = await loadProgressSummaries();
    const dates = Object.keys(state.progressSummaries.byDate || {}).sort();
    elements.progressShareDateSelect.min = dates[0] || "";
    elements.progressShareDateSelect.max = dates.at(-1) || "";
    elements.progressShareDateSelect.value = normalizeProgressShareDate(savedDate, state.progressSummaries);
    await refreshProgressShareImage();
    elements.saveProgressShareButton.disabled = false;
    elements.copyProgressShareButton.disabled = false;
    elements.copyProgressShareTextButton.disabled = false;
    elements.shareProgressButton.disabled = typeof navigator.share !== "function";
    elements.progressShareStatus.textContent = "幅720px・内容に合わせた縦長PNGです。";
  } catch (error) {
    elements.progressShareStatus.textContent = error.message || "進捗データを読み込めませんでした。";
  }
}



function renderWorksList() {
  if (state.worksOrderPending) return;
  const statuses = checkedValues(elements.workStatusFilter);
  const field = elements.workSortField.value;
  const direction = elements.workSortDirection.dataset.direction === "asc" ? 1 : -1;
  const works = state.works.filter((work) => !statuses.length || statuses.includes(work.status || "unset"));
  setListCount(elements.worksCount, works.length, state.works.length);
  if (statuses.length && state.works.some((work) => work.settingsPending)) {
    elements.worksCount.textContent = "条件を確認しています…";
    showLoading(elements.worksList, "作品情報を読み込んでいます…");
    return;
  }
  works.sort((a, b) => {
    if (field === "title") return direction * a.title.localeCompare(b.title, "ja", { numeric: true });
    if (field === "updatedAt") return direction * String(a.metrics?.updatedAt || a.updatedAt || "").localeCompare(String(b.metrics?.updatedAt || b.updatedAt || ""));
    return direction * (Number(a.metrics?.[field] || 0) - Number(b.metrics?.[field] || 0));
  });
  if (!works.length) {
    showEmpty(elements.worksList, "条件に一致する作品がありません");
    return;
  }
  elements.worksList.replaceChildren(...works.map((work) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "work-card";
    button.dataset.workId = String(work.id || "");
    const metrics = work.metrics;
    button.innerHTML = `<span class="work-card-top"><span class="section-label">WORK</span><span class="work-status"></span></span><h3></h3><span class="work-metrics"></span>`;
    button.querySelector("h3").textContent = work.title;
    button.querySelector(".work-status").textContent = WORK_STATUS_LABELS[work.status] || work.status || "未設定";
    button.querySelector(".work-metrics").textContent = formatWorkMetrics(metrics);
    button.addEventListener("click", () => openWork(work));
    return button;
  }));
}

function formatWorkMetrics(metrics) {
  if (metrics?.failed) return `集計できませんでした\n${formatDate(metrics.updatedAt)}`;
  if (metrics?.skipped) return `詳細集計オフ\n${formatDate(metrics.updatedAt)}`;
  if (metrics?.pending) return `文字数・ノート数を集計しています…\n${formatDate(metrics.updatedAt)}`;
  if (metrics) return `${formatNumber(metrics.totalChars)}文字 ・ ${metrics.noteCount}ノート\n${formatDate(metrics.updatedAt)}`;
  return "更新日時を確認しています…";
}

function updateVisibleWorkMetrics(work) {
  const card = [...elements.worksList.querySelectorAll(".work-card")]
    .find((item) => item.dataset.workId === String(work.id || ""));
  if (!card) return;
  const metrics = work.metrics;
  card.querySelector(".work-metrics").textContent = formatWorkMetrics(metrics);
}

function countCharacters(content) {
  return [...String(content || "").replace(/[\s\r\n]/g, "")].length;
}

async function updateSharedWorkMetrics({ beforeContent = null, afterContent = null, noteDelta = 0 } = {}) {
  const work = state.selectedWork;
  const base = work?.sharedMetrics || work?.metrics;
  if (!work?.mojigoto || !Number.isFinite(Number(base?.totalChars)) || !Number.isFinite(Number(base?.noteCount))) return;
  // Missing drive.file items may exist but be unauthorized. Keep auxiliary updates optional.
  if (state.cloudKind === "googleDrive" && !work.metricsFile?.id) return;
  const countMode = String(work.sharedMetrics?.countMode || "compact");
  const manuscriptDelta = beforeContent == null || afterContent == null
    ? 0
    : countTextByMode(afterContent, countMode) - countTextByMode(beforeContent, countMode);
  const now = new Date().toISOString();
  const next = {
    schemaVersion: 1,
    totalChars: Math.max(0, Number(base.totalChars) + manuscriptDelta),
    noteCount: Math.max(0, Number(base.noteCount) + Number(noteDelta || 0)),
    countMode,
    source: "web",
    updatedAt: now,
    manuscriptUpdatedAt: manuscriptDelta || (beforeContent != null && afterContent != null)
      ? now
      : String(base.manuscriptUpdatedAt || ""),
    notesUpdatedAt: noteDelta || (beforeContent == null && afterContent == null)
      ? now
      : String(base.notesUpdatedAt || ""),
  };
  const content = `${JSON.stringify(next, null, 2)}\n`;
  try {
    const saved = work.metricsFile
      ? await state.provider.writeText(work.metricsFile, content, work.metricsFile.eTag)
      : await state.provider.createTextFile(work.mojigoto, "work-metrics.json", content);
    work.metricsFile = { ...(work.metricsFile || {}), ...saved };
    work.sharedMetrics = next;
    work.manuscriptUpdatedAt = next.manuscriptUpdatedAt || work.manuscriptUpdatedAt || "";
    work.contentUpdatedAt = [
      next.manuscriptUpdatedAt,
      next.notesUpdatedAt,
      work.settingsFile?.lastModifiedDateTime,
      work.conceptFile?.lastModifiedDateTime,
    ].filter(Boolean).sort().at(-1) || "";
    work.metrics = { ...next, updatedAt: work.contentUpdatedAt };
    persistWorkCatalog(state.workRoot, state.works);
  } catch {
    // 原稿・ノート本体の保存を、補助的な一覧集計の失敗で失敗扱いにしない。
  }
}

function setEditorStatus(label, tone = "") {
  if (elements.manuscriptSearchDialog) manuscriptSearchController.updateAvailability();
  elements.readerStatus.textContent = label;
  elements.readerStatus.className = `reader-status${tone ? ` ${tone}` : ""}`;
}

function renderInputAssistVisibility() {
  if (elements.wholeManuscriptDialog) wholeManuscriptController.changed();
  const editorVisible = !elements.readerSection.hidden || !elements.noteEditorSection.hidden || !elements.conceptMemoEditorSection.hidden;
  const visible = state.inputAssistVisible && editorVisible;
  elements.inputAssistBar.hidden = !visible;
  if (!visible) elements.inputAssistSymbolsMenu.hidden = true;
  elements.inputAssistSymbolsButton.setAttribute("aria-expanded", String(visible && !elements.inputAssistSymbolsMenu.hidden));
  elements.inputAssistToggle.setAttribute("aria-expanded", String(state.inputAssistVisible));
  elements.inputAssistToggle.classList.toggle("active", state.inputAssistVisible);
  elements.noteInputAssistToggle.classList.toggle("active", state.inputAssistVisible);
  elements.noteInputAssistToggle.setAttribute("aria-expanded", String(state.inputAssistVisible));
  elements.conceptInputAssistToggle.classList.toggle("active", state.inputAssistVisible);
  elements.conceptInputAssistToggle.setAttribute("aria-expanded", String(state.inputAssistVisible));
  document.body.classList.toggle("input-assist-visible", visible);
  requestAnimationFrame(updateInputAssistViewport);
}

function setNoteStatus(label, tone = "") {
  if (elements.noteSearchDialog) noteSearchController.updateAvailability();
  if ((state.noteConceptSyncPending || state.noteManualSyncPending) && tone !== "error") {
    label = state.dirty ? "反映中・未保存あり" : "構想メモへ反映中…"; tone = "saving";
  }
  elements.noteStatus.textContent = label;
  elements.noteStatus.className = `reader-status${tone ? ` ${tone}` : ""}`;
}

function setConceptStatus(label, tone = "") {
  if (elements.conceptSearchDialog) { conceptSearchController.changed(); conceptSearchController.updateAvailability(); }
  if (state.conceptSyncPending && tone !== "error") {
    label = state.dirty ? "反映中・未保存あり" : "項目メモへ反映中…"; tone = "saving";
  }
  elements.conceptMemoStatus.textContent = label;
  elements.conceptMemoStatus.className = `reader-status${tone ? ` ${tone}` : ""}`;
  elements.conceptListStatus.textContent = label;
  elements.conceptListStatus.className = elements.conceptMemoStatus.className;
  elements.conceptListSaveButton.textContent = state.dirty ? "保存" : "反映を再試行";
  elements.conceptListSaveButton.hidden = !state.dirty && !conceptBatchSave.hasPending();
  elements.conceptListSaveButton.disabled = Boolean(state.saving || state.syncing || state.conceptBatchSaving);
}

function setWorkSettingsStatus(label, tone = "") {
  elements.workSettingsStatus.textContent = label;
  elements.workSettingsStatus.className = `reader-status${tone ? ` ${tone}` : ""}`;
}

function hideConceptViews() {
  elements.conceptMemosSection.hidden = true;
  elements.conceptMemoEditorSection.hidden = true;
  elements.workSettingsSection.hidden = true;
  state.currentSettings = null;
}

function updateReaderMeta(file = state.currentFile) {
  const characters = countTextByMode(elements.readerContent.value, state.countMode);
  elements.readerMeta.textContent = `${characters.toLocaleString("ja-JP")}文字 ・ ${formatDate(file?.lastModifiedDateTime)}`;
}

function appendManuscriptPreviewTokens(parent, tokens) {
  for (const token of tokens) {
    if (token.type === "ruby") {
      const ruby = document.createElement("ruby");
      ruby.append(document.createTextNode(token.text), makeElement("rt", "", token.reading));
      parent.append(ruby);
      continue;
    }
    if (token.type === "emphasis") {
      parent.append(makeElement("span", "manuscript-preview-emphasis", token.text));
      continue;
    }
    parent.append(document.createTextNode(token.text));
  }
}

function fitVerticalManuscriptPreview() {
  const content = elements.manuscriptPreviewContent;
  const paper = content.querySelector(".manuscript-preview-paper");
  if (state.manuscriptPreviewMode === "vertical" && paper) {
    const narrowScreen = window.matchMedia("(max-width: 600px)").matches;
    const availableHeight = Math.max(1, content.clientHeight - 8);
    const verticalPadding = narrowScreen ? 28 : 56;
    const availableTextHeight = Math.max(1, availableHeight - verticalPadding);
    const fittedFontSize = Math.floor((availableTextHeight / state.manuscriptPreviewLineCharacters) * 100) / 100;
    const fontSize = state.manuscriptPreviewAutoFit
      ? state.manuscriptPreviewFontSize
      : Math.min(state.manuscriptPreviewFontSize, fittedFontSize);
    paper.style.setProperty("--preview-font-size", `${fontSize}px`);
    paper.style.setProperty("--preview-paper-height", state.manuscriptPreviewAutoFit
      ? `${availableHeight}px`
      : `${state.manuscriptPreviewLineCharacters * fontSize + verticalPadding}px`);
    paper.style.setProperty("--preview-line-height", String(state.manuscriptPreviewLineHeight));
    paper.style.setProperty("--preview-paragraph-gap", "0em");
  }
}

function positionManuscriptPreviewAtStart() {
  const content = elements.manuscriptPreviewContent;
  fitVerticalManuscriptPreview();
  content.scrollTop = 0;
  content.scrollLeft = 0;
}

function renderManuscriptPreview({ preservePosition = true } = {}) {
  const mode = state.manuscriptPreviewMode;
  const lineCharacters = normalizePreviewLineCharacters(state.manuscriptPreviewLineCharacters);
  const previousLeft = elements.manuscriptPreviewContent.scrollLeft;
  const previousTop = elements.manuscriptPreviewContent.scrollTop;
  const paper = makeElement("article", `manuscript-preview-paper ${mode}`);
  const narrowScreen = window.matchMedia("(max-width: 600px)").matches;
  const fontSize = state.manuscriptPreviewFontSize;
  paper.style.setProperty("--preview-line-characters", String(lineCharacters));
  paper.style.setProperty("--preview-font-size", `${fontSize}px`);
  paper.style.setProperty("--preview-paper-height", `${lineCharacters * fontSize + (narrowScreen ? 28 : 56)}px`);
  paper.style.setProperty("--preview-line-height", String(state.manuscriptPreviewLineHeight));
  paper.style.setProperty("--preview-paragraph-gap", "0em");
  const blocks = parseManuscriptPreview(elements.readerContent.value);
  for (const block of blocks) {
    let node;
    if (block.type === "heading") node = document.createElement(`h${block.level + 1}`);
    else node = makeElement("p", block.type === "blank" ? "manuscript-preview-blank" : "");
    appendManuscriptPreviewTokens(node, block.tokens);
    if (block.type === "blank") node.append(document.createTextNode("\u00a0"));
    paper.append(node);
  }
  elements.manuscriptPreviewContent.classList.toggle("vertical", mode === "vertical");
  elements.manuscriptPreviewContent.classList.toggle("horizontal", mode !== "vertical");
  elements.manuscriptPreviewContent.replaceChildren(paper);
  if (preservePosition) requestAnimationFrame(() => {
    fitVerticalManuscriptPreview();
    elements.manuscriptPreviewContent.scrollLeft = previousLeft;
    elements.manuscriptPreviewContent.scrollTop = previousTop;
  });
}

function openManuscriptPreview() {
  if (!state.currentFile) return;
  elements.manuscriptPreviewTitle.textContent = state.currentFile.name || "原稿プレビュー";
  elements.readerPreviewLauncher.open = false;
  renderManuscriptPreview({ preservePosition: false });
  elements.manuscriptPreviewDialog.showModal();
  requestAnimationFrame(() => requestAnimationFrame(positionManuscriptPreviewAtStart));
}

function currentManuscriptBackupPath() {
  return [...state.manuscriptTrail.map((item) => item.name), state.currentFile?.name || ""].filter(Boolean).join("/");
}

function manuscriptBackupTarget(contentOverride = null) {
  return {
    targetType: "manuscript",
    relativePath: currentManuscriptBackupPath(),
    fileName: state.currentFile?.name || "",
    item: state.currentFile,
    label: state.currentFile?.name || "原稿",
    content: contentOverride === null ? elements.readerContent.value : String(contentOverride),
  };
}

function noteBackupTarget(contentOverride = null) {
  const item = state.currentNote?.item;
  return {
    targetType: "note",
    relativePath: `${state.noteType === "reference" ? "references" : "plots"}/${item?.name || ""}`,
    fileName: item?.name || "",
    item,
    label: state.currentNote?.data?.title || item?.name || "ノート",
    content: contentOverride === null ? `${JSON.stringify(state.currentNote?.data, null, 2)}\n` : String(contentOverride),
  };
}

function conceptMemoBackupTarget(contentOverride = null) {
  const item = state.conceptFile;
  return {
    targetType: "conceptMemo",
    relativePath: item?.name || "concept-memos.json",
    fileName: item?.name || "concept-memos.json",
    item,
    label: "構想メモ全体",
    content: contentOverride === null ? `${JSON.stringify(state.conceptDocument, null, 2)}\n` : String(contentOverride),
  };
}

function currentBackupTarget() {
  return state.activeBackupTarget || manuscriptBackupTarget();
}








function backupSessionStorage() {
  try { return sessionStorage; } catch { return null; }
}




async function loadCurrentManuscriptBackups() {
  const storage = await loadManuscriptBackupStorage();
  if (!storage) return { storage: null, index: emptyBackupIndex(), entries: [] };
  const index = await readWebBackupIndex(storage);
  const target = currentBackupTarget();
  return {
    storage,
    index,
    entries: index.snapshots
      .filter((entry) => entry.targetType === target.targetType && entry.relativePath === target.relativePath)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}


function backupSourceLabel(source) {
  return source === "vscode" ? "VS Code" : "Web";
}

function backupReasonLabel(reason) {
  if (reason === "before-import") return "取込上書き前";
  if (reason === "before-restore") return "復元直前";
  return reason === "automatic" ? "自動" : "手動";
}









async function renderManuscriptBackupHistory() {
  const provider = state.provider;
  const work = state.selectedWork;
  const target = currentBackupTarget();
  const renderId = state.manuscriptBackupRenderId = (state.manuscriptBackupRenderId || 0) + 1;
  closeManuscriptBackupComparison();
  showLoading(elements.manuscriptBackupList, "バックアップ履歴を読み込んでいます…");
  const { storage, index, entries } = await loadCurrentManuscriptBackups();
  const liveTarget = currentBackupTarget();
  if (state.manuscriptBackupRenderId !== renderId || state.provider !== provider || state.selectedWork !== work
    || target.targetType !== liveTarget.targetType || target.relativePath !== liveTarget.relativePath) return;
  elements.manuscriptBackupStatus.textContent = entries.length ? `${entries.length}件` : "バックアップはまだありません";
  if (!entries.length) {
    showEmpty(elements.manuscriptBackupList, "現在の内容をバックアップすると、ここから比較・復元できます。");
    return;
  }
  const rows = entries.map((entry) => {
    const row = makeElement("article", "manuscript-backup-row");
    const text = makeElement("div", "manuscript-backup-row-text");
    text.append(
      makeElement("strong", "", formatDate(entry.createdAt)),
      makeElement("span", "", `${entry.protected ? "保護・" : ""}${backupReasonLabel(entry.reason)}・${backupSourceLabel(entry.source)}・${backupContentLabel(entry)}`),
    );
    const actions = makeElement("div", "manuscript-backup-row-actions");
    const compare = makeElement("button", "text-button", "比較");
    compare.type = "button";
    compare.addEventListener("click", async () => {
      setBusy(compare, true, "読込中…");
      elements.manuscriptBackupStatus.textContent = "比較するバックアップを読み込んでいます…";
      try {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const snapshot = await readWebBackupSnapshot(storage, entry);
        showManuscriptBackupComparison(storage, entry, snapshot);
        const summary = summarizeBackupContent(snapshot.content, entry.targetType);
        text.lastElementChild.textContent = `${entry.protected ? "保護・" : ""}${backupReasonLabel(entry.reason)}・${backupSourceLabel(entry.source)}・${backupContentLabel({ ...entry, contentSummary: summary })}`;
        elements.manuscriptBackupStatus.textContent = "比較内容を表示しています";
      } catch (error) {
        elements.manuscriptBackupStatus.textContent = `${entries.length}件`;
        notify(error.message || "バックアップを読み込めませんでした。", true);
      } finally {
        setBusy(compare, false);
      }
    });
    const restore = makeElement("button", "secondary-button", "復元");
    restore.type = "button";
    restore.addEventListener("click", () => restoreWebManuscriptBackup(storage, entry, restore));
    const protect = makeElement("button", "text-button", entry.protected ? "保護解除" : "保護");
    protect.type = "button";
    protect.addEventListener("click", async () => {
      setBusy(protect, true, "更新中…");
      elements.manuscriptBackupStatus.textContent = "履歴の保護状態を更新しています…";
      try {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await setWebBackupProtection(storage, index, entry, !entry.protected);
        notify("履歴の保護状態を更新しました。");
        refreshBackupHistoryAfterSave("保護状態を更新しました。");
      } catch (error) {
        elements.manuscriptBackupStatus.textContent = `${entries.length}件`;
        notify(error.message || "バックアップの保護を変更できませんでした。", true);
      } finally {
        setBusy(protect, false);
      }
    });
    actions.append(compare, protect, restore);
    row.append(text, actions);
    return row;
  });
  elements.manuscriptBackupList.replaceChildren(...rows);
}

async function openManuscriptBackupHistory() {
  if (!state.currentFile) return;
  return openBackupHistory(manuscriptBackupTarget());
}

async function openBackupHistory(target) {
  if (!target?.item) return;
  state.activeBackupTarget = target;
  elements.manuscriptBackupNotice.hidden = true;
  elements.manuscriptBackupNotice.dataset.tone = "";
  elements.manuscriptBackupTitle.textContent = `${target.label}のバックアップ`;
  elements.manuscriptBackupStatus.textContent = "読み込み中…";
  elements.manuscriptBackupComparison.hidden = true;
  elements.manuscriptBackupList.hidden = false;
  elements.manuscriptBackupDialog.showModal();
  try { await renderManuscriptBackupHistory(); }
  catch (error) {
    showEmpty(elements.manuscriptBackupList, error.message || "バックアップ履歴を読み込めませんでした。");
  }
}






function canDiscardDraft() {
  if (state.deleting || state.conceptSwitchPending || state.relatedOpening || state.openingRecentManuscript) return false;
  if (state.saving || state.syncing) {
    notify(state.noteConceptSyncPending || state.noteManualSyncPending
      ? "構想メモへ反映中です。反映が終わってから移動してください。"
      : state.conceptSyncPending ? "項目メモへ反映中です。反映が終わってから移動してください。"
        : "保存中です。保存が終わってから移動してください。", true);
    return false;
  }
  return !state.dirty || window.confirm("保存していない変更があります。破棄して一覧へ戻りますか？");
}

const statusMessageHome = elements.statusMessage.parentElement;
elements.settingsDialog.addEventListener('close', () => {
  if (elements.statusMessage.parentElement === elements.settingsDialog) statusMessageHome.append(elements.statusMessage);
});
let statusTimer;
function notify(message, isError = false) {
  clearTimeout(statusTimer);
  // A modal is in the browser top layer; z-index alone cannot put a body toast above it.
  const inSettings = elements.settingsDialog?.open;
  if (inSettings && elements.statusMessage.parentElement !== elements.settingsDialog) elements.settingsDialog.append(elements.statusMessage);
  if (!inSettings && elements.manuscriptBackupDialog?.open && elements.manuscriptBackupNotice) {
    elements.statusMessage.classList.remove("visible");
    if (isError || elements.manuscriptBackupNotice.dataset.tone !== "error") {
      elements.manuscriptBackupNoticeText.textContent = message;
      elements.manuscriptBackupNotice.hidden = false;
      elements.manuscriptBackupNotice.dataset.tone = isError ? "error" : "success";
      elements.manuscriptBackupNotice.setAttribute("role", isError ? "alert" : "status");
    }
    return;
  }
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("error", isError);
  elements.statusMessage.classList.add("visible");
  statusTimer = setTimeout(() => elements.statusMessage.classList.remove("visible"), 4200);
}


function setBusy(button, busy, label = "読み込み中…") {
  if (!button) return;
  if (busy) {
    if (button.dataset.busy !== "true") button.dataset.originalLabel = button.textContent;
    button.dataset.busy = "true";
    button.disabled = true;
    button.textContent = label;
    return;
  }
  button.disabled = false;
  button.textContent = button.dataset.originalLabel || button.textContent;
  delete button.dataset.originalLabel;
  delete button.dataset.busy;
}

function makeRow(item, kind, onClick) {
  const button = document.createElement("button");
  button.className = `${kind}-row`;
  button.type = "button";
  const iconClass = kind === "folder" ? "icon-folder" : "icon-file";
  button.innerHTML = `<span class="row-icon" aria-hidden="true"><span class="ui-icon ${iconClass}"></span></span><span class="row-content"><span class="row-title"></span><span class="row-meta"></span></span>`;
  button.querySelector(".row-title").textContent = item.name;
  button.querySelector(".row-meta").textContent = kind === "folder"
    ? formatDate(item.lastModifiedDateTime)
    : `${formatSize(item.size)} ・ ${formatDate(item.lastModifiedDateTime)}`;
  button.addEventListener("click", onClick);
  return button;
}

function makeManuscriptRow(item, onOpen) {
  if (item.folder) {
    const row = makeRow(item, "folder", () => onOpen());
    if (item.nestedManuscriptWarning) {
      row.classList.add("nested-manuscript-folder");
      row.querySelector(".row-meta").textContent = "⚠ 原稿フォルダが二重になっています";
    }
    if (item.manuscriptShortcutFolders?.length) {
      const wrapper = makeElement("div", "folder-row-with-shortcuts");
      const shortcuts = makeElement("div", "manuscript-folder-shortcuts");
      shortcuts.setAttribute("aria-label", `${item.name}内のフォルダ`);
      item.manuscriptShortcutFolders.forEach((folder) => {
        const shortcut = makeElement("button", "manuscript-folder-shortcut", folder.name);
        shortcut.type = "button";
        shortcut.setAttribute("aria-label", `${item.name}内の${folder.name}を開く`);
        shortcut.addEventListener("click", () => onOpen(folder));
        shortcuts.append(shortcut);
      });
      wrapper.append(row, shortcuts);
      return withManuscriptRename(wrapper, item);
    }
    return withManuscriptRename(row, item);
  }
  const row = document.createElement("div");
  row.className = "file-row-with-actions";
  const openButton = makeRow(item, "file", onOpen);
  const moveButton = makeElement("button", "file-move-button", "移動");
  moveButton.type = "button";
  moveButton.setAttribute("aria-label", `${item.name}を移動`);
  moveButton.addEventListener("click", () => openMoveFileDialog(item).catch((error) => notify(error.message, true)));
  const actions = makeElement("div", "manuscript-row-actions");
  actions.append(makeManuscriptRenameButton(item), moveButton);
  row.append(openButton, actions);
  return row;
}

function showEmpty(container, message) {
  const empty = document.getElementById("emptyTemplate").content.cloneNode(true);
  empty.querySelector("span").textContent = message;
  container.replaceChildren(empty);
}

function showLoading(container, message) {
  const loading = makeElement("div", "loading-empty");
  loading.setAttribute("aria-label", message);
  const spinner = makeElement("span", "spinner");
  spinner.setAttribute("aria-hidden", "true");
  loading.setAttribute("aria-label", message);
  loading.append(spinner, makeElement("span", "loading-word", "Loading"));
  container.replaceChildren(loading);
}

function configureAuth() {
  const clientId = resolveMicrosoftClientId(state.runtimeConfig, localStorage);
  const googleClientId = resolveGoogleClientId(state.runtimeConfig);
  state.managedDeployment = isManagedDeployment(state.runtimeConfig);
  state.microsoftAuth = new MicrosoftAuth({ clientId });
  state.googleDriveAuth = new GoogleDriveAuth({ clientId: googleClientId });
  state.dropboxAuth = new DropboxAuth({ clientId: state.runtimeConfig.dropboxClientId });
  state.googleDrivePicker = new GoogleDrivePicker({
    apiKey: state.runtimeConfig.googleApiKey,
    appId: state.runtimeConfig.googleAppId,
  });
  activateCloud(state.cloudKind);
  elements.clientIdInput.value = clientId;
  elements.connectGoogleDriveButton.hidden = !googleClientId;
  elements.connectDropboxButton.hidden = !state.dropboxAuth.clientId;
  elements.clientIdField.hidden = state.managedDeployment;
  elements.clientIdHelp.hidden = state.managedDeployment;
  elements.personalSetupHelp.hidden = state.managedDeployment;
  elements.saveConnectionSettingsButton.hidden = state.managedDeployment;
  elements.redirectUriValue.textContent = state.microsoftAuth.redirectUri;
  return { microsoftClientId: clientId, googleClientId };
}

function showLoginGate(message, tone = "", showProviders = false) {
  document.body.classList.remove("auth-pending");
  document.body.classList.add("login-gated");
  elements.authBoot.hidden = true;
  elements.loginGate.hidden = false;
  elements.loginMessage.textContent = message;
  elements.loginMessage.className = `login-message${tone ? ` ${tone}` : ""}`;
  elements.loginProviderActions.hidden = !showProviders;
}

function hasPendingInitialViewRestore() {
  const route = !state.historyInitialized ? history.state?.mojigotoRoute : null;
  return Boolean(route?.kind && route.kind !== "works");
}

function showInitialViewRestoreLoading() {
  // Continue the startup cover only; never cover a HOME that is already usable.
  if (elements.authBoot.hidden || !hasPendingInitialViewRestore()) return false;
  elements.authBootMessage.textContent = "前回の画面を開いています…";
  elements.authBoot.classList.add("view-restore");
  elements.authBoot.hidden = false;
  elements.authBoot.setAttribute("aria-busy", "true");
  return true;
}

function finishAuthBoot() {
  // Login is confirmed: cloud connection and route restoration continue on HOME.
  finishViewRestoreLoading();
}

function showLoginRedirectLoading(providerLabel) {
  elements.authBootMessage.textContent = `${providerLabel}でログインを確認しています…`;
  elements.authBoot.hidden = false;
  elements.authBoot.setAttribute("aria-busy", "true");
  document.body.classList.remove("login-gated");
  document.body.classList.add("auth-pending");
}

function renderUserIdentity() {
  const user = state.userSession?.user;
  const label = user?.nickname || user?.email || "";
  if (elements.accountSessionEmail) elements.accountSessionEmail.textContent = label || "ログイン済み";
  if (elements.userIdentityBadge) {
    elements.userIdentityBadge.textContent = label;
    elements.userIdentityBadge.title = label;
    elements.userIdentityBadge.hidden = !label;
  }
  if (elements.profilePanel) elements.profilePanel.hidden = !state.runtimeConfig?.loginRequired;
  if (elements.nicknameInput) elements.nicknameInput.value = user?.nickname || "";
}

async function initializeUserAccess() {
  if (!state.runtimeConfig.loginRequired) {
    return true;
  }
  if (!state.runtimeConfig.authApiBase) {
    showLoginGate("管理者によるログイン設定が完了していません。", "error");
    return false;
  }
  state.userAuth = new UserAuthClient({ apiBase: state.runtimeConfig.authApiBase });
  const providers = state.runtimeConfig.loginProviders;
  elements.microsoftLoginLink.hidden = !providers.includes("microsoft");
  elements.googleLoginLink.hidden = !providers.includes("google");
  elements.microsoftLoginLink.href = state.userAuth.loginUrl("microsoft");
  elements.googleLoginLink.href = state.userAuth.loginUrl("google");
  elements.emailLoginLink.hidden = !providers.includes("email");
  elements.emailLoginLink.href = state.userAuth.loginUrl("email");
  try {
    state.userSession = await state.userAuth.getSession();
  } catch (error) {
    showLoginGate(error.message || "ログイン状態を確認できませんでした。", "error");
    return false;
  }
  if (state.userSession.access === "admin_only") {
    showLoginGate("このアカウントは管理専用です。普段の利用アカウントでログインしてください。", "error", providers.length > 0);
    return false;
  }
  if (state.userSession.access === "not_invited") {
    showLoginGate("このアカウントは招待登録されていません。招待された別のアカウントでログインするか、管理者へ確認してください。", "error", providers.length > 0);
    return false;
  }
  if (state.userSession.access === "disabled") {
    showLoginGate("このアカウントは現在利用できません。管理者へ確認してください。", "error");
    return false;
  }
  if (state.userSession.access !== "active") {
    showLoginGate("招待されたアカウントでログインができます。", "", providers.length > 0);
    return false;
  }
  document.body.classList.remove("login-gated");
  elements.loginGate.hidden = true;
  elements.accountSessionPanel.hidden = false;
  renderUserIdentity();
  if (elements.adminPageLink) elements.adminPageLink.hidden = true;
  return true;
}

function userAccessMessage(session) {
  if (!session.authenticated) return "ログインの有効時間が切れました。もう一度ログインしてください。";
  if (session.access === "admin_only") return "このアカウントは管理専用です。普段の利用アカウントでログインしてください。";
  if (session.access === "disabled") return "このアカウントは現在利用できません。管理者へ確認してください。";
  if (session.access === "not_invited") return "このアカウントの招待登録が解除されました。管理者へ確認してください。";
  return "利用状態を確認できませんでした。管理者へ確認してください。";
}

function suspendForUserAccess(session) {
  state.accessSuspended = true;
  cancelAutoSave();
  stopExternalMonitor();
  for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
  showLoginGate(userAccessMessage(session), "error", (!session.authenticated || session.access === "admin_only") && state.runtimeConfig.loginProviders.length > 0);
}

function restoreUserAccess(session) {
  const wasSuspended = state.accessSuspended;
  state.accessSuspended = false;
  state.userSession = session;
  document.body.classList.remove("login-gated");
  elements.loginGate.hidden = true;
  renderUserIdentity();
  if (elements.adminPageLink) elements.adminPageLink.hidden = true;
  if (wasSuspended) {
    const target = state.currentSettings?.item || (state.currentConceptMemo ? state.conceptFile : state.currentNote?.item || state.currentFile);
    if (target) startExternalMonitor();
    notify("利用を再開しました。");
  }
}

async function checkUserAccess({ force = false } = {}) {
  if (!state.runtimeConfig?.loginRequired || !state.userAuth || state.checkingUserAccess) return;
  if (!force && Date.now() - state.lastUserAccessCheck < 15000) return;
  state.checkingUserAccess = true;
  state.lastUserAccessCheck = Date.now();
  try {
    const session = await state.userAuth.getSession();
    if (session.access === "active") restoreUserAccess(session);
    else suspendForUserAccess(session);
  } catch {
    // 一時的な通信失敗だけでは編集中の画面を閉じない。
  } finally {
    state.checkingUserAccess = false;
  }
}

function startUserAccessMonitor() {
  clearInterval(state.userAccessCheckTimer);
  if (!state.runtimeConfig?.loginRequired) return;
  state.userAccessCheckTimer = setInterval(checkUserAccess, USER_ACCESS_CHECK_INTERVAL);
}

async function showFolder(folder, trail = null) {
  // Browsing another folder supersedes any background work-list refresh.
  state.worksLoadToken += 1;
  state.workMetricsLoadToken += 1;
  state.worksOrderPending = false;
  state.currentFolder = folder;
  if (trail) state.folderTrail = trail;
  elements.browserSection.hidden = false;
  elements.worksSection.hidden = true;
  elements.filesSection.hidden = true;
  elements.readerSection.hidden = true;
  elements.notesSection.hidden = true;
  elements.noteEditorSection.hidden = true;
  hideConceptViews();
  renderInputAssistVisibility();
  elements.folderList.innerHTML = "";
  showEmpty(elements.folderList, "フォルダを読み込んでいます…");

  const items = sortDriveItems(await state.provider.listChildren(folder.id));
  const folders = items.filter((item) => item.folder);
  if (!folders.length) showEmpty(elements.folderList, "この中にフォルダはありません");
  else elements.folderList.replaceChildren(...folders.map((item) => makeRow(item, "folder", () => showFolder(item, [...state.folderTrail, item]))));

  elements.breadcrumbs.replaceChildren(...state.folderTrail.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "crumb";
    button.textContent = item.name || (index === 0 ? cloudLabel() : "フォルダ");
    button.addEventListener("click", () => showFolder(item, state.folderTrail.slice(0, index + 1)));
    return button;
  }));
}

function basicWorkMetrics(work) {
  return {
    updatedAt: work.contentUpdatedAt || work.sharedMetrics?.updatedAt || work.updatedAt || "",
    skipped: true,
  };
}

async function loadWorkMetrics(works, metricsToken, { onStableDisplay = null } = {}) {
  if (!state.workMetricsEnabled || metricsToken !== state.workMetricsLoadToken) return;
  const provider = state.provider;
  const isCurrent = () => metricsToken === state.workMetricsLoadToken && state.workMetricsEnabled && provider === state.provider;
  const sortField = elements.workSortField.value;
  const waitForIndexSort = sortField === "updatedAt";
  const waitForDetailedSort = sortField === "totalChars" || sortField === "noteCount";
  const renderStableList = () => {
    if (!isCurrent()) return;
    state.worksOrderPending = false;
    renderWorksList();
    onStableDisplay?.();
    onStableDisplay = null;
  };
  const pendingWorks = [];
  for (const work of works) {
    if (work.sharedMetrics) {
      work.metrics = work.sharedMetrics;
      continue;
    }
    const summaryKey = workMetricSummaryKey(work);
    const cached = summaryKey ? state.workMetricSummaries.get(summaryKey) : null;
    if (cached && Number.isFinite(Number(cached.totalChars)) && Number.isFinite(Number(cached.noteCount))) {
      work.contentUpdatedAt = String(cached.updatedAt || work.contentUpdatedAt || "");
      work.metrics = {
        totalChars: Number(cached.totalChars),
        noteCount: Number(cached.noteCount),
        updatedAt: work.contentUpdatedAt,
      };
    } else {
      pendingWorks.push(work);
    }
  }
  if (!pendingWorks.length) {
    renderStableList();
    elements.workSortField.disabled = false;
    elements.workSortDirection.disabled = false;
    elements.workMetricsToggle.disabled = false;
    elements.worksLoadingStatus.hidden = true;
    return;
  }
  elements.worksLoadingStatus.hidden = false;
  elements.worksLoadingStatus.lastElementChild.textContent = `${pendingWorks.length}作品の更新日時を確認しています…`;
  if (!waitForIndexSort && !waitForDetailedSort) renderStableList();
  const finishIndexes = beginPerformanceMeasurement("作品集計・索引取得", { works: pendingWorks.length });
  let indexes;
  try {
    indexes = await collectWorkIndexes(provider, pendingWorks);
  } catch {
    if (!isCurrent()) return;
    const settled = await Promise.allSettled(pendingWorks.map((work) => collectWorkIndex(provider, work)));
    indexes = settled.map((result, index) => result.status === "fulfilled" ? result.value : {
      manuscriptFiles: [], noteFiles: [], updatedAt: pendingWorks[index].updatedAt,
    });
  }
  if (!isCurrent()) return;
  finishIndexes();
  pendingWorks.forEach((work, index) => {
    work.metricIndex = indexes[index];
    work.contentUpdatedAt = indexes[index].updatedAt || work.contentUpdatedAt || "";
    work.metrics = { updatedAt: indexes[index].updatedAt, pending: true };
  });
  if (waitForIndexSort) renderStableList();

  const finishDetails = beginPerformanceMeasurement("作品集計・本文と件数", { works: pendingWorks.length });
  let completed = 0;
  elements.worksLoadingStatus.lastElementChild.textContent = `${pendingWorks.length}作品の文字数・ノート数を集計しています…`;
  await Promise.allSettled(pendingWorks.map(async (work) => {
    try {
      const metrics = await collectWorkMetrics(provider, work, work.metricIndex, {
        characterCounts: state.workCharacterCounts,
      });
      if (isCurrent()) work.metrics = metrics;
    } catch {
      if (isCurrent()) {
        work.metrics = { totalChars: 0, noteCount: 0, updatedAt: work.metrics?.updatedAt || work.updatedAt, failed: true };
      }
    } finally {
      completed += 1;
      if (isCurrent()) {
        if (!waitForDetailedSort) updateVisibleWorkMetrics(work);
        elements.worksLoadingStatus.lastElementChild.textContent = `文字数・ノート数を集計しています（${completed}/${pendingWorks.length}）`;
      }
    }
  }));
  if (!isCurrent()) return;
  finishDetails();
  for (const work of pendingWorks) {
    const summaryKey = workMetricSummaryKey(work);
    if (summaryKey && work.metrics && !work.metrics.failed && !work.metrics.pending) {
      state.workMetricSummaries.set(summaryKey, work.metrics);
    }
  }
  persistWorkCharacterCounts();
  persistWorkMetricSummaries();
  if (waitForDetailedSort) renderStableList();
  elements.workSortField.disabled = false;
  elements.workSortDirection.disabled = false;
  elements.workMetricsToggle.disabled = false;
  elements.worksLoadingStatus.hidden = true;
}

async function loadWorks(root) {
  if (state.cloudKind === "googleDrive" && root?.googleDriveScope !== state.googleDriveAuth.scope) {
    location.assign("./google-drive-setup.html");
    return;
  }
  state.recentWorkCatalogPending = false;
  const cachedCatalog = readWorkCatalog(root);
  const performanceDetails = {
    metrics: state.workMetricsEnabled ? "ON" : "OFF",
    settingsCache: state.workSettingsSummaries.size ? "あり" : "なし",
    sharedMetricsCache: state.workSharedMetrics.size ? "あり" : "なし",
    catalogCache: cachedCatalog ? "あり" : "なし",
  };
  const finishFirstDisplay = beginPerformanceMeasurement("作品一覧・先行表示", performanceDetails);
  const finishBaseLoad = beginPerformanceMeasurement("作品一覧・基本情報完了", performanceDetails);
  const finishFullLoad = beginPerformanceMeasurement("作品一覧・全処理完了", performanceDetails);
  const loadToken = ++state.worksLoadToken;
  const provider = state.provider;
  const owner = workCatalogOwner();
  const isCurrentLoad = () => loadToken === state.worksLoadToken && provider === state.provider
    && owner === workCatalogOwner() && String(root.id) === String(state.workRoot?.id)
    && String(root.parentReference?.driveId || "") === String(state.workRoot?.parentReference?.driveId || "");
  let cachedCatalogVisible = false;
  const savedRoute = !state.historyInitialized ? history.state?.mojigotoRoute : null;
  const savedWork = savedRoute?.work;
  const fastInitialRestore = Boolean(
    savedRoute?.kind && savedRoute.kind !== "works"
    && isRestorableWorkSnapshot(savedWork)
    && String(savedWork.id) === String(savedRoute.workId || ""),
  );
  showInitialViewRestoreLoading();
  state.worksOrderPending = true;
  elements.workSortField.disabled = true;
  elements.workSortDirection.disabled = true;
  elements.workMetricsToggle.disabled = true;
  state.workMetricsLoadToken += 1;
  state.workRoot = root;
  elements.connectionPanel.classList.remove("needs-folder-selection");
  localStorage.setItem(rootStorageKey(), JSON.stringify(root));
  elements.browserSection.hidden = true;
  elements.filesSection.hidden = true;
  elements.notesSection.hidden = true;
  elements.noteEditorSection.hidden = true;
  hideConceptViews();
  renderInputAssistVisibility();
  elements.worksSection.hidden = fastInitialRestore;
  elements.workRootLabel.textContent = `${cloudLabel()} / ${root.name || "作品フォルダ"}`;
  elements.worksLoadingStatus.hidden = false;
  elements.worksLoadingStatus.lastElementChild.textContent = "作品を探しています…";
  elements.workMetricsToggle.checked = state.workMetricsEnabled;
  elements.worksCount.textContent = "件数を確認しています…";
  showEmpty(elements.worksList, "作品を探しています…");
  if (cachedCatalog && !fastInitialRestore) {
    state.works = cachedCatalog;
    setListCount(elements.worksCount, cachedCatalog.length);
    elements.worksLoadingStatus.lastElementChild.textContent = "前回の一覧を表示しています。最新状態を確認しています…";
    if (!hasPendingInitialViewRestore()) {
      state.worksOrderPending = false;
      renderWorksList();
      initializeViewHistory();
      cachedCatalogVisible = true;
      finishFirstDisplay({ works: cachedCatalog.length, source: "cache" });
    }
  }
  if (fastInitialRestore) {
    state.works = [savedWork];
    state.historyInitialized = true;
    restoreRoute(savedRoute, { fromHistory: true }).catch((error) => {
      notify(error.message || "前回の画面を復元できませんでした。", true);
      showWorksHome();
    }).finally(finishViewRestoreLoading);
  }
  let catalogDelta = null;
  const discovery = discoverWorkCatalog(provider, root, {
    cachedWorks: cachedCatalog || [], deltaState: readWorkCatalogDelta(root, cachedCatalog),
    isCurrent: isCurrentLoad, measure: beginPerformanceMeasurement,
  }, (reportIncomplete) => discoverWorks(provider, root, {
    reportIncomplete,
    cachedWorks: cachedCatalog || [],
    settingsCache: state.workSettingsSummaries,
    metricsCache: state.workSharedMetrics,
    measure: beginPerformanceMeasurement,
    onSkeletons(works) {
      if (!isCurrentLoad()) return;
      if (cachedCatalog) {
        elements.worksLoadingStatus.lastElementChild.textContent = "最新状態を確認しています…";
        return;
      }
      state.works = works;
      setListCount(elements.worksCount, works.length);
      elements.worksLoadingStatus.lastElementChild.textContent = "作品設定を読み込んでいます…";
    },
  })).then((result) => {
    catalogDelta = result.deltaState;
    return result.works;
  }).catch((error) => {
    if (!isCurrentLoad()) return null;
    state.worksOrderPending = false;
    elements.workSortField.disabled = false;
    elements.workSortDirection.disabled = false;
    elements.workMetricsToggle.disabled = false;
    finishFullLoad({ failed: true });
    if (!cachedCatalogVisible) throw error;
    elements.worksLoadingStatus.lastElementChild.textContent = "一覧を更新できませんでした。前回の一覧を表示しています。";
    notify(error.message || "作品一覧を更新できませんでした。", true);
    return null;
  });
  state.referenceWorkDiscovery = {
    provider, token: loadToken, promise: discovery,
    scope: JSON.stringify([owner, state.cloudKind, root.id || "", root.parentReference?.driveId || ""]),
  };
  let discoveredWorks;
  try { discoveredWorks = await discovery; }
  finally { if (state.referenceWorkDiscovery?.promise === discovery) state.referenceWorkDiscovery = null; }
  if (!isCurrentLoad() || !discoveredWorks) return;
  finishBaseLoad({ works: discoveredWorks.length });
  const selectedWork = state.selectedWork;
  state.works = discoveredWorks.map((work) => {
    if (!selectedWork || String(work.id || "") !== String(selectedWork.id || "")) return work;
    Object.assign(selectedWork, work);
    return selectedWork;
  });
  persistWorkSettingsSummaries();
  persistWorkSharedMetrics();
  if (!state.works.length) {
    state.worksOrderPending = false;
    elements.workSortField.disabled = false;
    elements.workSortDirection.disabled = false;
    elements.workMetricsToggle.disabled = false;
    persistWorkCatalog(root, []);
    if (!fastInitialRestore) finishViewRestoreLoading();
    elements.worksLoadingStatus.hidden = true;
    setListCount(elements.worksCount, 0);
    showEmpty(elements.worksList, "作品が見つかりませんでした。.mojigoto または manuscript フォルダを確認してください。");
    finishFirstDisplay({ works: 0, source: "sorted" });
    finishFullLoad({ works: 0 });
    return;
  }
  setListCount(elements.worksCount, state.works.length);
  if (!state.workMetricsEnabled) state.works.forEach((work) => { work.metrics = basicWorkMetrics(work); });
  persistWorkCatalog(root, state.works, catalogDelta);
  if (!fastInitialRestore && !cachedCatalogVisible) initializeViewHistory();
  if (!state.workMetricsEnabled) {
    state.worksOrderPending = false;
    elements.workSortField.disabled = false;
    elements.workSortDirection.disabled = false;
    elements.workMetricsToggle.disabled = false;
    renderWorksList();
    finishFirstDisplay({ works: state.works.length, source: "sorted" });
    elements.worksLoadingStatus.hidden = true;
    finishFullLoad({ works: state.works.length });
    return;
  }
  const metricsToken = ++state.workMetricsLoadToken;
  await loadWorkMetrics(state.works, metricsToken, {
    onStableDisplay: () => finishFirstDisplay({ works: state.works.length, source: "sorted" }),
  });
  if (!isCurrentLoad() || metricsToken !== state.workMetricsLoadToken) return;
  persistWorkCatalog(root, state.works, catalogDelta);
  finishFullLoad({ works: state.works.length });
}

async function openWork(work) {
  const changingWork = state.selectedWork?.id !== work.id;
  if (changingWork) resetReaderNoteReference();
  state.selectedWork = work;
  state.noteFolders = {};
  state.notes = [];
  if (changingWork) {
    state.conceptDocument = null;
    state.conceptFile = null;
    state.conceptOriginalContent = "";
    state.conceptWorkId = "";
    state.conceptLoadedAt = 0;
  }
  elements.worksSection.hidden = true;
  elements.filesSection.hidden = false;
  elements.readerSection.hidden = true;
  elements.notesSection.hidden = true;
  elements.noteEditorSection.hidden = true;
  hideConceptViews();
  renderInputAssistVisibility();
  elements.selectedWorkTitle.textContent = work.title;
  renderRecentManuscripts();
  if (!work.manuscript) {
    setListCount(elements.filesCount, 0);
    showEmpty(elements.filesList, "原稿フォルダがありません");
    return;
  }
  await openManuscriptFolder(work.manuscript, []);
}

async function openManuscriptFolder(folder, trail) {
  const request = state.manuscriptFolderLoadRequest = (state.manuscriptFolderLoadRequest || 0) + 1;
  const provider = state.provider, work = state.selectedWork, root = state.workRoot, session = state.userSession;
  const current = () => request === state.manuscriptFolderLoadRequest && state.provider === provider
    && state.selectedWork === work && state.workRoot === root && state.userSession === session
    && state.manuscriptFolder === folder && !elements.filesSection.hidden;
  const listingCache = state.folderListings.get(folderListingKey(folder));
  const finishMeasurement = beginPerformanceMeasurement("原稿一覧", {
    cache: listingCache && Date.now() - listingCache.loadedAt < VIEW_CACHE_DURATION ? "再利用" : "取得",
  });
  state.currentNote = null;
  state.currentConceptMemo = null;
  state.manuscriptFolder = folder;
  state.manuscriptTrail = trail;
  elements.browserSection.hidden = true;
  elements.worksSection.hidden = true;
  elements.filesSection.hidden = false;
  elements.readerSection.hidden = true;
  elements.notesSection.hidden = true;
  elements.noteEditorSection.hidden = true;
  hideConceptViews();
  renderInputAssistVisibility();
  const suffix = trail.length ? ` / ${trail.map((item) => item.name).join(" / ")}` : "";
  elements.selectedWorkTitle.textContent = `${state.selectedWork.title}${suffix}`;
  const rootButton = makeElement("button", "crumb", "原稿");
  rootButton.type = "button";
  rootButton.addEventListener("click", () => openManuscriptFolder(state.selectedWork.manuscript, []).catch((error) => notify(error.message, true)));
  const crumbs = [rootButton];
  trail.forEach((item, index) => {
    const separator = makeElement("span", "breadcrumb-separator", "›");
    const button = makeElement("button", "crumb", item.name);
    button.type = "button";
    button.addEventListener("click", () => openManuscriptFolder(item, trail.slice(0, index + 1)).catch((error) => notify(error.message, true)));
    crumbs.push(separator, button);
  });
  if (trail.length) {
    const up = makeElement("button", "manuscript-up", "↑ 一つ上へ");
    up.type = "button";
    up.addEventListener("click", () => {
      const nextTrail = trail.slice(0, -1);
      const parent = nextTrail.at(-1) || state.selectedWork.manuscript;
      openManuscriptFolder(parent, nextTrail).catch((error) => notify(error.message, true));
    });
    crumbs.unshift(up);
  }
  elements.manuscriptBreadcrumbs.replaceChildren(...crumbs);
  renderRecentManuscripts();
  showLoading(elements.filesList, "原稿を読み込んでいます…");
  elements.filesCount.textContent = "件数を確認しています…";
  let items;
  try {
    items = sortDriveItems(await listChildrenCached(folder));
  } catch (error) {
    if (current()) throw error;
    finishMeasurement({ cancelled: true });
    return;
  }
  if (!current()) { finishMeasurement({ cancelled: true }); return; }
  const visible = items.filter((item) => item.folder || isManuscriptFile(item));
  const isManuscriptRoot = !trail.length
    && String(folder?.id || "") === String(state.selectedWork?.manuscript?.id || "");
  const nestedManuscriptFolders = isManuscriptRoot
    ? visible.filter((item) => item?.folder && MANUSCRIPT_FOLDER_NAMES.has(String(item.name || "").toLowerCase()))
    : [];
  nestedManuscriptFolders.forEach((item) => { item.nestedManuscriptWarning = true; });
  await Promise.all(visible.filter((item) => item.folder && !item.nestedManuscriptWarning).map(async (item) => {
    if (!current()) return;
    item.manuscriptShortcutFolders = [];
    try {
      const children = sortDriveItems(await listChildrenCached(item));
      if (!current()) return;
      const directManuscripts = children.filter((child) => isManuscriptFile(child));
      if (!directManuscripts.length) {
        item.manuscriptShortcutFolders = children.filter((child) => child.folder);
      }
    } catch {
      // Shortcut discovery is optional; the normal folder navigation remains available.
    }
  }));
  if (!current()) { finishMeasurement({ cancelled: true }); return; }
  if (nestedManuscriptFolders.length) {
    const warningKey = `${state.cloudKind}:${state.selectedWork?.id || ""}:${folder?.id || ""}`;
    if (!state.nestedManuscriptWarnings.has(warningKey)) {
      state.nestedManuscriptWarnings.add(warningKey);
      const names = nestedManuscriptFolders.map((item) => `「${item.name}」`).join("、");
      notify(`原稿フォルダが二重になっています（内側: ${names}）。内容は表示できますが、内側の原稿を外側の原稿フォルダへ移動し、空になった内側のフォルダを削除してください。`, true);
    }
  }
  const folderCount = visible.filter((item) => item.folder).length;
  const fileCount = visible.length - folderCount;
  elements.filesCount.textContent = `${formatNumber(visible.length)}件（章フォルダ ${formatNumber(folderCount)}・原稿 ${formatNumber(fileCount)}）`;
  if (!visible.length) showEmpty(elements.filesList, "原稿ファイルがありません");
  else elements.filesList.replaceChildren(...visible.map((item) => makeManuscriptRow(item, (shortcutFolder = null) => {
    if (item.folder) {
      const targetFolder = shortcutFolder || item;
      const targetTrail = shortcutFolder ? [...trail, item, shortcutFolder] : [...trail, item];
      openManuscriptFolder(targetFolder, targetTrail).catch((error) => notify(error.message, true));
    }
    else openFile(item).catch((error) => notify(error.message, true));
  })));
  commitRoute(routeForWork("manuscript-list", { folder, trail }));
  finishMeasurement({ items: visible.length });
}



function makeElement(tag, className = "", textContent = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

async function ensureNoteFolder(type, { create = true } = {}) {
  const work = state.selectedWork;
  const provider = state.provider;
  const current = () => state.selectedWork === work && state.provider === provider;
  const folderName = NOTE_TYPES[type].folder;
  if (state.noteFolders[type]?.id) return state.noteFolders[type];
  if (!work?.mojigoto) throw new Error("作品の .mojigoto フォルダが見つかりません。");
  let children = Array.isArray(work.mojigotoChildren)
    ? work.mojigotoChildren
    : [];
  let folder = children.find((item) => item?.folder && item.name === folderName);
  if (!folder) {
    children = await provider.listChildren(work.mojigoto.id);
    if (!current()) throw new Error("作品が切り替わったため、ノートの読み込みを中止しました。");
    work.mojigotoChildren = children;
    folder = children.find((item) => item?.folder && item.name === folderName);
  }
  if (!folder) {
    if (state.cloudKind === "googleDrive") {
      throw new Error(`ノートの保存先 ${folderName} を確認できません。Google Driveの設定ページで .mojigoto 内のフォルダと中身を追加許可し、作品一覧を再読み込みしてください。まだフォルダがない場合はVS Codeでノートを作成し、同期後に許可してください。重複を防ぐため、新規作成していません。`);
    }
    if (!create) return null;
    folder = await provider.createFolder(work.mojigoto, folderName);
    if (!current()) throw new Error("作品が切り替わったため、ノートの読み込みを中止しました。");
    work.mojigotoChildren.push(folder);
  }
  state.noteFolders[type] = folder;
  return folder;
}

async function readNoteEntry(item, type) {
  const raw = await state.provider.readText(item);
  return { item, data: normalizeNote(JSON.parse(raw), type), raw };
}

function indexedNoteEntry(item, summary) {
  return {
    item,
    summary,
    indexed: true,
    data: {
      id: summary.id,
      type: summary.type,
      title: summary.title,
      order: summary.order,
      updatedAt: summary.updatedAt,
      groups: Array.from({ length: summary.groupCount }, () => ({})),
    },
  };
}

function sortNoteEntries(entries) {
  return [...entries].sort((a, b) => {
    const orderA = Number.isFinite(a.data.order) ? a.data.order : null;
    const orderB = Number.isFinite(b.data.order) ? b.data.order : null;
    if (orderA != null && orderB != null && orderA !== orderB) return orderA - orderB;
    if (orderA != null) return -1;
    if (orderB != null) return 1;
    return a.data.title.localeCompare(b.data.title, "ja", { numeric: true, sensitivity: "base" });
  });
}

async function loadSelectedNoteIndex({ refresh = false } = {}) {
  const work = state.selectedWork;
  const provider = state.provider;
  const current = () => state.selectedWork === work && state.provider === provider;
  if (!work?.mojigoto) return null;
  const sameWork = state.noteIndexWorkId === String(work.id || "");
  if (sameWork && (!refresh || Date.now() - state.noteIndexCheckedAt < 30000)) return state.noteIndex;
  let children = Array.isArray(work.mojigotoChildren) ? work.mojigotoChildren : [];
  if (refresh && sameWork) {
    children = await provider.listChildren(work.mojigoto.id);
    if (!current()) return null;
    work.mojigotoChildren = children;
  }
  let file = children.find((item) => item?.file && item.name === "notes-index.json") || null;
  if (!file) {
    children = await provider.listChildren(work.mojigoto.id);
    if (!current()) return null;
    work.mojigotoChildren = children;
    file = children.find((item) => item?.file && item.name === "notes-index.json") || null;
  }
  const sameVersion = state.noteIndexWorkId === String(work.id || "")
    && state.noteIndex
    && state.noteIndexFile
    && String(state.noteIndexFile.id || "") === String(file?.id || "")
    && String(state.noteIndexFile.eTag || state.noteIndexFile.lastModifiedDateTime || "")
      === String(file?.eTag || file?.lastModifiedDateTime || "");
  state.noteIndexWorkId = String(work.id || "");
  state.noteIndexFile = file;
  state.noteIndexCheckedAt = Date.now();
  if (sameVersion) return state.noteIndex;
  if (!file) return (state.noteIndex = null);
  try {
    const index = normalizeNoteIndex(JSON.parse(await provider.readText(file)));
    if (!current()) return null;
    state.noteIndex = index;
  } catch {
    if (!current()) return null;
    state.noteIndex = null;
  }
  return state.noteIndex;
}

async function updateNoteIndex(item, note, { remove = false } = {}) {
  const work = state.selectedWork;
  const provider = state.provider;
  const current = () => state.selectedWork === work && state.provider === provider;
  if (!work?.mojigoto || !item) return;
  try {
    const index = await loadSelectedNoteIndex() || {
      schemaVersion: 1,
      updatedAt: "",
      plots: [],
      references: [],
    };
    if (!current()) return;
    if (state.cloudKind === "googleDrive" && !state.noteIndexFile?.id) return;
    const type = note?.type === "reference" ? "reference" : "plot";
    const key = type === "reference" ? "references" : "plots";
    const summary = makeNoteIndexEntry(item, note, type);
    const entries = index[key].filter((entry) => entry.fileName !== summary.fileName && entry.id !== summary.id);
    if (!remove) entries.push(summary);
    index[key] = entries;
    index.updatedAt = new Date().toISOString();
    const content = `${JSON.stringify(index, null, 2)}\n`;
    const saved = state.noteIndexFile
      ? await provider.writeText(state.noteIndexFile, content, state.noteIndexFile.eTag)
      : await provider.createTextFile(work.mojigoto, "notes-index.json", content);
    if (!current()) return;
    state.noteIndexFile = { ...(state.noteIndexFile || {}), ...saved };
    state.noteIndex = index;
    if (!work.mojigotoChildren.some((entry) => entry.id === state.noteIndexFile.id)) {
      work.mojigotoChildren.push(state.noteIndexFile);
    }
  } catch {
    // 索引は次回のVS Code起動時にも再生成されるため、本体の保存は成功扱いにする。
  }
}

function renderNotesList() {
  const query = elements.noteSearchInput.value;
  const visible = state.notes.filter((entry) => entry.summary
    ? matchesNoteIndexEntry(entry.summary, query)
    : matchesNoteQuery(entry.data, query));
  setListCount(elements.notesCount, visible.length, state.notes.length);
  if (!visible.length) {
    showEmpty(elements.notesList, query ? "検索に一致するノートがありません" : "ノートがありません");
    return;
  }
  const rows = visible.map((entry) => {
    const button = makeElement("button", "note-row");
    button.type = "button";
    button.disabled = !entry.item?.id;
    button.append(
      makeElement("span", "note-row-title", entry.summary?.title || entry.data.title || entry.item.name.replace(/\.json$/i, "")),
      makeElement("span", "note-row-preview", entry.summary?.preview || notePreview(entry.data) || "内容はまだありません"),
      makeElement("span", "note-row-meta", `${entry.summary?.groupCount ?? entry.data.groups.length}分類 ・ ${formatDate(entry.summary?.updatedAt || entry.data.updatedAt || entry.item.lastModifiedDateTime)}`),
    );
    button.addEventListener("click", () => openNote(entry).catch((error) => notify(error.message, true)));
    return button;
  });
  elements.notesList.replaceChildren(...rows);
}

async function loadNoteEntriesForType(type, { preferCache = false, createFolder = true } = {}) {
  const work = state.selectedWork;
  const provider = state.provider;
  const current = () => state.selectedWork === work && state.provider === provider;
  const cacheKey = `${state.selectedWork?.id || ""}:${type}`;
  const cached = state.noteEntriesCache.get(cacheKey);
  if (preferCache && cached && !cached.failedCount && Date.now() - cached.savedAt < VIEW_CACHE_DURATION) return cached.entries;
  const folder = await ensureNoteFolder(type, { create: createFolder });
  if (!current()) throw new Error("作品が切り替わったため、ノートの読み込みを中止しました。");
  if (!folder) return [];
  const items = (await provider.listChildren(folder.id)).filter((item) => item?.file && /\.json$/i.test(item.name));
  if (!current()) throw new Error("作品が切り替わったため、ノートの読み込みを中止しました。");
  const settled = await Promise.allSettled(items.map((item) => readNoteEntry(item, type)));
  if (!current()) throw new Error("作品が切り替わったため、ノートの読み込みを中止しました。");
  const entries = settled.filter((result) => result.status === "fulfilled").map((result) => result.value);
  state.noteEntriesCache.set(cacheKey, { savedAt: Date.now(), entries, failedCount: settled.filter((result) => result.status === "rejected").length });
  return entries;
}

function readerNoteReferenceKey(entry) {
  return String(entry?.item?.id || entry?.item?.name || entry?.data?.id || "");
}

function appendNoteInline(parent, value, reading = "") {
  const tokens = String(reading || "").trim() && String(value || "").trim()
    ? [{ type: "ruby", text: String(value), reading: String(reading).trim() }]
    : parseNoteInline(value);
  for (const token of tokens) {
    if (token.type === "ruby") {
      const ruby = makeElement("ruby");
      ruby.append(document.createTextNode(token.text), makeElement("rp", "", "（"),
        makeElement("rt", "", token.reading), makeElement("rp", "", "）"));
      parent.append(ruby);
    } else if (token.type === "emphasis") parent.append(makeElement("span", "note-inline-emphasis", token.text));
    else parent.append(document.createTextNode(token.text));
  }
  return parent;
}

function notePreviewHeading(item) {
  const heading = makeElement("strong", "note-preview-item-title note-inline");
  if (item.kind === "divider") heading.textContent = item.label || "名称未設定の区分";
  else appendNoteInline(heading, item.heading || "名称未設定の項目", item.heading ? item.headingRuby : "");
  return heading;
}

function renderReaderNoteReference(entry, contentRoot = elements.readerNoteReferenceContent, sourceItemId = "") {
  const note = entry?.data;
  if (!note) {
    showEmpty(contentRoot, "表示するノートを選択してください");
    return;
  }
  const sections = (note.groups || []).map((group, groupIndex) => {
    const section = makeElement("details", "note-preview-group reader-note-reference-group");
    section.open = sourceItemId ? group.items.some((item) => item.id === sourceItemId) : groupIndex === 0;
    section.append(makeElement("summary", "note-preview-group-button", group.title || `大分類 ${groupIndex + 1}`));
    const items = makeElement("div", "note-preview-items");
    for (const item of group.items || []) {
      const divider = item.kind === "divider";
      const row = makeElement("article", `note-preview-item${divider ? " divider" : ""}`);
      if (sourceItemId && item.id === sourceItemId) {
        row.classList.add("is-source-target");
        row.setAttribute("aria-label", "連携先の項目");
      }
      const preview = makeElement("span", "note-preview-text");
      const appendLine = (label, value, emptyValue = "ありません") => {
        const line = makeElement("span", "note-preview-line note-inline");
        line.append(makeElement("strong", "", label));
        if (divider) line.append(document.createTextNode(value || emptyValue));
        else appendNoteInline(line, value || emptyValue);
        preview.append(line);
      };
      if (divider) appendLine("補足：", item.value);
      else {
        appendLine("項目詳細：", item.body, "未入力");
        if (item.memo?.body) appendLine("項目メモ：", item.memo.body);
      }
      row.append(
        makeElement("span", "note-preview-kind", divider ? "区分" : "項目"),
        notePreviewHeading(item),
        preview,
      );
      items.append(row);
    }
    if (!items.childElementCount) items.append(makeElement("p", "note-preview-empty", "項目はまだありません"));
    section.append(items);
    return section;
  });
  if (sections.length) contentRoot.replaceChildren(...sections);
  else showEmpty(contentRoot, "大分類はまだありません");
}

async function loadReaderNoteReferences(type = elements.readerNoteTypeSelect.value) {
  return readerNoteReferenceController.load(type);
}

function closeReaderNoteReference() {
  readerNoteReferenceController.close();
}

function resetReaderNoteReference() {
  readerNoteReferenceController.reset();
}

function toggleReaderNoteReference() {
  if (!elements.readerNoteReferencePanel.hidden) return closeReaderNoteReference();
  readerNoteReferenceController.open().catch(error => notify(error.message, true));
}

function renderRelatedResults() {
  const visible = state.relatedCandidates.filter((target) => matchesRelatedTarget(target, elements.relatedNoteSearchInput.value));
  if (!visible.length) {
    showEmpty(elements.relatedNoteResults, "関連付けられる項目がありません");
    return;
  }
  elements.relatedNoteResults.replaceChildren(...visible.map((target) => {
    const button = makeElement("button", "related-result");
    button.type = "button";
    const typeLabel = target.noteType === "plot" ? "プロット" : "資料";
    button.append(
      makeElement("strong", "", `${target.itemLabel} — ${target.noteTitle || "無題"}`),
      makeElement("span", "", `${typeLabel}${target.groupTitle ? ` / ${target.groupTitle}` : ""}${target.preview ? `\n${target.preview}` : ""}`),
    );
    button.addEventListener("click", () => {
      const context = state.relatedContext;
      const item = state.currentNote?.data?.groups?.[context?.groupIndex]?.items?.[context?.itemIndex];
      if (!item) return;
      item.relatedReferences = addRelatedTarget(item.relatedReferences, target);
      elements.relatedNoteDialog.close();
      renderNoteEditor();
      markNoteDirty();
    });
    return button;
  }));
}

async function openRelatedNoteDialog(groupIndex, itemIndex) {
  state.relatedContext = { groupIndex, itemIndex };
  elements.relatedNoteSearchInput.value = "";
  showEmpty(elements.relatedNoteResults, "関連先を読み込んでいます…");
  elements.relatedNoteDialog.showModal();
  const types = state.noteType === "plot" ? ["plot", "reference"] : ["reference"];
  const groups = await Promise.all(types.map((type) => loadNoteEntriesForType(type, { preferCache: true })));
  state.relatedCandidates = collectRelatedTargets(groups.flat(), state.noteType, state.currentNote?.data?.id);
  renderRelatedResults();
  elements.relatedNoteSearchInput.focus();
}

function relatedNoteMatches(entry, link) {
  if (!entry?.data || entry.data.type !== (link.noteType === "plot" ? "plot" : "reference")) return false;
  return link.noteId ? String(entry.data.id) === String(link.noteId)
    : Boolean(link.noteFileName && entry.item?.name === link.noteFileName);
}

async function resolveRelatedNote(link, provider, work) {
  const type = link.noteType === "plot" ? "plot" : "reference";
  if (relatedNoteMatches(state.currentNote, link)) return state.currentNote;
  const targetKey = `${work.id}:${type}:${link.noteId || link.noteFileName}`;
  const targetCache = state.relatedNoteEntries.get(targetKey);
  if (targetCache?.provider === provider && Date.now() - targetCache.savedAt < VIEW_CACHE_DURATION) return targetCache.entry;
  const cacheKey = `${work.id}:${type}`;
  const cached = state.noteEntriesCache.get(cacheKey);
  let entry = cached && Date.now() - cached.savedAt < VIEW_CACHE_DURATION
    ? cached.entries.find((candidate) => relatedNoteMatches(candidate, link)) : null;
  const read = async (item) => {
    const raw = await provider.readText(item);
    return { item, raw, data: normalizeNote(JSON.parse(raw), type) };
  };
  if (!entry) {
    const known = state.notes.find((candidate) => relatedNoteMatches(candidate, link));
    if (known?.item?.id) entry = await read(known.item);
  }
  if (!entry) {
    let folder = state.noteFolders[type] || work.mojigotoChildren?.find((item) => item.folder && item.name === NOTE_TYPES[type].folder);
    if (!folder) folder = (await provider.listChildren(work.mojigoto.id))
      .find((item) => item.folder && item.name === NOTE_TYPES[type].folder);
    if (!folder) throw new Error("関連先のノートフォルダを確認できません。追加許可や保存先を確認してください。");
    const listingKey = folderListingKey(folder);
    const listing = state.folderListings.get(listingKey);
    const freshListing = listing && Date.now() - listing.loadedAt < VIEW_CACHE_DURATION;
    const items = freshListing ? listing.items : await provider.listChildren(folder.id);
    if (state.provider === provider && state.selectedWork === work) {
      state.noteFolders[type] = folder;
      state.folderListings.set(listingKey, { items, loadedAt: freshListing ? listing.loadedAt : Date.now() });
    }
    const index = state.noteIndexWorkId === String(work.id) ? state.noteIndex : null;
    const summary = (type === "plot" ? index?.plots : index?.references)?.find((item) => link.noteId && item.id === String(link.noteId));
    const file = items.find((item) => item.file && item.name === (summary?.fileName || link.noteFileName));
    if (file) entry = await read(file);
    if (!relatedNoteMatches(entry, link)) {
      // An old link can retain the pre-rename filename. Search by identity only as a fallback.
      const settled = await Promise.allSettled(items.filter((item) => item.file && /\.json$/i.test(item.name) && item.id !== file?.id).map(read));
      entry = settled.find((result) => result.status === "fulfilled" && relatedNoteMatches(result.value, link))?.value;
    }
  }
  if (!relatedNoteMatches(entry, link)) throw new Error("関連先のノートが見つかりません。");
  if (state.provider === provider && state.selectedWork === work) {
    state.relatedNoteEntries.set(targetKey, { provider, entry, savedAt: Date.now() });
  }
  return entry;
}

async function openRelatedTarget(link) {
  const request = ++state.relatedPreviewRequest;
  const provider = state.provider;
  const work = state.selectedWork;
  const finish = beginPerformanceMeasurement("関連リンク表示");
  state.relatedPreviewContext = null;
  elements.openRelatedPreviewNoteButton.disabled = true;
  elements.relatedPreviewTitle.textContent = "関連ノート";
  elements.relatedPreviewType.textContent = "RELATED NOTE";
  elements.relatedPreviewPath.textContent = "";
  elements.relatedPreviewNotice.textContent = "関連先を読み込んでいます…";
  showLoading(elements.relatedPreviewContent, "関連先を読み込んでいます…");
  if (!elements.relatedPreviewDialog.open) elements.relatedPreviewDialog.showModal();
  try {
    if (link.importTarget && !link.importTarget.self) {
      const cacheKey = `${work.id}:import:${JSON.stringify(link.importTarget)}`;
      const cached = state.relatedNoteEntries.get(cacheKey);
      let resolved = cached?.provider === provider && Date.now() - cached.savedAt < VIEW_CACHE_DURATION ? cached.resolved : null;
      if (resolved && resolved.entry.item.id === state.currentNote?.item.id) {
        resolved = findImportedTarget([state.currentNote], link.importTarget, resolved.localWorkId);
      }
      if (!resolved) resolved = await resolveImportedNoteLink(provider, work, link, state.currentNote);
      if (request !== state.relatedPreviewRequest || !elements.relatedPreviewDialog.open || state.provider !== provider || state.selectedWork !== work) return;
      if (state.provider === provider && state.selectedWork === work) state.relatedNoteEntries.set(cacheKey, { provider, resolved, savedAt: Date.now() });
      link = resolved.link;
      // Reuse the normal path below, including current unsaved note data.
      if (state.provider === provider && state.selectedWork === work) state.relatedNoteEntries.set(`${work.id}:${link.noteType}:${link.noteId}`, { provider, entry: resolved.entry, savedAt: Date.now() });
    }
    const entry = await resolveRelatedNote(link, provider, work);
    if (request !== state.relatedPreviewRequest || !elements.relatedPreviewDialog.open || state.provider !== provider || state.selectedWork !== work) return;
    const target = renderRelatedTarget(entry, link);
    state.relatedPreviewContext = { provider, work, entry, link: { ...link }, ...target };
    const sameNote = state.currentNote?.item.id === entry.item.id;
    elements.openRelatedPreviewNoteButton.textContent = sameNote ? "このノートの項目へ移動" : "対象ノートを開く";
    elements.openRelatedPreviewNoteButton.disabled = false;
    elements.relatedPreviewNotice.textContent = sameNote ? "現在のノートの該当項目へ移動します。"
      : "現在の画面を離れて対象ノートの編集画面へ移動します。";
  } catch (error) {
    if (request !== state.relatedPreviewRequest || !elements.relatedPreviewDialog.open || state.provider !== provider || state.selectedWork !== work) return;
    elements.relatedPreviewNotice.textContent = error.message || "関連先を読み込めませんでした。";
    showEmpty(elements.relatedPreviewContent, "関連先のファイル・項目や追加許可を確認してください。");
  } finally { finish(); }
}

function renderRelatedTarget(entry, link) {
  let targetGroup = null;
  let targetItem = null;
  let targetItemIndex = -1;
  for (const group of entry.data.groups || []) {
    const itemIndex = (group.items || []).findIndex((candidate) => String(candidate.id) === String(link.itemId || ""));
    const item = itemIndex >= 0 ? group.items[itemIndex] : null;
    if (item) {
      targetGroup = group;
      targetItem = item;
      targetItemIndex = itemIndex;
      break;
    }
  }
  if (!targetItem) throw new Error("関連先の項目が見つかりません。");
  const typeLabel = entry.data.type === "reference" ? "資料" : "プロット";
  elements.relatedPreviewType.textContent = `${typeLabel.toUpperCase()} / 閲覧`;
  elements.relatedPreviewTitle.textContent = entry.data.title || "無題のノート";
  elements.relatedPreviewPath.textContent = [targetGroup?.title, targetItem.kind === "divider" ? "区分" : targetItem.heading].filter(Boolean).join(" / ");
  const content = makeElement("div");
  if (targetItem.kind === "divider") {
    const division = makeElement("dl", "related-preview-division");
    division.append(
      makeElement("dt", "", "区分名"), makeElement("dd", "", targetItem.label || "未設定"),
      makeElement("dt", "", "補足"), makeElement("dd", "", targetItem.value || "未設定"),
    );
    content.append(division);
    const nextItem = (targetGroup.items || [])[targetItemIndex + 1];
    if (nextItem && nextItem.kind !== "divider") {
      const nextHeading = makeElement("h3", "related-preview-subtitle note-inline", "次の項目：");
      appendNoteInline(nextHeading, nextItem.heading || "名称未設定", nextItem.heading ? nextItem.headingRuby : "");
      content.append(nextHeading);
      content.append(appendNoteInline(makeElement("p", "related-preview-body note-inline"), nextItem.body || "項目詳細はありません"));
      if (nextItem.memo?.body) {
        content.append(makeElement("h3", "related-preview-subtitle", "項目メモ"));
        content.append(appendNoteInline(makeElement("p", "related-preview-memo note-inline"), nextItem.memo.body));
      }
    }
  } else {
    content.append(appendNoteInline(makeElement("h3", "related-preview-subtitle note-inline"), targetItem.heading || "名称未設定の項目", targetItem.heading ? targetItem.headingRuby : ""));
    content.append(appendNoteInline(makeElement("p", "related-preview-body note-inline"), targetItem.body || "項目詳細はありません"));
    if (targetItem.memo?.body) {
      content.append(makeElement("h3", "related-preview-subtitle", "項目メモ"));
      content.append(appendNoteInline(makeElement("p", "related-preview-memo note-inline"), targetItem.memo.body));
    }
    if (targetItem.memo?.tags?.length) content.append(makeElement("p", "related-preview-tags", `タグ: ${targetItem.memo.tags.join("、")}`));
  }
  elements.relatedPreviewContent.replaceChildren(content);
  return { groupIndex: entry.data.groups.indexOf(targetGroup), itemIndex: targetItemIndex, itemId: targetItem.id };
}

function focusRelatedNoteItem(link) {
  const groups = state.currentNote?.data?.groups || [];
  const groupIndex = groups.findIndex((group) => group.items?.some((item) => String(item.id) === String(link.itemId)));
  const itemIndex = groups[groupIndex]?.items.findIndex((item) => String(item.id) === String(link.itemId)) ?? -1;
  if (groupIndex < 0 || itemIndex < 0) throw new Error("関連先の項目が見つかりません。");
  const item = groups[groupIndex].items[itemIndex];
  state.noteDisclosure[`${item.id}:body`] = true;
  state.noteDisclosure[`${item.id}:memo`] = true;
  renderNoteEditor();
  requestAnimationFrame(() => {
    const card = document.getElementById(`note-item-${groupIndex}-${itemIndex}`);
    card?.scrollIntoView({ behavior: "instant", block: "center" });
    card?.querySelector("textarea, input")?.focus({ preventScroll: true });
  });
}

async function openRelatedPreviewNote() {
  const context = state.relatedPreviewContext;
  if (!context || context.work !== state.selectedWork || context.provider !== state.provider) return;
  if (state.relatedOpening || state.saving || state.syncing || state.deleting) {
    elements.relatedPreviewNotice.textContent = "保存・反映の処理中です。完了してから対象ノートを開いてください。";
    return;
  }
  state.relatedOpening = true;
  elements.openRelatedPreviewNoteButton.disabled = true;
  cancelAutoSave();
  const source = state.currentNote;
  const sourceDraft = JSON.stringify(source?.data);
  try {
    if (source?.item.id === context.entry.item.id) {
      focusRelatedNoteItem(context.link);
      elements.relatedPreviewDialog.close();
      return;
    }
    // Refresh before asking to save, and pass this exact baseline to the editor.
    const raw = await context.provider.readText(context.entry.item);
    const loaded = { item: context.entry.item, raw, data: normalizeNote(JSON.parse(raw), context.link.noteType) };
    if (!relatedNoteMatches(loaded, context.link) || !loaded.data.groups.some((group) => group.items?.some((item) => String(item.id) === String(context.link.itemId)))) {
      throw new Error("関連先のノートまたは項目が変更・削除されています。リンクを確認してください。");
    }
    if (state.relatedPreviewContext !== context || context.work !== state.selectedWork || context.provider !== state.provider
      || state.currentNote !== source || JSON.stringify(source?.data) !== sourceDraft || state.saving || state.syncing || state.deleting) {
      elements.relatedPreviewNotice.textContent = "編集中の内容や画面が変わりました。入力を保持しています。もう一度操作してください。";
      return;
    }
    if (state.dirty) {
      if (!window.confirm("未保存の変更があります。現在のノートを保存して、対象ノートの編集画面へ移動しますか？")) return;
      if (!await saveCurrentNote() || state.dirty || state.externalConflict || elements.noteStatus.classList.contains("error")) {
        elements.relatedPreviewNotice.textContent = "保存・反映を完了できなかったため移動していません。元の編集内容と保存状態を確認してください。";
        return;
      }
    }
    if (state.relatedPreviewContext !== context || context.work !== state.selectedWork || context.provider !== state.provider
      || state.dirty || state.saving || state.syncing || state.deleting || state.externalConflict) return;
    state.noteType = loaded.data.type;
    await openNote(loaded, { loadedEntry: loaded });
    focusRelatedNoteItem(context.link);
    elements.relatedPreviewDialog.close();
  } catch (error) {
    if (state.relatedPreviewContext === context) elements.relatedPreviewNotice.textContent = error.message || "対象ノートを開けませんでした。";
  } finally {
    state.relatedOpening = false;
    if (state.relatedPreviewContext === context) elements.openRelatedPreviewNoteButton.disabled = false;
    if (state.dirty) scheduleAutoSave();
  }
}

function renderAddressBook(book) {
  const characters = book.characters;
  elements.addressBookMeta.textContent = `${characters.length}人 ・ ${formatDate(book.updatedAt)}`;
  if (!characters.length) {
    showEmpty(elements.addressBookContent, "呼び名はまだ登録されていません");
    return;
  }
  const table = makeElement("table", "address-book-table");
  const thead = makeElement("thead");
  const header = makeElement("tr");
  const corner = makeElement("th");
  corner.append(makeElement("span", "address-book-corner-label", "呼ぶ人 ＼ 呼ばれる人"));
  header.append(corner);
  characters.forEach((character) => {
    const name = character.label || "名前未設定";
    const cell = makeElement("th");
    cell.scope = "col";
    const label = makeElement("span", "address-book-called-name", name);
    label.title = name;
    cell.append(label);
    header.append(cell);
  });
  thead.append(header);
  const tbody = makeElement("tbody");
  characters.forEach((from) => {
    const row = makeElement("tr");
    const caller = makeElement("th");
    caller.scope = "row";
    caller.append(makeElement("span", "address-book-caller-name", from.label || "名前未設定"));
    row.append(caller);
    characters.forEach((to) => {
      const self = from.id === to.id;
      row.append(makeElement("td", self ? "self-name" : "", self
        ? String(book.firstPerson[from.id] || "")
        : String(book.calls[`${from.id}::${to.id}`] || "")));
    });
    tbody.append(row);
  });
  table.append(thead, tbody);
  elements.addressBookContent.replaceChildren(table);
}

async function openAddressBook() {
  elements.addressBookMeta.textContent = "読み込んでいます…";
  showEmpty(elements.addressBookContent, "呼び名一覧を読み込んでいます…");
  elements.addressBookDialog.showModal();
  const provider = state.provider, work = state.selectedWork;
  const result = await loadPreviewAddressBook(provider, work, state.currentNote);
  if (state.provider !== provider || state.selectedWork !== work || !elements.addressBookDialog.open) return;
  renderAddressBook(result.book);
  if (result.imported) elements.addressBookMeta.textContent += " ・ Markdown取込版（表示用）";
}

function editorListItem(title, meta, current, onOpen) {
  const button = makeElement("button", `editor-list-item${current ? " current" : ""}`);
  button.type = "button";
  button.append(makeElement("strong", "", title), makeElement("span", "", meta));
  button.addEventListener("click", () => {
    if (current) {
      elements.editorListDialog.close();
      return;
    }
    if (!canDiscardDraft()) return;
    elements.editorListDialog.close();
    Promise.resolve(onOpen()).catch((error) => notify(error.message, true));
  });
  return button;
}

async function openEditorList(kind) {
  elements.conceptEditorListPreference.hidden = kind !== "concept";
  elements.conceptEditorListToggle.checked = state.conceptEditorListVisible;
  const labels = {
    manuscript: ["MANUSCRIPT", "原稿一覧"],
    note: [state.noteType === "reference" ? "REFERENCE" : "PLOT", state.noteType === "reference" ? "資料一覧" : "プロット一覧"],
    concept: ["CONCEPT MEMOS", "構想メモ一覧"],
  };
  const [typeLabel, title] = labels[kind];
  elements.editorListType.textContent = typeLabel;
  elements.editorListTitle.textContent = title;
  showLoading(elements.editorListContent, `${title}を読み込んでいます…`);
  if (!elements.editorListDialog.open) elements.editorListDialog.showModal();

  let rows = [];
  if (kind === "manuscript") {
    const items = sortDriveItems(await listChildrenCached(state.manuscriptFolder || state.selectedWork.manuscript));
    rows = items.filter(isManuscriptFile).map((item) => editorListItem(
      item.name,
      `${formatSize(item.size)} ・ ${formatDate(item.lastModifiedDateTime)}`,
      item.id === state.currentFile?.id,
      () => openFile(item),
    ));
  } else if (kind === "note") {
    const entries = state.notes.length ? state.notes : await loadNoteEntriesForType(state.noteType);
    rows = sortNoteEntries(entries).map((entry) => editorListItem(
      entry.summary?.title || entry.data?.title || entry.item.name.replace(/\.json$/i, ""),
      `${entry.summary?.groupCount ?? entry.data?.groups?.length ?? 0}分類 ・ ${formatDate(entry.summary?.updatedAt || entry.data?.updatedAt || entry.item.lastModifiedDateTime)}`,
      entry.item.id === state.currentNote?.item?.id,
      () => openNote(entry),
    ));
  } else {
    rows = (state.conceptDocument?.memos || []).map(makeConceptEditorListItem);
  }
  if (!rows.length) showEmpty(elements.editorListContent, `${title}に表示する項目がありません`);
  else elements.editorListContent.replaceChildren(...rows);
}

function setNoteNavState(type) {
  elements.notesPlotsButton.classList.toggle("active", type === "plot");
  elements.notesReferencesButton.classList.toggle("active", type === "reference");
  elements.notesPlotsButton.toggleAttribute("aria-current", type === "plot");
  elements.notesReferencesButton.toggleAttribute("aria-current", type === "reference");
  updateShellContext();
}

async function openNotes(type = "plot") {
  const requestedNoteType = type === "reference" ? "reference" : "plot";
  const finishMeasurement = beginPerformanceMeasurement(
    requestedNoteType === "reference" ? "資料一覧" : "プロット一覧",
    {
      indexCache:
        state.noteIndexWorkId === String(state.selectedWork?.id || "")
        && state.noteIndex
        && Date.now() - state.noteIndexCheckedAt < VIEW_CACHE_DURATION
          ? "再利用"
          : "確認",
    },
  );
  if (!canDiscardDraft()) return;
  cancelAutoSave();
  stopExternalMonitor();
  state.currentFile = null;
  state.currentNote = null;
  state.currentConceptMemo = null;
  state.dirty = false;
  state.externalConflict = false;
  state.noteType = requestedNoteType;
  const requestedType = state.noteType;
  const loadToken = ++state.notesLoadToken;
  state.notes = [];
  elements.worksSection.hidden = true;
  elements.filesSection.hidden = true;
  elements.readerSection.hidden = true;
  elements.noteEditorSection.hidden = true;
  elements.notesSection.hidden = false;
  hideConceptViews();
  renderInputAssistVisibility();
  elements.notesTitle.textContent = `${state.selectedWork.title} / ${NOTE_TYPES[state.noteType].label}`;
  elements.noteSearchInput.value = "";
  setNoteNavState(state.noteType);
  elements.notesCount.textContent = "件数を確認しています…";
  showLoading(elements.notesList, "ノートを読み込んでいます…");
  const folder = await ensureNoteFolder(state.noteType);
  if (loadToken !== state.notesLoadToken || state.noteType !== requestedType) return;
  const itemsPromise = listChildrenCached(folder);
  const noteIndex = await loadSelectedNoteIndex({ refresh: true });
  if (loadToken !== state.notesLoadToken || state.noteType !== requestedType) return;
  const indexEntries = requestedType === "reference" ? noteIndex?.references : noteIndex?.plots;
  if (indexEntries?.length) {
    state.notes = sortNoteEntries(indexEntries.map((summary) => indexedNoteEntry({ name: summary.fileName }, summary)));
    renderNotesList();
  }
  const listedItems = await itemsPromise;
  const items = listedItems.filter((item) => item?.file && /\.json$/i.test(item.name));
  if (loadToken !== state.notesLoadToken || state.noteType !== requestedType) return;
  const indexed = mergeNoteIndexEntries(indexEntries, items);
  const indexedNames = new Set(indexed.map((entry) => entry.item.name));
  const missingItems = items.filter((item) => !indexedNames.has(item.name));
  const settled = await Promise.allSettled(missingItems.map((item) => readNoteEntry(item, requestedType)));
  if (loadToken !== state.notesLoadToken || state.noteType !== requestedType) return;
  state.notes = sortNoteEntries([
    ...indexed.map((entry) => indexedNoteEntry(entry.item, entry.summary)),
    ...settled.filter((result) => result.status === "fulfilled").map((result) => result.value),
  ]);
  renderNotesList();
  commitRoute(routeForWork("notes-list", { noteType: requestedType }));
  finishMeasurement({ items: state.notes.length });
}

const NOTE_NAME_FIELDS = new Set(["group-title", "divider-label", "divider-value", "entry-heading", "entry-heading-ruby"]);

function bindNoteField(control, groupIndex, itemIndex, field) {
  control.dataset.groupIndex = String(groupIndex);
  if (itemIndex != null) control.dataset.itemIndex = String(itemIndex);
  control.dataset.noteField = field;
  if (NOTE_NAME_FIELDS.has(field)) {
    control.autocomplete = "off";
    control.inputMode = "text";
    control.name = `mojigoto_note_${field}_${groupIndex}_${itemIndex ?? "group"}`;
    control.setAttribute("autocapitalize", "sentences");
    control.setAttribute("data-form-type", "other");
    control.setAttribute("data-lpignore", "true");
    control.setAttribute("data-1p-ignore", "true");
  }
}

function updateNoteDisclosureButtons() {
  for (const [kind, button, label] of [
    ["entry", elements.toggleNoteItemsButton, "項目"],
    ["memo", elements.toggleNoteMemosButton, "メモ"],
  ]) {
    const details = [...elements.noteGroups.querySelectorAll(`details.note-${kind}-details`)];
    const allOpen = details.length > 0 && details.every((node) => node.open);
    button.disabled = details.length === 0;
    button.textContent = `${label}を${allOpen ? "閉じる" : "開く"}`;
    button.title = `${kind === "entry" ? "項目詳細" : "項目メモ"}をすべて${allOpen ? "閉じる" : "開く"}`;
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-expanded", String(allOpen));
  }
}

function toggleNoteDisclosures(kind) {
  const details = [...elements.noteGroups.querySelectorAll(`details.note-${kind}-details`)];
  const open = details.some((node) => !node.open);
  details.forEach((node) => {
    // Record immediately: a structural edit can re-render before toggle events run.
    state.noteDisclosure[node.dataset.noteDisclosureKey] = open;
    node.open = open;
  });
  updateNoteDisclosureButtons();
}

function renderNoteEditor() {
  if (elements.noteSearchDialog) noteSearchController.changed();
  const note = state.currentNote.data;
  elements.noteTitleInput.value = note.title;
  elements.noteEditorTypeBadge.textContent = `${note.type === "reference" ? "資料" : "プロット"}編集中`;
  elements.noteEditorTypeBadge.classList.toggle("reference", note.type === "reference");
  const groups = note.groups.map((group, groupIndex) => {
    const card = makeElement("section", "note-group");
    card.id = `note-group-${groupIndex}`;
    const header = makeElement("div", "note-group-header");
    const title = makeElement("input", "note-group-title");
    title.value = String(group.title || "");
    title.placeholder = "大分類名";
    bindNoteField(title, groupIndex, null, "group-title");
    const removeGroup = makeElement("button", "note-mini-button note-remove-button", "削除");
    removeGroup.type = "button";
    removeGroup.dataset.noteAction = "remove-group";
    removeGroup.dataset.groupIndex = String(groupIndex);
    header.append(title, removeGroup);

    const actions = makeElement("div", "note-group-actions");
    for (const [action, label] of [["add-entry", "＋ 項目"], ["add-divider", "＋ 区分"]]) {
      const button = makeElement("button", "note-mini-button", label);
      button.type = "button";
      button.dataset.noteAction = action;
      button.dataset.groupIndex = String(groupIndex);
      actions.append(button);
    }

    const itemList = makeElement("div", "note-items");
    (group.items || []).forEach((item, itemIndex) => {
      const itemCard = makeElement("article", `note-item ${item.kind === "divider" ? "note-divider" : "note-entry"}`);
      itemCard.id = `note-item-${groupIndex}-${itemIndex}`;
      itemCard.dataset.noteItemId = String(item.id || "");
      itemCard.append(makeElement("p", "note-item-label", item.kind === "divider" ? "区分" : "項目"));
      if (item.kind === "divider") {
        const fields = makeElement("div", "note-divider-fields");
        const label = makeElement("input");
        label.value = String(item.label || "");
        label.placeholder = "区分名";
        bindNoteField(label, groupIndex, itemIndex, "divider-label");
        const value = makeElement("input");
        value.value = String(item.value || "");
        value.placeholder = "補足";
        bindNoteField(value, groupIndex, itemIndex, "divider-value");
        fields.append(label, value);
        itemCard.append(fields);
      } else {
        const heading = makeElement("input");
        heading.value = String(item.heading || "");
        heading.placeholder = "項目名";
        bindNoteField(heading, groupIndex, itemIndex, "entry-heading");
        const headingFields = makeElement("div", "note-heading-fields");
        const headingLabel = makeElement("label", "note-heading-field");
        headingLabel.append(makeElement("span", "", "項目名"), heading);
        const readingLabel = makeElement("label", "note-heading-field note-heading-reading");
        const reading = makeElement("input");
        reading.value = String(item.headingRuby || "");
        reading.placeholder = "例：しゅじんこう";
        bindNoteField(reading, groupIndex, itemIndex, "entry-heading-ruby");
        readingLabel.append(makeElement("span", "", "ふりがな（任意）"), reading);
        headingFields.append(headingLabel, readingLabel);
        const body = makeElement("textarea");
        body.value = String(item.body || "");
        body.placeholder = "本文";
        bindNoteField(body, groupIndex, itemIndex, "entry-body");
        const memo = makeElement("textarea", "note-memo");
        memo.value = String(item.memo?.body || "");
        memo.placeholder = "項目メモ";
        bindNoteField(memo, groupIndex, itemIndex, "entry-memo");
        const tags = makeElement("input", "note-tags");
        tags.value = Array.isArray(item.memo?.tags) ? item.memo.tags.join(", ") : "";
        tags.placeholder = "タグ（カンマ区切り）";
        bindNoteField(tags, groupIndex, itemIndex, "entry-tags");
        const bodyDetails = makeElement("details", "note-entry-details");
        bodyDetails.open = state.noteDisclosure[`${item.id}:body`] ?? true;
        bodyDetails.dataset.noteDisclosureKey = `${item.id}:body`;
        bodyDetails.addEventListener("toggle", () => {
          if (!bodyDetails.isConnected) return;
          state.noteDisclosure[`${item.id}:body`] = bodyDetails.open;
          updateNoteDisclosureButtons();
        });
        bodyDetails.append(makeElement("summary", "note-disclosure-summary", "項目詳細"), body);
        const memoDetails = makeElement("details", "note-memo-details");
        memoDetails.open = state.noteDisclosure[`${item.id}:memo`] ?? false;
        memoDetails.dataset.noteDisclosureKey = `${item.id}:memo`;
        memoDetails.addEventListener("toggle", () => {
          if (!memoDetails.isConnected) return;
          state.noteDisclosure[`${item.id}:memo`] = memoDetails.open;
          updateNoteDisclosureButtons();
        });
        const memoSummary = makeElement("summary", "note-disclosure-summary");
        memoSummary.append(makeElement("span", "", "項目メモ"));
        if (String(item.memo?.body || "").trim() || item.memo?.tags?.length) memoSummary.append(makeElement("span", "memo-present", "入力あり"));
        const tagRow = makeElement("div", "note-tag-row");
        const tagHistory = makeElement("button", "tag-history-button", "履歴");
        tagHistory.type = "button";
        tagHistory.addEventListener("click", () => openTagHistory(tags));
        tagRow.append(tags, tagHistory);
        const autoReflect = makeElement("select", "note-auto-reflect-setting");
        autoReflect.setAttribute("aria-label", "この項目メモの自動反映");
        for (const [value, label] of [["inherit", "全体設定に従う"], ["on", "この項目はON"], ["off", "この項目はOFF"]]) {
          const option = makeElement("option", "", label); option.value = value; autoReflect.append(option);
        }
        autoReflect.value = autoReflectSelection(item.memo, "autoSyncToConceptMemo", "autoSyncToConceptMemoOverride");
        bindNoteField(autoReflect, groupIndex, itemIndex, "entry-auto-reflect");
        memoDetails.append(memoSummary, memo, tagRow, autoReflect);
        const linkedConceptIds = Array.isArray(item.memo?.linkedConceptMemoIds)
          ? item.memo.linkedConceptMemoIds.filter(Boolean)
          : [];
        {
          const memoActions = makeElement("div", "note-memo-actions");
          const reflect = makeElement("button", "note-mini-button", linkedConceptIds.length ? "構想メモへ反映" : "構想メモを作成");
          reflect.type = "button";
          reflect.dataset.noteAction = linkedConceptIds.length ? "sync-concept" : "create-concept";
          reflect.dataset.groupIndex = String(groupIndex);
          reflect.dataset.itemIndex = String(itemIndex);
          reflect.title = linkedConceptIds.length ? `${linkedConceptIds.length}件のリンク済み構想メモへ反映` : "項目メモから構想メモを作成してリンク";
          memoActions.append(reflect);
          memoDetails.append(memoActions);
        }
        itemCard.append(headingFields, bodyDetails, memoDetails);
      }
      const relationList = item.relatedReferences || [];
      if (relationList.length) {
        const relatedPanel = makeElement("details", "related-links-panel");
        relatedPanel.open = relationList.length <= 2;
        relatedPanel.append(makeElement("summary", "related-links-summary", `関連リンク ${relationList.length}件`));
        const related = makeElement("div", "related-links");
        relationList.forEach((link, relationIndex) => {
        const chip = makeElement("span", "related-chip");
        const open = makeElement("button", "related-open", `🔗 ${link.itemLabel || link.noteTitle || "関連ノート"}`);
        open.type = "button";
        open.dataset.noteAction = "open-related";
        open.dataset.groupIndex = String(groupIndex);
        open.dataset.itemIndex = String(itemIndex);
        open.dataset.relationIndex = String(relationIndex);
        const removeLink = makeElement("button", "related-remove", "×");
        removeLink.type = "button";
        removeLink.title = "関連付けを解除";
        removeLink.dataset.noteAction = "remove-related";
        removeLink.dataset.groupIndex = String(groupIndex);
        removeLink.dataset.itemIndex = String(itemIndex);
        removeLink.dataset.relationIndex = String(relationIndex);
        chip.append(open, removeLink);
        related.append(chip);
        });
        relatedPanel.append(related);
        itemCard.append(relatedPanel);
      }
      const footer = makeElement("div", "note-item-footer");
      const actionToggle = makeElement("button", "note-item-actions-toggle", "操作");
      actionToggle.type = "button";
      actionToggle.setAttribute("aria-expanded", "false");
      actionToggle.addEventListener("click", () => {
        const open = !footer.classList.contains("open");
        footer.classList.toggle("open", open);
        actionToggle.setAttribute("aria-expanded", String(open));
      });
      const actionPanel = makeElement("div", "note-item-actions-panel");
      const insertEntry = makeElement("button", "note-mini-button", "＋ 項目");
      insertEntry.type = "button";
      insertEntry.title = "この行の下に項目を追加";
      insertEntry.dataset.noteAction = "insert-entry-after";
      insertEntry.dataset.groupIndex = String(groupIndex);
      insertEntry.dataset.itemIndex = String(itemIndex);
      const insertDivider = makeElement("button", "note-mini-button", "＋ 区分");
      insertDivider.type = "button";
      insertDivider.title = "この行の下に区分を追加";
      insertDivider.dataset.noteAction = "insert-divider-after";
      insertDivider.dataset.groupIndex = String(groupIndex);
      insertDivider.dataset.itemIndex = String(itemIndex);
      const addRelated = makeElement("button", "note-mini-button", "＋ 関連");
      addRelated.type = "button";
      addRelated.dataset.noteAction = "add-related";
      addRelated.dataset.groupIndex = String(groupIndex);
      addRelated.dataset.itemIndex = String(itemIndex);
      const moveUp = makeElement("button", "note-mini-button note-move-button", "↑ 上へ");
      moveUp.type = "button";
      moveUp.disabled = itemIndex === 0;
      moveUp.dataset.noteAction = "move-item-up";
      moveUp.dataset.groupIndex = String(groupIndex);
      moveUp.dataset.itemIndex = String(itemIndex);
      const moveDown = makeElement("button", "note-mini-button note-move-button", "↓ 下へ");
      moveDown.type = "button";
      moveDown.disabled = itemIndex === group.items.length - 1;
      moveDown.dataset.noteAction = "move-item-down";
      moveDown.dataset.groupIndex = String(groupIndex);
      moveDown.dataset.itemIndex = String(itemIndex);
      const orderMove = makeElement("div", "note-item-order-move");
      orderMove.append(moveUp, moveDown);
      const groupMove = makeElement("div", "note-item-group-move");
      const groupSelect = makeElement("select", "note-item-group-select");
      groupSelect.setAttribute("aria-label", "移動先の大分類");
      const groupPlaceholder = makeElement("option", "", "大分類を移動…");
      groupPlaceholder.value = "";
      groupSelect.append(groupPlaceholder);
      note.groups.forEach((targetGroup, targetGroupIndex) => {
        if (targetGroupIndex === groupIndex) return;
        const option = makeElement("option", "", targetGroup.title || `大分類 ${targetGroupIndex + 1}`);
        option.value = String(targetGroupIndex);
        groupSelect.append(option);
      });
      groupSelect.disabled = note.groups.length <= 1;
      const moveToGroup = makeElement("button", "note-mini-button note-move-button", "移動");
      moveToGroup.type = "button";
      moveToGroup.disabled = note.groups.length <= 1;
      moveToGroup.dataset.noteAction = "move-item-group";
      moveToGroup.dataset.groupIndex = String(groupIndex);
      moveToGroup.dataset.itemIndex = String(itemIndex);
      groupMove.append(groupSelect, moveToGroup);
      const remove = makeElement("button", "note-mini-button note-remove-button", "この行を削除");
      remove.type = "button";
      remove.dataset.noteAction = "remove-item";
      remove.dataset.groupIndex = String(groupIndex);
      remove.dataset.itemIndex = String(itemIndex);
      actionPanel.append(insertEntry, insertDivider, addRelated, orderMove, groupMove, remove);
      footer.append(actionToggle, actionPanel);
      itemCard.append(footer);
      itemList.append(itemCard);
    });
    const groupFooter = makeElement("div", "note-group-add");
    const insertGroup = makeElement("button", "secondary-button", "＋ 大分類");
    insertGroup.type = "button";
    insertGroup.title = "この大分類の後に追加";
    insertGroup.dataset.noteAction = "insert-group-after";
    insertGroup.dataset.groupIndex = String(groupIndex);
    groupFooter.append(insertGroup);
    card.append(header, actions, itemList, groupFooter);
    return card;
  });
  elements.noteGroups.replaceChildren(...groups);
  updateNoteDisclosureButtons();
  renderNoteToc();
  state.activeAssistTarget = elements.noteGroups.querySelector("textarea");
  requestAnimationFrame(updateCurrentNoteGroupIndicator);
}

function renderNoteToc() {
  const note = state.currentNote?.data;
  if (!note) return;
  const tocItems = note.groups.flatMap((group, groupIndex) => (group.items || []).map((item, itemIndex) => ({
    groupIndex, itemIndex, kind: item.kind,
    label: item.kind === "divider" ? (item.label || "名称未設定の区分") : (item.heading || "名称未設定の項目"),
    value: item.kind === "divider" ? String(item.value || "").trim() : "",
  })));
  const toc = [];
  note.groups.forEach((group, groupIndex) => {
    const groupButton = makeElement("button", "note-toc-group", group.title || `大分類 ${groupIndex + 1}`);
    groupButton.type = "button";
    groupButton.addEventListener("click", () => {
      state.noteTocOpen = false;
      elements.noteToc.hidden = true;
      elements.noteTocToggle.setAttribute("aria-expanded", "false");
      document.getElementById(`note-group-${groupIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    toc.push(groupButton);
    tocItems.filter((item) => item.groupIndex === groupIndex).forEach((item) => {
      const tocLabel = item.kind === "divider" && item.value
        ? `${item.label}：${item.value}`
        : item.label;
      const button = makeElement("button", `note-toc-item ${item.kind === "divider" ? "divider" : ""}`, `${item.kind === "divider" ? "区" : "項"}：${tocLabel}`);
      button.type = "button";
      button.addEventListener("click", () => {
        state.noteTocOpen = false;
        elements.noteToc.hidden = true;
        elements.noteTocToggle.setAttribute("aria-expanded", "false");
        document.getElementById(`note-item-${item.groupIndex}-${item.itemIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      toc.push(button);
    });
  });
  elements.noteToc.replaceChildren(...toc);
  elements.noteToc.hidden = !state.noteTocOpen;
  elements.noteTocToggle.setAttribute("aria-expanded", String(state.noteTocOpen));
}

function refreshNoteDerivedViews() {
  if (elements.noteSearchDialog) noteSearchController.changed();
  renderNoteToc();
  if (elements.notePreviewDialog.open) openNotePreview({ refresh: true });
}

function updateNoteGroupMoveLabels(groupIndex) {
  const group = state.currentNote?.data?.groups?.[groupIndex];
  if (!group) return;
  const label = String(group.title || "").trim() || `大分類 ${groupIndex + 1}`;
  for (const select of elements.noteGroups.querySelectorAll(".note-item-group-select")) {
    const option = [...select.options].find((item) => item.value === String(groupIndex));
    if (option) option.textContent = label;
  }
}

function moveToNotePreviewTarget(groupIndex, itemIndex = null) {
  state.noteTocOpen = false;
  elements.noteToc.hidden = true;
  elements.noteTocToggle.setAttribute("aria-expanded", "false");
  requestAnimationFrame(() => {
    const target = document.getElementById(itemIndex == null
      ? `note-group-${groupIndex}`
      : `note-item-${groupIndex}-${itemIndex}`);
    if (!target) return;
    const previewBounds = elements.notePreviewDialog.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    // Side-by-side layouts keep their reference open; an overlapping preview must reveal the editor.
    if (elements.notePreviewDialog.open && previewBounds.width > 0 && targetBounds.width > 0
      && previewBounds.left < targetBounds.right && previewBounds.right > targetBounds.left) {
      elements.notePreviewDialog.close();
    }
    target.scrollIntoView({ behavior: "smooth", block: itemIndex == null ? "start" : "center" });
    const input = itemIndex == null
      ? target?.querySelector(".note-group-title")
      : target?.querySelector("input, textarea");
    input?.focus({ preventScroll: true });
  });
}

function isNotePreviewOwnerCurrent(owner = state.notePreviewOwner) {
  return Boolean(owner && owner.work === state.selectedWork && owner.provider === state.provider
    && owner.noteKey === readerNoteReferenceKey(state.currentNote)
    && owner.noteType === (state.currentNote?.data?.type || state.noteType));
}

function renderNotePreviewReference() {
  const entry = state.notePreviewEntries.find((candidate) => (candidate.referenceKey || readerNoteReferenceKey(candidate)) === state.notePreviewReferenceId);
  elements.notePreviewTitle.textContent = entry?.data?.title || "ノート参照";
  elements.notePreviewHelp.textContent = "参照のみ。大分類を選ぶと開閉します。";
  elements.notePreviewContent.classList.toggle("note-preview-reference-content", true);
  renderReaderNoteReference(entry, elements.notePreviewContent);
  elements.notePreviewContent.scrollTop = 0;
}

async function loadNotePreviewReferences() {
  if (elements.notePreviewWorkSelect && notePreviewWorkController.isForeign()) return notePreviewWorkController.load();
  const type = elements.notePreviewTypeSelect.value;
  if (type !== "plot" && type !== "reference") return;
  const owner = state.notePreviewOwner;
  const loadToken = ++state.notePreviewLoadToken;
  const current = () => loadToken === state.notePreviewLoadToken && elements.notePreviewDialog.open
    && isNotePreviewOwnerCurrent(owner) && elements.notePreviewTypeSelect.value === type;
  elements.notePreviewSelect.disabled = true;
  elements.notePreviewSelect.replaceChildren(new Option("読み込み中…", ""));
  elements.notePreviewTitle.textContent = "ノート参照";
  elements.notePreviewHelp.textContent = "参照のみ。大分類を選ぶと開閉します。";
  elements.notePreviewContent.classList.toggle("note-preview-reference-content", true);
  showLoading(elements.notePreviewContent, "ノートを読み込んでいます…");
  try {
    const entries = sortNoteEntries(await loadNoteEntriesForType(type, { preferCache: true, createFolder: false }))
      .filter((entry) => owner.noteType !== type || readerNoteReferenceKey(entry) !== owner.noteKey);
    if (!current()) return;
    state.notePreviewEntries = entries;
    if (!entries.length) {
      state.notePreviewReferenceId = "";
      elements.notePreviewSelect.replaceChildren(new Option("ほかのノートがありません", ""));
      showEmpty(elements.notePreviewContent, `ほかの${type === "reference" ? "資料" : "プロット"}はありません。`);
      return;
    }
    elements.notePreviewSelect.replaceChildren(...entries.map((entry) => new Option(
      entry.data?.title || entry.item?.name?.replace(/\.json$/i, "") || "名称未設定", readerNoteReferenceKey(entry),
    )));
    const selected = entries.find((entry) => readerNoteReferenceKey(entry) === state.notePreviewReferenceId) || entries[0];
    state.notePreviewReferenceId = readerNoteReferenceKey(selected);
    elements.notePreviewSelect.value = state.notePreviewReferenceId;
    elements.notePreviewSelect.disabled = false;
    renderNotePreviewReference();
  } catch (error) {
    if (!current()) return;
    state.notePreviewEntries = [];
    state.notePreviewReferenceId = "";
    elements.notePreviewSelect.replaceChildren(new Option("読み込めませんでした", ""));
    showEmpty(elements.notePreviewContent, error.message || "ノートを読み込めませんでした。");
  }
}

function openNotePreview({ refresh = false } = {}) {
  const note = state.currentNote?.data;
  if (!note) return;
  if (!isNotePreviewOwnerCurrent()) {
    state.notePreviewOwner = { work: state.selectedWork, provider: state.provider,
      noteKey: readerNoteReferenceKey(state.currentNote), noteType: note.type || state.noteType };
    state.notePreviewLoadToken += 1;
    state.notePreviewEntries = [];
    state.notePreviewReferenceId = "";
    elements.notePreviewTypeSelect.value = "current";
  }
  if (elements.notePreviewWorkSelect) notePreviewWorkController.prepare(state.notePreviewOwner);
  if (!refresh) {
    state.noteTocOpen = false;
    elements.noteToc.hidden = true;
    elements.noteTocToggle.setAttribute("aria-expanded", "false");
  }
  if (elements.notePreviewTypeSelect.value !== "current") {
    if (!elements.notePreviewDialog.open) elements.notePreviewDialog.show();
    if (!refresh) loadNotePreviewReferences();
    return;
  }
  elements.notePreviewSelect.replaceChildren(new Option(note.title || "編集中のノート", ""));
  elements.notePreviewSelect.disabled = true;
  elements.notePreviewHelp.textContent = "大分類は開閉できます。区分・項目を選ぶと編集位置へ移動し、編集欄に重なるプレビューは閉じます。";
  elements.notePreviewContent.classList.toggle("note-preview-reference-content", false);
  const previousGroups = [...elements.notePreviewContent.querySelectorAll("details.note-preview-group")];
  elements.notePreviewTitle.textContent = note.title || "ノートプレビュー";
  const groups = (note.groups || []).map((group, groupIndex) => {
    const section = makeElement("details", "note-preview-group note-preview-collapsible-group");
    section.open = refresh ? (previousGroups[groupIndex]?.open ?? groupIndex === 0) : groupIndex === 0;
    const groupButton = makeElement("summary", "note-preview-group-button", group.title || `大分類 ${groupIndex + 1}`);
    const items = makeElement("div", "note-preview-items");
    (group.items || []).forEach((item, itemIndex) => {
      const divider = item.kind === "divider";
      const button = makeElement("button", `note-preview-item${divider ? " divider" : ""}`);
      button.type = "button";
      const preview = makeElement("span", "note-preview-text");
      const appendPreviewLine = (label, value) => {
        const line = makeElement("span", "note-preview-line note-inline");
        line.append(makeElement("strong", "", label));
        if (divider) line.append(document.createTextNode(value));
        else appendNoteInline(line, value);
        preview.append(line);
      };
      if (divider) appendPreviewLine("補足：", item.value || "ありません");
      else {
        appendPreviewLine("項目詳細：", item.body || "未入力");
        if (item.memo?.body) appendPreviewLine("項目メモ：", item.memo.body);
      }
      button.append(
        makeElement("span", "note-preview-kind", divider ? "区分" : "項目"),
        notePreviewHeading(item),
        preview,
      );
      button.addEventListener("click", () => moveToNotePreviewTarget(groupIndex, itemIndex));
      items.append(button);
    });
    if (!items.childElementCount) items.append(makeElement("p", "note-preview-empty", "項目はまだありません"));
    section.append(groupButton, items);
    return section;
  });
  if (groups.length) elements.notePreviewContent.replaceChildren(...groups);
  else showEmpty(elements.notePreviewContent, "大分類はまだありません");
  if (!elements.notePreviewDialog.open) elements.notePreviewDialog.show();
}

function compactNoteGroupTitle(value, maxLength = 9) {
  const characters = [...String(value || "")];
  return characters.length > maxLength ? `${characters.slice(0, maxLength).join("")}…` : characters.join("");
}

function updateCurrentNoteGroupIndicator() {
  if (elements.noteEditorSection.hidden) {
    elements.currentNoteGroupIndicator.hidden = true;
    return;
  }
  const threshold = window.innerWidth <= 370 ? 150 : window.innerWidth <= 600 ? 100 : 166;
  const groups = [...elements.noteGroups.querySelectorAll(".note-group")];
  const active = groups.find((group) => {
    const rect = group.getBoundingClientRect();
    return rect.top <= threshold && rect.bottom > threshold;
  });
  if (!active) {
    elements.currentNoteGroupIndicator.hidden = true;
    return;
  }
  const header = active.querySelector(".note-group-header");
  if (!header || header.getBoundingClientRect().top >= threshold) {
    elements.currentNoteGroupIndicator.hidden = true;
    return;
  }
  const groupIndex = Number(String(active.id).replace("note-group-", ""));
  const title = active.querySelector(".note-group-title")?.value.trim() || `大分類 ${groupIndex + 1}`;
  elements.currentNoteGroupIndicator.textContent = compactNoteGroupTitle(title);
  elements.currentNoteGroupIndicator.title = title;
  elements.currentNoteGroupIndicator.setAttribute("aria-label", `編集中の大分類：${title}`);
  elements.currentNoteGroupIndicator.hidden = false;
}

async function openNote(entry, { loadedEntry = null } = {}) {
  renderMemoAutoReflectDefaults();
  cancelAutoSave();
  stopExternalMonitor();
  showNoteEditorLoading();
  let loaded;
  try {
    loaded = loadedEntry?.item.id === entry.item.id ? loadedEntry : await readNoteEntry(entry.item, state.noteType);
  } finally {
    elements.noteEditorSection.classList.remove("is-loading");
    elements.noteEditorLoading.hidden = true;
  }
  if (state.currentNote?.data?.id !== loaded.data.id) {
    state.noteDisclosure = {};
    state.noteTocOpen = false;
  }
  state.currentFile = null;
  if (elements.noteSearchDialog) noteSearchController.clearUndo();
  state.currentNote = loaded;
  state.currentConceptMemo = null;
  state.dirty = false;
  state.externalConflict = false;
  elements.saveNoteButton.disabled = true;
  elements.noteAutoSaveToggle.checked = state.autoSaveEnabled;
  renderInputAssistVisibility();
  renderNoteEditor();
  setNoteStatus("保存済み");
  state.activeAssistTarget = elements.noteGroups.querySelector("textarea");
  startExternalMonitor();
  commitRoute(routeForWork("note-editor", { noteType: state.noteType, item: state.currentNote.item }));
}

function markNoteDirty() {
  if (elements.noteSearchDialog) noteSearchController.changed();
  state.dirty = true;
  elements.saveNoteButton.disabled = Boolean(state.noteConceptSyncPending || state.noteManualSyncPending);
  setNoteStatus(state.noteConceptSyncPending || state.noteManualSyncPending ? "反映中・未保存あり" : "未保存",
    state.noteConceptSyncPending || state.noteManualSyncPending ? "saving" : "dirty");
  scheduleAutoSave();
}





async function ensureConceptDocument() {
  const workId = String(state.selectedWork?.id || "");
  const sameWork = state.conceptWorkId === workId;
  if (sameWork && state.conceptFile?.id && state.conceptDocument) {
    if (Date.now() - state.conceptLoadedAt < VIEW_CACHE_DURATION) return;
    const metadata = await state.provider.getItemMetadata(state.conceptFile);
    state.conceptLoadedAt = Date.now();
    if (!hasExternalVersion(state.conceptFile, metadata)) return;
    state.conceptFile = { ...state.conceptFile, ...metadata };
  }
  if (!state.selectedWork?.mojigoto) throw new Error("作品の .mojigoto フォルダが見つかりません。");
  let children = await state.provider.listChildren(state.selectedWork.mojigoto.id);
  let file = children.find((item) => item?.file && item.name === "concept-memos.json");
  if (!file) {
    if (state.cloudKind === "googleDrive") {
      throw new Error("構想メモのファイルを確認できません。Google Driveの設定ページで .mojigoto 内の concept-memos.json を追加許可し、作品一覧を再読み込みしてください。まだファイルがない場合はVS Codeで構想メモを作成し、同期後に許可してください。重複を防ぐため、新規作成していません。");
    }
    const empty = normalizeConceptDocument({ memos: [] });
    empty.updatedAt = new Date().toISOString();
    file = await state.provider.createTextFile(
      state.selectedWork.mojigoto,
      "concept-memos.json",
      `${JSON.stringify(empty, null, 2)}\n`,
    );
    children = [...children, file];
    state.selectedWork.mojigotoChildren = children;
    state.selectedWork.conceptFile = file;
  }
  if (sameWork && state.conceptFile?.id === file.id) file = state.conceptFile;
  const raw = await state.provider.readText(file);
  state.conceptFile = file;
  state.conceptDocument = normalizeConceptDocument(JSON.parse(raw));
  state.conceptOriginalContent = raw;
  state.conceptWorkId = workId;
  state.conceptLoadedAt = Date.now();
}

function fillSelect(select, firstLabel, values, selected = "") {
  const options = [];
  if (firstLabel != null) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = firstLabel;
    options.push(option);
  }
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value.id;
    option.textContent = value.name;
    options.push(option);
  }
  select.replaceChildren(...options);
  select.value = selected;
}

function refreshConceptFilterOptions() {
  const folders = [...state.conceptDocument.folders].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const currentFolders = elements.conceptFolderFilterOptions.querySelector('input[type="checkbox"]')
    ? checkedValues(elements.conceptFolderFilterOptions)
    : (Array.isArray(state.viewPreferences.conceptFolders)
      ? state.viewPreferences.conceptFolders
      : (state.viewPreferences.conceptFolder ? [state.viewPreferences.conceptFolder] : []));
  const validFolderIds = new Set(folders.map((folder) => folder.id));
  const selectedFolders = new Set(currentFolders.filter((folderId) =>
    folderId === "__unclassified__" || validFolderIds.has(folderId),
  ));
  const clearFolders = makeElement("button", "multi-filter-clear", "チェックをすべて解除");
  clearFolders.type = "button";
  clearFolders.dataset.clearMulti = "concept-folder-filter";
  const unclassifiedLabel = makeElement("label");
  const unclassifiedInput = document.createElement("input");
  unclassifiedInput.type = "checkbox";
  unclassifiedInput.value = "__unclassified__";
  unclassifiedInput.checked = selectedFolders.has("__unclassified__");
  unclassifiedLabel.append(unclassifiedInput, document.createTextNode("未分類"));
  elements.conceptFolderFilterOptions.replaceChildren(clearFolders, ...folders.map((folder) => {
    const label = makeElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = folder.id;
    input.checked = selectedFolders.has(folder.id);
    label.append(input, document.createTextNode(folder.name));
    return label;
  }), unclassifiedLabel);
  updateMultiFilterLabel(elements.conceptFolderFilterOptions, elements.conceptFolderFilterLabel);
  const tags = [...new Set(state.conceptDocument.memos.flatMap((memo) => memo.tags || []))].sort((a, b) => a.localeCompare(b, "ja"));
  const currentTags = elements.conceptTagFilterOptions.querySelector('input[type="checkbox"]')
    ? checkedValues(elements.conceptTagFilterOptions)
    : (Array.isArray(state.viewPreferences.conceptTags)
      ? state.viewPreferences.conceptTags
      : (state.viewPreferences.conceptTag ? [state.viewPreferences.conceptTag] : []));
  const selected = new Set(currentTags);
  const clear = makeElement("button", "multi-filter-clear", "チェックをすべて解除");
  clear.type = "button";
  clear.dataset.clearMulti = "concept";
  elements.conceptTagFilterOptions.replaceChildren(clear, ...tags.map((tag) => {
    const label = makeElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tag;
    input.checked = selected.has(tag);
    label.append(input, document.createTextNode(tag));
    return label;
  }));
  updateMultiFilterLabel(elements.conceptTagFilterOptions, elements.conceptTagFilterLabel);
}

function renderConceptMemoFolderOptions(memo) {
  const selected = new Set(conceptMemoFolderIds(memo));
  const clear = makeElement("button", "multi-filter-clear", "チェックをすべて解除");
  clear.type = "button";
  clear.dataset.clearMulti = "concept-folders";
  const folders = [...state.conceptDocument.folders]
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  elements.conceptMemoFolderOptions.replaceChildren(clear, ...folders.map((folder) => {
    const label = makeElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = folder.id;
    input.checked = selected.has(folder.id);
    label.append(input, document.createTextNode(folder.name));
    return label;
  }));
  updateMultiFilterLabel(elements.conceptMemoFolderOptions, elements.conceptMemoFolderLabel, "未分類");
}

function makeConceptCardPreview(memo) {
  if (memo.type === "list" || memo.type === "todo") {
    const preview = makeElement("div", "concept-preview concept-preview-lines");
    const allLines = memoEditableText(memo).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const lines = allLines.slice(0, 3);
    if (!lines.length) preview.append(makeElement("span", "", "内容はまだありません"));
    else lines.forEach((line) => preview.append(makeElement("span", "", line)));
    if (allLines.length > 3) {
      const lastLine = preview.lastElementChild;
      lastLine.classList.add("has-more");
      lastLine.dataset.more = `ほか${allLines.length - 3}件`;
    }
    return preview;
  }
  return makeElement("p", "concept-preview", conceptMemoPreview(memo) || "内容はまだありません");
}

function renderConceptMemosList() {
  refreshConceptFilterOptions();
  renderConceptNoteFilter();
  elements.conceptSortField.title = elements.conceptSortField.value === "noteOrder"
    ? "ピン留めよりノートの項目順を優先します。関連なし・参照不可のメモは末尾です。" : "並び替え項目";
  const selectedFolders = checkedValues(elements.conceptFolderFilterOptions);
  const selectedTags = checkedValues(elements.conceptTagFilterOptions);
  const filters = {
    query: elements.conceptSearchInput.value,
    folderId: "",
    tag: "",
    status: elements.conceptStatusFilter.value,
  };
  const filtered = state.conceptDocument.memos.filter((memo) => {
      if (!matchesConceptNote(memo, currentConceptNoteIndex(), elements.conceptNoteFilter.value)) return false;
      if (!matchesConceptMemo(memo, filters)) return false;
      const memoFolderIds = conceptMemoFolderIds(memo);
      const matchesFolder = !selectedFolders.length || selectedFolders.some((folderId) =>
        folderId === "__unclassified__" ? memoFolderIds.length === 0 : memoFolderIds.includes(folderId),
      );
      const matchesTag = !selectedTags.length
        || selectedTags.some((tag) => (memo.tags || []).includes(tag));
      return matchesFolder && matchesTag;
    });
  const visible = elements.conceptSortField.value === "noteOrder"
    ? sortConceptMemosByNote(filtered, currentConceptNoteIndex(), elements.conceptNoteFilter.value, elements.conceptSortDirection.dataset.direction)
    : sortConceptMemos(filtered,
    elements.conceptSortField.value,
    elements.conceptSortDirection.dataset.direction,
  );
  setListCount(elements.conceptMemosCount, visible.length, state.conceptDocument.memos.length);
  if (!visible.length) {
    elements.conceptPagination.hidden = true;
    showEmpty(elements.conceptMemosList, "条件に一致する構想メモがありません");
    return;
  }
  const pageCount = Math.max(1, Math.ceil(visible.length / state.conceptPageSize));
  state.conceptPage = Math.min(Math.max(1, state.conceptPage), pageCount);
  const pageStart = (state.conceptPage - 1) * state.conceptPageSize;
  const pageItems = visible.slice(pageStart, pageStart + state.conceptPageSize);
  elements.conceptPagination.hidden = pageCount <= 1;
  elements.conceptPageStatus.textContent = `${state.conceptPage} / ${pageCount}ページ`;
  elements.conceptPreviousPageButton.disabled = state.conceptPage <= 1;
  elements.conceptNextPageButton.disabled = state.conceptPage >= pageCount;
  const folderNames = new Map(state.conceptDocument.folders.map((folder) => [folder.id, folder.name]));
  elements.conceptMemosList.replaceChildren(...pageItems.map((memo) => {
    const card = makeElement("button", `concept-memo-card${memo.isPinned ? " pinned" : ""}`);
    card.type = "button";
    const top = makeElement("div", "concept-card-top");
    const typeLabel = memo.type === "todo" ? "TODO" : memo.type === "list" ? "LIST" : "TEXT";
    top.append(
      makeElement("span", "concept-type", `${typeLabel}${conceptMemoFolderIds(memo).map((folderId) => folderNames.get(folderId)).filter(Boolean).map((name) => ` ・ ${name}`).join("")}`),
      makeElement("span", "concept-flags", `${memo.isPinned ? "📌" : ""}${memo.isArchived ? " 保管" : ""}`),
    );
    card.append(top, makeElement("h3", "", memo.title || "無題メモ"), makeConceptCardPreview(memo));
    if (memo.tags?.length) {
      const tags = makeElement("div", "concept-tags");
      memo.tags.forEach((tag) => tags.append(makeElement("span", "concept-tag", tag)));
      card.append(tags);
    }
    if (memo.source?.kind) card.append(makeElement("div", "concept-source-short", `出典: ${memo.source.noteTitle || memo.source.itemHeading || "リンクあり"}`));
    card.addEventListener("click", () => requestConceptMemoSwitch(memo.id).catch((error) => notify(error.message, true)));
    return card;
  }));
}

async function openConceptMemos({ reveal = true } = {}) {
  const conceptCacheFresh =
    state.conceptWorkId === String(state.selectedWork?.id || "")
    && state.conceptFile?.id
    && state.conceptDocument
    && Date.now() - state.conceptLoadedAt < VIEW_CACHE_DURATION;
  const finishMeasurement = beginPerformanceMeasurement("構想メモ一覧", {
    cache: conceptCacheFresh ? "再利用" : "確認・取得",
    reveal: reveal ? "表示" : "先読み",
  });
  if (!canDiscardDraft()) return;
  restoreSavedConceptDraft();
  cancelAutoSave();
  stopExternalMonitor();
  state.currentFile = null;
  state.currentNote = null;
  state.currentConceptMemo = null;
  state.currentSettings = null;
  state.dirty = false;
  state.conceptPage = 1;
  state.externalConflict = false;
  elements.worksSection.hidden = true;
  elements.filesSection.hidden = true;
  elements.readerSection.hidden = true;
  elements.notesSection.hidden = true;
  elements.noteEditorSection.hidden = true;
  elements.workSettingsSection.hidden = true;
  elements.conceptMemoEditorSection.hidden = true;
  // A remembered memo editor also needs a visible placeholder while fetching.
  elements.conceptMemosSection.hidden = !reveal && Boolean(conceptCacheFresh);
  if (reveal && !state.navigationRestoring) resetPageScroll();
  renderInputAssistVisibility();
  elements.conceptMemosTitle.textContent = `${state.selectedWork.title} / 構想メモ`;
  if (!conceptCacheFresh) {
    elements.conceptMemosCount.textContent = "件数を確認しています…";
    elements.conceptPagination.hidden = true;
    elements.conceptMemosList.setAttribute("aria-busy", "true");
    showLoading(elements.conceptMemosList, "構想メモを読み込んでいます…");
  }
  try {
    await ensureConceptDocument();
  } catch (error) {
    elements.conceptMemosCount.textContent = "";
    showEmpty(elements.conceptMemosList, "構想メモを読み込めませんでした。接続を確認して、もう一度開いてください。");
    throw error;
  } finally {
    elements.conceptMemosList.removeAttribute("aria-busy");
  }
  refreshConceptFilterOptions();
  renderConceptMemosList();
  if (reveal) void loadConceptNoteIndex();
  if (reveal && !state.navigationRestoring) resetPageScroll();
  if (reveal) commitRoute(routeForWork("concept-list"));
  finishMeasurement({ items: state.conceptDocument?.memos?.length || 0 });
}

function updateConceptBodyLabel() {
  const type = elements.conceptMemoTypeSelect.value;
  elements.conceptMemoBodyLabel.textContent = type === "text"
    ? "本文"
    : type === "todo"
      ? "TODO（[ ] / [x] で完了状態）"
      : "項目（1行につき1項目）";
}

function restoreSavedConceptDraft() {
  if (!state.currentConceptMemo || !state.dirty) return;
  state.conceptDocument = normalizeConceptDocument(JSON.parse(state.conceptOriginalContent));
}

function makeConceptEditorListItem(memo) {
  const current = memo.id === state.currentConceptMemo?.id;
  const button = makeElement("button", `editor-list-item concept-editor-list-item${current ? " current" : ""}`);
  button.type = "button";
  if (current) button.setAttribute("aria-current", "true");
  button.append(
    makeElement("strong", "", memo.title || "無題メモ"),
    makeElement("span", "", `${({ text: "TEXT", list: "LIST", todo: "TODO" })[memo.type] || "TEXT"}${current ? (state.dirty ? " ・ 編集中・未保存" : " ・ 編集中") : ""}`),
    makeElement("span", "concept-editor-list-preview", memoEditableText(memo).trim() || "内容はまだありません"),
  );
  button.addEventListener("click", () => {
    // Close the list first so the save choice and any errors stay in front.
    if (elements.editorListDialog.open) elements.editorListDialog.close();
    requestConceptMemoSwitch(memo.id).catch((error) => notify(error.message, true));
  });
  return button;
}

function renderConceptEditorList() {
  const panel = elements.conceptEditorListPanel;
  panel.hidden = !state.conceptEditorListVisible;
  panel.parentElement.classList.toggle("with-concept-list", state.conceptEditorListVisible);
  if (panel.hidden) { requestAnimationFrame(positionConceptEditorList); return; }
  const content = elements.conceptEditorListContent;
  const scrollTop = content.scrollTop;
  content.replaceChildren(...(state.conceptDocument?.memos || []).map(makeConceptEditorListItem));
  content.scrollTop = scrollTop;
  requestAnimationFrame(positionConceptEditorList);
}

function positionConceptEditorList() {
  const panel = elements.conceptEditorListPanel;
  const reference = elements.conceptNoteReferencePanel;
  reference.style.removeProperty("--concept-reference-top");
  if (panel.hidden || elements.conceptMemoEditorSection.hidden) return;
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
  const toolbar = elements.conceptMemoEditorSection.querySelector(".reader-toolbar");
  const top = Math.max(viewportTop + 8, toolbar.getBoundingClientRect().bottom + 8);
  const bottom = elements.inputAssistBar.hidden ? viewportBottom
    : Math.min(viewportBottom, elements.inputAssistBar.getBoundingClientRect().top);
  const height = Math.max(0, Math.floor(bottom - top - 12));
  panel.style.setProperty("--concept-list-top", `${Math.round(top)}px`);
  panel.style.setProperty("--concept-list-height", `${height}px`);
  // Only the toggle reserves space above the reference. The expanded list
  // overlays it, so opening the list does not shorten either panel.
  if (window.innerWidth >= 840 && !reference.hidden) {
    reference.style.setProperty("--concept-reference-top", `${Math.ceil(panel.querySelector("summary").getBoundingClientRect().bottom + 10)}px`);
  }
}

function chooseConceptMemoSwitch() {
  return new Promise((resolve) => {
    const dialog = elements.conceptSwitchDialog;
    dialog.returnValue = "cancel";
    dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
    dialog.showModal();
  });
}

async function requestConceptMemoSwitch(memoId) {
  if (memoId === state.currentConceptMemo?.id && !elements.conceptMemoEditorSection.hidden) return false;
  if (state.conceptSwitchPending || state.saving || state.syncing || state.deleting) {
    notify("保存・反映の処理中です。完了してからメモを切り替えてください。", true);
    return false;
  }
  if (!state.conceptDocument?.memos?.some((memo) => memo.id === memoId)) return false;
  const work = state.selectedWork;
  const current = state.currentConceptMemo;
  state.conceptSwitchPending = true;
  cancelAutoSave();
  try {
    if (state.dirty) {
      const choice = await chooseConceptMemoSwitch();
      if (state.selectedWork !== work || state.currentConceptMemo !== current) return false;
      if (state.saving || state.syncing || state.deleting) return false;
      if (choice === "save") {
        if (!await saveCurrentConceptMemo() || state.dirty || state.externalConflict || state.conceptSyncBlocked) return false;
      } else if (choice === "discard") {
        // Inputs mutate the shared document; restoring only dirty would save discarded edits later.
        const saved = normalizeConceptDocument(JSON.parse(state.conceptOriginalContent));
        if (!saved.memos.some((memo) => memo.id === memoId)) {
          notify("切り替え先のメモを保存済みデータで確認できません。", true);
          return false;
        }
        state.conceptDocument = saved;
      } else return false;
    }
    if (state.selectedWork !== work || state.saving || state.syncing
      || !state.conceptDocument?.memos?.some((memo) => memo.id === memoId)) return false;
    openConceptMemo(memoId, { resetScroll: false });
    return true;
  } finally {
    state.conceptSwitchPending = false;
    if (state.dirty) scheduleAutoSave();
  }
}

function prepareConceptSearchMemo(memo) {
  elements.conceptMemoTitleInput.value = memo.title;
  elements.conceptMemoBodyInput.value = memoEditableText(memo);
  elements.conceptMemoTypeSelect.value = memo.type;
  elements.conceptMemoTagsInput.value = (memo.tags || []).join(", ");
}

function openConceptMemo(memoId, { resetScroll = true } = {}) {
  renderMemoAutoReflectDefaults();
  const memo = state.conceptDocument?.memos?.find((item) => item.id === memoId);
  if (!memo) return;
  closeConceptNoteReference();
  conceptBatchSave.reset();
  if (elements.conceptSearchDialog) conceptSearchController.clearUndo();
  state.currentConceptMemo = memo;
  state.conceptSyncBlocked = false;
  state.currentNote = null;
  state.currentFile = null;
  state.dirty = false;
  state.externalConflict = false;
  elements.conceptMemosSection.hidden = true;
  elements.conceptMemoEditorSection.hidden = false;
  elements.conceptMemoTitleInput.value = memo.title;
  elements.conceptMemoTypeSelect.value = memo.type;
  renderConceptMemoFolderOptions(memo);
  elements.conceptMemoBodyInput.value = memoEditableText(memo);
  elements.conceptMemoTagsInput.value = (memo.tags || []).join(", ");
  elements.conceptMemoPinnedInput.checked = Boolean(memo.isPinned);
  elements.conceptMemoArchivedInput.checked = Boolean(memo.isArchived);
  elements.conceptMemoDashboardInput.checked = Boolean(memo.showInDashboard);
  const hasSource = memo.source?.kind === "noteItem";
  elements.conceptMemoSource.hidden = !hasSource;
  elements.previewConceptSourceMenuButton.disabled = !hasSource;
  elements.previewConceptSourceMenuButton.title = hasSource ? "連携先ノートをプレビュー" : "連携先ノートがあるメモで利用できます";
  renderConceptAutoReflectSetting();
  elements.conceptMemoSourceText.textContent = hasSource
    ? `${memo.source.noteType === "plot" ? "プロット" : "資料"} / ${memo.source.noteTitle || "ノート"}${memo.source.groupTitle ? ` / ${memo.source.groupTitle}` : ""}${memo.source.itemHeading ? ` / ${memo.source.itemHeading}` : ""}`
    : "";
  if (hasSource) setConceptSyncStatus("同期状態を確認しています…");
  elements.conceptAutoSaveToggle.checked = state.autoSaveEnabled;
  elements.saveConceptMemoButton.disabled = true;
  state.activeAssistTarget = elements.conceptMemoBodyInput;
  updateConceptBodyLabel();
  renderInputAssistVisibility();
  setConceptStatus("保存済み");
  renderConceptEditorList();
  startExternalMonitor();
  if (hasSource) {
    const work = state.selectedWork;
    refreshConceptSyncStatus().catch(() => {
      if (state.selectedWork === work && state.currentConceptMemo?.id === memoId) setConceptSyncStatus("同期状態を確認できません", "error");
    });
  }
  commitRoute(routeForWork("concept-editor", { memoId }));
  if (resetScroll) resetPageScroll();
}

async function reloadConceptDocument(item = state.conceptFile, memoId = state.currentConceptMemo?.id) {
  const raw = await state.provider.readText(item);
  state.conceptFile = item;
  state.conceptDocument = normalizeConceptDocument(JSON.parse(raw));
  state.conceptOriginalContent = raw;
  openConceptMemo(memoId, { resetScroll: false });
}

function markConceptDirty() {
  if (elements.conceptSearchDialog) conceptSearchController.changed();
  if (!state.currentConceptMemo) return;
  state.currentConceptMemo.updatedAt = new Date().toISOString();
  state.dirty = true;
  elements.saveConceptMemoButton.disabled = Boolean(state.conceptSyncPending || state.saving);
  setConceptStatus("未保存", "dirty");
  renderConceptEditorList();
  scheduleAutoSave();
}



function closeConceptNoteReference() {
  state.conceptNoteReferenceLoadToken += 1;
  state.conceptNoteReferenceContext = null;
  elements.conceptNoteReferencePanel.hidden = true;
  elements.conceptMemoEditorSection.classList.remove("note-reference-open");
  for (const button of [elements.previewConceptSourceButton, elements.previewConceptSourceMenuButton].filter(Boolean)) {
    button.setAttribute("aria-expanded", "false"); button.classList.remove("active");
  }
  requestAnimationFrame(positionConceptEditorList);
}

async function previewConceptSourceNote() {
  const memo = state.currentConceptMemo;
  if (memo?.source?.kind !== "noteItem") return;
  const loadToken = ++state.conceptNoteReferenceLoadToken;
  const workId = state.selectedWork?.id;
  state.conceptNoteReferenceContext = null;
  if (elements.conceptNoteReferencePanel.hidden) elements.conceptEditorListPanel.open = false;
  elements.conceptNoteReferencePanel.hidden = false;
  elements.conceptMemoEditorSection.classList.add("note-reference-open");
  for (const button of [elements.previewConceptSourceButton, elements.previewConceptSourceMenuButton].filter(Boolean)) {
    button.setAttribute("aria-expanded", "true"); button.classList.add("active");
  }
  elements.conceptNoteReferenceTitle.textContent = memo.source.noteTitle || "連携先ノート";
  elements.conceptNoteReferencePath.textContent = "";
  elements.openConceptSourceNoteButton.disabled = true;
  showLoading(elements.conceptNoteReferenceContent, "連携先のノートを読み込んでいます…");
  requestAnimationFrame(() => { updateInputAssistViewport(); positionConceptEditorList(); });
  try {
    const context = await findConceptSourceEntry(memo);
    if (loadToken !== state.conceptNoteReferenceLoadToken || state.currentConceptMemo?.id !== memo.id || state.selectedWork?.id !== workId) return;
    state.conceptNoteReferenceContext = { ...context, memoId: memo.id, workId };
    elements.conceptNoteReferenceTitle.textContent = context.entry.data.title || "無題のノート";
    elements.conceptNoteReferencePath.textContent = [context.group.title, context.item.heading].filter(Boolean).join(" / ");
    renderReaderNoteReference(context.entry, elements.conceptNoteReferenceContent, context.item.id);
    elements.openConceptSourceNoteButton.disabled = false;
    requestAnimationFrame(() => {
      if (loadToken !== state.conceptNoteReferenceLoadToken) return;
      const target = elements.conceptNoteReferenceContent.querySelector(".is-source-target");
      if (target) {
        const content = elements.conceptNoteReferenceContent;
        content.scrollTop += target.getBoundingClientRect().top - content.getBoundingClientRect().top;
      }
    });
  } catch (error) {
    if (loadToken !== state.conceptNoteReferenceLoadToken) return;
    showEmpty(elements.conceptNoteReferenceContent, error.message || "連携先を読み込めませんでした。");
  }
}

async function openConceptSourceNote() {
  const context = state.conceptNoteReferenceContext;
  if (!context || state.saving || state.currentConceptMemo?.id !== context.memoId || state.selectedWork?.id !== context.workId) return;
  if (!canDiscardDraft()) return;
  const source = { ...state.currentConceptMemo.source };
  const button = elements.openConceptSourceNoteButton;
  setBusy(button, true, "読込中…");
  try {
    state.noteType = source.noteType === "reference" ? "reference" : "plot";
    await openNote(context.entry);
    const target = locateConceptSource([state.currentNote], source);
    if (!target) return notify("連携先の項目が見つかりません。ノートの内容を確認してください。", true);
    state.noteDisclosure[`${target.item.id}:body`] = true;
    state.noteDisclosure[`${target.item.id}:memo`] = true;
    renderNoteEditor();
    requestAnimationFrame(() => {
      const card = document.getElementById(`note-item-${target.groupIndex}-${target.itemIndex}`);
      const memoInput = card?.querySelector(".note-memo");
      (memoInput || card)?.scrollIntoView({ behavior: "smooth", block: "center" });
      memoInput?.focus({ preventScroll: true });
    });
  } catch (error) {
    notify(error.message || "ノートを開けませんでした。", true);
  } finally {
    setBusy(button, false);
  }
}

function memoAutoReflectStorageKey() {
  if (!state.workRoot?.id || !state.provider) return null;
  return `mojigoto.web.memoDefaults.v1.${JSON.stringify([workCatalogOwner(), state.cloudKind, state.workRoot.id])}`;
}

function renderMemoAutoReflectDefaults() {
  const key = memoAutoReflectStorageKey();
  const value = key ? readJson(localStorage.getItem(key)) : null;
  state.memoAutoReflectDefaults = value?.version === 1
    && ["note", "concept", "confirmed_note", "confirmed_concept"].every((field) => typeof value[field] === "boolean")
    ? value : null;
  for (const [control, direction] of [[elements.noteAutoReflectToggle, "note"], [elements.conceptAutoReflectToggle, "concept"]]) {
    control.checked = Boolean(state.memoAutoReflectDefaults?.[direction]);
    control.disabled = !key || Boolean(state.memoDefaultsChanging);
    control.title = "接続中の作品ルート内の全作品に適用。個別ON／OFFが優先されます。";
  }
  if (state.currentConceptMemo) renderConceptAutoReflectSetting();
}

function chooseMemoAutoReflectScope(direction) {
  const dialog = elements.memoAutoReflectDialog;
  elements.memoAutoReflectDialogTitle.textContent = direction === "note"
    ? "項目メモ→構想メモの全体設定をON" : "構想メモ→項目メモの全体設定をON";
  dialog.returnValue = "cancel";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
    dialog.showModal();
  });
}

async function changeMemoAutoReflectDefault(direction, enabled) {
  if (state.memoDefaultsChanging || state.saving || state.syncing || state.externalConflict) {
    notify("保存・反映が終わってから全体設定を変更してください。", true);
    renderMemoAutoReflectDefaults(); return;
  }
  const key = memoAutoReflectStorageKey();
  if (!key) { renderMemoAutoReflectDefaults(); return; }
  const provider = state.provider, root = state.workRoot;
  const defaults = { version: 1, note: false, concept: false, confirmed_note: false, confirmed_concept: false,
    ...(state.memoAutoReflectDefaults || {}) };
  state.memoDefaultsChanging = true; state.syncing = true; cancelAutoSave();
  renderMemoAutoReflectDefaults();
  const assertCurrent = () => {
    if (provider !== state.provider || root !== state.workRoot || key !== memoAutoReflectStorageKey()) {
      throw new Error("接続先が変わったため、全体設定の変更を停止しました。");
    }
  };
  try {
    if (enabled && !defaults[`confirmed_${direction}`]) {
      const choice = await chooseMemoAutoReflectScope(direction); assertCurrent();
      if (!["all", "future"].includes(choice)) return;
      if (choice === "future") {
        if (state.dirty) throw new Error("先に編集中の内容を保存してから、全体設定を変更してください。");
        await keepExistingMemoDefaultsOff(provider, root, direction, { assertCurrent, onSaved: (entry) => {
          if (entry.kind === "note" && state.currentNote?.item.id === entry.item.id) {
            if (elements.noteSearchDialog) noteSearchController.clearUndo();
            state.currentNote = { item: entry.item, data: normalizeNote(entry.data), raw: entry.raw };
            renderNoteEditor(); refreshNoteDerivedViews();
          }
          if (entry.kind === "concept" && state.conceptFile?.id === entry.item.id) {
            const memoId = state.currentConceptMemo?.id;
            state.conceptFile = entry.item; state.conceptDocument = normalizeConceptDocument(entry.data);
            state.conceptOriginalContent = entry.raw; state.selectedWork.conceptFile = entry.item;
            state.currentConceptMemo = state.conceptDocument.memos.find((memo) => memo.id === memoId) || null;
            state.conceptSyncContext = null;
          }
          state.noteEntriesCache.clear(); state.conceptLoadedAt = 0;
        } });
      }
      defaults[`confirmed_${direction}`] = true;
    }
    defaults[direction] = enabled; assertCurrent();
    localStorage.setItem(key, JSON.stringify(defaults));
    notify("メモの全体設定を保存しました。次のメモ保存から適用します。");
  } catch (error) {
    notify(error.message || "メモの全体設定を変更できませんでした。", true);
  } finally {
    state.memoDefaultsChanging = false; state.syncing = false;
    renderMemoAutoReflectDefaults();
    if (state.dirty) scheduleAutoSave();
  }
}

function renderConceptAutoReflectSetting() {
  const source = state.currentConceptMemo?.source;
  elements.conceptMemoAutoReflectInput.value = autoReflectSelection(source, "autoSyncToNoteItem", "autoSyncToNoteItemOverride");
  const configured = state.memoAutoReflectDefaults && state.memoAutoReflectDefaults.confirmed_concept !== false;
  elements.conceptMemoAutoReflectHelp.textContent = source?.kind !== "noteItem" ? ""
    : conceptAutoReflectEnabled(state, source)
      ? "保存後に項目メモへ自動反映します。両側に変更がある場合は停止します。"
      : elements.conceptMemoAutoReflectInput.value === "off"
        ? "このメモは個別OFFです。全体設定より優先されます。"
        : !configured ? "全体設定は未設定です。歯車から全体の既定をONにするか、このメモをONにしてください。"
          : "全体の既定がOFFです。歯車でONにするか、このメモをONにしてください。";
}

function refreshNoteAutoReflectActions() {
  for (const button of elements.noteGroups.querySelectorAll('[data-note-action="create-concept"], [data-note-action="sync-concept"]')) {
    const item = state.currentNote?.data?.groups?.[Number(button.dataset.groupIndex)]?.items?.[Number(button.dataset.itemIndex)];
    const count = item?.memo?.linkedConceptMemoIds?.filter(Boolean).length || 0;
    button.dataset.noteAction = count ? "sync-concept" : "create-concept";
    button.textContent = count ? "構想メモへ反映" : "構想メモを作成";
    button.title = count ? `${count}件のリンク済み構想メモへ反映` : "項目メモから構想メモを作成してリンク";
  }
}


function setConceptSyncStatus(message, tone = "") {
  state.conceptSyncBlocked = tone === "error";
  elements.conceptMemoSyncStatus.textContent = message;
  elements.conceptMemoSyncStatus.className = `muted${tone ? ` ${tone}` : ""}`;
}






const WORK_EXPORT_CONTROLS = [
  ["includeSubtitle", "exportSubtitleInput"],
  ["includeFolderName", "exportFolderNameInput"],
  ["includeGenre", "exportGenreInput"],
  ["includeTargetChars", "exportTargetCharsInput"],
  ["includeDeadline", "exportDeadlineInput"],
  ["includePenName", "exportPenNameInput"],
  ["includeMemo", "exportMemoInput"],
  ["includeUpdatedAt", "exportUpdatedAtInput"],
];


function renderRelatedWorkSummary() {
  const count = new Set(state.currentSettings?.data?.relatedWorkIds || []).size;
  const summary = relatedWorksController.summary(state.currentSettings?.data);
  elements.relatedWorksSummary.textContent = "登録済みの関連：" + count + "件" + (count ? " ／ " + (summary.names.length ? summary.names.join("、") + (summary.unknown ? "、参照できない関連 " + summary.unknown + "件" : "") : summary.loaded ? "参照できない関連 " + summary.unknown + "件" : "作品名を確認中…") : "");
  if (count) void relatedWorksController.loadSummary();
  elements.relatedWorksPendingNotice.hidden = !relatedWorksController.hasPending();
}

function acceptRelatedWorkRecord(record) {
  if (!state.currentSettings || referenceWorkKey(state.selectedWork) !== record.key) return;
  const data = normalizeWorkSettings(record.data, state.selectedWork.name);
  state.currentSettings = { item: record.item, data, raw: record.raw };
  state.selectedWork.settingsFile = record.item;
  state.selectedWork.title = data.title;
  state.selectedWork.status = data.status;
  state.selectedWork.contentUpdatedAt = record.item.lastModifiedDateTime || data.updatedAt || state.selectedWork.contentUpdatedAt;
  state.workSettingsDocuments.clear();
  state.workSettingsDocuments.set(String(state.selectedWork.id), { value: state.currentSettings, loadedAt: Date.now() });
  state.dirty = false; state.externalConflict = false;
  if (state.works.length) persistWorkCatalog(state.workRoot, state.works);
  renderWorksList(); renderWorkSettings(); setWorkSettingsStatus("保存済み");
}

function renderWorkSettings() {
  const data = state.currentSettings?.data;
  if (!data) return;
  elements.workSettingsHeading.textContent = `${data.title || state.selectedWork.title} / 作品設定`;
  elements.workSettingsMeta.textContent = `${state.currentSettings.item.name} ・ ${formatDate(data.updatedAt || state.currentSettings.item.lastModifiedDateTime)}`;
  elements.workTitleInput.value = data.title;
  elements.workSubtitleInput.value = data.subtitle;
  elements.workStatusSelect.value = data.status;
  elements.workPenNameInput.value = data.penName;
  elements.workTargetCharsInput.value = String(data.targetChars || 0);
  elements.workDeadlineInput.value = data.deadline;
  elements.workGenresInput.value = data.genres.join(", ");
  elements.workSummaryInput.value = data.summary;
  elements.workMemoInput.value = data.memo;
  if (elements.relatedWorksSummary) renderRelatedWorkSummary();
  for (const [field, id] of WORK_EXPORT_CONTROLS) elements[id].checked = Boolean(data.exportOptions?.[field]);
  elements.settingsAutoSaveToggle.checked = state.autoSaveEnabled;
  elements.saveWorkSettingsButton.disabled = !state.dirty;
  elements.workSettingsLoading.hidden = true;
  elements.workSettingsForm.hidden = false;
}


async function openWorkSettings() {
  const settingsCacheKey = String(state.selectedWork?.id || "");
  const settingsCache = state.workSettingsDocuments.get(settingsCacheKey);
  const finishMeasurement = beginPerformanceMeasurement("作品設定", {
    cache:
      settingsCache && Date.now() - settingsCache.loadedAt < VIEW_CACHE_DURATION
        ? "再利用"
        : settingsCache
          ? "更新確認"
          : "取得",
  });
  if (!canDiscardDraft()) return;
  cancelAutoSave();
  stopExternalMonitor();
  state.currentFile = null;
  state.currentNote = null;
  state.currentConceptMemo = null;
  state.dirty = false;
  state.externalConflict = false;
  elements.browserSection.hidden = true;
  elements.worksSection.hidden = true;
  elements.filesSection.hidden = true;
  elements.readerSection.hidden = true;
  elements.notesSection.hidden = true;
  elements.noteEditorSection.hidden = true;
  hideConceptViews();
  elements.workSettingsSection.hidden = false;
  elements.workSettingsHeading.textContent = `${state.selectedWork.title} / 作品設定`;
  elements.workSettingsMeta.textContent = "作品設定を読み込んでいます…";
  elements.workSettingsLoading.hidden = false;
  elements.workSettingsForm.hidden = true;
  elements.saveWorkSettingsButton.disabled = true;
  renderInputAssistVisibility();
  setWorkSettingsStatus("読み込み中", "saving");
  try {
    let item = await ensureWorkSettingsFile();
    const cacheKey = String(state.selectedWork.id || "");
    const cached = state.workSettingsDocuments.get(cacheKey);
    if (cached && Date.now() - cached.loadedAt < VIEW_CACHE_DURATION) {
      state.currentSettings = cached.value;
      state.dirty = false;
      renderWorkSettings();
      setWorkSettingsStatus("保存済み");
      startExternalMonitor();
    } else if (cached) {
      const metadata = await state.provider.getItemMetadata(cached.value.item);
      if (!hasExternalVersion(cached.value.item, metadata)) {
        cached.loadedAt = Date.now();
        state.currentSettings = cached.value;
        state.dirty = false;
        renderWorkSettings();
        setWorkSettingsStatus("保存済み");
        startExternalMonitor();
      } else {
        item = { ...item, ...metadata };
        await loadWorkSettings(item);
      }
    } else {
      await loadWorkSettings(item);
    }
    commitRoute(routeForWork("settings"));
    finishMeasurement();
  } catch (error) {
    finishMeasurement({ result: "失敗" });
    elements.workSettingsLoading.hidden = true;
    elements.workSettingsMeta.textContent = error.message || "作品設定を読み込めませんでした。";
    setWorkSettingsStatus("読み込み失敗", "error");
    throw error;
  }
}


function markWorkSettingsDirty() {
  if (!state.currentSettings) return;
  state.dirty = true;
  elements.saveWorkSettingsButton.disabled = false;
  setWorkSettingsStatus("未保存", "dirty");
  scheduleAutoSave();
}


async function reloadLatestFile() {
  if (!canDiscardDraft()) return;
  const target = state.currentSettings?.item || (state.currentConceptMemo ? state.conceptFile : state.currentNote?.item || state.currentFile);
  if (!target) return;
  elements.conflictDialog.close();
  const metadata = await state.provider.getItemMetadata(target);
  if (state.currentSettings) await reloadWorkSettings({ ...target, ...metadata });
  else if (state.currentConceptMemo) await reloadConceptDocument({ ...target, ...metadata }, state.currentConceptMemo.id);
  else if (state.currentNote) await openNote({ ...state.currentNote, item: { ...target, ...metadata } });
  else await openFile({ ...state.currentFile, ...metadata });
  notify(`${cloudLabel()}の最新版を読み込みました。`);
}

async function chooseGoogleDriveFolder() {
  if (!canDiscardDraft()) return false;
  location.assign("./google-drive-setup.html");
  return true;
}






elements.autoConnectCheckbox.addEventListener("change", () => {
  saveAutoConnectPreference(elements.autoConnectCheckbox.checked);
  sessionStorage.removeItem(`${autoConnectStorageKey()}.attempt`);
});


elements.connectButton.addEventListener("click", async () => {
  if (!canDiscardDraft()) return;
  if (!state.microsoftAuth?.clientId) {
    elements.settingsDialog.showModal();
    return;
  }
  try {
    setBusy(elements.connectButton, true, "接続中…");
    activateCloud("oneDrive");
    await state.microsoftAuth.signIn();
  } catch (error) {
    setBusy(elements.connectButton, false);
    notify(error.message || String(error), true);
  }
});

elements.connectDropboxButton.addEventListener("click", async () => {
  try {
    if (!canDiscardDraft()) return;
    setBusy(elements.connectDropboxButton, true, "接続中…");
    activateCloud("dropbox");
    await state.dropboxAuth.signIn();
  } catch (error) {
    setBusy(elements.connectDropboxButton, false);
    notify(error.message || String(error), true);
  }
});

elements.connectGoogleDriveButton.addEventListener("click", async () => {
  if (state.cloudKind === "googleDrive" && state.provider && (isGoogleDriveEditingScreen() || state.workRoot?.id)) return reconnectGoogleDriveForEditing();
  let reconnected = false;
  try {
    if (!canDiscardDraft()) return;
    const root = readJson(localStorage.getItem(GOOGLE_ROOT_KEY));
    if (!root?.id || root.googleDriveScope !== state.googleDriveAuth.scope) {
      location.assign("./google-drive-setup.html");
      return;
    }
    setBusy(elements.connectGoogleDriveButton, true, "接続中…");
    activateCloud("googleDrive");
    await state.googleDriveAuth.signIn({ prompt: "" });
    reconnected = true;
    renderConnectedCloud();
    await loadWorks(root);
  } catch (error) {
    notify(error.message || String(error), true);
  } finally {
    setBusy(elements.connectGoogleDriveButton, false);
    if (reconnected) elements.connectGoogleDriveButton.textContent = "接続済み";
  }
});
elements.reconnectGoogleDriveButton.addEventListener("click", reconnectGoogleDriveForEditing);
setInterval(updateGoogleDriveConnectionNotice, 30000);

elements.selectGoogleDriveFolderButton.addEventListener("click", async () => {
  try {
    setBusy(elements.selectGoogleDriveFolderButton, true, "選択中…");
    await chooseGoogleDriveFolder();
  } catch (error) {
    notify(error.message || String(error), true);
  } finally {
    setBusy(elements.selectGoogleDriveFolderButton, false);
  }
});

elements.googleDriveAdditionalButton.addEventListener("click", () => {
  if (canDiscardDraft()) location.assign("./google-drive-setup.html?mode=additional");
});
elements.googleDriveSetupLink.addEventListener("click", (event) => {
  if (!canDiscardDraft()) event.preventDefault();
});

function closeHeaderMenu() {
  elements.headerMenu.classList.remove("open");
  elements.headerMenuButton.setAttribute("aria-expanded", "false");
}

function announcementId(item, index = 0) {
  return String(item?.id || `${item?.date || "date"}:${item?.title || index}`);
}

function announcementReadKey() {
  const account = String(state.userSession?.user?.email || "device").trim().toLowerCase();
  return `${ANNOUNCEMENT_READ_KEY}.${account}`;
}

function readAnnouncementIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(announcementReadKey()) || "[]");
    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveAnnouncementIds(ids) {
  localStorage.setItem(announcementReadKey(), JSON.stringify([...ids]));
}

function updateAnnouncementBadge() {
  const readIds = readAnnouncementIds();
  const unread = state.announcements.filter((item, index) => !readIds.has(announcementId(item, index))).length;
  elements.announcementBadge.textContent = unread > 99 ? "99+" : String(unread);
  elements.announcementBadge.hidden = unread === 0;
  elements.editorAnnouncementBadge.textContent = unread > 99 ? "99+" : String(unread);
  elements.editorAnnouncementBadge.hidden = unread === 0;
  elements.headerAnnouncementBadge.textContent = unread > 99 ? "99+" : String(unread);
  elements.headerAnnouncementBadge.hidden = unread === 0;
  elements.headerMenuButton.setAttribute("aria-label", unread ? `メニュー（未読のお知らせ${unread}件）` : "メニュー");
  elements.markAllAnnouncementsReadButton.hidden = unread === 0;
  elements.announcementButton.setAttribute("aria-label", unread ? `お知らせを開く（未読${unread}件）` : "お知らせを開く");
}

async function loadAnnouncements() {
  const response = await fetch("./announcements.json", { cache: "no-store" });
  if (!response.ok) throw new Error("お知らせを読み込めませんでした。");
  const data = await response.json();
  state.announcements = Array.isArray(data?.items) ? data.items : [];
  updateAnnouncementBadge();
  return state.announcements;
}

function markAnnouncementRead(id) {
  const readIds = readAnnouncementIds();
  readIds.add(String(id));
  saveAnnouncementIds(readIds);
  updateAnnouncementBadge();
}

function renderAnnouncements(items) {
  if (!items.length) {
    showEmpty(elements.announcementList, "現在、新しいお知らせはありません");
    return;
  }
  const readIds = readAnnouncementIds();
  elements.announcementList.replaceChildren(...items.map((item, index) => {
    const id = announcementId(item, index);
    const isRead = readIds.has(id);
    const article = makeElement("article", `announcement-item${isRead ? " is-read" : " is-unread"}`);
    const heading = makeElement("div", "announcement-item-heading");
    heading.append(makeElement("time", "", String(item.date || "")));
    if (!isRead) heading.append(makeElement("span", "announcement-unread-label", "新着"));
    article.append(
      heading,
      makeElement("h3", "", String(item.title || "お知らせ")),
      makeElement("p", "", String(item.summary || "")),
    );
    const actions = makeElement("div", "announcement-item-actions");
    const url = String(item.url || "");
    if (/^https:\/\//i.test(url)) {
      const link = makeElement("a", "", "詳しく見る");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.append(link);
    }
    const readButton = makeElement("button", "announcement-read-button", isRead ? "既読" : "既読にする");
    readButton.type = "button";
    readButton.disabled = isRead;
    readButton.addEventListener("click", () => {
      markAnnouncementRead(id);
      renderAnnouncements(state.announcements);
    });
    actions.append(readButton);
    article.append(actions);
    return article;
  }));
}

async function refreshAnnouncementBadge() {
  try {
    await loadAnnouncements();
  } catch {
    state.announcements = [];
    updateAnnouncementBadge();
  }
}

async function openAnnouncements() {
  closeHeaderMenu();
  showLoading(elements.announcementList, "お知らせを読み込んでいます…");
  elements.announcementDialog.showModal();
  try {
    renderAnnouncements(await loadAnnouncements());
  } catch (error) {
    showEmpty(elements.announcementList, error.message || "お知らせを読み込めませんでした");
  }
}

elements.headerMenuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = !elements.headerMenu.classList.contains("open");
  elements.headerMenu.classList.toggle("open", open);
  elements.headerMenuButton.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (event) => {
  if (!elements.headerMenu.contains(event.target)) closeHeaderMenu();
});
elements.microsoftLoginLink.addEventListener("click", () => showLoginRedirectLoading("Microsoft"));
elements.googleLoginLink.addEventListener("click", () => showLoginRedirectLoading("Google"));
elements.announcementButton.addEventListener("click", openAnnouncements);
elements.closeAnnouncementButton.addEventListener("click", () => elements.announcementDialog.close());
elements.markAllAnnouncementsReadButton.addEventListener("click", () => {
  const readIds = readAnnouncementIds();
  state.announcements.forEach((item, index) => readIds.add(announcementId(item, index)));
  saveAnnouncementIds(readIds);
  updateAnnouncementBadge();
  renderAnnouncements(state.announcements);
});
function openConnectionSettings() {
  closeHeaderMenu();
  closeEditorOptions();
  elements.displayThemeSelect.value = state.theme;
  elements.displayFontScaleSelect.value = String(state.fontScale);
  if (!elements.settingsDialog.open) elements.settingsDialog.showModal();
}

elements.settingsButton.addEventListener("click", openConnectionSettings);
for (const button of document.querySelectorAll("[data-editor-settings]")) {
  button.addEventListener("click", openConnectionSettings);
}
let appReloadPending = false;
async function reloadApp(clearCache = false) {
  if (appReloadPending) return;
  if (state.saving) {
    notify("保存中です。保存が終わってから再読み込みしてください。", true);
    return;
  }
  if (state.dirty && !window.confirm("保存していない変更があります。変更を破棄して再読み込みしますか？")) return;
  if (clearCache && navigator.onLine === false) {
    notify("インターネットに接続してから、キャッシュを削除して再読み込みしてください。", true);
    return;
  }
  appReloadPending = true;
  elements.reloadAppButton.disabled = true;
  setBusy(elements.clearAppCacheButton, true, clearCache ? "キャッシュを削除中…" : "再読み込み中…");
  try {
    if (clearCache) await clearAppCache(window.caches, navigator.serviceWorker, document.baseURI);
    if (state.saving || state.syncing) throw new Error("保存中です。保存が終わってから再読み込みしてください。");
    cancelAutoSave();
    state.dirty = false;
    window.location.reload();
  } catch (error) {
    notify(error.message || "キャッシュを削除できませんでした。通常の再読み込みをお試しください。", true);
    appReloadPending = false;
    elements.reloadAppButton.disabled = false;
    setBusy(elements.clearAppCacheButton, false);
  }
}
elements.reloadAppButton.addEventListener("click", () => reloadApp());
elements.clearAppCacheButton.addEventListener("click", () => reloadApp(true));
elements.displayThemeSelect.addEventListener("change", () => {
  localStorage.setItem(THEME_KEY, elements.displayThemeSelect.value);
  applyTheme(elements.displayThemeSelect.value);
});
elements.displayFontScaleSelect.addEventListener("change", () => {
  localStorage.setItem(FONT_SCALE_KEY, elements.displayFontScaleSelect.value);
  applyFontScale(elements.displayFontScaleSelect.value);
});
elements.displayWritingFontSelect.addEventListener("change", () => {
  applyWritingFont(elements.displayWritingFontSelect.value);
  localStorage.setItem(WRITING_FONT_KEY, elements.displayWritingFontSelect.value);
});
function openGuide(section = "", options = {}) {
  closeHeaderMenu();
  closeEditorOptions();
  section = typeof section === "string" && /^guide-[a-z0-9-]+$/.test(section) ? section : "";
  if (elements.settingsDialog.open) elements.settingsDialog.close();
  const openedFromLogin = !elements.loginGate.hidden;
  elements.loginGuideContent.hidden = !openedFromLogin;
  elements.appGuideContent.hidden = openedFromLogin;
  if (!elements.guideDialog.open) elements.guideDialog.showModal();
  for (const topic of elements.appGuideContent.querySelectorAll?.(".guide-sections > details") || []) topic.open = false;
  const scroll = elements.guideDialog.querySelector?.(".guide-scroll-content");
  if (scroll) scroll.scrollTop = 0;
  if (!openedFromLogin && section) {
    const target = elements.appGuideContent.querySelector(`[data-guide-section="${section}"]`);
    if (target) { for (let parent = target; parent && parent !== elements.appGuideContent; parent = parent.parentElement) if (parent.tagName === "DETAILS") parent.open = true; target.scrollIntoView({ block: "start" }); }
  }
}
elements.guideButton.addEventListener("click", openGuide);
elements.loginGuideButton.addEventListener("click", openGuide);
elements.openGuideFromSettingsButton.addEventListener("click", openGuide);
elements.closeGuideButton.addEventListener("click", () => elements.guideDialog.close());
elements.appGuideContent.addEventListener("click", event => {
  const link = event.target.closest("a[href^='#guide-']");
  if (!link) return;
  event.preventDefault();
  openGuide(link.getAttribute("href").slice(1), { inline: true });
});
for (const button of document.querySelectorAll("[data-editor-guide]")) {
  button.addEventListener("click", () => openGuide(button.dataset.editorGuide, { inline: button.hasAttribute("data-editor-guide-inline") }));
}
elements.editorFooterMenu.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-editor-footer-action]");
  if (!button) return;
  elements.editorFooterMenu.open = false;
  const target = {
    announcements: elements.announcementButton,
    guide: elements.guideButton,
    settings: elements.settingsButton,
  }[button.dataset.editorFooterAction];
  target?.click();
});
elements.copyRedirectUriButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.microsoftAuth.redirectUri);
    notify("リダイレクトURIをコピーしました。");
  } catch {
    notify("URIを選択してコピーしてください。", true);
  }
});
elements.copyEnvironmentButton?.addEventListener("click", async () => {
  const user = state.userSession?.user || {};
  const environment = [
    "【もじごと Web 不具合報告】",
    `発生日時: ${new Date().toLocaleString("ja-JP")}`,
    `利用者ID: ${user.id || "未取得"}`,
    `ログイン方法: ${user.provider === "google" ? "Google" : user.provider === "microsoft" ? "Microsoft" : user.provider === "email" ? "メールアドレス・パスワード" : "不明"}`,
    `クラウド: ${cloudLabel()}`,
    `表示テーマ: ${state.theme}`,
    `画面サイズ: ${window.innerWidth} × ${window.innerHeight}`,
    `ブラウザ情報: ${navigator.userAgent}`,
    `表示ページ: ${location.href.split("#")[0]}`,
    ...environmentContext({
      visibleSections: [...document.querySelectorAll("section[id]")].filter(section => !section.hidden).map(section => section.id),
      openDialogs: [...document.querySelectorAll("dialog[open]")].map(dialog => dialog.id),
      noteType: state.noteType, dirty: state.dirty, saving: state.saving,
      externalConflict: state.externalConflict, manuscriptPreviewMode: state.manuscriptPreviewMode,
    }),
    "",
    "発生した操作:",
    "期待していた結果:",
    "実際に起きたこと:",
  ].join("\n");
  try {
    await navigator.clipboard.writeText(environment);
    notify("不具合報告用の環境情報をコピーしました。");
  } catch {
    notify("環境情報をコピーできませんでした。", true);
  }
});
elements.copyPerformanceButton?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(formatPerformanceSamples());
    notify(state.performanceSamples.length
      ? "速度計測結果をコピーしました。"
      : "計測対象の画面を開いてから、もう一度お試しください。",
      !state.performanceSamples.length);
  } catch {
    notify("速度計測結果をコピーできませんでした。", true);
  }
});
elements.settingsForm.addEventListener("submit", (event) => {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();
  if (state.managedDeployment) {
    elements.settingsDialog.close();
    return;
  }
  const clientId = elements.clientIdInput.value.trim();
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
    notify("Microsoft アプリIDの形式を確認してください。", true);
    return;
  }
  localStorage.setItem(CLIENT_ID_KEY, clientId);
  configureAuth();
  elements.settingsDialog.close();
  elements.connectionDescription.textContent = "設定を保存しました。OneDriveへ接続できます。";
  elements.connectButton.textContent = "接続する";
  elements.connectButton.disabled = false;
  notify("接続設定を保存しました。");
});

elements.disconnectButton.addEventListener("click", async () => {
  if (!canDiscardDraft()) return;
  cancelAutoSave();
  saveAutoConnectPreference(false);
  sessionStorage.removeItem(`${autoConnectStorageKey()}.attempt`);
  await state.auth?.signOut();
  localStorage.removeItem(ROOT_KEY);
  localStorage.removeItem(GOOGLE_ROOT_KEY);
  localStorage.removeItem(DROPBOX_ROOT_KEY);
  for (const key of [WORK_CHARACTER_CACHE_KEY, WORK_SETTINGS_CACHE_KEY, WORK_SHARED_METRICS_CACHE_KEY,
    WORK_CATALOG_CACHE_KEY, WORK_METRIC_SUMMARY_CACHE_KEY]) localStorage.removeItem(`${key}.dropbox`);
  localStorage.removeItem(CLOUD_KIND_KEY);
  localStorage.removeItem(`${WORK_CHARACTER_CACHE_KEY}.oneDrive`);
  localStorage.removeItem(`${WORK_CHARACTER_CACHE_KEY}.googleDrive`);
  localStorage.removeItem(`${WORK_SETTINGS_CACHE_KEY}.oneDrive`);
  localStorage.removeItem(`${WORK_SETTINGS_CACHE_KEY}.googleDrive`);
  localStorage.removeItem(`${WORK_SHARED_METRICS_CACHE_KEY}.oneDrive`);
  localStorage.removeItem(`${WORK_SHARED_METRICS_CACHE_KEY}.googleDrive`);
  localStorage.removeItem(`${WORK_CATALOG_CACHE_KEY}.oneDrive`);
  localStorage.removeItem(`${WORK_CATALOG_CACHE_KEY}.googleDrive`);
  localStorage.removeItem(`${WORK_METRIC_SUMMARY_CACHE_KEY}.oneDrive`);
  localStorage.removeItem(`${WORK_METRIC_SUMMARY_CACHE_KEY}.googleDrive`);
  state.workRoot = null;
  location.reload();
});
elements.logoutButton.addEventListener("click", async () => {
  if (!canDiscardDraft()) return;
  cancelAutoSave();
  try {
    elements.logoutButton.disabled = true;
    const result = await state.userAuth?.logout(state.userSession?.csrfToken);
    if (result?.logoutUrl) location.assign(result.logoutUrl);
    else location.reload();
  } catch (error) {
    elements.logoutButton.disabled = false;
    notify(error.message || "ログアウトできませんでした。", true);
  }
});
elements.saveNicknameButton?.addEventListener("click", async () => {
  try {
    elements.saveNicknameButton.disabled = true;
    const result = await state.userAuth?.updateProfile(elements.nicknameInput.value, state.userSession?.csrfToken);
    if (!state.userSession?.user) return;
    state.userSession.user.nickname = result?.nickname || "";
    renderUserIdentity();
    notify(result?.nickname ? "ニックネームを保存しました。" : "ニックネームを削除しました。");
  } catch (error) {
    notify(error.message || "ニックネームを保存できませんでした。", true);
  } finally {
    elements.saveNicknameButton.disabled = false;
  }
});
elements.nicknameInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  elements.saveNicknameButton.click();
});

elements.selectFolderButton.addEventListener("click", () => loadWorks(state.currentFolder).catch((error) => notify(error.message, true)));
elements.changeFolderButton.addEventListener("click", async () => {
  try {
    if (state.cloudKind === "googleDrive") {
      await chooseGoogleDriveFolder();
      return;
    }
    const root = await state.provider.getRoot();
    root.name = cloudLabel();
    await showFolder(root, [root]);
  } catch (error) { notify(error.message, true); }
});
elements.workStatusFilter.addEventListener("change", () => {
  updateMultiFilterLabel(elements.workStatusFilter, elements.workStatusFilterLabel);
  persistViewPreferences();
  renderWorksList();
});
elements.workStatusFilter.addEventListener("click", (event) => {
  if (!event.target.closest('[data-clear-multi="work"]')) return;
  setCheckedValues(elements.workStatusFilter, []);
  updateMultiFilterLabel(elements.workStatusFilter, elements.workStatusFilterLabel);
  persistViewPreferences();
  renderWorksList();
});
elements.workSortField.addEventListener("change", () => { persistViewPreferences(); renderWorksList(); });
elements.workSortDirection.addEventListener("click", () => {
  const ascending = elements.workSortDirection.dataset.direction !== "asc";
  elements.workSortDirection.dataset.direction = ascending ? "asc" : "desc";
  elements.workSortDirection.textContent = ascending ? "昇順 ↑" : "降順 ↓";
  persistViewPreferences();
  renderWorksList();
});
elements.workMetricsToggle.addEventListener("change", () => {
  state.workMetricsEnabled = elements.workMetricsToggle.checked;
  localStorage.setItem(WORK_METRICS_KEY, String(state.workMetricsEnabled));
  const metricsToken = ++state.workMetricsLoadToken;
  if (!state.workMetricsEnabled) {
    state.works.forEach((work) => { work.metrics = basicWorkMetrics(work); });
    elements.worksLoadingStatus.hidden = true;
    renderWorksList();
    return;
  }
  loadWorkMetrics(state.works, metricsToken).catch((error) => {
    if (metricsToken !== state.workMetricsLoadToken) return;
    elements.worksLoadingStatus.hidden = true;
    notify(error.message || "作品情報を集計できませんでした。", true);
  });
});
elements.globalWorkNav.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-work-destination]");
  if (!button) return;
  const destination = button.dataset.workDestination;
  if (destination === "works") return showWorksHome();
  navigateWorkDestination(destination).catch((error) => notify(error.message, true));
});

const WORK_DESTINATION_SHORTCUTS = {
  "1": "works",
  "2": "manuscript",
  "3": "plot",
  "4": "reference",
  "5": "concept",
  "6": "settings",
};

document.addEventListener("keydown", (event) => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const destination = WORK_DESTINATION_SHORTCUTS[event.key];
  if (!destination || document.querySelector("dialog[open]")) return;
  event.preventDefault();
  if (destination === "works") {
    showWorksHome();
    return;
  }
  if (!state.selectedWork) {
    notify("先に作品を選択してください。", true);
    return;
  }
  navigateWorkDestination(destination).catch((error) => notify(error.message, true));
});
elements.backToWorksButton.addEventListener("click", () => {
  showWorksHome();
});
elements.openPlotsButton.addEventListener("click", () => navigateWorkDestination("plot").catch((error) => notify(error.message, true)));
elements.openReferencesButton.addEventListener("click", () => navigateWorkDestination("reference").catch((error) => notify(error.message, true)));
elements.openConceptMemosButton.addEventListener("click", () => navigateWorkDestination("concept").catch((error) => notify(error.message, true)));
elements.openWorkSettingsButton.addEventListener("click", () => navigateWorkDestination("settings").catch((error) => notify(error.message, true)));
elements.notesPlotsButton.addEventListener("click", () => navigateWorkDestination("plot").catch((error) => notify(error.message, true)));
elements.notesReferencesButton.addEventListener("click", () => navigateWorkDestination("reference").catch((error) => notify(error.message, true)));
elements.notesOpenConceptMemosButton.addEventListener("click", () => navigateWorkDestination("concept").catch((error) => notify(error.message, true)));
elements.notesOpenWorkSettingsButton.addEventListener("click", () => navigateWorkDestination("settings").catch((error) => notify(error.message, true)));
elements.notesOpenManuscriptsButton.addEventListener("click", () => {
  navigateWorkDestination("manuscript").catch((error) => notify(error.message, true));
});
elements.notesBackToWorksButton.addEventListener("click", () => {
  showWorksHome();
});
elements.conceptOpenManuscriptsButton.addEventListener("click", () => {
  navigateWorkDestination("manuscript").catch((error) => notify(error.message, true));
});
elements.conceptOpenPlotsButton.addEventListener("click", () => navigateWorkDestination("plot").catch((error) => notify(error.message, true)));
elements.conceptOpenReferencesButton.addEventListener("click", () => navigateWorkDestination("reference").catch((error) => notify(error.message, true)));
elements.conceptOpenWorkSettingsButton.addEventListener("click", () => navigateWorkDestination("settings").catch((error) => notify(error.message, true)));
elements.conceptBackToWorksButton.addEventListener("click", () => {
  showWorksHome();
});
elements.settingsOpenManuscriptsButton.addEventListener("click", () => {
  navigateWorkDestination("manuscript").catch((error) => notify(error.message, true));
});
elements.settingsOpenPlotsButton.addEventListener("click", () => navigateWorkDestination("plot").catch((error) => notify(error.message, true)));
elements.settingsOpenReferencesButton.addEventListener("click", () => navigateWorkDestination("reference").catch((error) => notify(error.message, true)));
elements.settingsOpenConceptMemosButton.addEventListener("click", () => navigateWorkDestination("concept").catch((error) => notify(error.message, true)));
elements.settingsBackToWorksButton.addEventListener("click", () => {
  showWorksHome();
});
async function deleteCurrentEditorItem(kind, button) {
  if (state.saving || state.syncing || state.deleting) return;
  const note = state.currentNote;
  const memo = state.currentConceptMemo;
  const item = kind === "concept" ? state.conceptFile : kind === "note" ? note?.item : state.currentFile;
  if (!item || (kind === "concept" && !memo)) return;
  const title = kind === "concept" ? memo.title || "無題メモ" : kind === "note" ? note.data.title || item.name : item.name;
  const label = kind === "concept" ? "構想メモ" : kind === "note" ? "ノート" : "原稿";
  if (!window.confirm(`${label}「${title}」を削除しますか？\n${kind === "concept" ? "このメモを削除します。他の構想メモは残ります。" : "クラウド上のファイルも削除します。"}\n未保存の変更も破棄されます。`)) return;
  const editor = kind === "concept" ? elements.conceptMemoEditorSection : kind === "note" ? elements.noteEditorSection : elements.readerSection;
  cancelAutoSave();
  stopExternalMonitor();
  state.deleting = true;
  state.saving = true;
  editor.inert = true;
  setBusy(button, true, "削除中…");
  let deleted = false;
  try {
    const noteFolder = kind === "note" ? await ensureNoteFolder(state.noteType) : null;
    const result = await deleteEditorItem(state.provider, {
      kind, item, raw: state.conceptOriginalContent, memoId: memo?.id,
    });
    deleted = true;
    if (kind === "concept") {
      if (result) {
        state.conceptFile = result.item;
        state.selectedWork.conceptFile = result.item;
        state.conceptDocument = result.document;
        state.conceptOriginalContent = result.raw;
      } else {
        state.conceptDocument.memos = state.conceptDocument.memos.filter((entry) => entry.id !== memo.id);
      }
      state.conceptLoadedAt = Date.now();
      state.currentConceptMemo = null;
    } else if (kind === "note") {
      invalidateFolderListing(noteFolder);
      state.noteEntriesCache.clear();
      await updateNoteIndex(item, note.data, { remove: true });
      await updateSharedWorkMetrics({ noteDelta: -1 });
      state.currentNote = null;
    } else {
      invalidateFolderListing(state.manuscriptFolder);
      await updateSharedWorkMetrics({ beforeContent: state.originalContent, afterContent: "" });
      removeRecentManuscript(item.id);
      state.currentFile = null;
      state.originalContent = "";
    }
    try {
      const recent = readRecentViews().filter((entry) => !(entry.route.workId === state.selectedWork.id
        && entry.cloudKind === state.cloudKind
        && (kind === "concept" ? entry.route.memoId === memo.id : entry.route.item?.id === item.id)));
      localStorage.setItem(recentViewsStorageKey(), JSON.stringify(recent));
      const workRecent = readWorkRecentViews().filter((entry) =>
        kind === "concept" ? entry.route.memoId !== memo.id : entry.route.item?.id !== item.id);
      localStorage.setItem(workRecentViewsStorageKey(), JSON.stringify(workRecent));
    } catch { /* 削除本体の成功を履歴の保存失敗で妨げない。 */ }
    state.dirty = false;
    state.externalConflict = false;
    state.deleting = false;
    state.saving = false;
    editor.hidden = true;
    renderInputAssistVisibility();
    notify(`${label}「${title}」を削除しました。`);
    if (kind === "concept") await openConceptMemos();
    else if (kind === "note") await openNotes(state.noteType);
    else await openManuscriptFolder(state.manuscriptFolder, state.manuscriptTrail);
  } catch (error) {
    notify(error.message || (deleted ? "削除後の一覧を更新できませんでした。" : `${label}を削除できませんでした。`), true);
  } finally {
    state.deleting = false;
    state.saving = false;
    editor.inert = false;
    setBusy(button, false);
    if (!deleted) {
      startExternalMonitor();
      if (state.dirty) scheduleAutoSave();
    }
  }
}

elements.deleteManuscriptButton.addEventListener("click", () => deleteCurrentEditorItem("manuscript", elements.deleteManuscriptButton));
elements.deleteNoteButton.addEventListener("click", () => deleteCurrentEditorItem("note", elements.deleteNoteButton));
elements.deleteConceptMemoButton.addEventListener("click", () => deleteCurrentEditorItem("concept", elements.deleteConceptMemoButton));

elements.backToFilesButton.addEventListener("click", async () => {
  if (!canDiscardDraft()) return;
  cancelAutoSave();
  stopExternalMonitor();
  state.currentFile = null;
  state.originalContent = "";
  state.dirty = false;
  try { await openManuscriptFolder(state.manuscriptFolder, state.manuscriptTrail); }
  catch (error) { notify(error.message || "原稿一覧を開けませんでした。", true); }
});

elements.readerContent.addEventListener("input", () => {
  if (elements.manuscriptSearchDialog) manuscriptSearchController.changed();
  state.dirty = elements.readerContent.value !== state.originalContent;
  elements.saveFileButton.disabled = !state.dirty;
  updateReaderMeta();
  setEditorStatus(state.dirty ? "未保存" : "保存済み", state.dirty ? "dirty" : "");
  if (state.dirty) scheduleAutoSave();
  else cancelAutoSave();
  if (elements.manuscriptPreviewDialog.open) renderManuscriptPreview();
});
elements.readerContent.addEventListener("scroll", () => {
  clearTimeout(state.readerScrollTimer);
  const isAwayFromTop = elements.readerContent.scrollTop > 8;
  elements.readerJumpControls.classList.toggle("is-scrolling", isAwayFromTop);
  if (isAwayFromTop) {
    state.readerScrollTimer = setTimeout(() => {
      elements.readerJumpControls.classList.remove("is-scrolling");
      state.readerScrollTimer = null;
    }, 1400);
  }
}, { passive: true });

elements.readerContent.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveCurrentFile();
  }
});
elements.readerCountMode.addEventListener("change", () => {
  state.countMode = elements.readerCountMode.value;
  localStorage.setItem(COUNT_MODE_KEY, state.countMode);
  updateReaderMeta();
});
elements.readerPreviewButton.addEventListener("click", openManuscriptPreview);
elements.closeManuscriptPreviewButton.addEventListener("click", () => elements.manuscriptPreviewDialog.close());
elements.readerBackupButton.addEventListener("click", () => {
  closeEditorOptions();
  openManuscriptBackupHistory();
});
elements.closeManuscriptBackupButton.addEventListener("click", () => elements.manuscriptBackupDialog.close());
elements.closeManuscriptBackupNotice.addEventListener("click", () => {
  elements.manuscriptBackupNotice.hidden = true;
  elements.manuscriptBackupNotice.dataset.tone = "";
});
elements.closeManuscriptBackupComparisonButton.addEventListener("click", closeManuscriptBackupComparison);
elements.cancelComparedBackupButton.addEventListener("click", closeManuscriptBackupComparison);
elements.restoreComparedBackupButton.addEventListener("click", () => {
  const storage = state.manuscriptBackupComparisonStorage;
  const entry = state.manuscriptBackupComparisonEntry;
  if (!storage || !entry) return notify("比較対象のバックアップを確認できませんでした。", true);
  restoreWebManuscriptBackup(storage, entry, elements.restoreComparedBackupButton).catch((error) => notify(error.message || "バックアップを復元できませんでした。", true));
});
elements.backupDiffPreviousButton.addEventListener("click", () => moveManuscriptBackupDiff(-1));
elements.backupDiffNextButton.addEventListener("click", () => moveManuscriptBackupDiff(1));
elements.backupDiffViewToggle.addEventListener("click", () => {
  state.manuscriptBackupDiffShowAll = !state.manuscriptBackupDiffShowAll;
  renderManuscriptBackupDiff();
});
elements.backupIntervalSelect.addEventListener("change", () => {
  state.manuscriptBackupIntervalMinutes = Number(elements.backupIntervalSelect.value) || 0;
  state.manuscriptAutomaticBackups.clear();
  localStorage.setItem(BACKUP_INTERVAL_KEY, String(state.manuscriptBackupIntervalMinutes));
  notify(state.manuscriptBackupIntervalMinutes
    ? `自動バックアップの間隔を${elements.backupIntervalSelect.selectedOptions[0].textContent}に変更しました。`
    : "自動バックアップを無効にしました。手動バックアップは利用できます。");
});
elements.createManuscriptBackupButton.addEventListener("click", async () => {
  setBusy(elements.createManuscriptBackupButton, true, "作成中…");
  try {
    const result = await createWebManuscriptBackup("manual");
    const target = currentBackupTarget();
    const targetLabel = target.targetType === "conceptMemo" ? "構想メモ" : target.targetType === "note" ? "ノート" : "原稿";
    notify(result.duplicate ? "同じ内容のバックアップがすでにあります。" : `${targetLabel}をバックアップしました。`);
    refreshBackupHistoryAfterSave("バックアップの作成処理が完了しました。");
  } catch (error) {
    notify(error.message || "バックアップを作成できませんでした。", true);
  } finally {
    setBusy(elements.createManuscriptBackupButton, false);
  }
});
elements.readerPreviewLauncher.addEventListener('toggle', () => {
  if (!elements.readerPreviewLauncher.open) elements.readerPreviewSettings.open = false;
});
elements.manuscriptPreviewMode.addEventListener("change", () => {
  state.manuscriptPreviewMode = elements.manuscriptPreviewMode.value === "vertical" ? "vertical" : "horizontal";
  localStorage.setItem(MANUSCRIPT_PREVIEW_MODE_KEY, state.manuscriptPreviewMode);
  elements.manuscriptPreviewLineCharactersWrap.hidden = state.manuscriptPreviewMode !== "vertical";
  elements.manuscriptPreviewAutoFitWrap.hidden = state.manuscriptPreviewMode !== "vertical";
  elements.manuscriptPreviewLineHeightWrap.hidden = state.manuscriptPreviewMode !== "vertical";
  wholeManuscriptController.settingsChanged();
});
elements.manuscriptPreviewFont.addEventListener("change", () => {
  applyManuscriptPreviewFont(elements.manuscriptPreviewFont.value);
  if (elements.manuscriptPreviewDialog.open) renderManuscriptPreview();
  wholeManuscriptController.settingsChanged();
});

elements.manuscriptPreviewFontSize.addEventListener("change", () => {
  const fontSize = Number(elements.manuscriptPreviewFontSize.value);
  state.manuscriptPreviewFontSize = MANUSCRIPT_PREVIEW_FONT_SIZES.includes(fontSize) ? fontSize : 15;
  elements.manuscriptPreviewFontSize.value = String(state.manuscriptPreviewFontSize);
  localStorage.setItem(MANUSCRIPT_PREVIEW_FONT_SIZE_KEY, String(state.manuscriptPreviewFontSize));
  if (elements.manuscriptPreviewDialog.open) renderManuscriptPreview();
  wholeManuscriptController.settingsChanged();
});
elements.manuscriptPreviewAutoFit.addEventListener("change", () => {
  state.manuscriptPreviewAutoFit = elements.manuscriptPreviewAutoFit.checked;
  elements.manuscriptPreviewLineCharacters.disabled = state.manuscriptPreviewAutoFit;
  localStorage.setItem(MANUSCRIPT_PREVIEW_AUTO_FIT_KEY, String(state.manuscriptPreviewAutoFit));
  if (elements.manuscriptPreviewDialog.open) renderManuscriptPreview();
  wholeManuscriptController.settingsChanged();
});
elements.manuscriptPreviewLineCharacters.addEventListener("change", () => {
  state.manuscriptPreviewLineCharacters = normalizePreviewLineCharacters(elements.manuscriptPreviewLineCharacters.value);
  elements.manuscriptPreviewLineCharacters.value = String(state.manuscriptPreviewLineCharacters);
  localStorage.setItem(MANUSCRIPT_PREVIEW_LINE_CHARACTERS_KEY, String(state.manuscriptPreviewLineCharacters));
  wholeManuscriptController.settingsChanged();
});
elements.manuscriptPreviewLineHeight.addEventListener("change", () => {
  state.manuscriptPreviewLineHeight = Number(elements.manuscriptPreviewLineHeight.value) || 1.9;
  localStorage.setItem(MANUSCRIPT_PREVIEW_LINE_HEIGHT_KEY, String(state.manuscriptPreviewLineHeight));
  if (elements.manuscriptPreviewDialog.open) renderManuscriptPreview();
  wholeManuscriptController.settingsChanged();
});
elements.manuscriptPreviewMode.value = state.manuscriptPreviewMode;
elements.manuscriptPreviewFontSize.value = String(state.manuscriptPreviewFontSize);
elements.manuscriptPreviewAutoFit.checked = state.manuscriptPreviewAutoFit;
elements.manuscriptPreviewLineCharacters.value = String(state.manuscriptPreviewLineCharacters);
elements.manuscriptPreviewLineCharacters.disabled = state.manuscriptPreviewAutoFit;
elements.manuscriptPreviewLineHeight.value = String(state.manuscriptPreviewLineHeight);
elements.manuscriptPreviewLineCharactersWrap.hidden = state.manuscriptPreviewMode !== "vertical";
elements.manuscriptPreviewAutoFitWrap.hidden = state.manuscriptPreviewMode !== "vertical";
elements.manuscriptPreviewLineHeightWrap.hidden = state.manuscriptPreviewMode !== "vertical";
elements.manuscriptPreviewContent.addEventListener("wheel", (event) => {
  if (state.manuscriptPreviewMode !== "vertical") return;
  const movement = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!movement) return;
  event.preventDefault();
  elements.manuscriptPreviewContent.scrollLeft -= movement;
}, { passive: false });
window.addEventListener("resize", () => {
  if (elements.manuscriptPreviewDialog.open && state.manuscriptPreviewMode === "vertical") fitVerticalManuscriptPreview();
}, { passive: true });
function updateInputAssistViewport() {
  const viewport = window.visualViewport;
  const active = document.activeElement;
  const textInput = active instanceof HTMLTextAreaElement
    || (active instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(active.type));
  const inEditor = [elements.readerSection, elements.noteEditorSection, elements.conceptMemoEditorSection]
    .some((section) => !section.hidden && section.contains(active));
  const editorFocused = textInput && inEditor && !active.readOnly && !active.disabled && !elements.inputAssistBar.hidden;
  const viewportBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
  const keyboardInset = editorFocused ? Math.max(0, window.innerHeight - viewportBottom) : 0;
  const keyboardVisible = keyboardInset > 120;
  document.documentElement.style.setProperty("--keyboard-inset", `${editorFocused ? Math.round(keyboardInset) : 0}px`);
  document.body.classList.toggle("keyboard-visible", keyboardVisible);
  document.body.classList.toggle("input-assist-editing", editorFocused);
  const assistBottom = elements.inputAssistBar.hidden ? 0
    : Math.max(0, Math.ceil(window.innerHeight - elements.inputAssistBar.getBoundingClientRect().top + 8));
  document.documentElement.style.setProperty("--preview-assist-bottom", `${assistBottom}px`);
}
let inputAssistViewportFrame = 0;
let inputAssistViewportTrackingUntil = 0;
function trackInputAssistViewport(duration = 800) {
  inputAssistViewportTrackingUntil = Math.max(inputAssistViewportTrackingUntil, Date.now() + duration);
  if (inputAssistViewportFrame) return;
  const track = () => {
    updateInputAssistViewport();
    if (Date.now() < inputAssistViewportTrackingUntil) {
      inputAssistViewportFrame = requestAnimationFrame(track);
    } else {
      inputAssistViewportFrame = 0;
    }
  };
  inputAssistViewportFrame = requestAnimationFrame(track);
}
window.addEventListener("resize", () => trackInputAssistViewport(), { passive: true });
window.visualViewport?.addEventListener("resize", () => trackInputAssistViewport(), { passive: true });
window.visualViewport?.addEventListener("scroll", () => trackInputAssistViewport(), { passive: true });
if (typeof ResizeObserver === "function") {
  const assistSizeObserver = new ResizeObserver(() => requestAnimationFrame(updateInputAssistViewport));
  assistSizeObserver.observe(elements.inputAssistBar);
}
document.addEventListener("focusin", () => trackInputAssistViewport(1000));
document.addEventListener("focusout", () => trackInputAssistViewport(500));
function jumpInManuscript(toEnd) {
  const position = toEnd ? elements.readerContent.value.length : 0;
  elements.readerContent.focus({ preventScroll: true });
  elements.readerContent.setSelectionRange(position, position);
  elements.readerContent.scrollTo({ top: toEnd ? elements.readerContent.scrollHeight : 0, behavior: "smooth" });
}
elements.jumpToTopButton.addEventListener("click", () => jumpInManuscript(false));
elements.jumpToBottomButton.addEventListener("click", () => jumpInManuscript(true));

elements.saveFileButton.addEventListener("click", () => saveCurrentFile());
elements.readerListButton.addEventListener("click", () => openEditorList("manuscript").catch((error) => notify(error.message, true)));
elements.readerNoteReferenceButton.addEventListener("click", toggleReaderNoteReference);
elements.closeReaderNoteReferenceButton.addEventListener("click", closeReaderNoteReference);
elements.readerNoteTypeSelect.addEventListener("change", () => {
  state.readerNoteReferenceId = "";
  loadReaderNoteReferences(elements.readerNoteTypeSelect.value).catch((error) => notify(error.message, true));
});
elements.readerNoteSelect.addEventListener("change", () => readerNoteReferenceController.chooseNote());
elements.readerNoteWorkSelect.addEventListener("change", () => readerNoteReferenceController.chooseSource().catch(error => notify(error.message, true)));
elements.noteListButton.addEventListener("click", () => openEditorList("note").catch((error) => notify(error.message, true)));
elements.conceptListButton.addEventListener("click", () => openEditorList("concept").catch((error) => notify(error.message, true)));
elements.closeEditorListButton.addEventListener("click", () => elements.editorListDialog.close());
elements.conceptEditorListToggle.addEventListener("change", () => {
  state.conceptEditorListVisible = elements.conceptEditorListToggle.checked;
  try { localStorage.setItem(CONCEPT_EDITOR_LIST_KEY, String(state.conceptEditorListVisible)); }
  catch { notify("表示設定をこのブラウザに保存できませんでした。", true); }
  renderConceptEditorList();
});
elements.conceptEditorListPanel.addEventListener("toggle", () => requestAnimationFrame(positionConceptEditorList));
window.addEventListener("resize", positionConceptEditorList, { passive: true });
window.visualViewport?.addEventListener("resize", positionConceptEditorList, { passive: true });
window.visualViewport?.addEventListener("scroll", positionConceptEditorList, { passive: true });
if (typeof ResizeObserver === "function") {
  const conceptListPositionObserver = new ResizeObserver(() => requestAnimationFrame(positionConceptEditorList));
  conceptListPositionObserver.observe(elements.conceptMemoEditorSection.querySelector(".reader-toolbar"));
  conceptListPositionObserver.observe(elements.inputAssistBar);
  conceptListPositionObserver.observe(elements.conceptEditorListPanel);
  conceptListPositionObserver.observe(elements.conceptNoteReferencePanel.querySelector(".reader-note-reference-heading"));
}
function toggleInputAssist() {
  state.inputAssistVisible = !state.inputAssistVisible;
  localStorage.setItem(INPUT_ASSIST_KEY, String(state.inputAssistVisible));
  renderInputAssistVisibility();
  if (state.inputAssistVisible) state.activeAssistTarget?.focus({ preventScroll: true });
}
function closeEditorOptions(except = null) {
  for (const options of document.querySelectorAll(".editor-options.open")) {
    if (options === except) continue;
    options.classList.remove("open");
    options.querySelector(".editor-options-panel")?.removeAttribute("style");
    options.querySelector(".editor-options-toggle")?.setAttribute("aria-expanded", "false");
  }
}
for (const button of document.querySelectorAll(".editor-recent-views-button")) button.addEventListener("click", openWorkRecentViews);
elements.closeWorkRecentViewsButton.addEventListener("click", () => elements.workRecentViewsDialog.close());
for (const toggle of document.querySelectorAll(".editor-options-toggle")) {
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const options = toggle.closest(".editor-options");
    const open = !options.classList.contains("open");
    closeEditorOptions(options);
    options.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) positionEditorOptionsPanels();
    else options.querySelector(".editor-options-panel")?.removeAttribute("style");
  });
}
for (const panel of document.querySelectorAll(".editor-options-panel")) {
  panel.addEventListener("click", (event) => event.stopPropagation());
  panel.addEventListener("change", () => closeEditorOptions());
  for (const action of panel.querySelectorAll(".editor-menu-icon, [data-close-editor-menu]")) action.addEventListener("click", () => closeEditorOptions());
}
document.addEventListener("click", (event) => {
  closeEditorOptions();
  if (elements.readerPreviewLauncher.open && !elements.readerPreviewLauncher.contains(event.target)) {
    elements.readerPreviewLauncher.open = false;
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.defaultPrevented) return;

  // Let the browser cancel the topmost modal. Its cancel handler may block closing during writes.
  if (document.querySelector("dialog:modal")) return;
  const dialogs = [...document.querySelectorAll("dialog[open]")];
  const dialog = event.target?.closest?.("dialog[open]") || document.activeElement?.closest?.("dialog[open]") || dialogs.at(-1);
  if (dialog) {
    event.preventDefault();
    dialog.close();
    return;
  }

  const editorOptions = document.querySelector(".editor-options.open");
  if (editorOptions) {
    closeEditorOptions();
    return;
  }

  if (elements.headerMenu.classList.contains("open")) {
    closeHeaderMenu();
    return;
  }

  const popupDetails = [...document.querySelectorAll(".multi-filter[open], .count-mode-details[open], .reader-preview-launcher[open], #editorFooterMenu[open]")].at(-1);
  if (popupDetails) {
    popupDetails.open = false;
    return;
  }

  if (state.noteTocOpen) {
    state.noteTocOpen = false;
    elements.noteToc.hidden = true;
    elements.noteTocToggle.setAttribute("aria-expanded", "false");
    return;
  }

  if (!elements.readerNoteReferencePanel.hidden) {
    closeReaderNoteReference();
    return;
  }
  if (!elements.conceptNoteReferencePanel.hidden) closeConceptNoteReference();
});
elements.inputAssistToggle.addEventListener("click", toggleInputAssist);
elements.noteInputAssistToggle.addEventListener("click", toggleInputAssist);
elements.conceptInputAssistToggle.addEventListener("click", toggleInputAssist);
function preserveAssistSelection(event) {
  if (event.target.closest("button")) event.preventDefault();
}

function handleInputAssistClick(event) {
  const button = event.target.closest("button[data-assist-kind]");
  if (!button) return;
  const target = state.activeAssistTarget || elements.readerContent;
  if (!(target instanceof HTMLTextAreaElement)) return;
  applyInputAssistToTextarea(target, {
    kind: ["wrap", "ruby", "emphasis", "unwrap"].includes(button.dataset.assistKind) ? button.dataset.assistKind : "insert",
    text: button.dataset.assistText || "",
    open: button.dataset.assistOpen || "",
    close: button.dataset.assistClose || "",
  });
  if (elements.inputAssistSymbolsMenu.contains(button)) {
    elements.inputAssistSymbolsMenu.hidden = true;
    elements.inputAssistSymbolsButton.setAttribute("aria-expanded", "false");
  }
}

elements.inputAssistBar.addEventListener("pointerdown", preserveAssistSelection);
elements.inputAssistSymbolsMenu.addEventListener("pointerdown", preserveAssistSelection);
elements.inputAssistBar.addEventListener("click", handleInputAssistClick);
elements.inputAssistSymbolsMenu.addEventListener("click", handleInputAssistClick);
elements.inputAssistSymbolsButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = elements.inputAssistSymbolsMenu.hidden;
  elements.inputAssistSymbolsMenu.hidden = !open;
  elements.inputAssistSymbolsButton.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (event) => {
  if (elements.inputAssistSymbolsMenu.hidden) return;
  if (elements.inputAssistSymbolsMenu.contains(event.target)) return;
  elements.inputAssistSymbolsMenu.hidden = true;
  elements.inputAssistSymbolsButton.setAttribute("aria-expanded", "false");
});
renderMemoAutoReflectDefaults();
for (const [control, direction] of [[elements.noteAutoReflectToggle, "note"], [elements.conceptAutoReflectToggle, "concept"]]) {
  control.addEventListener("change", () => changeMemoAutoReflectDefault(direction, control.checked));
}

elements.autoSaveToggle.addEventListener("change", () => {
  state.autoSaveEnabled = elements.autoSaveToggle.checked;
  localStorage.setItem(AUTO_SAVE_KEY, String(state.autoSaveEnabled));
  notify(state.autoSaveEnabled ? "自動保存をONにしました。" : "自動保存をOFFにしました。");
  if (state.autoSaveEnabled) scheduleAutoSave();
  else cancelAutoSave();
});
elements.noteAutoSaveToggle.addEventListener("change", () => {
  state.autoSaveEnabled = elements.noteAutoSaveToggle.checked;
  elements.autoSaveToggle.checked = state.autoSaveEnabled;
  localStorage.setItem(AUTO_SAVE_KEY, String(state.autoSaveEnabled));
  notify(state.autoSaveEnabled ? "自動保存をONにしました。" : "自動保存をOFFにしました。");
  if (state.autoSaveEnabled) scheduleAutoSave();
  else cancelAutoSave();
});
elements.conceptAutoSaveToggle.addEventListener("change", () => {
  state.autoSaveEnabled = elements.conceptAutoSaveToggle.checked;
  elements.autoSaveToggle.checked = state.autoSaveEnabled;
  elements.noteAutoSaveToggle.checked = state.autoSaveEnabled;
  localStorage.setItem(AUTO_SAVE_KEY, String(state.autoSaveEnabled));
  notify(state.autoSaveEnabled ? "自動保存をONにしました。" : "自動保存をOFFにしました。");
  if (state.autoSaveEnabled) scheduleAutoSave();
  else cancelAutoSave();
});
elements.settingsAutoSaveToggle.addEventListener("change", () => {
  state.autoSaveEnabled = elements.settingsAutoSaveToggle.checked;
  elements.autoSaveToggle.checked = state.autoSaveEnabled;
  elements.noteAutoSaveToggle.checked = state.autoSaveEnabled;
  elements.conceptAutoSaveToggle.checked = state.autoSaveEnabled;
  localStorage.setItem(AUTO_SAVE_KEY, String(state.autoSaveEnabled));
  notify(state.autoSaveEnabled ? "自動保存をONにしました。" : "自動保存をOFFにしました。");
  if (state.autoSaveEnabled) scheduleAutoSave();
  else cancelAutoSave();
});

elements.saveWorkSettingsButton.addEventListener("click", () => saveCurrentWorkSettings());
for (const [control, field] of [
  [elements.workTitleInput, "title"],
  [elements.workSubtitleInput, "subtitle"],
  [elements.workStatusSelect, "status"],
  [elements.workPenNameInput, "penName"],
  [elements.workDeadlineInput, "deadline"],
  [elements.workSummaryInput, "summary"],
  [elements.workMemoInput, "memo"],
]) {
  control.addEventListener("input", () => {
    if (!state.currentSettings) return;
    state.currentSettings.data[field] = control.value;
    markWorkSettingsDirty();
  });
}
elements.workTargetCharsInput.addEventListener("input", () => {
  if (!state.currentSettings) return;
  state.currentSettings.data.targetChars = Math.max(0, Number(elements.workTargetCharsInput.value || 0) || 0);
  markWorkSettingsDirty();
});
elements.workGenresInput.addEventListener("input", () => {
  if (!state.currentSettings) return;
  state.currentSettings.data.genres = normalizeGenres(elements.workGenresInput.value);
  state.currentSettings.data.genre = state.currentSettings.data.genres.join(", ");
  markWorkSettingsDirty();
});
for (const [field, id] of WORK_EXPORT_CONTROLS) {
  elements[id].addEventListener("change", () => {
    if (!state.currentSettings) return;
    state.currentSettings.data.exportOptions[field] = elements[id].checked;
    markWorkSettingsDirty();
  });
}
elements.openRelatedWorksButton.addEventListener("click", () => relatedWorksController.open().catch(error => notify(error.message, true)));

elements.workSettingsSection.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveCurrentWorkSettings();
  }
});

elements.conceptMemoEditorSection.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveCurrentConceptMemo();
  }
});

elements.noteEditorSection.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveCurrentNote();
  }
});

function resetConceptPageAndRender() {
  state.conceptPage = 1;
  renderConceptMemosList();
}
elements.conceptSearchInput.addEventListener("input", resetConceptPageAndRender);
for (const control of [elements.conceptStatusFilter, elements.conceptSortField, elements.conceptNoteFilter]) {
  control.addEventListener("change", () => {
    if (control === elements.conceptNoteFilter) {
      state.viewPreferences.conceptNotes = { ...state.viewPreferences.conceptNotes, [conceptNotePreferenceKey()]: control.value };
    }
    if (control === elements.conceptSortField && control.value === "noteOrder") {
      elements.conceptSortDirection.dataset.direction = "asc";
      elements.conceptSortDirection.textContent = "昇順 ↑";
    }
    persistViewPreferences();
    resetConceptPageAndRender();
  });
}
elements.conceptFolderFilter.addEventListener("change", () => {
  updateMultiFilterLabel(elements.conceptFolderFilterOptions, elements.conceptFolderFilterLabel);
  persistViewPreferences();
  resetConceptPageAndRender();
});
elements.conceptFolderFilterOptions.addEventListener("click", (event) => {
  if (!event.target.closest('[data-clear-multi="concept-folder-filter"]')) return;
  setCheckedValues(elements.conceptFolderFilterOptions, []);
  updateMultiFilterLabel(elements.conceptFolderFilterOptions, elements.conceptFolderFilterLabel);
  persistViewPreferences();
  resetConceptPageAndRender();
});
elements.conceptTagFilter.addEventListener("change", () => {
  updateMultiFilterLabel(elements.conceptTagFilterOptions, elements.conceptTagFilterLabel);
  persistViewPreferences();
  resetConceptPageAndRender();
});
elements.conceptTagFilterOptions.addEventListener("click", (event) => {
  if (!event.target.closest('[data-clear-multi="concept"]')) return;
  setCheckedValues(elements.conceptTagFilterOptions, []);
  updateMultiFilterLabel(elements.conceptTagFilterOptions, elements.conceptTagFilterLabel);
  persistViewPreferences();
  resetConceptPageAndRender();
});
const multiFilters = [elements.workStatusFilter, elements.conceptFolderFilter, elements.conceptTagFilter, elements.conceptMemoFolderSelect];
for (const filter of multiFilters) {
  filter.addEventListener("toggle", () => {
    if (!filter.open) return;
    multiFilters.filter((candidate) => candidate !== filter).forEach((candidate) => { candidate.open = false; });
  });
}
document.addEventListener("click", (event) => {
  if (event.target.closest(".multi-filter")) return;
  multiFilters.forEach((filter) => { filter.open = false; });
});
elements.conceptSortDirection.addEventListener("click", () => {
  const ascending = elements.conceptSortDirection.dataset.direction !== "asc";
  elements.conceptSortDirection.dataset.direction = ascending ? "asc" : "desc";
  elements.conceptSortDirection.textContent = ascending ? "昇順 ↑" : "降順 ↓";
  persistViewPreferences();
  resetConceptPageAndRender();
});
elements.conceptPreviousPageButton.addEventListener("click", () => {
  if (state.conceptPage <= 1) return;
  state.conceptPage -= 1;
  renderConceptMemosList();
  elements.conceptMemosCount.scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.conceptNextPageButton.addEventListener("click", () => {
  state.conceptPage += 1;
  renderConceptMemosList();
  elements.conceptMemosCount.scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.conceptJumpToTopButton.addEventListener("click", () => {
  elements.conceptMemosSection.scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.conceptJumpToBottomButton.addEventListener("click", () => {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
});
elements.noteJumpToTopButton.addEventListener("click", () => {
  elements.noteEditorSection.scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.noteJumpToBottomButton.addEventListener("click", () => {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
});
window.addEventListener("scroll", () => {
  updateCurrentNoteGroupIndicator();
  if (window.innerWidth <= 1000) {
    const isAwayFromTop = window.scrollY > 8;
    if (!elements.conceptMemosSection.hidden) {
      clearTimeout(state.conceptScrollTimer);
      elements.conceptListJumpControls.classList.toggle("is-scrolling", isAwayFromTop);
      if (isAwayFromTop) {
        state.conceptScrollTimer = setTimeout(() => {
          elements.conceptListJumpControls.classList.remove("is-scrolling");
          state.conceptScrollTimer = null;
        }, 1400);
      }
    }
    if (!elements.noteEditorSection.hidden) {
      clearTimeout(state.noteScrollTimer);
      elements.noteJumpControls.classList.toggle("is-scrolling", isAwayFromTop);
      if (isAwayFromTop) {
        state.noteScrollTimer = setTimeout(() => {
          elements.noteJumpControls.classList.remove("is-scrolling");
          state.noteScrollTimer = null;
        }, 1400);
      }
    }
  }
}, { passive: true });
window.addEventListener("resize", updateCurrentNoteGroupIndicator, { passive: true });
elements.newConceptMemoButton.addEventListener("click", () => {
  if (!state.conceptDocument) return;
  const orders = state.conceptDocument.memos.map((memo) => Number(memo.order)).filter(Number.isFinite);
  const memo = createConceptMemo({ order: orders.length ? Math.max(...orders) + 1 : 0 });
  state.conceptDocument.memos.push(memo);
  openConceptMemo(memo.id);
  markConceptDirty();
  elements.conceptMemoTitleInput.focus();
});
elements.backToConceptMemosButton.addEventListener("click", () => {
  if (!canDiscardDraft()) return;
  try { restoreSavedConceptDraft(); }
  catch (error) { notify(error.message || "保存済みの構想メモを確認できません。", true); return; }
  cancelAutoSave();
  stopExternalMonitor();
  state.currentConceptMemo = null;
  state.dirty = false;
  elements.conceptMemoEditorSection.hidden = true;
  elements.conceptMemosSection.hidden = false;
  renderConceptMemosList();
  resetPageScroll();
  renderInputAssistVisibility();
  commitRoute(routeForWork("concept-list"));
});
elements.conceptListSaveButton.addEventListener("click", () => saveCurrentConceptMemo());
elements.saveConceptMemoButton.addEventListener("click", () => saveCurrentConceptMemo());
elements.conceptMemoBackupButton.addEventListener("click", async () => {
  closeEditorOptions();
  if (state.saving || state.syncing || state.dirty) return notify("保存・反映が終わってからバックアップを開いてください。", true);
  if (!state.conceptFile || !state.conceptDocument) return notify("構想メモの読み込みが完了してからバックアップを開いてください。", true);
  await openBackupHistory(conceptMemoBackupTarget());
});
elements.conceptMemoTitleInput.addEventListener("input", () => {
  if (!state.currentConceptMemo) return;
  state.currentConceptMemo.title = elements.conceptMemoTitleInput.value;
  markConceptDirty();
});
elements.conceptMemoBodyInput.addEventListener("focus", () => {
  state.activeAssistTarget = elements.conceptMemoBodyInput;
});
elements.conceptMemoBodyInput.addEventListener("input", () => {
  if (!state.currentConceptMemo) return;
  applyMemoEditableText(state.currentConceptMemo, elements.conceptMemoBodyInput.value);
  markConceptDirty();
});
elements.conceptMemoTypeSelect.addEventListener("change", () => {
  if (!state.currentConceptMemo) return;
  const text = elements.conceptMemoBodyInput.value;
  state.currentConceptMemo.type = elements.conceptMemoTypeSelect.value;
  applyMemoEditableText(state.currentConceptMemo, text);
  elements.conceptMemoBodyInput.value = memoEditableText(state.currentConceptMemo);
  updateConceptBodyLabel();
  markConceptDirty();
});
elements.conceptMemoFolderOptions.addEventListener("change", () => {
  if (!state.currentConceptMemo) return;
  const folderIds = checkedValues(elements.conceptMemoFolderOptions);
  state.currentConceptMemo.folderIds = folderIds;
  state.currentConceptMemo.folderId = folderIds[0] || "";
  updateMultiFilterLabel(elements.conceptMemoFolderOptions, elements.conceptMemoFolderLabel, "未分類");
  markConceptDirty();
});
elements.conceptMemoFolderOptions.addEventListener("click", (event) => {
  if (!event.target.closest('[data-clear-multi="concept-folders"]')) return;
  event.preventDefault();
  setCheckedValues(elements.conceptMemoFolderOptions, []);
  if (state.currentConceptMemo) {
    state.currentConceptMemo.folderIds = [];
    state.currentConceptMemo.folderId = "";
    markConceptDirty();
  }
  updateMultiFilterLabel(elements.conceptMemoFolderOptions, elements.conceptMemoFolderLabel, "未分類");
});
elements.conceptMemoTagsInput.addEventListener("input", () => {
  if (!state.currentConceptMemo) return;
  state.currentConceptMemo.tags = elements.conceptMemoTagsInput.value.split(/[,、]/).map((tag) => tag.trim()).filter(Boolean);
  markConceptDirty();
});
elements.conceptMemoTagsInput.addEventListener("change", () => rememberTags(parseTags(elements.conceptMemoTagsInput.value)));
elements.conceptTagHistoryButton.addEventListener("click", () => openTagHistory(elements.conceptMemoTagsInput));
elements.closeTagHistoryButton.addEventListener("click", () => elements.tagHistoryDialog.close());
for (const [control, field] of [
  [elements.conceptMemoPinnedInput, "isPinned"],
  [elements.conceptMemoArchivedInput, "isArchived"],
  [elements.conceptMemoDashboardInput, "showInDashboard"],
]) {
  control.addEventListener("change", () => {
    if (!state.currentConceptMemo) return;
    state.currentConceptMemo[field] = control.checked;
    markConceptDirty();
  });
}
elements.conceptMemoAutoReflectInput.addEventListener("change", () => {
  const source = state.currentConceptMemo?.source;
  if (source?.kind !== "noteItem") return;
  setAutoReflectSelection(source, "autoSyncToNoteItem", "autoSyncToNoteItemOverride", elements.conceptMemoAutoReflectInput.value);
  renderConceptAutoReflectSetting();
  markConceptDirty();
});

for (const button of [elements.previewConceptSourceButton, elements.previewConceptSourceMenuButton]) button.addEventListener("click", () => {
  if (elements.conceptNoteReferencePanel.hidden) previewConceptSourceNote();
  else closeConceptNoteReference();
});
elements.closeConceptNoteReferenceButton.addEventListener("click", closeConceptNoteReference);
elements.openConceptSourceNoteButton.addEventListener("click", openConceptSourceNote);

elements.applyConceptToNoteButton.addEventListener("click", async () => {
  try {
    setBusy(elements.applyConceptToNoteButton, true, "反映中…");
    if (state.dirty) await saveCurrentConceptMemo();
    if (state.dirty || state.externalConflict) return;
    await syncCurrentConceptMemo({ forceDirection: "concept-to-note" });
  } catch (error) {
    notify(error.message || "項目メモへ反映できませんでした。", true);
  } finally {
    setBusy(elements.applyConceptToNoteButton, false);
  }
});

elements.noteSearchInput.addEventListener("input", renderNotesList);
elements.noteTocToggle.addEventListener("click", () => {
  state.noteTocOpen = !state.noteTocOpen;
  if (state.noteTocOpen) renderNoteToc();
  elements.noteToc.hidden = !state.noteTocOpen;
  elements.noteTocToggle.setAttribute("aria-expanded", String(state.noteTocOpen));
});
elements.toggleNoteItemsButton.addEventListener("click", () => toggleNoteDisclosures("entry"));
elements.toggleNoteMemosButton.addEventListener("click", () => toggleNoteDisclosures("memo"));
elements.backToNotesButton.addEventListener("click", () => {
  if (!canDiscardDraft()) return;
  cancelAutoSave();
  stopExternalMonitor();
  state.currentNote = null;
  state.dirty = false;
  elements.noteEditorSection.hidden = true;
  elements.notesSection.hidden = false;
  renderInputAssistVisibility();
  openNotes(state.noteType).catch((error) => notify(error.message, true));
});
elements.saveNoteButton.addEventListener("click", () => saveCurrentNote());
elements.noteBackupButton.addEventListener("click", async () => {
  closeEditorOptions();
  if (state.dirty) await saveCurrentNote();
  if (!state.dirty && state.currentNote) await openBackupHistory(noteBackupTarget());
});
elements.noteTitleInput.addEventListener("input", () => {
  if (!state.currentNote) return;
  state.currentNote.data.title = elements.noteTitleInput.value;
  markNoteDirty();
  if (elements.notePreviewDialog.open) refreshNoteDerivedViews();
});
elements.noteGroups.addEventListener("focusin", (event) => {
  if (event.target instanceof HTMLTextAreaElement) state.activeAssistTarget = event.target;
});
elements.noteGroups.addEventListener("input", (event) => {
  const control = event.target.closest("[data-note-field]");
  if (!control || !state.currentNote) return;
  const group = state.currentNote.data.groups[Number(control.dataset.groupIndex)];
  const item = control.dataset.itemIndex == null ? null : group?.items?.[Number(control.dataset.itemIndex)];
  switch (control.dataset.noteField) {
    case "group-title": group.title = control.value; break;
    case "divider-label": item.label = control.value; break;
    case "divider-value": item.value = control.value; break;
    case "entry-heading": item.heading = control.value; break;
    case "entry-heading-ruby": item.headingRuby = control.value; break;
    case "entry-body": item.body = control.value; break;
    case "entry-memo":
      item.memo ||= createNoteEntry().memo;
      item.memo.body = control.value;
      item.memo.updatedAt = new Date().toISOString();
      break;
    case "entry-auto-reflect":
      item.memo ||= createNoteEntry().memo;
      setAutoReflectSelection(item.memo, "autoSyncToConceptMemo", "autoSyncToConceptMemoOverride", control.value);
      break;
    case "entry-tags":
      item.memo ||= createNoteEntry().memo;
      item.memo.tags = control.value.split(/[,、]/).map((tag) => tag.trim()).filter(Boolean);
      item.memo.updatedAt = new Date().toISOString();
      break;
  }
  if (["entry-memo", "entry-tags"].includes(control.dataset.noteField) && item?.memo) {
    const summary = control.closest(".note-item")?.querySelector(".note-memo-details > summary");
    let badge = summary?.querySelector(".memo-present");
    const hasMemo = Boolean(String(item.memo.body || "").trim() || item.memo.tags?.length);
    if (hasMemo && summary && !badge) {
      badge = makeElement("span", "memo-present", "入力あり");
      summary.append(badge);
    } else if (!hasMemo) badge?.remove();
  }
  markNoteDirty();
  if (control.dataset.noteField === "group-title") {
    updateNoteGroupMoveLabels(Number(control.dataset.groupIndex));
    updateCurrentNoteGroupIndicator();
  }
  if (state.noteTocOpen || elements.notePreviewDialog.open) refreshNoteDerivedViews();
});
elements.noteGroups.addEventListener("change", (event) => {
  const control = event.target.closest('[data-note-field="entry-tags"]');
  if (control) rememberTags(parseTags(control.value));
});
elements.noteGroups.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-note-action]");
  if (!button || !state.currentNote || state.saving || state.syncing) return;
  const groupIndex = Number(button.dataset.groupIndex);
  const group = state.currentNote.data.groups[groupIndex];
  const itemIndex = Number(button.dataset.itemIndex);
  if (button.dataset.noteAction === "insert-group-after") {
    if (group) insertNoteGroup(groupIndex + 1);
    return;
  }
  if (["sync-concept", "create-concept"].includes(button.dataset.noteAction)) {
    try {
      setBusy(button, true, "反映中…");
      if (state.dirty) await saveCurrentNote({ skipConceptSync: true });
      if (state.dirty || state.externalConflict) return;
      if (button.dataset.noteAction === "create-concept") await createConceptFromNoteItem(groupIndex, itemIndex);
      else await reflectNoteItemToConceptMemos(groupIndex, itemIndex);
    } catch (error) {
      notify(error.message || "構想メモへ反映できませんでした。", true);
    } finally {
      setBusy(button, false);
    }
    return;
  }
  if (button.dataset.noteAction === "add-related") {
    await openRelatedNoteDialog(groupIndex, itemIndex).catch((error) => notify(error.message, true));
    return;
  }
  if (button.dataset.noteAction === "open-related") {
    const link = group?.items?.[itemIndex]?.relatedReferences?.[Number(button.dataset.relationIndex)];
    if (link) await openRelatedTarget(link).catch((error) => notify(error.message, true));
    return;
  }
  if (button.dataset.noteAction === "remove-related") {
    group?.items?.[itemIndex]?.relatedReferences?.splice(Number(button.dataset.relationIndex), 1);
  }
  if (button.dataset.noteAction === "add-entry") group.items.push(createNoteEntry());
  if (button.dataset.noteAction === "add-divider") group.items.push(createNoteDivider());
  if (button.dataset.noteAction === "insert-entry-after") group.items.splice(itemIndex + 1, 0, createNoteEntry());
  if (button.dataset.noteAction === "insert-divider-after") group.items.splice(itemIndex + 1, 0, createNoteDivider());
  if (button.dataset.noteAction === "move-item-up") moveNoteItem(group.items, itemIndex, itemIndex - 1);
  if (button.dataset.noteAction === "move-item-down") moveNoteItem(group.items, itemIndex, itemIndex + 1);
  if (button.dataset.noteAction === "move-item-group") {
    const targetValue = button.closest(".note-item-group-move")?.querySelector("select")?.value ?? "";
    const targetGroupIndex = targetValue === "" ? Number.NaN : Number(targetValue);
    if (!moveNoteItemToGroup(state.currentNote.data.groups, groupIndex, itemIndex, targetGroupIndex)) {
      notify("移動先の大分類を選択してください。", true);
      return;
    }
  }
  if (button.dataset.noteAction === "remove-item") group.items.splice(itemIndex, 1);
  if (button.dataset.noteAction === "remove-group") {
    if (state.currentNote.data.groups.length <= 1) {
      notify("大分類は1つ以上必要です。", true);
      return;
    }
    state.currentNote.data.groups.splice(groupIndex, 1);
  }
  renderNoteEditor();
  markNoteDirty();
});
function insertNoteGroup(index) {
  const note = state.currentNote;
  if (!note || state.saving || state.syncing || state.deleting) return;
  if (!Number.isInteger(index) || index < 0 || index > note.data.groups.length) return;
  const added = createNote(state.noteType).groups[0];
  note.data.groups.splice(index, 0, added);
  renderNoteEditor();
  markNoteDirty();
  requestAnimationFrame(() => {
    if (state.currentNote !== note || elements.noteEditorSection.hidden) return;
    const currentIndex = note.data.groups.indexOf(added);
    if (currentIndex < 0) return;
    const group = document.getElementById(`note-group-${currentIndex}`);
    group?.scrollIntoView({ behavior: "smooth", block: "center" });
    group?.querySelector(".note-group-title")?.focus({ preventScroll: true });
  });
}

function addNoteGroup() {
  if (state.currentNote) insertNoteGroup(state.currentNote.data.groups.length);
}

elements.addNoteGroupButton.addEventListener("click", addNoteGroup);


function setupNewDocumentDialog(kind) {
  const isNote = kind === "note";
  const prefix = isNote ? "newNote" : "newFile";
  const dialog = elements[`${prefix}Dialog`];
  const form = elements[`${prefix}Form`];
  const titleInput = elements[isNote ? "newNoteTitleInput" : "newFileNameInput"];
  const submitButton = elements[isNote ? "createNoteButton" : "createFileButton"];
  const errorNode = elements[`${prefix}Error`];
  const input = document.getElementById(`${prefix}ImportInput`);
  const dropZone = document.getElementById(`${prefix}ImportDropZone`);
  const clearButton = document.getElementById(`${prefix}ImportClear`);
  const status = document.getElementById(`${prefix}ImportStatus`);
  const preview = document.getElementById(`${prefix}ImportPreview`);
  const previewText = document.getElementById(`${prefix}ImportText`);
  const warnings = document.getElementById(`${prefix}ImportWarnings`);
  const destinationField = isNote ? document.getElementById("newNoteImportDestinationField") : null;
  const destinationSelect = isNote ? document.getElementById("newNoteImportDestination") : null;
  const choices = isNote ? document.getElementById("newNoteImportChoices") : null;
  const titleField = isNote ? document.getElementById("newNoteTitleField") : null;
  const dialogTitle = isNote ? document.getElementById("newNoteDialogTitle") : null;
  const executionHint = isNote ? document.getElementById("newNoteImportResult") : null;
  const replacePanel = isNote ? document.getElementById("newNoteImportReplacePanel") : null;
  const replaceTarget = isNote ? document.getElementById("newNoteImportReplaceTarget") : null;
  const replaceConfirmed = isNote ? document.getElementById("newNoteImportReplaceConfirmed") : null;
  let reviewedReplacement;
  const comparison = isNote ? document.getElementById("newNoteImportComparison") : null;
  const comparisonSummary = isNote ? document.getElementById("newNoteImportComparisonSummary") : null;
  const comparisonRows = isNote ? document.getElementById("newNoteImportComparisonRows") : null;
  const comparisonPage = isNote ? document.getElementById("newNoteImportComparisonPage") : null;
  const comparisonPrevious = isNote ? document.getElementById("newNoteImportComparisonPrevious") : null;
  const comparisonNext = isNote ? document.getElementById("newNoteImportComparisonNext") : null;
  let choiceControls = [];
  let comparedDestination;
  let comparisonData;
  let pageIndex = 0;
  let destinationContent;
  let draft;
  let context;
  let dragDepth = 0;
  function canRead() {
    return draft?.current() && !draft.busy && !draft.reading && !draft.created
      && !state.saving && !state.syncing && !state.deleting;
  }
  function resetDrop() {
    dragDepth = 0;
    dropZone.classList.remove("is-dragover");
  }
  const fileDrag = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
  function node(tag, className, text = "") {
    const element = document.createElement(tag);
    element.className = className; element.textContent = text;
    return element;
  }
  function renderComparison() {
    if (!comparisonData || !comparison.open) return;
    const page = templateComparisonPage(comparisonData, pageIndex);
    comparisonRows.replaceChildren();
    comparisonRows.scrollTop = 0;
    for (const row of page.rows) {
      if (row.type === "gap") { comparisonRows.append(node("p", "template-diff-gap", `…共通の${row.omitted}行を省略`)); continue; }
      const line = node("div", `template-diff-row is-${row.type}`);
      for (const side of row.type === "equal" ? ["equal"] : ["old", "new"]) {
        if ((row.type === "insert" && side === "old") || (row.type === "delete" && side === "new")) continue;
        const cell = node("div", `template-diff-cell ${side}`);
        cell.append(node("span", "template-diff-label", side === "equal" ? "共通" : side === "old" ? "Webの内容" : "Markdownの内容"),
          node("pre", "", (side === "new" ? row.newText : row.oldText) || " "));
        line.append(cell);
      }
      comparisonRows.append(line);
    }
    comparisonPage.textContent = `${page.index + 1} / ${page.pages}`;
    comparisonPrevious.disabled = draft.busy || draft.reading || page.index === 0;
    comparisonNext.disabled = draft.busy || draft.reading || page.index === page.pages - 1;
  }
  comparison?.addEventListener("toggle", () => {
    renderComparison();
    if (comparison.open) comparisonSummary.scrollIntoView({ block: "start" });
  });
  comparisonPrevious?.addEventListener("click", () => { pageIndex--; renderComparison(); comparisonSummary.scrollIntoView({ block: "nearest" }); });
  comparisonNext?.addEventListener("click", () => { pageIndex++; renderComparison(); comparisonSummary.scrollIntoView({ block: "nearest" }); });

  function update() {
    const busy = draft.busy || draft.reading;
    dropZone.setAttribute("aria-disabled", String(!canRead()));
    for (const control of form.querySelectorAll("input, select, button")) {
      control.disabled = busy || (!!draft.created && control !== submitButton && control.value !== "cancel");
    }
    const imported = draft.content;
    if (dialogTitle) dialogTitle.textContent = imported ? "ノートの読み込み" : "新規ノート";
    if (destinationField) {
      destinationField.hidden = !imported?.generated;
      if (imported !== destinationContent) {
        destinationContent = imported;
        destinationSelect.replaceChildren();
        choices.replaceChildren();
        replaceTarget.replaceChildren();
        const emptyTarget = document.createElement("option"); emptyTarget.value = ""; emptyTarget.textContent = "選択してください"; replaceTarget.append(emptyTarget);
        replaceConfirmed.checked = false;
        choiceControls = [];
        for (const option of imported?.destinations || []) {
          const node = document.createElement("option");
          node.value = option.value; node.textContent = option.label;
          destinationSelect.append(node);
          if (option.mode === "replace") {
            const target = document.createElement("option"); target.value = option.value; target.textContent = option.label; replaceTarget.append(target);
            continue;
          }
          if (option.mode === "choose") continue;
          const presentation = templateDestinationPresentation(option, imported);
          const label = document.createElement("label"); label.className = "template-destination-choice";
          const radio = document.createElement("input"); radio.type = "radio"; radio.name = "note-template-destination"; radio.value = option.value;
          const words = document.createElement("span");
          const heading = document.createElement("strong"); heading.textContent = presentation.title;
          const detail = document.createElement("span"); detail.textContent = presentation.detail;
          words.append(heading, detail); label.append(radio, words); choices.append(label);
          radio.addEventListener("change", () => { if (radio.checked) { destinationSelect.value = radio.value === "replace" ? replaceTarget.value || "replace" : radio.value; update(); } });
          choiceControls.push(radio);
        }
      }
    }
    const destination = imported?.destinations?.find((option) => option.value === destinationSelect?.value);
    for (const radio of choiceControls) { radio.checked = radio.value === destinationSelect.value || (radio.value === "replace" && destination?.mode === "replace"); radio.disabled = busy || !!draft.created; }
    if (replacePanel) {
      replacePanel.hidden = !["replace", "replace-select"].includes(destination?.mode);
      if (destination !== reviewedReplacement) { reviewedReplacement = destination; replaceConfirmed.checked = false; }
    }
    if (titleField) titleField.hidden = !!destination && destination.mode !== "new";
    if (comparison) {
      comparison.hidden = !destination?.entry;
      if (destination !== comparedDestination) {
        comparedDestination = destination;
        pageIndex = 0;
        comparisonRows.replaceChildren();
        comparisonData = destination?.entry ? createTemplateComparison(destination.entry.data, imported.note, { details: imported.generated?.version >= 3, attachments: imported.generated?.version >= 4 }) : null;
        if (comparisonData) {
          const summary = comparisonData.summary;
          comparisonSummary.textContent = summary.changed + summary.inserted + summary.deleted
            ? `Webの内容と比較：変更 ${summary.changed}・追加 ${summary.inserted}・削除 ${summary.deleted}行`
            : "Webの内容と比較：読み込む内容は同じです";
        }
      }
      renderComparison();
    }
    submitButton.disabled ||= ["choose", "replace-select"].includes(destination?.mode) || (destination?.mode === "replace" && !replaceConfirmed.checked);
    titleInput.disabled ||= !!destination && destination.mode !== "new";
    const action = destination ? templateDestinationPresentation(destination, imported).action : "作成して開く";
    if (executionHint) executionHint.textContent = destination ? templateDestinationPresentation(destination, imported).result : "内容を確認してから実行してください。";
    submitButton.textContent = draft.busy ? "処理中…" : draft.reading ? "読込中…" : draft.created ? (draft.created.operation && draft.created.operation !== "new" ? "処理済みを開く" : "作成済みを開く") : action;
    clearButton.hidden = !draft.content;
    preview.hidden = !draft.content;
    if (draft.content) {
      const content = draft.content;
      status.textContent = isNote
        ? `${content.generated ? content.title : content.sourceName}：大分類 ${content.preview.counts.groups}／区分 ${content.preview.counts.dividers}／項目 ${content.preview.counts.entries}`
        : `${content.sourceName}：${Array.from(content.text).length.toLocaleString()}文字`;
      previewText.textContent = templatePreviewText(content);
      warnings.textContent = isNote ? [
        ...content.preview.warnings.map((item) => item.message),
        ...(content.generated?.version >= 3 ? ["項目メモ・タグ・ふりがな・関連リンクを含みます。リンク先も同じ作品で使える必要があります。構想メモの連携と自動反映は引き継ぎません。"] : []),
        ...(content.generated?.version >= 4 ? ["画像の関連付けと作品全体の呼び名一覧を含みます。画像ファイルは含みません。別の作品では画像のコピーが必要です。呼び名一覧は既存の一覧を優先し、使えない場合に取込版を表示します。"] : []),
      ].join("\n") : "";
    } else {
      status.textContent = "ファイルは選択されていません。空のまま作成することもできます。";
      previewText.textContent = "";
      warnings.textContent = "";
    }
  }
  destinationSelect?.addEventListener("change", update);
  replaceTarget?.addEventListener("change", () => { destinationSelect.value = replaceTarget.value || "replace"; update(); });
  replaceConfirmed?.addEventListener("change", update);

  elements[isNote ? "newNoteButton" : "newFileButton"].addEventListener("click", () => {
    if (draft?.busy || state.saving || state.syncing || state.deleting) return;
    draft?.cancel();
    context = { provider: state.provider, work: state.selectedWork, noteType: state.noteType, folder: state.manuscriptFolder };
    draft = new NewDocumentDraft(() => state.provider === context.provider && state.selectedWork === context.work
      && (isNote ? state.noteType === context.noteType : state.manuscriptFolder === context.folder));
    titleInput.value = "";
    input.value = "";
    errorNode.textContent = "";
    preview.open = false;
    resetDrop();
    update();
    dialog.showModal();
    titleInput.focus();
  });

  async function readFile(file) {
    if (!file || !canRead()) return;
    const readingDraft = draft;
    errorNode.textContent = "";
    const task = readingDraft.read(file, kind, context.noteType, async (content) => {
      if (!isNote || !content.generated) return content;
      const inspection = await inspectNoteTemplate(context.provider, context.work, content);
      return { ...content, destinations: templateDestinations(inspection, content) };
    });
    update();
    try {
      if (await task) {
        if (!titleInput.value.trim()) titleInput.value = readingDraft.content.title;
        if (!isNote) elements.newFileExtension.value = readingDraft.content.extension;
        preview.open = !readingDraft.content.destinations?.[0]?.entry;
      }
    } catch (error) {
      if (readingDraft === draft && readingDraft.current()) {
        errorNode.textContent = error.message;
        errorNode.scrollIntoView({ block: "nearest" });
      }
    } finally {
      if (readingDraft === draft && readingDraft.current()) update();
    }
  }
  input.addEventListener("click", () => { input.value = ""; });
  input.addEventListener("change", () => readFile(input.files?.[0]));
  dialog.addEventListener("dragenter", (event) => {
    if (!fileDrag(event)) return;
    event.preventDefault();
    dragDepth += 1;
    dropZone.classList.toggle("is-dragover", !!canRead());
  });
  dialog.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) resetDrop();
  });
  dialog.addEventListener("dragover", (event) => {
    if (!fileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canRead() ? "copy" : "none";
  });
  dialog.addEventListener("drop", async (event) => {
    if (!fileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    resetDrop();
    if (!canRead()) return;
    const transfer = event.dataTransfer;
    const entries = Array.from(transfer.items || []).filter((item) => item.kind === "file");
    if (entries.some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
      errorNode.textContent = "フォルダは読み込めません。ファイルを1つ選んでください。";
      return;
    }
    const files = Array.from(transfer.files || []);
    if (files.length !== 1 || entries.length > 1) {
      errorNode.textContent = "ファイルは1つずつドロップしてください。";
      return;
    }
    try { input.files = transfer.files; } catch { input.value = ""; }
    await readFile(files[0]);
  });
  // Avoid opening a dropped file in this tab when it misses the modal.
  for (const name of ["dragover", "drop"]) document.addEventListener(name, (event) => {
    if (dialog.open && fileDrag(event)) {
      event.preventDefault();
      if (name === "drop") resetDrop();
    }
  });
  clearButton.addEventListener("click", () => { draft.clear(); input.value = ""; errorNode.textContent = ""; update(); });
  dialog.addEventListener("cancel", (event) => { if (draft?.busy) event.preventDefault(); });
  dialog.addEventListener("close", () => { resetDrop(); draft?.cancel(); });

  form.addEventListener("submit", async (event) => {
    if (event.defaultPrevented || (event.submitter && event.submitter.value !== "create")) return;
    event.preventDefault();
    if (!draft || draft.busy || draft.reading) return;
    const creatingDraft = draft;
    errorNode.textContent = "";
    const title = titleInput.value.trim();
    const extension = elements.newFileExtension.value;
    const task = creatingDraft.submit({
      prepare: async (imported) => {
        let destination;
        const current = () => creatingDraft.current() && !state.dirty && !state.saving && !state.syncing && !state.deleting;
        if (isNote && imported?.generated) {
          const reviewed = imported.destinations.find((option) => option.value === destinationSelect.value);
          if (reviewed?.mode === "replace" && !replaceConfirmed.checked) throw new Error("上書きするノートと置換内容を確認してください。");
          destination = await prepareTemplateDestination(context.provider, context.work, imported, destinationSelect.value, current);
          if (destination.mode === "replace") {
            if (reviewed?.entry.raw !== destination.entry.raw) throw new Error("比較後にノートが更新されました。同じファイルを読み直してから上書きしてください。");
            return { imported, destination, current, reviewedRaw: reviewed.entry.raw };
          }
          if (destination.mode !== "new") return { imported, destination, current };
        }
        if (isNote && !title) throw new Error("ノート名を入力してください。");
        const folder = isNote ? destination?.inspection.folders[context.noteType] || await ensureNoteFolder(context.noteType) : context.folder;
        if (!folder?.id) throw new Error("保存先が見つかりません。作品を開き直してください。");
        const siblings = await context.provider.listChildren(folder.id);
        let fileName;
        let note;
        let content = imported?.text || "";
        if (isNote) {
          note = imported ? structuredClone(imported.note) : createNote(context.noteType, title);
          note.title = title;
          note.updatedAt = new Date().toISOString();
          const ordered = state.notes.filter((entry) => Number.isFinite(entry.data.order));
          note.order = state.notes.length && ordered.length === state.notes.length
            ? Math.max(...ordered.map((entry) => entry.data.order)) + 1 : state.notes.length ? null : 0;
          const base = slugifyNoteTitle(title, context.noteType);
          fileName = `${base}.json`;
          let index = 2;
          while (siblings.some((item) => item.name.localeCompare(fileName, "ja", { sensitivity: "base" }) === 0)) {
            fileName = `${base}-${index++}.json`;
          }
          if (imported?.generated) {
            const key = await textHash(`${imported.generated.workId}/${imported.generated.type}/${imported.generated.noteId}`);
            fileName = `web-import-${key.slice(0, 32)}.json`;
            if (siblings.some((item) => item.name === fileName)) throw new Error("同じ生成元の保存先ファイルがあります。追加許可・読込先を確認してください。コピーは増やしていません。");
            note = await attachImportSource(note, imported.generated);
          }
          content = `${JSON.stringify(note, null, 2)}\n`;
        } else {
          fileName = normalizeManuscriptFileName(title, extension);
          if (siblings.some((item) => item.name.localeCompare(fileName, "ja", { sensitivity: "base" }) === 0)) {
            throw new OneDriveConflictError("同じ名前の原稿ファイルがすでにあります。");
          }
        }
        return { folder, fileName, note, content };
      },
      create: async (plan) => {
        if (plan.destination) {
          const result = await applyTemplateDestination(context.provider, plan.imported, plan.destination, plan.current, {
            reviewedRaw: plan.reviewedRaw,
            backup: async (entry) => {
              const result = await createWebManuscriptBackup("before-import", entry.raw, { targetType: "note",
                relativePath: `${NOTE_TYPES[entry.type].folder}/${entry.item.name}`, fileName: entry.item.name,
                item: entry.item, label: entry.data.title, content: entry.raw });
              if (!result?.entry) throw new Error("上書き前のバックアップを作成できませんでした。ノートは変更していません。");
            },
          });
          return { ...result, folder: plan.destination.entry.folder };
        }
        const item = await context.provider.createTextFile(plan.folder, plan.fileName, plan.content);
        return { ...plan, item, operation: "new", mutated: true };
      },
      open: async (record) => {
        if (!creatingDraft.current()) throw new Error("作品が変わりました。元の作品の一覧から開いてください。");
        const { item, note, content, folder } = record;
        invalidateFolderListing(folder);
        item.parentReference ||= folder.parentReference;
        if (isNote) {
          if (!record.registered) {
            const entry = { item, data: note, raw: content };
            if (record.inspection) {
              state.noteType = note.type;
              setNoteNavState(note.type);
              Object.assign(state.noteFolders, record.inspection.folders);
              state.notes = record.inspection.entries.filter((entry) => entry.type === note.type).map(({ item, data, raw }) => ({ item, data, raw }));
              // The draft belongs to the original navigation context until this open finishes.
              context.noteType = note.type;
            }
            state.notes = sortNoteEntries([...state.notes.filter((entry) => entry.item.id !== item.id), entry]);
            state.noteEntriesCache.clear();
            record.registered = true;
            if (record.mutated) await updateNoteIndex(item, note);
            if (creatingDraft.current() && record.operation === "new") updateSharedWorkMetrics({ noteDelta: 1 });
          }
          if (!creatingDraft.current()) throw new Error("作品が変わりました。元の作品の一覧から開いてください。");
          const entry = { item, data: note, raw: content };
          await openNote(entry, { loadedEntry: entry });
        } else if (!await openFile(item, { content })) {
          throw new Error("編集画面を開けませんでした。");
        }
        dialog.close();
        notify(record.message || `${note?.title || item.name}を作成しました。`);
      },
    });
    update();
    try {
      await task;
    } catch (error) {
      errorNode.textContent = creatingDraft.created
        ? `「${creatingDraft.created.item.name}」は${creatingDraft.created.operation === "new" ? "作成済み" : "処理済み"}です。編集画面を開けませんでした。${error.message ? `（${error.message}）` : ""}開くボタンで再試行できます。`
        : error.message || "作成できませんでした。";
      errorNode.scrollIntoView({ block: "nearest" });
    } finally {
      if (creatingDraft === draft) update();
    }
  });
}

setupNewDocumentDialog("note");
elements.addressBookButton.addEventListener("click", () => {
  openAddressBook().catch((error) => {
    elements.addressBookDialog.close();
    notify(error.message || "呼び名一覧を読み込めませんでした。", true);
  });
});
elements.readerAddressBookButton.addEventListener("click", () => {
  openAddressBook().catch((error) => {
    elements.addressBookDialog.close();
    notify(error.message || "呼び名一覧を読み込めませんでした。", true);
  });
});
elements.notePreviewWorkSelect?.addEventListener("change", () => notePreviewWorkController.chooseSource());
elements.notePreviewButton.addEventListener("click", openNotePreview);
elements.closeNotePreviewButton.addEventListener("click", () => elements.notePreviewDialog.close());
elements.notePreviewTypeSelect.addEventListener("change", () => {
  state.notePreviewLoadToken += 1;
  state.notePreviewEntries = [];
  state.notePreviewReferenceId = "";
  openNotePreview();
});
elements.notePreviewSelect.addEventListener("change", () => {
  if (!isNotePreviewOwnerCurrent() || elements.notePreviewTypeSelect.value === "current") return;
  state.notePreviewReferenceId = elements.notePreviewSelect.value;
  renderNotePreviewReference();
});
elements.notePreviewDialog.addEventListener("close", () => {
  if (!elements.notePreviewDialog.open) {
    state.notePreviewLoadToken += 1;
    if (elements.notePreviewWorkSelect) notePreviewWorkController.close();
  }
});
elements.notePreviewDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    elements.notePreviewDialog.close();
  }
});
elements.closeAddressBookButton.addEventListener("click", () => elements.addressBookDialog.close());
elements.closeRelatedNoteButton.addEventListener("click", () => elements.relatedNoteDialog.close());
elements.closeRelatedPreviewButton.addEventListener("click", () => elements.relatedPreviewDialog.close());
elements.relatedPreviewDialog.addEventListener("close", () => {
  state.relatedPreviewRequest += 1;
  state.relatedPreviewContext = null;
});
elements.openRelatedPreviewNoteButton.addEventListener("click", openRelatedPreviewNote);
elements.relatedNoteSearchInput.addEventListener("input", renderRelatedResults);
setupNewDocumentDialog("manuscript");

const manuscriptRenameController = createManuscriptRenameController({
  state, elements, setBusy, notify, refresh: openManuscriptFolder,
  onRenamed(before, saved) {
    // A folder rename also changes Dropbox descendant paths. Drop all listing snapshots.
    state.folderListings.clear();
    if (state.currentFile?.id === before.id) { state.currentFile = saved; updateReaderMeta(saved); }
    const safe = safeDriveItemSnapshot(saved);
    const context = captureRecentManuscriptContext();
    try {
      if (context) localStorage.setItem(context.storageKey, JSON.stringify(renameManuscriptReferences(readRecentManuscripts(context), before, safe)));
      const matches = (entry) => entry.cloudKind === state.cloudKind && entry.root?.id === state.workRoot?.id && entry.route?.workId === state.selectedWork?.id;
      localStorage.setItem(recentViewsStorageKey(), JSON.stringify(renameManuscriptReferences(readRecentViews(), before, safe, matches)));
      localStorage.setItem(workRecentViewsStorageKey(), JSON.stringify(renameManuscriptReferences(readWorkRecentViews(), before, safe, matches)));
    } catch { /* History storage must not turn a completed rename into a failed operation. */ }
  },
});

function makeManuscriptRenameButton(item) {
  const button = makeElement("button", "file-move-button", "名前変更");
  button.type = "button";
  button.setAttribute("aria-label", item.name + "の名前を変更");
  button.addEventListener("click", () => manuscriptRenameController.open(item));
  return button;
}

function withManuscriptRename(content, item) {
  const row = makeElement("div", "file-row-with-actions");
  row.append(content, makeManuscriptRenameButton(item));
  return row;
}


let creatingFolder = false;
for (const prefix of ["newFile", "newNote", "newFolder"]) {
  bindCreateDialogForm({ form: elements[prefix + "Form"], dialog: elements[prefix + "Dialog"],
    isBusy: () => prefix === "newFolder" && creatingFolder });
}

elements.newFolderButton.addEventListener("click", () => {
  if (creatingFolder || state.saving || state.syncing) return;
  elements.newFolderError.textContent = "";
  elements.newFolderNameInput.value = "";
  elements.newFolderDialog.showModal();
  elements.newFolderNameInput.focus();
});

elements.newFolderForm.addEventListener("submit", async (event) => {
  if (event.defaultPrevented || (event.submitter && event.submitter.value !== "create")) return;
  event.preventDefault();
  if (creatingFolder) return;
  creatingFolder = true;
  setBusy(elements.createFolderButton, true, "作成中…");
  elements.newFolderError.textContent = "";
  try {
    const folderName = normalizeManuscriptFolderName(elements.newFolderNameInput.value);
    const parent = state.manuscriptFolder;
    const trail = [...state.manuscriptTrail];
    const siblings = await state.provider.listChildren(parent.id);
    if (siblings.some((item) => item.name.localeCompare(folderName, "ja", { sensitivity: "base" }) === 0)) {
      throw new OneDriveConflictError("同じ名前のファイルまたはフォルダがすでにあります。");
    }
    const created = await state.provider.createFolder(parent, folderName);
    invalidateFolderListing(parent);
    created.parentReference ||= parent.parentReference;
    elements.newFolderDialog.close();
    await openManuscriptFolder(created, [...trail, created]);
    notify(`${folderName}フォルダを作成しました。`);
  } catch (error) {
    elements.newFolderError.textContent = error.message || "フォルダを作成できませんでした。";
  } finally {
    creatingFolder = false;
    setBusy(elements.createFolderButton, false);
  }
});

async function collectManuscriptMoveDestinations() {
  const root = state.selectedWork?.manuscript;
  if (!root) return [];
  const destinations = [{ folder: root, label: "原稿ルート" }];
  const visited = new Set([String(root.id)]);
  let level = [{ folder: root, path: [] }];
  while (level.length) {
    const listings = await Promise.all(level.map(({ folder }) => listChildrenCached(folder)));
    const next = [];
    level.forEach(({ path }, index) => {
      const folders = sortDriveItems(listings[index].filter((item) => item?.folder));
      for (const folder of folders) {
        const id = String(folder.id || "");
        if (!id || visited.has(id)) continue;
        visited.add(id);
        const folderPath = [...path, folder.name];
        destinations.push({ folder, label: `原稿 / ${folderPath.join(" / ")}` });
        next.push({ folder, path: folderPath });
      }
    });
    level = next;
  }
  return destinations;
}

async function moveManuscriptFile(context, destination, button) {
  const recentContext = captureRecentManuscriptContext();
  const siblings = await state.provider.listChildren(destination.id);
  if (siblings.some((item) => item.id !== context.file.id
    && item.name.localeCompare(context.file.name, "ja", { sensitivity: "base" }) === 0)) {
    throw new OneDriveConflictError("移動先に同じ名前のファイルまたはフォルダがあります。");
  }
  setBusy(button, true, "移動中…");
  try {
    await state.provider.moveItem(context.file, destination);
    removeRecentManuscript(context.file.id, recentContext);
    invalidateFolderListing(context.sourceFolder);
    invalidateFolderListing(destination);
    elements.moveFileDialog.close();
    state.movingFileContext = null;
    await openManuscriptFolder(context.sourceFolder, context.sourceTrail);
    notify(`${context.file.name}を移動しました。`);
  } finally {
    setBusy(button, false);
  }
}

async function openMoveFileDialog(file) {
  const context = {
    file,
    sourceFolder: state.manuscriptFolder,
    sourceTrail: [...state.manuscriptTrail],
  };
  state.movingFileContext = context;
  elements.moveFileName.textContent = file.name;
  showLoading(elements.moveFileDestinations, "移動先を読み込んでいます…");
  elements.moveFileDialog.showModal();
  try {
    const destinations = await collectManuscriptMoveDestinations();
    if (state.movingFileContext !== context) return;
    const buttons = destinations.map(({ folder, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "move-destination-button";
      const current = String(folder.id) === String(context.sourceFolder.id);
      button.disabled = current;
      button.append(
        makeElement("span", "", label),
        makeElement("small", "", current ? "現在地" : "ここへ移動"),
      );
      if (!current) button.addEventListener("click", () => {
        moveManuscriptFile(context, folder, button).catch((error) => notify(error.message, true));
      });
      return button;
    });
    elements.moveFileDestinations.replaceChildren(...buttons);
  } catch (error) {
    showEmpty(elements.moveFileDestinations, error.message || "移動先を読み込めませんでした。");
  }
}

elements.closeMoveFileButton.addEventListener("click", () => {
  state.movingFileContext = null;
  elements.moveFileDialog.close();
});
elements.moveFileDialog.addEventListener("close", () => {
  state.movingFileContext = null;
});

elements.openProgressShareButton.addEventListener("click", () => {
  openProgressShareDialog().catch((error) => notify(error.message || "進捗画像を開けませんでした。", true));
});
elements.closeProgressShareButton.addEventListener("click", () => elements.progressShareDialog.close());
elements.progressShareOptions.addEventListener("change", (event) => {
  if (event.target === elements.progressShareDateSelect || event.target === elements.progressShareYearSelect) return;
  refreshProgressShareImage().catch((error) => {
    elements.progressShareStatus.textContent = error.message || "プレビューを更新できませんでした。";
  });
});
elements.progressShareDateSelect.addEventListener("change", () => {
  const value = normalizeProgressShareDate(elements.progressShareDateSelect.value, state.progressSummaries);
  elements.progressShareDateSelect.value = value;
  localStorage.setItem(PROGRESS_SHARE_DATE_KEY, value);
  refreshProgressShareImage().catch((error) => {
    elements.progressShareStatus.textContent = error.message || "対象日を変更できませんでした。";
  });
});
elements.progressShareYearSelect.addEventListener("change", () => {
  const year = Math.min(2100, Math.max(2000, Number(elements.progressShareYearSelect.value) || new Date().getFullYear()));
  elements.progressShareYearSelect.value = String(year);
  localStorage.setItem(PROGRESS_SHARE_YEAR_KEY, String(year));
  refreshProgressShareImage().catch((error) => {
    elements.progressShareStatus.textContent = error.message || "対象年を変更できませんでした。";
  });
});
elements.saveProgressShareButton.addEventListener("click", saveProgressImage);
elements.copyProgressShareButton.addEventListener("click", copyProgressImage);
elements.copyProgressShareTextButton.addEventListener("click", copyProgressText);
elements.shareProgressButton.addEventListener("click", shareProgress);

elements.copyDraftButton.addEventListener("click", async () => {
  try {
    const draft = state.currentSettings
      ? JSON.stringify(state.currentSettings.data, null, 2)
      : state.currentConceptMemo
      ? JSON.stringify(state.currentConceptMemo, null, 2)
      : state.currentNote
      ? JSON.stringify(state.currentNote.data, null, 2)
      : elements.readerContent.value;
    await navigator.clipboard.writeText(draft);
    notify("編集中の内容をクリップボードへコピーしました。");
  } catch {
    notify("本文をコピーできませんでした。", true);
  }
});
elements.reloadLatestButton.addEventListener("click", () => {
  reloadLatestFile().catch((error) => notify(error.message || "最新版を読み込めませんでした。", true));
});
elements.closeConflictButton.addEventListener("click", () => elements.conflictDialog.close());

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    checkUserAccess({ force: true });
    if (!state.accessSuspended) checkExternalUpdate();
  }
});

window.addEventListener("beforeunload", (event) => {
  rememberCurrentRoutePosition();
  if (!state.dirty && !state.saving && !state.syncing) return;
  event.preventDefault();
  event.returnValue = "";
});

// Keep the active entry current even when the browser leaves without an app navigation.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
document.addEventListener("selectionchange", scheduleRoutePositionCapture);
document.addEventListener("pointerdown", rememberCurrentRoutePosition, { capture: true });
document.addEventListener("keydown", (event) => {
  if (event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r")) rememberCurrentRoutePosition();
}, { capture: true });
for (const section of [elements.readerSection, elements.noteEditorSection, elements.conceptMemoEditorSection]) {
  for (const type of ["input", "select", "keyup", "focusin"]) section.addEventListener(type, scheduleRoutePositionCapture);
}
document.addEventListener("scroll", scheduleRoutePositionCapture, { capture: true, passive: true });
window.addEventListener("scroll", scheduleRoutePositionCapture, { passive: true });
window.addEventListener("pagehide", rememberCurrentRoutePosition);
window.addEventListener("popstate", handlePopState);
window.addEventListener("unhandledrejection", (event) => notify(event.reason?.message || "処理に失敗しました。", true));

const viewObserver = new MutationObserver(updateShellContext);
for (const section of [
  elements.browserSection, elements.worksSection, elements.filesSection, elements.readerSection,
  elements.notesSection, elements.noteEditorSection, elements.conceptMemosSection,
  elements.conceptMemoEditorSection, elements.workSettingsSection,
]) viewObserver.observe(section, { attributes: true, attributeFilter: ["hidden"] });
updateShellContext();

window.addEventListener("mojigoto:before-startup-reload", (event) => {
  if (state.dirty || state.saving || state.syncing) event.preventDefault();
});
const systemThemePreference = matchMedia("(prefers-color-scheme: dark)");
systemThemePreference.addEventListener?.("change", () => {
  if (state.theme === "system") applyTheme();
});
applyTheme();
applyFontScale();
applyWritingFont();
applyManuscriptPreviewFont();
restoreViewPreferences();
showInitialViewRestoreLoading();
window.dispatchEvent(new Event("mojigoto:app-started"));
initializeConnection().catch(() => {
  window.dispatchEvent(new Event("mojigoto:boot-failed"));
}).finally(() => refreshAnnouncementBadge());
