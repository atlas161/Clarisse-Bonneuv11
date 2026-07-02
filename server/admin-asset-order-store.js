import { createClient } from '@supabase/supabase-js';

const SUPABASE_ASSET_ORDER_TABLE = String(process.env.SUPABASE_ASSET_ORDER_TABLE || 'admin_asset_orders').trim();
let supabaseClient = null;
let supabaseClientResolved = false;

const normalizePath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();

const getSupabaseClient = () => {
  if (supabaseClientResolved) {
    return supabaseClient;
  }

  supabaseClientResolved = true;

  const url = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !serviceRoleKey) {
    supabaseClient = null;
    return supabaseClient;
  }

  supabaseClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
};

export const listAssetOrdersByFolder = async (folderPath) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return new Map();
  }

  const normalizedFolder = normalizePath(folderPath);

  if (!normalizedFolder) {
    return new Map();
  }

  const { data, error } = await supabase
    .from(SUPABASE_ASSET_ORDER_TABLE)
    .select('public_id, sort_order')
    .eq('folder_path', normalizedFolder);

  if (error) {
    throw error;
  }

  const map = new Map();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const publicId = normalizePath(row?.public_id);
    const order = Number(row?.sort_order);
    if (!publicId || !Number.isFinite(order)) {
      return;
    }
    map.set(publicId, order);
  });

  return map;
};

export const listAssetOrderEntriesByFolder = async (folderPath) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return [];
  }

  const normalizedFolder = normalizePath(folderPath);

  if (!normalizedFolder) {
    return [];
  }

  const { data, error } = await supabase
    .from(SUPABASE_ASSET_ORDER_TABLE)
    .select('public_id, sort_order')
    .eq('folder_path', normalizedFolder)
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      publicId: normalizePath(row?.public_id),
      sortOrder: Number(row?.sort_order),
    }))
    .filter((row) => row.publicId && Number.isFinite(row.sortOrder));
};

export const listAssetOrdersByRoot = async (rootPath) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return new Map();
  }

  const normalizedRoot = normalizePath(rootPath);

  if (!normalizedRoot) {
    return new Map();
  }

  const { data, error } = await supabase
    .from(SUPABASE_ASSET_ORDER_TABLE)
    .select('public_id, sort_order')
    .like('folder_path', `${normalizedRoot}/%`);

  if (error) {
    throw error;
  }

  const map = new Map();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const publicId = normalizePath(row?.public_id);
    const order = Number(row?.sort_order);
    if (!publicId || !Number.isFinite(order)) {
      return;
    }
    map.set(publicId, order);
  });

  return map;
};

export const listAssetAssignmentsByRoot = async (rootPath) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return new Map();
  }

  const normalizedRoot = normalizePath(rootPath);

  if (!normalizedRoot) {
    return new Map();
  }

  const { data, error } = await supabase
    .from(SUPABASE_ASSET_ORDER_TABLE)
    .select('folder_path, public_id, sort_order')
    .like('folder_path', `${normalizedRoot}/%`);

  if (error) {
    throw error;
  }

  const map = new Map();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const publicId = normalizePath(row?.public_id);
    const folderPath = normalizePath(row?.folder_path);
    const order = Number(row?.sort_order);
    if (!publicId || !folderPath || !Number.isFinite(order)) {
      return;
    }
    map.set(publicId, { folderPath, order });
  });

  return map;
};

export const saveAssetOrderForFolder = async (folderPath, orderedItems) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabase is not configured for asset order storage.');
  }

  const normalizedFolder = normalizePath(folderPath);
  const normalizedItems = Array.isArray(orderedItems)
    ? orderedItems
        .map((entry, index) => {
          if (typeof entry === 'string') {
            return { publicId: normalizePath(entry), sortOrder: index };
          }

          const publicId = normalizePath(entry?.publicId || entry?.public_id || '');
          const sortOrderRaw = entry?.order ?? entry?.sortOrder ?? entry?.sort_order ?? index;
          const sortOrder = Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : index;
          return { publicId, sortOrder };
        })
        .filter((entry) => entry.publicId)
    : [];

  if (!normalizedFolder) {
    throw new Error('Folder path is required.');
  }

  if (normalizedItems.length === 0) {
    throw new Error('Ordered items list is empty.');
  }

  const rows = normalizedItems.map((entry) => ({
    folder_path: normalizedFolder,
    public_id: entry.publicId,
    sort_order: entry.sortOrder,
    updated_at: new Date().toISOString(),
  }));

  const { data: existingRows, error: existingError } = await supabase
    .from(SUPABASE_ASSET_ORDER_TABLE)
    .select('public_id')
    .eq('folder_path', normalizedFolder);

  if (existingError) {
    throw existingError;
  }

  const { error: upsertError } = await supabase.from(SUPABASE_ASSET_ORDER_TABLE).upsert(rows, {
    onConflict: 'folder_path,public_id',
  });

  if (upsertError) {
    throw upsertError;
  }

  const nextPublicIdSet = new Set(rows.map((row) => row.public_id));
  const publicIdsToDelete = (existingRows || [])
    .map((row) => normalizePath(row?.public_id))
    .filter((publicId) => publicId && !nextPublicIdSet.has(publicId));

  if (publicIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from(SUPABASE_ASSET_ORDER_TABLE)
      .delete()
      .eq('folder_path', normalizedFolder)
      .in('public_id', publicIdsToDelete);

    if (deleteError) {
      throw deleteError;
    }
  }
};

