import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const STORE_PATH = path.join(process.cwd(), 'server', 'admin-folder-store.json');
const SUPABASE_FOLDER_TABLE = String(process.env.SUPABASE_FOLDER_TABLE || 'admin_tracked_folders').trim();
let warnedReadOnlyStore = false;
let supabaseFolderClient = null;
let supabaseFolderClientResolved = false;

const isReadOnlyStoreError = (error) =>
  Boolean(error) &&
  typeof error === 'object' &&
  'code' in error &&
  (error.code === 'EROFS' || error.code === 'EPERM' || error.code === 'EACCES');

const warnReadOnlyStore = () => {
  if (warnedReadOnlyStore) {
    return;
  }

  warnedReadOnlyStore = true;
  console.warn('[admin-folder-store] Local folder fallback store is read-only; using in-memory/Cloudinary data only.');
};

const normalizePath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();

const getRootFolder = () => normalizePath(process.env.PORTFOLIO_CLOUDINARY_ROOT || 'samples/clarisse_bonneu');

const parseManualOrder = (value) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const uniqueFolderPaths = (entries) => {
  const unique = new Map();

  (entries || [])
    .map((entry) => normalizePath(entry))
    .filter(Boolean)
    .forEach((entry) => {
      unique.set(entry.toLowerCase(), entry);
    });

  return Array.from(unique.values());
};

const getSupabaseFolderClient = () => {
  if (supabaseFolderClientResolved) {
    return supabaseFolderClient;
  }

  supabaseFolderClientResolved = true;

  const url = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !serviceRoleKey) {
    supabaseFolderClient = null;
    return supabaseFolderClient;
  }

  supabaseFolderClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseFolderClient;
};

const getDefaultFolders = () => {
  const rootFolder = getRootFolder();
  const configuredDefaults = String(process.env.ADMIN_DEFAULT_FOLDERS || 'Pola')
    .split(',')
    .map((entry) => normalizePath(entry))
    .filter(Boolean);

  return configuredDefaults.map((folderName) => {
    if (folderName.startsWith(`${rootFolder}/`) || folderName === rootFolder) {
      return folderName;
    }

    return normalizePath(`${rootFolder}/${folderName}`);
  });
};

const sortFolderRows = (rows) =>
  [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftOrder = parseManualOrder(left?.sort_order);
    const rightOrder = parseManualOrder(right?.sort_order);

    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    if (leftOrder !== null) {
      return -1;
    }

    if (rightOrder !== null) {
      return 1;
    }

    const leftDate = new Date(left?.created_at || 0).getTime();
    const rightDate = new Date(right?.created_at || 0).getTime();

    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }

    return String(left?.path || '').localeCompare(String(right?.path || ''), 'fr', {
      sensitivity: 'base',
    });
  });

const readStore = async () => {
  const supabase = getSupabaseFolderClient();

  if (supabase) {
    const { data, error } = await supabase.from(SUPABASE_FOLDER_TABLE).select('path, sort_order, created_at');

    if (error) {
      throw error;
    }

    const storedPaths = uniqueFolderPaths(sortFolderRows(data).map((row) => normalizePath(row?.path)));

    return {
      folders: storedPaths.length > 0 ? storedPaths : getDefaultFolders(),
    };
  }

  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const storedPaths = uniqueFolderPaths(Array.isArray(parsed.folders) ? parsed.folders : []);
    return {
      folders: storedPaths.length > 0 ? storedPaths : getDefaultFolders(),
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { folders: getDefaultFolders() };
    }

    if (error instanceof SyntaxError) {
      return { folders: getDefaultFolders() };
    }

    throw error;
  }
};

