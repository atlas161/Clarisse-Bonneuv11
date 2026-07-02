import { v2 as cloudinary } from 'cloudinary';
import { listExternalMediaByRoot } from './external-media-store.js';
import { listTrackedSubfolders } from './admin-folder-store.js';
import { listAssetAssignmentsByRoot } from './admin-asset-order-store.js';
import { listAssetMetadataByRoot } from './admin-asset-metadata-store.js';

const getFallbackRoot = () => process.env.PORTFOLIO_CLOUDINARY_ROOT || 'samples/clarisse_bonneu';
const PORTFOLIO_CACHE_TTL_MS = 15 * 60 * 1000;
export const PORTFOLIO_CACHE_CONTROL = 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400';
const portfolioPayloadCache = new Map();

const demoItems = [
  {
    id: 'portfolio-01',
    folder: 'editorial',
    alt: {
      fr: 'Photographie de mode Clarisse Bonneu - Éditorial studio',
      en: 'Clarisse Bonneu fashion photography - Studio editorial',
    },
    width: 900,
    height: 1125,
  },
  {
    id: 'portfolio-02',
    folder: 'beaute',
    alt: {
      fr: 'Photographie beauté Clarisse Bonneu - Lumière douce',
      en: 'Clarisse Bonneu beauty photography - Soft light',
    },
    width: 900,
    height: 1125,
  },
  {
    id: 'portfolio-03',
    folder: 'digitals',
    alt: {
      fr: 'Digitals Clarisse Bonneu - Portrait naturel',
      en: 'Clarisse Bonneu digitals - Natural portrait',
    },
    width: 900,
    height: 1125,
  },
  {
    id: 'portfolio-04',
    folder: 'editorial',
    alt: {
      fr: 'Photographie éditoriale Clarisse Bonneu - Look couture',
      en: 'Clarisse Bonneu editorial photography - Couture look',
    },
    width: 900,
    height: 1125,
  },
  {
    id: 'portfolio-05',
    folder: 'commercial',
    alt: {
      fr: 'Photographie commerciale Clarisse Bonneu - Campagne lifestyle',
      en: 'Clarisse Bonneu commercial photography - Lifestyle campaign',
    },
    width: 900,
    height: 1125,
  },
  {
    id: 'portfolio-06',
    folder: 'beaute',
    alt: {
      fr: 'Photographie beauté Clarisse Bonneu - Portrait premium',
      en: 'Clarisse Bonneu beauty photography - Premium portrait',
    },
    width: 900,
    height: 1125,
  },
];

const slugify = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeLocale = (locale) => (locale === 'en' ? 'en' : 'fr');

const parseManualOrder = (value) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const getResourceOrder = (resource) =>
  parseManualOrder(resource?.context?.custom?.order) ??
  parseManualOrder(resource?.context?.custom?.position) ??
  parseManualOrder(resource?.context?.custom?.sort_order);

const sortByOrder = (left, right) => {
  const leftOrder = left.order ?? Number.POSITIVE_INFINITY;
  const rightOrder = right.order ?? Number.POSITIVE_INFINITY;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return 0;
};

const getCategoryOrderMap = async (root) => {
  const trackedFolders = await listTrackedSubfolders(root);
  const categoryOrder = new Map();

  trackedFolders.forEach((folderPath, index) => {
    const relativePath = folderPath.startsWith(`${root}/`) ? folderPath.slice(root.length + 1) : folderPath;
    const category = slugify(relativePath.split('/')[0] || 'autres');

    if (!categoryOrder.has(category)) {
      categoryOrder.set(category, index);
    }
  });

  return categoryOrder;
};

const getCategoryRank = (categoryOrderMap, category) =>
  categoryOrderMap instanceof Map && categoryOrderMap.has(category)
    ? categoryOrderMap.get(category)
    : Number.POSITIVE_INFINITY;

const sortFiltersByCategoryOrder = (filters, categoryOrderMap, locale) =>
  [...filters].sort((left, right) => {
    const leftRank = getCategoryRank(categoryOrderMap, left.id);
    const rightRank = getCategoryRank(categoryOrderMap, right.id);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return String(left.label || '').localeCompare(String(right.label || ''), locale, {
      sensitivity: 'base',
    });
  });

const sortItemsByCategoryOrder = (items, categoryOrderMap) =>
  [...items].sort((left, right) => {
    const leftRank = getCategoryRank(categoryOrderMap, left.category);
    const rightRank = getCategoryRank(categoryOrderMap, right.category);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const orderComparison = sortByOrder(left, right);

    if (orderComparison !== 0) {
      return orderComparison;
    }

    return String(left.id || '').localeCompare(String(right.id || ''), 'fr', {
      sensitivity: 'base',
    });
  });

