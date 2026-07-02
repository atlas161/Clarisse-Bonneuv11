import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  createExternalYoutubeItem,
  deleteExternalMediaItem,
  getExternalMediaItems,
  listExternalMediaByFolder,
  renameExternalMediaFolder,
  reorderExternalMediaItems,
  toExternalVideoAsset,
  updateExternalMediaItem,
} from './external-media-store.js';
import {
  deleteAssetOrder,
  getAssetOrder,
  listAssetOrdersByFolder,
  renameAssetOrderFolderPrefix,
  saveAssetOrderForFolder,
} from './admin-asset-order-store.js';
import {
  deleteAssetMetadata,
  getAssetMetadata,
  listAssetMetadataByFolder,
  renameAssetMetadataFolderPrefix,
  upsertAssetMetadata,
  upsertAssetMetadataBulk,
} from './admin-asset-metadata-store.js';
import {
  listTrackedSubfolders,
  renameTrackedFolder,
  reorderTrackedSubfolders,
  trackFolder,
  untrackFolder,
} from './admin-folder-store.js';
import { appendAuditLog, clearAuditLogs, listAuditLogs } from './admin-audit-log-store.js';

class HttpError extends Error {
  constructor(status, message, code = 'request_error') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

const getClientIp = (req) =>
  String(req?.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim() || String(req?.socket?.remoteAddress || '').trim();

const rateLimitBuckets = new Map();

const enforceRateLimit = (req, key, options = {}) => {
  const limit = Number(options.limit || 0);
  const windowMs = Number(options.windowMs || 0);

  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(windowMs) || windowMs <= 0) {
    return;
  }

  const now = Date.now();
  const bucketKey = `${getClientIp(req)}:${String(key || 'default')}`;
  const current = rateLimitBuckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }

  current.count += 1;

  if (current.count > limit) {
    throw new HttpError(429, 'Trop de requetes. Merci de reessayer plus tard.', 'rate_limited');
  }
};

const normalizePath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();

const getRootFolder = () => normalizePath(process.env.PORTFOLIO_CLOUDINARY_ROOT || 'samples/clarisse_bonneu');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const getBootstrapAdminEmail = () => normalizeEmail(process.env.ADMIN_ALLOWED_EMAIL || '');
const getClientInviteRedirect = () => String(process.env.ADMIN_INVITE_REDIRECT_TO || 'http://localhost:5173/admin.html').trim();
const getDefaultClientRole = () => 'client';
const getAllowedManagedRole = (value) => (String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'client');
const ADMIN_MFA_REMEMBER_WINDOW_MS = 24 * 60 * 60 * 1000;
const SERVER_DEBUG_HTTP_ENABLED = String(process.env.ADMIN_DEBUG_HTTP || '').trim().toLowerCase() === 'true';
const SUPABASE_FETCH_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(String(process.env.SUPABASE_FETCH_TIMEOUT_MS || '7000'), 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 7000;
  }
  return Math.min(Math.max(raw, 2000), 9000);
})();

const createTimeoutSignal = (signal, timeoutMs) => {
  const controller = new AbortController();

  const onAbort = () => {
    controller.abort(signal?.reason);
  };

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    controller.abort(new Error('timeout'));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    },
  };
};

const fetchWithTimeout = async (input, init = {}) => {
  const timeoutMs = Number.isFinite(init?.timeoutMs) ? init.timeoutMs : SUPABASE_FETCH_TIMEOUT_MS;
  const { signal, cleanup } = createTimeoutSignal(init?.signal, timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal,
    });
    return response;
  } finally {
    cleanup();
  }
};

// #region debug-point A:reporter
const reportFolderDebug = (hypothesisId, location, msg, data = {}) =>
  !SERVER_DEBUG_HTTP_ENABLED
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
// #endregion

// #region debug-point A:invite-reporter
const reportInviteDebug = (hypothesisId, location, msg, data = {}) =>
  !SERVER_DEBUG_HTTP_ENABLED
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

const encodeBase64Url = (value) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const decodeBase64Url = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
};

const getRememberDeviceSecret = () =>
  String(
    process.env.ADMIN_MFA_REMEMBER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'clarisse-bonneu-admin-remember'
  ).trim();

const signRememberPayload = (payload) =>
  createHmac('sha256', getRememberDeviceSecret()).update(payload).digest('base64url');

const issueRememberedMfaToken = (user) => {
  const expiresAt = Date.now() + ADMIN_MFA_REMEMBER_WINDOW_MS;
  const payload = encodeBase64Url({
    sub: String(user?.id || '').trim(),
    exp: expiresAt,
  });

  return {
    token: `${payload}.${signRememberPayload(payload)}`,
    expiresAt,
  };
};

const readRememberedMfaToken = (req) => String(req.headers['x-admin-mfa-remember'] || '').trim();

const validateRememberedMfaToken = (req, user) => {
  const rawToken = readRememberedMfaToken(req);

  if (!rawToken || !user?.id) {
    return null;
  }

  const [payload, signature] = rawToken.split('.');

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signRememberPayload(payload);

  try {
    const providedSignatureBuffer = Buffer.from(signature);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);

    if (
      providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
      !timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
    ) {
      return null;
    }

    const parsed = JSON.parse(decodeBase64Url(payload));
    const expiresAt = Number(parsed?.exp || 0);
    const userId = String(parsed?.sub || '').trim();

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || userId !== String(user.id).trim()) {
      return null;
    }

    return {
      expiresAt,
    };
  } catch {
    return null;
  }
};

const normalizeWithinRoot = (value = '') => {
  const root = getRootFolder();
  const normalized = normalizePath(value);

  if (!normalized) {
    return root;
  }

  if (normalized === root || normalized.startsWith(`${root}/`)) {
    return normalized;
  }

  return normalizePath(`${root}/${normalized}`);
};

const getLibreTranslateEndpoints = () => {
  const raw = process.env.LIBRETRANSLATE_URLS || process.env.LIBRETRANSLATE_URL || '';
  const configured = raw
    .split(',')
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return Array.from(
    new Set([
      ...configured,
      'https://translate.argosopentech.com/translate',
      'https://libretranslate.com/translate',
    ])
  );
};

const getMyMemoryContactEmail = () =>
  String(process.env.MYMEMORY_CONTACT_EMAIL || process.env.ADMIN_ALLOWED_EMAIL || '').trim();

const sanitizeContextValue = (value) => String(value || '').replace(/[|=]/g, ' ').trim();

const toCloudinaryContextString = (context) =>
  Object.entries(context || {})
    .filter(([, value]) => String(value ?? '').trim() !== '')
    .map(([key, value]) => `${key}=${sanitizeContextValue(value)}`)
    .join('|');

const parseManualOrder = (value) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const sortByOrderThenDate = (left, right) => {
  const leftOrder =
    parseManualOrder(left?.order) ??
    getManualOrderSortValue(left) ??
    Number.POSITIVE_INFINITY;
  const rightOrder =
    parseManualOrder(right?.order) ??
    getManualOrderSortValue(right) ??
    Number.POSITIVE_INFINITY;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const leftDate = new Date(left.createdAt || left.created_at || 0).getTime();
  const rightDate = new Date(right.createdAt || right.created_at || 0).getTime();
  return rightDate - leftDate;
};

const getManualOrderSortValue = (resource) => {
  const order =
    parseManualOrder(resource?.context?.custom?.order) ??
    parseManualOrder(resource?.context?.custom?.position) ??
    parseManualOrder(resource?.context?.custom?.sort_order);

  return order ?? Number.POSITIVE_INFINITY;
};

let cloudinaryConfigured = false;

const configureCloudinary = async () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new HttpError(500, 'La configuration Cloudinary est incomplète.', 'cloudinary_config_missing');
  }

  const { v2: cloudinary } = await import('cloudinary');

  if (!cloudinaryConfigured) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    cloudinaryConfigured = true;
  }

  return { cloudinary, cloudName, apiKey, apiSecret };
};

const clearPortfolioPayloadCacheSafe = () => {
  try {
    return import('./cloudinary-portfolio.js').then((module) => {
      module.clearPortfolioPayloadCache(getRootFolder());
    });
  } catch {
    return Promise.resolve();
  }
};

const getSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new HttpError(500, 'La configuration Supabase est incomplète.', 'supabase_config_missing');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  });
};

const getUserRole = (user) => {
  const role = String(user?.app_metadata?.role || '').trim().toLowerCase();

  if (role === 'admin' || role === 'client') {
    return role;
  }

  if (normalizeEmail(user?.email) === getBootstrapAdminEmail()) {
    return 'admin';
  }

  return null;
};

const ensureBootstrapAdminRole = async (user) => {
  if (!user || normalizeEmail(user.email) !== getBootstrapAdminEmail()) {
    return user;
  }

  if (String(user.app_metadata?.role || '').trim().toLowerCase() === 'admin') {
    return user;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata || {}),
      role: 'admin',
    },
  });

  if (error || !data.user) {
    throw new HttpError(500, 'Impossible de synchroniser le role admin principal.', 'bootstrap_admin_sync_failed');
  }

  return data.user;
};

const MAX_JSON_BODY_BYTES = 1_000_000;

const readBody = async (req) =>
  new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;

      if (raw.length > MAX_JSON_BODY_BYTES) {
        reject(new HttpError(413, 'Le corps de la requete est trop volumineux.', 'payload_too_large'));
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new HttpError(400, 'Le corps de la requete JSON est invalide.', 'invalid_json'));
      }
    });

    req.on('error', reject);
  });

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
};

