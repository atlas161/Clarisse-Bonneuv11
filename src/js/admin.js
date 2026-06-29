import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  Clock3,
  Copy,
  createIcons,
  Film,
  Folder,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  GripVertical,
  KeyRound,
  ListFilter,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Shield,
  Square,
  Trash2,
  Upload,
  UserCog,
  X,
} from 'lucide';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { createClient } from '@supabase/supabase-js';
import flatpickr from 'flatpickr';
import { French } from 'flatpickr/dist/l10n/fr.js';
import 'flatpickr/dist/themes/dark.css';
import '../css/flatpickr-admin.css';
import Sortable from 'sortablejs';

const getMetaContent = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() || '';

const normalizePath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeAuthLinkType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'invite' || normalized === 'recovery' ? normalized : null;
};

const getAuthLinkTypeFromLocation = () => {
  const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search || '');
  return normalizeAuthLinkType(hashParams.get('type') || searchParams.get('type'));
};

const clearAuthLinkStateFromUrl = () => {
  if (!window.location.hash) {
    return;
  }

  const nextUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, nextUrl);
};

const parseTags = (value) =>
  Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  );

const createContextString = (entries) =>
  Object.entries(entries)
    .filter(([, value]) => String(value || '').trim() !== '')
    .map(([key, value]) => `${key}=${String(value).replace(/[|=]/g, ' ').trim()}`)
    .join('|');

const config = {
  supabaseUrl: getMetaContent('supabase-url'),
  supabasePublishableKey: getMetaContent('supabase-publishable-key'),
  cloudinaryCloudName: getMetaContent('cloudinary-cloud-name'),
  cloudinaryApiKey: getMetaContent('cloudinary-api-key'),
  cloudinaryUploadPreset: getMetaContent('cloudinary-upload-preset'),
  rootFolder: normalizePath(getMetaContent('cloudinary-root')),
};

const MFA_ISSUER = 'Clarisse Bonneu SiteWeb';
const ADMIN_MFA_REMEMBER_KEY = 'clarisse-bonneu-admin-mfa-remember';
const PORTFOLIO_CACHE_VERSION_KEY = 'clarisse-bonneu-portfolio-version';
const ADMIN_MFA_REMEMBER_WINDOW_MS = 24 * 60 * 60 * 1000;
const ADMIN_DEBUG_ENABLED = false;
const FLATPICKR_FR_COMPACT = {
  ...French,
  weekdays: {
    // Flatpickr expects Sunday-first labels, then reorders from firstDayOfWeek.
    longhand: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    shorthand: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  },
};
const FLATPICKR_VISIBLE_WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// #region debug-point A:runtime-reporter
const reportAdminDebug = (hypothesisId, location, msg, data = {}) =>
  !ADMIN_DEBUG_ENABLED
    ? Promise.resolve()
    :
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: 'admin-context-menu',
      runId: 'post-fix',
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
// #endregion

// #region debug-point A:invite-reporter
const reportInviteDebug = (hypothesisId, location, msg, data = {}) =>
  !ADMIN_DEBUG_ENABLED
    ? Promise.resolve()
    :
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: 'admin-invite-email',
      runId: 'pre-fix',
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
// #endregion

const bumpPortfolioCacheVersion = () => {
  try {
    window.localStorage.setItem(PORTFOLIO_CACHE_VERSION_KEY, String(Date.now()));
  } catch {
    return;
  }
};

const reportFolderSyncDebug = (hypothesisId, location, msg, data = {}) =>
  !ADMIN_DEBUG_ENABLED
    ? Promise.resolve()
    :
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: 'cloudinary-folder-sync',
      runId: 'pre-fix',
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});

const renderLucideIcons = () => {
  createIcons({
    icons: {
      Folder,
      FolderClosed,
      FolderOpen,
      FolderPlus,
      ArrowLeft,
      Plus,
      Camera,
      Check,
      GripVertical,
      Film,
      Pencil,
      Search,
      ListFilter,
      LogOut,
      MoreHorizontal,
      RotateCcw,
      CheckCheck,
      Square,
      RefreshCw,
      Shield,
      KeyRound,
      Save,
      UserCog,
      Clock3,
      Copy,
      Trash2,
      Upload,
      X,
    },
    attrs: {
      width: '20',
      height: '20',
      'stroke-width': '1.75',
    },
  });

  // #region debug-point E:lucide-render
  void reportFolderSyncDebug('E', 'src/js/admin.js:renderLucideIcons', 'Lucide render executed', {
    quickActionsVisible: !dom?.shellQuickActions?.hasAttribute?.('hidden'),
    logoutIconNodes: document.querySelectorAll('[data-admin-signout] [data-lucide="log-out"], [data-admin-signout] svg').length,
  });
  // #endregion
};

const dom = {
  heroSection: document.querySelector('[data-admin-hero]'),
  statusWrap: document.querySelector('[data-admin-status-wrap]'),
  authSection: document.querySelector('[data-admin-auth]'),
  shellSection: document.querySelector('[data-admin-shell]'),
  shellQuickActions: document.querySelector('[data-admin-shell-quick-actions]'),
  shellMain: document.querySelector('[data-admin-shell-main]'),
  shellSidebar: document.querySelector('[data-admin-shell-sidebar]'),
  status: document.querySelector('[data-admin-status]'),
  loginIntroCard: document.querySelector('[data-admin-login-intro]'),
  loginCard: document.querySelector('[data-admin-login-card]'),
  loginForm: document.querySelector('[data-admin-login-form]'),
  emailInput: document.querySelector('[data-admin-email-input]'),
  resetPasswordButton: document.querySelector('[data-admin-reset-password]'),
  passwordGate: document.querySelector('[data-admin-password-gate]'),
  passwordEyebrow: document.querySelector('[data-admin-password-eyebrow]'),
  passwordTitle: document.querySelector('[data-admin-password-title]'),
  passwordDescription: document.querySelector('[data-admin-password-description]'),
  passwordHighlight: document.querySelector('[data-admin-password-highlight]'),
  passwordHelp: document.querySelector('[data-admin-password-help]'),
  passwordForm: document.querySelector('[data-admin-password-form]'),
  passwordInput: document.querySelector('[data-admin-password-input]'),
  passwordConfirmInput: document.querySelector('[data-admin-password-confirm-input]'),
  passwordSubmitButton: document.querySelector('[data-admin-password-submit]'),
  passwordCancelButton: document.querySelector('[data-admin-password-cancel]'),
  mfaGate: document.querySelector('[data-admin-mfa-gate]'),
  mfaEyebrow: document.querySelector('[data-admin-mfa-eyebrow]'),
  mfaTitle: document.querySelector('[data-admin-mfa-title]'),
  mfaDescription: document.querySelector('[data-admin-mfa-description]'),
  mfaSummary: document.querySelector('[data-admin-mfa-summary]'),
  mfaFactorList: document.querySelector('[data-admin-mfa-factor-list]'),
  mfaChallengeForm: document.querySelector('[data-admin-mfa-challenge-form]'),
  mfaCancelChallengeButton: document.querySelector('[data-admin-mfa-cancel-challenge]'),
  mfaEnrollForm: document.querySelector('[data-admin-mfa-enroll-form]'),
  mfaQrWrap: document.querySelector('[data-admin-mfa-qr-wrap]'),
  mfaQrImage: document.querySelector('[data-admin-mfa-qr-image]'),
  mfaSecretInput: document.querySelector('[data-admin-mfa-secret]'),
  mfaCodeWrap: document.querySelector('[data-admin-mfa-code-wrap]'),
  mfaStartEnrollButton: document.querySelector('[data-admin-mfa-start-enroll]'),
  mfaVerifyEnrollButton: document.querySelector('[data-admin-mfa-verify-enroll]'),
  mfaResetCurrentButton: document.querySelector('[data-admin-mfa-reset-current]'),
  mfaSkipButton: document.querySelector('[data-admin-mfa-skip]'),
  mfaCancelEnrollButton: document.querySelector('[data-admin-mfa-cancel-enroll]'),
  pinInputs: document.querySelectorAll('[data-admin-pin-input]'),
  currentEmail: document.querySelector('[data-admin-current-email]'),
  roleBadge: document.querySelector('[data-admin-role-badge]'),
  rootFolder: document.querySelector('[data-admin-root-folder]'),
  mfaToolbarStatus: document.querySelector('[data-admin-mfa-toolbar-status]'),
  currentFolder: document.querySelector('[data-admin-current-folder]'),
  folderHint: document.querySelector('[data-admin-folder-hint]'),
  openFolderDialogButtons: document.querySelectorAll('[data-admin-open-folder-dialog]'),
  closeFolderDialogButtons: document.querySelectorAll('[data-admin-close-folder-dialog]'),
  folderDialog: document.querySelector('[data-admin-folder-dialog]'),
  folderDialogEyebrow: document.querySelector('[data-admin-folder-dialog-eyebrow]'),
  folderDialogTitle: document.querySelector('[data-admin-folder-dialog-title]'),
  folderDialogDescription: document.querySelector('[data-admin-folder-dialog-description]'),
  folderDialogLabel: document.querySelector('[data-admin-folder-dialog-label]'),
  folderDialogInput: document.querySelector('[data-admin-folder-dialog-input]'),
  folderDialogSubmit: document.querySelector('[data-admin-folder-dialog-submit]'),
  folderSearchForm: document.querySelector('[data-admin-folder-search-form]'),
  folderSearchField: document.querySelector('[data-admin-folder-search-field]'),
  folderSearchInput: document.querySelector('[data-admin-folder-search]'),
  clearFolderSearchButton: document.querySelector('[data-admin-clear-folder-search]'),
  folderSuggestionsPanel: document.querySelector('[data-admin-folder-suggestions-panel]'),
  folderList: document.querySelector('[data-admin-folder-list]'),
  folderModeButtons: document.querySelectorAll('[data-admin-folder-mode-button]'),
  folderPanels: document.querySelectorAll('[data-admin-folder-panel]'),
  renameFolderButton: document.querySelector('[data-admin-start-folder-rename]'),
  backToFoldersButton: document.querySelector('[data-admin-back-to-folders]'),
  openAddMenuButton: document.querySelector('[data-admin-open-add-menu]'),
  closeAddMenuButtons: document.querySelectorAll('[data-admin-close-add-menu]'),
  addMenu: document.querySelector('[data-admin-add-menu]'),
  addKindButtons: document.querySelectorAll('[data-admin-add-kind]'),
  closeAddStageButton: document.querySelector('[data-admin-close-add-stage]'),
  manageMfaButton: document.querySelector('[data-admin-manage-mfa]'),
  refreshButton: document.querySelector('[data-admin-refresh]'),
  signoutButton: document.querySelector('[data-admin-signout]'),
  createFolderForm: document.querySelector('[data-admin-create-folder-form]'),
  registerFolderForm: document.querySelector('[data-admin-register-folder-form]'),
  deleteFolderButton: document.querySelector('[data-admin-delete-folder]'),
  mediaForm: document.querySelector('[data-admin-media-form]'),
  mediaStage: document.querySelector('[data-admin-media-stage]'),
  uploadTitle: document.querySelector('[data-admin-upload-title]'),
  mediaFolderInput: document.querySelector('[data-admin-media-folder]'),
  mediaKindInput: document.querySelector('[data-admin-media-kind-input]'),
  mediaTitleLabel: document.querySelector('[data-admin-media-title-label]'),
  mediaTitleInput: document.querySelector('[data-admin-media-title-input]'),
  videoUrlField: document.querySelector('[data-admin-video-url-field]'),
  videoUrlInput: document.querySelector('[data-admin-video-url-input]'),
  mediaKindButtons: document.querySelectorAll('[data-admin-media-kind-buttons] [data-value]'),
  mediaSubmitButton: document.querySelector('[data-admin-media-submit]'),
  guidanceCopy: document.querySelector('[data-admin-guidance-copy]'),
  translateToFrButton: document.querySelector('[data-admin-translate-to-fr]'),
  translateToEnButton: document.querySelector('[data-admin-translate-to-en]'),
  usersPanel: document.querySelector('[data-admin-users-panel]'),
  studioPanel: document.querySelector('[data-admin-studio-panel]'),
  libraryPanel: document.querySelector('[data-admin-library-panel]'),
  logsPanel: document.querySelector('[data-admin-logs-panel]'),
  refreshLogsButton: document.querySelector('[data-admin-refresh-logs]'),
  clearLogsButton: document.querySelector('[data-admin-clear-logs]'),
  logsFiltersForm: document.querySelector('[data-admin-logs-filters-form]'),
  logsActionInput: document.querySelector('[data-admin-logs-action]'),
  logsActionPicker: document.querySelector('[data-admin-logs-action-picker]'),
  logsActionTrigger: document.querySelector('[data-admin-logs-action-trigger]'),
  logsActionLabel: document.querySelector('[data-admin-logs-action-label]'),
  logsActionMenu: document.querySelector('[data-admin-logs-action-menu]'),
  logsEmailInput: document.querySelector('[data-admin-logs-email]'),
  logsDateFromInput: document.querySelector('[data-admin-logs-date-from]'),
  logsDateToInput: document.querySelector('[data-admin-logs-date-to]'),
  resetLogsFiltersButton: document.querySelector('[data-admin-reset-logs-filters]'),
  logsSummary: document.querySelector('[data-admin-logs-summary]'),
  logsList: document.querySelector('[data-admin-logs-list]'),
  paneButtons: document.querySelectorAll('[data-admin-pane-button]'),
  userForm: document.querySelector('[data-admin-user-form]'),
  userRoleInput: document.querySelector('[data-admin-user-role-input]'),
  userRoleButtons: document.querySelectorAll('[data-admin-user-role-buttons] [data-value]'),
  userList: document.querySelector('[data-admin-user-list]'),
  userLinkWrap: document.querySelector('[data-admin-user-link-wrap]'),
  userLinkLabel: document.querySelector('[data-admin-user-link-label]'),
  userLinkOutput: document.querySelector('[data-admin-user-link-output]'),
  copyUserLinkButton: document.querySelector('[data-admin-copy-user-link]'),
  statTotal: document.querySelector('[data-admin-stat-total]'),
  statSelected: document.querySelector('[data-admin-stat-selected]'),
  statIncomplete: document.querySelector('[data-admin-stat-incomplete]'),
  statVideos: document.querySelector('[data-admin-stat-videos]'),
  shellTitle: document.querySelector('[data-admin-shell-title]'),
  shellDescription: document.querySelector('[data-admin-shell-description]'),
  currentStepLabel: document.querySelector('[data-admin-current-step-label]'),
  selectedFolderLabel: document.querySelector('[data-admin-selected-folder-label]'),
  currentViewLabel: document.querySelector('[data-admin-current-view-label]'),
  stepCards: document.querySelectorAll('[data-admin-step-card]'),
  searchInput: document.querySelector('[data-admin-search]'),
  filterTypeInput: document.querySelector('[data-admin-filter-type-input]'),
  filterTypeButtons: document.querySelectorAll('[data-admin-filter-type-buttons] [data-value]'),
  filterTagInput: document.querySelector('[data-admin-filter-tag]'),
  selectedOnlyButton: document.querySelector('[data-admin-toggle-selected-only]'),
  clearFiltersButton: document.querySelector('[data-admin-clear-filters]'),
  selectAllButton: document.querySelector('[data-admin-select-all]'),
  clearSelectionButton: document.querySelector('[data-admin-clear-selection]'),
  selectionDock: document.querySelector('[data-admin-selection-dock]'),
  selectionDockCount: document.querySelector('[data-admin-selection-dock-count]'),
  previewSelectionButton: document.querySelector('[data-admin-preview-selection]'),
  clearSelectionDockButton: document.querySelector('[data-admin-clear-selection-dock]'),
  selectionCount: document.querySelector('[data-admin-selection-count]'),
  bulkForm: document.querySelector('[data-admin-bulk-form]'),
  libraryGate: document.querySelector('[data-admin-library-gate]'),
  libraryControls: document.querySelectorAll('[data-admin-library-controls]'),
  libraryHelp: document.querySelector('[data-admin-library-help]'),
  librarySummary: document.querySelector('[data-admin-library-summary]'),
  libraryTitle: document.querySelector('[data-admin-library-title]'),
  renameActions: document.querySelector('[data-admin-rename-actions]'),
  submitFolderRenameButton: document.querySelector('[data-admin-submit-folder-rename]'),
  clearFolderRenameButton: document.querySelector('[data-admin-clear-folder-rename]'),
  libraryDescription: document.querySelector('[data-admin-library-description]'),
  visibleCount: document.querySelector('[data-admin-visible-count]'),
  filteredCount: document.querySelector('[data-admin-filtered-count]'),
  activeFiltersLabel: document.querySelector('[data-admin-active-filters-label]'),
  assetsEmpty: document.querySelector('[data-admin-assets-empty]'),
  assetGrid: document.querySelector('[data-admin-asset-grid]'),
  assetMenu: document.querySelector('[data-admin-asset-menu]'),
  assetMenuActionButtons: document.querySelectorAll('[data-admin-asset-menu-action]'),
  paginationWrap: document.querySelector('[data-admin-pagination]'),
  paginationLabel: document.querySelector('[data-admin-pagination-label]'),
  loadMoreButton: document.querySelector('[data-admin-load-more]'),
  preview: document.querySelector('[data-admin-preview]'),
  previewMedia: document.querySelector('[data-admin-preview-media]'),
  previewTitle: document.querySelector('[data-admin-preview-title]'),
  previewDetails: document.querySelector('[data-admin-preview-details]'),
  previewBadges: document.querySelector('[data-admin-preview-badges]'),
  previewForm: document.querySelector('[data-admin-preview-form]'),
  previewCloseButtons: document.querySelectorAll('[data-admin-preview-close]'),
  confirmDialog: document.querySelector('[data-admin-confirm]'),
  confirmCloseButtons: document.querySelectorAll('[data-admin-confirm-close]'),
  confirmEyebrow: document.querySelector('[data-admin-confirm-eyebrow]'),
  confirmTitle: document.querySelector('[data-admin-confirm-title]'),
  confirmMessage: document.querySelector('[data-admin-confirm-message]'),
  confirmTarget: document.querySelector('[data-admin-confirm-target]'),
  confirmCancelButton: document.querySelector('[data-admin-confirm-cancel]'),
  confirmSubmitButton: document.querySelector('[data-admin-confirm-submit]'),
};

const state = {
  supabase: null,
  session: null,
  role: null,
  canManageUsers: false,
  mfa: {
    currentLevel: null,
    nextLevel: 'aal1',
    factorCount: 0,
    allFactors: [],
    verifiedFactors: [],
    remembered: false,
    rememberedUntil: null,
    selectedFactorId: null,
    pendingFactor: null,
    promptDismissed: false,
    gateMode: 'login',
    managementReturnToShell: false,
    verificationInProgress: false,
  },
  authGate: 'none',
  authFlow: {
    pendingType: getAuthLinkTypeFromLocation(),
  },
  lastSessionSyncKey: null,
  currentFolder: config.rootFolder,
  selectedFolder: null,
  parentFolder: null,
  assets: [],
  selectedAssetKeys: new Set(),
  sortable: null,
  folderSortable: null,
  users: [],
  searchQuery: '',
  filterType: 'all',
  filterTag: '',
  selectedOnly: false,
  currentPage: 1,
  previewAssetKey: null,
  previewScrollY: 0,
  previewReturnFocus: null,
  folderDialogScrollY: 0,
  folderDialogReturnFocus: null,
  confirmResolver: null,
  confirmReturnFocus: null,
  activePane: 'library',
  folderMode: 'none',
  folderSearchQuery: '',
  availableFolders: [],
  folderSearchPanelOpen: false,
  folderSearchActiveIndex: -1,
  folderDialogMode: 'create',
  inlineFolderRenameActive: false,
  inlineFolderRenameSaving: false,
  inlineFolderRenameOriginal: '',
  showAddMenu: false,
  showUploadStage: false,
  assetMenuKey: null,
  assetMenuLongPressTimer: null,
  assetMenuLongPressOrigin: null,
  suppressPreviewUntil: 0,
  assetDropSettleTimer: null,
  folderDropSettleTimer: null,
  folderDragActive: false,
  folderDragSuppressOpenUntil: 0,
  assetMenuPoint: null,
  logs: [],
  logsFilters: {
    action: '',
    actorEmail: '',
    dateFrom: '',
    dateTo: '',
  },
  logsRequestId: 0,
  folderRequestId: 0,
  folderListLoadCount: 0,
  folderListTimedOut: false,
  folderListTimeoutHandle: null,
  logsActionMenuOpen: false,
  bootstrapAdminEmail: '',
  reorderInFlight: false,
  folderReorderInFlight: false,
};

const ASSET_MENU_LONG_PRESS_MS = 360;
const ASSET_MENU_MOVE_TOLERANCE = 12;
const FOLDER_LIST_LOAD_TIMEOUT_MS = 4500;

const getRoleFromSessionUser = (user) => {
  const role = String(user?.app_metadata?.role || '').trim().toLowerCase();

  if (role === 'admin' || role === 'client') {
    return role;
  }

  return 'client';
};

const getFactorLabel = (factor, fallbackIndex = 0) =>
  String(factor?.friendly_name || '').trim() || `Appareil ${fallbackIndex + 1}`;

const getMfaAccountLabel = () =>
  normalizeEmail(state.session?.user?.email || (dom.emailInput instanceof HTMLInputElement ? dom.emailInput.value : ''));

const getFirstRejectedReason = (results) => {
  const rejected = results.find((result) => result.status === 'rejected');
  return rejected?.status === 'rejected' ? rejected.reason : null;
};

const resetMfaState = () => {
  state.mfa.currentLevel = null;
  state.mfa.nextLevel = 'aal1';
  state.mfa.factorCount = 0;
  state.mfa.allFactors = [];
  state.mfa.verifiedFactors = [];
  state.mfa.remembered = false;
  state.mfa.rememberedUntil = null;
  state.mfa.selectedFactorId = null;
  state.mfa.pendingFactor = null;
  state.mfa.gateMode = 'login';
  state.mfa.managementReturnToShell = false;
};

const setAuthGateVisible = (isVisible) => {
  if (!isVisible) {
    state.authGate = 'none';
  }

  if (dom.heroSection) {
    dom.heroSection.hidden = isVisible;
  }

  if (dom.statusWrap) {
    dom.statusWrap.hidden = isVisible;
  }

  if (dom.loginIntroCard) {
    dom.loginIntroCard.hidden = isVisible;
  }

  if (dom.loginCard) {
    dom.loginCard.hidden = isVisible;
  }

  if (dom.passwordGate) {
    dom.passwordGate.hidden = !isVisible || state.authGate !== 'password';
  }

  if (dom.mfaGate) {
    dom.mfaGate.hidden = !isVisible || state.authGate !== 'mfa';
  }
};