const writeStore = async (payload) => {
  const nextPayload = {
    folders: uniqueFolderPaths(payload.folders || []),
  };

  const supabase = getSupabaseFolderClient();

  if (supabase) {
    const rows = nextPayload.folders.map((folderPath, index) => ({
      path: folderPath,
      parent_path: getParentPath(folderPath),
      sort_order: index,
    }));
    const { data: existingRows, error: existingError } = await supabase.from(SUPABASE_FOLDER_TABLE).select('path');

    if (existingError) {
      throw existingError;
    }

    if (rows.length > 0) {
      const { error: upsertError } = await supabase.from(SUPABASE_FOLDER_TABLE).upsert(rows, {
        onConflict: 'path',
      });

      if (upsertError) {
        throw upsertError;
      }
    }

    const nextPathSet = new Set(rows.map((row) => row.path));
    const pathsToDelete = (existingRows || [])
      .map((row) => normalizePath(row?.path))
      .filter((folderPath) => folderPath && !nextPathSet.has(folderPath));

    if (pathsToDelete.length > 0) {
      const { error: deleteError } = await supabase.from(SUPABASE_FOLDER_TABLE).delete().in('path', pathsToDelete);

      if (deleteError) {
        throw deleteError;
      }
    }

    return true;
  }

  try {
    await fs.writeFile(STORE_PATH, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf8');
    return true;
  } catch (error) {
    if (isReadOnlyStoreError(error)) {
      warnReadOnlyStore();
      return false;
    }

    throw error;
  }
};

const getParentPath = (folderPath) => {
  const normalized = normalizePath(folderPath);
  const lastSlashIndex = normalized.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return '';
  }

  return normalized.slice(0, lastSlashIndex);
};

export const trackFolder = async (folderPath) => {
  const normalizedFolder = normalizePath(folderPath);

  if (!normalizedFolder) {
    return;
  }

  const store = await readStore();
  if (!store.folders.includes(normalizedFolder)) {
    store.folders.push(normalizedFolder);
    await writeStore(store);
  }
};

export const untrackFolder = async (folderPath) => {
  const normalizedFolder = normalizePath(folderPath);
  const store = await readStore();
  store.folders = store.folders.filter(
    (entry) => entry !== normalizedFolder && !entry.startsWith(`${normalizedFolder}/`)
  );
  await writeStore(store);
};

export const renameTrackedFolder = async (fromFolder, toFolder) => {
  const normalizedFrom = normalizePath(fromFolder);
  const normalizedTo = normalizePath(toFolder);

  if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo) {
    return;
  }

  const store = await readStore();
  let hasChanges = false;

  store.folders = store.folders.map((entry) => {
    if (entry === normalizedFrom) {
      hasChanges = true;
      return normalizedTo;
    }

    if (entry.startsWith(`${normalizedFrom}/`)) {
      hasChanges = true;
      return `${normalizedTo}${entry.slice(normalizedFrom.length)}`;
    }

    return entry;
  });

  if (hasChanges) {
    await writeStore(store);
  }
};

export const listTrackedSubfolders = async (parentFolder) => {
  const normalizedParent = normalizePath(parentFolder);
  const store = await readStore();

  return store.folders.filter((entry) => getParentPath(entry) === normalizedParent);
};

export const reorderTrackedSubfolders = async (parentFolder, orderedFolderPaths) => {
  const normalizedParent = normalizePath(parentFolder);
  const normalizedOrderedPaths = uniqueFolderPaths(orderedFolderPaths || []).filter(
    (entry) => getParentPath(entry) === normalizedParent
  );

  if (!normalizedParent || normalizedOrderedPaths.length === 0) {
    return;
  }

  const store = await readStore();
  const siblingFolders = store.folders.filter((entry) => getParentPath(entry) === normalizedParent);

  if (siblingFolders.length === 0) {
    return;
  }

  const nextSiblingOrder = [
    ...normalizedOrderedPaths.filter((entry) => siblingFolders.includes(entry)),
    ...siblingFolders.filter((entry) => !normalizedOrderedPaths.includes(entry)),
  ];

  let siblingIndex = 0;
  store.folders = store.folders.map((entry) => {
    if (getParentPath(entry) !== normalizedParent) {
      return entry;
    }

    const nextEntry = nextSiblingOrder[siblingIndex];
    siblingIndex += 1;
    return nextEntry || entry;
  });

  await writeStore(store);
};