const getTopLevelSegmentFromPath = (pathValue, root) => {
  const normalizedPath = String(pathValue || '').trim();

  if (!normalizedPath) {
    return '';
  }

  const relativePath = normalizedPath.startsWith(`${root}/`) ? normalizedPath.slice(root.length + 1) : normalizedPath;
  return relativePath.split('/').filter(Boolean)[0] || '';
};

const buildLegacyCategoryAliasMap = (resources, root, assignmentOverrides) => {
  if (!(assignmentOverrides instanceof Map) || assignmentOverrides.size === 0) {
    return new Map();
  }

  const aliasCandidates = new Map();

  (Array.isArray(resources) ? resources : []).forEach((resource) => {
    const normalizedPublicId = String(resource?.public_id || '').trim();
    const assignment = normalizedPublicId ? assignmentOverrides.get(normalizedPublicId) : null;
    const physicalCategory = slugify(getTopLevelSegmentFromPath(normalizedPublicId, root));
    const logicalCategory = slugify(getTopLevelSegmentFromPath(assignment?.folderPath, root));

    if (!physicalCategory || !logicalCategory || physicalCategory === logicalCategory) {
      return;
    }

    const existing = aliasCandidates.get(physicalCategory) || new Set();
    existing.add(logicalCategory);
    aliasCandidates.set(physicalCategory, existing);
  });

  const aliases = new Map();
  aliasCandidates.forEach((logicalCategories, physicalCategory) => {
    if (logicalCategories.size === 1) {
      aliases.set(physicalCategory, Array.from(logicalCategories)[0]);
    }
  });

  return aliases;
};

const labelOverrides = {
  fr: {
    editorial: 'Éditorial',
    editoriale: 'Éditoriale',
    editoriaux: 'Éditoriaux',
    beaute: 'Beauté',
    evenement: 'Événement',
    digitals: 'Digitals',
    commercial: 'Commercial',
    pola: 'Pola',
    polas: 'Polas',
    autres: 'Autres',
  },
  en: {
    editorial: 'Editorial',
    editoriale: 'Editorial',
    editoriaux: 'Editorials',
    beaute: 'Beauty',
    evenement: 'Event',
    digitals: 'Digitals',
    commercial: 'Commercial',
    pola: 'Polaroids',
    polas: 'Polaroids',
    autres: 'Other',
  },
};

const interfaceCopy = {
  fr: {
    all: 'Tout',
    defaultAltPrefix: 'Photographie de Clarisse Bonneu - ',
    mediaFilters: [
      { id: 'all', label: 'Tout' },
      { id: 'photo', label: 'Photos' },
      { id: 'video', label: 'Vidéos' },
      { id: 'other', label: 'Autres' },
    ],
    notice:
      'Configurez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET pour charger vos vrais dossiers Cloudinary.',
  },
  en: {
    all: 'All',
    defaultAltPrefix: 'Clarisse Bonneu photography - ',
    mediaFilters: [
      { id: 'all', label: 'All' },
      { id: 'photo', label: 'Photos' },
      { id: 'video', label: 'Videos' },
      { id: 'other', label: 'Other' },
    ],
    notice:
      'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to load your real Cloudinary folders.',
  },
};

const toLabel = (value, locale = 'fr') =>
  value
    .split(/[-_]/)
    .filter(Boolean)
    .map(
      (part) =>
        labelOverrides[normalizeLocale(locale)][part] || (part.charAt(0).toUpperCase() + part.slice(1))
    )
    .join(' ');

const createImageDeliveryUrl = (cloudName, publicId, width) =>
  `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,w_${width}/v1/${publicId}.jpg`;

const toImageResponsiveSources = (cloudName, publicId) =>
  [480, 720, 900, 1200]
    .map((width) => `${createImageDeliveryUrl(cloudName, publicId, width)} ${width}w`)
    .join(', ');

const createVideoDeliveryUrl = (cloudName, publicId, width) =>
  `https://res.cloudinary.com/${cloudName}/video/upload/q_auto,w_${width}/v1/${publicId}.mp4`;

const createVideoPosterUrl = (cloudName, publicId, width) =>
  `https://res.cloudinary.com/${cloudName}/video/upload/so_0,f_jpg,q_auto,w_${width}/v1/${publicId}.jpg`;

