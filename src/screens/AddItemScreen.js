// src/screens/AddItemScreen.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, SafeAreaView,
  ScrollView, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
  StyleSheet, Platform, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import Tooltip from 'react-native-walkthrough-tooltip';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';

import { useData } from '../context/DataContext';
import { useBilling } from '../context/BillingContext';
import { analyzeImage, analyzeImageForName } from '../utils/api';
import { persistLocalImage, toDisplayUri } from '../utils/media';

import styles from './addItem/styles'; // default import; styles.js must export default
import {
  addDays, addSignedYMD, clampInt, clearTime, formatISO, parseISO, signedDiffYMD, signedDaysBetween,
} from '../utils/date';
import PickerSheet from './addItem/PickerSheet';
import NotesModal from './addItem/NotesModal';
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { recognizeLocalText } from '../utils/localText';

// shared helpers (factorized)
import { buttonIconSourceFromKey, keyForItem, iconSourceForItem, isValidCategoryKey } from '../utils/categoryIcons';
import { loadCategories, subscribeCategories } from '../storage/customCategories';
import { chooseScanSource, enforceOrder, markTime } from '../utils/scanHelpers';

const TIP_KEY = 'tip_seen_add_scan';
const LAST_SCAN_SOURCE_KEY = 'last_scan_source';
const LAST_ICON_SOURCE_KEY = 'last_icon_source';

const { height: SCREEN_H } = Dimensions.get('window');
const ROW_H = 56;

const norm = (s = '') => s.toString().trim().toLowerCase();

// 🔒 Feature switches for China build (不删除代码，只隐藏/禁用)
const SCAN_DISABLED = true;              // 扫描按钮不显示
const CATEGORY_PICK_DISABLED = false;     // 分类选择按钮禁用（但保留 UI 以备后用）

/** Minimal OCR-name fallback (no external dependency) */
function basicNameFromOCR(text) {
  if (!text) return '';
  const first = text.split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
  const cleaned = first.replace(/[:;,\-\s]+$/g, '');
  return cleaned.slice(0, 80);
}

/** Convert a Y/M/D lead to total days before a given expiry date */
function computeRemindDays(expiryDate, y, m, d) {
  if (!expiryDate) return clampInt(d || 0, 1, 36500);
  const before = addSignedYMD(
    expiryDate,
    -1,
    clampInt(y, 0, 120),
    clampInt(m, 0, 120),
    clampInt(d, 0, 366)
  );
  const days = Math.abs(signedDaysBetween(before, expiryDate));
  return clampInt(days, 1, 36500);
}

