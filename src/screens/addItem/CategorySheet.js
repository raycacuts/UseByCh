// src/screens/CategoryPickerScreen.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Platform
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { loadCategories } from '../storage/customCategories';
import { ICONS } from '../icons';
import styles from './styles';
// ---------- helpers: built-in icon lookup ----------
const norm = (s='') => s.toString().toLowerCase().replace(/[^a-z0-9]/g,'');
const ICONS_BY_KEY   = new Map((ICONS||[]).map(i => [norm(i.key), i.source]));
const ICONS_BY_LABEL = new Map((ICONS||[]).map(i => [norm(i.label || i.key), i.source]));

function iconSourceFor(item) {
  if (item?.iconUri) return { uri: item.iconUri };        // user-added icon
  const k = norm(item?.builtinKey || item?.categoryIconKey);
  if (k && ICONS_BY_KEY.has(k)) return ICONS_BY_KEY.get(k);
  const n = norm(item?.name);
  if (n) {
    if (ICONS_BY_LABEL.has(n)) return ICONS_BY_LABEL.get(n);
    if (ICONS_BY_KEY.has(n))   return ICONS_BY_KEY.get(n);
  }
  return null;
}

const ROW_H = 56; // spinner row height

export default function CategoryPickerScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const selectedKeyFromCaller = route.params?.selectedKey ?? 'none';
  const onPick = route.params?.onPick;

  const listRef = useRef(null);
  const [items, setItems] = useState([]);
  const [selIndex, setSelIndex] = useState(0);

  // Build the list once
  useEffect(() => {
    (async () => {
      const saved = await loadCategories(); // already seeds on first call
      // “No category” + saved categories
      const list = [
        { id:'none', name:'No category', builtinKey:'', iconUri:'', isNone:true },
        ...saved,
      ];
      setItems(list);

      // compute initial index from selectedKeyFromCaller
      const idx = Math.max(0,
        list.findIndex(it =>
          selectedKeyFromCaller === 'none'
            ? it.id === 'none'
            : selectedKeyFromCaller.startsWith('custom:')
              ? ('custom:'+it.id) === selectedKeyFromCaller
              : it.builtinKey === selectedKeyFromCaller || it.categoryIconKey === selectedKeyFromCaller
        )
      );
      setSelIndex(idx);
      // Snap to it
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset?.({ offset: idx * ROW_H, animated: false });
      });
    })();
  }, [selectedKeyFromCaller]);

  // Snap & set current on scroll end
  const onScrollEnd = useCallback((e) => {
    const o = e?.nativeEvent?.contentOffset?.y || 0;
    const idx = Math.round(o / ROW_H);
    if (idx !== selIndex) setSelIndex(idx);
    // snap
    listRef.current?.scrollToOffset?.({ offset: idx * ROW_H, animated: true });
  }, [selIndex]);

  const renderItem = ({ item, index }) => {
    const selected = index === selIndex;
    const src = iconSourceFor(item);
    const isUserIcon = !!item.iconUri;
    return (
      <View style={[styles.row, selected && styles.rowSelected]}>
        <View style={styles.iconWrap}>
          {src
            ? <Image source={src} style={isUserIcon ? styles.iconFull : styles.iconSmall} fadeDuration={0} />
            : <View style={[styles.iconFull, styles.iconPlaceholder]}>
                <Ionicons name={item.isNone ? 'ban' : 'image-outline'} size={18} color="#9ca3af" />
              </View>
          }
        </View>
        <Text style={[styles.name, selected && styles.nameSel]} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
    );
  };

  // Confirm selection
  const handleDone = useCallback(() => {
    const item = items[selIndex];
    if (!item) { navigation.goBack(); return; }
    // map back to a key the rest of the app understands
    // - 'none'
    // - built-in -> builtinKey
    // - user-added -> custom:<id>
    const key =
      item.id === 'none' ? 'none'
      : item.builtinKey ? item.builtinKey
      : `custom:${item.id}`;
    try { onPick?.({ id: item.id, key, builtinKey: item.builtinKey, iconUri: item.iconUri, name: item.name }); } catch {}
    navigation.goBack();
  }, [items, selIndex, onPick, navigation]);

  return (
    <View style={styles.container}>
      {/* simple header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pick Category</Text>
        <TouchableOpacity onPress={handleDone} hitSlop={10} style={styles.headerBtn}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* spinner: one column, snapping rows */}
      <View style={styles.spinnerBox}>
        {/* center highlight bar */}
        <View pointerEvents="none" style={styles.centerHighlight} />
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
          snapToInterval={ROW_H}
          decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.98}
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={onScrollEnd}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: (styles.spinnerBox.height - ROW_H) / 2 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor:'#fff' },
  header: {
    height: 48, flexDirection:'row', alignItems:'center', justifyContent:'space-between',
    borderBottomWidth: 1, borderBottomColor:'#f0f0f0', paddingHorizontal: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color:'#111827' },
  headerBtn: { padding: 6, minWidth: 56, alignItems:'center', justifyContent:'center' },
  doneText: { fontWeight:'700', color:'#111827' },

  spinnerBox: {
    flex: 1, height: 420, // “full screen long (maybe a little shorter)”
  },
  centerHighlight: {
    position:'absolute', left: 0, right: 0,
    top: (420 - ROW_H)/2, height: ROW_H,
    borderTopWidth:1, borderBottomWidth:1, borderColor:'#e5e7eb',
    backgroundColor:'rgba(249,250,251,0.6)',
  },

  row: {
    height: ROW_H, paddingHorizontal:16, flexDirection:'row', alignItems:'center',
  },
  rowSelected: { backgroundColor:'rgba(17,24,39,0.03)' },

  iconWrap: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: '#f3f4f6',
    alignItems:'center', justifyContent:'center', overflow:'hidden', marginRight: 12,
  },
  iconSmall: { width: 36, height: 36, borderRadius: 8, resizeMode:'contain' }, // built-in smaller
  iconFull:  { width: 52, height: 52, borderRadius:12, resizeMode:'cover' },   // user full
  iconPlaceholder: { alignItems:'center', justifyContent:'center' },

  name: { fontSize: 16, color:'#111827', flexShrink:1 },
  nameSel: { fontWeight: '700' },
});