export const getAssetOrder = async (folderPath, publicId) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const normalizedFolder = normalizePath(folderPath);
  const normalizedPublicId = normalizePath(publicId);

  if (!normalizedFolder || !normalizedPublicId) {
    return null;
  }

  const { data, error } = await supabase
    .from(SUPABASE_ASSET_ORDER_TABLE)
    .select('sort_order')
    .eq('folder_path', normalizedFolder)
    .eq('public_id', normalizedPublicId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const order = Number(data?.sort_order);
  return Number.isFinite(order) ? order : null;
};

export const renameAssetOrderFolderPrefix = async (fromFolder, toFolder) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return;
  }

  const normalizedFrom = normalizePath(fromFolder);
  const normalizedTo = normalizePath(toFolder);

  if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo) {
    return;
  }

  const [baseResponse, nestedResponse] = await Promise.all([
    supabase.from(SUPABASE_ASSET_ORDER_TABLE).select('folder_path, public_id, sort_order').eq('folder_path', normalizedFrom),
    supabase.from(SUPABASE_ASSET_ORDER_TABLE).select('folder_path, public_id, sort_order').like('folder_path', `${normalizedFrom}/%`),
  ]);

  if (baseResponse.error) {
    throw baseResponse.error;
  }

  if (nestedResponse.error) {
    throw nestedResponse.error;
  }

  const rows = [...(Array.isArray(baseResponse.data) ? baseResponse.data : []), ...(Array.isArray(nestedResponse.data) ? nestedResponse.data : [])];

  if (rows.length === 0) {
    return;
  }

  const nextRows = rows
    .map((row) => {
      const folderPath = normalizePath(row?.folder_path);
      const publicId = normalizePath(row?.public_id);
      const sortOrder = Number(row?.sort_order);

      if (!folderPath || !publicId || !Number.isFinite(sortOrder)) {
        return null;
      }

      const nextFolderPath =
        folderPath === normalizedFrom
          ? normalizedTo
          : folderPath.startsWith(`${normalizedFrom}/`)
            ? `${normalizedTo}${folderPath.slice(normalizedFrom.length)}`
            : folderPath;

      if (!nextFolderPath) {
        return null;
      }

      return {
        folder_path: nextFolderPath,
        public_id: publicId,
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (nextRows.length > 0) {
    const { error: upsertError } = await supabase.from(SUPABASE_ASSET_ORDER_TABLE).upsert(nextRows, {
      onConflict: 'folder_path,public_id',
    });

    if (upsertError) {
      throw upsertError;
    }
  }

  const [{ error: deleteBaseError }, { error: deleteNestedError }] = await Promise.all([
    supabase.from(SUPABASE_ASSET_ORDER_TABLE).delete().eq('folder_path', normalizedFrom),
    supabase.from(SUPABASE_ASSET_ORDER_TABLE).delete().like('folder_path', `${normalizedFrom}/%`),
  ]);

  if (deleteBaseError) {
    throw deleteBaseError;
  }

  if (deleteNestedError) {
    throw deleteNestedError;
  }
};

export const deleteAssetOrder = async (folderPath, publicId) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return;
  }

  const normalizedFolder = normalizePath(folderPath);
  const normalizedPublicId = normalizePath(publicId);

  if (!normalizedFolder || !normalizedPublicId) {
    return;
  }

  const { error } = await supabase
    .from(SUPABASE_ASSET_ORDER_TABLE)
    .delete()
    .eq('folder_path', normalizedFolder)
    .eq('public_id', normalizedPublicId);

  if (error) {
    throw error;
  }
};