const toVideoPosterSources = (cloudName, publicId) =>
  [480, 720, 900, 1200]
    .map((width) => `${createVideoPosterUrl(cloudName, publicId, width)} ${width}w`)
    .join(', ');

const normalizeRoot = (rootInput) => {
  const fallbackRoot = String(getFallbackRoot() || '').replace(/^\/+|\/+$/g, '');
  const normalizedInput = String(rootInput || '').replace(/^\/+|\/+$/g, '');

  if (!normalizedInput) {
    return fallbackRoot;
  }

  if (!fallbackRoot) {
    return normalizedInput;
  }

  if (normalizedInput === fallbackRoot || normalizedInput.startsWith(`${fallbackRoot}/`)) {
    return normalizedInput;
  }

  return fallbackRoot;
};

const createYoutubePosterUrl = (youtubeId) => `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;

const createYoutubeEmbedUrl = (youtubeId, autoplay = false) => {
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });

  if (autoplay) {
    params.set('autoplay', '1');
  }

  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params.toString()}`;
};

const normalizeCacheVersion = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : '0';
};

const createPortfolioCacheKey = (root, locale, version) =>
  `${normalizeRoot(root)}::${normalizeLocale(locale)}::${normalizeCacheVersion(version)}`;

const clonePayload = (payload) => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(payload);
  }

  return JSON.parse(JSON.stringify(payload));
};

const readCachedPortfolioPayload = (root, locale, version) => {
  const cached = portfolioPayloadCache.get(createPortfolioCacheKey(root, locale, version));

  if (!cached) {
    return null;
  }

  return {
    payload: clonePayload(cached.payload),
    isFresh: cached.expiresAt > Date.now(),
  };
};

const prunePortfolioCache = () => {
  const now = Date.now();
  for (const [key, entry] of portfolioPayloadCache.entries()) {
    if (!entry || typeof entry !== 'object' || entry.expiresAt <= now) {
      portfolioPayloadCache.delete(key);
    }
  }

  const MAX_ENTRIES = 80;
  if (portfolioPayloadCache.size <= MAX_ENTRIES) {
    return;
  }

  const sorted = Array.from(portfolioPayloadCache.entries()).sort(([, left], [, right]) => {
    const leftExpiry = Number(left?.expiresAt || 0);
    const rightExpiry = Number(right?.expiresAt || 0);
    return leftExpiry - rightExpiry;
  });

  const toRemove = Math.max(0, sorted.length - MAX_ENTRIES);
  for (let index = 0; index < toRemove; index += 1) {
    portfolioPayloadCache.delete(sorted[index][0]);
  }
};

const writeCachedPortfolioPayload = (root, locale, version, payload) => {
  prunePortfolioCache();
  portfolioPayloadCache.set(createPortfolioCacheKey(root, locale, version), {
    payload: clonePayload(payload),
    expiresAt: Date.now() + PORTFOLIO_CACHE_TTL_MS,
  });
};

export const clearPortfolioPayloadCache = (rootInput) => {
  const root = rootInput ? normalizeRoot(rootInput) : '';

  if (!root) {
    portfolioPayloadCache.clear();
    return;
  }

  for (const key of portfolioPayloadCache.keys()) {
    if (key.startsWith(`${root}::fr::`) || key.startsWith(`${root}::en::`)) {
      portfolioPayloadCache.delete(key);
    }
  }
};

const isRateLimitError = (error) => {
  const message = error instanceof Error ? error.message : String(error || '');
  const httpCode = error?.http_code || error?.error?.http_code || null;

  return httpCode === 420 || /rate limit/i.test(message);
};

