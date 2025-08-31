// src/utils/categoryIcons.js
import ICONS, { iconSourceByKey } from '../icons';
import { toDisplayUri, MEDIA_DIR } from './media';

export const norm = (s = '') => s.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
const sanitize = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Snapshot maps (kept for compatibility), but we’ll prefer runtime/file URIs
export const ICONS_BY_KEY   = new Map((ICONS || []).map(i => [norm(i.key),   i.source]));
export const ICONS_BY_LABEL = new Map((ICONS || []).map(i => [norm(i.label || i.key), i.source]));

// Build a file:// URI for a persisted built-in icon (we copy these at boot)
function builtinFileUriForKey(key = '') {
  const k = sanitize(key || '');
  return `file://${MEDIA_DIR}/builtin_${k}.png`;
}

/** Returns RN image source for a category item (user or built-in). */
export function iconSourceForItem(item) {
  if (!item) return null;

  // Custom user icon (persisted file)
  if (item.iconUri) {
    return { uri: toDisplayUri(item.iconUri) };
  }

  // Built-in by explicit key first
  const key = norm(item.builtinKey || item.categoryIconKey || '');
  if (key) {
    // Prefer the persisted file in Documents/useby_media
    return { uri: builtinFileUriForKey(key) };
  }

  // Fallback: built-in by label or key from the 'name' field
  const n = norm(item.name || '');
  if (n) {
    // Try label match in ICONS to get its canonical key, then build file URI
    const rec = ICONS.find(i => norm(i.label || i.key) === n || norm(i.key) === n);
    if (rec?.key) {
      return { uri: builtinFileUriForKey(rec.key) };
    }
  }

  return null;
}

/**
 * For the small category button in AddItemScreen.
 * Resolves in this order:
 *  1) 'custom:<id>' -> savedCats match by id (returns its iconUri)
 *  2) built-in by key (persisted file)
 *  3) built-in by label (persisted file)
 *  4) saved custom by NAME (legacy plain-name)
 */
export function buttonIconSourceFromKey(key, savedCats = []) {
  if (!key || key === 'none') return null;

  // custom:<id>
  if (String(key).startsWith('custom:')) {
    const id = String(key).slice('custom:'.length);
    const hit = savedCats.find(c => String(c.id) === id && c.iconUri);
    return hit?.iconUri ? { uri: toDisplayUri(hit.iconUri) } : null;
  }

  const nk = norm(key);

  // Built-in by key → always use the persisted file URI
  if (nk) {
    return { uri: builtinFileUriForKey(nk) };
  }

  // Built-in by label (runtime)
  const rec = ICONS.find(i => norm(i.label || i.key) === nk);
  if (rec?.key) {
    return { uri: builtinFileUriForKey(rec.key) };
  }

  // Custom by NAME (legacy)
  const byName = savedCats.find(c => norm(c.name) === nk && c.iconUri);
  if (byName?.iconUri) return { uri: toDisplayUri(byName.iconUri) };

  return null;
}

/** Stable key for an item ('none' | builtinKey | custom:<id>) */
export function keyForItem(item) {
  if (!item) return 'none';
  if (item.id === 'none' || item.isNone) return 'none';
  if (item.builtinKey) return item.builtinKey;
  if (item.id) return `custom:${item.id}`;
  return 'none';
}

/** Optional helper: check if a key can resolve with current categories */
export function isValidCategoryKey(key, savedCats = []) {
  const k = (key || '').trim();
  if (!k || k === 'none') return true;
  if (k.startsWith('custom:')) {
    const id = k.slice(7);
    return savedCats.some(c => String(c.id) === String(id));
  }
  // built-in or plain name
  if (ICONS_BY_KEY.has(norm(k)) || ICONS_BY_LABEL.has(norm(k))) return true;
  return savedCats.some(c => norm(c.name) === norm(k));
}