const renderMfaToolbarStatus = () => {
  if (!dom.mfaToolbarStatus) {
    return;
  }

  if (!state.session) {
    dom.mfaToolbarStatus.textContent = 'Hors ligne';
    return;
  }

  if (state.mfa.verifiedFactors.length === 0) {
    dom.mfaToolbarStatus.textContent = state.role === 'admin' ? 'Configuration requise' : 'Optionnelle';
    return;
  }

  const factorLabel = `${state.mfa.verifiedFactors.length} facteur${state.mfa.verifiedFactors.length > 1 ? 's' : ''} actif${state.mfa.verifiedFactors.length > 1 ? 's' : ''}`;

  if (state.mfa.currentLevel === 'aal2') {
    dom.mfaToolbarStatus.textContent = `${factorLabel} (validee)`;
    return;
  }

  if (state.mfa.remembered) {
    dom.mfaToolbarStatus.textContent = `${factorLabel} (memoire 24h active)`;
    return;
  }

  dom.mfaToolbarStatus.textContent = `${factorLabel} (code requis)`;
};

const clearMfaGate = () => {
  state.mfa.pendingFactor = null;
  state.mfa.gateMode = 'login';

  if (dom.mfaFactorList) {
    dom.mfaFactorList.hidden = true;
    dom.mfaFactorList.replaceChildren();
  }

  if (dom.mfaSummary) {
    dom.mfaSummary.hidden = true;
    dom.mfaSummary.textContent = '';
  }

  if (dom.mfaChallengeForm instanceof HTMLFormElement) {
    dom.mfaChallengeForm.hidden = true;
    dom.mfaChallengeForm.reset();
  }

  if (dom.mfaEnrollForm instanceof HTMLFormElement) {
    dom.mfaEnrollForm.hidden = true;
    dom.mfaEnrollForm.reset();
  }

  if (dom.mfaQrWrap) {
    dom.mfaQrWrap.hidden = true;
  }

  if (dom.mfaCodeWrap) {
    dom.mfaCodeWrap.hidden = true;
  }

  if (dom.mfaQrImage instanceof HTMLImageElement) {
    dom.mfaQrImage.removeAttribute('src');
  }

  if (dom.mfaSecretInput instanceof HTMLInputElement) {
    dom.mfaSecretInput.value = '';
  }

  if (dom.mfaVerifyEnrollButton instanceof HTMLButtonElement) {
    dom.mfaVerifyEnrollButton.hidden = true;
  }

  if (dom.mfaSkipButton instanceof HTMLButtonElement) {
    dom.mfaSkipButton.hidden = true;
  }

  if (dom.mfaCancelEnrollButton instanceof HTMLButtonElement) {
    dom.mfaCancelEnrollButton.hidden = true;
  }

  if (dom.mfaStartEnrollButton instanceof HTMLButtonElement) {
    dom.mfaStartEnrollButton.hidden = false;
  }
};

const clearPasswordGate = () => {
  if (dom.passwordForm instanceof HTMLFormElement) {
    dom.passwordForm.reset();
  }
};

const renderPasswordGate = () => {
  const flowType = normalizeAuthLinkType(state.authFlow.pendingType) || 'recovery';
  const isInvite = flowType === 'invite';

  clearMfaGate();
  clearPasswordGate();
  state.authGate = 'password';
  setAuthGateVisible(true);
  showAuth();

  if (dom.passwordEyebrow) {
    dom.passwordEyebrow.textContent = isInvite ? 'Invitation acceptée' : 'Réinitialisation sécurisée';
  }

  if (dom.passwordTitle) {
    dom.passwordTitle.textContent = isInvite ? 'Créer votre mot de passe' : 'Choisir un nouveau mot de passe';
  }

  if (dom.passwordDescription) {
    dom.passwordDescription.textContent = isInvite
      ? 'Définissez maintenant votre mot de passe pour activer votre accès. La configuration 2FA s’ouvrira juste après.'
      : 'Choisissez un nouveau mot de passe pour sécuriser votre accès. La vérification 2FA reprendra ensuite automatiquement.';
  }

  if (dom.passwordHighlight) {
    dom.passwordHighlight.textContent = isInvite
      ? 'Votre invitation email a déjà été validée. Cette étape sert uniquement à définir votre mot de passe avant l’accès protégé.'
      : 'Votre lien de réinitialisation est bien reconnu. Enregistrez simplement votre nouveau mot de passe pour reprendre l’accès.';
  }

  if (dom.passwordHelp) {
    dom.passwordHelp.textContent =
      'Utilisez au minimum 8 caractères. Après validation, vous serez guidé vers la sécurité 2FA puis l’espace admin.';
  }

  focusInputSafely(dom.passwordInput);
};

const sanitizeMfaCode = (value) => String(value || '').replace(/\D/g, '').slice(0, 6);

const syncPinInput = (input) => {
  if (!(input instanceof HTMLInputElement)) {
    return '';
  }

  const normalizedValue = sanitizeMfaCode(input.value);
  if (input.value !== normalizedValue) {
    input.value = normalizedValue;
  }

  const wrap = input.closest('[data-admin-pin-input]');
  if (!(wrap instanceof HTMLElement)) {
    return normalizedValue;
  }

  const slots = Array.from(wrap.querySelectorAll('[data-admin-pin-slot]'));
  const activeIndex = normalizedValue.length >= 6 ? 5 : normalizedValue.length;

  slots.forEach((slot, index) => {
    if (!(slot instanceof HTMLElement)) {
      return;
    }

    const digit = normalizedValue[index] || '';
    slot.dataset.value = digit;
    slot.classList.toggle('is-filled', Boolean(digit));
    slot.classList.toggle('is-active', index === activeIndex && normalizedValue.length < 6);
  });

  wrap.dataset.complete = normalizedValue.length === 6 ? 'true' : 'false';
  return normalizedValue;
};

const focusInputSafely = (input) => {
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  window.requestAnimationFrame(() => {
    input.focus({ preventScroll: true });
    const length = input.value.length;
    input.setSelectionRange(length, length);
  });
};

const focusPrimaryMfaCodeInput = () => {
  if (!(dom.mfaGate instanceof HTMLElement) || dom.mfaGate.hidden) {
    return;
  }

  const candidates = Array.from(dom.mfaGate.querySelectorAll('[data-admin-pin-source], input[name="friendlyName"]'));
  const input = candidates.find(
    (entry) => entry instanceof HTMLInputElement && !entry.closest('[hidden]')
  );

  if (input instanceof HTMLInputElement) {
    focusInputSafely(input);
  }
};

const autoSubmitMfaCode = (input) => {
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const form = input.form;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (form.hidden || input.value.length !== 6 || state.mfa.verificationInProgress) {
    return;
  }

  if (form.dataset.autoSubmitting === 'true') {
    return;
  }

  form.dataset.autoSubmitting = 'true';
  form.requestSubmit();
  window.setTimeout(() => {
    delete form.dataset.autoSubmitting;
  }, 0);
};

const bindPinInput = (wrap) => {
  if (!(wrap instanceof HTMLElement) || wrap.dataset.pinBound === 'true') {
    return;
  }

  const input = wrap.querySelector('[data-admin-pin-source]');
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  wrap.dataset.pinBound = 'true';
  syncPinInput(input);

  wrap.addEventListener('click', () => {
    focusInputSafely(input);
  });

  input.addEventListener('focus', () => {
    syncPinInput(input);
  });

  input.addEventListener('input', () => {
    syncPinInput(input);
    autoSubmitMfaCode(input);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key.length === 1 && /\D/.test(event.key)) {
      event.preventDefault();
    }
  });

  input.addEventListener('paste', (event) => {
    event.preventDefault();
    const nextValue = sanitizeMfaCode(event.clipboardData?.getData('text') || '');
    input.value = nextValue;
    syncPinInput(input);
    autoSubmitMfaCode(input);
  });
};

const getAssetKey = (asset) => `${asset.assetSource || 'cloudinary'}:${asset.publicId}`;

const getAssetKind = (asset) => {
  if (asset.assetSource === 'external' || asset.resourceType === 'external-video' || asset.resourceType === 'video') {
    return 'video';
  }

  return 'image';
};

const getAssetDisplayKind = (asset) => {
  if (asset.assetSource === 'external' || asset.resourceType === 'external-video') {
    return 'youtube';
  }

  return asset.resourceType === 'video' ? 'video' : 'image';
};

const isAssetComplete = (asset) =>
  Boolean(String(asset.context?.alt || '').trim()) &&
  Boolean(String(asset.context?.alt_en || '').trim()) &&
  Array.isArray(asset.tags) &&
  asset.tags.length > 0;

const getAssetStatusLabel = (asset) => (isAssetComplete(asset) ? 'Complet' : 'A compléter');