const sendNoContent = (res) => {
  res.statusCode = 204;
  res.setHeader('Cache-Control', 'no-store');
  res.end();
};

const parseUrl = (req, basePath = '') =>
  new URL(`${basePath}${req.url || '/'}`, 'http://localhost');

const getAuthToken = (req) => {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
};

const parseJwtPayload = (token) => {
  const parts = String(token || '').split('.');

  if (parts.length < 2) {
    return {};
  }

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return {};
  }
};

const createAuditEntry = (session, action, targetType, targetLabel, details = {}, targetId = '') => ({
  actorUserId: String(session?.user?.id || '').trim(),
  actorName: String(session?.user?.user_metadata?.display_name || '').trim(),
  actorEmail: String(session?.user?.email || '').trim(),
  actorRole: String(session?.role || '').trim(),
  action,
  targetType,
  targetId: String(targetId || '').trim(),
  targetLabel: String(targetLabel || '').trim(),
  details,
});

const getAuditRequestDetails = (req) => ({
  method: String(req?.method || '').trim().toUpperCase(),
  origin: String(req?.headers?.origin || req?.headers?.referer || '').trim(),
  userAgent: String(req?.headers['user-agent'] || '').trim(),
  ip:
    String(req?.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() || String(req?.socket?.remoteAddress || '').trim(),
});

const getPathName = (value) => {
  const normalized = normalizePath(value);
  return normalized.split('/').filter(Boolean).pop() || normalized;
};

const getAssetAuditSnapshot = async (publicId, resourceType = 'image', assetSource = 'cloudinary') => {
  const normalizedPublicId = String(publicId || '').trim();

  if (!normalizedPublicId) {
    return null;
  }

  if (assetSource === 'external' || resourceType === 'external-video') {
    const externalItem = (await getExternalMediaItems()).find((item) => item.id === normalizedPublicId);

    if (!externalItem) {
      return null;
    }

    return {
      targetId: externalItem.id,
      targetLabel: externalItem.title || externalItem.alt || externalItem.url || externalItem.id,
      details: {
        folder: externalItem.folder,
        resourceType: 'external-video',
        assetSource: 'external',
        title: externalItem.title,
        alt: externalItem.alt,
        altEn: externalItem.altEn,
        tags: Array.isArray(externalItem.tags) ? externalItem.tags : [],
        order: externalItem.order,
        url: externalItem.url,
      },
    };
  }

  const resource = await getResourceDetails(normalizedPublicId, resourceType).catch(() => null);

  if (!resource) {
    return null;
  }

  const context = resource.context?.custom || {};
  const fallbackName = normalizedPublicId.split('/').pop() || normalizedPublicId;
  const originalFilename = String(resource.original_filename || resource.display_name || '').trim();
  const normalizedRoot = getRootFolder();
  const folderPath = normalizedPublicId.slice(0, normalizedPublicId.lastIndexOf('/')) || normalizedRoot;
  const [metadata, orderOverride] = await Promise.all([
    getAssetMetadata(folderPath, normalizedPublicId).catch(() => null),
    getAssetOrder(folderPath, normalizedPublicId).catch(() => null),
  ]);

  const resolvedAlt = String(metadata?.alt ?? context.alt ?? '').trim();
  const resolvedAltEn = String(metadata?.altEn ?? context.alt_en ?? '').trim();
  const resolvedTags = Array.isArray(metadata?.tags) ? metadata.tags : Array.isArray(resource.tags) ? resource.tags : [];
  const resolvedOrder = Number.isFinite(Number(orderOverride)) ? Number(orderOverride) : parseManualOrder(context.order);
  const displayTitle = String(context.title || resolvedAlt || originalFilename || fallbackName).trim() || fallbackName;

  return {
    targetId: normalizedPublicId,
    targetLabel: displayTitle,
    details: {
      folder: resource.asset_folder || resource.folder || '',
      resourceType: resource.resource_type,
      assetSource: 'cloudinary',
      title: displayTitle,
      alt: resolvedAlt,
      altEn: resolvedAltEn,
      tags: resolvedTags,
      order: resolvedOrder,
    },
  };
};

const listVerifiedMfaFactors = async (supabase, userId) => {
  const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId });

  if (error) {
    throw new HttpError(500, error.message || 'Impossible de verifier les facteurs 2FA.', 'mfa_list_failed');
  }

  return Array.isArray(data?.factors) ? data.factors.filter((factor) => factor?.status === 'verified') : [];
};

const getMfaContext = async (supabase, user, role, token, rememberedDevice = null) => {
  const jwtPayload = parseJwtPayload(token);
  const currentAal = String(jwtPayload?.aal || 'aal1').trim().toLowerCase() || 'aal1';

  if (currentAal === 'aal2') {
    return {
      currentAal,
      factorCount: 1,
      hasVerifiedFactor: true,
      mustEnroll: false,
      mustVerify: false,
      remembered: false,
      rememberedUntil: null,
    };
  }

  const verifiedFactors = await listVerifiedMfaFactors(supabase, user.id);
  const hasVerifiedFactor = verifiedFactors.length > 0;

  return {
    currentAal,
    factorCount: verifiedFactors.length,
    hasVerifiedFactor,
    mustEnroll: !hasVerifiedFactor,
    mustVerify: hasVerifiedFactor && currentAal !== 'aal2' && !rememberedDevice,
    remembered: Boolean(rememberedDevice),
    rememberedUntil: rememberedDevice?.expiresAt || null,
  };
};

const requireSession = async (req, options = {}) => {
  const { allowIncompleteMfa = false } = options;
  const token = getAuthToken(req);

  if (!token) {
    throw new HttpError(401, 'Authentification requise.', 'missing_token');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new HttpError(401, 'Session admin invalide.', 'invalid_session');
  }

  const user = await ensureBootstrapAdminRole(data.user);
  const role = getUserRole(user);

  if (!role) {
    throw new HttpError(403, 'Cet utilisateur n est pas autorise a acceder au back-office.', 'forbidden_admin');
  }

  const rememberedDevice = validateRememberedMfaToken(req, user);
  const mfa = await getMfaContext(supabase, user, role, token, rememberedDevice);

  if (!allowIncompleteMfa) {
    if (mfa.mustEnroll) {
      throw new HttpError(
        403,
        'Active d abord la double authentification sur ce compte admin avant d utiliser le back-office.',
        'mfa_enrollment_required'
      );
    }

    if (mfa.mustVerify) {
      throw new HttpError(
        403,
        'Une validation 2FA est requise pour continuer avec cette session.',
        'mfa_verification_required'
      );
    }
  }

  return {
    user,
    role,
    mfa,
  };
};

const requireAdmin = async (req) => {
  const session = await requireSession(req);

  if (session.role !== 'admin') {
    throw new HttpError(403, 'Cette action est reservee a l administrateur principal.', 'admin_only');
  }

  return session;
};

const fetchAllResources = async (prefix, resourceType) => {
  const resources = [];
  let nextCursor;

  try {
    const { cloudinary } = await configureCloudinary();
    do {
      const response = await cloudinary.api.resources({
        type: 'upload',
        resource_type: resourceType,
        prefix,
        max_results: 200,
        next_cursor: nextCursor,
        context: true,
        tags: true,
      });

      resources.push(...(response.resources || []));
      nextCursor = response.next_cursor;
    } while (nextCursor);
    // #region debug-point C:resources-success
    void reportFolderDebug('C', 'server/admin-api.js:fetchAllResources:success', 'Cloudinary resources fetch success', {
      prefix,
      resourceType,
      count: resources.length,
      samplePublicIds: resources.slice(0, 5).map((resource) => resource?.public_id || null),
    });
    // #endregion
  } catch (error) {
    // #region debug-point C:resources-error
    void reportFolderDebug('C', 'server/admin-api.js:fetchAllResources:error', 'Cloudinary resources fetch failed', {
      prefix,
      resourceType,
      message: error instanceof Error ? error.message : String(error || ''),
      httpCode: error?.error?.http_code || error?.http_code || null,
      errorName: error?.name || null,
    });
    // #endregion
    if (error?.error?.http_code === 420) {
      return [];
    }

    throw error;
  }

  return resources;
};

const getResourceDetails = async (publicId, resourceType = 'image') => {
  const { cloudinary } = await configureCloudinary();

  return cloudinary.api.resource(publicId, {
    resource_type: resourceType === 'video' ? 'video' : 'image',
    type: 'upload',
    context: true,
    tags: true,
  });
};

const toAssetPayload = (resource, cloudName) => {
  const isVideo = resource.resource_type === 'video';
  const previewBase = isVideo ? 'video' : 'image';
  const extension = isVideo ? 'jpg' : (resource.format || 'jpg');
  const publicId = String(resource.public_id || '').trim();
  const fallbackName = publicId.split('/').pop() || publicId;
  const originalFilename = String(resource.original_filename || resource.display_name || '').trim();
  const displayTitle =
    String(resource.context?.custom?.title || resource.context?.custom?.alt || originalFilename || fallbackName).trim() || fallbackName;

  return {
    assetId: resource.asset_id,
    publicId: publicId,
    resourceType: resource.resource_type,
    folder: resource.asset_folder || resource.folder || '',
    format: resource.format || '',
    width: resource.width || null,
    height: resource.height || null,
    bytes: resource.bytes || 0,
    createdAt: resource.created_at || null,
    tags: Array.isArray(resource.tags) ? resource.tags : [],
    context: resource.context?.custom || {},
    order: parseManualOrder(resource.context?.custom?.order),
    originalFilename,
    displayTitle,
    secureUrl: resource.secure_url || '',
    thumbnailUrl: `https://res.cloudinary.com/${cloudName}/${previewBase}/upload/f_auto,q_auto,w_720/v1/${publicId}.${extension}`,
  };
};