const mapResourceToItem = (
  resource,
  root,
  cloudName,
  locale = 'fr',
  assignmentOverrides = null,
  metadataOverrides = null,
  legacyCategoryAliases = null
) => {
  const normalizedLocale = normalizeLocale(locale);
  const normalizedPublicId = String(resource.public_id || '').trim();
  const assignment =
    assignmentOverrides instanceof Map && normalizedPublicId ? assignmentOverrides.get(normalizedPublicId) : null;
  const folderPath = String(assignment?.folderPath || '').trim();
  const folderRelativePath = folderPath.startsWith(`${root}/`) ? folderPath.slice(root.length + 1) : folderPath;
  const [folder] = folderRelativePath.split('/').filter(Boolean);
  const publicIdRelativePath = resource.public_id.startsWith(`${root}/`)
    ? resource.public_id.slice(root.length + 1)
    : resource.public_id;
  const [fallbackFolder] = publicIdRelativePath.split('/');
  const directCategory = slugify(folder || '');
  const fallbackCategory = slugify(fallbackFolder || '');
  const resolvedFallbackCategory =
    legacyCategoryAliases instanceof Map && fallbackCategory
      ? legacyCategoryAliases.get(fallbackCategory) || fallbackCategory
      : fallbackCategory;
  const category = directCategory || resolvedFallbackCategory || 'autres';
  const categoryLabel = toLabel(category, normalizedLocale);
  const overrideOrder = Number.isFinite(Number(assignment?.order)) ? Number(assignment.order) : null;
  const altFromContext = (() => {
    const override = metadataOverrides instanceof Map && normalizedPublicId ? metadataOverrides.get(normalizedPublicId) : null;
    if (override && normalizedLocale === 'en' && String(override.altEn || '').trim()) {
      return override.altEn;
    }
    if (override && normalizedLocale !== 'en' && String(override.alt || '').trim()) {
      return override.alt;
    }

    return normalizedLocale === 'en'
      ? resource.context?.custom?.alt_en || resource.context?.custom?.altEn
      : resource.context?.custom?.alt;
  })();
  const isVideoResource = resource.resource_type === 'video';
  const tags = (() => {
    const override = metadataOverrides instanceof Map && normalizedPublicId ? metadataOverrides.get(normalizedPublicId) : null;
    if (override && Array.isArray(override.tags) && override.tags.length > 0) {
      return override.tags.map((tag) => String(tag).toLowerCase());
    }
    return Array.isArray(resource.tags) ? resource.tags.map((tag) => String(tag).toLowerCase()) : [];
  })();
  const mediaType = isVideoResource ? 'video' : tags.includes('other') || tags.includes('autre') || tags.includes('autres') ? 'other' : 'photo';

  if (isVideoResource) {
    return {
      id: resource.asset_id || resource.public_id,
      category,
      categoryLabel,
      mediaType,
      order: Number.isFinite(Number(overrideOrder)) ? Number(overrideOrder) : getResourceOrder(resource),
      alt: altFromContext || `${interfaceCopy[normalizedLocale].defaultAltPrefix}${categoryLabel}`,
      width: resource.width || 900,
      height: resource.height || 1125,
      src: createVideoPosterUrl(cloudName, resource.public_id, 900),
      srcset: toVideoPosterSources(cloudName, resource.public_id),
      posterSrc: createVideoPosterUrl(cloudName, resource.public_id, 900),
      posterSrcset: toVideoPosterSources(cloudName, resource.public_id),
      lightboxSrc: createVideoDeliveryUrl(cloudName, resource.public_id, 1400),
      fullSrc: createVideoDeliveryUrl(cloudName, resource.public_id, 2000),
    };
  }

  return {
    id: resource.asset_id || resource.public_id,
    category,
    categoryLabel,
    mediaType,
    order: Number.isFinite(Number(overrideOrder)) ? Number(overrideOrder) : getResourceOrder(resource),
    alt: altFromContext || `${interfaceCopy[normalizedLocale].defaultAltPrefix}${categoryLabel}`,
    width: resource.width || 900,
    height: resource.height || 1125,
    src: createImageDeliveryUrl(cloudName, resource.public_id, 900),
    srcset: toImageResponsiveSources(cloudName, resource.public_id),
    lightboxSrc: createImageDeliveryUrl(cloudName, resource.public_id, 1400),
    fullSrc: createImageDeliveryUrl(cloudName, resource.public_id, 2000),
  };
};

const mapExternalVideoToItem = (item, root, locale = 'fr') => {
  const relativePath = item.folder.startsWith(`${root}/`) ? item.folder.slice(root.length + 1) : item.folder;
  const [folder] = relativePath.split('/');
  const category = slugify(folder || 'autres');
  const normalizedLocale = normalizeLocale(locale);
  const categoryLabel = toLabel(category, normalizedLocale);
  const alt = normalizedLocale === 'en' ? item.altEn || item.alt : item.alt || item.altEn;
  const displayTitle = item.title || alt || `YouTube ${item.youtubeId}`;

  return {
    id: item.id,
    category,
    categoryLabel,
    mediaType: 'video',
    order: item.order,
    alt: alt || `${interfaceCopy[normalizedLocale].defaultAltPrefix}${categoryLabel}`,
    displayTitle,
    width: 1280,
    height: 720,
    src: createYoutubePosterUrl(item.youtubeId),
    srcset: '',
    posterSrc: createYoutubePosterUrl(item.youtubeId),
    posterSrcset: '',
    lightboxKind: 'youtube',
    lightboxSrc: item.url,
    embedSrc: createYoutubeEmbedUrl(item.youtubeId, true),
    fullSrc: item.url,
  };
};

