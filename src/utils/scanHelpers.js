// src/utils/scanHelpers.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActionSheetIOS } from 'react-native';

export function markTime(label, start) {
  const now = Date.now();
  console.log(`[SCAN TIMING] ${label}: ${now - start}ms`);
  return now;
}

export function enforceOrder(pd, ed) {
  if (pd && ed && ed < pd) return [ed, pd];
  return [pd, ed];
}

export async function chooseScanSource(preferLast = true, storageKey = 'last_scan_source') {
  if (preferLast) {
    try {
      const last = await AsyncStorage.getItem(storageKey);
      if (last === 'camera') return 'Take Photo';
      if (last === 'library') return 'Pick Photo';
    } catch {}
  }
  return new Promise((resolve) => {
    if (ActionSheetIOS?.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Scan', options: ['Take Photo', 'Pick Photo', 'Cancel'], cancelButtonIndex: 2 },
        (idx) => resolve(idx === 0 ? 'Take Photo' : idx === 1 ? 'Pick Photo' : 'Cancel')
      );
    } else {
      resolve('Pick Photo');
    }
  });
}
