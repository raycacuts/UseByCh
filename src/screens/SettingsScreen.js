// src/screens/SettingsScreen.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Alert,
  Linking,
  Platform,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { zip, unzip } from 'react-native-zip-archive';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

import { useData } from '../context/DataContext';
import { useBilling } from '../context/BillingContext';

import Row from './settings/Row';
import {
  nowStamp,
  copyImageTo,
  toManifestItem,
  fromManifestItemPersistent,
  safeRm,
  copyCategoryIconTo,
  toManifestCategory,
  fromManifestCategoryPersistent,
} from './settings/helpers';

// ⬇️ include subscribeCategories so we can cascade on deletion here too
import { loadCategories, saveCategories, subscribeCategories } from '../storage/customCategories';
import { ICONS } from '../icons';

// iOS notifications (notify.ios.js is resolved on iOS; Android stub is no-op)
import { initNotifications, rescheduleAll } from '../notifications/notify';

/* === local helpers for category mapping === */
const _norm = (s='') => s.toString().toLowerCase().replace(/[^a-z0-9]/g,'');
const _ICON_KEYS = new Set((ICONS||[]).map(i => _norm(i.key)));
const _LABEL_TO_KEY = new Map((ICONS||[]).map(i => [_norm(i.label || i.key), i.key]));

const PRIVACY_URL = 'https://raycacuts.github.io/privacy-policy';
const LIVE_REWARDED_UNIT = 'ca-app-pub-2231097012853096/7882783810';
const REWARDED_AD_UNIT = __DEV__ ? TestIds.REWARDED : LIVE_REWARDED_UNIT;

const DAILY_KEY = 'useby_daily_scan_bonus_v1';
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Notification hour (0-23)
const NOTIFY_HOUR_KEY = '@useby_notify_hour';
const DEFAULT_NOTIFY_HOUR = 11;