export default function AddItemScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { items, addItem, updateItem } = useData();
  const { canScan, countScan } = useBilling();

  const editingId = route?.params?.editId || null;
  const editingItem = useMemo(
    () => (editingId ? items.find((i) => i.id === editingId) : null),
    [editingId, items]
  );

  // 🔹 screen open/close analytics
  useFocusEffect(
    React.useCallback(() => {
      const start = Date.now();
      try { logEvent(getAnalytics(getApp()), 'add_item_open', { is_edit: !!editingId }); } catch {}
      return () => {
        try { logEvent(getAnalytics(getApp()), 'add_item_close', { is_edit: !!editingId, duration_ms: Date.now() - start }); } catch {}
      };
    }, [editingId])
  );

  const [name, setName] = useState(editingItem?.name || '');
  const [photoUri, setPhotoUri] = useState(editingItem?.photoUri || editingItem?.iconUri || '');
  const [notes, setNotes] = useState(editingItem?.notes || '');

  const [productDate, setProductDate] = useState(
    editingItem?.productDate ? parseISO(editingItem.productDate) : clearTime(new Date())
  );
  const [expiryDate, setExpiryDate] = useState(
    editingItem?.expiryDate ? parseISO(editingItem.expiryDate) : addDays(productDate, 7)
  );

  const { sign: initSign, y: initY, m: initM, d: initD } = signedDiffYMD(productDate, expiryDate);
  const [durSign, setDurSign] = useState(initSign);
  const [durY, setDurY] = useState(initY);
  const [durM, setDurM] = useState(initM);
  const [durD, setDurD] = useState(initD);

  function approxYMDFromDays(totalDays) {
    const d0 = Math.max(0, totalDays | 0);
    const y = Math.floor(d0 / 365);
    const remAfterY = d0 - y * 365;
    const m = Math.floor(remAfterY / 30);
    const d = remAfterY - m * 30;
    return { y, m, d };
  }

  // ==== Remind (Y/M/D spinner like Duration) ====
  const initialRemindDays = Number.isFinite(editingItem?.remindDays)
    ? clampInt(editingItem.remindDays, 1, 36500)
    : 7;

  const approxInit = approxYMDFromDays(initialRemindDays);
  const [remindY, setRemindY] = useState(approxInit.y);
  const [remindM, setRemindM] = useState(approxInit.m);
  const [remindD, setRemindD] = useState(approxInit.d);
  const [remindDays, setRemindDays] = useState(initialRemindDays);

  // keep remindDays synced whenever Y/M/D or expiry changes
  useEffect(() => {
    setRemindDays(computeRemindDays(expiryDate, remindY, remindM, remindD));
  }, [expiryDate, remindY, remindM, remindD]);

  // category key can be 'none' | builtin key | custom:<id> | name
  const [categoryIconKey, setCategoryIconKey] = useState(editingItem?.categoryIconKey || 'none');

  // load categories for icon rendering (and keep them live via subscription)
  const [cats, setCats] = useState([]);
  const [catsLoaded, setCatsLoaded] = useState(false); // ← ensure we don’t clear before they load

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await loadCategories();
        if (mounted) {
          setCats(Array.isArray(list) ? list : []);
          setCatsLoaded(true);
        }
      } catch {}
    })();
    const unsub = subscribeCategories((next) => {
      if (!mounted) return;
      const arr = Array.isArray(next) ? next : [];
      setCats(arr);
      setCatsLoaded(true);
    });
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  // Resolve icon for the button — robust to 'custom:<id>' or plain name
  const previewIconSource = useMemo(() => {
    const k = (categoryIconKey || '').trim();
    if (!k || k === 'none') return null;

    // Use shared helper first
    const viaHelper = buttonIconSourceFromKey(k, cats);
    if (viaHelper) return viaHelper;

    // Local fallbacks (in case helper misses)
    if (k.startsWith('custom:')) {
      const id = k.slice(7);
      const hit = cats.find(c => String(c.id) === String(id));
      return hit?.iconUri ? { uri: toDisplayUri(hit.iconUri) } : null;   // ⭐ rebase here
    }
    // name-only
    const byName = cats.find(c => norm(c.name) === norm(k));
    return byName?.iconUri ? { uri: toDisplayUri(byName.iconUri) } : null; // ⭐ and here
  }, [categoryIconKey, cats]);

  // Guard: clear ONLY if the key is truly invalid (don't clear name-only/no-icon categories)
  useEffect(() => {
    if (!catsLoaded) return;
    const k = (categoryIconKey || '').trim();
    if (!k || k === 'none') return;

    if (isValidCategoryKey(k, cats)) return; // now accepts built-ins like "petfood", "shampoo"
    try { logEvent(getAnalytics(getApp()), 'add_item_category_cleared_after_delete', { prev_key: k }); } catch {}
    setCategoryIconKey('none');
  }, [catsLoaded, categoryIconKey, cats]);

  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [analyzingIcon, setAnalyzingIcon] = useState(false);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null);
  const [tempDate, setTempDate] = useState(productDate);
  const [tempNumber, setTempNumber] = useState(7);
  const [tempSign, setTempSign] = useState(1);
  const [tempY, setTempY] = useState(0);
  const [tempM, setTempM] = useState(0);
  const [tempD, setTempD] = useState(0);
  const [notesVisible, setNotesVisible] = useState(false);
  const [showScanTip, setShowScanTip] = useState(false);

  const scanCancelRef = useRef({ canceled: false, controller: null });
  const savedRef = useRef(false);

  // 🔹 category sheet state/handlers
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [tempCatKey, setTempCatKey] = useState('none');

  const openCatSheet = () => {
    if (CATEGORY_PICK_DISABLED) return; // 禁用时不打开
    try { logEvent(getAnalytics(getApp()), 'add_item_category_open', {}); } catch {}
    const k = (categoryIconKey || 'none').trim();
    // If we stored a plain name, map it to the row’s stable key so selection highlights correctly
    let initialKey = k;
    if (k && k !== 'none' && !k.startsWith('custom:')) {
      const hit = cats.find(c => norm(c.name) === norm(k));
      if (hit) initialKey = keyForItem(hit);
    }
    setTempCatKey(initialKey);
    setCatSheetOpen(true);
  };
  const closeCatSheet = () => setCatSheetOpen(false);
  const onDoneCat = () => {
    setCategoryIconKey(tempCatKey || 'none');
    try { logEvent(getAnalytics(getApp()), 'add_item_category_pick', { category_key: tempCatKey || 'none' }); } catch {}
    setCatSheetOpen(false);
  };
  const isRowSelected = (it) => keyForItem(it) === tempCatKey;

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(TIP_KEY);
        if (!seen) { setShowScanTip(true); await AsyncStorage.setItem(TIP_KEY, '1'); }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const unsub = nav.addListener('beforeRemove', () => {
      if (savedRef.current) return;
      try { logEvent(getAnalytics(getApp()), 'add_item_cancel', {}); } catch {}
    });
    return unsub;
  }, [nav]);

  // ----- take/pick icon photo -----
  async function onTakeIconPhoto(preferLast = true) {
    try {
      try { logEvent(getAnalytics(getApp()), 'add_item_icon_click', {}); } catch {}
      const src = await chooseScanSource(preferLast, LAST_ICON_SOURCE_KEY);
      try {
        logEvent(getAnalytics(getApp()), 'add_item_icon_source', {
          source: src === 'Take Photo' ? 'camera' : src === 'Pick Photo' ? 'library' : 'cancel'
        });
      } catch {}
      if (src === 'Cancel') return;
      await AsyncStorage.setItem(LAST_ICON_SOURCE_KEY, src === 'Take Photo' ? 'camera' : 'library');

      const res = src === 'Take Photo'
        ? await launchCamera({ mediaType: 'photo', includeBase64: false, quality: 0.9, maxWidth: 2000, maxHeight: 2000, saveToPhotos: false })
        : await launchImageLibrary({ mediaType: 'photo', includeBase64: false, quality: 0.9, maxWidth: 2000, maxHeight: 2000, selectionLimit: 1 });

      if (res?.didCancel) return;
      const asset = res?.assets?.[0];
      if (!asset?.uri) { Alert.alert('照片错误', res?.errorMessage || '无法选择照片。'); return; }

      const persisted = await persistLocalImage(asset.uri);
      setPhotoUri(persisted || '');
      try { logEvent(getAnalytics(getApp()), 'add_item_icon_set', { has_photo: persisted ? 1 : 0 }); } catch {}
    } catch (e) { Alert.alert('照片错误', String(e?.message || e)); }
  }

  function cancelScan() {
    try {
      scanCancelRef.current.canceled = true;
      scanCancelRef.current.controller?.abort?.();
      logEvent(getAnalytics(getApp()), 'add_item_scan_cancel', {});
    } catch {}
    setScanning(false);
    setAnalyzingIcon(false);
  }

  // ----- SCAN (代码保留但不显示入口) -----
  async function onScan(preferLast = true) {
    if (SCAN_DISABLED) return; // 已禁用
    if (scanning) { cancelScan(); return; }
    try { logEvent(getAnalytics(getApp()), 'add_item_scan_click', {}); } catch {}

    if (!canScan()) {
      Alert.alert(
        '扫描次数已用完',
        '本月可用扫描次数已用尽。前往设置获取更多扫描次数或等待下月重置。',
        [{ text:'取消', style:'cancel' }, { text:'打开设置', onPress: () => nav.navigate('Root', { screen: 'Settings' }) }]
      );
      return;
    }

    scanCancelRef.current = { canceled: false, controller: typeof AbortController !== 'undefined' ? new AbortController() : null };
    const overallStart = Date.now();

    try {
      const t1 = overallStart;
      const src = await chooseScanSource(preferLast, LAST_SCAN_SOURCE_KEY);
      let t2 = markTime('chooseScanSource', t1);
      try {
        logEvent(getAnalytics(getApp()), 'add_item_scan_source', {
          source: src === 'Take Photo' ? 'camera' : src === 'Pick Photo' ? 'library' : 'cancel'
        });
      } catch {}
      if (scanCancelRef.current.canceled || src === 'Cancel') return;

      await AsyncStorage.setItem(LAST_SCAN_SOURCE_KEY, src === 'Take Photo' ? 'camera' : 'library');
      setScanning(true);

      const pickerPromise = src === 'Take Photo'
        ? launchCamera({ mediaType: 'photo', includeBase64: false, quality: 0.5, maxWidth: 1024, maxHeight: 1024, saveToPhotos: false })
        : launchImageLibrary({ mediaType: 'photo', includeBase64: false, quality: 0.5, maxWidth: 1400, maxHeight: 1400, selectionLimit: 1 });

      const res = await pickerPromise;
      let t3 = markTime('imagePicker', t2);
      if (scanCancelRef.current.canceled || res?.didCancel) return;

      const asset = res.assets?.[0];
      if (!asset?.uri) { if (!scanCancelRef.current.canceled) Alert.alert('扫描失败','未返回图片地址。'); return; }

      // --- Apple Vision quick OCR (iOS only)
      let localText = { text: '', hasText: false, conf: 0 };
      try {
        if (Platform.OS === 'ios') {
          localText = await recognizeLocalText(asset.uri, { timeoutMs: 550 });
          markTime('localText(AppleVision)', t3);
        }
      } catch {}

      // --- Call OpenAI endpoints in parallel:
      const [nameRes, datesRes] = await Promise.allSettled([
        analyzeImageForName({ uri: asset.uri }, { signal: scanCancelRef.current.controller?.signal }),
        analyzeImage({ uri: asset.uri }, { signal: scanCancelRef.current.controller?.signal }),
      ]);

      // Dates?
      let gotPD = false, gotED = false, gotBB = false;
      if (datesRes.status === 'fulfilled') {
        const analyzed = datesRes.value;
        gotPD = analyzed?.productionDateISO && /^\d{4}-\d{2}-\d{2}$/.test(analyzed.productionDateISO);
        gotED = analyzed?.expiryDateISO    && /^\d{4}-\d{2}-\d{2}$/.test(analyzed.expiryDateISO);
        gotBB = analyzed?.bestBeforeDateISO&& /^\d{4}-\d{2}-\d{2}$/.test(analyzed.bestBeforeDateISO);

        let nextPD = productDate, nextED = expiryDate;
        if (gotPD) {
          const newPD = clearTime(parseISO(analyzed.productionDateISO));
          if (!isNaN(newPD)) nextPD = newPD;
        }
        if (gotED || gotBB) {
          const dISO = analyzed?.expiryDateISO || analyzed?.bestBeforeDateISO;
          const newED = clearTime(parseISO(dISO));
          if (!isNaN(newED)) nextED = newED;
        }
        const [pdFixed, edFixed] = enforceOrder(nextPD, nextED);
        setProductDate(pdFixed); setExpiryDate(edFixed);
        const sdiff = signedDiffYMD(pdFixed, edFixed); setDurSign(sdiff.sign); setDurY(sdiff.y); setDurM(sdiff.m); setDurD(sdiff.d);
        markTime('analyzeImage(dates-only)', t3);
      }

      // Text? (AppleVision OR OpenAI)
      const appleVisionText = (localText?.hasText && localText?.text) ? localText.text : '';
      let openAIText = '';
      let openAIName = '';
      if (nameRes.status === 'fulfilled') {
        openAIName = (nameRes.value?.name || '').trim();
        openAIText =
          (nameRes.value?.text || nameRes.value?.ocrText || nameRes.value?.fullText || '').trim();
      }

      const textFound = !!appleVisionText || !!openAIName || !!openAIText;

      // If NO DATES but TEXT FOUND → set name from text (prefer AppleVision line, then OpenAI name/text)
      if (!gotPD && !gotED && !gotBB && textFound && !name.trim()) {
        const fromApple = appleVisionText ? basicNameFromOCR(appleVisionText) : '';
        const fromOpenAI = openAIName || (openAIText ? basicNameFromOCR(openAIText) : '');
        const finalName = (fromApple || fromOpenAI || '').trim();
        if (finalName) setName(finalName);
      }

      try { countScan({ method: 'ocr', hasPhoto: asset?.uri ? 1 : 0 }); logEvent(getAnalytics(getApp()), 'add_item_scan_complete', { success: 1 }); } catch {}
    } catch (e) {
      if (!scanCancelRef.current.canceled) {
        console.error(e); Alert.alert('扫描失败', String(e?.message || e));
        try { logEvent(getAnalytics(getApp()), 'add_item_scan_complete', { success: 0 }); } catch {}
      }
    } finally {
      markTime('TOTAL onScan', overallStart);
      setScanning(false);
      scanCancelRef.current.controller = null;
    }
  }

  // date pickers
  const openProductPicker = () => {
    try { logEvent(getAnalytics(getApp()), 'add_item_product_open', {}); } catch {}
    setPickerTarget('product');
    setTempDate(productDate || clearTime(new Date()));
    setPickerVisible(true);
  };
  const openExpiryPicker = () => {
    try { logEvent(getAnalytics(getApp()), 'add_item_expiry_open', {}); } catch {}
    setPickerTarget('expiry');
    setTempDate(expiryDate || addDays(productDate || clearTime(new Date()), 1));
    setPickerVisible(true);
  };
  const openDurationPicker = () => {
    try { logEvent(getAnalytics(getApp()), 'add_item_duration_open', {}); } catch {}

    const totalDays = Math.abs(signedDaysBetween(productDate, expiryDate));
    const useSign = durSign === -1 ? -1 : 1;
    const useY = Math.max(0, durY || 0);
    const useM = Math.max(0, durM || 0);
    const useD = Math.max(0, durD || 0);

    setPickerTarget('duration');
    setTempSign(useSign);
    if (totalDays === 0 && useY === 0 && useM === 0 && useD === 0) {
      setTempY(0); setTempM(0); setTempD(7);
    } else {
      setTempY(useY); setTempM(useM); setTempD(useD);
    }
    setPickerVisible(true);
  };

  // >>> Remind picker now uses the same Y/M/D spinners as Duration <<<
  const openRemindPicker = () => {
    try { logEvent(getAnalytics(getApp()), 'add_item_remind_open', {}); } catch {}
    setPickerTarget('remind');
    setTempSign(1);
    setTempY(remindY);
    setTempM(remindM);
    setTempD(remindD);
    setPickerVisible(true);
  };

  const closePicker = () => { setPickerVisible(false); setPickerTarget(null); };

  function confirmPicker() {
    if (pickerTarget === 'product') {
      const [pd, ed] = enforceOrder(clearTime(tempDate), expiryDate);
      setProductDate(pd); setExpiryDate(ed);
      const sdiff = signedDiffYMD(pd, ed); setDurSign(sdiff.sign); setDurY(sdiff.y); setDurM(sdiff.m); setDurD(sdiff.d);
      try { logEvent(getAnalytics(getApp()), 'add_item_product_set', { date: formatISO(pd) }); } catch {}
    } else if (pickerTarget === 'expiry') {
      const [pd, ed] = enforceOrder(productDate, clearTime(tempDate));
      setProductDate(pd); setExpiryDate(ed);
      const sdiff = signedDiffYMD(pd, ed); setDurSign(sdiff.sign); setDurY(sdiff.y); setDurM(sdiff.m); setDurD(sdiff.d);
      try { logEvent(getAnalytics(getApp()), 'add_item_expiry_set', { date: formatISO(ed) }); } catch {}
    } else if (pickerTarget === 'duration') {
      const y = clampInt(tempY, 0, 120), m = clampInt(tempM, 0, 120), d = clampInt(tempD, 0, 366), s = tempSign === -1 ? -1 : 1;
      const newExpiry = addSignedYMD(productDate, s, y, m, d);
      const [pd, ed] = enforceOrder(productDate, newExpiry);
      setProductDate(pd); setExpiryDate(ed);
      const sdiff = signedDiffYMD(pd, ed); setDurSign(sdiff.sign); setDurY(sdiff.y); setDurM(sdiff.m); setDurD(sdiff.d);
      try { logEvent(getAnalytics(getApp()), 'add_item_duration_set', { sign: s, y, m, d, total_days: sdiff.d }); } catch {}
    } else if (pickerTarget === 'remind') {
      const y = clampInt(tempY, 0, 120);
      const m = clampInt(tempM, 0, 120);
      const d = clampInt(tempD, 0, 366);
      setRemindY(y); setRemindM(m); setRemindD(d);
      const total = computeRemindDays(expiryDate, y, m, d);
      setRemindDays(total);
      try { logEvent(getAnalytics(getApp()), 'add_item_remind_set', { y, m, d, total_days: total }); } catch {}
    }

    closePicker();
  }

  function onSave() {
    if (!name.trim()) { Alert.alert('需要名称','请输入名称。'); return; }
    if (!expiryDate)  { Alert.alert('需要到期日期','请选择到期日期。'); return; }
    const finalPhoto = photoUri || editingItem?.photoUri || editingItem?.iconUri || '';
    const payload = {
      name: name.trim(), notes: notes.trim() || undefined,
      photoUri: finalPhoto || undefined, iconUri: finalPhoto || undefined,
      productDate: formatISO(productDate), expiryDate: formatISO(expiryDate),
      edibleDays: signedDiffYMD(productDate, expiryDate).d,
      categoryIconKey: categoryIconKey || 'none',
      // keep legacy numeric days for reminders, derived from Y/M/D relative to expiry
      remindDays,
    };
    try {
      logEvent(getAnalytics(getApp()), 'add_item_save_click', {
        is_edit: !!editingId,
        has_photo: finalPhoto ? 1 : 0,
        remind_days: remindDays,
        edible_days: payload.edibleDays
      });
    } catch {}
    setSaving(true);
    try {
      if (editingId) updateItem(editingId, payload); else addItem(payload);
      try { logEvent(getAnalytics(getApp()), 'add_item_saved', { is_edit: !!editingId }); } catch {}
      savedRef.current = true; nav.goBack();
    }
    catch (e) { console.error(e); Alert.alert('保存失败','请重试。'); }
    finally { setSaving(false); }
  }

  // Category sheet (local styles here)
  const cs = stylesForCategorySheet;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* top row */}
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.bigIcon}
            onPress={() => onTakeIconPhoto(true)}
            onLongPress={() => onTakeIconPhoto(false)}
            delayLongPress={250}
          >
            {photoUri ? (
              <Image source={{ uri: toDisplayUri(photoUri) }} style={styles.bigImg} />
            ) : analyzingIcon ? (
              <ActivityIndicator />
            ) : (
              <Icon name="camera-outline" size={48} color="#6b7280" />
            )}
          </TouchableOpacity>

          <View style={styles.rightCol}>
            <TextInput
              style={[styles.nameInput, styles.requiredField]}
              value={name}
              onChangeText={setName}
              onEndEditing={(e) => { try { const val = e?.nativeEvent?.text ?? name ?? ''; logEvent(getAnalytics(getApp()), 'add_item_name_input', { len: (val || '').length }); } catch {} }}
              placeholder="名称"
              returnKeyType="done"
            />

            {/* 操作按钮区：隐藏扫描按钮；分类按钮与名称输入同宽且禁用 */}
            <View style={[styles.rightButtons, { flexDirection: 'row' }]}>
              {/* 扫描按钮入口隐藏，但代码保留 */}
              {!SCAN_DISABLED && (
                <View style={{ flex: 1 }}>
                  <Tooltip isVisible={showScanTip} content={<Text>点击扫描，自动填写名称和日期</Text>} placement="top" onClose={() => setShowScanTip(false)}>
                    <TouchableOpacity style={[styles.actionBtn, styles.scanBtn]} onPress={() => { setShowScanTip(false); onScan(true); }} onLongPress={() => onScan(false)} delayLongPress={250}>
                      {scanning ? <ActivityIndicator color="#fff" /> : <Icon name="scan-outline" size={20} color="#fff" />}
                    </TouchableOpacity>
                  </Tooltip>
                </View>
              )}

              {/* 分类按钮：与名称输入同宽（占满整行），禁用 */}
              <View style={{ flex: 1, width: '100%' }}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { width: '100%', opacity: 0.5 } // 视觉禁用
                  ]}
                  onPress={openCatSheet}
                  disabled={CATEGORY_PICK_DISABLED}
                  pointerEvents={CATEGORY_PICK_DISABLED ? 'none' : 'auto'}
                >
                  {previewIconSource
                    ? (Image.resolveAssetSource(previewIconSource)?.uri
                        ? <Image source={previewIconSource} style={{ width: 28, height: 28, borderRadius: 6 }} />
                        : <Image source={previewIconSource} style={{ width: 22, height: 22 }} resizeMode="contain" />)
                    : <Icon name="pricetag-outline" size={18} color="#111827" />
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Expiry date */}
        <View style={styles.formRow}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.requiredLabel}>到期日期</Text>
            <Icon name="alert-circle-outline" size={16} color="#111827" style={{ marginLeft: 1, position: 'relative', top: 3 }} />
          </View>
          <Pressable style={[styles.field, styles.requiredField]} onPress={openExpiryPicker}>
            <Icon name="calendar-outline" size={18} color="#111827" />
            <Text style={styles.fieldText}>{formatISO(expiryDate)}</Text>
          </Pressable>
        </View>

        {/* Duration */}
        <View style={styles.formRow}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.minorLabel}>保质期</Text>
            <Icon name="time-outline" size={14} color="#9ca3af" style={{ marginLeft: 1, position: 'relative', top: 3 }} />
          </View>
          <TouchableOpacity style={styles.fieldMinor} onPress={openDurationPicker}>
            <Icon name="time-outline" size={18} color="#6b7280" />
            <Text style={styles.fieldMinorText}>
              {`${durSign < 0 ? '−' : ''}${durY}年 ${durM}月 ${durD}天`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Product date */}
        <View style={styles.formRow}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.minorLabel}>生产日期</Text>
            <Icon name="cube-outline" size={14} color="#9ca3af" style={{ marginLeft: 1, position: 'relative', top: 3 }} />
          </View>
          <Pressable style={styles.fieldMinor} onPress={openProductPicker}>
            <Icon name="calendar-outline" size={18} color="#6b7280" />
            <Text style={styles.fieldMinorText}>{formatISO(productDate)}</Text>
          </Pressable>
        </View>

        {/* Remind */}
        <View style={styles.formRow}>
          <Text style={styles.minorLabel}>提醒我</Text>
          <TouchableOpacity style={styles.fieldMinor} onPress={openRemindPicker}>
            <Icon name="notifications-outline" size={18} color="#6b7280" />
            <Text style={styles.fieldMinorText}>
              {`提前 ${remindY}年 ${remindM}月 ${remindD}天`}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.minorLabel, { marginTop: 16 }]}>备注</Text>
        <TouchableOpacity
          style={[styles.inputMinor, styles.notes]}
          onPress={() => { try { logEvent(getAnalytics(getApp()), 'add_item_notes_open', {}); } catch {} setNotesVisible(true); }}
          activeOpacity={0.8}
        >
          <Text style={{ color: notes ? '#4b5563' : '#9ca3af', fontSize: 14 }}>{notes || '点击添加备注'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={onSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>保存</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Date/Duration/Remind picker modal */}
      <Modal
        transparent
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={closePicker}
      >
        <PickerSheet
          visible={pickerVisible}
          target={pickerTarget}
          productDate={productDate}
          tempDate={tempDate} setTempDate={(d) => setTempDate(clearTime(d))}
          tempNumber={tempNumber} setTempNumber={setTempNumber}
          tempSign={tempSign} setTempSign={setTempSign}
          tempY={tempY} setTempY={setTempY}
          tempM={tempM} setTempM={setTempM}
          tempD={tempD} setTempD={setTempD}
          onClose={closePicker}
          onConfirm={confirmPicker}
        />
      </Modal>

      <NotesModal
        visible={notesVisible}
        notes={notes}
        setNotes={setNotes}
        onClose={() => setNotesVisible(false)}
      />

      {/* Category sheet (no dim) */}
      <Modal visible={catSheetOpen} transparent animationType="slide" onRequestClose={closeCatSheet}>
        <TouchableWithoutFeedback onPress={closeCatSheet}>
          <View style={cs.sheetBackdrop} />
        </TouchableWithoutFeedback>
        <View style={cs.sheet}>
          <View style={cs.sheetHeader}>
            <TouchableOpacity onPress={closeCatSheet}><Text style={cs.sheetCancel}>取消</Text></TouchableOpacity>
            <Text style={cs.sheetTitle}>选择分类</Text>
            <TouchableOpacity onPress={onDoneCat}><Text style={cs.sheetDone}>完成</Text></TouchableOpacity>
          </View>
          <FlatList
            data={[{ id:'none', name:'无分类', isNone:true }, ...cats]}
            keyExtractor={(it) => String(it.id)}
            ItemSeparatorComponent={() => <View style={cs.sep} />}
            contentContainerStyle={{ paddingHorizontal:12, paddingBottom:12 }}
            getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
            renderItem={({ item }) => {
              const selected = isRowSelected(item);
              const src = iconSourceForItem(item);
              return (
                <TouchableOpacity style={cs.row} onPress={() => setTempCatKey(keyForItem(item))} activeOpacity={0.85}>
                  <View style={cs.rowLeft}>
                    <View style={cs.rowIconWrap}>
                      {src
                        ? (Image.resolveAssetSource(src)?.uri
                            ? <Image source={src} style={cs.rowIconFull} />
                            : <Image source={src} style={cs.rowIconSmall} />)
                        : item.isNone
                          ? <Icon name="ellipse-outline" size={18} color="#111827" />
                          : <Icon name="image-outline" size={18} color="#9ca3af" />
                      }
                    </View>
                    <Text style={cs.rowText} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <View style={cs.rowRight}>
                    {selected ? <View style={cs.checkBoxChecked}><Icon name="checkmark" size={14} color="#fff" /></View> : <View style={cs.checkBox} />}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Local styles for category sheet
const stylesForCategorySheet = StyleSheet.create({
  sheetBackdrop: { flex:1, backgroundColor:'transparent' },
  sheet: { height: Math.min(SCREEN_H * 0.88, 540), backgroundColor:'#fff', borderTopLeftRadius:16, borderTopRightRadius:16, borderTopWidth:1, borderColor:'#e5e7eb' },
  sheetHeader: { height:48, flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  sheetCancel: { color:'#ef4444', fontWeight:'700', fontSize:16 },
  sheetTitle:  { color:'#111827', fontWeight:'700', fontSize:16 },
  sheetDone:   { color:'#ef4444', fontWeight:'700', fontSize:16 },
  row: { height:56, flexDirection:'row', alignItems:'center', paddingHorizontal:8, backgroundColor:'#fff' },
  sep: { height:1, backgroundColor:'#f3f4f6', marginLeft:64 },
  rowLeft: { flexDirection:'row', alignItems:'center', flex:1, gap:10 },
  rowIconWrap: { width:36, height:36, borderRadius:8, backgroundColor:'#f3f4f6', alignItems:'center', justifyContent:'center', overflow:'hidden', marginLeft:6 },
  rowIconSmall: { width:24, height:24, resizeMode:'contain' },
  rowIconFull:  { width:36, height:36, resizeMode:'cover' },
  rowText: { color:'#111827', fontSize:16, flexShrink:1 },
  rowRight: { width:40, alignItems:'flex-end', paddingRight:6 },
  checkBox: { width:22, height:22, borderRadius:4, borderWidth:1, borderColor:'#cbd5e1', backgroundColor:'#fff' },
  checkBoxChecked: { width:22, height:22, borderRadius:4, backgroundColor:'#ef4444', alignItems:'center', justifyContent:'center' },
});