const getAssetSearchText = (asset) =>
  [
    asset.publicId,
    asset.originalFilename,
    asset.displayTitle,
    asset.context?.title,
    asset.context?.alt,
    asset.context?.alt_en,
    ...(asset.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const moveItem = (items, fromIndex, toIndex) => {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);

  if (!moved) {
    return items;
  }

  next.splice(toIndex, 0, moved);
  return next;
};

const formatDate = (value) => {
  if (!value) {
    return 'Date non disponible';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const getPageSize = () => {
  if (window.innerWidth < 640) {
    return 6;
  }

  if (window.innerWidth < 1100) {
    return 8;
  }

  return 12;
};

const getAssetDisplayName = (asset) => {
  const candidates = [asset?.originalFilename, asset?.displayTitle, asset?.context?.title, asset?.context?.alt, asset?.publicId];
  const rawValue = candidates.find((value) => String(value || '').trim());
  const normalized = String(rawValue || '').trim();

  if (!normalized) {
    return 'Media';
  }

  return normalized.includes('/') ? normalized.split('/').pop() || normalized : normalized;
};

const getMediaInput = (name) =>
  dom.mediaForm instanceof HTMLFormElement ? dom.mediaForm.elements.namedItem(name) : null;

const setChoiceButtonsValue = (buttons, value) => {
  buttons.forEach((button) => {
    const isActive = button.dataset.value === value;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
};

const hasSelectedFolder = () => Boolean(state.selectedFolder);

const getAssetByKey = (assetKey) => state.assets.find((entry) => getAssetKey(entry) === assetKey) || null;

const getAssetFromEventTarget = (target) => {
  const card = target instanceof Element ? target.closest('.admin-asset-card[data-asset-key]') : null;

  if (!(card instanceof HTMLElement)) {
    return null;
  }

  return getAssetByKey(card.dataset.assetKey || '');
};

const isValidFolderMode = (mode) => ['none', 'create'].includes(mode);

const getFolderDisplayName = (folderPath) => {
  const normalized = normalizePath(folderPath);

  if (!normalized || normalized === config.rootFolder) {
    return 'Tous les dossiers';
  }

  return normalized.split('/').pop() || normalized;
};

const getRememberedMfa = () => {
  try {
    const raw = window.localStorage.getItem(ADMIN_MFA_REMEMBER_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const expiresAt = Number(parsed?.expiresAt || 0);
    const token = String(parsed?.token || '').trim();

    if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      window.localStorage.removeItem(ADMIN_MFA_REMEMBER_KEY);
      return null;
    }

    return {
      token,
      expiresAt,
    };
  } catch {
    return null;
  }
};

const clearRememberedMfa = () => {
  try {
    window.localStorage.removeItem(ADMIN_MFA_REMEMBER_KEY);
  } catch {
    return;
  }
};

const persistRememberedMfa = (token, expiresAt) => {
  if (!token || !Number.isFinite(expiresAt)) {
    clearRememberedMfa();
    return;
  }

  try {
    window.localStorage.setItem(
      ADMIN_MFA_REMEMBER_KEY,
      JSON.stringify({
        token,
        expiresAt,
      })
    );
  } catch {
    return;
  }
};

const openFolderDialog = (mode = 'create') => {
  state.folderDialogMode = mode === 'rename' ? 'rename' : 'create';

  if (dom.folderDialogEyebrow) {
    dom.folderDialogEyebrow.textContent = state.folderDialogMode === 'rename' ? 'Renommer' : 'Nouveau dossier';
  }

  if (dom.folderDialogTitle) {
    dom.folderDialogTitle.textContent = state.folderDialogMode === 'rename' ? 'Renommer le dossier' : 'Créer un dossier';
  }

  if (dom.folderDialogDescription) {
    dom.folderDialogDescription.textContent =
      state.folderDialogMode === 'rename'
        ? `Modifiez simplement le nom de ${getFolderDisplayName(state.currentFolder)}.`
        : 'Le dossier sera créé à la racine puis ouvert automatiquement.';
  }

  if (dom.folderDialogLabel) {
    dom.folderDialogLabel.textContent = state.folderDialogMode === 'rename' ? 'Nouveau nom' : 'Nom du dossier';
  }

  if (dom.folderDialogSubmit instanceof HTMLButtonElement) {
    dom.folderDialogSubmit.textContent = state.folderDialogMode === 'rename' ? 'Renommer' : 'Créer';
  }

  if (dom.folderDialogInput instanceof HTMLInputElement) {
    dom.folderDialogInput.value = state.folderDialogMode === 'rename' && hasSelectedFolder() ? getFolderDisplayName(state.currentFolder) : '';
  }

  if (dom.folderDialog instanceof HTMLDialogElement) {
    syncFolderDialogScrollLock(true);
    dom.folderDialog.showModal();
    dom.folderDialog.setAttribute('aria-hidden', 'false');
  }

  window.setTimeout(() => {
    dom.folderDialogInput?.focus();
    dom.folderDialogInput?.select();
  }, 0);
};

const closeFolderDialog = () => {
  if (dom.folderDialog instanceof HTMLDialogElement && dom.folderDialog.open) {
    dom.folderDialog.close();
    dom.folderDialog.setAttribute('aria-hidden', 'true');
  }

  syncFolderDialogScrollLock(false);

  if (dom.createFolderForm instanceof HTMLFormElement) {
    dom.createFolderForm.reset();
  }

  if (state.folderDialogReturnFocus instanceof HTMLElement) {
    state.folderDialogReturnFocus.focus();
  }

  state.folderDialogReturnFocus = null;
};

const syncFolderMode = () => {
  const mode = isValidFolderMode(state.folderMode) ? state.folderMode : 'none';

  dom.folderModeButtons.forEach((button) => {
    const isActive = button.dataset.adminFolderModeButton === mode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  dom.folderPanels.forEach((panel) => {
    if (panel instanceof HTMLElement) {
      panel.hidden = !mode || panel.dataset.adminFolderPanel !== mode;
    }
  });
};

const setFolderMode = (mode) => {
  if (!isValidFolderMode(mode)) {
    state.folderMode = 'none';
  } else if (mode !== 'none' && state.folderMode === mode) {
    state.folderMode = 'none';
  } else {
    state.folderMode = mode;
  }
  syncFolderMode();
};

const getFolderMatchScore = (folder, query) => {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  if (!normalizedQuery) {
    return 0;
  }

  const name = String(folder?.name || '').toLowerCase();
  const path = String(folder?.path || '').toLowerCase();

  if (name === normalizedQuery) {
    return 400;
  }

  if (path === normalizedQuery) {
    return 380;
  }

  if (name.startsWith(normalizedQuery)) {
    return 260;
  }

  if (path.startsWith(normalizedQuery)) {
    return 220;
  }

  if (name.includes(normalizedQuery)) {
    return 160;
  }

  if (path.includes(normalizedQuery)) {
    return 120;
  }

  return -1;
};

const getRankedFolders = (query) =>
  [...state.availableFolders]
    .map((folder) => ({
      folder,
      score: getFolderMatchScore(folder, query),
    }))
    .filter((entry) => !query || entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(left.folder?.name || '').localeCompare(String(right.folder?.name || ''), 'fr', {
        sensitivity: 'base',
      });
    })
    .map((entry) => entry.folder);

const getFilteredFolders = () => {
  const query = state.folderSearchQuery.trim();

  if (!query) {
    return state.availableFolders;
  }

  return getRankedFolders(query);
};

const getFolderSearchMatches = () => {
  const query = state.folderSearchQuery.trim();

  if (!query) {
    return state.availableFolders.slice(0, 6);
  }

  return getRankedFolders(query).slice(0, 6);
};

const setFolderSearchPanelOpen = (isOpen) => {
  state.folderSearchPanelOpen = isOpen;

  if (dom.folderSuggestionsPanel instanceof HTMLElement) {
    dom.folderSuggestionsPanel.hidden = !isOpen;
  }

  syncFolderSearchUI();
};

const syncFolderSearchUI = () => {
  const hasQuery = state.folderSearchQuery.trim().length > 0;

  if (dom.folderSearchField instanceof HTMLElement) {
    dom.folderSearchField.classList.toggle('has-value', hasQuery);
  }

  if (dom.folderSearchInput instanceof HTMLInputElement) {
    dom.folderSearchInput.setAttribute('aria-expanded', String(state.folderSearchPanelOpen && hasQuery));
  }

  if (dom.clearFolderSearchButton instanceof HTMLButtonElement) {
    dom.clearFolderSearchButton.hidden = !hasQuery;
    dom.clearFolderSearchButton.disabled = !hasQuery;
  }
};

const clearFolderSearch = ({ focusInput = true } = {}) => {
  state.folderSearchQuery = '';
  state.folderSearchActiveIndex = -1;

  if (dom.folderSearchInput instanceof HTMLInputElement) {
    dom.folderSearchInput.value = '';

    if (focusInput) {
      dom.folderSearchInput.focus();
    }
  }

  renderFolderSuggestions();
  renderFolders();
  syncFolderSearchUI();
};

const openFolderFromSearch = async (folderPath) => {
  if (!folderPath) {
    return;
  }

  const targetFolder = normalizePath(folderPath);
  closeAddMenu();
  state.showUploadStage = false;
  setFolderMode('none');
  setFolderSearchPanelOpen(false);
  state.folderSearchActiveIndex = -1;
  state.selectedFolder = targetFolder === normalizePath(config.rootFolder) ? null : targetFolder;
  state.currentFolder = targetFolder;
  state.parentFolder = state.selectedFolder ? config.rootFolder : null;
  setActivePane('library');
  renderFolders();
  syncFolderDrivenUI();
  syncAdminPane();
  setStatus(`Ouverture du dossier ${getFolderDisplayName(targetFolder)}...`, 'info');
  await loadFolder(targetFolder);
};

const registerFolderFromSearch = async () => {
  const query = state.folderSearchQuery.trim();

  if (!query) {
    return;
  }

  const path = await registerExistingFolder(query, state.currentFolder);
  setStatus(`Le dossier "${query}" est maintenant visible dans l'administration.`, 'success');
  state.folderSearchQuery = '';
  state.folderSearchActiveIndex = -1;

  if (dom.folderSearchInput instanceof HTMLInputElement) {
    dom.folderSearchInput.value = '';
  }

  syncFolderSearchUI();

  await openFolderFromSearch(path || state.currentFolder);
};

const renderFolderSuggestions = () => {
  if (!(dom.folderSuggestionsPanel instanceof HTMLElement)) {
    return;
  }

  dom.folderSuggestionsPanel.replaceChildren();

  const query = state.folderSearchQuery.trim();
  const matches = getFolderSearchMatches();

  if (!query) {
    setFolderSearchPanelOpen(false);
    return;
  }

  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'admin-search-empty';
    empty.innerHTML =
      '<p>Aucun dossier trouve.</p><button class="button-outline" type="button" data-admin-register-from-search>Afficher ce dossier dans l admin</button>';
    dom.folderSuggestionsPanel.append(empty);
    empty.querySelector('[data-admin-register-from-search]')?.addEventListener('click', () => {
      void registerFolderFromSearch();
    });
    setFolderSearchPanelOpen(true);
    return;
  }

  matches.forEach((folder, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-search-result';
    button.dataset.folderPath = folder.path;
    button.classList.toggle('is-active', index === state.folderSearchActiveIndex);
    const matchLabel = getFolderMatchScore(folder, query) >= 260 ? 'Correspondance directe' : 'Ouvrir ce dossier';
    const iconWrap = document.createElement('span');
    iconWrap.className = 'admin-search-result__icon';
    iconWrap.setAttribute('aria-hidden', 'true');
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'folder-open');
    iconWrap.append(icon);

    const copy = document.createElement('span');
    copy.className = 'admin-search-result__copy';
    const name = document.createElement('strong');
    name.textContent = folder.name;
    const hint = document.createElement('span');
    hint.textContent = matchLabel;
    copy.append(name, hint);

    button.append(iconWrap, copy);
    button.addEventListener('click', () => {
      void openFolderFromSearch(folder.path);
    });
    dom.folderSuggestionsPanel.append(button);
  });

  renderLucideIcons();
  setFolderSearchPanelOpen(true);
};

const getCurrentStepKey = () => {
  if (!hasSelectedFolder()) {
    return 'folder';
  }

  if (state.assets.length === 0) {
    return 'upload';
  }

  return 'review';
};

const getCurrentStepLabel = () => {
  const step = getCurrentStepKey();

  if (step === 'folder') {
    return 'Choisir un dossier';
  }

  if (step === 'upload') {
    return 'Ajouter les premiers médias';
  }

  return 'Contrôler et organiser la galerie';
};

const getActiveFiltersSummary = () => {
  const filters = [];

  if (state.filterType !== 'all') {
    filters.push(state.filterType === 'image' ? 'Photos' : 'Vidéos');
  }

  if (state.filterTag.trim()) {
    filters.push(`Tag: ${state.filterTag.trim()}`);
  }

  if (state.searchQuery.trim()) {
    filters.push('Recherche');
  }

  if (state.selectedOnly) {
    filters.push('Sélection');
  }

  return filters.length > 0 ? filters.join(' • ') : 'Aucun filtre';
};

const renderWorkspaceSummary = () => {
  const filteredAssets = getFilteredAssets();
  const visibleAssets = getVisibleAssets();
  const stepKey = getCurrentStepKey();
  const selectedFolderLabel = state.selectedFolder || 'Non sélectionné';
  const currentViewLabel = !hasSelectedFolder()
    ? 'En attente de sélection'
    : `${visibleAssets.length} média${visibleAssets.length > 1 ? 's' : ''} visible${visibleAssets.length > 1 ? 's' : ''} / ${filteredAssets.length}`;

  if (dom.currentStepLabel) {
    dom.currentStepLabel.textContent = getCurrentStepLabel();
  }

  if (dom.selectedFolderLabel) {
    dom.selectedFolderLabel.textContent = hasSelectedFolder() ? getFolderDisplayName(selectedFolderLabel) : selectedFolderLabel;
  }

  if (dom.currentViewLabel) {
    dom.currentViewLabel.textContent = currentViewLabel;
  }

  if (dom.folderHint) {
    dom.folderHint.textContent = hasSelectedFolder()
      ? state.showUploadStage
        ? `Ajout actif dans ${getFolderDisplayName(state.currentFolder)}.`
        : `${getFolderDisplayName(state.currentFolder)} est prêt.`
      : 'Choisissez un dossier.';
  }

  dom.stepCards.forEach((card) => {
    card.classList.toggle('is-active', card.dataset.adminStepCard === stepKey);
  });

  if (dom.librarySummary) {
    dom.librarySummary.hidden = !hasSelectedFolder();
  }

  if (dom.libraryTitle && !state.inlineFolderRenameActive) {
    dom.libraryTitle.textContent = hasSelectedFolder() ? getFolderDisplayName(state.currentFolder) : 'Dossier sélectionné';
  }

  if (dom.visibleCount) {
    dom.visibleCount.textContent = String(visibleAssets.length);
  }

  if (dom.filteredCount) {
    dom.filteredCount.textContent = String(filteredAssets.length);
  }

  if (dom.activeFiltersLabel) {
    dom.activeFiltersLabel.textContent = getActiveFiltersSummary();
  }
};

const setStatus = (message, stateName = 'info') => {
  if (!dom.status) {
    return;
  }

  dom.status.textContent = message;
  dom.status.dataset.state = stateName;
};

const setBusy = (button, isBusy, busyLabel) => {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.innerHTML || button.textContent || '';
  }

  button.disabled = isBusy;
  button.innerHTML = isBusy ? busyLabel : button.dataset.defaultLabel;
};

const syncDeleteFolderButtonState = (folderPath = state.currentFolder, isPending = false) => {
  if (!(dom.deleteFolderButton instanceof HTMLButtonElement)) {
    return;
  }

  const normalizedTarget = normalizePath(folderPath || '');
  const normalizedRoot = normalizePath(config.rootFolder);
  const isVisible = Boolean(normalizedTarget) && normalizedTarget !== normalizedRoot;

  dom.deleteFolderButton.hidden = !isVisible;
  dom.deleteFolderButton.disabled = isVisible ? isPending : false;
};

const beginFolderListLoading = () => {
  state.folderListLoadCount += 1;
  state.folderListTimedOut = false;

  if (state.folderListTimeoutHandle) {
    window.clearTimeout(state.folderListTimeoutHandle);
  }

  state.folderListTimeoutHandle = window.setTimeout(() => {
    if (state.folderListLoadCount > 0) {
      state.folderListTimedOut = true;
      renderFolders();
    }
  }, FOLDER_LIST_LOAD_TIMEOUT_MS);

  renderFolders();
};

const finishFolderListLoading = (didLoad = true) => {
  state.folderListLoadCount = Math.max(0, state.folderListLoadCount - 1);

  if (state.folderListLoadCount === 0) {
    state.folderListTimedOut = false;

    if (state.folderListTimeoutHandle) {
      window.clearTimeout(state.folderListTimeoutHandle);
      state.folderListTimeoutHandle = null;
    }
  }
};

const closeConfirmDialog = (confirmed = false) => {
  if (dom.confirmDialog instanceof HTMLElement) {
    dom.confirmDialog.hidden = true;
    dom.confirmDialog.setAttribute('aria-hidden', 'true');
  }

  const resolver = state.confirmResolver;
  state.confirmResolver = null;

  if (state.confirmReturnFocus instanceof HTMLElement && state.confirmReturnFocus.isConnected) {
    state.confirmReturnFocus.focus({ preventScroll: true });
  }

  state.confirmReturnFocus = null;

  if (typeof resolver === 'function') {
    resolver(Boolean(confirmed));
  }
};

const confirmDangerAction = async ({
  eyebrow = 'Confirmation',
  title = 'Confirmer la suppression',
  message = 'Cette action est définitive et ne peut pas être annulée.',
  target = '',
  confirmLabel = 'Supprimer',
} = {}) => {
  if (!(dom.confirmDialog instanceof HTMLElement) || !(dom.confirmSubmitButton instanceof HTMLButtonElement)) {
    return window.confirm(message);
  }

  if (typeof state.confirmResolver === 'function') {
    closeConfirmDialog(false);
  }

  state.confirmReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (dom.confirmEyebrow instanceof HTMLElement) {
    dom.confirmEyebrow.textContent = eyebrow;
  }

  if (dom.confirmTitle instanceof HTMLElement) {
    dom.confirmTitle.textContent = title;
  }

  if (dom.confirmMessage instanceof HTMLElement) {
    dom.confirmMessage.textContent = message;
  }

  if (dom.confirmTarget instanceof HTMLElement) {
    const normalizedTarget = String(target || '').trim();
    dom.confirmTarget.textContent = normalizedTarget;
    dom.confirmTarget.hidden = normalizedTarget === '';
  }

  dom.confirmSubmitButton.textContent = confirmLabel;
  dom.confirmDialog.hidden = false;
  dom.confirmDialog.setAttribute('aria-hidden', 'false');
  renderLucideIcons();

  window.setTimeout(() => {
    dom.confirmSubmitButton?.focus({ preventScroll: true });
  }, 0);

  return new Promise((resolve) => {
    state.confirmResolver = resolve;
  });
};

const setInputBusy = (input, isBusy) => {
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  input.readOnly = isBusy;
  input.dataset.translating = isBusy ? 'true' : 'false';
};

const copyTextToClipboard = async (value) => {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(normalized);
    return true;
  } catch {
    const input = document.createElement('input');
    input.value = normalized;
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    return copied;
  }
};

const getDefaultAdminPane = () => 'library';

const isValidAdminPane = (pane) => ['library', 'access', 'logs'].includes(pane);

const getAvailableAdminPanes = () => {
  const panes = ['library'];

  if (state.canManageUsers) {
    panes.push('access', 'logs');
  }

  return panes;
};

const AUDIT_ACTION_LABELS = {
  session_opened: 'Connexion',
  user_created: 'Compte créé',
  user_updated: 'Compte modifié',
  user_deleted: 'Compte supprimé',
  password_reset_link_created: 'Lien de reset généré',
  mfa_reset_for_user: '2FA réinitialisée',
  mfa_reset_self: '2FA personnelle réinitialisée',
  folder_created: 'Dossier créé',
  folder_renamed: 'Dossier renommé',
  folder_deleted: 'Dossier supprimé',
  folder_reordered: 'Ordre des dossiers modifié',
  asset_updated: 'Média modifié',
  asset_deleted: 'Média supprimé',
  asset_reordered: 'Ordre des médias modifié',
  assets_bulk_updated: 'Médias modifiés en lot',
  youtube_video_created: 'Vidéo ajoutée',
};

const AUDIT_TARGET_TYPE_LABELS = {
  user: 'Compte',
  asset: 'Média',
  folder: 'Dossier',
  gallery: 'Galerie',
  session: 'Session',
};

const formatAuditAction = (value) => {
  const action = String(value || '').trim();

  return AUDIT_ACTION_LABELS[action] || action.replace(/_/g, ' ');
};

const formatDateOnly = (value) => {
  if (!value) {
    return 'Date inconnue';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
  }).format(new Date(value));
};

const formatTimeOnly = (value) => {
  if (!value) {
    return '--:--';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const getRoleLabel = (value) => (String(value || '').trim().toLowerCase() === 'admin' ? 'Admin' : 'Utilisateur');

const isTechnicalAuditIdentifier = (value) => {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return false;
  }

  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ||
    (/^[a-z0-9_-]{24,}$/i.test(normalized) && !normalized.includes('@') && !normalized.includes('/'))
  );
};

const getAuditTargetTypeLabel = (value) => {
  const normalized = String(value || '').trim();
  return AUDIT_TARGET_TYPE_LABELS[normalized] || 'Élément';
};

const getAuditFolderLabel = (value) => {
  const normalized = String(value || '').trim();
  return normalized ? getFolderDisplayName(normalized) : '';
};

const getReadableAuditTargetLabel = (entry) => {
  const rawLabel = String(entry?.targetLabel || '').trim();
  const rawId = String(entry?.targetId || '').trim();
  const details = entry?.details && typeof entry.details === 'object' ? entry.details : {};

  if (rawLabel && !isTechnicalAuditIdentifier(rawLabel)) {
    return rawLabel;
  }

  const detailCandidates = [
    details.afterTitle,
    details.title,
    details.afterAlt,
    details.alt,
    details.afterDisplayName,
    details.displayName,
    details.nextPath,
    details.previousPath,
    details.folder,
    details.url,
  ]
    .map((value) => String(value || '').trim())
    .filter((value) => value && !isTechnicalAuditIdentifier(value));

  if (detailCandidates.length > 0) {
    return detailCandidates[0];
  }

  const targetTypeLabel = getAuditTargetTypeLabel(entry?.targetType);

  if (rawId && isTechnicalAuditIdentifier(rawId)) {
    return `${targetTypeLabel} #${rawId.slice(0, 8)}`;
  }

  if (rawLabel) {
    return rawLabel;
  }

  return targetTypeLabel;
};

const getPremiumAuditTargetLabel = (entry) => {
  const details = entry?.details && typeof entry.details === 'object' ? entry.details : {};
  const readableLabel = getReadableAuditTargetLabel(entry);
  const targetType = String(entry?.targetType || '').trim();

  if (targetType === 'user') {
    const name = String(details.afterDisplayName || details.displayName || '').trim();
    const email = String(entry?.targetLabel || '').trim().includes('@') ? String(entry.targetLabel).trim() : '';
    const primary = name || readableLabel || email || 'Compte client';
    return `Compte client - ${primary}`;
  }

  if (targetType === 'folder') {
    const folderName =
      String(details.nextName || details.previousName || '').trim() ||
      getAuditFolderLabel(details.nextPath || details.previousPath || details.folder || '') ||
      readableLabel;
    return `Dossier - ${folderName || 'Bibliothèque'}`;
  }

  if (targetType === 'gallery') {
    const folderName = getAuditFolderLabel(details.folder || '') || 'Bibliothèque';
    return `Galerie - ${folderName}`;
  }

  if (targetType === 'asset') {
    const isYoutube = details.assetSource === 'external' || details.resourceType === 'external-video' || entry?.action === 'youtube_video_created';
    const kindLabel = isYoutube ? 'Vidéo YouTube' : details.resourceType === 'video' ? 'Vidéo' : 'Photo';
    const title =
      String(details.afterTitle || details.title || details.afterAlt || details.alt || '').trim() ||
      readableLabel ||
      kindLabel;
    return `${kindLabel} - ${title}`;
  }

  if (targetType === 'session') {
    return `Session - ${String(entry?.actorEmail || readableLabel || 'Administration').trim()}`;
  }

  return readableLabel || getAuditTargetTypeLabel(targetType);
};

const getAuditDetailEntries = (entry) => {
  const details = entry?.details && typeof entry.details === 'object' ? entry.details : {};
  const hiddenKeys = new Set(['method', 'origin', 'userAgent', 'ip', 'sessionId']);
  const labels = {
    previousName: 'Ancien nom',
    nextName: 'Nouveau nom',
    previousPath: 'Ancien dossier',
    nextPath: 'Nouveau dossier',
    folder: 'Dossier',
    role: 'Rôle',
    displayName: 'Nom affiché',
    beforeRole: 'Rôle avant',
    afterRole: 'Rôle après',
    beforeDisplayName: 'Nom affiché avant',
    afterDisplayName: 'Nom affiché après',
    deletedCount: 'Facteurs supprimés',
    itemCount: 'Éléments',
    tags: 'Tags',
    beforeTags: 'Tags avant',
    afterTags: 'Tags après',
    url: 'Lien',
    resourceType: 'Type',
    assetSource: 'Source',
    alt: 'Titre FR',
    altEn: 'Titre EN',
    title: 'Titre',
    beforeTitle: 'Titre avant',
    afterTitle: 'Titre après',
    beforeAlt: 'Titre FR avant',
    afterAlt: 'Titre FR après',
    beforeAltEn: 'Titre EN avant',
    afterAltEn: 'Titre EN après',
    order: 'Ordre',
    beforeOrder: 'Ordre avant',
    afterOrder: 'Ordre après',
    mode: 'Mode',
  };

  const formatValue = (value) => {
    if (Array.isArray(value)) {
      return value.map((entryValue) => String(entryValue)).join(', ');
    }

    if (value && typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  };

  const consumedKeys = new Set();
  const pairEntries = [
    ['beforeRole', 'afterRole', 'Rôle'],
    ['beforeDisplayName', 'afterDisplayName', 'Nom affiché'],
    ['beforeTitle', 'afterTitle', 'Titre'],
    ['beforeAlt', 'afterAlt', 'Titre FR'],
    ['beforeAltEn', 'afterAltEn', 'Titre EN'],
    ['beforeTags', 'afterTags', 'Tags'],
    ['beforeOrder', 'afterOrder', 'Ordre'],
  ];

  const changeEntries = pairEntries
    .map(([beforeKey, afterKey, label]) => {
      const beforeValue = details[beforeKey];
      const afterValue = details[afterKey];
      const hasBefore = beforeValue !== null && beforeValue !== undefined && String(beforeValue).trim() !== '';
      const hasAfter = afterValue !== null && afterValue !== undefined && String(afterValue).trim() !== '';

      if (!hasBefore && !hasAfter) {
        return null;
      }

      consumedKeys.add(beforeKey);
      consumedKeys.add(afterKey);

      const beforeLabel = hasBefore ? formatValue(beforeValue) : 'Vide';
      const afterLabel = hasAfter ? formatValue(afterValue) : 'Vide';
      const value = hasBefore && hasAfter ? `${beforeLabel} -> ${afterLabel}` : hasAfter ? afterLabel : beforeLabel;

      return {
        label,
        value,
      };
    })
    .filter(Boolean);

  return Object.entries(details)
    .filter(
      ([key, value]) =>
        !hiddenKeys.has(key) &&
        !consumedKeys.has(key) &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ''
    )
    .map(([key, value]) => ({
      label: labels[key] || key,
      value: formatValue(value),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'fr', { sensitivity: 'base' }))
    .concat(changeEntries);
};

const getActiveLogsFiltersSummary = () => {
  const filters = [];

  if (state.logsFilters.action) {
    filters.push(formatAuditAction(state.logsFilters.action));
  }

  if (state.logsFilters.actorEmail.trim()) {
    filters.push(state.logsFilters.actorEmail.trim());
  }

  if (state.logsFilters.dateFrom) {
    filters.push(`du ${formatDateOnly(state.logsFilters.dateFrom)}`);
  }

  if (state.logsFilters.dateTo) {
    filters.push(`au ${formatDateOnly(state.logsFilters.dateTo)}`);
  }

  return filters.length > 0 ? filters.join(' • ') : 'Tous les événements';
};

const renderLogsSummary = () => {
  if (!(dom.logsSummary instanceof HTMLElement)) {
    return;
  }

  const resultLabel = `${state.logs.length} résultat${state.logs.length > 1 ? 's' : ''}`;
  const strong = document.createElement('strong');
  strong.textContent = resultLabel;
  const span = document.createElement('span');
  span.textContent = getActiveLogsFiltersSummary();
  dom.logsSummary.replaceChildren(strong, span);
};

const syncLogsFilterInputs = () => {
  const setDateInputValue = (input, value) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    if (input._flatpickr) {
      if (value) {
        input._flatpickr.setDate(value, false, 'Y-m-d');
      } else {
        input._flatpickr.clear();
      }
      return;
    }

    input.value = value;
  };

  if (dom.logsActionInput instanceof HTMLSelectElement) {
    dom.logsActionInput.value = state.logsFilters.action;
  }

  if (dom.logsActionLabel instanceof HTMLElement) {
    dom.logsActionLabel.textContent = getLogsActionTriggerLabel(state.logsFilters.action);
  }

  if (dom.logsEmailInput instanceof HTMLInputElement) {
    dom.logsEmailInput.value = state.logsFilters.actorEmail;
  }

  setDateInputValue(dom.logsDateFromInput, state.logsFilters.dateFrom);
  setDateInputValue(dom.logsDateToInput, state.logsFilters.dateTo);
};

const populateLogsActionOptions = () => {
  if (!(dom.logsActionInput instanceof HTMLSelectElement)) {
    return;
  }

  const currentValue = dom.logsActionInput.value;
  const options = Object.entries(AUDIT_ACTION_LABELS).sort((left, right) =>
    left[1].localeCompare(right[1], 'fr', {
      sensitivity: 'base',
    })
  );

  dom.logsActionInput.innerHTML = '<option value="">Toutes les actions</option>';

  options.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    dom.logsActionInput.append(option);
  });

  dom.logsActionInput.value = state.logsFilters.action || currentValue || '';
  renderLogsActionMenu();
  syncLogsFilterInputs();
};

const getLogsActionTriggerLabel = (value) => (value ? formatAuditAction(value) : 'Toutes les actions');

const setLogsActionMenuOpen = (isOpen) => {
  state.logsActionMenuOpen = Boolean(isOpen);

  if (dom.logsActionMenu instanceof HTMLElement) {
    dom.logsActionMenu.hidden = !state.logsActionMenuOpen;
  }

  if (dom.logsActionTrigger instanceof HTMLButtonElement) {
    dom.logsActionTrigger.setAttribute('aria-expanded', String(state.logsActionMenuOpen));
  }
};

const renderLogsActionMenu = () => {
  if (!(dom.logsActionMenu instanceof HTMLElement)) {
    return;
  }

  // #region debug-point D:logs-action-render
  reportAdminDebug('D', 'src/js/admin.js:renderLogsActionMenu', 'Render logs action menu', {
    currentValue: dom.logsActionInput instanceof HTMLSelectElement ? dom.logsActionInput.value : '',
  });
  // #endregion

  dom.logsActionMenu.replaceChildren();

  const options = [
    ['', 'Toutes les actions'],
    ...Object.entries(AUDIT_ACTION_LABELS).sort((left, right) =>
      left[1].localeCompare(right[1], 'fr', {
        sensitivity: 'base',
      })
    ),
  ];

  options.forEach(([value, label]) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'admin-select__option';
    option.textContent = label;
    option.dataset.value = value;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String((dom.logsActionInput instanceof HTMLSelectElement ? dom.logsActionInput.value : '') === value));
    option.classList.toggle('is-active', (dom.logsActionInput instanceof HTMLSelectElement ? dom.logsActionInput.value : '') === value);
    option.addEventListener('click', () => {
      if (dom.logsActionInput instanceof HTMLSelectElement) {
        dom.logsActionInput.value = value;
      }

      state.logsFilters.action = value;
      syncLogsFilterInputs();
      renderLogsActionMenu();
      setLogsActionMenuOpen(false);
    });
    dom.logsActionMenu.append(option);
  });
};