const getImmediateChildFolders = (currentFolder, resources, externalItems) => {
  const normalizedCurrentFolder = normalizePath(currentFolder);
  const prefix = `${normalizedCurrentFolder}/`;
  const discovered = new Set();

  [...resources, ...externalItems].forEach((entry) => {
    const candidatePath = normalizePath(entry.asset_folder || entry.folder || entry.public_id || '');

    if (!candidatePath || !candidatePath.startsWith(prefix)) {
      return;
    }

    const remainder = candidatePath.slice(prefix.length);
    const nextSegment = remainder.split('/').filter(Boolean)[0];

    if (!nextSegment) {
      return;
    }

    discovered.add(normalizePath(`${normalizedCurrentFolder}/${nextSegment}`));
  });

  return Array.from(discovered);
};

const listCloudinarySubFolders = async (folderPath) => {
  const { cloudinary } = await configureCloudinary();
  try {
    const response = await cloudinary.api.sub_folders(folderPath);
    // #region debug-point C:subfolders-success
    void reportFolderDebug('C', 'server/admin-api.js:listCloudinarySubFolders:success', 'Cloudinary sub_folders success', {
      folderPath,
      count: Array.isArray(response.folders) ? response.folders.length : null,
      samplePaths: Array.isArray(response.folders) ? response.folders.slice(0, 5).map((folder) => folder?.path || null) : [],
    });
    // #endregion
    return Array.isArray(response.folders) ? response.folders : [];
  } catch (error) {
    // #region debug-point C:subfolders-error
    void reportFolderDebug('C', 'server/admin-api.js:listCloudinarySubFolders:error', 'Cloudinary sub_folders failed', {
      folderPath,
      message: error instanceof Error ? error.message : String(error || ''),
      httpCode: error?.http_code || null,
    });
    // #endregion
    return [];
  }
};

const inferSubfoldersFromResources = async (folderPath) => {
  const normalizedFolder = normalizePath(folderPath);
  const prefix = `${normalizedFolder}/`;
  const discovered = new Set();
  const { cloudinary } = await configureCloudinary();

  const collectFromResourceType = async (resourceType) => {
    try {
      const response = await cloudinary.api.resources({
        type: 'upload',
        resource_type: resourceType,
        prefix,
        max_results: 100,
      });

      (response.resources || []).forEach((resource) => {
        const publicId = normalizePath(resource.public_id);

        if (!publicId.startsWith(prefix)) {
          return;
        }

        const remainder = publicId.slice(prefix.length);
        const nextSegment = remainder.split('/').filter(Boolean)[0];

        if (!nextSegment) {
          return;
        }

        discovered.add(normalizePath(`${normalizedFolder}/${nextSegment}`));
      });
    } catch {
      // Ignore fallback inference errors and keep the explicit folder list when available.
    }
  };

  await Promise.all([collectFromResourceType('image'), collectFromResourceType('video')]);
  return Array.from(discovered);
};

const findFolderMatchBySegment = (folders, segment) => {
  const normalizedSegment = normalizePath(segment).toLowerCase();

  return (folders || []).find((folder) => {
    const folderPath = normalizePath(typeof folder === 'string' ? folder : folder?.path);
    const folderName = normalizePath(typeof folder === 'string' ? folder.split('/').pop() : folder?.name);
    return folderName.toLowerCase() === normalizedSegment || folderPath.split('/').pop()?.toLowerCase() === normalizedSegment;
  });
};

const resolveCanonicalFolderPath = async (folderInput) => {
  const root = getRootFolder();
  const normalizedTarget = normalizeWithinRoot(folderInput);

  if (!normalizedTarget || normalizedTarget === root) {
    return root;
  }

  const segments = normalizedTarget.slice(root.length + 1).split('/').filter(Boolean);
  let currentFolder = root;

  for (const segment of segments) {
    const [cloudinarySubFolders, trackedSubFolders] = await Promise.all([
      listCloudinarySubFolders(currentFolder),
      listTrackedSubfolders(currentFolder),
    ]);
    const cloudinaryMatch = findFolderMatchBySegment(cloudinarySubFolders, segment);

    if (cloudinaryMatch?.path) {
      currentFolder = normalizePath(cloudinaryMatch.path);
      continue;
    }

    const trackedMatch = findFolderMatchBySegment(trackedSubFolders, segment);

    if (typeof trackedMatch === 'string') {
      currentFolder = normalizePath(trackedMatch);
      continue;
    }

    currentFolder = normalizePath(`${currentFolder}/${segment}`);
  }

  return currentFolder;
};

const mergeFolderEntries = (folderPaths, orderedPaths = []) =>
  Array.from(
    new Map(
      [...orderedPaths, ...folderPaths]
        .map((folderPath) => normalizePath(folderPath))
        .filter(Boolean)
        .map((folderPath) => [
          folderPath.toLowerCase(),
          {
            name: folderPath.split('/').pop(),
            path: folderPath,
          },
        ])
    ).values()
  ).map((entry, index) => ({
    ...entry,
    order: index,
  }));

const persistTrackedFolders = async (folderPaths) => {
  const uniquePaths = Array.from(new Set((folderPaths || []).map((folderPath) => normalizePath(folderPath)).filter(Boolean)));

  if (uniquePaths.length === 0) {
    return;
  }

  for (const folderPath of uniquePaths) {
    await trackFolder(folderPath);
  }
};

const reorderFolders = async (parentFolder, items) => {
  const parentPath = await resolveCanonicalFolderPath(parentFolder);
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((entry) => normalizePath(entry?.path || entry))
    .filter(Boolean);

  if (normalizedItems.length === 0) {
    throw new HttpError(400, 'La liste des dossiers a classer est vide.', 'missing_folder_order');
  }

  const parentPrefix = `${parentPath}/`;
  if (normalizedItems.some((item) => item === parentPath || !item.startsWith(parentPrefix))) {
    throw new HttpError(400, 'La liste de dossiers contient une entree invalide.', 'invalid_folder_order');
  }

  await reorderTrackedSubfolders(parentPath, normalizedItems);
  void clearPortfolioPayloadCacheSafe();

  return parentPath;
};

const getFolderNavigatorPayload = async (folderInput) => {
  const currentFolder = await resolveCanonicalFolderPath(folderInput);
  const [cloudinarySubFolders, trackedSubFolders] = await Promise.all([
    listCloudinarySubFolders(currentFolder),
    listTrackedSubfolders(currentFolder),
  ]);
  const inferredCloudinarySubFolders =
    cloudinarySubFolders.length === 0 ? await inferSubfoldersFromResources(currentFolder) : [];
  const cloudinaryFolderPaths = [
    ...cloudinarySubFolders.map((folder) => folder.path),
    ...inferredCloudinarySubFolders,
  ];

  await persistTrackedFolders(cloudinaryFolderPaths);

  // #region debug-point B:navigator-payload
  void reportFolderDebug('B', 'server/admin-api.js:getFolderNavigatorPayload', 'Navigator payload assembled', {
    folderInput: folderInput || null,
    root: getRootFolder(),
    currentFolder,
    cloudinaryCount: cloudinaryFolderPaths.length,
    trackedCount: trackedSubFolders.length,
    mergedCount: mergeFolderEntries([...cloudinaryFolderPaths, ...trackedSubFolders], trackedSubFolders).length,
    cloudinarySample: cloudinaryFolderPaths.slice(0, 5),
    trackedSample: trackedSubFolders.slice(0, 5),
  });
  // #endregion

  return {
    root: getRootFolder(),
    currentFolder,
    parentFolder:
      currentFolder === getRootFolder()
        ? null
        : currentFolder.slice(0, currentFolder.lastIndexOf('/')) || getRootFolder(),
    folders: mergeFolderEntries([...cloudinaryFolderPaths, ...trackedSubFolders], trackedSubFolders),
  };
};

