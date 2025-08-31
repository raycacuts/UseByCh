// src/context/DataContext.js
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rescheduleAll } from '../notifications/notify';
import { subscribeCategories } from '../storage/customCategories';

// 🔹 Media helpers (persist to Documents, handle iOS ph://, and rebase old container paths)
import {
  MEDIA_DIR,
  ensureMediaDir,
  isVolatileUri,
  rebaseToCurrentDocUri,
  persistLocalImage, // copies into Documents/useby_media and returns file:// URI
} from '../utils/media';

// 🔹 Analytics
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

// 🔹 Built-in category keys (optional; used to preserve built-ins on import)
import { ICONS_BY_KEY } from '../utils/categoryIcons';

const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

const STORAGE_KEY = 'useby_items_v1';
const norm = (s = '') => s.toString().trim().toLowerCase();

export function DataProvider({ children }) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // 🔹 Categories stored centrally
  const [cats, setCats] = useState([]);                 // [{id, name, iconUri}, ...]
  const [catsById, setCatsById] = useState(new Map());  // id -> category
  const [catsVersion, setCatsVersion] = useState(0);    // bump to force list re-render

  // One-time migration guard
  const didMigrateRef = useRef(false);

  // Load items from storage (+ migrate image URIs to persistent + rebase old container paths)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) || [];
          setItems(parsed);
          try {
            logEvent(getAnalytics(getApp()), 'data_load_ok', {
              count: Array.isArray(parsed) ? parsed.length : 0,
            });
          } catch {}

          // 🛠 Migrate any cache/tmp or Photos (ph://) image URIs to Documents, and rebase old Documents URIs
          if (!didMigrateRef.current && Array.isArray(parsed) && parsed.length) {
            await ensureMediaDir();

            const migrated = await Promise.all(
              parsed.map(async (it) => {
                const old = it?.photoUri || it?.iconUri || '';
                if (!old) return it;

                // 1) If it was saved in Documents/useby_media but the container UUID changed, just rebase
                const rebased = rebaseToCurrentDocUri(old);
                if (rebased !== old) {
                  return { ...it, photoUri: rebased, iconUri: rebased };
                }

                // 2) If it's volatile (/tmp, /Caches) OR Photos (ph://), copy into Documents
                if (isVolatileUri(old) || old.startsWith('ph://')) {
                  try {
                    const persisted = await persistLocalImage(old);
                    if (!persisted) {
                      // file was already purged by iOS; clear gracefully
                      return { ...it, photoUri: '', iconUri: '' };
                    }
                    return { ...it, photoUri: persisted, iconUri: persisted };
                  } catch {
                    return it;
                  }
                }

                // 3) Otherwise keep as-is
                return it;
              })
            );

            // If anything changed, save once (also reschedules notifications)
            const changed =
              migrated.length !== parsed.length ||
              migrated.some((it, i) => it.photoUri !== parsed[i]?.photoUri || it.iconUri !== parsed[i]?.iconUri);

            if (changed) {
              try { logEvent(getAnalytics(getApp()), 'data_migrate_image_uris', {}); } catch {}
              await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
              setItems(migrated);
              try {
                rescheduleAll(migrated);
                try {
                  logEvent(getAnalytics(getApp()), 'notify_reschedule_after_migrate', { items: migrated.length });
                } catch {}
              } catch (e) {
                try {
                  logEvent(getAnalytics(getApp()), 'notify_reschedule_error', { message: String(e?.message || e) });
                } catch {}
              }
            }

            didMigrateRef.current = true;
          }
        } else {
          try { logEvent(getAnalytics(getApp()), 'data_load_empty', {}); } catch {}
        }
      } catch (e) {
        try { logEvent(getAnalytics(getApp()), 'data_load_error', { message: String(e?.message || e) }); } catch {}
      }
    })();
  }, []);

  // Persist + reschedule notifications
  async function save(next) {
    const prevCount = Array.isArray(itemsRef.current) ? itemsRef.current.length : 0;
    const nextCount = Array.isArray(next) ? next.length : 0;

    setItems(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      try {
        logEvent(getAnalytics(getApp()), 'data_save_ok', { prev_count: prevCount, next_count: nextCount });
      } catch {}
    } catch (e) {
      try { logEvent(getAnalytics(getApp()), 'data_save_error', { message: String(e?.message || e) }); } catch {}
    }

    try {
      rescheduleAll(next);
      try { logEvent(getAnalytics(getApp()), 'notify_reschedule_after_save', { items: nextCount }); } catch {}
    } catch (e) {
      try { logEvent(getAnalytics(getApp()), 'notify_reschedule_error', { message: String(e?.message || e) }); } catch {}
    }
  }

  // Public API for items
  async function addItem(payload) {
    // 🛠 persist image to a stable location before saving
    let photo = payload.photoUri || payload.iconUri || '';
    try {
      if (photo) {
        const persisted = await persistLocalImage(photo);
        photo = persisted || ''; // if copy failed (or missing), fallback empty
      }
    } catch {}

    const next = [
      ...itemsRef.current,
      {
        id: `${Date.now()}`,
        name: payload.name || 'Unnamed',
        photoUri: photo || '',
        iconUri: photo || '',
        productDate: payload.productDate || null,
        expiryDate: payload.expiryDate || null,
        remindDays: typeof payload.remindDays === 'number' ? payload.remindDays : 7,
        // store whatever we get; cascade will normalize keys
        categoryIconKey: payload.categoryIconKey ?? payload.category ?? null,
        category: payload.category ?? null, // legacy plain name if still referenced elsewhere
        notes: payload.notes || '',
        edibleDays: payload.edibleDays ?? null,
      },
    ];
    try {
      logEvent(getAnalytics(getApp()), 'item_add', {
        has_photo: photo ? 1 : 0,
        has_category: (payload.categoryIconKey ?? payload.category) ? 1 : 0,
      });
    } catch {}
    save(next);
  }

  async function updateItem(id, patch) {
    // If the update tries to set a new image, persist it first
    let newPhoto = patch?.photoUri || patch?.iconUri;
    let persistedPhoto = null;
    if (newPhoto) {
      try { persistedPhoto = await persistLocalImage(newPhoto); } catch {}
    }

    const cleaned = (obj) =>
      Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined));

    const effectivePatch = { ...cleaned(patch) };
    if (persistedPhoto !== null) {
      effectivePatch.photoUri = persistedPhoto || '';
      effectivePatch.iconUri  = persistedPhoto || '';
    }

    const fields = Object.keys(effectivePatch);
    const next = itemsRef.current.map((it) =>
      it.id === id ? { ...it, ...effectivePatch } : it
    );
    try { logEvent(getAnalytics(getApp()), 'item_update', { id: String(id || ''), fields: fields.join(',') }); } catch {}
    save(next);
  }

  function deleteItem(id) {
    const next = itemsRef.current.filter((it) => it.id !== id);
    try { logEvent(getAnalytics(getApp()), 'item_delete', { id: String(id || '') }); } catch {}
    save(next);
  }

  function deleteMany(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const setIds = new Set(ids);
    const next = itemsRef.current.filter((it) => !setIds.has(it.id));
    try { logEvent(getAnalytics(getApp()), 'items_delete_many', { count: ids.length }); } catch {}
    save(next);
  }

  function addMultipleItems(arr) {
    const next = [...itemsRef.current, ...arr];
    try { logEvent(getAnalytics(getApp()), 'items_add_many', { count: Array.isArray(arr) ? arr.length : 0 }); } catch {}
    save(next);
  }

  function replaceAllItems(arr) {
    try {
      logEvent(getAnalytics(getApp()), 'items_replace_all', {
        prev_count: Array.isArray(itemsRef.current) ? itemsRef.current.length : 0,
        next_count: Array.isArray(arr) ? arr.length : 0,
      });
    } catch {}
    save(arr);
  }

  /**
   * 🔹 Category cascade + central store
   * Keeps categories in context + bumps catsVersion, and normalizes item.categoryIconKey:
   *  - 'custom:<id>' kept if id exists; else if token is a current name -> map to id; else -> null
   *  - plain string -> map to current custom by name; else if BUILT-IN key (ICONS_BY_KEY) keep; else -> null
   *  - legacy item.category -> keep only if current custom name exists; else -> null
   */
  useEffect(() => {
    const unsub = subscribeCategories(async (nextCats) => {
      if (!Array.isArray(nextCats)) return;
      try {
        // 1) store categories centrally + version bump (forces FlatList re-render)
        setCats(nextCats);
        setCatsById(new Map(nextCats.map(c => [String(c.id), c])));
        setCatsVersion(v => v + 1);

        try { logEvent(getAnalytics(getApp()), 'categories_changed', { count: nextCats.length }); } catch {}

        // 2) normalize item keys
        const nameById = new Map(nextCats.map(c => [String(c.id), String(c.name || '')]));
        const idByNormName = new Map(nextCats.map(c => [norm(c.name || ''), String(c.id)]));
        const isBuiltInKey = (k) => ICONS_BY_KEY.has(norm(k));

        const prev = Array.isArray(itemsRef.current) ? itemsRef.current : [];
        let dirty = false;
        let changedCount = 0;

        const nextItems = prev.map((it) => {
          let changed = false;

          let key = it?.categoryIconKey;
          if (typeof key === 'string' && key.trim().length) {
            if (key.startsWith('custom:')) {
              const token = key.slice(7).trim(); // could be id OR legacy name
              if (nameById.has(String(token))) {
                // valid id → keep
              } else {
                const toId = idByNormName.get(norm(token));
                if (toId) {
                  const newKey = `custom:${toId}`;
                  if (newKey !== key) { key = newKey; changed = true; }
                } else {
                  key = null; changed = true;
                }
              }
            } else {
              const toId = idByNormName.get(norm(key));
              if (toId) {
                const newKey = `custom:${toId}`;
                if (newKey !== key) { key = newKey; changed = true; }
              } else if (isBuiltInKey(key)) {
                // keep built-in key
              } else {
                key = null; changed = true;
              }
            }
          }

          let plain = it?.category;
          if (typeof plain === 'string' && plain.trim().length) {
            if (!idByNormName.has(norm(plain))) { plain = null; changed = true; }
          }

          if (changed) { dirty = true; changedCount += 1; return { ...it, categoryIconKey: key, category: plain }; }
          return it;
        });

        if (dirty) {
          try { logEvent(getAnalytics(getApp()), 'categories_cascade_apply', { changed_items: changedCount }); } catch {}
          await save(nextItems);
        }
      } catch (e) {
        try { logEvent(getAnalytics(getApp()), 'categories_cascade_error', { message: String(e?.message || e) }); } catch {}
      }
    });

    return () => { try { unsub && unsub(); } catch {} };
  }, []); // subscribe once; itemsRef always has latest

  const value = useMemo(
    () => ({
      // items api
      items,
      addItem,
      updateItem,
      deleteItem,
      deleteMany,
      addMultipleItems,
      replaceAllItems,
      // categories api for screens
      cats,
      catsById,
      catsVersion,
    }),
    [items, cats, catsById, catsVersion],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