const renderLogs = () => {
  if (!dom.logsList) {
    return;
  }

  dom.logsList.replaceChildren();

  if (!state.canManageUsers) {
    return;
  }

  renderLogsSummary();

  if (!Array.isArray(state.logs) || state.logs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'Aucun log ne correspond aux filtres actuels.';
    dom.logsList.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'admin-logs-feed';

  state.logs.forEach((entry) => {
    const article = document.createElement('article');
    article.className = 'admin-log-entry';

    const top = document.createElement('div');
    top.className = 'admin-log-entry__top';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'admin-log-entry__title-block';

    const title = document.createElement('strong');
    title.className = 'admin-log-entry__title';
    title.textContent = formatAuditAction(entry.action);

    const subtitle = document.createElement('span');
    subtitle.className = 'admin-log-entry__subtitle';
    subtitle.textContent = getPremiumAuditTargetLabel(entry) || entry.actorEmail || 'Action système';

    titleBlock.append(title, subtitle);

    const date = document.createElement('div');
    date.className = 'admin-log-entry__date';
    const dateStrong = document.createElement('strong');
    dateStrong.textContent = formatDateOnly(entry.at);
    const dateSpan = document.createElement('span');
    dateSpan.textContent = formatTimeOnly(entry.at);
    date.replaceChildren(dateStrong, dateSpan);

    top.append(titleBlock, date);
    article.append(top);

    const meta = document.createElement('div');
    meta.className = 'admin-log-entry__meta';

    const metaItems = [];
    const actorLabel = entry.actorName || entry.actorEmail || 'Inconnue';
    const actorEmail = entry.actorEmail || '';
    const roleLabel = entry.actorRole ? getRoleLabel(entry.actorRole) : '';
    const targetLabel = getPremiumAuditTargetLabel(entry);

    metaItems.push({ label: 'Par', value: actorLabel });

    if (actorEmail && actorEmail !== actorLabel) {
      metaItems.push({ label: 'Email', value: actorEmail });
    }

    if (roleLabel) {
      metaItems.push({ label: 'Rôle', value: roleLabel });
    }

    if (
      targetLabel &&
      targetLabel !== actorLabel &&
      targetLabel !== actorEmail &&
      targetLabel !== subtitle.textContent
    ) {
      metaItems.push({ label: 'Cible', value: targetLabel });
    }

    metaItems.forEach((itemData) => {
      const badge = document.createElement('span');
      badge.className = 'admin-log-entry__badge';
      const label = document.createElement('span');
      label.textContent = itemData.label;
      const value = document.createElement('strong');
      value.textContent = itemData.value;
      badge.append(label, value);
      meta.append(badge);
    });

    if (meta.childElementCount > 0) {
      article.append(meta);
    }

    const detailEntries = getAuditDetailEntries(entry);
    if (detailEntries.length > 0) {
      const details = document.createElement('div');
      details.className = 'admin-log-entry__details';

      detailEntries.forEach((detail) => {
        const badge = document.createElement('span');
        badge.className = 'admin-log-entry__detail-badge';
        const label = document.createElement('span');
        label.textContent = detail.label;
        const value = document.createElement('strong');
        value.textContent = detail.value;
        badge.append(label, value);
        details.append(badge);
      });

      article.append(details);
    }

    list.append(article);
  });

  dom.logsList.append(list);
  renderLucideIcons();
};

const syncAdminPane = () => {
  const availablePanes = getAvailableAdminPanes();
  const pane =
    isValidAdminPane(state.activePane) && availablePanes.includes(state.activePane) ? state.activePane : getDefaultAdminPane();
  state.activePane = pane;
  const showLibrary = pane === 'library';
  const showAccess = pane === 'access' && state.canManageUsers;
  const showLogs = pane === 'logs' && state.canManageUsers;

  if (dom.shellSection instanceof HTMLElement) {
    dom.shellSection.dataset.activePane = pane;
  }

  if (dom.shellMain) {
    dom.shellMain.hidden = showAccess || showLogs;
  }

  if (dom.shellSidebar) {
    dom.shellSidebar.hidden = !(showAccess || showLogs);
  }

  if (dom.studioPanel) {
    dom.studioPanel.hidden = !showLibrary || hasSelectedFolder();
  }

  if (dom.libraryPanel) {
    dom.libraryPanel.hidden = !showLibrary || !hasSelectedFolder();
  }

  if (dom.usersPanel) {
    dom.usersPanel.hidden = !showAccess;
  }

  if (dom.logsPanel) {
    dom.logsPanel.hidden = !showLogs;
  }

  dom.paneButtons.forEach((button) => {
    const targetPane = button.dataset.adminPaneButton || '';
    const isAllowed = availablePanes.includes(targetPane);
    const isActive = targetPane === pane;
    button.hidden = !isAllowed;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
};

const setActivePane = (pane) => {
  state.activePane = isValidAdminPane(pane) ? pane : getDefaultAdminPane();
  syncAdminPane();
};

const showAuth = () => {
  dom.authSection?.removeAttribute('hidden');
  dom.shellSection?.setAttribute('hidden', 'true');
  dom.shellQuickActions?.setAttribute('hidden', 'true');
};

const showShell = () => {
  dom.authSection?.setAttribute('hidden', 'true');
  dom.shellSection?.removeAttribute('hidden');
  dom.shellQuickActions?.removeAttribute('hidden');
  renderLucideIcons();
  // #region debug-point E:shell-open
  void reportFolderSyncDebug('E', 'src/js/admin.js:showShell', 'Shell shown and quick actions toggled', {
    shellHidden: dom.shellSection?.hasAttribute?.('hidden') ?? null,
    quickActionsHidden: dom.shellQuickActions?.hasAttribute?.('hidden') ?? null,
  });
  // #endregion
  syncAdminPane();
};

const getSessionSyncKey = (session) =>
  session?.access_token ? `${session.user?.id || 'unknown'}:${session.access_token}` : 'signed-out';

const loadMfaContext = async () => {
  const [
    { data: assuranceData, error: assuranceError },
    { data: factorData, error: factorError },
  ] = await Promise.all([
    state.supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    state.supabase.auth.mfa.listFactors(),
  ]);

  if (assuranceError) {
    throw assuranceError;
  }

  if (factorError) {
    throw factorError;
  }

  state.mfa.currentLevel = assuranceData?.currentLevel || 'aal1';
  state.mfa.nextLevel = assuranceData?.nextLevel || 'aal1';
  state.mfa.allFactors = Array.isArray(factorData?.all) ? factorData.all : [];
  state.mfa.verifiedFactors = Array.isArray(factorData?.totp) ? factorData.totp : [];
  state.mfa.factorCount = state.mfa.verifiedFactors.length;

  if (!state.mfa.selectedFactorId && state.mfa.verifiedFactors.length > 0) {
    state.mfa.selectedFactorId = state.mfa.verifiedFactors[0].id;
  }

  renderMfaToolbarStatus();
};

const createMfaFactorButton = (factor, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-mfa-factor-button';
  button.classList.toggle('is-active', state.mfa.selectedFactorId === factor.id);
  const label = document.createElement('strong');
  label.textContent = getFactorLabel(factor, index);
  button.append(label);
  button.addEventListener('click', () => {
    state.mfa.selectedFactorId = factor.id;
    renderMfaChallengeGate();
  });
  return button;
};

const renderMfaChallengeGate = () => {
  clearMfaGate();
  state.mfa.gateMode = 'challenge';
  state.authGate = 'mfa';
  if (!state.mfa.selectedFactorId && state.mfa.verifiedFactors.length > 0) {
    state.mfa.selectedFactorId = state.mfa.verifiedFactors[0].id;
  }
  setAuthGateVisible(true);
  showAuth();

  if (dom.mfaEyebrow) {
    dom.mfaEyebrow.textContent = '';
  }

  if (dom.mfaTitle) {
    dom.mfaTitle.textContent = 'Valider votre code 2FA';
  }

  if (dom.mfaDescription) {
    dom.mfaDescription.textContent = '';
  }

  if (dom.mfaFactorList && state.mfa.verifiedFactors.length > 1) {
    dom.mfaFactorList.hidden = false;
    dom.mfaFactorList.replaceChildren(...state.mfa.verifiedFactors.map(createMfaFactorButton));
  } else if (dom.mfaFactorList) {
    dom.mfaFactorList.hidden = true;
    dom.mfaFactorList.replaceChildren();
  }

  if (dom.mfaChallengeForm instanceof HTMLFormElement) {
    dom.mfaChallengeForm.hidden = false;
  }

  focusPrimaryMfaCodeInput();
};

const renderMfaEnrollGate = ({ role, allowSkip, isManagement }) => {
  clearMfaGate();
  state.mfa.gateMode = isManagement ? 'manage' : allowSkip ? 'prompt' : 'enroll';
  state.authGate = 'mfa';
  setAuthGateVisible(true);
  showAuth();
  const hasVerifiedFactor = state.mfa.verifiedFactors.length > 0;
  const hasMultipleVerifiedFactors = state.mfa.verifiedFactors.length > 1;
  const friendlyNameInput = dom.mfaEnrollForm instanceof HTMLFormElement ? dom.mfaEnrollForm.elements.namedItem('friendlyName') : null;
  const friendlyNameField = friendlyNameInput instanceof HTMLInputElement ? friendlyNameInput.closest('.contact-field') : null;

  if (dom.mfaEyebrow) {
    dom.mfaEyebrow.textContent = isManagement ? 'Gestion 2FA' : 'Double authentification';
  }

  if (dom.mfaTitle) {
    dom.mfaTitle.textContent = isManagement
      ? 'Gerer votre 2FA'
      : role === 'admin'
        ? 'Configurer la 2FA obligatoire'
        : 'Configurer votre 2FA';
  }

  if (dom.mfaDescription) {
    dom.mfaDescription.textContent = isManagement
      ? hasVerifiedFactor
        ? "Un seul appareil 2FA peut etre actif sur ce compte. Reinitialisez la configuration actuelle pour la remplacer."
        : "Configurez l application d authentification qui servira de facteur unique sur ce compte."
      : role === 'admin'
        ? "Ce compte admin doit activer une double authentification TOTP avant de pouvoir utiliser le back-office."
        : "Pour renforcer la securite des acces invites, configurez une application d authentification maintenant. Vous pourrez continuer plus tard si besoin.";
  }

  if (dom.mfaSummary) {
    dom.mfaSummary.hidden = false;
    dom.mfaSummary.textContent =
      hasMultipleVerifiedFactors
        ? 'Plusieurs facteurs 2FA sont deja actifs sur ce compte. Reinitialisez la 2FA pour revenir a une seule configuration.'
        : hasVerifiedFactor
          ? 'Une application 2FA est deja active. Reinitialisez la 2FA si vous souhaitez la remplacer.'
          : `Le compte sera ajoute dans votre application sous ${MFA_ISSUER} avec l identifiant ${getMfaAccountLabel() || 'de cette session'}.`;
  }

  if (dom.mfaEnrollForm instanceof HTMLFormElement) {
    dom.mfaEnrollForm.hidden = false;
  }

  if (friendlyNameField instanceof HTMLElement) {
    friendlyNameField.hidden = hasVerifiedFactor;
  }

  if (friendlyNameInput instanceof HTMLInputElement) {
    friendlyNameInput.disabled = hasVerifiedFactor;
  }

  if (dom.mfaStartEnrollButton instanceof HTMLButtonElement) {
    dom.mfaStartEnrollButton.hidden = hasVerifiedFactor;
    dom.mfaStartEnrollButton.textContent = 'Configurer la 2FA';
  }

  if (dom.mfaSkipButton instanceof HTMLButtonElement) {
    dom.mfaSkipButton.hidden = !allowSkip;
  }

  if (dom.mfaCancelEnrollButton instanceof HTMLButtonElement) {
    dom.mfaCancelEnrollButton.hidden = !(isManagement || allowSkip);
    dom.mfaCancelEnrollButton.textContent = isManagement ? 'Retour a la console' : 'Retour';
  }

  if (dom.mfaResetCurrentButton instanceof HTMLButtonElement) {
    dom.mfaResetCurrentButton.hidden = !(isManagement && role === 'admin' && state.mfa.allFactors.length > 0);
  }

  focusPrimaryMfaCodeInput();
};

const proceedToShell = async (session) => {
  const sessionPayload = await apiRequest(getAdminApiPath('session'));
  config.cloudinaryCloudName = String(sessionPayload.cloudName || config.cloudinaryCloudName || '').trim();
  config.cloudinaryUploadPreset = String(sessionPayload.uploadPreset || config.cloudinaryUploadPreset || '').trim();
  config.rootFolder = String(sessionPayload.rootFolder || config.rootFolder || '').trim();
  state.role = sessionPayload.role || getRoleFromSessionUser(session?.user);
  state.canManageUsers = Boolean(sessionPayload.canManageUsers);
  state.bootstrapAdminEmail = normalizeEmail(sessionPayload.bootstrapAdminEmail || state.bootstrapAdminEmail);
  state.currentFolder = sessionPayload.rootFolder || config.rootFolder;
  state.mfa.currentLevel = sessionPayload?.mfa?.currentAal || state.mfa.currentLevel || 'aal1';
  state.mfa.factorCount = Number(sessionPayload?.mfa?.factorCount || state.mfa.verifiedFactors.length || 0);
  state.mfa.remembered = Boolean(sessionPayload?.mfa?.remembered);
  state.mfa.rememberedUntil = Number(sessionPayload?.mfa?.rememberedUntil || 0) || null;
  renderMfaToolbarStatus();
  showShell();
  setAuthGateVisible(false);
  state.mfa.managementReturnToShell = false;
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (dom.currentEmail) {
    dom.currentEmail.textContent = sessionPayload.email || session?.user?.email || '';
  }

  if (dom.roleBadge) {
    dom.roleBadge.textContent = state.role === 'admin' ? 'Admin' : 'Client';
  }

  if (dom.shellTitle) {
    dom.shellTitle.textContent =
      state.role === 'admin' ? 'Piloter les médias et les accès' : 'Déposer et organiser les médias';
  }

  if (dom.shellDescription) {
    dom.shellDescription.textContent =
      state.role === 'admin'
        ? "Créez les accès client, structurez les dossiers et contrôlez la qualité de publication depuis une seule interface."
        : "Ajoutez des photos et des vidéos, renseignez les bonnes informations puis vérifiez rapidement que tout est prêt.";
  }

  const loadTasks = [loadFolder(config.rootFolder), loadUsers()];
  if (state.canManageUsers) {
    loadTasks.push(loadLogs());
  } else {
    state.logs = [];
    renderLogs();
  }

  const loadResults = await Promise.allSettled(loadTasks);
  const loadError = getFirstRejectedReason(loadResults);
  if (loadError instanceof Error) {
    setStatus(loadError.message, 'error');
  } else if (loadError) {
    setStatus("Une partie de la console n'a pas pu se charger correctement.", 'error');
  }
};

const handleMfaSessionGate = async (session) => {
  const sessionPayload = await apiRequest(getAdminApiPath('session'));
  config.cloudinaryCloudName = String(sessionPayload.cloudName || config.cloudinaryCloudName || '').trim();
  config.cloudinaryUploadPreset = String(sessionPayload.uploadPreset || config.cloudinaryUploadPreset || '').trim();
  config.rootFolder = String(sessionPayload.rootFolder || config.rootFolder || '').trim();
  state.role = sessionPayload.role || getRoleFromSessionUser(session?.user);
  state.canManageUsers = Boolean(sessionPayload.canManageUsers);
  await loadMfaContext();
  state.mfa.currentLevel = sessionPayload?.mfa?.currentAal || state.mfa.currentLevel || 'aal1';
  state.mfa.factorCount = Number(sessionPayload?.mfa?.factorCount || state.mfa.verifiedFactors.length || 0);
  state.mfa.remembered = Boolean(sessionPayload?.mfa?.remembered);
  state.mfa.rememberedUntil = Number(sessionPayload?.mfa?.rememberedUntil || 0) || null;

  const hasVerifiedFactor = Boolean(sessionPayload?.mfa?.hasVerifiedFactor ?? state.mfa.verifiedFactors.length > 0);
  const mustChallenge = Boolean(sessionPayload?.mfa?.mustVerify);
  const mustEnroll = Boolean(sessionPayload?.mfa?.mustEnroll);
  const shouldPromptClientSetup = state.role === 'client' && !hasVerifiedFactor && !state.mfa.promptDismissed;

  if (mustChallenge) {
    renderMfaChallengeGate();
    setStatus('Entrez votre code 2FA pour terminer la connexion.', 'info');
    return false;
  }

  if (mustEnroll) {
    renderMfaEnrollGate({ role: state.role, allowSkip: false, isManagement: false });
    setStatus('Activez la double authentification de ce compte admin pour continuer.', 'info');
    return false;
  }

  if (state.mfa.managementReturnToShell) {
    renderMfaEnrollGate({ role: state.role, allowSkip: false, isManagement: true });
    setStatus('Gérez votre application 2FA depuis cet écran dédié.', 'info');
    return false;
  }

  if (shouldPromptClientSetup) {
    renderMfaEnrollGate({ role: state.role, allowSkip: true, isManagement: false });
    setStatus('Nous recommandons vivement d activer la 2FA avant de déposer des médias.', 'info');
    return false;
  }

  return true;
};

const openMfaManagement = async () => {
  if (!state.session) {
    return;
  }

  state.mfa.managementReturnToShell = true;
  await loadMfaContext();
  renderMfaEnrollGate({ role: state.role || 'client', allowSkip: false, isManagement: true });
  setStatus('Gérez l application 2FA liée à ce compte.', 'info');
};

const isLocalAdminApi = () => {
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '';
};

const getAdminApiPath = (route, searchParams) => {
  const normalizedRoute = String(route || '').replace(/^\/+|\/+$/g, '').trim();
  const query = new URLSearchParams(searchParams || {});

  if (isLocalAdminApi()) {
    return `/api/admin/${normalizedRoute}${query.toString() ? `?${query.toString()}` : ''}`;
  }

  if (normalizedRoute) {
    query.set('route', normalizedRoute);
  }

  return `/.netlify/functions/admin-api${query.toString() ? `?${query.toString()}` : ''}`;
};

const apiRequest = async (path, options = {}) => {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (state.session?.access_token) {
    headers.set('Authorization', `Bearer ${state.session.access_token}`);
  }

  const rememberedMfa = getRememberedMfa();
  if (rememberedMfa?.token) {
    headers.set('X-Admin-Mfa-Remember', rememberedMfa.token);
  }

  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body,
  });

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.message || "Une erreur est survenue lors de la requête d'administration.";

    if (response.status === 401) {
      await state.supabase?.auth.signOut();
    }

    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error || null;
    throw error;
  }

  return payload;
};

const syncMediaKindUI = () => {
  const mediaKind = dom.mediaKindInput instanceof HTMLInputElement ? dom.mediaKindInput.value : 'photo';
  const isVideo = mediaKind === 'video';

  setChoiceButtonsValue(dom.mediaKindButtons, mediaKind);

  if (dom.uploadTitle) {
    dom.uploadTitle.textContent = isVideo ? 'Ajouter une vidéo dans ce dossier' : 'Ajouter une image dans ce dossier';
  }

  if (dom.mediaSubmitButton instanceof HTMLButtonElement) {
    dom.mediaSubmitButton.textContent = isVideo ? 'Ajouter la vidéo YouTube' : "Ouvrir l'import image";
  }

  if (dom.guidanceCopy) {
    dom.guidanceCopy.innerHTML = isVideo
      ? "<strong>Vidéo :</strong> collez simplement un lien YouTube puis validez. La vidéo sera ajoutée directement dans le dossier."
      : "<strong>Image :</strong> après validation, l'outil d'import s'ouvre pour envoyer une ou plusieurs images dans le dossier sélectionné.";
  }

  if (dom.mediaTitleLabel) {
    dom.mediaTitleLabel.textContent = isVideo ? 'Titre visible' : 'Nom visible';
  }

  if (dom.mediaTitleInput instanceof HTMLInputElement) {
    dom.mediaTitleInput.placeholder = isVideo ? 'Titre affiché pour la vidéo' : 'Nom ou description visible côté site';
  }

  if (dom.videoUrlField instanceof HTMLElement) {
    dom.videoUrlField.hidden = !isVideo;
  }

  if (dom.videoUrlInput instanceof HTMLInputElement) {
    dom.videoUrlInput.required = isVideo;
    if (!isVideo) {
      dom.videoUrlInput.value = '';
    }
  }
};

const syncInlineFolderRenameUI = () => {
  const isEditing = state.inlineFolderRenameActive;

  if (dom.renameActions instanceof HTMLElement) {
    dom.renameActions.hidden = !isEditing;
  }

  if (dom.renameFolderButton instanceof HTMLButtonElement) {
    dom.renameFolderButton.hidden = !hasSelectedFolder() || isEditing;
  }

  if (dom.submitFolderRenameButton instanceof HTMLButtonElement) {
    dom.submitFolderRenameButton.disabled = !isEditing || state.inlineFolderRenameSaving;
  }

  if (dom.clearFolderRenameButton instanceof HTMLButtonElement) {
    dom.clearFolderRenameButton.disabled = !isEditing || state.inlineFolderRenameSaving;
  }
};

const clearInlineFolderRename = () => {
  if (!(dom.libraryTitle instanceof HTMLElement) || !state.inlineFolderRenameActive) {
    return;
  }

  dom.libraryTitle.textContent = '';
  dom.libraryTitle.focus();
};

const closeAssetMenu = () => {
  state.assetMenuKey = null;
  state.assetMenuPoint = null;

  if (dom.assetMenu instanceof HTMLElement) {
    // #region debug-point A:asset-menu-close
    reportAdminDebug('A', 'src/js/admin.js:closeAssetMenu', 'Close asset menu requested', {
      menuHiddenBefore: dom.assetMenu.hidden,
    });
    // #endregion
    dom.assetMenu.hidden = true;
    dom.assetMenu.dataset.state = 'closed';
    dom.assetMenu.style.removeProperty('left');
    dom.assetMenu.style.removeProperty('top');
  }
};

const closeAddMenu = () => {
  state.showAddMenu = false;

  if (dom.addMenu instanceof HTMLElement) {
    dom.addMenu.hidden = true;
  }

  if (dom.openAddMenuButton instanceof HTMLButtonElement) {
    dom.openAddMenuButton.setAttribute('aria-expanded', 'false');
  }
};

const openAddMenu = () => {
  if (!hasSelectedFolder()) {
    setStatus("Choisissez d'abord un dossier.", 'error');
    return;
  }

  state.showAddMenu = true;

  if (dom.addMenu instanceof HTMLElement) {
    dom.addMenu.hidden = false;
  }

  if (dom.openAddMenuButton instanceof HTMLButtonElement) {
    dom.openAddMenuButton.setAttribute('aria-expanded', 'true');
  }
};

const openAddStage = (kind = 'photo') => {
  if (!hasSelectedFolder()) {
    setStatus("Choisissez d'abord un dossier.", 'error');
    return;
  }

  if (dom.mediaKindInput instanceof HTMLInputElement) {
    dom.mediaKindInput.value = kind === 'video' ? 'video' : 'photo';
  }

  state.showUploadStage = true;
  closeAddMenu();
  syncMediaKindUI();
  syncFolderDrivenUI();
  setStatus(
    kind === 'video'
      ? `Ajout vidéo prêt pour ${getFolderDisplayName(state.currentFolder)}.`
      : `Ajout image prêt pour ${getFolderDisplayName(state.currentFolder)}.`,
    'info'
  );
};

const translateFrToEn = async (text) => {
  const normalized = String(text || '').trim();

  if (!normalized) {
    return '';
  }

  try {
    const payload = await apiRequest(getAdminApiPath('translate'), {
      method: 'POST',
      body: {
        text: normalized,
        source: 'fr',
        target: 'en',
      },
    });

    return String(payload?.translatedText || normalized).trim();
  } catch (error) {
    console.warn('La traduction automatique FR -> EN est indisponible, repli sur le texte source.', error);
    return normalized;
  }
};

const startInlineFolderRename = () => {
  if (!(dom.libraryTitle instanceof HTMLElement) || !hasSelectedFolder()) {
    return;
  }

  state.inlineFolderRenameActive = true;
  state.inlineFolderRenameOriginal = getFolderDisplayName(state.currentFolder);
  dom.libraryTitle.textContent = state.inlineFolderRenameOriginal;
  dom.libraryTitle.contentEditable = 'true';
  dom.libraryTitle.classList.add('is-editing');
  syncInlineFolderRenameUI();

  window.setTimeout(() => {
    dom.libraryTitle?.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(dom.libraryTitle);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, 0);
};

const cancelInlineFolderRename = () => {
  if (!(dom.libraryTitle instanceof HTMLElement)) {
    return;
  }

  state.inlineFolderRenameActive = false;
  state.inlineFolderRenameSaving = false;
  dom.libraryTitle.contentEditable = 'false';
  dom.libraryTitle.classList.remove('is-editing');
  dom.libraryTitle.textContent = hasSelectedFolder() ? getFolderDisplayName(state.currentFolder) : 'Dossier sélectionné';
  syncInlineFolderRenameUI();
};

const commitInlineFolderRename = async () => {
  if (!(dom.libraryTitle instanceof HTMLElement) || !hasSelectedFolder() || state.inlineFolderRenameSaving) {
    return;
  }

  const nextName = dom.libraryTitle.textContent?.trim() || '';
  const currentName = state.inlineFolderRenameOriginal || getFolderDisplayName(state.currentFolder);

  if (!nextName) {
    cancelInlineFolderRename();
    setStatus('Le nom du dossier ne peut pas être vide.', 'error');
    return;
  }

  if (nextName === currentName) {
    cancelInlineFolderRename();
    return;
  }

  state.inlineFolderRenameSaving = true;
  syncInlineFolderRenameUI();

  try {
    const payload = await apiRequest(getAdminApiPath('folders'), {
      method: 'PATCH',
      body: {
        path: state.currentFolder,
        name: nextName,
      },
    });

    state.inlineFolderRenameActive = false;
    state.inlineFolderRenameSaving = false;
    dom.libraryTitle.contentEditable = 'false';
    dom.libraryTitle.classList.remove('is-editing');
    syncInlineFolderRenameUI();
    await syncExplorerFolders();
    await loadFolder(payload?.path || config.rootFolder);
    setStatus(`Le dossier "${currentName}" a été renommé en "${nextName}".`, 'success');
  } catch (error) {
    state.inlineFolderRenameSaving = false;
    cancelInlineFolderRename();
    setStatus(error instanceof Error ? error.message : 'Le renommage du dossier a échoué.', 'error');
  }
};

const toggleAssetSelection = (assetKey) => {
  if (!assetKey) {
    return;
  }

  if (state.selectedAssetKeys.has(assetKey)) {
    state.selectedAssetKeys.delete(assetKey);
  } else {
    state.selectedAssetKeys.add(assetKey);
  }

  renderAssets();
};

const deleteAsset = async (asset, triggerButton = null) => {
  const assetKey = getAssetKey(asset);
  const confirmed = await confirmDangerAction({
    eyebrow: 'Suppression média',
    title: 'Supprimer ce média ?',
    message: 'Le média sera supprimé définitivement de la bibliothèque et du portfolio.',
    target: getAssetDisplayName(asset),
    confirmLabel: 'Supprimer le média',
  });

  if (!confirmed) {
    return;
  }

  setBusy(triggerButton, true, 'Suppression...');

  try {
    await apiRequest(getAdminApiPath('assets'), {
      method: 'DELETE',
      body: {
        publicId: asset.publicId,
        resourceType: asset.resourceType,
        assetSource: asset.assetSource,
      },
    });
    setStatus('Le média a été supprimé avec succès.', 'success');
    state.selectedAssetKeys.delete(assetKey);
    if (state.previewAssetKey === assetKey) {
      closePreview();
    }
    closeAssetMenu();
    await loadFolder(state.currentFolder);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'La suppression du média a échoué.', 'error');
  } finally {
    setBusy(triggerButton, false, 'Suppression...');
  }
};