const getFolderPayload = async (folderInput) => {
  const currentFolder = await resolveCanonicalFolderPath(folderInput);
  const navigatorPayload = await getFolderNavigatorPayload(currentFolder);

  // At the root level the UI should only expose folder navigation, so avoid
  // fetching every resource under the whole portfolio and triggering API limits.
  if (currentFolder === navigatorPayload.root) {
    return {
      ...navigatorPayload,
      assets: [],
    };
  }

  const { cloudName } = await configureCloudinary();
  const [imageResources, videoResources, externalItems, assetOrderMap, assetMetadataMap] = await Promise.all([
    fetchAllResources(`${currentFolder}/`, 'image'),
    fetchAllResources(`${currentFolder}/`, 'video'),
    listExternalMediaByFolder(currentFolder),
    listAssetOrdersByFolder(currentFolder).catch(() => new Map()),
    listAssetMetadataByFolder(currentFolder).catch(() => new Map()),
  ]);

  const assets = [...imageResources, ...videoResources]
    .map((resource) => toAssetPayload(resource, cloudName))
    .concat(externalItems.map((item) => toExternalVideoAsset(item)))
    .map((asset) => {
      if (!asset || (asset.assetSource === 'external' || asset.resourceType === 'external-video')) {
        return asset;
      }

      const metadata = assetMetadataMap instanceof Map ? assetMetadataMap.get(normalizePath(asset.publicId)) : null;
      if (metadata) {
        const nextContext = {
          ...(asset.context || {}),
        };

        if (String(metadata.alt || '').trim()) {
          nextContext.alt = metadata.alt;
        } else {
          delete nextContext.alt;
        }

        if (String(metadata.altEn || '').trim()) {
          nextContext.alt_en = metadata.altEn;
        } else {
          delete nextContext.alt_en;
        }

        asset = {
          ...asset,
          context: nextContext,
          tags: Array.isArray(metadata.tags) ? metadata.tags : [],
        };
      }

      const order = assetOrderMap instanceof Map ? assetOrderMap.get(normalizePath(asset.publicId)) : null;
      if (Number.isFinite(order)) {
        return {
          ...asset,
          order,
        };
      }

      return asset;
    })
    .sort(sortByOrderThenDate);
  const inferredSubFolders = getImmediateChildFolders(currentFolder, [...imageResources, ...videoResources], externalItems);
  const folders = mergeFolderEntries(
    [...navigatorPayload.folders.map((folder) => folder.path), ...inferredSubFolders],
    navigatorPayload.folders.map((folder) => folder.path)
  );

  // #region debug-point A:folder-assets-payload
  void reportFolderDebug('A', 'server/admin-api.js:getFolderPayload', 'Folder payload assembled', {
    folderInput: folderInput || null,
    currentFolder,
    folderCount: folders.length,
    assetCount: assets.length,
    sampleAssetIds: assets.slice(0, 5).map((asset) => asset?.publicId || asset?.id || null),
  });
  // #endregion

  return {
    root: navigatorPayload.root,
    currentFolder: navigatorPayload.currentFolder,
    parentFolder: navigatorPayload.parentFolder,
    folders,
    assets,
  };
};

const createFolder = async (folderName, parentFolder) => {
  const { cloudinary } = await configureCloudinary();
  const normalizedFolderName = normalizePath(folderName).split('/').pop();

  if (!normalizedFolderName) {
    throw new HttpError(400, 'Le nom du dossier est obligatoire.', 'missing_folder_name');
  }

  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(normalizedFolderName)) {
    throw new HttpError(
      400,
      'Utilise uniquement des lettres, chiffres, tirets et underscores pour le dossier.',
      'invalid_folder_name'
    );
  }

  const parentPath = await resolveCanonicalFolderPath(parentFolder);
  const path = normalizePath(`${parentPath}/${normalizedFolderName}`);
  await cloudinary.api.create_folder(path);
  await trackFolder(path);
  return path;
};

const renameFolder = async (folderPath, nextName) => {
  const { cloudinary } = await configureCloudinary();
  const currentPath = await resolveCanonicalFolderPath(folderPath);
  const rootFolder = getRootFolder();

  if (!currentPath || currentPath === rootFolder) {
    throw new HttpError(400, 'Le dossier racine ne peut pas etre renomme.', 'invalid_folder_rename');
  }

  const normalizedFolderName = normalizePath(nextName).split('/').pop();

  if (!normalizedFolderName) {
    throw new HttpError(400, 'Le nouveau nom du dossier est obligatoire.', 'missing_folder_name');
  }

  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(normalizedFolderName)) {
    throw new HttpError(
      400,
      'Utilise uniquement des lettres, chiffres, tirets et underscores pour le dossier.',
      'invalid_folder_name'
    );
  }

  const parentPath = currentPath.slice(0, currentPath.lastIndexOf('/')) || rootFolder;
  const nextPath = normalizePath(`${parentPath}/${normalizedFolderName}`);

  if (nextPath === currentPath) {
    return currentPath;
  }

  try {
    await cloudinary.api.rename_folder(currentPath, nextPath);
  } catch (error) {
    const rawMessage = String(error?.error?.message || error?.message || '').trim();
    if (/cannot find source folder/i.test(rawMessage)) {
      const [imageResources, videoResources] = await Promise.all([
        fetchAllResources(`${currentPath}/`, 'image'),
        fetchAllResources(`${currentPath}/`, 'video'),
      ]);
      const resources = [...imageResources, ...videoResources].filter((resource) => Boolean(resource?.public_id));

      if (resources.length === 0) {
        await Promise.all([
          renameTrackedFolder(currentPath, nextPath),
          renameExternalMediaFolder(currentPath, nextPath),
          renameAssetOrderFolderPrefix(currentPath, nextPath).catch(() => undefined),
          renameAssetMetadataFolderPrefix(currentPath, nextPath).catch(() => undefined),
          trackFolder(nextPath),
        ]);
        return nextPath;
      }

      for (const resource of resources) {
        const oldPublicId = normalizePath(resource.public_id);
        if (!oldPublicId || !(oldPublicId === currentPath || oldPublicId.startsWith(`${currentPath}/`))) {
          continue;
        }

        const nextPublicId = normalizePath(`${nextPath}${oldPublicId.slice(currentPath.length)}`);
        if (!nextPublicId || nextPublicId === oldPublicId) {
          continue;
        }

        await cloudinary.uploader.rename(oldPublicId, nextPublicId, {
          resource_type: resource.resource_type === 'video' ? 'video' : 'image',
          type: 'upload',
          overwrite: false,
          invalidate: true,
        });
      }

      await Promise.all([
        renameTrackedFolder(currentPath, nextPath),
        renameExternalMediaFolder(currentPath, nextPath),
        renameAssetOrderFolderPrefix(currentPath, nextPath).catch(() => undefined),
        renameAssetMetadataFolderPrefix(currentPath, nextPath).catch(() => undefined),
        trackFolder(nextPath),
      ]);
      return nextPath;
    }

    const message =
      rawMessage || `Cloudinary rename_folder a échoué (${currentPath} -> ${nextPath}).`;
    throw new HttpError(502, message, 'cloudinary_rename_folder_failed');
  }

  try {
    await Promise.all([
      renameTrackedFolder(currentPath, nextPath),
      renameExternalMediaFolder(currentPath, nextPath),
      renameAssetOrderFolderPrefix(currentPath, nextPath).catch(() => undefined),
      renameAssetMetadataFolderPrefix(currentPath, nextPath).catch(() => undefined),
      trackFolder(nextPath),
    ]);
  } catch (error) {
    const message =
      String(error?.message || error?.error?.message || '').trim() ||
      "Le renommage des données associées (Supabase) a échoué après le renommage Cloudinary.";
    throw new HttpError(500, message, 'folder_rename_postprocess_failed');
  }

  return nextPath;
};

const registerExistingFolder = async (folderName, parentFolder) => {
  const normalizedInput = normalizePath(folderName);

  if (!normalizedInput) {
    throw new HttpError(400, 'Le nom du dossier existant est obligatoire.', 'missing_folder_name');
  }

  const parentPath = await resolveCanonicalFolderPath(parentFolder);
  const rawPath = normalizedInput.includes('/') ? normalizeWithinRoot(normalizedInput) : normalizePath(`${parentPath}/${normalizedInput}`);
  const path = await resolveCanonicalFolderPath(rawPath);

  if (path === getRootFolder()) {
    return path;
  }

  await trackFolder(path);
  return path;
};

const deleteFolder = async (folderPath) => {
  const { cloudinary } = await configureCloudinary();
  const normalizedPath = normalizeWithinRoot(folderPath);
  const rootFolder = getRootFolder();

  if (!normalizedPath || normalizedPath === rootFolder) {
    throw new HttpError(400, 'Le dossier racine ne peut pas etre supprime.', 'invalid_folder_delete');
  }

  const [imageResources, videoResources, subFoldersResponse] = await Promise.all([
    fetchAllResources(`${normalizedPath}/`, 'image'),
    fetchAllResources(`${normalizedPath}/`, 'video'),
    cloudinary.api.sub_folders(normalizedPath),
  ]);
  const externalItems = await listExternalMediaByFolder(normalizedPath);

  if (
    imageResources.length > 0 ||
    videoResources.length > 0 ||
    externalItems.length > 0 ||
    (subFoldersResponse.folders || []).length > 0
  ) {
    throw new HttpError(
      409,
      'Le dossier doit etre vide avant suppression. Supprime d abord les fichiers et sous-dossiers.',
      'folder_not_empty'
    );
  }

  await cloudinary.api.delete_folder(normalizedPath);
  await untrackFolder(normalizedPath);
};

const deleteAsset = async (publicId, resourceType = 'image', assetSource = 'cloudinary') => {
  if (assetSource === 'external' || resourceType === 'external-video') {
    await deleteExternalMediaItem(String(publicId || '').trim());
    return;
  }

  const { cloudinary } = await configureCloudinary();
  const normalizedPublicId = normalizePath(publicId);
  const normalizedRoot = getRootFolder();

  if (!normalizedPublicId || !(normalizedPublicId === normalizedRoot || normalizedPublicId.startsWith(`${normalizedRoot}/`))) {
    throw new HttpError(400, 'Le fichier cible est invalide.', 'invalid_public_id');
  }

  await cloudinary.api.delete_resources([normalizedPublicId], {
    resource_type: resourceType === 'video' ? 'video' : 'image',
    type: 'upload',
    invalidate: true,
  });

  const folderPath = normalizedPublicId.slice(0, normalizedPublicId.lastIndexOf('/')) || normalizedRoot;
  await Promise.all([
    deleteAssetOrder(folderPath, normalizedPublicId).catch(() => undefined),
    deleteAssetMetadata(folderPath, normalizedPublicId).catch(() => undefined),
  ]);
};

