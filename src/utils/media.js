// src/utils/media.js
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

export const MEDIA_DIR = `${RNFS.DocumentDirectoryPath}/useby_media`;

export async function ensureMediaDir() {
  try { await RNFS.mkdir(MEDIA_DIR); } catch (e) {}
  return MEDIA_DIR;
}

function extFromUri(uri='') {
  const m = uri.split('?')[0].match(/\.(\w{2,5})$/i);
  return m ? m[1].toLowerCase() : 'jpg';
}
function stripFile(uri='') { return uri.replace(/^file:\/\//, ''); }

export async function persistLocalImage(srcUri) {
  if (!srcUri) return null;
  const plain = stripFile(srcUri);
  if (plain.startsWith(MEDIA_DIR)) return `file://${plain}`;

  await ensureMediaDir();
  const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.${extFromUri(srcUri)}`;
  const destPath = `${MEDIA_DIR}/${name}`;

  try {
    if (Platform.OS === 'ios' && srcUri.startsWith('ph://')) {
      await RNFS.copyAssetsFileIOS(srcUri, destPath, 0, 0);
      return `file://${destPath}`;
    }
    const exists = await RNFS.exists(plain);
    if (!exists) return null;
    await RNFS.copyFile(plain, destPath);
    return `file://${destPath}`;
  } catch {
    return null;
  }
}

// Heuristic: temp/cache
export function isVolatileUri(uri='') {
  return /\/Library\/Caches\/|\/tmp\//i.test(uri);
}

// ⭐ Rebase a previously-saved Documents URI to the current container
export function rebaseToCurrentDocUri(uri='') {
  if (!uri) return uri;
  const m = stripFile(uri).match(/\/Documents\/useby_media\/(.+)$/);
  if (!m) return uri;
  const filename = m[1];
  return `file://${MEDIA_DIR}/${filename}`;
}

// For UI: always return a usable, current-container uri
export function toDisplayUri(uri='') {
  if (!uri) return '';
  return rebaseToCurrentDocUri(uri);
}