const positionFloatingMenu = (menu, clientX, clientY) => {
  const anchorPoint = {
    getBoundingClientRect() {
      return {
        width: 0,
        height: 0,
        x: clientX,
        y: clientY,
        top: clientY,
        right: clientX,
        bottom: clientY,
        left: clientX,
      };
    },
  };

  return computePosition(anchorPoint, menu, {
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [
      offset(12),
      flip({
        padding: 14,
      }),
      shift({
        padding: 14,
      }),
    ],
  }).then(({ x, y }) => {
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  });
};

const openAssetMenu = (asset, clientX, clientY) => {
  if (!(dom.assetMenu instanceof HTMLElement) || !asset) {
    return;
  }

  // #region debug-point A:asset-menu-open
  reportAdminDebug('A', 'src/js/admin.js:openAssetMenu', 'Open asset menu requested', {
    assetKey: getAssetKey(asset),
    assetName: getAssetDisplayName(asset),
    x: clientX,
    y: clientY,
    menuHiddenBefore: dom.assetMenu.hidden,
  });
  // #endregion

  state.assetMenuKey = getAssetKey(asset);
  state.assetMenuPoint = {
    x: clientX,
    y: clientY,
  };
  dom.assetMenu.hidden = false;
  dom.assetMenu.dataset.state = 'open';
  dom.assetMenu.style.left = '0px';
  dom.assetMenu.style.top = '0px';
  window.requestAnimationFrame(() => {
    if (!(dom.assetMenu instanceof HTMLElement) || dom.assetMenu.hidden) {
      return;
    }

    positionFloatingMenu(dom.assetMenu, clientX, clientY);
  });
};

const clearAssetMenuLongPress = () => {
  if (state.assetMenuLongPressTimer) {
    window.clearTimeout(state.assetMenuLongPressTimer);
  }

  state.assetMenuLongPressTimer = null;
  state.assetMenuLongPressOrigin = null;
};

const shouldIgnoreAssetCardPress = (target) =>
  target instanceof Element && Boolean(target.closest('input, label, a, button'));

const scheduleAssetMenuLongPress = (event, asset) => {
  if (!asset || event.pointerType === 'mouse' || shouldIgnoreAssetCardPress(event.target)) {
    return;
  }

  clearAssetMenuLongPress();
  state.assetMenuLongPressOrigin = {
    x: event.clientX,
    y: event.clientY,
  };
  state.assetMenuLongPressTimer = window.setTimeout(() => {
    state.suppressPreviewUntil = Date.now() + 450;
    openAssetMenu(asset, event.clientX + 8, event.clientY + 8);
    clearAssetMenuLongPress();
  }, ASSET_MENU_LONG_PRESS_MS);
};

const initLogsDatePickers = () => {
  const pickerInputs = [dom.logsDateFromInput, dom.logsDateToInput];

  const syncVisibleWeekdays = (instance) => {
    const weekdayNodes = instance?.calendarContainer?.querySelectorAll('.flatpickr-weekday');

    if (!weekdayNodes?.length) {
      return;
    }

    weekdayNodes.forEach((node, index) => {
      const label = FLATPICKR_VISIBLE_WEEKDAYS[index];

      if (!(node instanceof HTMLElement) || !label) {
        return;
      }

      node.textContent = label;
      node.setAttribute('aria-label', label);
      node.title = label;
    });
  };

  pickerInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement) || input._flatpickr) {
      return;
    }

    // #region debug-point D:datepicker-init
    reportAdminDebug('D', 'src/js/admin.js:initLogsDatePickers', 'Init flatpickr input', {
      inputKey: input.dataset.adminLogsDateFrom !== undefined ? 'date-from' : 'date-to',
      placeholder: input.placeholder,
    });
    // #endregion

    flatpickr(input, {
      locale: FLATPICKR_FR_COMPACT,
      dateFormat: 'Y-m-d',
      altInput: true,
      altInputClass: 'admin-date-input',
      altFormat: 'd M Y',
      allowInput: false,
      disableMobile: true,
      monthSelectorType: 'static',
      static: false,
      onReady: [(_, __, instance) => syncVisibleWeekdays(instance)],
      onOpen: [(_, __, instance) => syncVisibleWeekdays(instance)],
      prevArrow:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      nextArrow:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });
  });
};

const syncFolderDrivenUI = () => {
  const isReady = hasSelectedFolder();
  const showUploadStage = isReady && state.showUploadStage;

  if (showUploadStage) {
    closeAssetMenu();
  }

  if (dom.mediaStage) {
    dom.mediaStage.hidden = !showUploadStage;
  }

  if (dom.mediaForm instanceof HTMLFormElement) {
    const elements = Array.from(dom.mediaForm.elements);
    elements.forEach((element) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLButtonElement || element instanceof HTMLTextAreaElement) {
        if (element.name === 'folder') {
          return;
        }

        element.disabled = !showUploadStage;
      }
    });
  }

  if (dom.openAddMenuButton instanceof HTMLButtonElement) {
    dom.openAddMenuButton.hidden = !isReady || showUploadStage;
  }

  if (!showUploadStage) {
    closeAddMenu();
  }

  dom.libraryControls.forEach((element) => {
    if (element instanceof HTMLElement) {
      element.hidden = !isReady || showUploadStage;
    }
  });

  if (dom.bulkForm instanceof HTMLFormElement) {
    dom.bulkForm.hidden = !isReady || showUploadStage || state.selectedAssetKeys.size === 0;
  }

  if (dom.libraryHelp) {
    dom.libraryHelp.hidden = !isReady || showUploadStage;
  }

  if (dom.librarySummary) {
    dom.librarySummary.hidden = !isReady || showUploadStage;
  }

  if (dom.libraryGate) {
    dom.libraryGate.hidden = isReady;
  }

  if (!isReady) {
    closeAddMenu();
    state.showUploadStage = false;

    if (dom.assetsEmpty) {
      dom.assetsEmpty.hidden = false;
      dom.assetsEmpty.textContent = 'Sélectionnez ou créez un dossier pour afficher les médias associés.';
    }

    if (dom.assetGrid) {
      dom.assetGrid.replaceChildren();
    }

    if (dom.paginationWrap) {
      dom.paginationWrap.hidden = true;
    }
  } else {
    if (dom.assetGrid instanceof HTMLElement) {
      dom.assetGrid.hidden = showUploadStage;
    }

    if (dom.selectionDock instanceof HTMLElement) {
      dom.selectionDock.hidden = showUploadStage || state.selectedAssetKeys.size === 0;
    }

    if (dom.assetsEmpty instanceof HTMLElement && showUploadStage) {
      dom.assetsEmpty.hidden = true;
    }

    if (dom.paginationWrap instanceof HTMLElement && showUploadStage) {
      dom.paginationWrap.hidden = true;
    }
  }

  syncInlineFolderRenameUI();
  renderWorkspaceSummary();
};

const getFilteredAssets = () => {
  const query = state.searchQuery.trim().toLowerCase();
  const tagQuery = state.filterTag.trim().toLowerCase();

  return state.assets.filter((asset) => {
    if (state.selectedOnly && !state.selectedAssetKeys.has(getAssetKey(asset))) {
      return false;
    }

    if (state.filterType !== 'all' && getAssetKind(asset) !== state.filterType) {
      return false;
    }

    if (tagQuery && !(asset.tags || []).some((tag) => tag.toLowerCase().includes(tagQuery))) {
      return false;
    }

    if (query && !getAssetSearchText(asset).includes(query)) {
      return false;
    }

    return true;
  });
};

const getVisibleAssets = () => {
  return getFilteredAssets();
};

const isSortEnabled = () => {
  const filteredAssets = getFilteredAssets();
  const visibleAssets = getVisibleAssets();

  return (
    !state.reorderInFlight &&
    state.searchQuery.trim() === '' &&
    state.filterTag.trim() === '' &&
    state.filterType === 'all' &&
    !state.selectedOnly &&
    filteredAssets.length === state.assets.length &&
    visibleAssets.length === state.assets.length
  );
};

const syncSortableState = () => {
  if (!state.sortable) {
    return;
  }

  state.sortable.option('disabled', !isSortEnabled());
};

const isFolderSortEnabled = () =>
  !state.folderReorderInFlight &&
  state.folderSearchQuery.trim() === '' &&
  state.activePane === 'library' &&
  !hasSelectedFolder() &&
  Array.isArray(state.availableFolders) &&
  state.availableFolders.length > 1;

const syncFolderSortableState = () => {
  const isEnabled = isFolderSortEnabled();

  if (dom.folderList instanceof HTMLElement) {
    dom.folderList.classList.toggle('is-reorder-ready', isEnabled);
    dom.folderList.classList.toggle('is-reorder-saving', state.folderReorderInFlight);
    dom.folderList.setAttribute('aria-disabled', isEnabled ? 'false' : 'true');
    dom.folderList.dataset.reorderState = state.folderReorderInFlight ? 'saving' : isEnabled ? 'ready' : 'locked';
  }

  if (!state.folderSortable) {
    return;
  }

  state.folderSortable.option('disabled', !isEnabled);
};

const updateSelectionCount = () => {
  const count = state.selectedAssetKeys.size;

  if (dom.selectionCount) {
    dom.selectionCount.textContent = `${count} média${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}`;
  }

  if (dom.statSelected) {
    dom.statSelected.textContent = String(count);
  }

  if (dom.selectionDock && dom.selectionDockCount) {
    dom.selectionDock.hidden = count === 0 || state.showUploadStage;
    dom.selectionDockCount.textContent = `${count} média${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}`;
  }

  if (dom.bulkForm instanceof HTMLFormElement) {
    dom.bulkForm.hidden = count === 0 || !hasSelectedFolder() || state.showUploadStage;
  }
};

const loadLogs = async () => {
  if (!state.canManageUsers) {
    state.logs = [];
    renderLogs();
    return;
  }

  const requestId = state.logsRequestId + 1;
  state.logsRequestId = requestId;
  const payload = await apiRequest(
    getAdminApiPath('logs', {
      action: state.logsFilters.action || '',
      actorEmail: state.logsFilters.actorEmail || '',
      dateFrom: state.logsFilters.dateFrom || '',
      dateTo: state.logsFilters.dateTo || '',
      limit: '500',
    })
  );

  if (requestId !== state.logsRequestId) {
    return;
  }

  state.logs = Array.isArray(payload?.entries) ? payload.entries : [];
  renderLogs();
};

const renderOverview = () => {
  const incompleteCount = state.assets.filter((asset) => !isAssetComplete(asset)).length;
  const videoCount = state.assets.filter((asset) => getAssetKind(asset) !== 'image').length;

  if (dom.statTotal) {
    dom.statTotal.textContent = String(state.assets.length);
  }

  if (dom.statIncomplete) {
    dom.statIncomplete.textContent = String(incompleteCount);
  }

  if (dom.statVideos) {
    dom.statVideos.textContent = String(videoCount);
  }

  updateSelectionCount();
};

const createBadge = (text, modifier = '') => {
  const badge = document.createElement('span');
  badge.className = `admin-badge${modifier ? ` ${modifier}` : ''}`;
  badge.textContent = text;
  return badge;
};

const renderUsers = () => {
  if (!dom.userList) {
    return;
  }

  dom.userList.replaceChildren();

  if (!state.canManageUsers) {
    dom.usersPanel?.setAttribute('hidden', 'true');
    return;
  }

  dom.usersPanel?.removeAttribute('hidden');

  if (!Array.isArray(state.users) || state.users.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = "Aucun compte client n'est disponible pour le moment.";
    dom.userList.append(empty);
    return;
  }

  state.users.forEach((user) => {
    const article = document.createElement('article');
    article.className = 'admin-user-card';

    const isCurrentUser = String(user.id || '').trim() === String(state.session?.user?.id || '').trim();
    const isBootstrapAdmin = normalizeEmail(user.email) === normalizeEmail(state.bootstrapAdminEmail);

    const header = document.createElement('div');
    header.className = 'admin-user-card__header';

    const identity = document.createElement('div');
    identity.className = 'admin-user-card__identity';

    const title = document.createElement('h3');
    title.className = 'admin-user-card__title';
    title.textContent = user.displayName || user.email;

    const email = document.createElement('p');
    email.className = 'admin-user-card__email';
    email.textContent = user.email;

    identity.append(title, email);

    const badges = document.createElement('div');
    badges.className = 'admin-user-card__badges';
    badges.append(
      createBadge(user.role === 'admin' ? 'Admin' : 'Utilisateur', user.role === 'admin' ? 'admin-badge--info' : 'admin-badge--success'),
      createBadge(user.mfaEnabled ? '2FA active' : '2FA à configurer', user.mfaEnabled ? 'admin-badge--success' : 'admin-badge--warning')
    );

    header.append(identity, badges);

    const meta = document.createElement('div');
    meta.className = 'admin-user-card__meta';
    meta.textContent = `Créé le ${formatDate(user.createdAt)}${user.lastSignInAt ? ` • dernière connexion ${formatDate(user.lastSignInAt)}` : ' • aucune connexion enregistrée'}`;

    const editor = document.createElement('div');
    editor.className = 'admin-user-card__editor';

    const displayField = document.createElement('label');
    displayField.className = 'contact-field admin-user-card__field';
    displayField.innerHTML = '<span>Nom affiché</span>';
    const displayInput = document.createElement('input');
    displayInput.type = 'text';
    displayInput.value = user.displayName || '';
    displayInput.placeholder = 'Nom visible du compte';
    displayField.append(displayInput);

    const roleField = document.createElement('label');
    roleField.className = 'contact-field admin-user-card__field';
    roleField.innerHTML = '<span>Rôle</span>';
    const roleSelect = document.createElement('select');
    roleSelect.className = 'admin-select';
    roleSelect.innerHTML = `
      <option value="client">Utilisateur</option>
      <option value="admin">Admin</option>
    `;
    roleSelect.value = user.role === 'admin' ? 'admin' : 'client';
    roleSelect.disabled = isBootstrapAdmin;
    roleField.append(roleSelect);

    editor.append(displayField, roleField);

    const actions = document.createElement('div');
    actions.className = 'admin-user-card__actions';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'button-outline';
    saveButton.innerHTML = '<i data-lucide="save" aria-hidden="true"></i><span>Enregistrer</span>';
    saveButton.addEventListener('click', async () => {
      setBusy(saveButton, true, 'Enregistrement...');

      try {
        await apiRequest(getAdminApiPath('users'), {
          method: 'PATCH',
          body: {
            userId: user.id,
            displayName: displayInput.value,
            role: roleSelect.value,
          },
        });
        setStatus(`Le compte ${user.email} a été mis à jour.`, 'success');
        await Promise.all([loadUsers(), loadLogs()]);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'La mise à jour du compte a échoué.', 'error');
      } finally {
        setBusy(saveButton, false, 'Enregistrement...');
      }
    });

    const resetPasswordButton = document.createElement('button');
    resetPasswordButton.type = 'button';
    resetPasswordButton.className = 'button-outline';
    resetPasswordButton.innerHTML = '<i data-lucide="key-round" aria-hidden="true"></i><span>Reset mot de passe</span>';
    resetPasswordButton.addEventListener('click', async () => {
      setBusy(resetPasswordButton, true, 'Génération...');

      try {
        const payload = await apiRequest(getAdminApiPath('users/password-reset-link'), {
          method: 'POST',
          body: {
            userId: user.id,
            redirectTo: `${window.location.origin}/admin.html`,
          },
        });

        const copied = await copyTextToClipboard(payload?.actionLink || '');
        setStatus(
          copied
            ? `Lien de reset copié pour ${user.email}.`
            : `Lien de reset généré pour ${user.email}.`,
          'success'
        );
        await loadLogs();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Le lien de réinitialisation a échoué.', 'error');
      } finally {
        setBusy(resetPasswordButton, false, 'Génération...');
      }
    });

    const resetMfaButton = document.createElement('button');
    resetMfaButton.type = 'button';
    resetMfaButton.className = 'button-outline';
    resetMfaButton.innerHTML = '<i data-lucide="shield" aria-hidden="true"></i><span>Reset 2FA</span>';
    resetMfaButton.disabled = isCurrentUser;
    resetMfaButton.addEventListener('click', async () => {
      const confirmed = window.confirm(`Réinitialiser la 2FA du compte ${user.email} ?`);

      if (!confirmed) {
        return;
      }

      setBusy(resetMfaButton, true, 'Réinitialisation...');

      try {
        await apiRequest(getAdminApiPath('users/mfa/reset'), {
          method: 'POST',
          body: {
            userId: user.id,
          },
        });
        setStatus(`La 2FA du compte ${user.email} a été réinitialisée.`, 'success');
        await Promise.all([loadUsers(), loadLogs()]);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'La réinitialisation 2FA a échoué.', 'error');
      } finally {
        setBusy(resetMfaButton, false, 'Réinitialisation...');
      }
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'button-outline admin-danger-button';
    deleteButton.innerHTML = '<i data-lucide="trash-2" aria-hidden="true"></i><span>Supprimer</span>';
    deleteButton.disabled = isBootstrapAdmin || isCurrentUser;
    deleteButton.addEventListener('click', async () => {
      const confirmed = await confirmDangerAction({
        eyebrow: 'Suppression compte',
        title: 'Supprimer ce compte ?',
        message: 'Le compte sera supprimé définitivement de l’administration.',
        target: user.email,
        confirmLabel: 'Supprimer le compte',
      });

      if (!confirmed) {
        return;
      }

      setBusy(deleteButton, true, 'Suppression...');

      try {
        await apiRequest(getAdminApiPath('users'), {
          method: 'DELETE',
          body: {
            userId: user.id,
          },
        });
        setStatus(`Le compte ${user.email} a été supprimé.`, 'success');
        await Promise.all([loadUsers(), loadLogs()]);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'La suppression du compte a échoué.', 'error');
      } finally {
        setBusy(deleteButton, false, 'Suppression...');
      }
    });

    actions.append(saveButton, resetPasswordButton, resetMfaButton, deleteButton);
    article.append(header, meta, editor, actions);
    dom.userList.append(article);
  });

  renderLucideIcons();
};

const renderFolders = () => {
  if (!dom.folderList) {
    return;
  }

  renderFolderSuggestions();
  dom.folderList.replaceChildren();
  const folders = getFilteredFolders();

  // #region debug-point D:render-folders
  void reportFolderSyncDebug('D', 'src/js/admin.js:renderFolders', 'Rendering folder list', {
    availableFoldersCount: Array.isArray(state.availableFolders) ? state.availableFolders.length : null,
    filteredFoldersCount: Array.isArray(folders) ? folders.length : null,
    samplePaths: Array.isArray(folders) ? folders.slice(0, 5).map((folder) => folder?.path || null) : [],
  });
  // #endregion

  if (state.folderListLoadCount > 0) {
    const loading = document.createElement('div');
    loading.className = 'admin-folder-loading';
    loading.innerHTML = `
      <div class="admin-folder-loading__spinner" aria-hidden="true"></div>
      <strong>${state.folderListTimedOut ? 'Le chargement des dossiers prend plus de temps que prévu.' : 'Chargement des dossiers...'}</strong>
      <p>${state.folderListTimedOut ? 'Relancez la liste si rien ne s’affiche après quelques secondes.' : 'Préparation de la liste des dossiers du portfolio.'}</p>
    `;

    if (state.folderListTimedOut) {
      const retryButton = document.createElement('button');
      retryButton.className = 'button-outline';
      retryButton.type = 'button';
      retryButton.textContent = 'Rafraîchir la liste';
      retryButton.addEventListener('click', () => {
        void loadFolder(normalizePath(state.currentFolder || config.rootFolder));
      });
      loading.append(retryButton);
    }

    dom.folderList.append(loading);
    return;
  }

  if (!Array.isArray(state.availableFolders) || state.availableFolders.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'Aucun dossier disponible pour le moment.';
    dom.folderList.append(empty);
    return;
  }

  if (folders.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = "Aucun dossier ne correspond à cette recherche.";
    dom.folderList.append(empty);
    syncFolderSortableState();
    return;
  }

  folders.forEach((folder) => {
    const isActive = state.selectedFolder === folder.path;
    const article = document.createElement('article');
    const openFolderChip = () => {
      if (state.folderDragActive || Date.now() < state.folderDragSuppressOpenUntil || state.folderReorderInFlight) {
        return;
      }

      void openFolderFromSearch(folder.path);
    };
    article.className = 'admin-folder-chip';
    article.dataset.folderPath = folder.path;
    article.classList.toggle('is-active', isActive);
    article.title = folder.name;
    const order = document.createElement('div');
    order.className = 'admin-folder-chip__order';
    order.setAttribute('aria-hidden', 'true');
    order.textContent = String(Number(folder.order ?? 0) + 1);

    const button = document.createElement('button');
    button.className = 'admin-folder-chip__button';
    button.type = 'button';
    button.setAttribute('aria-label', `Ouvrir le dossier ${folder.name}`);
    button.title = folder.name;

    const icon = document.createElement('i');
    icon.className = 'admin-folder-chip__icon';
    icon.setAttribute('data-lucide', isActive ? 'folder-open' : 'folder');
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('strong');
    label.className = 'admin-folder-chip__label';
    label.textContent = folder.name;

    button.append(icon, label);
    article.append(order, button);
    article.addEventListener('click', (event) => {
      openFolderChip();
    });
    dom.folderList.append(article);
  });

  renderLucideIcons();
  syncFolderSortableState();
};