const updateAsset = async (publicId, resourceType = 'image', updates = {}, assetSource = 'cloudinary') => {
  if (assetSource === 'external' || resourceType === 'external-video') {
    await updateExternalMediaItem(String(publicId || '').trim(), {
      order: updates.order,
      alt: updates.alt,
      altEn: updates.altEn,
      tags: updates.tags,
    });
    return;
  }

  const normalizedPublicId = normalizePath(publicId);
  const normalizedRoot = getRootFolder();

  if (!normalizedPublicId || !(normalizedPublicId === normalizedRoot || normalizedPublicId.startsWith(`${normalizedRoot}/`))) {
    throw new HttpError(400, 'Le fichier cible est invalide.', 'invalid_public_id');
  }

  const folderPath = normalizedPublicId.slice(0, normalizedPublicId.lastIndexOf('/')) || normalizedRoot;
  await upsertAssetMetadata(folderPath, normalizedPublicId, {
    alt: updates.alt,
    altEn: updates.altEn,
    tags: Object.prototype.hasOwnProperty.call(updates, 'tags') ? updates.tags : [],
  });
};

const reorderAssets = async (items) => {
  const normalizedItems = Array.isArray(items)
    ? items.map((item, index) => ({
        publicId: String(item?.publicId || '').trim(),
        resourceType: String(item?.resourceType || 'image').trim(),
        assetSource: String(item?.assetSource || 'cloudinary').trim(),
        order: index,
      }))
    : [];

  if (normalizedItems.length === 0) {
    throw new HttpError(400, 'La liste a reordonner est vide.', 'missing_reorder_items');
  }

  const folderGroups = new Map();
  const externalItems = [];

  normalizedItems.forEach((item) => {
    if (item.assetSource === 'external' || item.resourceType === 'external-video') {
      externalItems.push(item);
      return;
    }

    const normalizedPublicId = normalizePath(item.publicId);
    const normalizedRoot = getRootFolder();

    if (!normalizedPublicId || !(normalizedPublicId === normalizedRoot || normalizedPublicId.startsWith(`${normalizedRoot}/`))) {
      return;
    }

    const folderPath = normalizedPublicId.slice(0, normalizedPublicId.lastIndexOf('/')) || normalizedRoot;
    if (!folderGroups.has(folderPath)) {
      folderGroups.set(folderPath, []);
    }
    folderGroups.get(folderPath).push({ publicId: normalizedPublicId, sortOrder: item.order });
  });

  for (const [folderPath, orderedPublicIds] of folderGroups.entries()) {
    await saveAssetOrderForFolder(folderPath, orderedPublicIds);
  }

  if (externalItems.length > 0) {
    await reorderExternalMediaItems(
      externalItems.map((item) => ({
        id: item.publicId,
        order: item.order,
      }))
    );
  }

  void clearPortfolioPayloadCacheSafe();
};

const createYoutubeVideo = async (body) => {
  const folder = normalizeWithinRoot(body.folder);
  // #region debug-point A:create-youtube-video
  void reportFolderDebug('A', 'server/admin-api.js:createYoutubeVideo', 'Creating YouTube video from admin payload', {
    folderInput: body?.folder || null,
    normalizedFolder: folder,
    hasUrl: Boolean(String(body?.url || '').trim()),
    hasTitle: Boolean(String(body?.title || '').trim()),
    hasAlt: Boolean(String(body?.alt || '').trim()),
    hasAltEn: Boolean(String(body?.altEn || '').trim()),
    tagCount: Array.isArray(body?.tags) ? body.tags.length : 0,
  });
  // #endregion

  return createExternalYoutubeItem({
    folder,
    url: body.url,
    title: body.title,
    alt: body.alt,
    altEn: body.altEn,
    tags: Array.isArray(body.tags) ? body.tags : [],
    order: body.order,
  });
};

const signUpload = async (body) => {
  const { apiKey, apiSecret, cloudName, cloudinary } = await configureCloudinary();
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

  if (!uploadPreset) {
    throw new HttpError(500, 'Le preset Cloudinary est introuvable.', 'missing_upload_preset');
  }

  const paramsToSign = body?.paramsToSign && typeof body.paramsToSign === 'object' ? body.paramsToSign : {};
  const timestamp = Number.parseInt(String(paramsToSign.timestamp ?? '').trim(), 10);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(timestamp)) {
    throw new HttpError(400, 'Le timestamp de signature est invalide.', 'invalid_upload_timestamp');
  }

  if (Math.abs(timestamp - now) > 10 * 60) {
    throw new HttpError(400, 'Le timestamp de signature est expiré.', 'expired_upload_timestamp');
  }

  const tags = String(paramsToSign.tags ?? '').trim();
  const context = String(paramsToSign.context ?? '').trim();
  const resourceType = String(paramsToSign.resource_type || '').trim().toLowerCase() === 'video' ? 'video' : 'image';

  if (tags.length > 800) {
    throw new HttpError(400, 'La liste de tags est trop longue.', 'upload_tags_too_long');
  }

  if (context.length > 1800) {
    throw new HttpError(400, 'Le contexte Cloudinary est trop long.', 'upload_context_too_long');
  }

  const signedParams = {};

  Object.entries(paramsToSign).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      return;
    }
    if (normalizedKey === 'file' || normalizedKey === 'signature' || normalizedKey === 'api_key') {
      return;
    }
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'object') {
      return;
    }
    const normalizedValue = String(value).trim();
    if (!normalizedValue) {
      return;
    }
    signedParams[normalizedKey] = normalizedValue;
  });

  signedParams.timestamp = timestamp;
  signedParams.folder = normalizeWithinRoot(paramsToSign.folder);
  signedParams.tags = tags;
  signedParams.context = context;
  signedParams.upload_preset = uploadPreset;

  if (Object.prototype.hasOwnProperty.call(signedParams, 'resource_type')) {
    const normalized = String(signedParams.resource_type || '').trim().toLowerCase();
    if (normalized !== 'video') {
      delete signedParams.resource_type;
    } else {
      signedParams.resource_type = 'video';
    }
  }

  const source = String(paramsToSign.source ?? '').trim();
  if (source) {
    signedParams.source = source;
  }

  const signature = cloudinary.utils.api_sign_request(signedParams, apiSecret);

  return {
    signature,
    cloudName,
    apiKey,
    uploadPreset,
    timestamp,
  };
};

const translateText = async (text, source, target) => {
  const normalizedText = String(text || '').trim();

  if (!normalizedText) {
    throw new HttpError(400, 'Le texte a traduire est obligatoire.', 'missing_translation_text');
  }

  if (normalizedText.length > 1200) {
    throw new HttpError(400, 'Le texte a traduire est trop long.', 'translation_text_too_long');
  }

  const normalizedSource = String(source || '').trim().toLowerCase();
  const normalizedTarget = String(target || '').trim().toLowerCase();

  if (!normalizedSource || !normalizedTarget || normalizedSource === normalizedTarget) {
    throw new HttpError(400, 'Les langues source et cible sont invalides.', 'invalid_translation_languages');
  }

  const apiKey = String(process.env.LIBRETRANSLATE_API_KEY || '').trim();
  const endpoints = getLibreTranslateEndpoints();
  const errors = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          q: normalizedText,
          source: normalizedSource,
          target: normalizedTarget,
          format: 'text',
          ...(apiKey ? { api_key: apiKey } : {}),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.translatedText) {
        errors.push(payload?.error || payload?.message || `HTTP ${response.status} sur ${endpoint}`);
        continue;
      }

      return {
        translatedText: String(payload.translatedText).trim(),
        provider: 'LibreTranslate',
        endpoint,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  try {
    const params = new URLSearchParams({
      q: normalizedText,
      langpair: `${normalizedSource}|${normalizedTarget}`,
    });
    const contactEmail = getMyMemoryContactEmail();

    if (contactEmail) {
      params.set('de', contactEmail);
    }

    const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
      },
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.responseStatus !== 200 || !payload?.responseData?.translatedText) {
      errors.push(payload?.responseDetails || payload?.message || `HTTP ${response.status} sur MyMemory`);
    } else {
      return {
        translatedText: String(payload.responseData.translatedText).trim(),
        provider: 'MyMemory',
        endpoint: 'https://api.mymemory.translated.net/get',
      };
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  throw new HttpError(
    502,
    errors[0] || 'La traduction automatique est indisponible pour le moment.',
    'translation_unavailable'
  );
};

const toManagedUserPayload = async (user, options = {}) => {
  const resolvedRole = getUserRole(user) || getDefaultClientRole();
  const includeMfa = typeof options.includeMfa === 'boolean' ? options.includeMfa : resolvedRole === 'admin';
  const verifiedFactors = includeMfa ? await listVerifiedMfaFactors(getSupabaseAdmin(), user.id).catch(() => []) : [];

  return {
    id: user.id,
    email: user.email || '',
    displayName: String(user.user_metadata?.display_name || '').trim(),
    role: resolvedRole,
    createdAt: user.created_at || null,
    lastSignInAt: user.last_sign_in_at || null,
    invitedAt: user.invited_at || null,
    emailConfirmed: Boolean(user.email_confirmed_at),
    mfaEnabled: verifiedFactors.length > 0,
    mfaFactorCount: verifiedFactors.length,
  };
};

