// File: src/screens/settings/helpers.js
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { MEDIA_DIR, ensureMediaDir } from '../../utils/media';  // ⭐ persist location


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

export function parseDataUrl(dataUrl = '') {
  if (!dataUrl?.startsWith?.('data:')) return null;
  const i = dataUrl.indexOf(',');
  if (i < 0) return null;
  const header = dataUrl.slice(5, i);
  const [mime, enc] = header.split(';');
  const base64 = dataUrl.slice(i + 1);
  if (enc !== 'base64') return null;
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return { base64, ext };
}

export async function safeRm(p) {
  if (!p) return;
  try {
    const normalized = p.replace(/^file:\/\//, '');
    if (await RNFS.exists(normalized)) await RNFS.unlink(normalized);
  } catch (e) {
    console.warn('safeRm failed:', e?.message || e);
  }
}

const sanitize = (s = '') =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/* ========= file copy helpers ========= */
async function ensureCopyFromUri(srcUri, destAbs) {
  if (!srcUri) return false;

  if (srcUri.startsWith('data:')) {
    const parsed = parseDataUrl(srcUri);
    if (!parsed) return false;
    await RNFS.writeFile(destAbs, parsed.base64, 'base64');
    return true;
  }

  if (Platform.OS === 'ios' && srcUri.startsWith('ph://')) {
    try { await RNFS.copyAssetsFileIOS(srcUri, destAbs, 0, 0); return true; }
    catch (e) { console.warn('copyAssetsFileIOS failed:', e?.message || e); return false; }
  }

  const path = srcUri.startsWith('file://') ? srcUri.replace('file://', '') : srcUri;
  try {
    const exists = await RNFS.exists(path);
    if (!exists) return false;
    try { await RNFS.copyFile(path, destAbs); }
    catch { const b64 = await RNFS.readFile(path, 'base64'); await RNFS.writeFile(destAbs, b64, 'base64'); }
    return true;
  } catch {
    return false;
  }
}

export async function copyImageTo(imagesDir, srcUri, idx) {
  if (!srcUri) return '';
  try {
    const ext = srcUri.startsWith('data:')
      ? parseDataUrl(srcUri)?.ext || 'jpg'
      : guessExtFromUri(srcUri);
    const destRel = `images/img_${idx}.${ext}`;
    const destAbs = `${imagesDir}/img_${idx}.${ext}`;
    const ok = await ensureCopyFromUri(srcUri, destAbs);
    return ok ? destRel : '';
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
    const destRel = `images/cat_${base}.${ext}`;
    const destAbs = `${imagesDir}/cat_${base}.${ext}`;
    const ok = await ensureCopyFromUri(srcUri, destAbs);
    return ok ? destRel : '';
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
      await ensureMediaDir();                                        // ⭐ ensure persistent dir
      const dest = `${MEDIA_DIR}/${filename}`;                       // ⭐ persist to Documents/useby_media
      if (await RNFS.exists(src)) {
        try { await RNFS.copyFile(src, dest); }
        catch {
          const b64 = await RNFS.readFile(src, 'base64');
          await RNFS.writeFile(dest, b64, 'base64');
        }
        iconUri = `file://${dest}`;                                  // ⭐ always return file://
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
      await ensureMediaDir();                                       // ⭐ ensure persistent dir
      const dest = `${MEDIA_DIR}/${filename}`;                      // ⭐ persist to Documents/useby_media
      if (await RNFS.exists(src)) {
        try { await RNFS.copyFile(src, dest); }
        catch {
          const b64 = await RNFS.readFile(src, 'base64');
          await RNFS.writeFile(dest, b64, 'base64');
        }
        iconUri = `file://${dest}`;                                 // ⭐ always return file://
      }
    }
  } catch (e) {
    console.warn('fromManifestCategoryPersistent icon copy failed:', e?.message || e);
  }
  return { name, iconUri };
}
