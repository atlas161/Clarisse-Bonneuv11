import { createClient } from '@supabase/supabase-js';

const SUPABASE_ASSET_METADATA_TABLE = String(process.env.SUPABASE_ASSET_METADATA_TABLE || 'admin_asset_metadata').trim();
let supabaseClient = null;
let supabaseClientResolved = false;

const normalizePath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();

const normalizeTags = (tags) =>
  Array.isArray(tags)
    ? tags
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter(Boolean)
    : [];

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

export const listAssetMetadataByFolder = async (folderPath) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return new Map();
  }

  const normalizedFolder = normalizePath(folderPath);

  if (!normalizedFolder) {
    return new Map();
  }

  const { data, error } = await supabase
    .from(SUPABASE_ASSET_METADATA_TABLE)
    .select('public_id, alt, alt_en, tags')
    .eq('folder_path', normalizedFolder);

  if (error) {
    throw error;
  }

  const map = new Map();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const publicId = normalizePath(row?.public_id);
    if (!publicId) {
      return;
    }
    map.set(publicId, {
      alt: row?.alt ?? null,
      altEn: row?.alt_en ?? null,
      tags: normalizeTags(row?.tags),
    });
  });

  return map;
};

export const listAssetMetadataByRoot = async (rootPath) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return new Map();
  }

  const normalizedRoot = normalizePath(rootPath);

  if (!normalizedRoot) {
    return new Map();
  }

  const { data, error } = await supabase
    .from(SUPABASE_ASSET_METADATA_TABLE)
    .select('public_id, alt, alt_en, tags')
    .like('folder_path', `${normalizedRoot}/%`);

  if (error) {
    throw error;
  }

  const map = new Map();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const publicId = normalizePath(row?.public_id);
    if (!publicId) {
      return;
    }
    map.set(publicId, {
      alt: row?.alt ?? null,
      altEn: row?.alt_en ?? null,
      tags: normalizeTags(row?.tags),
    });
  });

  return map;
};

export const getAssetMetadata = async (folderPath, publicId) => {
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
    .from(SUPABASE_ASSET_METADATA_TABLE)
    .select('alt, alt_en, tags')
    .eq('folder_path', normalizedFolder)
    .eq('public_id', normalizedPublicId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    alt: data.alt ?? null,
    altEn: data.alt_en ?? null,
    tags: normalizeTags(data.tags),
  };
};

export const upsertAssetMetadata = async (folderPath, publicId, updates = {}) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabase is not configured for asset metadata storage.');
  }

  const normalizedFolder = normalizePath(folderPath);
  const normalizedPublicId = normalizePath(publicId);

  if (!normalizedFolder || !normalizedPublicId) {
    throw new Error('Asset metadata target is invalid.');
  }

  const alt = String(updates.alt ?? '').trim();
  const altEn = String(updates.altEn ?? '').trim();
  const tags = normalizeTags(updates.tags);

  const { error } = await supabase.from(SUPABASE_ASSET_METADATA_TABLE).upsert(
    [
      {
        folder_path: normalizedFolder,
        public_id: normalizedPublicId,
        alt: alt ? alt : null,
        alt_en: altEn ? altEn : null,
        tags,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: 'folder_path,public_id' }
  );

  if (error) {
    throw error;
  }
};

export const upsertAssetMetadataBulk = async (entries) => {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('Supabase is not configured for asset metadata storage.');
  }

  const rows = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const normalizedFolder = normalizePath(entry?.folderPath || entry?.folder_path || '');
      const normalizedPublicId = normalizePath(entry?.publicId || entry?.public_id || '');
      if (!normalizedFolder || !normalizedPublicId) {
        return null;
      }

      const alt = String(entry?.alt ?? '').trim();
      const altEn = String(entry?.altEn ?? entry?.alt_en ?? '').trim();
      const tags = normalizeTags(entry?.tags);

      return {
        folder_path: normalizedFolder,
        public_id: normalizedPublicId,
        alt: alt ? alt : null,
        alt_en: altEn ? altEn : null,
        tags,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    throw new Error('Bulk asset metadata update is empty.');
  }

  const { error } = await supabase.from(SUPABASE_ASSET_METADATA_TABLE).upsert(rows, {
    onConflict: 'folder_path,public_id',
  });

  if (error) {
    throw error;
  }
};

export const deleteAssetMetadata = async (folderPath, publicId) => {
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
    .from(SUPABASE_ASSET_METADATA_TABLE)
    .delete()
    .eq('folder_path', normalizedFolder)
    .eq('public_id', normalizedPublicId);

  if (error) {
    throw error;
  }
};

export const renameAssetMetadataFolderPrefix = async (fromFolder, toFolder) => {
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
    supabase.from(SUPABASE_ASSET_METADATA_TABLE).select('folder_path, public_id, alt, alt_en, tags').eq('folder_path', normalizedFrom),
    supabase.from(SUPABASE_ASSET_METADATA_TABLE).select('folder_path, public_id, alt, alt_en, tags').like('folder_path', `${normalizedFrom}/%`),
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

      if (!folderPath || !publicId) {
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
        alt: row?.alt ?? null,
        alt_en: row?.alt_en ?? null,
        tags: normalizeTags(row?.tags),
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (nextRows.length > 0) {
    const { error: upsertError } = await supabase.from(SUPABASE_ASSET_METADATA_TABLE).upsert(nextRows, {
      onConflict: 'folder_path,public_id',
    });

    if (upsertError) {
      throw upsertError;
    }
  }

  const [{ error: deleteBaseError }, { error: deleteNestedError }] = await Promise.all([
    supabase.from(SUPABASE_ASSET_METADATA_TABLE).delete().eq('folder_path', normalizedFrom),
    supabase.from(SUPABASE_ASSET_METADATA_TABLE).delete().like('folder_path', `${normalizedFrom}/%`),
  ]);

  if (deleteBaseError) {
    throw deleteBaseError;
  }

  if (deleteNestedError) {
    throw deleteNestedError;
  }
};