const listManagedUsers = async () => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    throw new HttpError(500, error.message, 'list_users_failed');
  }

  const users = Array.isArray(data?.users) ? data.users : [];
  const normalizedBootstrapEmail = getBootstrapAdminEmail();

  const normalizedUsers = users
    .filter((user) => Boolean(user.email))
    .map((user) => {
      if (normalizeEmail(user.email) === normalizedBootstrapEmail && getUserRole(user) !== 'admin') {
        return {
          ...user,
          app_metadata: {
            ...(user.app_metadata || {}),
            role: 'admin',
          },
        };
      }

      return user;
    });

  const payloads = await Promise.all(normalizedUsers.map((user) => toManagedUserPayload(user)));

  return payloads.sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === 'admin' ? -1 : 1;
      }

      return left.email.localeCompare(right.email, 'fr');
    });
};

const createManagedUser = async (body) => {
  const supabase = getSupabaseAdmin();
  const email = normalizeEmail(body.email);
  const role = getAllowedManagedRole(body.role);
  const displayName = String(body.displayName || '').trim();
  const password = String(body.password || '').trim();
  const requestMode = String(body.mode || '').trim().toLowerCase();
  const redirectTo = String(body.redirectTo || getClientInviteRedirect()).trim();
  const metadata = displayName ? { display_name: displayName } : {};

  // #region debug-point A:invite-create-start
  void reportInviteDebug('A', 'server/admin-api.js:createManagedUser:start', 'Creating managed user invite', {
    email,
    role,
    hasDisplayName: Boolean(displayName),
    redirectTo,
    siteUrlEnv: String(process.env.SITE_URL || '').trim(),
  });
  // #endregion

  if (!email || !email.includes('@')) {
    throw new HttpError(400, 'Une adresse email valide est obligatoire.', 'invalid_user_email');
  }

  if (requestMode === 'invite') {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: metadata,
      redirectTo,
    });

    // #region debug-point B:invite-generate-link-result
    void reportInviteDebug('B', 'server/admin-api.js:createManagedUser:inviteUserByEmail', 'Supabase inviteUserByEmail response received', {
      email,
      hasError: Boolean(error),
      errorMessage: error?.message || '',
      userId: data?.user?.id || '',
      userEmail: data?.user?.email || '',
      invitedAt: data?.user?.invited_at || '',
      confirmationSentAt: data?.user?.confirmation_sent_at || '',
      redirectTo,
    });
    // #endregion

    if (error || !data.user) {
      throw new HttpError(400, error?.message || "Impossible d'envoyer l'invitation par email.", 'invite_email_failed');
    }

    await supabase.auth.admin.updateUserById(data.user.id, {
      app_metadata: {
        ...(data.user.app_metadata || {}),
        role,
      },
    });

    return {
      mode: 'invite',
      user: await toManagedUserPayload({
        ...data.user,
        app_metadata: {
          ...(data.user.app_metadata || {}),
          role,
        },
      }),
    };
  }

  const effectivePassword = password || randomBytes(18).toString('base64url');
  const userMetadata = password
    ? metadata
    : {
        ...metadata,
        password_change_required: true,
        temporary_password_issued_at: new Date().toISOString(),
      };

  if (effectivePassword.length < 8) {
    throw new HttpError(400, 'Le mot de passe doit contenir au moins 8 caracteres.', 'invalid_user_password');
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: effectivePassword,
    email_confirm: true,
    user_metadata: userMetadata,
    app_metadata: {
      role,
    },
  });

  if (error || !data.user) {
    throw new HttpError(400, error?.message || 'Impossible de creer ce compte.', 'create_user_failed');
  }

  return {
    mode: password ? 'password' : 'generated_password',
    temporaryPassword: password ? null : effectivePassword,
    user: await toManagedUserPayload({
      ...data.user,
      app_metadata: {
        ...(data.user.app_metadata || {}),
        role,
      },
      user_metadata: {
        ...(data.user.user_metadata || {}),
        ...userMetadata,
      },
    }),
  };
};

const getManagedUserById = async (userId) => {
  const users = await listManagedUsers();
  return users.find((user) => user.id === String(userId || '').trim()) || null;
};

const updateManagedUser = async (body) => {
  const normalizedUserId = String(body.userId || '').trim();

  if (!normalizedUserId) {
    throw new HttpError(400, 'Le compte a modifier est invalide.', 'invalid_user_id');
  }

  const supabase = getSupabaseAdmin();
  const managedUser = await getManagedUserById(normalizedUserId);

  if (!managedUser) {
    throw new HttpError(404, 'Compte introuvable.', 'user_not_found');
  }

  const nextRole = getAllowedManagedRole(body.role || managedUser.role);
  const displayName = String(body.displayName ?? managedUser.displayName ?? '').trim();

  const { data, error } = await supabase.auth.admin.updateUserById(normalizedUserId, {
    app_metadata: {
      role: nextRole,
    },
    user_metadata: {
      display_name: displayName,
    },
  });

  if (error || !data.user) {
    throw new HttpError(400, error?.message || 'Impossible de mettre a jour ce compte.', 'update_user_failed');
  }

  return toManagedUserPayload(data.user);
};

const createManagedPasswordResetLink = async (body) => {
  const normalizedUserId = String(body.userId || '').trim();
  const managedUser = await getManagedUserById(normalizedUserId);

  if (!managedUser?.email) {
    throw new HttpError(404, 'Compte introuvable.', 'user_not_found');
  }

  const supabase = getSupabaseAdmin();
  const temporaryPassword = randomBytes(18).toString('base64url');
  const { data, error } = await supabase.auth.admin.updateUserById(normalizedUserId, {
    password: temporaryPassword,
    user_metadata: {
      display_name: managedUser.displayName,
      password_change_required: true,
      temporary_password_issued_at: new Date().toISOString(),
    },
  });

  if (error || !data.user) {
    throw new HttpError(400, error?.message || 'Impossible de regenerer le mot de passe temporaire.', 'temporary_password_reset_failed');
  }

  return {
    user: await toManagedUserPayload({
      ...data.user,
      app_metadata: {
        ...(data.user.app_metadata || {}),
        role: managedUser.role,
      },
      user_metadata: {
        ...(data.user.user_metadata || {}),
        display_name: managedUser.displayName,
        password_change_required: true,
      },
    }),
    temporaryPassword,
  };
};

const deleteManagedUser = async (userId, currentUserId) => {
  const normalizedUserId = String(userId || '').trim();

  if (!normalizedUserId) {
    throw new HttpError(400, 'Le compte a supprimer est invalide.', 'invalid_user_id');
  }

  if (normalizedUserId === String(currentUserId || '').trim()) {
    throw new HttpError(400, 'Tu ne peux pas supprimer ton propre compte admin.', 'cannot_delete_self');
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(normalizedUserId);

  if (error) {
    throw new HttpError(400, error.message, 'delete_user_failed');
  }
};

const resetManagedUserMfa = async (userId, currentUserId) => {
  const normalizedUserId = String(userId || '').trim();

  if (!normalizedUserId) {
    throw new HttpError(400, 'Le compte cible est invalide.', 'invalid_user_id');
  }

  if (normalizedUserId === String(currentUserId || '').trim()) {
    throw new HttpError(400, 'Utilise ton ecran 2FA personnel pour reinitialiser ton propre compte.', 'invalid_target_user');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: normalizedUserId });

  if (error) {
    throw new HttpError(500, error.message || 'Impossible de lister les facteurs 2FA.', 'mfa_list_failed');
  }

  const factors = Array.isArray(data?.factors) ? data.factors : [];

  for (const factor of factors) {
    const { error: deleteError } = await supabase.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: normalizedUserId,
    });

    if (deleteError) {
      throw new HttpError(500, deleteError.message || 'Impossible de reinitialiser la 2FA.', 'mfa_reset_failed');
    }
  }

  return {
    deletedCount: factors.length,
  };
};

const bulkUpdateAssets = async (items, updates) => {
  const normalizedItems = Array.isArray(items)
    ? items.map((item) => ({
        publicId: String(item?.publicId || '').trim(),
        resourceType: String(item?.resourceType || 'image').trim(),
        assetSource: String(item?.assetSource || 'cloudinary').trim(),
      }))
    : [];

  if (normalizedItems.length === 0) {
    throw new HttpError(400, 'Selection vide. Choisis au moins un media.', 'missing_bulk_items');
  }

  const payload = {};

  if (Object.prototype.hasOwnProperty.call(updates, 'alt')) {
    payload.alt = String(updates.alt || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'altEn')) {
    payload.altEn = String(updates.altEn || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'tags')) {
    payload.tags = Array.isArray(updates.tags) ? updates.tags : [];
  }

  const normalizedRoot = getRootFolder();
  const cloudinaryRows = [];

  await Promise.all(
    normalizedItems.map(async (item) => {
      if (item.assetSource === 'external' || item.resourceType === 'external-video') {
        await updateExternalMediaItem(item.publicId, payload);
        return;
      }

      const normalizedPublicId = normalizePath(item.publicId);

      if (!normalizedPublicId || !(normalizedPublicId === normalizedRoot || normalizedPublicId.startsWith(`${normalizedRoot}/`))) {
        return;
      }

      const folderPath = normalizedPublicId.slice(0, normalizedPublicId.lastIndexOf('/')) || normalizedRoot;
      cloudinaryRows.push({
        folderPath,
        publicId: normalizedPublicId,
        alt: payload.alt,
        altEn: payload.altEn,
        tags: payload.tags,
      });
    })
  );

  if (cloudinaryRows.length > 0) {
    await upsertAssetMetadataBulk(cloudinaryRows);
  }
};