export default function SettingsScreen() {
  const nav = useNavigation();

  // ✅ Pull everything you need from hooks AT THE TOP LEVEL
  const { items, addMultipleItems, replaceAllItems } = useData();
  const { scansLeft, grantBonusScans } = useBilling();

  const [busy, setBusy] = useState(false);

  // ATT-aware NPA flag: if user declined ATT, request NPA
  const authorized = global?.USEBY_ATT_AUTHORIZED === true;

  // Create a rewarded ad (NPA when !authorized)
  const rewardedRef = useRef(
    RewardedAd.createForAdRequest(REWARDED_AD_UNIT, {
      requestNonPersonalizedAdsOnly: !authorized,
    })
  );
  const [adReady, setAdReady] = useState(false);
  const [adLoading, setAdLoading] = useState(false);

  // ---- Notification hour state
  const [notifyHour, setNotifyHour] = useState(DEFAULT_NOTIFY_HOUR);
  const [hourOpen, setHourOpen] = useState(false);

  // ----- analytics: measure time on Settings screen (focus/blur)
  useFocusEffect(
    useCallback(() => {
      const start = Date.now();
      try {
        const ga = getAnalytics(getApp());
        logEvent(ga, 'settings_open', { platform: Platform.OS, scans_left: scansLeft });
      } catch {}
      return () => {
        try {
          const ga = getAnalytics(getApp());
          const dur = Date.now() - start;
          logEvent(ga, 'settings_close', { duration_ms: dur, platform: Platform.OS });
        } catch {}
      };
    }, [scansLeft])
  );

  // ---- Init notifications + load saved hour
  useEffect(() => {
    (async () => {
      try { await initNotifications(); } catch {}
      try {
        const raw = await AsyncStorage.getItem(NOTIFY_HOUR_KEY);
        const h = Number(raw);
        if (Number.isInteger(h) && h >= 0 && h <= 23) setNotifyHour(h);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const rewarded = rewardedRef.current;

    const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      setAdReady(true);
      setAdLoading(false);
      try {
        const ga = getAnalytics(getApp());
        logEvent(ga, 'rewarded_loaded', { unit: REWARDED_AD_UNIT, npa: !authorized });
      } catch {}
    });
    const unsubEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      try {
        grantBonusScans(5); // add directly, no prompt
        const ga = getAnalytics(getApp());
        logEvent(ga, 'rewarded_reward', { amount: 5, scans_left_after: scansLeft + 5 });
      } catch {}
    });
    const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      setAdLoading(false);
      setAdReady(false);
      try {
        const ga = getAnalytics(getApp());
        logEvent(ga, 'rewarded_closed', {});
      } catch {}
      setTimeout(() => rewarded.load(), 300);
    });
    const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, (e) => {
      setAdLoading(false);
      setAdReady(false);
      try {
        const ga = getAnalytics(getApp());
        logEvent(ga, 'rewarded_error', { message: String(e?.message || 'error') });
      } catch {}
    });

    rewarded.load();
    return () => {
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
    };
  }, [grantBonusScans, scansLeft, authorized]);

  // ---- Hour label
  const formatHourLabel = (h) => {
    const hour = ((h % 24) + 24) % 24;
    // Simple 12h formatting for display row (中文 AM/PM):
    const ampm = hour < 12 ? '上午' : '下午';
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${ampm} ${h12}:00`;
  };

  // ---- Set hour + reschedule on iOS
  const onPickHour = async (h) => {
    try {
      setNotifyHour(h);
      await AsyncStorage.setItem(NOTIFY_HOUR_KEY, String(h));
      try { logEvent(getAnalytics(getApp()), 'settings_notify_hour_set', { hour_24: h }); } catch {}
      try { await rescheduleAll(items || [], h); } catch {}
    } finally {
      setHourOpen(false);
      try { logEvent(getAnalytics(getApp()), 'settings_notify_hour_close', { via: 'pick' }); } catch {}
    }
  };

  async function onGetMoreScans() {
    if (adLoading) return;           // re-entry guard
    setAdLoading(true);

    try {
      const r = rewardedRef.current;

      // log button tap
      try {
        const ga = getAnalytics(getApp());
        logEvent(ga, 'settings_more_scans_click', { ad_ready: adReady, scans_left: scansLeft });
      } catch {}

      if (adReady) {
        try {
          const ga = getAnalytics(getApp());
          logEvent(ga, 'rewarded_show_attempt', {});
          await r.show();
        } catch {
          Alert.alert('更多扫描', '暂无可用广告，请稍后重试。');
          try {
            const ga = getAnalytics(getApp());
            logEvent(ga, 'rewarded_show_failed', {});
          } catch {}
        }
        return; // finally will reset adLoading
      }

      // Daily +1 fallback
      const last = Number((await AsyncStorage.getItem(DAILY_KEY)) || 0);
      const now = Date.now();

      if (now - last >= DAILY_COOLDOWN_MS) {
        try { grantBonusScans(1); } catch {}
        await AsyncStorage.setItem(DAILY_KEY, String(now));
        try {
          const ga = getAnalytics(getApp());
          logEvent(ga, 'scan_bonus_daily', { amount: 1, scans_left_after: scansLeft + 1 });
        } catch {}
        Alert.alert('更多扫描', '已获得今日 +1 次扫描。');
      } else {
        const msLeft = DAILY_COOLDOWN_MS - (now - last);
        const hrs = Math.max(1, Math.ceil(msLeft / 3600000));
        try {
          const ga = getAnalytics(getApp());
          logEvent(ga, 'scan_bonus_daily_cooldown', { hours_left: hrs });
        } catch {}
        Alert.alert('更多扫描', `今日 +1 已领取，约 ${hrs} 小时后再试。`);
      }

      setTimeout(() => r.load(), 300);
    } finally {
      setAdLoading(false);
    }
  }

  // ---- EXPORT: items + categories
  async function onExportZip() {
    let baseDir = '';
    let imagesDir = '';
    let zipPath = '';
    try {
      // log export click
      try { logEvent(getAnalytics(getApp()), 'settings_export_click', {}); } catch {}

      setBusy(true);
      const ts = nowStamp();

      baseDir =
        Platform.OS === 'ios'
          ? `${RNFS.TemporaryDirectoryPath}useby_export_${ts}`
          : `${RNFS.CachesDirectoryPath}/useby_export_${ts}`;
      imagesDir = `${baseDir}/images`;
      if (await RNFS.exists(baseDir)) await RNFS.unlink(baseDir);
      await RNFS.mkdir(baseDir);
      await RNFS.mkdir(imagesDir);

      // categories for name lookup
      const categoriesForExport = (await loadCategories()) || [];

      // items → manifest with category as NAME only (no categoryName, no custom:cat_*)
      const manifest = [];
      for (let i = 0; i < (items?.length || 0); i++) {
        const it = items[i];
        const picPath = await copyImageTo(imagesDir, it.iconUri || it.photoUri || '', i);

        const base = toManifestItem(it, picPath);
        const { categoryIconKey, categoryName, ...rest } = base;

        let categoryOut = '';
        const k = String(base.category || it.categoryIconKey || '').trim();

        if (k) {
          const rec = ICONS?.find(x =>
            x.key?.toLowerCase?.() === k.toLowerCase() ||
            (x.label && x.label.toLowerCase() === k.toLowerCase())
          );
          if (rec) {
            categoryOut = rec.label || rec.key;
          } else if (k.startsWith('custom:')) {
            const id = k.slice('custom:'.length);
            const hit = categoriesForExport.find(c => String(c.id) === String(id));
            categoryOut = hit?.name || '';
          } else {
            categoryOut = k; // already a name
          }
        }

        manifest.push({ ...rest, category: categoryOut });
      }

      // categories → manifest
      const manifestCats = [];
      for (let i = 0; i < categoriesForExport.length; i++) {
        const c = categoriesForExport[i];
        const iconPath = await copyCategoryIconTo(imagesDir, c.iconUri || '', c.name || `cat_${i}`, i);
        manifestCats.push(toManifestCategory(c, iconPath));
      }

      const manifestPath = `${baseDir}/manifest.json`;
      await RNFS.writeFile(
        manifestPath,
        JSON.stringify({ version: 2, items: manifest, categories: manifestCats }, null, 2),
        'utf8'
      );
      zipPath =
        Platform.OS === 'ios'
          ? `${RNFS.TemporaryDirectoryPath}useby_export_${ts}.zip`
          : `${RNFS.CachesDirectoryPath}/useby_export_${ts}.zip`;
      const zipped = await zip(baseDir, zipPath);

      // success log
      try {
        const ga = getAnalytics(getApp());
        logEvent(ga, 'settings_export_done', {
          items: manifest.length,
          categories: manifestCats.length,
        });
      } catch {}

      await Share.share({
        url: Platform.OS === 'ios' ? zipped : `file://${zipped}`,
        title: 'UseBy 导出（.zip）',
        message: 'UseBy 导出文件（.zip）',
      });
    } catch (e) {
      console.warn('Export ZIP failed:', e);
      try {
        const ga = getAnalytics(getApp());
        logEvent(ga, 'settings_export_failed', { message: String(e?.message || e) });
      } catch {}
      Alert.alert('导出失败', String(e?.message || e));
    } finally {
      await safeRm(baseDir);
      await safeRm(imagesDir);
      await safeRm(zipPath);
      setBusy(false);
    }
  }

  // ---- IMPORT: items + categories (dedupe by category name)
  async function onImportZip() {
    let releaseAccess = null;
    let zipLocalPath = '';
    let extractDir = '';
    try {
      // log import click
      try { logEvent(getAnalytics(getApp()), 'settings_import_click', {}); } catch {}

      setBusy(true);

      const zipTypes = [
        DocumentPicker.types.zip ?? 'public.zip-archive',
        'com.pkware.zip-archive',
        'application/zip',
        'application/x-zip-compressed',
        'application/octet-stream',
        DocumentPicker.types.allFiles,
      ];
      const file = await DocumentPicker.pickSingle({
        type: zipTypes,
        allowMultiSelection: false,
        mode: 'open',
        copyTo: 'cachesDirectory',
        presentationStyle: 'fullScreen',
      });
      if (Platform.OS === 'ios' && RNFS.startAccessingSecurityScopedResource) {
        try { releaseAccess = await RNFS.startAccessingSecurityScopedResource(file.uri); } catch {}
      }

      zipLocalPath = (file.fileCopyUri || file.uri || '').replace('file://', '');
      if (!zipLocalPath) throw new Error('无法解析 ZIP 本地路径');
      extractDir =
        Platform.OS === 'ios'
          ? `${RNFS.TemporaryDirectoryPath}useby_import_${nowStamp()}`
          : `${RNFS.CachesDirectoryPath}/useby_import_${nowStamp()}`;
      if (await RNFS.exists(extractDir)) await RNFS.unlink(extractDir);
      await RNFS.mkdir(extractDir);
      await unzip(zipLocalPath, extractDir);

      const manifestPath = `${extractDir}/manifest.json`;
      if (!(await RNFS.exists(manifestPath))) throw new Error('ZIP 中未找到 manifest.json');
      const content = await RNFS.readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(content);
      const itemsArr = Array.isArray(parsed) ? parsed : parsed?.items;
      const catsArr = Array.isArray(parsed?.categories) ? parsed.categories : [];
      if (!Array.isArray(itemsArr)) throw new Error('清单格式无效');

      // pre-log the counts we detected
      try {
        const ga = getAnalytics(getApp());
        logEvent(ga, 'settings_import_read', {
          items: itemsArr?.length ?? 0,
          categories: catsArr?.length ?? 0,
        });
      } catch {}

      const mappedItems = [];
      for (let i = 0; i < itemsArr.length; i++) {
        mappedItems.push(await fromManifestItemPersistent(extractDir, itemsArr[i], i));
      }

      const existingCats = (await loadCategories()) || [];
      const existingNames = new Set(
        existingCats.map((c) => (c?.name || '').trim().toLowerCase()).filter(Boolean)
      );

      const importedCats = [];
      for (let i = 0; i < catsArr.length; i++) {
        const { name, iconUri } = await fromManifestCategoryPersistent(extractDir, catsArr[i], i);
        const key = (name || '').trim().toLowerCase();
        if (!key || existingNames.has(key)) continue; // unique by name
        importedCats.push({ id: `cat_${nowStamp()}_${i}`, name, iconUri });
        existingNames.add(key);
      }

      await safeRm(extractDir);
      await safeRm(zipLocalPath);
      extractDir = '';
      zipLocalPath = '';

      Alert.alert(
        '导入数据？',
        `这将添加 ${mappedItems.length} 个项目`
          + (importedCats.length ? `，以及 ${importedCats.length} 个分类` : '')
          + ' 到你的列表。',
        [
          {
            text: '取消',
            style: 'cancel',
            onPress: () => {
              try {
                const ga = getAnalytics(getApp());
                logEvent(ga, 'settings_import_cancel', {});
              } catch {}
            },
          },
          {
            text: '添加',
            onPress: async () => {
              try {
                try {
                  const ga = getAnalytics(getApp());
                  logEvent(ga, 'settings_import_confirm', {
                    items: mappedItems.length,
                    categories: importedCats.length,
                  });
                } catch {}

                // 1) Persist categories first
                if (importedCats.length) {
                  await saveCategories([...(existingCats || []), ...importedCats]);
                }

                // 2) Use NAME -> ID mapping to set each item's categoryIconKey
                const finalCats = (await loadCategories()) || [];
                const norm = (s='') => s.toString().toLowerCase().replace(/[^a-z0-9]/g,'');
                const nameToId = new Map(finalCats.map(c => [norm((c?.name || '').trim()), String(c.id)]));

                mappedItems.forEach((it) => {
                  const raw =
                    (typeof it.category === 'string' && it.category.trim()) ? it.category :
                    (typeof it.categoryIconKey === 'string' && it.categoryIconKey.trim()) ? it.categoryIconKey :
                    '';

                  if (!raw) { it.categoryIconKey = null; return; }

                  let candidate = String(raw).trim();

                  const n = norm(candidate);
                  if (_ICON_KEYS.has(n)) { it.categoryIconKey = candidate; return; }
                  if (_LABEL_TO_KEY.has(n)) { it.categoryIconKey = _LABEL_TO_KEY.get(n); return; }

                  if (candidate.startsWith('custom:')) candidate = candidate.slice(7).trim();

                  const id = nameToId.get(norm(candidate));
                  it.categoryIconKey = id ? `custom:${id}` : null;
                });

                // cleanup temp hint field
                mappedItems.forEach((it) => { try { delete it.categoryNameHint; } catch {} });

                // 3) Add items (normalized)
                if (mappedItems.length && typeof addMultipleItems === 'function') {
                  addMultipleItems(mappedItems);
                } else if (mappedItems.length && typeof replaceAllItems === 'function') {
                  replaceAllItems([...(items || []), ...mappedItems]);
                }

                try {
                  const ga = getAnalytics(getApp());
                  logEvent(ga, 'settings_import_done', {
                    items_added: mappedItems.length,
                    categories_added: importedCats.length,
                  });
                } catch {}

                Alert.alert(
                  '已导入',
                  `已添加 ${mappedItems.length} 个项目和 ${importedCats.length} 个分类。`
                );
              } catch (e) {
                try {
                  const ga = getAnalytics(getApp());
                  logEvent(ga, 'settings_import_failed', { message: String(e?.message || e) });
                } catch {}
                Alert.alert('导入失败', String(e?.message || e));
              }
            },
          },
        ]
      );
    } catch (e) {
      if (DocumentPicker.isCancel(e)) return;
      console.warn('Import ZIP failed:', e);
      try {
        const ga = getAnalytics(getApp());
        logEvent(ga, 'settings_import_failed', { message: String(e?.message || e) });
      } catch {}
      Alert.alert('导入失败', String(e?.message || e));
    } finally {
      await safeRm(extractDir);
      await safeRm(zipLocalPath);
      if (releaseAccess && RNFS.stopAccessingSecurityScopedResource) {
        try { RNFS.stopAccessingSecurityScopedResource(file.uri); } catch {}
      }
      setBusy(false);
    }
  }

  const onOpenGuide = () => {
    try { logEvent(getAnalytics(getApp()), 'settings_user_guide_click', {}); } catch {}
    nav.navigate('UserGuide');
  };
  const onOpenContact = () => {
    try { logEvent(getAnalytics(getApp()), 'settings_contact_click', {}); } catch {}
    const email = 'ruiruicactus@hotmail.com';
    const subject = encodeURIComponent('UseBy 反馈');
    const body = encodeURIComponent('你好，\n\n我有一些反馈/问题：\n\n- \n- \n\n谢谢！');
    const url = `mailto:${email}?subject=${subject}&body=${body}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('无法打开邮箱应用', `请发送邮件至 ${email}`)
    );
  };
  const onOpenPrivacy = () => {
    try { logEvent(getAnalytics(getApp()), 'settings_privacy_click', { url: PRIVACY_URL }); } catch {}
    Linking.openURL(PRIVACY_URL).catch(() => Alert.alert('无法打开链接', PRIVACY_URL));
  };

  // ⬇️ wrappers to log row taps
  const onOpenCategories = useCallback(() => {
    try { logEvent(getAnalytics(getApp()), 'settings_categories_open', {}); } catch {}
    nav.navigate('EditCategories');
  }, [nav]);

  const onOpenHourPicker = useCallback(() => {
    try { logEvent(getAnalytics(getApp()), 'settings_notify_hour_open', {}); } catch {}
    setHourOpen(true);
  }, []);

  // ⬇️ CASCADE: if a custom category is deleted, clear it from items immediately
  useEffect(() => {
    const unsub = subscribeCategories(async (nextCats) => {
      try {
        const validIds = new Set((nextCats || []).map(c => String(c.id)));
        const arr = Array.isArray(items) ? items : [];
        let dirty = false;
        const nextItems = arr.map((it) => {
          const key = it?.categoryIconKey;
          if (typeof key === 'string' && key.startsWith('custom:')) {
            const id = key.slice(7);
            if (!validIds.has(id)) { dirty = true; return { ...it, categoryIconKey: null }; }
          }
          return it;
        });
        if (dirty && typeof replaceAllItems === 'function') {
          try {
            const ga = getAnalytics(getApp());
            logEvent(ga, 'settings_categories_cascade_cleared', {});
          } catch {}
          replaceAllItems(nextItems);
        }
      } catch {}
    });
    return () => { try { unsub && unsub(); } catch {} };
  }, [items, replaceAllItems]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        {/* spacer (left) */}
        <View style={styles.topBarSide} />

        <Text style={styles.topBarTitle}>设置</Text>

        {/* spacer (right) */}
        <View style={styles.topBarSide} />
      </View>

      {/* Export / Import / Custom Categories */}
      <View style={styles.section}>
        <Row
          icon="download-outline"
          title="导出（.zip）"
          subtitle="JSON + 图片文件夹"
          onPress={onExportZip}
          disabled={busy}
        />
        <Row
          icon="cloud-upload-outline"
          title="导入（.zip）"
          subtitle="从 ZIP 追加项目"
          onPress={onImportZip}
          disabled={busy}
        />
        <Row
          icon="pricetags-outline"
          title="分类"
          subtitle="添加、删除、重新排序"
          onPress={onOpenCategories}
        />
        <Row
          icon="alarm-outline"
          title="提醒时间"
          subtitle={formatHourLabel(notifyHour)}
          onPress={onOpenHourPicker}
        />
      </View>

      {/* More scans */}
      {/* <View style={styles.section}>
        <Row
          icon="videocam-outline"
          title={`更多扫描（剩余：${scansLeft}）`}
          subtitle={adReady ? '观看广告可获得 +5' : '广告不可用：可领取每日 +1'}
          onPress={onGetMoreScans}
          disabled={adLoading}
        />
      </View> */}

      {/* Help / Contact */}
      <View style={styles.section}>
        <Row icon="book-outline" title="使用指南" subtitle="如何使用 保质通" onPress={onOpenGuide} />
        <Row icon="mail-outline" title="联系支持" subtitle="发送邮件" onPress={onOpenContact} />
        <Row
          icon="shield-checkmark-outline"
          title="隐私政策"
          subtitle="查看我们如何处理数据"
          onPress={onOpenPrivacy}
        />
      </View>

      <Text style={styles.footer}>保质通 v1.0.0</Text>

      {/* Hour picker modal (0–23) */}
      <Modal
        visible={hourOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setHourOpen(false);
          try { logEvent(getAnalytics(getApp()), 'settings_notify_hour_close', { via: 'system' }); } catch {}
        }}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择小时（24 小时制）</Text>
              <TouchableOpacity
                onPress={() => {
                  setHourOpen(false);
                  try { logEvent(getAnalytics(getApp()), 'settings_notify_hour_close', { via: 'cancel' }); } catch {}
                }}
              >
                <Text style={styles.modalCancel}>取消</Text>
              </TouchableOpacity>
            </View>
            <View style={{ maxHeight: 320 }}>
              <ScrollView>
                {Array.from({ length: 24 }, (_, h) => (
                  <TouchableOpacity
                    key={h}
                    style={styles.hourRow}
                    onPress={() => onPickHour(h)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.hourText}>{`${String(h).padStart(2, '0')}:00`}</Text>
                    {notifyHour === h ? <Ionicons name="checkmark-circle" size={18} color="#10b981" /> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 56,                   // Home bar height
    paddingHorizontal: 12,        // Home bar horizontal padding
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarSide: {
    width: 44, height: 44,        // matches Home icon button footprint for perfect centering
  },
  topBarTitle: {
    fontSize: 16,                 // Home title sizing
    fontWeight: '800',
    color: '#111827',
  },

  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 16,
  },
  footer: { textAlign: 'center', color: '#9ca3af', marginTop: 10, marginBottom: 10 },

  // Hour picker modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden' },
  modalHeader: {
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  modalCancel: { color: '#ef4444', fontWeight: '700' },
  hourRow: {
    paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between'
  },
  hourText: { fontSize: 16, color: '#111827' },
});
