// src/icons/index.js
// Only the real icons (no "none" here). The picker screen will add its own "No Category".

import { Image, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { MEDIA_DIR, ensureMediaDir } from '../utils/media';

export const ICONS = [
  { key: 'food',        label: '食品',       source: require('./food.png') },
  { key: 'medication',  label: '药品',       source: require('./medication.png') },
  { key: 'makeup',      label: '化妆品',     source: require('./makeup.png') },
  { key: 'petfood',     label: '宠物食品',   source: require('./petfood.png') },
  { key: 'coupon',      label: '优惠券',     source: require('./coupon.png') },

  { key: 'household',   label: '日用品',     source: require('./household.png') },
  { key: 'shampoo',     label: '个人护理',   source: require('./personalcare.png') },
  { key: 'document',    label: '文档',       source: require('./document.png') },
];


// Build a quick lookup table
const ICON_MAP = ICONS.reduce((acc, it) => {
  acc[it.key] = it;
  return acc;
}, {});

// Helper: get full record by key
export function iconByKey(key) {
  if (!key || typeof key !== 'string') return null;
  return ICON_MAP[key] || null;
}

// Helper: get only the source
export function iconSourceByKey(key) {
  const rec = iconByKey(key);
  return rec ? rec.source : null;
}

// ---------- Persist built-in icons to Documents and point ICONS to file:// ----------
function sanitize(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Call once on app start. Copies each built-in icon from the app bundle
 * to Documents/useby_media and rewires ICONS[x].source to { uri: file://... }.
 */
export async function persistBuiltinIconsOnce() {
  try {
    await ensureMediaDir();

    for (const it of ICONS) {
      const resolved = Image.resolveAssetSource(it.source);
      if (!resolved || !resolved.uri) continue;

      // destination (stable, based on key)
      const fname = `builtin_${sanitize(it.key)}.png`;
      const dest = `${MEDIA_DIR}/${fname}`;

      // If already copied, just re-point
      const exists = await RNFS.exists(dest);
      if (!exists) {
        const srcUri = resolved.uri; // iOS: file:///.../main.app/..., Android: asset:/...
        try {
          if (Platform.OS === 'android' && srcUri.startsWith('asset:/')) {
            // copy from android assets
            const assetPath = srcUri.replace('asset:/', '');
            await RNFS.copyFileAssets(assetPath, dest);
          } else {
            // iOS bundle (file://) or generic path
            const plain = srcUri.replace(/^file:\/\//, '');
            try { await RNFS.copyFile(plain, dest); }
            catch {
              const b64 = await RNFS.readFile(plain, 'base64');
              await RNFS.writeFile(dest, b64, 'base64');
            }
          }
        } catch (e) {
          // If copy fails, leave the original require(...) in place
          // so Debug still works; continue to next.
          continue;
        }
      }

      // Rewire the in-memory source to persistent file URI
      it.source = { uri: `file://${dest}` };
      ICON_MAP[it.key] = it;
    }
  } catch {
    // best-effort; ignore errors
  }
}

// Default export remains the ICONS array
export default ICONS;