const syncExplorerFolders = async () => {
  beginFolderListLoading();
  // #region debug-point A:folders-request
  void reportFolderSyncDebug('A', 'src/js/admin.js:syncExplorerFolders:start', 'Requesting admin folders payload', {
    path: getAdminApiPath('folders'),
  });
  // #endregion
  try {
    const payload = await apiRequest(getAdminApiPath('folders'));
    state.availableFolders = Array.isArray(payload?.folders) ? [...payload.folders] : [];
    // #region debug-point A:folders-response
    void reportFolderSyncDebug('A', 'src/js/admin.js:syncExplorerFolders:success', 'Admin folders payload received', {
      foldersCount: Array.isArray(payload?.folders) ? payload.folders.length : null,
      root: payload?.root || null,
      currentFolder: payload?.currentFolder || null,
      samplePaths: Array.isArray(payload?.folders) ? payload.folders.slice(0, 5).map((folder) => folder?.path || null) : [],
    });
    // #endregion
    finishFolderListLoading(true);
    renderFolders();
    initFolderSortable();
  } catch (error) {
    finishFolderListLoading(false);
    renderFolders();
    throw error;
  }
};

const renderPreviewBadges = (asset) => {
  if (!dom.previewBadges) {
    return;
  }

  dom.previewBadges.replaceChildren();
  dom.previewBadges.append(
    createBadge(
      getAssetDisplayKind(asset) === 'image' ? 'Photo' : getAssetDisplayKind(asset) === 'video' ? 'Vidéo' : 'YouTube',
      'admin-badge--info'
    ),
    createBadge(getAssetStatusLabel(asset), isAssetComplete(asset) ? 'admin-badge--success' : 'admin-badge--warning')
  );

  (asset.tags || []).forEach((tag) => {
    dom.previewBadges.append(createBadge(tag));
  });
};

const getPreviewDetailsText = (asset) => {
  const kindLabel =
    getAssetDisplayKind(asset) === 'image'
      ? 'Photo du portfolio'
      : getAssetDisplayKind(asset) === 'video'
        ? 'Vidéo du portfolio'
        : 'Vidéo YouTube intégrée';
  const createdAtLabel = formatDate(asset.createdAt);

  return createdAtLabel === 'Date non disponible' ? kindLabel : `${kindLabel} • ajoutée le ${createdAtLabel}`;
};

const syncPreviewScrollLock = (isOpen) => {
  if (!(document.body instanceof HTMLBodyElement)) {
    return;
  }

  const root = document.documentElement;

  if (isOpen) {
    if (!document.body.classList.contains('admin-preview-open')) {
      state.previewScrollY = window.scrollY || window.pageYOffset || 0;
      document.body.style.top = `-${state.previewScrollY}px`;
      document.body.style.setProperty(
        '--admin-preview-scrollbar-width',
        `${Math.max(window.innerWidth - root.clientWidth, 0)}px`
      );
    }

    root.classList.add('admin-preview-open');
    document.body.classList.add('admin-preview-open');
    return;
  }

  const previousScrollY = state.previewScrollY;
  root.classList.remove('admin-preview-open');
  document.body.classList.remove('admin-preview-open');
  document.body.style.removeProperty('top');
  document.body.style.removeProperty('--admin-preview-scrollbar-width');
  state.previewScrollY = 0;
  window.scrollTo({
    top: previousScrollY,
    behavior: 'auto',
  });
};

const syncFolderDialogScrollLock = (isOpen) => {
  if (!(document.body instanceof HTMLBodyElement)) {
    return;
  }

  const root = document.documentElement;

  if (isOpen) {
    if (!document.body.classList.contains('admin-folder-dialog-open')) {
      state.folderDialogScrollY = window.scrollY || window.pageYOffset || 0;
      document.body.style.top = `-${state.folderDialogScrollY}px`;
      document.body.style.setProperty(
        '--admin-folder-dialog-scrollbar-width',
        `${Math.max(window.innerWidth - root.clientWidth, 0)}px`
      );
    }

    root.classList.add('admin-folder-dialog-open');
    document.body.classList.add('admin-folder-dialog-open');
    return;
  }

  const previousScrollY = state.folderDialogScrollY;
  root.classList.remove('admin-folder-dialog-open');
  document.body.classList.remove('admin-folder-dialog-open');
  document.body.style.removeProperty('top');
  document.body.style.removeProperty('--admin-folder-dialog-scrollbar-width');
  state.folderDialogScrollY = 0;
  window.scrollTo({
    top: previousScrollY,
    behavior: 'auto',
  });
};

const closePreview = () => {
  state.previewAssetKey = null;
  syncPreviewScrollLock(false);

  if (dom.preview) {
    dom.preview.hidden = true;
    dom.preview.setAttribute('aria-hidden', 'true');
  }

  if (dom.previewMedia) {
    dom.previewMedia.replaceChildren();
  }

  if (state.previewReturnFocus instanceof HTMLElement && state.previewReturnFocus.isConnected) {
    state.previewReturnFocus.focus({ preventScroll: true });
  }

  state.previewReturnFocus = null;
};

const openPreview = (asset) => {
  state.previewAssetKey = getAssetKey(asset);
  state.previewReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (dom.previewMedia) {
    dom.previewMedia.replaceChildren();

    const kind = getAssetDisplayKind(asset);

    if (kind === 'youtube') {
      const frame = document.createElement('iframe');
      frame.className = 'admin-preview__frame';
      frame.src = asset.embedUrl || asset.secureUrl;
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      dom.previewMedia.append(frame);
    } else if (kind === 'video') {
      const video = document.createElement('video');
      video.className = 'admin-preview__video';
      video.src = asset.secureUrl;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      dom.previewMedia.append(video);
    } else {
      const image = document.createElement('img');
      image.className = 'admin-preview__image';
      image.src = asset.secureUrl;
      image.alt = asset.context?.alt || asset.displayTitle || asset.publicId;
      dom.previewMedia.append(image);
    }
  }

  if (dom.previewTitle) {
    dom.previewTitle.textContent = getAssetDisplayName(asset);
  }

  if (dom.previewDetails) {
    dom.previewDetails.textContent = getPreviewDetailsText(asset);
  }

  renderPreviewBadges(asset);

  if (dom.previewForm instanceof HTMLFormElement) {
    const altInput = dom.previewForm.elements.namedItem('alt');
    const altEnInput = dom.previewForm.elements.namedItem('altEn');
    const tagsInput = dom.previewForm.elements.namedItem('tags');

    if (altInput instanceof HTMLInputElement) {
      altInput.value = asset.context?.alt || '';
    }

    if (altEnInput instanceof HTMLInputElement) {
      altEnInput.value = asset.context?.alt_en || '';
    }

    if (tagsInput instanceof HTMLInputElement) {
      tagsInput.value = (asset.tags || []).join(', ');
    }
  }

  if (dom.preview) {
    dom.preview.hidden = false;
    dom.preview.setAttribute('aria-hidden', 'false');
  }

  syncPreviewScrollLock(true);

  const primaryCloseButton = dom.previewCloseButtons[0];

  if (primaryCloseButton instanceof HTMLElement) {
    primaryCloseButton.focus({ preventScroll: true });
  }
};

const renderPagination = (filteredAssets) => {
  if (!dom.paginationWrap || !dom.paginationLabel || !dom.loadMoreButton) {
    return;
  }

  dom.paginationWrap.hidden = true;
  dom.paginationLabel.textContent = '';
  dom.loadMoreButton.hidden = true;
};

const renderAssets = () => {
  if (!dom.assetGrid || !dom.assetsEmpty) {
    return;
  }

  if (!hasSelectedFolder()) {
    renderOverview();
    updateSelectionCount();
    syncFolderDrivenUI();
    syncSortableState();
    renderWorkspaceSummary();
    return;
  }

  if (dom.assetGrid instanceof HTMLElement) {
    dom.assetGrid.hidden = state.showUploadStage;
  }

  const validKeys = new Set(state.assets.map(getAssetKey));
  state.selectedAssetKeys = new Set([...state.selectedAssetKeys].filter((key) => validKeys.has(key)));

  const filteredAssets = getFilteredAssets();
  const visibleAssets = getVisibleAssets();

  dom.assetGrid.replaceChildren();
  renderOverview();
  renderPagination(filteredAssets);
  renderWorkspaceSummary();

  if (filteredAssets.length === 0) {
    dom.assetsEmpty.hidden = false;
    dom.assetsEmpty.textContent = 'Aucun média ne correspond aux critères actuels.';
    syncSortableState();
    return;
  }

  dom.assetsEmpty.hidden = true;

  visibleAssets.forEach((asset) => {
    const assetKey = getAssetKey(asset);
    const isSelected = state.selectedAssetKeys.has(assetKey);
    const orderIndex = state.assets.findIndex((entry) => getAssetKey(entry) === assetKey) + 1;
    const article = document.createElement('article');
    article.className = 'admin-asset-card';
    article.dataset.assetKey = assetKey;
    article.classList.toggle('is-selected', isSelected);
    article.classList.toggle('is-sort-enabled', isSortEnabled());
    article.title = getAssetDisplayName(asset);
    const image = document.createElement('img');
    image.className = 'admin-asset-card__image';
    image.src = asset.thumbnailUrl;
    image.alt = asset.context?.alt || getAssetDisplayName(asset);
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    image.addEventListener('click', () => {
      if (Date.now() < state.suppressPreviewUntil) {
        return;
      }

      openPreview(asset);
    });

    const content = document.createElement('div');
    content.className = 'admin-asset-card__content';

    const topRow = document.createElement('div');
    topRow.className = 'admin-asset-card__top';

    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'admin-asset-card__checkbox';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.addEventListener('change', () => {
      toggleAssetSelection(assetKey);
    });
    checkboxLabel.title = isSelected ? 'Retirer de la sélection' : 'Ajouter à la sélection';
    checkboxLabel.append(checkbox);

    const footer = document.createElement('div');
    footer.className = 'admin-asset-card__footer';

    const orderBadge = document.createElement('span');
    orderBadge.className = 'admin-asset-card__order';
    orderBadge.textContent = String(orderIndex);

      const title = document.createElement('span');
      title.className = 'admin-asset-card__caption';
      title.textContent = getAssetDisplayName(asset);

    topRow.append(checkboxLabel);
    footer.append(orderBadge, title);
    content.append(topRow, footer);
    article.append(image, content);
    dom.assetGrid.append(article);
  });

  renderLucideIcons();
  syncSortableState();
};

const initSortable = () => {
  if (!dom.assetGrid || state.sortable) {
    return;
  }

  state.sortable = new Sortable(dom.assetGrid, {
    animation: 220,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    draggable: '.admin-asset-card',
    delayOnTouchOnly: true,
    delay: 120,
    touchStartThreshold: 6,
    fallbackTolerance: 4,
    scroll: true,
    bubbleScroll: true,
    forceAutoScrollFallback: true,
    scrollSensitivity: 88,
    scrollSpeed: 18,
    ghostClass: 'is-sort-ghost',
    chosenClass: 'is-sort-chosen',
    dragClass: 'is-sort-drag',
    filter: 'input, a, button',
    preventOnFilter: false,
    disabled: true,
    onChoose: () => {
      dom.assetGrid?.classList.add('is-sorting');
    },
    onStart: () => {
      document.body.classList.add('is-admin-sorting');
    },
    onEnd: async ({ oldIndex, newIndex }) => {
      clearAssetMenuLongPress();
      document.body.classList.remove('is-admin-sorting');
      dom.assetGrid?.classList.remove('is-sorting');

      if (state.assetDropSettleTimer) {
        window.clearTimeout(state.assetDropSettleTimer);
      }

      dom.assetGrid?.classList.add('is-drop-settling');
      state.assetDropSettleTimer = window.setTimeout(() => {
        dom.assetGrid?.classList.remove('is-drop-settling');
      }, 340);

      if (!isSortEnabled() || !Number.isInteger(oldIndex) || !Number.isInteger(newIndex) || oldIndex === newIndex) {
        renderAssets();
        return;
      }

      const reorderedAssets = moveItem(state.assets, oldIndex, newIndex);
      state.assets = reorderedAssets;
      renderAssets();
      setStatus('Enregistrement du nouvel ordre en cours...', 'info');

      if (state.reorderInFlight) {
        await loadFolder(state.currentFolder);
        return;
      }

      state.reorderInFlight = true;
      syncSortableState();

      try {
        await apiRequest(getAdminApiPath('assets/reorder'), {
          method: 'POST',
          body: {
            items: reorderedAssets.map((entry) => ({
              publicId: entry.publicId,
              resourceType: entry.resourceType,
              assetSource: entry.assetSource || 'cloudinary',
            })),
          },
        });
        bumpPortfolioCacheVersion();
        setStatus('Le nouvel ordre a été enregistré et mis à jour dans la galerie.', 'success');
        await loadFolder(state.currentFolder);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Le réordonnancement des médias a échoué.', 'error');
        await loadFolder(state.currentFolder);
      } finally {
        state.reorderInFlight = false;
        syncSortableState();
      }
    },
  });
};

const initFolderSortable = () => {
  if (!dom.folderList || state.folderSortable) {
    return;
  }

  state.folderSortable = new Sortable(dom.folderList, {
    animation: 220,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    draggable: '.admin-folder-chip',
    delayOnTouchOnly: true,
    delay: 180,
    touchStartThreshold: 6,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 3,
    swapThreshold: 0.68,
    invertSwap: true,
    ghostClass: 'is-sort-ghost',
    chosenClass: 'is-sort-chosen',
    dragClass: 'is-sort-drag',
    disabled: true,
    onChoose: ({ item }) => {
      dom.folderList?.classList.add('is-sorting');
      item?.classList.add('is-drag-origin');
    },
    onStart: () => {
      state.folderDragActive = true;
      document.body.classList.add('is-admin-sorting');
      setStatus('Maintenez puis glissez une carte pour réorganiser les dossiers.', 'info');
    },
    onUnchoose: ({ item }) => {
      item?.classList.remove('is-drag-origin');
    },
    onEnd: async ({ oldIndex, newIndex, item }) => {
      state.folderDragActive = false;
      state.folderDragSuppressOpenUntil = Date.now() + 260;
      document.body.classList.remove('is-admin-sorting');
      dom.folderList?.classList.remove('is-sorting');
      item?.classList.remove('is-drag-origin');

      if (state.folderDropSettleTimer) {
        window.clearTimeout(state.folderDropSettleTimer);
      }

      dom.folderList?.classList.add('is-drop-settling');
      state.folderDropSettleTimer = window.setTimeout(() => {
        dom.folderList?.classList.remove('is-drop-settling');
      }, 340);

      if (
        !isFolderSortEnabled() ||
        !Number.isInteger(oldIndex) ||
        !Number.isInteger(newIndex) ||
        oldIndex === newIndex
      ) {
        renderFolders();
        return;
      }

      const reorderedFolders = moveItem(state.availableFolders, oldIndex, newIndex).map((folder, index) => ({
        ...folder,
        order: index,
      }));
      state.availableFolders = reorderedFolders;
      renderFolders();
      setStatus("Enregistrement du nouvel ordre des dossiers en cours...", 'info');

      if (state.folderReorderInFlight) {
        await syncExplorerFolders();
        return;
      }

      state.folderReorderInFlight = true;
      syncFolderSortableState();

      try {
        await apiRequest(getAdminApiPath('folders'), {
          method: 'PATCH',
          body: {
            mode: 'reorder',
            parentFolder: state.currentFolder || config.rootFolder,
            items: reorderedFolders.map((folder) => ({
              path: folder.path,
            })),
          },
        });
        bumpPortfolioCacheVersion();
        await syncExplorerFolders();
        setStatus("Le nouvel ordre des dossiers a été enregistré.", 'success');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Le réordonnancement des dossiers a échoué.", 'error');
        await syncExplorerFolders();
      } finally {
        state.folderReorderInFlight = false;
        syncFolderSortableState();
      }
    },
  });

  syncFolderSortableState();
};

const loadUsers = async () => {
  if (!state.canManageUsers) {
    state.users = [];
    renderUsers();
    return;
  }

  const payload = await apiRequest(getAdminApiPath('users'));
  state.users = Array.isArray(payload.users) ? payload.users : [];
  state.bootstrapAdminEmail = normalizeEmail(payload?.bootstrapAdminEmail || state.bootstrapAdminEmail);
  renderUsers();
};

const loadFolder = async (folder = config.rootFolder) => {
  beginFolderListLoading();
  const targetFolder = normalizePath(folder) || config.rootFolder;
  const requestId = state.folderRequestId + 1;
  state.folderRequestId = requestId;
  syncDeleteFolderButtonState(targetFolder, true);
  setStatus(`Synchronisation du dossier ${getFolderDisplayName(targetFolder)} en cours...`, 'info');

  // #region debug-point A:load-folder-start
  void reportFolderSyncDebug('A', 'src/js/admin.js:loadFolder:start', 'Loading folder payload', {
    targetFolder,
    requestId,
  });
  // #endregion

  try {
    const payload = await apiRequest(
      getAdminApiPath('assets', {
        folder: targetFolder,
      })
    );

    if (requestId !== state.folderRequestId) {
      finishFolderListLoading(false);
      return;
    }

    state.availableFolders = Array.isArray(payload?.folders) ? [...payload.folders] : [];

    // #region debug-point A:load-folder-success
    void reportFolderSyncDebug('A', 'src/js/admin.js:loadFolder:success', 'Folder payload received', {
      targetFolder,
      payloadCurrentFolder: payload?.currentFolder || null,
      payloadFolderCount: Array.isArray(payload?.folders) ? payload.folders.length : null,
      payloadAssetCount: Array.isArray(payload?.assets) ? payload.assets.length : null,
      sampleAssetIds: Array.isArray(payload?.assets) ? payload.assets.slice(0, 5).map((asset) => asset?.publicId || asset?.id || null) : [],
    });
    // #endregion

    state.currentFolder = payload.currentFolder;
    state.selectedFolder = normalizePath(payload.currentFolder) === normalizePath(config.rootFolder) ? null : payload.currentFolder;
    state.parentFolder = state.selectedFolder ? payload.parentFolder : null;
    state.currentPage = 1;
    state.selectedAssetKeys = new Set();
    state.folderSearchQuery = '';
    state.folderSearchActiveIndex = -1;
    state.showAddMenu = false;
    closeAssetMenu();
    state.inlineFolderRenameActive = false;
    state.inlineFolderRenameSaving = false;
    setFolderSearchPanelOpen(false);

    if (dom.folderSearchInput instanceof HTMLInputElement) {
      dom.folderSearchInput.value = '';
    }

    if (dom.rootFolder) {
      dom.rootFolder.textContent = payload.root;
    }

    if (dom.mediaFolderInput instanceof HTMLInputElement) {
      dom.mediaFolderInput.value = hasSelectedFolder() ? getFolderDisplayName(state.currentFolder) : 'Sélectionnez un dossier';
    }

    syncDeleteFolderButtonState(payload.currentFolder, false);

    finishFolderListLoading(true);
    syncAdminPane();
    renderFolders();
    initFolderSortable();
    state.assets = hasSelectedFolder() && Array.isArray(payload.assets) ? [...payload.assets] : [];
    syncFolderDrivenUI();
    renderAssets();
    initSortable();
    setStatus(
      hasSelectedFolder()
        ? `Dossier sélectionné : ${getFolderDisplayName(state.currentFolder)}. ${state.assets.length} média(s) disponible(s).`
        : "Sélectionnez maintenant un dossier pour afficher les actions d'ajout et la bibliothèque.",
      'success'
    );
  } catch (error) {
    syncDeleteFolderButtonState(state.currentFolder, false);
    finishFolderListLoading(false);
    renderFolders();
    throw error;
  }
};

const registerExistingFolder = async (folderName, parentFolder) => {
  const payload = await apiRequest(getAdminApiPath('folders'), {
    method: 'POST',
    body: {
      name: folderName,
      parentFolder,
      mode: 'register',
    },
  });

  return normalizePath(payload?.path || '');
};

const createUploadWidget = (folder, tags, contextString, mediaKind) => {
  if (!window.cloudinary?.createUploadWidget) {
    throw new Error('Le widget Cloudinary est indisponible dans ce navigateur.');
  }

  const isVideo = mediaKind === 'video';

  return window.cloudinary.createUploadWidget(
    {
      cloudName: config.cloudinaryCloudName,
      uploadPreset: config.cloudinaryUploadPreset,
      sources: ['local', 'url', 'camera', 'google_drive', 'dropbox'],
      multiple: true,
      maxFiles: isVideo ? 10 : 20,
      resourceType: isVideo ? 'video' : 'image',
      showAdvancedOptions: false,
      showCompletedButton: true,
      clientAllowedFormats: isVideo ? ['mp4', 'mov', 'webm'] : ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'],
      styles: {
        palette: {
          window: '#09090b',
          sourceBg: '#101113',
          windowBorder: '#27272a',
          tabIcon: '#e4e4e7',
          inactiveTabIcon: '#71717a',
          menuIcons: '#d4d4d8',
          link: '#e4e4e7',
          action: '#f4f4f5',
          inProgress: '#a1a1aa',
          complete: '#d4d4d8',
          error: '#f87171',
          textDark: '#050505',
          textLight: '#f4f4f5',
        },
      },
      prepareUploadParams: async (callback, paramsToSign) => {
        try {
          const data = await apiRequest(getAdminApiPath('upload-signature'), {
            method: 'POST',
            body: {
              paramsToSign: {
                ...paramsToSign,
                folder,
                tags: tags.join(','),
                context: contextString,
                resource_type: isVideo ? 'video' : 'image',
                upload_preset: config.cloudinaryUploadPreset,
              },
            },
          });

          callback({
            apiKey: config.cloudinaryApiKey || data.apiKey,
            folder,
            tags: tags.join(','),
            context: contextString,
            uploadPreset: config.cloudinaryUploadPreset,
            signature: data.signature,
            uploadSignatureTimestamp: paramsToSign.timestamp,
          });
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "La signature d'upload est introuvable.", 'error');
          callback({ cancel: true });
        }
      },
    },
    (error, result) => {
      if (error) {
        setStatus(error.message || 'Le widget Cloudinary a rencontré une erreur.', 'error');
        return;
      }

      if (result?.event === 'success') {
        setStatus('Import terminé. Mise à jour de la bibliothèque en cours...', 'success');
        void loadFolder(state.currentFolder);
      }
    }
  );
};

const translateAlt = async (sourceName, targetName) => {
  const sourceInput = getMediaInput(sourceName);
  const targetInput = getMediaInput(targetName);

  if (!(sourceInput instanceof HTMLInputElement) || !(targetInput instanceof HTMLInputElement)) {
    return;
  }

  const sourceText = sourceInput.value.trim();
  if (!sourceText) {
    setStatus("Renseignez d'abord le texte source avant de lancer la traduction automatique.", 'error');
    return;
  }

  const sourceLanguage = sourceName === 'altFr' ? 'fr' : 'en';
  const targetLanguage = targetName === 'altFr' ? 'fr' : 'en';

  setInputBusy(sourceInput, true);
  setInputBusy(targetInput, true);

  try {
    const payload = await apiRequest(getAdminApiPath('translate'), {
      method: 'POST',
      body: {
        text: sourceText,
        source: sourceLanguage,
        target: targetLanguage,
      },
    });

    targetInput.value = payload.translatedText || '';
    setStatus(`Traduction automatique ${sourceLanguage.toUpperCase()} -> ${targetLanguage.toUpperCase()} appliquée.`, 'success');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'La traduction automatique est indisponible.', 'error');
  } finally {
    setInputBusy(sourceInput, false);
    setInputBusy(targetInput, false);
  }
};

