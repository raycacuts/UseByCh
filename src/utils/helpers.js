// File: src/screens/settings/helpers.js
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

/* ========= tiny utils ========= */
export const nowStamp = () => Date.now().toString();

export function guessExtFromUri(uri = '') {
  const u = (uri || '').toLowerCase();
  if (u.endsWith('.png')) return 'png';
  if (u.endsWith('.webp')) return 'webp';
  if (u.endsWith('.jpeg')) return 'jpg';
  if (u.endsWith('.jpg')) return 'jpg';
  return 'jpg';
}

function sanitize(s = '') {
  return s.toString().replace(/[^a-z0-9_-]/gi, '_');
}

function parseDataUrl(dataUrl = '') {
  try {
    const m = String(dataUrl).match(/^data:(.*?);base64,(.*)$/i);
    if (!m) return null;
    const mime = (m[1] || '').toLowerCase();
    const ext =
      mime.includes('png') ? 'png' :
      mime.includes('webp') ? 'webp' :
      mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'jpg';
    return { mime, ext, b64: m[2] };
  } catch {
    return null;
  }
}

/* ========= file helpers ========= */
export async function copyImageTo(imagesDir, srcUri, idx) {
  if (!srcUri) return '';
  try {
    let destRel = '';
    if (srcUri.startsWith('data:')) {
      const parsed = parseDataUrl(srcUri);
      if (!parsed) return '';
      const filename = `images/item_${nowStamp()}_${idx}.${parsed.ext}`;
      const destAbs =
        Platform.OS === 'ios'
          ? `${RNFS.TemporaryDirectoryPath}${filename}`
          : `${imagesDir}/${sanitize(filename)}`;
      await RNFS.writeFile(destAbs, parsed.b64, 'base64');
      destRel = `images/${sanitize(filename)}`;
    } else {
      const ext = guessExtFromUri(srcUri);
      const filename = `images/item_${nowStamp()}_${idx}.${ext}`;
      const destAbs = `${imagesDir}/${sanitize(filename)}`;
      const srcAbs = srcUri.replace(/^file:\/\//, '');
      if (await RNFS.exists(srcAbs)) {
        try { await RNFS.copyFile(srcAbs, destAbs); }
        catch { const b64 = await RNFS.readFile(srcAbs, 'base64'); await RNFS.writeFile(destAbs, b64, 'base64'); }
        destRel = `images/${sanitize(filename)}`;
      }
    }
    return destRel;
  } catch (e) {
    console.warn('copyImageTo failed:', e?.message || e);
    return '';
  }
}

export async function copyCategoryIconTo(imagesDir, srcUri, name, idx) {
  if (!srcUri) return '';
  try {
    const base = sanitize(name || `cat_${idx}`);
    const ext = srcUri.startsWith('data:')
      ? parseDataUrl(srcUri)?.ext || 'jpg'
      : guessExtFromUri(srcUri);
    const filename = `images/cat_${base}_${nowStamp()}.${ext}`;
    const destAbs = `${imagesDir}/${sanitize(filename)}`;

    if (srcUri.startsWith('data:')) {
      const parsed = parseDataUrl(srcUri);
      if (!parsed) return '';
      await RNFS.writeFile(destAbs, parsed.b64, 'base64');
    } else {
      const srcAbs = srcUri.replace(/^file:\/\//, '');
      if (await RNFS.exists(srcAbs)) {
        try { await RNFS.copyFile(srcAbs, destAbs); }
        catch { const b64 = await RNFS.readFile(srcAbs, 'base64'); await RNFS.writeFile(destAbs, b64, 'base64'); }
      } else {
        return '';
      }
    }
    return `images/${sanitize(filename)}`;
  } catch (e) {
    console.warn('copyCategoryIconTo failed:', e?.message || e);
    return '';
  }
}

/* ========= manifest mapping: items ========= */
export function toManifestItem(it, picPath) {
  const name = typeof it.name === 'string' && it.name.trim() ? it.name.trim() : '';
  const product = it.productDate ?? it.producedDate ?? '';
  const category = it.categoryIconKey ?? it.category ?? '';
  const duration =
    typeof it.durationDays === 'number'
      ? it.durationDays
      : typeof it.duration === 'number'
      ? it.duration
      : null;
  const expiryDate = it.expiryDate ?? '';
  const remindDays = typeof it.remindDays === 'number' ? it.remindDays : 7;
  const notes = it.notes ?? '';
  return { name, picPath, product, category, duration, expiryDate, remindDays, notes };
}

export async function fromManifestItemPersistent(extractDir, m, idx) {
  let iconUri = '';
  try {
    if (m?.picPath) {
      const src = `${extractDir}/${m.picPath}`.replace(/\/+/g, '/');
      const ext = guessExtFromUri(src);
      const filename = `useby_import_${nowStamp()}_${idx}.${ext}`;
      const dest =
        Platform.OS === 'ios'
          ? `${RNFS.LibraryDirectoryPath}/${filename}`
          : `${RNFS.DocumentDirectoryPath}/${filename}`;
      if (await RNFS.exists(src)) {
        try { await RNFS.copyFile(src, dest); }
        catch { const b64 = await RNFS.readFile(src, 'base64'); await RNFS.writeFile(dest, b64, 'base64'); }
        iconUri = Platform.OS === 'ios' ? dest : `file://${dest}`;
      }
    }
  } catch (e) {
    console.warn('fromManifestItemPersistent image copy failed:', e?.message || e);
  }
  const name = typeof m?.name === 'string' ? m.name : 'Unnamed';
  return {
    id: m.id ?? `${Date.now()}_${idx}`,
    name,
    iconUri,
    productDate: m?.product ?? '',
    categoryIconKey: m?.category ?? null,
    durationDays: typeof m?.duration === 'number' ? m.duration : null,
    expiryDate: m?.expiryDate ?? '',
    remindDays: typeof m?.remindDays === 'number' ? m.remindDays : 7,
    notes: m?.notes ?? '',
    // hint used to reconcile custom categories on import (optional)
    categoryNameHint: typeof m?.categoryName === 'string' ? m.categoryName : '',
  };
}

/* ========= manifest mapping: categories ========= */
export function toManifestCategory(cat, iconPath) {
  const name = (cat?.name || '').trim();
  return { name, iconPath };
}

export async function fromManifestCategoryPersistent(extractDir, m, idx) {
  let iconUri = '';
  const name = (m?.name || '').trim() || `Imported ${idx + 1}`;
  try {
    if (m?.iconPath) {
      const src = `${extractDir}/${m.iconPath}`.replace(/\/+/g, '/');
      const ext = guessExtFromUri(src);
      const filename = `useby_cat_${sanitize(name)}_${nowStamp()}.${ext}`;
      const dest =
        Platform.OS === 'ios'
          ? `${RNFS.LibraryDirectoryPath}/${filename}`
          : `${RNFS.DocumentDirectoryPath}/${filename}`;
      if (await RNFS.exists(src)) {
        try { await RNFS.copyFile(src, dest); }
        catch { const b64 = await RNFS.readFile(src, 'base64'); await RNFS.writeFile(dest, b64, 'base64'); }
        iconUri = Platform.OS === 'ios' ? dest : `file://${dest}`;
      }
    }
  } catch (e) {
    console.warn('fromManifestCategoryPersistent icon copy failed:', e?.message || e);
  }
  return { name, iconUri };
}

/* ========= misc fs helper ========= */
export async function safeRm(path) {
  try {
    if (path && (await RNFS.exists(path))) await RNFS.unlink(path);
  } catch {}
}