const handleSession = async (req, res) => {
  const session = await requireSession(req, { allowIncompleteMfa: true });
  const { user, role, mfa } = session;
  const jwtPayload = parseJwtPayload(getAuthToken(req));
  const sessionId = String(jwtPayload?.session_id || jwtPayload?.jti || '').trim();

  await appendAuditLog(
    createAuditEntry(session, 'session_opened', 'session', user.email || 'session', {
      sessionId,
      ...getAuditRequestDetails(req),
    }),
    {
      dedupeKey: `session:${user.id}`,
      dedupeValue: sessionId || `${user.id}:${user.last_sign_in_at || ''}`,
    }
  );

  sendJson(res, 200, {
    email: user.email,
    role,
    canManageUsers: role === 'admin',
    bootstrapAdminEmail: getBootstrapAdminEmail(),
    rootFolder: getRootFolder(),
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    mfa: {
      currentAal: mfa.currentAal,
      factorCount: mfa.factorCount,
      hasVerifiedFactor: mfa.hasVerifiedFactor,
      mustEnroll: mfa.mustEnroll,
      mustVerify: mfa.mustVerify,
      remembered: mfa.remembered,
      rememberedUntil: mfa.rememberedUntil,
    },
  });
};

const handleMfaRemember = async (req, res) => {
  const { user, mfa } = await requireSession(req);

  if (req.method !== 'POST') {
    throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
  }

  if (mfa.currentAal !== 'aal2') {
    throw new HttpError(403, 'Valide d abord le code 2FA avant de memoriser cet appareil.', 'mfa_verification_required');
  }

  sendJson(res, 200, issueRememberedMfaToken(user));
};

const handleFolders = async (req, res) => {
  const session = await requireSession(req);

  if (req.method === 'GET') {
    const folder = parseUrl(req).searchParams.get('folder') || undefined;
    const payload = await getFolderNavigatorPayload(folder);
    // #region debug-point A:folders-endpoint
    void reportFolderDebug('A', 'server/admin-api.js:handleFolders:GET', 'Folders endpoint response ready', {
      requestedFolder: folder || null,
      responseRoot: payload?.root || null,
      responseCurrentFolder: payload?.currentFolder || null,
      responseCount: Array.isArray(payload?.folders) ? payload.folders.length : null,
      responseSample: Array.isArray(payload?.folders) ? payload.folders.slice(0, 5).map((entry) => entry?.path || null) : [],
      actor: session?.user?.email || null,
    });
    // #endregion
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const mode = String(body.mode || 'create').trim().toLowerCase();
    const path = mode === 'register' ? await registerExistingFolder(body.name, body.parentFolder) : await createFolder(body.name, body.parentFolder);
    await appendAuditLog(
      createAuditEntry(session, 'folder_created', 'folder', path, {
        mode,
        ...getAuditRequestDetails(req),
      }, path)
    );
    sendJson(res, mode === 'register' ? 200 : 201, { path });
    return;
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    if (String(body.mode || '').trim().toLowerCase() === 'reorder') {
      const parentPath = await reorderFolders(body.parentFolder, body.items);
      await appendAuditLog(
        createAuditEntry(session, 'folder_reordered', 'folder', parentPath, {
          itemCount: Array.isArray(body.items) ? body.items.length : 0,
          ...getAuditRequestDetails(req),
        }, parentPath)
      );
      sendJson(res, 200, { parentFolder: parentPath });
      return;
    }
    const previousPath = await resolveCanonicalFolderPath(body.path);
    const path = await renameFolder(body.path, body.name);
    await appendAuditLog(
      createAuditEntry(session, 'folder_renamed', 'folder', path, {
        previousPath,
        previousName: getPathName(previousPath),
        nextName: getPathName(path),
        ...getAuditRequestDetails(req),
      }, path)
    );
    sendJson(res, 200, { path });
    return;
  }

  if (req.method === 'DELETE') {
    const body = await readBody(req);
    const path = await resolveCanonicalFolderPath(body.path);
    await deleteFolder(body.path);
    await appendAuditLog(
      createAuditEntry(session, 'folder_deleted', 'folder', path, {
        ...getAuditRequestDetails(req),
      }, path)
    );
    sendNoContent(res);
    return;
  }

  throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
};

const handleAssets = async (req, res) => {
  const session = await requireSession(req);

  if (req.method === 'GET') {
    const folder = parseUrl(req).searchParams.get('folder') || undefined;
    sendJson(res, 200, await getFolderPayload(folder));
    return;
  }

  if (req.method === 'DELETE') {
    const body = await readBody(req);
    const previousAsset = await getAssetAuditSnapshot(body.publicId, body.resourceType, body.assetSource);
    await deleteAsset(body.publicId, body.resourceType, body.assetSource);
    await appendAuditLog(
      createAuditEntry(session, 'asset_deleted', 'asset', previousAsset?.targetLabel || body.publicId, {
        resourceType: previousAsset?.details?.resourceType || body.resourceType,
        assetSource: previousAsset?.details?.assetSource || body.assetSource || 'cloudinary',
        folder: previousAsset?.details?.folder || '',
        title: previousAsset?.details?.title || '',
        alt: previousAsset?.details?.alt || '',
        altEn: previousAsset?.details?.altEn || '',
        tags: previousAsset?.details?.tags || [],
        order: previousAsset?.details?.order ?? '',
        url: previousAsset?.details?.url || '',
        ...getAuditRequestDetails(req),
      }, previousAsset?.targetId || String(body.publicId || '').trim())
    );
    sendNoContent(res);
    return;
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const previousAsset = await getAssetAuditSnapshot(body.publicId, body.resourceType, body.assetSource);
    await updateAsset(
      body.publicId,
      body.resourceType,
      {
        order: body.order,
        alt: body.alt,
        altEn: body.altEn,
        tags: body.tags,
      },
      body.assetSource
    );
    const nextAsset = await getAssetAuditSnapshot(body.publicId, body.resourceType, body.assetSource);
    await appendAuditLog(
      createAuditEntry(session, 'asset_updated', 'asset', nextAsset?.targetLabel || previousAsset?.targetLabel || body.publicId, {
        resourceType: nextAsset?.details?.resourceType || previousAsset?.details?.resourceType || body.resourceType,
        assetSource: nextAsset?.details?.assetSource || previousAsset?.details?.assetSource || body.assetSource || 'cloudinary',
        folder: nextAsset?.details?.folder || previousAsset?.details?.folder || '',
        beforeTitle: previousAsset?.details?.title || '',
        afterTitle: nextAsset?.details?.title || '',
        beforeAlt: previousAsset?.details?.alt || '',
        afterAlt: nextAsset?.details?.alt || '',
        beforeAltEn: previousAsset?.details?.altEn || '',
        afterAltEn: nextAsset?.details?.altEn || '',
        beforeTags: previousAsset?.details?.tags || [],
        afterTags: nextAsset?.details?.tags || [],
        beforeOrder: previousAsset?.details?.order ?? '',
        afterOrder: nextAsset?.details?.order ?? '',
        ...getAuditRequestDetails(req),
      }, nextAsset?.targetId || previousAsset?.targetId || String(body.publicId || '').trim())
    );
    sendNoContent(res);
    return;
  }

  throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
};

const handleUploadSignature = async (req, res) => {
  await requireSession(req);
  enforceRateLimit(req, 'admin:upload-signature', { limit: 240, windowMs: 60_000 });

  if (req.method !== 'POST') {
    throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
  }

  const body = await readBody(req);
  sendJson(res, 200, await signUpload(body));
};

const handleAssetReorder = async (req, res) => {
  const session = await requireSession(req);

  if (req.method !== 'POST') {
    throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
  }

  const body = await readBody(req);
  await reorderAssets(body.items);
  await appendAuditLog(
    createAuditEntry(session, 'asset_reordered', 'gallery', 'Ordre de la galerie', {
      itemCount: Array.isArray(body.items) ? body.items.length : 0,
      ...getAuditRequestDetails(req),
    })
  );
  sendNoContent(res);
};

const handleAssetBulkUpdate = async (req, res) => {
  const session = await requireSession(req);

  if (req.method !== 'POST') {
    throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
  }

  const body = await readBody(req);
  await bulkUpdateAssets(body.items, {
    alt: body.alt,
    altEn: body.altEn,
    tags: body.tags,
  });
  await appendAuditLog(
    createAuditEntry(session, 'assets_bulk_updated', 'asset', 'Sélection multiple', {
      itemCount: Array.isArray(body.items) ? body.items.length : 0,
      alt: body.alt,
      altEn: body.altEn,
      tags: Array.isArray(body.tags) ? body.tags : [],
      ...getAuditRequestDetails(req),
    })
  );
  sendNoContent(res);
};