const syncSession = async (session) => {
  const sessionSyncKey = getSessionSyncKey(session);

  if (state.lastSessionSyncKey === sessionSyncKey && !state.mfa.verificationInProgress) {
    return;
  }

  state.lastSessionSyncKey = sessionSyncKey;
  state.session = session;

  if (!session) {
    state.mfa.promptDismissed = false;
    resetMfaState();
    clearPasswordGate();
    renderMfaToolbarStatus();
    setAuthGateVisible(false);
    showAuth();
    closePreview();
    state.currentFolder = config.rootFolder;
    state.selectedFolder = null;
    state.parentFolder = null;
    state.assets = [];
    state.selectedAssetKeys = new Set();
    state.activePane = getDefaultAdminPane();
    state.folderMode = 'none';
    state.folderSearchQuery = '';
    state.availableFolders = [];
    state.folderListLoadCount = 0;
    state.folderListTimedOut = false;
    if (state.folderListTimeoutHandle) {
      window.clearTimeout(state.folderListTimeoutHandle);
      state.folderListTimeoutHandle = null;
    }
    state.showAddMenu = false;
    state.showUploadStage = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
    syncFolderDrivenUI();
    syncFolderMode();
    syncAdminPane();
    setStatus("Connectez-vous pour accéder à l'espace médias sécurisé.", 'info');
    return;
  }

  try {
    if (normalizeAuthLinkType(state.authFlow.pendingType)) {
      renderPasswordGate();
      setStatus(
        state.authFlow.pendingType === 'invite'
          ? 'Choisissez maintenant votre mot de passe pour finaliser l’invitation.'
          : 'Définissez votre nouveau mot de passe pour terminer la réinitialisation.',
        'info'
      );
      return;
    }

    const canProceed = await handleMfaSessionGate(session);

    if (!canProceed) {
      return;
    }

    await proceedToShell(session);
  } catch (error) {
    state.lastSessionSyncKey = null;
    const message = error instanceof Error ? error.message : "L'initialisation de l'espace médias a échoué.";
    setStatus(message, 'error');
    if (!state.session) {
      showAuth();
      setAuthGateVisible(false);
    }
  }
};

const savePreviewChanges = async () => {
  if (!(dom.previewForm instanceof HTMLFormElement) || !state.previewAssetKey) {
    return;
  }

  const asset = state.assets.find((entry) => getAssetKey(entry) === state.previewAssetKey);

  if (!asset) {
    return;
  }

  const submitButton = dom.previewForm.querySelector('button[type="submit"]');
  setBusy(submitButton, true, 'Enregistrement...');

  try {
    const formData = new FormData(dom.previewForm);
    await apiRequest(getAdminApiPath('assets'), {
      method: 'PATCH',
      body: {
        publicId: asset.publicId,
        resourceType: asset.resourceType,
        assetSource: asset.assetSource,
        alt: formData.get('alt'),
        altEn: formData.get('altEn'),
        tags: parseTags(formData.get('tags')),
      },
    });
    setStatus('Les informations du média ont été mises à jour.', 'success');
    await loadFolder(state.currentFolder);
    const refreshedAsset = state.assets.find((entry) => getAssetKey(entry) === state.previewAssetKey);
    if (refreshedAsset) {
      openPreview(refreshedAsset);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'La mise à jour du média a échoué.', 'error');
  } finally {
    setBusy(submitButton, false, 'Enregistrement...');
  }
};

const cancelPendingEnrollment = async () => {
  if (!state.mfa.pendingFactor?.id) {
    return;
  }

  try {
    await state.supabase.auth.mfa.unenroll({ factorId: state.mfa.pendingFactor.id });
  } catch {
    // Ignore cleanup errors for partially configured factors.
  } finally {
    state.mfa.pendingFactor = null;
  }
};

const startMfaEnrollment = async () => {
  if (!(dom.mfaEnrollForm instanceof HTMLFormElement)) {
    return;
  }

  if (state.mfa.verifiedFactors.length > 0) {
    throw new Error('Une seule application 2FA peut etre configuree sur ce compte. Reinitialisez la 2FA actuelle pour la remplacer.');
  }

  const pendingFactor = state.mfa.allFactors.find((factor) => factor.factor_type === 'totp' && factor.status !== 'verified');
  if (pendingFactor?.id) {
    await state.supabase.auth.mfa.unenroll({ factorId: pendingFactor.id }).catch(() => undefined);
  }

  const friendlyNameInput = dom.mfaEnrollForm.elements.namedItem('friendlyName');
  const friendlyName =
    friendlyNameInput instanceof HTMLInputElement && friendlyNameInput.value.trim()
      ? friendlyNameInput.value.trim()
      : 'Application 2FA';

  const { data, error } = await state.supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
    issuer: MFA_ISSUER,
  });

  if (error || !data?.totp) {
    throw error || new Error("Impossible d'initialiser la configuration 2FA.");
  }

  state.mfa.pendingFactor = data;

  if (dom.mfaQrImage instanceof HTMLImageElement) {
    const qrCodeSource = String(data.totp.qr_code || '').trim();
    dom.mfaQrImage.src = qrCodeSource.startsWith('data:image/')
      ? qrCodeSource
      : `data:image/svg+xml;utf8,${encodeURIComponent(qrCodeSource)}`;
  }

  if (dom.mfaSecretInput instanceof HTMLInputElement) {
    dom.mfaSecretInput.value = data.totp.secret || '';
  }

  if (dom.mfaSummary) {
    dom.mfaSummary.hidden = false;
    dom.mfaSummary.textContent = `Application : ${MFA_ISSUER}. Identifiant : ${getMfaAccountLabel() || 'compte en cours'}.`;
  }

  if (dom.mfaQrWrap) {
    dom.mfaQrWrap.hidden = false;
  }

  if (dom.mfaCodeWrap) {
    dom.mfaCodeWrap.hidden = false;
  }

  if (dom.mfaStartEnrollButton instanceof HTMLButtonElement) {
    dom.mfaStartEnrollButton.hidden = true;
  }

  if (dom.mfaVerifyEnrollButton instanceof HTMLButtonElement) {
    dom.mfaVerifyEnrollButton.hidden = false;
  }

  focusPrimaryMfaCodeInput();
};

const verifyMfaCode = async (factorId, code) => {
  const normalizedCode = String(code || '').trim();

  if (!factorId || !normalizedCode) {
    throw new Error('Saisissez le code 2FA à 6 chiffres avant de continuer.');
  }

  state.mfa.verificationInProgress = true;

  try {
    const { error } = await state.supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: normalizedCode,
    });

    if (error) {
      throw error;
    }

    const {
      data: { session },
    } = await state.supabase.auth.getSession();

    state.session = session;

    const rememberPayload = await apiRequest(getAdminApiPath('mfa/remember'), {
      method: 'POST',
    });

    persistRememberedMfa(
      rememberPayload?.token,
      Number(rememberPayload?.expiresAt || Date.now() + ADMIN_MFA_REMEMBER_WINDOW_MS)
    );

    state.mfa.pendingFactor = null;
    state.mfa.promptDismissed = false;
    await syncSession(session);
  } finally {
    state.mfa.verificationInProgress = false;
  }
};

const resetCurrentMfa = async () => {
  await apiRequest(getAdminApiPath('mfa/reset'), {
    method: 'POST',
  });

  clearRememberedMfa();
  await state.supabase?.auth.signOut();
  setStatus('La 2FA de ce compte a ete reinitialisee. Reconnectez-vous pour configurer Clarisse Bonneu SiteWeb.', 'success');
};

const closeMfaGate = async ({ returnToShell = false, allowSkip = false } = {}) => {
  if (allowSkip) {
    state.mfa.promptDismissed = true;
  }

  await cancelPendingEnrollment();
  clearMfaGate();

  if (returnToShell && state.session) {
    state.mfa.managementReturnToShell = false;
    await proceedToShell(state.session);
    return;
  }

  if (allowSkip && state.session) {
    await proceedToShell(state.session);
    return;
  }

  setAuthGateVisible(false);
  showAuth();
};

