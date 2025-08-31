// src/storage/customCategories.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, Image } from 'react-native';
import ICONS from '../icons';   // built-in icons (array of {key,label,source})
import { logEvent } from '../utils/analyticsSafe'; // ✅ safe (no-op if unavailable)
import { MEDIA_DIR, ensureMediaDir } from '../utils/media';

const KEY   = '@useby_custom_categories_v1';
const EVENT = 'useby/categories_changed';

// tiny helper so analytics never crash the app
const safeLog = (name, params = {}) => { try { logEvent(name, params); } catch {} };

const norm = (s='') => s.toString().trim().toLowerCase();
const sanitize = (s='') => s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');

// Build the persisted file URI for a built-in key (copied at boot by persistBuiltinIconsOnce)
const builtinFileUriForKey = (key='') => `file://${MEDIA_DIR}/builtin_${sanitize(key)}.png`;

/* Normalize category array into a clean, renderable list */
function normalizeArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c) => ({
      id: c?.id || `cat_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: (c?.name || '').trim(),
      iconUri: c?.iconUri || '',
      // if a builtin record was saved earlier, keep its builtinKey
      builtinKey: c?.builtinKey || undefined,
    }))
    .filter((c) => c.name);
}

/* Seed defaults from src/icons on first ever load (when storage is empty) */
async function seedDefaultsIfNeeded() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return; // already have categories

    // Ensure the persistent media dir exists (files are copied by persistBuiltinIconsOnce at app boot)
    await ensureMediaDir();

    const defaults = (ICONS || []).map((it) => {
      // Prefer persisted file:// URI for robustness in Release
      const persistedUri = builtinFileUriForKey(it.key);
      // Keep a runtime-resolved bundle uri as a fallback (not used if file:// present)
      const bundleSrc = Image.resolveAssetSource(it.source);
      return {
        id: `cat_${it.key}`,
        name: it.label,
        iconUri: persistedUri || bundleSrc?.uri || '',
        builtinKey: it.key, // mark as builtin for renderer convenience
      };
    });

    await AsyncStorage.setItem(KEY, JSON.stringify(defaults));
    DeviceEventEmitter.emit(EVENT, defaults);

    safeLog('categories_seed_defaults', { count: defaults.length });
  } catch (e) {
    console.warn('seedDefaultsIfNeeded failed:', e?.message || e);
    safeLog('categories_seed_error', { message: String(e?.message || e) });
  }
}

/* ---- Public API ---- */

export async function loadCategories() {
  await seedDefaultsIfNeeded();
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      safeLog('categories_load', { count: 0, empty: 1 });
      return [];
    }
    const parsed = JSON.parse(raw);
    const normed = normalizeArray(parsed);
    safeLog('categories_load', { count: normed.length, empty: 0 });
    return normed;
  } catch (e) {
    safeLog('categories_load_error', { message: String(e?.message || e) });
    return [];
  }
}

export async function saveCategories(list) {
  const normed = normalizeArray(list);
  await AsyncStorage.setItem(KEY, JSON.stringify(normed));
  DeviceEventEmitter.emit(EVENT, normed);
  safeLog('categories_save', { count: normed.length });
  return normed;
}

export function subscribeCategories(cb) {
  safeLog('categories_subscribe', {});
  const sub = DeviceEventEmitter.addListener(EVENT, cb);
  return () => {
    try { sub.remove(); } catch {}
    safeLog('categories_unsubscribe', {});
  };
}

/** Add a category. Enforces unique name (case-insensitive). Throws on duplicate. */
export async function addCategory({ name, iconUri = '' }) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    safeLog('category_add_error', { reason: 'no_name' });
    throw new Error('Name required');
  }

  const list = await loadCategories();
  const exists = list.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) {
    safeLog('category_add_error', { reason: 'duplicate_name', name: trimmed });
    throw new Error('Category name already exists');
  }

  const rec = {
    id: `cat_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: trimmed,
    iconUri,
  };
  const next = await saveCategories([...list, rec]);
  safeLog('category_add', { name_len: trimmed.length, has_icon: iconUri ? 1 : 0, total_after: next.length });
  return next;
}

/** Remove a category by id (no-op if not found). Returns new list. */
export async function removeCategory(id) {
  const list = await loadCategories();
  const toRemove = list.find((c) => String(c.id) === String(id));
  const next = list.filter((c) => String(c.id) !== String(id));
  const saved = await saveCategories(next);
  safeLog('category_remove', { id: String(id), name: toRemove?.name || null, total_after: saved.length });
  return saved;
}

/** Reorder the list by an array of ids (unknown ids are ignored). Returns new list. */
export async function reorderCategories(idOrder = []) {
  const list = await loadCategories();
  const byId = new Map(list.map((c) => [String(c.id), c]));

  const ordered = [];
  for (const id of idOrder) {
    const rec = byId.get(String(id));
    if (rec) ordered.push(rec);
  }
  // append any items that were not present in idOrder (safety)
  for (const rec of list) {
    if (!ordered.find((x) => x.id === rec.id)) ordered.push(rec);
  }
  const saved = await saveCategories(ordered);
  safeLog('categories_reorder', { provided_ids: idOrder.length, total_after: saved.length });
  return saved;
}

/** Optional helper: merge unique-by-name */
export async function upsertCategoriesUniqueByName(incoming = []) {
  const current = await loadCategories();
  const byName = new Map(current.map((c) => [c.name.toLowerCase(), c]));
  let added = 0;
  for (const raw of normalizeArray(incoming)) {
    const key = raw.name.toLowerCase();
    if (!byName.has(key)) { byName.set(key, raw); added++; } // existing wins
  }
  const saved = await saveCategories(Array.from(byName.values()));
  safeLog('categories_upsert_unique', { added, total_after: saved.length });
  return saved;
}

/**
 * Patch: ensure built-in categories have a persisted file:// iconUri,
 * just like custom categories. Run once after app boot (after icons are copied).
 */
export async function patchBuiltinCategoryIcons() {
  try {
    await ensureMediaDir();
    const list = await loadCategories();
    if (!Array.isArray(list) || list.length === 0) return list;

    let dirty = false;
    const next = list.map((c) => {
      if (c?.builtinKey) {
        const should = builtinFileUriForKey(c.builtinKey);
        if (!c.iconUri || norm(c.iconUri).indexOf('file://') !== 0 || c.iconUri !== should) {
          dirty = true;
          return { ...c, iconUri: should };
        }
      }
      return c;
    });

    if (dirty) {
      const saved = await saveCategories(next);
      safeLog('categories_patch_builtin_icons', { patched: 1, total_after: saved.length });
      return saved;
    }
    return next;
  } catch (e) {
    safeLog('categories_patch_builtin_icons_error', { message: String(e?.message || e) });
    return loadCategories();
  }
}