const handleYoutubeVideos = async (req, res) => {
  const session = await requireSession(req);
  enforceRateLimit(req, 'admin:youtube-videos', { limit: 60, windowMs: 60_000 });

  if (req.method !== 'POST') {
    throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
  }

  const body = await readBody(req);
  // #region debug-point A:youtube-route-entry
  void reportFolderDebug('A', 'server/admin-api.js:handleYoutubeVideos', 'YouTube video route entered', {
    actor: session?.user?.email || null,
    folder: body?.folder || null,
    hasUrl: Boolean(String(body?.url || '').trim()),
    hasTitle: Boolean(String(body?.title || '').trim()),
    hasAlt: Boolean(String(body?.alt || '').trim()),
    hasAltEn: Boolean(String(body?.altEn || '').trim()),
    tagCount: Array.isArray(body?.tags) ? body.tags.length : 0,
  });
  // #endregion
  const item = await createYoutubeVideo(body);
  await appendAuditLog(
    createAuditEntry(session, 'youtube_video_created', 'asset', item.title || item.url, {
      folder: item.folder,
      tags: item.tags || [],
      url: item.url,
      ...getAuditRequestDetails(req),
    }, item.id)
  );
  sendJson(res, 201, {
    item: toExternalVideoAsset(item),
  });
};

const handleTranslate = async (req, res) => {
  await requireSession(req);
  enforceRateLimit(req, 'admin:translate', { limit: 90, windowMs: 60_000 });

  if (req.method !== 'POST') {
    throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
  }

  const body = await readBody(req);
  sendJson(res, 200, await translateText(body.text, body.source, body.target));
};

const resetCurrentUserMfa = async (req, res) => {
  const session = await requireSession(req);
  const { user } = session;

  if (req.method !== 'POST') {
    throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: user.id });

  if (error) {
    throw new HttpError(500, error.message || 'Impossible de lister les facteurs 2FA.', 'mfa_list_failed');
  }

  const factors = Array.isArray(data?.factors) ? data.factors : [];

  await Promise.all(
    factors.map(async (factor) => {
      const { error: deleteError } = await supabase.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: user.id,
      });

      if (deleteError) {
        throw new HttpError(
          500,
          deleteError.message || 'Impossible de reinitialiser les facteurs 2FA.',
          'mfa_reset_failed'
        );
      }
    })
  );

  sendJson(res, 200, {
    deletedCount: factors.length,
  });

  await appendAuditLog(
    createAuditEntry(session, 'mfa_reset_self', 'user', user.email || user.id, {
      deletedCount: factors.length,
      ...getAuditRequestDetails(req),
    }, user.id)
  );
};

const handleLogs = async (req, res) => {
  await requireAdmin(req);
  const url = parseUrl(req);

  if (req.method === 'GET') {
    const action = url.searchParams.get('action') || '';
    const actorEmail = url.searchParams.get('actorEmail') || '';
    const dateFrom = url.searchParams.get('dateFrom') || '';
    const dateTo = url.searchParams.get('dateTo') || '';
    const query = url.searchParams.get('query') || '';
    const limit = url.searchParams.get('limit') || '500';

    sendJson(res, 200, {
      entries: await listAuditLogs({
        action,
        actorEmail,
        dateFrom,
        dateTo,
        query,
        limit,
      }),
    });
    return;
  }

  if (req.method === 'DELETE') {
    const entries = await listAuditLogs({ limit: 1000 });
    await clearAuditLogs();
    sendJson(res, 200, {
      clearedCount: entries.length,
    });
    return;
  }

  throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
};

const handleUsers = async (req, res) => {
  const session = await requireAdmin(req);
  const { user } = session;

  if (req.method === 'GET') {
    sendJson(res, 200, {
      users: await listManagedUsers(),
      bootstrapAdminEmail: getBootstrapAdminEmail(),
    });
    return;
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    // #region debug-point C:users-post-request
    void reportInviteDebug('C', 'server/admin-api.js:handleUsers:POST', 'Admin users POST received', {
      email: normalizeEmail(body?.email),
      role: getAllowedManagedRole(body?.role),
      redirectTo: String(body?.redirectTo || '').trim(),
      actor: session?.user?.email || '',
    });
    // #endregion
    const payload = await createManagedUser(body);
    await appendAuditLog(
      createAuditEntry(session, 'user_created', 'user', payload.user.email, {
        role: payload.user.role,
        displayName: payload.user.displayName,
        ...getAuditRequestDetails(req),
      }, payload.user.id)
    );
    sendJson(res, 201, payload);
    return;
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const previousUser = await getManagedUserById(body.userId);
    const updatedUser = await updateManagedUser(body);
    await appendAuditLog(
      createAuditEntry(session, 'user_updated', 'user', updatedUser.email, {
        beforeRole: previousUser?.role || '',
        afterRole: updatedUser.role,
        beforeDisplayName: previousUser?.displayName || '',
        afterDisplayName: updatedUser.displayName,
        ...getAuditRequestDetails(req),
      }, updatedUser.id)
    );
    sendJson(res, 200, {
      user: updatedUser,
    });
    return;
  }

  if (req.method === 'DELETE') {
    const body = await readBody(req);
    const targetUser = await getManagedUserById(body.userId);
    await deleteManagedUser(body.userId, user.id);
    await appendAuditLog(
      createAuditEntry(session, 'user_deleted', 'user', targetUser?.email || body.userId, {
        role: targetUser?.role || '',
        displayName: targetUser?.displayName || '',
        ...getAuditRequestDetails(req),
      }, String(body.userId || '').trim())
    );
    sendNoContent(res);
    return;
  }

  throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
};

const handleUserPasswordResetLink = async (req, res) => {
  const session = await requireAdmin(req);

  if (req.method !== 'POST') {
    throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
  }

  const body = await readBody(req);
  const payload = await createManagedPasswordResetLink(body);
  await appendAuditLog(
    createAuditEntry(session, 'temporary_password_reset', 'user', payload.user.email, {
      ...getAuditRequestDetails(req),
    }, payload.user.id)
  );
  sendJson(res, 200, payload);
};

const handleManagedUserMfaReset = async (req, res) => {
  const session = await requireAdmin(req);

  if (req.method !== 'POST') {
    throw new HttpError(405, 'Methode non autorisee.', 'method_not_allowed');
  }

  const body = await readBody(req);
  const targetUser = await getManagedUserById(body.userId);
  const payload = await resetManagedUserMfa(body.userId, session.user.id);
  await appendAuditLog(
    createAuditEntry(session, 'mfa_reset_for_user', 'user', targetUser?.email || body.userId, {
      deletedCount: payload.deletedCount,
      ...getAuditRequestDetails(req),
    }, String(body.userId || '').trim())
  );
  sendJson(res, 200, payload);
};

const routeRequest = async (req, res) => {
  const pathname = parseUrl(req, '/api/admin').pathname;

  if (pathname === '/api/admin/session') {
    await handleSession(req, res);
    return;
  }

  if (pathname === '/api/admin/folders') {
    await handleFolders(req, res);
    return;
  }

  if (pathname === '/api/admin/assets') {
    await handleAssets(req, res);
    return;
  }

  if (pathname === '/api/admin/upload-signature') {
    await handleUploadSignature(req, res);
    return;
  }

  if (pathname === '/api/admin/assets/reorder') {
    await handleAssetReorder(req, res);
    return;
  }

  if (pathname === '/api/admin/assets/bulk') {
    await handleAssetBulkUpdate(req, res);
    return;
  }

  if (pathname === '/api/admin/youtube-videos') {
    await handleYoutubeVideos(req, res);
    return;
  }

  if (pathname === '/api/admin/users') {
    await handleUsers(req, res);
    return;
  }

  if (pathname === '/api/admin/users/password-reset-link') {
    await handleUserPasswordResetLink(req, res);
    return;
  }

  if (pathname === '/api/admin/users/mfa/reset') {
    await handleManagedUserMfaReset(req, res);
    return;
  }

  if (pathname === '/api/admin/logs') {
    await handleLogs(req, res);
    return;
  }

  if (pathname === '/api/admin/translate') {
    await handleTranslate(req, res);
    return;
  }

  if (pathname === '/api/admin/mfa/remember') {
    await handleMfaRemember(req, res);
    return;
  }

  if (pathname === '/api/admin/mfa/reset') {
    await resetCurrentUserMfa(req, res);
    return;
  }

  throw new HttpError(404, 'Route admin introuvable.', 'not_found');
};

export const handleAdminApi = async (req, res) => {
  try {
    await routeRequest(req, res);
  } catch (error) {
    // #region debug-point D:admin-api-error
    void reportFolderDebug('D', 'server/admin-api.js:handleAdminApi:catch', 'Admin API request failed', {
      name: error instanceof Error ? error.name : null,
      message: error instanceof Error ? error.message : String(error || ''),
      status: error?.status || null,
      code: error?.code || null,
      stackTop: error instanceof Error ? String(error.stack || '').split('\n').slice(0, 4).join(' | ') : null,
    });
    // #endregion
    if (error instanceof HttpError) {
      sendJson(res, error.status, {
        error: error.code,
        message: error.message,
      });
      return;
    }

    console.error('[admin-api]', error);
    const message =
      (error instanceof Error ? error.message : '') ||
      String(error?.error?.message || error?.message || '').trim() ||
      (typeof error === 'string' ? error : '') ||
      'Une erreur inattendue est survenue.';
    sendJson(res, 500, {
      error: 'admin_api_error',
      message,
    });
  }
};
