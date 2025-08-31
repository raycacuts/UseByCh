// src/context/LocaleContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNLocalize from 'react-native-localize';
import { LANGS, STRINGS } from '../i18n/langs';

const STORAGE_KEY = 'useby_lang_v1';
const LocaleCtx = createContext(null);
export const useLocale = () => useContext(LocaleCtx);

function deviceLangCode() {
  const locales = RNLocalize.getLocales?.() || [];
  const tag = locales[0]?.languageTag?.toLowerCase?.() || 'en';
  if (tag.startsWith('zh')) return 'zh';
  // Extend mapping for more languages as you add them
  return 'en';
}

export function LocaleProvider({ children }) {
  const [selected, setSelected] = useState('system'); // 'system' | 'en' | 'zh' | ...
  const [system, setSystem] = useState(deviceLangCode());

  // Listen for device language changes
  useEffect(() => {
    const handler = () => setSystem(deviceLangCode());
    RNLocalize.addEventListener?.('change', handler);
    return () => RNLocalize.removeEventListener?.('change', handler);
  }, []);

  // Load saved preference
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) setSelected(saved);
      } catch {}
    })();
  }, []);

  async function setLanguage(code) {
    try { await AsyncStorage.setItem(STORAGE_KEY, code); } catch {}
    setSelected(code);
  }

  const effective = selected === 'system' ? system : selected;
  const strings = STRINGS[effective] || STRINGS.en;

  // tiny i18n helper
  function t(key) {
    return strings[key] ?? key;
  }

  const value = useMemo(
    () => ({ language: selected, effective, setLanguage, t, LANGS }),
    [selected, effective, strings]
  );

  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}