const bindEvents = () => {
  dom.loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!(dom.loginForm instanceof HTMLFormElement)) {
      return;
    }

    const submitButton = dom.loginForm.querySelector('button[type="submit"]');
    setBusy(submitButton, true, 'Connexion...');

    try {
      const formData = new FormData(dom.loginForm);
      const email = normalizeEmail(formData.get('email'));
      const password = String(formData.get('password') || '');
      const { error } = await state.supabase.auth.signInWithPassword({ email, password });

      if (error) {
        throw error;
      }

      setStatus("Connexion réussie. Chargement de l'espace médias...", 'success');
      dom.loginForm.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connexion impossible.', 'error');
    } finally {
      setBusy(submitButton, false, 'Connexion...');
    }
  });

  dom.mfaChallengeForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!(dom.mfaChallengeForm instanceof HTMLFormElement)) {
      return;
    }

    const submitButton = dom.mfaChallengeForm.querySelector('button[type="submit"]');
    setBusy(submitButton, true, 'Verification...');

    try {
      const formData = new FormData(dom.mfaChallengeForm);
      await verifyMfaCode(state.mfa.selectedFactorId, formData.get('code'));
      setStatus('Double authentification validée. Chargement de la console...', 'success');
      dom.mfaChallengeForm.reset();
      dom.mfaChallengeForm.querySelectorAll('[data-admin-pin-source]').forEach((input) => {
        if (input instanceof HTMLInputElement) {
          syncPinInput(input);
        }
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Le code 2FA est invalide.', 'error');
      focusPrimaryMfaCodeInput();
    } finally {
      setBusy(submitButton, false, 'Verification...');
    }
  });

  dom.mfaCancelChallengeButton?.addEventListener('click', async () => {
    await state.supabase?.auth.signOut();
    setStatus('Connexion 2FA annulée.', 'info');
  });

  dom.mfaResetCurrentButton?.addEventListener('click', async () => {
    setBusy(dom.mfaResetCurrentButton, true, 'Reinitialisation...');

    try {
      await resetCurrentMfa();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "La reinitialisation 2FA a echoue.", 'error');
    } finally {
      setBusy(dom.mfaResetCurrentButton, false, 'Reinitialiser ma 2FA');
    }
  });

  dom.mfaStartEnrollButton?.addEventListener('click', async () => {
    setBusy(dom.mfaStartEnrollButton, true, 'Configuration...');

    try {
      await startMfaEnrollment();
      setStatus('Scannez le QR code puis saisissez le premier code genere pour activer la 2FA.', 'info');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "La configuration 2FA n'a pas pu démarrer.", 'error');
    } finally {
      setBusy(dom.mfaStartEnrollButton, false, 'Configurer la 2FA');
    }
  });

  dom.mfaEnrollForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!(dom.mfaEnrollForm instanceof HTMLFormElement)) {
      return;
    }

    const submitButton = dom.mfaEnrollForm.querySelector('[data-admin-mfa-verify-enroll]');
    setBusy(submitButton, true, 'Activation...');

    try {
      const formData = new FormData(dom.mfaEnrollForm);
      await verifyMfaCode(state.mfa.pendingFactor?.id, formData.get('code'));
      setStatus('La double authentification est maintenant active.', 'success');
      dom.mfaEnrollForm.querySelectorAll('[data-admin-pin-source]').forEach((input) => {
        if (input instanceof HTMLInputElement) {
          syncPinInput(input);
        }
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "L'activation 2FA a échoué.", 'error');
      focusPrimaryMfaCodeInput();
    } finally {
      setBusy(submitButton, false, 'Activation...');
    }
  });

  dom.mfaSkipButton?.addEventListener('click', async () => {
    if (!state.session) {
      return;
    }

    state.mfa.promptDismissed = true;
    await cancelPendingEnrollment();
    await proceedToShell(state.session);
    setStatus('Vous pourrez activer la 2FA plus tard depuis le bouton Sécurité 2FA.', 'info');
  });

  dom.mfaCancelEnrollButton?.addEventListener('click', async () => {
    await closeMfaGate({
      returnToShell: state.mfa.managementReturnToShell || state.mfa.gateMode === 'manage',
      allowSkip: state.mfa.gateMode === 'prompt',
    });
  });

  dom.resetPasswordButton?.addEventListener('click', async () => {
    const email = dom.emailInput instanceof HTMLInputElement ? normalizeEmail(dom.emailInput.value) : '';

    if (!email) {
      setStatus('Renseignez votre adresse email avant de demander une réinitialisation.', 'error');
      return;
    }

    setBusy(dom.resetPasswordButton, true, 'Envoi...');

    try {
      const { error } = await state.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin.html`,
      });

      if (error) {
        throw error;
      }

      setStatus('Email de réinitialisation envoyé si le compte existe déjà.', 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Envoi impossible.', 'error');
    } finally {
      setBusy(dom.resetPasswordButton, false, 'Envoi...');
    }
  });

  dom.passwordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!(dom.passwordForm instanceof HTMLFormElement)) {
      return;
    }

    const formData = new FormData(dom.passwordForm);
    const password = String(formData.get('password') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');

    if (password.length < 8) {
      setStatus('Le mot de passe doit contenir au minimum 8 caractères.', 'error');
      focusInputSafely(dom.passwordInput);
      return;
    }

    if (password !== confirmPassword) {
      setStatus('Les deux mots de passe doivent être identiques.', 'error');
      focusInputSafely(dom.passwordConfirmInput);
      return;
    }

    setBusy(dom.passwordSubmitButton, true, 'Validation...');

    try {
      const { error } = await state.supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      state.authFlow.pendingType = null;
      clearAuthLinkStateFromUrl();
      clearPasswordGate();
      state.lastSessionSyncKey = null;

      const {
        data: { session },
      } = await state.supabase.auth.getSession();

      setStatus('Mot de passe enregistré. Ouverture de l’étape 2FA...', 'success');
      await syncSession(session);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Impossible d'enregistrer ce mot de passe.", 'error');
    } finally {
      setBusy(dom.passwordSubmitButton, false, 'Validation...');
    }
  });

  dom.passwordCancelButton?.addEventListener('click', async () => {
    state.authFlow.pendingType = null;
    clearAuthLinkStateFromUrl();
    clearPasswordGate();
    clearRememberedMfa();
    await state.supabase?.auth.signOut();
    setStatus("L'étape de création du mot de passe a été annulée.", 'info');
  });

  dom.refreshButton?.addEventListener('click', () => {
    void loadFolder(state.currentFolder);
    void loadUsers();
  });

  dom.manageMfaButton?.addEventListener('click', () => {
    void openMfaManagement();
  });

  dom.signoutButton?.addEventListener('click', async () => {
    clearRememberedMfa();
    await state.supabase?.auth.signOut();
    setStatus("Vous avez été déconnecté de l'espace médias.", 'info');
  });

  dom.openFolderDialogButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-admin-open-folder-dialog') || 'create';

      if (mode === 'rename' && !hasSelectedFolder()) {
        setStatus("Choisissez d'abord un dossier a renommer.", 'error');
        return;
      }

      state.folderDialogReturnFocus = button instanceof HTMLElement ? button : null;
      openFolderDialog(mode);
    });
  });

  dom.closeFolderDialogButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeFolderDialog();
    });
  });

  dom.folderSearchInput?.addEventListener('input', (event) => {
    state.folderSearchQuery = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
    state.folderSearchActiveIndex = state.folderSearchQuery.trim() ? 0 : -1;
    renderFolderSuggestions();
    renderFolders();
    syncFolderSearchUI();
  });

  dom.folderSearchInput?.addEventListener('focus', () => {
    renderFolderSuggestions();
  });

  dom.folderSearchInput?.addEventListener('keydown', (event) => {
    const matches = getFolderSearchMatches();

    if (event.key === 'ArrowDown' && matches.length > 0) {
      event.preventDefault();
      state.folderSearchActiveIndex = Math.min(state.folderSearchActiveIndex + 1, matches.length - 1);
      renderFolderSuggestions();
      return;
    }

    if (event.key === 'ArrowUp' && matches.length > 0) {
      event.preventDefault();
      state.folderSearchActiveIndex = Math.max(state.folderSearchActiveIndex - 1, 0);
      renderFolderSuggestions();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();

      if (state.folderSearchQuery.trim()) {
        clearFolderSearch();
        return;
      }

      setFolderSearchPanelOpen(false);
    }
  });

  dom.clearFolderSearchButton?.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });

  dom.clearFolderSearchButton?.addEventListener('click', () => {
    clearFolderSearch();
  });

  dom.folderSearchForm?.addEventListener('submit', (event) => {
    event.preventDefault();

    const query = dom.folderSearchInput instanceof HTMLInputElement ? dom.folderSearchInput.value.trim().toLowerCase() : '';

    if (!query) {
      return;
    }

    const exactMatch =
      state.availableFolders.find((folder) => String(folder.name || '').toLowerCase() === query) ||
      state.availableFolders.find((folder) => String(folder.path || '').toLowerCase() === query) ||
      getFolderSearchMatches()[state.folderSearchActiveIndex] ||
      getFilteredFolders()[0];

    if (!exactMatch?.path) {
      setStatus("Aucun dossier ne correspond à cette recherche.", 'error');
      return;
    }

    void openFolderFromSearch(exactMatch.path);
  });

  dom.openAddMenuButton?.addEventListener('mousedown', (event) => {
    // Preserve the current layout while clicking the add button.
    // Without this, the editable folder title can blur/re-render first and swallow the click intermittently.
    event.preventDefault();
  });

  dom.openAddMenuButton?.addEventListener('click', () => {
    if (state.showAddMenu) {
      closeAddMenu();
      return;
    }

    openAddMenu();
    renderLucideIcons();
  });

  dom.renameFolderButton?.addEventListener('click', () => {
    startInlineFolderRename();
  });

  [dom.submitFolderRenameButton, dom.clearFolderRenameButton].forEach((button) => {
    button?.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
  });

  dom.submitFolderRenameButton?.addEventListener('click', () => {
    void commitInlineFolderRename();
  });

  dom.clearFolderRenameButton?.addEventListener('click', () => {
    clearInlineFolderRename();
  });

  dom.libraryTitle?.addEventListener('keydown', (event) => {
    if (!state.inlineFolderRenameActive) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      dom.libraryTitle?.blur();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelInlineFolderRename();
    }
  });

  dom.libraryTitle?.addEventListener('blur', () => {
    if (!state.inlineFolderRenameActive) {
      return;
    }

    void commitInlineFolderRename();
  });

  dom.backToFoldersButton?.addEventListener('click', async () => {
    closeAddMenu();
    state.showUploadStage = false;
    state.selectedFolder = null;
    state.parentFolder = null;
    state.assets = [];
    state.selectedAssetKeys = new Set();
    setActivePane('library');
    syncFolderDrivenUI();
    syncAdminPane();
    await loadFolder(config.rootFolder);
    setStatus('Retour à la racine des dossiers.', 'info');
  });

  dom.closeAddMenuButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeAddMenu();
    });
  });

  dom.addKindButtons.forEach((button) => {
    button.addEventListener('click', () => {
      openAddStage(button.getAttribute('data-admin-add-kind') || 'photo');
    });
  });

  dom.closeAddStageButton?.addEventListener('click', () => {
    state.showUploadStage = false;
    setActivePane('library');
    syncFolderDrivenUI();
    setStatus("L'ajout a été refermé pour ce dossier.", 'info');
  });

  dom.assetMenuActionButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const asset = state.assets.find((entry) => getAssetKey(entry) === state.assetMenuKey);

      if (!asset) {
        closeAssetMenu();
        return;
      }

      const action = button.getAttribute('data-admin-asset-menu-action');

      if (action === 'preview' || action === 'edit') {
        openPreview(asset);
        closeAssetMenu();
        return;
      }

      if (action === 'open') {
        window.open(asset.secureUrl, '_blank', 'noopener,noreferrer');
        closeAssetMenu();
        return;
      }

      if (action === 'select') {
        toggleAssetSelection(getAssetKey(asset));
        closeAssetMenu();
        return;
      }

      if (action === 'delete') {
        await deleteAsset(asset, button instanceof HTMLButtonElement ? button : null);
      }
    });
  });

  dom.paneButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextPane = button.dataset.adminPaneButton || getDefaultAdminPane();
      setActivePane(nextPane);

      if (nextPane === 'logs' && state.canManageUsers) {
        void loadLogs().catch((error) => {
          setStatus(error instanceof Error ? error.message : "Le chargement des logs a échoué.", 'error');
        });
      }
    });
  });

  dom.createFolderForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!(dom.createFolderForm instanceof HTMLFormElement)) {
      return;
    }

    const submitButton = dom.createFolderForm.querySelector('button[type="submit"]');
    setBusy(submitButton, true, state.folderDialogMode === 'rename' ? 'Renommage...' : 'Création...');

    try {
      const formData = new FormData(dom.createFolderForm);
      const folderName = String(formData.get('folderName') || '').trim();

      if (state.folderDialogMode === 'rename') {
        if (!hasSelectedFolder()) {
          throw new Error("Choisissez d'abord un dossier a renommer.");
        }

        const payload = await apiRequest(getAdminApiPath('folders'), {
          method: 'PATCH',
          body: {
            path: state.currentFolder,
            name: folderName,
          },
        });

        setStatus(`Le dossier "${getFolderDisplayName(state.currentFolder)}" a été renommé.`, 'success');
        closeFolderDialog();
        state.showUploadStage = false;
        await syncExplorerFolders();
        await loadFolder(payload?.path || config.rootFolder);
      } else {
        const payload = await apiRequest(getAdminApiPath('folders'), {
          method: 'POST',
          body: {
            name: folderName,
            parentFolder: config.rootFolder,
          },
        });

        const createdFolderPath = payload?.path || normalizePath(`${config.rootFolder}/${folderName}`);
        closeFolderDialog();
        state.showUploadStage = false;
        state.selectedFolder = createdFolderPath;
        state.currentFolder = createdFolderPath;
        state.parentFolder = config.rootFolder;
        state.assets = [];
        state.selectedAssetKeys = new Set();
        setActivePane('library');
        syncFolderDrivenUI();
        syncAdminPane();

        if (dom.assetsEmpty instanceof HTMLElement) {
          dom.assetsEmpty.hidden = false;
          dom.assetsEmpty.textContent = `Ouverture du dossier "${folderName}"...`;
        }

        if (dom.assetGrid instanceof HTMLElement) {
          dom.assetGrid.replaceChildren();
        }

        setStatus(`Le dossier "${folderName}" a été créé. Ouverture en cours...`, 'info');
        await loadFolder(createdFolderPath);
        openAddMenu();
        renderLucideIcons();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "L'action sur le dossier a échoué.", 'error');
    } finally {
      setBusy(submitButton, false, state.folderDialogMode === 'rename' ? 'Renommage...' : 'Création...');
    }
  });

  dom.folderDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeFolderDialog();
  });

  dom.folderDialog?.addEventListener('click', (event) => {
    if (event.target === dom.folderDialog) {
      closeFolderDialog();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;

    if (
      target instanceof Node &&
      !(dom.folderSearchForm instanceof HTMLFormElement && dom.folderSearchForm.contains(target))
    ) {
      setFolderSearchPanelOpen(false);
    }

    if (
      target instanceof Node &&
      !(dom.addMenu instanceof HTMLElement && dom.addMenu.contains(target)) &&
      !(dom.openAddMenuButton instanceof HTMLButtonElement && dom.openAddMenuButton.contains(target))
    ) {
      closeAddMenu();
    }

    if (
      target instanceof Node &&
      !(dom.assetMenu instanceof HTMLElement && dom.assetMenu.contains(target))
    ) {
      // #region debug-point A:document-click-close
      reportAdminDebug('A', 'src/js/admin.js:documentClick', 'Document click closes asset menu', {
        targetTag: target instanceof Element ? target.tagName : 'unknown',
        targetClass: target instanceof Element ? target.className || '' : '',
        assetMenuHiddenBefore: dom.assetMenu instanceof HTMLElement ? dom.assetMenu.hidden : null,
      });
      // #endregion
      closeAssetMenu();
    }

    if (
      target instanceof Node &&
      !(dom.logsActionPicker instanceof HTMLElement && dom.logsActionPicker.contains(target))
    ) {
      setLogsActionMenuOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAssetMenu();
      setLogsActionMenuOpen(false);
    }
  });

  window.addEventListener('resize', () => {
    closeAssetMenu();
  });

  window.addEventListener(
    'scroll',
    () => {
      closeAssetMenu();
    },
    true
  );

  dom.deleteFolderButton?.addEventListener('click', async () => {
    if (!state.currentFolder || state.currentFolder === config.rootFolder) {
      return;
    }

    const confirmed = await confirmDangerAction({
      eyebrow: 'Suppression dossier',
      title: 'Supprimer ce dossier ?',
      message: 'Le dossier doit être vide pour être supprimé. Cette action est définitive.',
      target: getFolderDisplayName(state.currentFolder),
      confirmLabel: 'Supprimer le dossier',
    });
    if (!confirmed) {
      return;
    }

    setBusy(dom.deleteFolderButton, true, 'Suppression...');

    try {
      const parentFolder = state.parentFolder || config.rootFolder;
      await apiRequest(getAdminApiPath('folders'), {
        method: 'DELETE',
        body: {
          path: state.currentFolder,
        },
      });
      setStatus('Le dossier a été supprimé avec succès.', 'success');
      state.showUploadStage = false;
      await syncExplorerFolders();
      await loadFolder(parentFolder);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'La suppression du dossier a échoué.', 'error');
    } finally {
      setBusy(dom.deleteFolderButton, false, 'Suppression...');
    }
  });

  dom.mediaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!(dom.mediaForm instanceof HTMLFormElement)) {
      return;
    }

    if (!hasSelectedFolder()) {
      setStatus("Sélectionnez d'abord un dossier.", 'error');
      return;
    }

    const formData = new FormData(dom.mediaForm);
    const folder = normalizePath(state.currentFolder || state.selectedFolder || config.rootFolder);
    const mediaKind = String(formData.get('mediaKind') || 'photo').trim();
    const tags = parseTags(formData.get('tags'));
    const altFr = String(formData.get('altFr') || '').trim();
    const altEn = String(formData.get('altEn') || '').trim() || (altFr ? await translateFrToEn(altFr) : '');
    const videoUrl = String(formData.get('videoUrl') || '').trim();

    const contextString = createContextString({
      alt: altFr,
      alt_en: altEn,
    });

    try {
      if (mediaKind === 'video') {
        if (!videoUrl) {
          throw new Error('Le lien YouTube est obligatoire pour ajouter une vidéo.');
        }

        setBusy(dom.mediaSubmitButton, true, 'Ajout...');
        await apiRequest(getAdminApiPath('youtube-videos'), {
          method: 'POST',
          body: {
            folder,
            url: videoUrl,
            title: altFr,
            alt: altFr,
            altEn,
            tags,
          },
        });
        dom.mediaForm.reset();
        if (dom.mediaKindInput instanceof HTMLInputElement) {
          dom.mediaKindInput.value = 'video';
        }
        syncMediaKindUI();
        await loadFolder(folder);
        state.showUploadStage = false;
        syncFolderDrivenUI();
        setStatus('La vidéo YouTube a été ajoutée au dossier.', 'success');
        return;
      }

      setBusy(dom.mediaSubmitButton, true, 'Ouverture...');
      const widget = createUploadWidget(folder, tags, contextString, mediaKind);
      widget.open();
      setStatus("L'outil d'import est ouvert pour les fichiers sélectionnés.", 'info');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "L'outil d'import ne peut pas s'ouvrir.", 'error');
    } finally {
      setBusy(dom.mediaSubmitButton, false, mediaKind === 'video' ? 'Ajout...' : 'Ouverture...');
    }
  });

  const syncUserRoleUI = () => {
    const role = dom.userRoleInput instanceof HTMLInputElement ? dom.userRoleInput.value : 'client';
    setChoiceButtonsValue(dom.userRoleButtons, role === 'admin' ? 'admin' : 'client');
  };

  dom.userRoleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (dom.userRoleInput instanceof HTMLInputElement) {
        dom.userRoleInput.value = button.dataset.value || 'client';
      }
      syncUserRoleUI();
    });
  });
  syncUserRoleUI();

  dom.userForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!(dom.userForm instanceof HTMLFormElement)) {
      return;
    }

    const submitButton = dom.userForm.querySelector('button[type="submit"]');
    setBusy(submitButton, true, 'Création...');

    try {
      const formData = new FormData(dom.userForm);
      const password = String(formData.get('password') || '').trim();
      // #region debug-point D:user-form-submit
      void reportInviteDebug('D', 'src/js/admin.js:userForm:submit', 'Submitting managed user invite form', {
        email: normalizeEmail(formData.get('email')),
        role: String(formData.get('role') || '').trim(),
        redirectTo: `${window.location.origin}/admin.html`,
        hasPassword: Boolean(password),
      });
      // #endregion
      const payload = await apiRequest(getAdminApiPath('users'), {
        method: 'POST',
        body: {
          email: formData.get('email'),
          displayName: formData.get('displayName'),
          role: formData.get('role'),
          password: password || undefined,
          redirectTo: `${window.location.origin}/admin.html`,
        },
      });
      const generatedPassword =
        payload?.mode === 'generated_password' ? String(payload?.temporaryPassword || '').trim() : '';

      dom.userForm.reset();
      if (dom.userRoleInput instanceof HTMLInputElement) {
        dom.userRoleInput.value = 'client';
      }
      syncUserRoleUI();

      if (dom.userLinkWrap && dom.userLinkOutput instanceof HTMLInputElement) {
        dom.userLinkWrap.hidden = true;
        dom.userLinkOutput.value = '';
      }
      if (dom.userLinkLabel instanceof HTMLElement) {
        dom.userLinkLabel.textContent = 'Accès généré :';
      }

      // #region debug-point E:user-form-response
      void reportInviteDebug('E', 'src/js/admin.js:userForm:response', 'Managed user invite response received', {
        email: normalizeEmail(formData.get('email')),
        userId: payload?.user?.id || '',
        userEmail: payload?.user?.email || '',
      });
      // #endregion

      setStatus(
        payload?.mode === 'invite'
          ? "Le compte a été créé et l'email d'invitation a été envoyé."
          : payload?.mode === 'generated_password'
            ? "Le compte a été créé. Copiez le mot de passe temporaire puis partagez-le avec la personne (la 2FA lui sera demandée lors de sa première connexion)."
            : "Le compte a été créé. Partagez l'email et le mot de passe avec la personne (la 2FA lui sera demandée lors de sa première connexion).",
        'success'
      );
      await Promise.all([loadUsers(), loadLogs()]);

      if (generatedPassword && dom.userLinkWrap && dom.userLinkOutput instanceof HTMLInputElement) {
        dom.userLinkWrap.hidden = false;
        if (dom.userLinkLabel instanceof HTMLElement) {
          dom.userLinkLabel.textContent = 'Mot de passe temporaire :';
        }
        dom.userLinkOutput.value = generatedPassword;
        dom.userLinkOutput.focus();
        dom.userLinkOutput.select();
        dom.userLinkWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (error) {
      // #region debug-point E:user-form-error
      void reportInviteDebug('E', 'src/js/admin.js:userForm:error', 'Managed user invite request failed', {
        message: error instanceof Error ? error.message : 'unknown_error',
      });
      // #endregion
      setStatus(error instanceof Error ? error.message : 'La création du compte a échoué.', 'error');
    } finally {
      setBusy(submitButton, false, 'Création...');
    }
  });

  dom.copyUserLinkButton?.addEventListener('click', async () => {
    if (!(dom.userLinkOutput instanceof HTMLInputElement) || !dom.userLinkOutput.value) {
      return;
    }

    try {
      const copied = await copyTextToClipboard(dom.userLinkOutput.value);
      if (!copied) {
        throw new Error('copy_failed');
      }
      const label = dom.userLinkLabel instanceof HTMLElement ? dom.userLinkLabel.textContent || '' : '';
      setStatus(label.toLowerCase().includes('mot de passe') ? 'Mot de passe copié.' : 'Copié.', 'success');
    } catch {
      setStatus("Impossible de copier le lien d'invitation automatiquement.", 'error');
    }
  });

  dom.refreshLogsButton?.addEventListener('click', async () => {
    setBusy(dom.refreshLogsButton, true, 'Actualisation...');

    try {
      await loadLogs();
      setStatus('Les logs ont été actualisés.', 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "L'actualisation des logs a échoué.", 'error');
    } finally {
      setBusy(dom.refreshLogsButton, false, 'Actualisation...');
    }
  });

  dom.logsFiltersForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    state.logsFilters.action = dom.logsActionInput instanceof HTMLSelectElement ? dom.logsActionInput.value : '';
    state.logsFilters.actorEmail = dom.logsEmailInput instanceof HTMLInputElement ? dom.logsEmailInput.value.trim() : '';
    state.logsFilters.dateFrom = dom.logsDateFromInput instanceof HTMLInputElement ? dom.logsDateFromInput.value : '';
    state.logsFilters.dateTo = dom.logsDateToInput instanceof HTMLInputElement ? dom.logsDateToInput.value : '';

    const submitButton = dom.logsFiltersForm.querySelector('button[type="submit"]');
    setBusy(submitButton, true, 'Filtrage...');

    try {
      await loadLogs();
      setStatus('Les filtres de logs ont été appliqués.', 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Le filtrage des logs a échoué.", 'error');
    } finally {
      setBusy(submitButton, false, 'Filtrage...');
    }
  });

  dom.assetGrid?.addEventListener(
    'mousedown',
    (event) => {
      const asset = getAssetFromEventTarget(event.target);

      if (!asset) {
        return;
      }

      // #region debug-point C:grid-mousedown
      reportAdminDebug('C', 'src/js/admin.js:assetGridMousedown', 'Asset grid mousedown', {
        button: event.button,
        buttons: event.buttons,
        assetKey: getAssetKey(asset),
        assetName: getAssetDisplayName(asset),
        targetTag: event.target instanceof Element ? event.target.tagName : 'unknown',
        targetClass: event.target instanceof Element ? event.target.className || '' : '',
      });
      // #endregion
    },
    { capture: true }
  );

  dom.assetGrid?.addEventListener(
    'mouseup',
    (event) => {
      if (event.button !== 2) {
        return;
      }

      const asset = getAssetFromEventTarget(event.target);

      if (!asset) {
        return;
      }

      // #region debug-point C:grid-mouseup-right
      reportAdminDebug('C', 'src/js/admin.js:assetGridMouseup', 'Asset grid right mouseup', {
        assetKey: getAssetKey(asset),
        assetName: getAssetDisplayName(asset),
        x: event.clientX,
        y: event.clientY,
        targetTag: event.target instanceof Element ? event.target.tagName : 'unknown',
        targetClass: event.target instanceof Element ? event.target.className || '' : '',
      });
      // #endregion

      event.preventDefault();
      event.stopPropagation();
      openAssetMenu(asset, event.clientX + 4, event.clientY + 4);
    },
    { capture: true }
  );

  dom.assetGrid?.addEventListener(
    'contextmenu',
    (event) => {
      const asset = getAssetFromEventTarget(event.target);

      if (!asset) {
        return;
      }

      // #region debug-point C:grid-contextmenu
      reportAdminDebug('C', 'src/js/admin.js:assetGridContextmenu', 'Asset grid contextmenu', {
        assetKey: getAssetKey(asset),
        assetName: getAssetDisplayName(asset),
        x: event.clientX,
        y: event.clientY,
        targetTag: event.target instanceof Element ? event.target.tagName : 'unknown',
        targetClass: event.target instanceof Element ? event.target.className || '' : '',
      });
      // #endregion

      event.preventDefault();
      event.stopPropagation();
      openAssetMenu(asset, event.clientX + 4, event.clientY + 4);
    },
    { capture: true }
  );

  dom.assetGrid?.addEventListener(
    'pointerdown',
    (event) => {
      const asset = getAssetFromEventTarget(event.target);

      if (!asset) {
        return;
      }

      scheduleAssetMenuLongPress(event, asset);
    },
    { capture: true }
  );

  dom.assetGrid?.addEventListener(
    'pointermove',
    (event) => {
      if (!state.assetMenuLongPressOrigin) {
        return;
      }

      const movedX = Math.abs(event.clientX - state.assetMenuLongPressOrigin.x);
      const movedY = Math.abs(event.clientY - state.assetMenuLongPressOrigin.y);

      if (movedX > ASSET_MENU_MOVE_TOLERANCE || movedY > ASSET_MENU_MOVE_TOLERANCE) {
        clearAssetMenuLongPress();
      }
    },
    { capture: true }
  );

  ['pointerup', 'pointercancel', 'dragstart', 'scroll'].forEach((eventName) => {
    dom.assetGrid?.addEventListener(eventName, clearAssetMenuLongPress, {
      capture: true,
      passive: eventName === 'scroll',
    });
  });

  dom.logsActionTrigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    // #region debug-point D:logs-action-trigger
    reportAdminDebug('D', 'src/js/admin.js:logsActionTrigger', 'Toggle logs action menu', {
      expandedBefore: dom.logsActionTrigger?.getAttribute('aria-expanded') || 'false',
    });
    // #endregion
    setLogsActionMenuOpen(!state.logsActionMenuOpen);
  });

  dom.resetLogsFiltersButton?.addEventListener('click', async () => {
    state.logsFilters = {
      action: '',
      actorEmail: '',
      dateFrom: '',
      dateTo: '',
    };
    syncLogsFilterInputs();
    setBusy(dom.resetLogsFiltersButton, true, 'Réinitialisation...');

    try {
      await loadLogs();
      setStatus('Les filtres de logs ont été réinitialisés.', 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "La réinitialisation des filtres a échoué.", 'error');
    } finally {
      setBusy(dom.resetLogsFiltersButton, false, 'Réinitialisation...');
    }
  });

  dom.clearLogsButton?.addEventListener('click', async () => {
    const confirmed = await confirmDangerAction({
      eyebrow: 'Suppression logs',
      title: 'Vider tous les logs ?',
      message: "Cette action supprime l'historique d'activité visible dans l'administration et ne peut pas être annulée.",
      target: 'Tous les logs d’activité',
      confirmLabel: 'Vider les logs',
    });

    if (!confirmed) {
      return;
    }

    setBusy(dom.clearLogsButton, true, 'Suppression...');

    try {
      const payload = await apiRequest(getAdminApiPath('logs'), {
        method: 'DELETE',
      });
      state.logs = [];
      renderLogs();
      setStatus(`${Number(payload?.clearedCount || 0)} log(s) ont été supprimé(s).`, 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'La purge des logs a échoué.', 'error');
    } finally {
      setBusy(dom.clearLogsButton, false, 'Suppression...');
    }
  });

  dom.searchInput?.addEventListener('input', (event) => {
    state.searchQuery = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
    state.currentPage = 1;
    renderAssets();
  });

  dom.filterTypeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.filterType = button.dataset.value || 'all';
      if (dom.filterTypeInput instanceof HTMLInputElement) {
        dom.filterTypeInput.value = state.filterType;
      }
      setChoiceButtonsValue(dom.filterTypeButtons, state.filterType);
      state.currentPage = 1;
      renderAssets();
    });
  });

  dom.filterTagInput?.addEventListener('input', (event) => {
    state.filterTag = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
    state.currentPage = 1;
    renderAssets();
  });

  dom.selectedOnlyButton?.addEventListener('click', () => {
    state.selectedOnly = !state.selectedOnly;
    dom.selectedOnlyButton?.classList.toggle('is-active', state.selectedOnly);
    state.currentPage = 1;
    renderAssets();
  });

  dom.clearFiltersButton?.addEventListener('click', () => {
    state.searchQuery = '';
    state.filterType = 'all';
    state.filterTag = '';
    state.selectedOnly = false;
    state.currentPage = 1;

    if (dom.searchInput instanceof HTMLInputElement) {
      dom.searchInput.value = '';
    }

    if (dom.filterTagInput instanceof HTMLInputElement) {
      dom.filterTagInput.value = '';
    }

    if (dom.filterTypeInput instanceof HTMLInputElement) {
      dom.filterTypeInput.value = 'all';
    }

    setChoiceButtonsValue(dom.filterTypeButtons, 'all');
    dom.selectedOnlyButton?.classList.remove('is-active');
    renderAssets();
  });

  dom.selectAllButton?.addEventListener('click', () => {
    getFilteredAssets().forEach((asset) => state.selectedAssetKeys.add(getAssetKey(asset)));
    renderAssets();
  });

  dom.clearSelectionButton?.addEventListener('click', () => {
    state.selectedAssetKeys.clear();
    renderAssets();
  });

  dom.clearSelectionDockButton?.addEventListener('click', () => {
    state.selectedAssetKeys.clear();
    renderAssets();
  });

  dom.previewSelectionButton?.addEventListener('click', () => {
    const firstSelected = state.assets.find((asset) => state.selectedAssetKeys.has(getAssetKey(asset)));

    if (firstSelected) {
      openPreview(firstSelected);
    }
  });

  dom.bulkForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!(dom.bulkForm instanceof HTMLFormElement)) {
      return;
    }

    const selectedItems = state.assets.filter((asset) => state.selectedAssetKeys.has(getAssetKey(asset)));
    if (selectedItems.length === 0) {
      setStatus("Sélectionnez au moins un média avant d'appliquer une modification groupée.", 'error');
      return;
    }

    const submitButton = dom.bulkForm.querySelector('button[type="submit"]');
    setBusy(submitButton, true, 'Application...');

    try {
      const formData = new FormData(dom.bulkForm);
      await apiRequest(getAdminApiPath('assets/bulk'), {
        method: 'POST',
        body: {
          items: selectedItems.map((asset) => ({
            publicId: asset.publicId,
            resourceType: asset.resourceType,
            assetSource: asset.assetSource,
          })),
          alt: formData.get('alt'),
          altEn: formData.get('altEn'),
          tags: parseTags(formData.get('tags')),
        },
      });
      setStatus('La mise à jour groupée a été appliquée.', 'success');
      dom.bulkForm.reset();
      await loadFolder(state.currentFolder);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'La mise à jour groupée a échoué.', 'error');
    } finally {
      setBusy(submitButton, false, 'Application...');
    }
  });

  dom.loadMoreButton?.addEventListener('click', () => {
    state.currentPage += 1;
    renderAssets();
  });

  dom.previewForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await savePreviewChanges();
  });

  dom.previewCloseButtons.forEach((button) => {
    button.addEventListener('click', closePreview);
  });

  dom.confirmCloseButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeConfirmDialog(false);
    });
  });

  dom.confirmCancelButton?.addEventListener('click', () => {
    closeConfirmDialog(false);
  });

  dom.confirmSubmitButton?.addEventListener('click', () => {
    closeConfirmDialog(true);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dom.confirmDialog?.hidden) {
      event.preventDefault();
      closeConfirmDialog(false);
      return;
    }

    if (event.key === 'Escape' && state.previewAssetKey) {
      closePreview();
    }
  });

  dom.translateToFrButton?.addEventListener('click', () => {
    void translateAlt('altEn', 'altFr');
  });

  dom.translateToEnButton?.addEventListener('click', () => {
    void translateAlt('altFr', 'altEn');
  });

  const altFrInput = getMediaInput('altFr');
  const altEnInput = getMediaInput('altEn');

  altFrInput instanceof HTMLInputElement &&
    altFrInput.addEventListener('blur', () => {
      if (!altFrInput.value.trim() || !(altEnInput instanceof HTMLInputElement) || altEnInput.value.trim()) {
        return;
      }

      void translateAlt('altFr', 'altEn');
    });

  altEnInput instanceof HTMLInputElement &&
    altEnInput.addEventListener('blur', () => {
      if (!altEnInput.value.trim() || !(altFrInput instanceof HTMLInputElement) || altFrInput.value.trim()) {
        return;
      }

      void translateAlt('altEn', 'altFr');
    });

  window.addEventListener('resize', () => {
    renderAssets();
  });

  dom.pinInputs.forEach((wrap) => {
    bindPinInput(wrap);
  });
};

const init = async () => {
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    setStatus('Les clés publiques Supabase sont manquantes dans la configuration du projet.', 'error');
    return;
  }

  state.supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  bindEvents();
  initLogsDatePickers();
  syncMediaKindUI();
  syncFolderMode();
  syncLogsFilterInputs();
  populateLogsActionOptions();
  renderLucideIcons();
  initSortable();

  state.supabase.auth.onAuthStateChange((_event, session) => {
    if (_event === 'PASSWORD_RECOVERY') {
      state.authFlow.pendingType = 'recovery';
      state.lastSessionSyncKey = null;
    } else if (_event === 'SIGNED_OUT') {
      state.authFlow.pendingType = null;
    }

    if (state.mfa.verificationInProgress) {
      state.session = session;
      return;
    }

    void syncSession(session).catch((error) => {
      const message = error instanceof Error ? error.message : "L'initialisation de l'espace médias a échoué.";
      setStatus(message, 'error');
      if (!state.session) {
        showAuth();
        setAuthGateVisible(false);
      }
    });
  });

  const {
    data: { session },
  } = await state.supabase.auth.getSession();

  await syncSession(session);
};

void init();