const buildFallbackPayload = async (root, locale = 'fr') => {
  const normalizedLocale = normalizeLocale(locale);
  const categoryOrderMap = await getCategoryOrderMap(root);
  const items = sortItemsByCategoryOrder(
    demoItems.map((item) => ({
      id: item.id,
      category: slugify(item.folder),
      categoryLabel: toLabel(item.folder, normalizedLocale),
      mediaType: 'photo',
      order: null,
      alt: item.alt[normalizedLocale],
      width: item.width,
      height: item.height,
      src: createImageDeliveryUrl('demo', `${root}/${item.folder}/${item.id}`, 900),
      srcset: toImageResponsiveSources('demo', `${root}/${item.folder}/${item.id}`),
      lightboxSrc: createImageDeliveryUrl('demo', `${root}/${item.folder}/${item.id}`, 1400),
      fullSrc: createImageDeliveryUrl('demo', `${root}/${item.folder}/${item.id}`, 2000),
    })),
    categoryOrderMap
  );
  const categoryFilters = sortFiltersByCategoryOrder(
    Array.from(new Map(items.map((item) => [item.category, item.categoryLabel])).entries()).map(([id, label]) => ({
      id,
      label,
    })),
    categoryOrderMap,
    normalizedLocale
  );

  return {
    source: 'demo',
    root,
    typeFilters: interfaceCopy[normalizedLocale].mediaFilters,
    filters: [
      { id: 'tout', label: interfaceCopy[normalizedLocale].all },
      ...categoryFilters,
    ],
    items,
    notice: interfaceCopy[normalizedLocale].notice,
  };
};

const fetchAllResources = async (prefix, resourceType) => {
  const resources = [];
  let nextCursor;

  do {
    const response = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix,
      max_results: 500,
      next_cursor: nextCursor,
      context: true,
      tags: true,
    });

    resources.push(...(response.resources || []));
    nextCursor = response.next_cursor;
  } while (nextCursor);

  return resources;
};

export const getPortfolioPayload = async (rootInput, localeInput, versionInput) => {
  const root = normalizeRoot(rootInput);
  const locale = normalizeLocale(localeInput);
  const version = normalizeCacheVersion(versionInput);
  const cachedPayload = readCachedPortfolioPayload(root, locale, version);
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return buildFallbackPayload(root, locale);
  }

  if (cachedPayload?.isFresh) {
    return cachedPayload.payload;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  try {
    const [imageResources, videoResources, categoryOrderMap, assetAssignmentMap, assetMetadataMap] = await Promise.all([
      fetchAllResources(`${root}/`, 'image'),
      fetchAllResources(`${root}/`, 'video'),
      getCategoryOrderMap(root),
      listAssetAssignmentsByRoot(root).catch(() => new Map()),
      listAssetMetadataByRoot(root).catch(() => new Map()),
    ]);
    const resources = [...imageResources, ...videoResources];
    const externalItems = await listExternalMediaByRoot(root);
    const legacyCategoryAliases = buildLegacyCategoryAliasMap(resources, root, assetAssignmentMap);
    const items = sortItemsByCategoryOrder(
      resources
        .filter((resource) => resource.public_id !== root)
        .map((resource) =>
          mapResourceToItem(
            resource,
            root,
            cloudName,
            locale,
            assetAssignmentMap,
            assetMetadataMap,
            legacyCategoryAliases
          )
        )
        .filter((item) => item.category)
        .concat(externalItems.map((item) => mapExternalVideoToItem(item, root, locale))),
      categoryOrderMap
    );

    const filters = [
      { id: 'tout', label: interfaceCopy[locale].all },
      ...sortFiltersByCategoryOrder(
        Array.from(new Map(items.map((item) => [item.category, item.categoryLabel])).entries()).map(([id, label]) => ({
          id,
          label,
        })),
        categoryOrderMap,
        locale
      ),
    ];

    const payload = {
      source: 'cloudinary',
      root,
      typeFilters: interfaceCopy[locale].mediaFilters,
      filters,
      items,
    };

    writeCachedPortfolioPayload(root, locale, version, payload);
    return clonePayload(payload);
  } catch (error) {
    if (cachedPayload?.payload && isRateLimitError(error)) {
      return cachedPayload.payload;
    }

    throw error;
  }
};
