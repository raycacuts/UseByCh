// src/screens/EditCategoriesScreen.js
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  SafeAreaView, // ⬅️ added for a proper top bar area
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Swipeable, PanGestureHandler, State as GHState } from 'react-native-gesture-handler';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { useNavigation } from '@react-navigation/native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';

import {
  loadCategories,
  addCategory,
  reorderCategories,
  removeCategory,
} from '../storage/customCategories';

import { ICONS } from '../icons';
import { useData } from '../context/DataContext';
import { toDisplayUri } from '../utils/media'; // ⭐ rebase saved URIs to current container for display

// 🔹 Analytics
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

const ROW_HEIGHT = 76;

const norm = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
const ICONS_BY_KEY = new Map((ICONS || []).map((i) => [norm(i.key), i.source]));
const ICONS_BY_LABEL = new Map((ICONS || []).map((i) => [norm(i.label || i.key), i.source]));

// --------- persistent media helpers (so category icons survive app updates) ----------
const MEDIA_DIR = `${RNFS.DocumentDirectoryPath}/useby_media`;
const stripFile = (u='') => u.replace(/^file:\/\//, '');
const extFromUri = (u='') => {
  const m = u.split('?')[0].match(/\.(\w{2,5})$/i);
  return m ? m[1].toLowerCase() : 'jpg';
};
async function ensureMediaDir() { try { await RNFS.mkdir(MEDIA_DIR); } catch {} }
async function persistLocalImageIfNeeded(srcUri) {
  if (!srcUri) return null;

  // Already persisted in our dir
  const plain = stripFile(srcUri);
  if (plain.startsWith(MEDIA_DIR)) return `file://${plain}`;

  await ensureMediaDir();
  const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${extFromUri(srcUri)}`;
  const destPath = `${MEDIA_DIR}/${destName}`;

  try {
    if (Platform.OS === 'ios' && srcUri.startsWith('ph://')) {
      // Copy from Photos library
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

function iconSourceFor(item) {
  // ⭐ Rebase saved Document URIs to the current container so they display after updates
  if (item?.iconUri) return { uri: toDisplayUri(item.iconUri) };
  const keyCandidate = norm(item?.builtinKey || item?.categoryIconKey);
  if (keyCandidate && ICONS_BY_KEY.has(keyCandidate)) return ICONS_BY_KEY.get(keyCandidate);
  const nameCandidate = norm(item?.name);
  if (nameCandidate) {
    if (ICONS_BY_LABEL.has(nameCandidate)) return ICONS_BY_LABEL.get(nameCandidate);
    if (ICONS_BY_KEY.has(nameCandidate)) return ICONS_BY_KEY.get(nameCandidate);
  }
  return null;
}

function EdgeBackSwipe({ enabled = true }) {
  const navigation = useNavigation();
  const onStateChange = ({ nativeEvent }) => {
    if (nativeEvent.state === GHState.END) {
      const { translationX, velocityX } = nativeEvent;
      if (translationX > 80 && velocityX > 300 && navigation.canGoBack()) {
        try { logEvent(getAnalytics(getApp()), 'edit_categories_back_swipe', {}); } catch {}
        navigation.goBack();
      }
    }
  };
  return (
    <PanGestureHandler
      enabled={enabled && Platform.OS === 'android'}
      onHandlerStateChange={onStateChange}
      activeOffsetX={20}
      failOffsetY={[-15, 15]}
    >
      <View style={s.backEdge} pointerEvents="box-only" />
    </PanGestureHandler>
  );
}

const Row = React.memo(function Row({ item, drag, isActive, onDelete }) {
  const safeLog = (name, params = {}) => {
    try { logEvent(getAnalytics(getApp()), name, params); } catch {}
  };

  const RightAction = () => (
    <TouchableOpacity
      style={s.swipeRight}
      activeOpacity={0.85}
      onPress={() => { safeLog('edit_categories_swipe_delete_tap', { id: item?.id || null }); onDelete(item.id); }}
    >
      <Ionicons name="trash-outline" size={22} color="#fff" />
    </TouchableOpacity>
  );

  const imgSource = iconSourceFor(item);
  const isUserIcon = !!item?.iconUri;

  return (
    <Swipeable
      renderRightActions={RightAction}
      rightThreshold={36}
      overshootRight={false}
      enabled={!isActive}
      onSwipeableOpen={(dir) => safeLog('edit_categories_swipe_open', { id: item?.id || null, dir: dir || 'right' })}
      onSwipeableClose={() => safeLog('edit_categories_swipe_close', { id: item?.id || null })}
    >
      <View style={[s.row, isActive && { opacity: 0.95 }]}>
        <View style={s.iconWrap}>
          {imgSource ? (
            <Image
              source={imgSource}
              style={isUserIcon ? s.iconFull : s.iconImg}
              fadeDuration={0}
            />
          ) : (
            <View style={[s.iconFull, s.iconPlaceholder]}>
              <Ionicons name="image-outline" size={20} color="#6b7280" />
            </View>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 10 }}>
          <Text style={s.name} numberOfLines={1}>{item.name}</Text>
        </View>

        <TouchableOpacity
          onLongPress={() => { try { logEvent(getAnalytics(getApp()), 'edit_categories_drag_start', { id: item?.id || null }); } catch {} ; drag(); }}
          delayLongPress={120}
          hitSlop={8}
          style={s.handle}
        >
          <Ionicons name="reorder-three-outline" size={26} color="#9ca3af" />
        </TouchableOpacity>
      </View>
    </Swipeable>
  );
}, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.name === next.item.name &&
  prev.item.iconUri === next.item.iconUri &&
  prev.item.builtinKey === next.item.builtinKey &&
  prev.item.categoryIconKey === next.item.categoryIconKey &&
  prev.isActive === next.isActive
);

export default function EditCategoriesScreen() {
  const [cats, setCats] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIconUri, setNewIconUri] = useState('');
  const listRef = useRef(null);

  const { items, replaceAllItems } = useData();
  const navigation = useNavigation();

  // screen open/close
  useEffect(() => {
    const start = Date.now();
    try { logEvent(getAnalytics(getApp()), 'edit_categories_open', {}); } catch {}
    return () => {
      try { logEvent(getAnalytics(getApp()), 'edit_categories_close', { duration_ms: Date.now() - start }); } catch {}
    };
  }, []);

  useEffect(() => {
    (async () => {
      const loaded = await loadCategories();
      setCats(loaded);
      try { logEvent(getAnalytics(getApp()), 'edit_categories_loaded', { count: Array.isArray(loaded) ? loaded.length : 0 }); } catch {}
    })();
  }, []);

  const pickIcon = useCallback(async () => {
    try { logEvent(getAnalytics(getApp()), 'edit_categories_pick_icon_open', {}); } catch {}
    const choice = await new Promise((resolve) => {
      Alert.alert('Icon image', 'Choose a source', [
        { text: 'Take Photo', onPress: () => resolve('camera') },
        { text: 'Pick Photo', onPress: () => resolve('library') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
      ]);
    });
    try { logEvent(getAnalytics(getApp()), 'edit_categories_pick_icon_choice', { choice }); } catch {}
    if (choice === 'cancel') return;

    const res =
      choice === 'camera'
        ? await launchCamera({ mediaType: 'photo', includeBase64: false, quality: 0.9 })
        : await launchImageLibrary({ mediaType: 'photo', includeBase64: false, quality: 0.9, selectionLimit: 1 });

    const asset = res?.assets?.[0];
    if (asset?.uri) {
      // ✅ persist to Documents/useby_media so it survives app updates
      let persisted = null;
      try { persisted = await persistLocalImageIfNeeded(asset.uri); } catch {}
      if (!persisted) {
        // Fallback to raw uri if persistence failed (e.g., permission), but warn once
        Alert.alert('Icon not saved', 'Using a temporary image path. It may be lost after updating the app.');
      }
      setNewIconUri(persisted || asset.uri);
      try { logEvent(getAnalytics(getApp()), 'edit_categories_pick_icon_set', { has_icon: 1, persisted: persisted ? 1 : 0 }); } catch {}
    } else {
      try { logEvent(getAnalytics(getApp()), 'edit_categories_pick_icon_set', { has_icon: 0 }); } catch {}
    }
  }, []);

  const onAdd = useCallback(async () => {
    try {
      try { logEvent(getAnalytics(getApp()), 'edit_categories_add_click', {}); } catch {}
      if (!newName.trim()) {
        Alert.alert('Name required', 'Please enter a category name.');
        return;
      }

      // Ensure we persist the chosen icon (in case user pasted a uri another way)
      let iconForSave = newIconUri;
      if (iconForSave && !stripFile(iconForSave).startsWith(MEDIA_DIR)) {
        try {
          const persisted = await persistLocalImageIfNeeded(iconForSave);
          if (persisted) iconForSave = persisted;
        } catch {}
      }

      const next = await addCategory({ name: newName.trim(), iconUri: iconForSave });
      setCats(next);
      try {
        logEvent(getAnalytics(getApp()), 'edit_categories_add_success', {
          name_len: newName.trim().length,
          has_icon: iconForSave ? 1 : 0,
        });
      } catch {}
      setNewName(''); setNewIconUri(''); setAddOpen(false);
    } catch (e) {
      try { logEvent(getAnalytics(getApp()), 'edit_categories_add_error', { message: String(e?.message || 'error') }); } catch {}
      Alert.alert('Cannot add', String(e?.message || e));
    }
  }, [newName, newIconUri]);

  // NAME-ONLY CASCADE: when deleting a category, clear just items that use that NAME.
  const onDelete = useCallback(async (id) => {
    try {
      const removed = cats.find(c => String(c.id) === String(id));
      const removedName = (removed?.name || '').trim();
      const removedNameNorm = removedName.toLowerCase();

      try { logEvent(getAnalytics(getApp()), 'edit_categories_delete', { name: removedName || null }); } catch {}

      const next = await removeCategory(id);
      setCats(next);

      if (!removedName) return;

      const arr = Array.isArray(items) ? items : [];
      let dirty = false;
      const nextItems = arr.map((it) => {
        const key = (it?.categoryIconKey || '').trim();
        const plain = (it?.category || '').trim();

        // match by NAME only (case-insensitive); set to empty string if matched
        const match =
          (key && key.toLowerCase() === removedNameNorm) ||
          (plain && plain.toLowerCase() === removedNameNorm);

        if (match) { dirty = true; return { ...it, categoryIconKey: '', category: '' }; }
        return it;
      });

      if (dirty && typeof replaceAllItems === 'function') {
        replaceAllItems(nextItems);
      }
    } catch (e) {
      Alert.alert('Cannot delete', String(e?.message || e));
    }
  }, [cats, items, replaceAllItems]);

  const keyExtractor = useCallback((it) => it.id, []);
  const getItemLayout = useCallback((_, index) => ({
    length: ROW_HEIGHT,
    offset: ROW_HEIGHT * index,
    index,
  }), []);

  const renderItem = useCallback(({ item, drag, isActive }) => (
    <Row item={item} drag={drag} isActive={isActive} onDelete={onDelete} />
  ), [onDelete]);

  return (
    <SafeAreaView style={s.container}>
      {/* Home-style top bar: ONLY size & style adjusted */}
      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => { try { logEvent(getAnalytics(getApp()), 'edit_categories_back_tap', {}); } catch {};  navigation.goBack(); }}
          style={s.iconBtn}
          hitSlop={{ top:8,bottom:8,left:8,right:8 }}
        >
          <Ionicons name="chevron-back" size={26} color="rgba(17,24,39,0.45)" />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>自定义分类</Text>
        <View style={s.iconBtn} />
      </View>

      <DraggableFlatList
        ref={listRef}
        data={cats}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        onDragBegin={(index) => { try { logEvent(getAnalytics(getApp()), 'edit_categories_drag_begin', { index: typeof index === 'number' ? index : null }); } catch {} }}
        onDragEnd={async ({ data }) => {
          setCats(data);
          try { logEvent(getAnalytics(getApp()), 'edit_categories_reorder', { count: data?.length ?? 0 }); } catch {}
          await reorderCategories(data.map(d => d.id));
        }}
        activationDistance={10}
        dragItemOverflow="hidden"
        renderPlaceholder={() => <View style={s.placeholder} />}
        autoscrollThreshold={99999}
        autoscrollSpeed={0}
        removeClippedSubviews={false}
        windowSize={15}
        initialNumToRender={20}
        ListHeaderComponent={<View style={{ height: 6 }} />}
        ListFooterComponent={<View style={{ height: 30 }} />}
        containerStyle={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <TouchableOpacity
        style={s.fab}
        onPress={() => { try { logEvent(getAnalytics(getApp()), 'edit_categories_add_open', {}); } catch {}; setAddOpen(true); }}
        activeOpacity={0.9}
      >
        <Ionicons name="add" size={22} color="#fff" />
      </TouchableOpacity>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>New Category</Text>

            <TouchableOpacity onPress={pickIcon} style={s.pickIcon} activeOpacity={0.85}>
              {newIconUri ? (
                <Image source={{ uri: newIconUri }} style={s.pickImg} fadeDuration={0} />
              ) : (
                <View style={[s.pickImg, s.iconPlaceholder]}>
                  <Ionicons name="camera-outline" size={20} color="#6b7280" />
                </View>
              )}
              <Text style={s.pickHint}>{newIconUri ? 'Change icon' : 'Choose icon'}</Text>
            </TouchableOpacity>

            <TextInput
              placeholder="Category name (unique)"
              value={newName}
              onChangeText={(t) => { setNewName(t); try { logEvent(getAnalytics(getApp()), 'edit_categories_name_change', { len: (t || '').trim().length }); } catch {} }}
              style={s.input}
              autoCapitalize="words"
              returnKeyType="done"
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                onPress={() => { try { logEvent(getAnalytics(getApp()), 'edit_categories_add_cancel', {}); } catch {}; setAddOpen(false); setNewName(''); setNewIconUri(''); }}
                style={[s.btn, s.btnGhost]}
              >
                <Text style={s.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onAdd} style={[s.btn, s.btnPrimary]}>
                <Text style={s.btnPrimaryText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <EdgeBackSwipe enabled />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  // Home-style top bar (size & style only)
  topBar: {
    height: 56,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    paddingHorizontal: 12,
    gap: 12,
    height: ROW_HEIGHT,
  },
  placeholder: {
    height: ROW_HEIGHT,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconImg: {
    width: 36,
    height: 36,
    borderRadius: 8,
    resizeMode: 'contain',
  },
  iconFull: {
    width: 52,
    height: 52,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  iconPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  name: { fontSize: 16, fontWeight: '700', color: '#111827' },
  handle: { paddingHorizontal: 6, paddingVertical: 8 },

  swipeRight: {
    width: 72,
    height: '100%',
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },

  fab: {
    position: 'absolute',
    right: 24,
    bottom: 40,
    backgroundColor: '#111827',
    borderRadius: 24,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  modalTitle: { fontWeight: '800', fontSize: 16, color: '#111827', marginBottom: 10 },
  pickIcon: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  pickImg: { width: 42, height: 42, borderRadius: 9, backgroundColor: '#f3f4f6' },
  pickHint: { color: '#6b7280' },

  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12,
    height: 42, fontSize: 16, color: '#111827', backgroundColor: '#fff', marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  btnGhost: { backgroundColor: '#f3f4f6' },
  btnGhostText: { color: '#111827', fontWeight: '700' },
  btnPrimary: { backgroundColor: '#111827' },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },

  backEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 16,
    backgroundColor: 'transparent',
  },
});
