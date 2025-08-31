// src/components/home/FilterDrawer.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  FlatList, Image, Modal, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, TouchableWithoutFeedback, View, Platform, Dimensions,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { loadCategories, subscribeCategories } from '../../storage/customCategories';
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { iconSourceForItem } from '../../utils/categoryIcons';
import { useData } from '../../context/DataContext';
import { clearTime, parseISO, daysBetween } from '../../utils/date';

const { height: SCREEN_H } = Dimensions.get('window');
const ROW_H = 56;
const ICON_BOX = 34;
const norm = (s='') => s.toString().trim().toLowerCase();

export default function FilterDrawer({
  expireDays, setExpireDays,
  categoryFilter, setCategoryFilter,     // null | string | string[]
  noCategoryKey,                          // e.g. "__NONE__"
  onReset,
}) {
  // ---- categories (custom only) ----
  const [cats, setCats] = useState([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await loadCategories();
        if (mounted) setCats(Array.isArray(list) ? list : []);
      } catch {}
    })();
    const unsub = subscribeCategories((next) => setCats(Array.isArray(next) ? next : []));
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  // ✅ De-duplicate customs by NAME (safety)
  const dedupCats = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const c of cats) {
      const n = norm(c?.name || '');
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(c);
    }
    return out;
  }, [cats]);

  // ---- selected keys -> always an array for multi-select
  const selectedKeys = useMemo(() => {
    if (categoryFilter == null) return [];
    if (Array.isArray(categoryFilter)) return categoryFilter;
    return [String(categoryFilter)];
  }, [categoryFilter]);

  // 🔧 SYNC after deletes: prune stale custom:<id> and legacy names not in current list
  useEffect(() => {
    if (!selectedKeys.length) return;

    const validCustomIds = new Set(dedupCats.map(c => String(c.id)));
    const nameToId       = new Map(dedupCats.map(c => [norm(c.name), String(c.id)]));

    const cleaned = [];
    for (const raw of selectedKeys) {
      const k = String(raw).trim();
      if (!k) continue;
      if (k === noCategoryKey) { cleaned.push(k); continue; }

      if (k.startsWith('custom:')) {
        const id = k.slice(7);
        if (validCustomIds.has(id)) cleaned.push(k);
        continue; // drop stale id
      }

      // legacy plain name → map to surviving custom id if possible
      const mappedId = nameToId.get(norm(k));
      if (mappedId) { cleaned.push(`custom:${mappedId}`); }
      // else drop
    }

    const changed =
      cleaned.length !== selectedKeys.length ||
      cleaned.some((v, i) => v !== selectedKeys[i]);

    if (changed) {
      try {
        logEvent(getAnalytics(getApp()), 'filter_selection_pruned', {
          before: selectedKeys.length,
          after: cleaned.length,
        });
      } catch {}
      setCategoryFilter(cleaned.length ? cleaned : null);
    }
  }, [dedupCats, selectedKeys, setCategoryFilter, noCategoryKey]);

  // ---- "collapsed" summary display (customs + none only)
  const selectedCatDisplay = useMemo(() => {
    if (!selectedKeys.length) return { label: '全部', iconSrc: null, isAll: true };

    if (selectedKeys.length === 1) {
      const onlyRaw = String(selectedKeys[0]);
      if (onlyRaw === noCategoryKey) return { label: '无分类', iconSrc: null, isNone: true };

      // custom by id
      if (onlyRaw.startsWith('custom:')) {
        const id = onlyRaw.slice(7);
        const c = dedupCats.find(x => String(x.id) === String(id));
        if (c) return { label: c.name || '自定义', iconSrc: c.iconUri ? { uri: c.iconUri } : null, isCustom: true };
      }

      // legacy plain name (display only if still present)
      const byName = dedupCats.find(c => norm(c.name) === norm(onlyRaw));
      if (byName) return { label: byName.name, iconSrc: byName.iconUri ? { uri: byName.iconUri } : null, isCustom: true };

      // fallback: raw text (no icon)
      return { label: onlyRaw, iconSrc: null };
    }

    return { label: `已选 ${selectedKeys.length} 项`, iconSrc: null, isMulti: true };
  }, [selectedKeys, dedupCats, noCategoryKey]);

  // ---- Expiring in (days) input
  const expireText = useMemo(() => (expireDays == null ? '' : String(expireDays)), [expireDays]);
  const onChangeExpireText = useCallback((t) => {
    if (!t?.trim()) { setExpireDays(null); return; }
    const digits = t.replace(/[^\d]/g, '');
    if (!digits) { setExpireDays(null); return; }
    const n = Number(digits);
    if (Number.isFinite(n) && n >= 0) setExpireDays(n);
  }, [setExpireDays]);

  // ---- picker state (multi-select)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tempSet, setTempSet]       = useState(() => new Set());
  const openPicker  = () => { setTempSet(new Set(selectedKeys)); setPickerOpen(true); };
  const closePicker = () => setPickerOpen(false);

  // ✅ FINAL LIST for the sheet: none + (custom only)
  const listItems = useMemo(() => {
    return [{ id:'none', name:'No category', isNone:true }, ...dedupCats];
  }, [dedupCats]);

  // ✅ keys emitted back:
  //   - none: noCategoryKey
  //   - custom: "custom:<id>"
  //   - (legacy name still supported when present, but not emitted by sheet)
  const externalKeyForItem = (it) => {
    if (it.isNone) return noCategoryKey;
    return `custom:${it.id}`;
  };

  const isSelected = (it) => {
    const k = externalKeyForItem(it);
    if (tempSet.has(k)) return true;
    // legacy name match support
    if (!it.isNone && it.name && tempSet.has(String(it.name).trim())) return true;
    return false;
  };

  const onRowPress = (it) => {
    const canonical = externalKeyForItem(it);
    const legacyName = it.name ? String(it.name).trim() : null;

    const wasSelected =
      tempSet.has(canonical) || (legacyName && tempSet.has(legacyName));

    setTempSet(prev => {
      const next = new Set(prev);
      next.delete(canonical);
      if (legacyName) next.delete(legacyName);
      if (!wasSelected) next.add(canonical);
      return next;
    });
  };

  const onDone = () => {
    const arr = Array.from(tempSet);
    const nextVal = arr.length ? arr : null;
    setCategoryFilter(nextVal);
    closePicker();
  };

  /* ===== Counters (Expired / Total) at top ===== */
  const { items } = useData();
  const today = useMemo(() => clearTime(new Date()), []);
  const counts = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    const base = arr
      .filter((it) => !!it?.expiryDate)
      .map((it) => {
        const ed = parseISO(it.expiryDate);
        const dr = isNaN(ed) ? NaN : daysBetween(today, clearTime(ed));
        return { ...it, _daysRemaining: dr };
      });

    let filtered = base;
    if (expireDays != null) {
      filtered = filtered.filter((it) => typeof it._daysRemaining === 'number' && it._daysRemaining <= expireDays);
    }

    // category filter (multi) — custom ids & legacy names only
    const keys = selectedKeys;
    if (keys.length > 0) {
      filtered = filtered.filter((it) => {
        const raw = (it?.categoryIconKey || '').trim();

        // normalize item to (customName OR '')
        let itemNameKey = '';
        if (!raw) itemNameKey = '';
        else if (raw.toLowerCase() === 'none' || raw.toLowerCase() === 'no-category') itemNameKey = '';
        else if (raw.startsWith('custom:')) {
          const id = raw.slice(7);
          const c = dedupCats.find((x) => String(x.id) === String(id));
          itemNameKey = (c?.name || '').trim().toLowerCase();
        } else {
          // legacy stored name
          itemNameKey = raw.trim().toLowerCase();
        }

        for (const selRaw of keys) {
          const sel = String(selRaw).trim();
          if (sel === noCategoryKey) {
            if (itemNameKey === '') return true;
          } else if (sel.startsWith('custom:')) {
            const sid = sel.slice(7);
            const c = dedupCats.find((x) => String(x.id) === String(sid));
            if (c && itemNameKey === (c.name || '').trim().toLowerCase()) return true;
          } else {
            // legacy plain name selection (kept for back-compat)
            if (itemNameKey === sel.trim().toLowerCase()) return true;
          }
        }
        return false;
      });
    }

    const expired = filtered.filter((it) => typeof it._daysRemaining === 'number' && it._daysRemaining < 0).length;
    const total = filtered.length;
    return { expired, total };
  }, [items, dedupCats, today, expireDays, selectedKeys, noCategoryKey]);

  // 🔹 Reset handler
  const handleReset = useCallback(() => {
    onReset?.();
  }, [onReset]);

  return (
    <View style={styles.drawer}>
      <ScrollView style={styles.drawerScroll} contentContainerStyle={styles.drawerContent}>

        {/* ===== Counters at the TOP ===== */}
        <View style={styles.countersRow}>
          <View style={styles.counterCell}>
            <Text style={styles.counterLabel}>已过期</Text>
            <Text style={styles.counterValue}>{counts.expired}</Text>
          </View>
          <View style={[styles.counterCell, { marginRight: 0 }]}>
            <Text style={styles.counterLabel}>总计</Text>
            <Text style={styles.counterValue}>{counts.total}</Text>
          </View>
        </View>

        {/* Section: Expiring in (days) */}
        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>即将到期（天）</Text>
        <View style={styles.catPicker}>
          <View style={styles.catIconBox}>
            <Ionicons name="time-outline" size={18} color="#9ca3af" />
          </View>
          <TextInput
            value={expireText}
            onChangeText={onChangeExpireText}
            placeholder="全部"
            placeholderTextColor="#9ca3af"
            keyboardType={Platform.select({ ios: 'number-pad', android: 'numeric' })}
            returnKeyType="done"
            style={styles.catLabelInput}
          />
          {expireDays !== null ? (
            <TouchableOpacity onPress={() => setExpireDays(null)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 18 }} />
          )}
        </View>

        {/* Section: Category (custom only) */}
        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>分类</Text>
        <TouchableOpacity
          style={styles.catPicker}
          activeOpacity={0.85}
          onPress={openPicker}
        >
          <View style={styles.catIconBox}>
            {/* show selected custom icon if any; otherwise generic tag */}
            <Ionicons name="pricetag-outline" size={18} color="#9ca3af" />
          </View>
          <Text
            style={[styles.catLabel, selectedCatDisplay.isAll && { color: '#9ca3af' }]}
            numberOfLines={1}
          >
            {selectedCatDisplay.label}
          </Text>
          <Ionicons name="chevron-up" size={18} color="#9ca3af" />
        </TouchableOpacity>

        {/* Reset */}
        <TouchableOpacity onPress={handleReset} style={[styles.footerBtn, { marginTop: 24 }]} activeOpacity={0.85}>
          <Ionicons name="refresh-outline" size={16} color="#9ca3af" />
          <Text style={[styles.footerBtnText, { color: '#9ca3af' }]}>重置</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Bottom sheet (no-dim) */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={closePicker}>
        <TouchableWithoutFeedback onPress={closePicker}><View style={styles.sheetBackdrop} /></TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={closePicker}><Text style={styles.sheetCancel}>取消</Text></TouchableOpacity>
            <Text style={styles.sheetTitle}>选择分类</Text>
            <TouchableOpacity onPress={onDone}><Text style={styles.sheetDone}>完成</Text></TouchableOpacity>
          </View>
          <FlatList
            data={[{ id:'none', name:'无分类', isNone:true }, ...dedupCats]}
            keyExtractor={(it) => String(it.id)}
            getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            contentContainerStyle={{ paddingHorizontal:12, paddingBottom:12 }}
            renderItem={({ item }) => {
              const selected = isSelected(item);
              const src = iconSourceForItem(item);
              return (
                <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={() => onRowPress(item)}>
                  <View style={styles.rowLeft}>
                    <View style={styles.rowIconWrap}>
                      {src
                        ? (Image.resolveAssetSource(src)?.uri
                            ? <Image source={src} style={styles.rowIconFull} />
                            : <Image source={src} style={styles.rowIconSmall} />)
                        : item.isNone
                          ? <Ionicons name="ellipse-outline" size={18} color="#111827" />
                          : <Ionicons name="image-outline" size={18} color="#9ca3af" />
                      }
                    </View>
                    <Text style={styles.rowText} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    {selected ? <View style={styles.checkBoxChecked}><Ionicons name="checkmark" size={14} color="#fff" /></View> : <View style={styles.checkBox} />}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer:{ flex:1, backgroundColor:'#fff', borderRightWidth:1, borderColor:'#e5e7eb' },
  drawerScroll:{ flex:1 }, drawerContent:{ paddingBottom:32 },

  // Counters at top
  countersRow: {
    flexDirection:'row',
    justifyContent:'space-between',
    marginTop:16,
    marginHorizontal:12,
    marginBottom:4,
    gap:8,
  },
  counterCell: {
    flex:1,
    backgroundColor:'#f9fafb',
    borderWidth:1,
    borderColor:'#e5e7eb',
    borderRadius:10,
    paddingVertical:12,
    paddingHorizontal:14,
    marginRight:8,
  },
  counterLabel: { fontSize:12, fontWeight:'700', color:'#6b7280', marginBottom:2, textTransform:'capitalize' },
  counterValue: { fontSize:18, fontWeight:'800', color:'#111827' },

  sectionTitle:{ marginTop:14, marginBottom:8, paddingHorizontal:12, fontSize:12, fontWeight:'700', color:'#9ca3af' },

  // Category-style rows
  catPicker:{ marginHorizontal:12, borderWidth:1, borderColor:'#e5e7eb', borderRadius:10, backgroundColor:'#fff', height:48, paddingHorizontal:10, alignItems:'center', flexDirection:'row', gap:10 },
  catIconBox:{ width:ICON_BOX, height:ICON_BOX, borderRadius:ICON_BOX/2, backgroundColor:'#f3f4f6', alignItems:'center', justifyContent:'center', overflow:'hidden' },
  iconSmall:{ width:22, height:22, resizeMode:'contain' },
  iconFull: { width:ICON_BOX, height:ICON_BOX, resizeMode:'cover' },
  catLabel:{ flex:1, color:'#111827', fontSize:16 },
  catLabelInput:{ flex:1, color:'#111827', fontSize:16, paddingVertical:0 },

  footerBtn:{ flexDirection:'row', alignItems:'center', gap:8, paddingVertical:12, borderRadius:10, backgroundColor:'#f3f4f6', justifyContent:'center', marginHorizontal:12 },
  footerBtnText:{ fontWeight:'700', color:'#111827' },

  sheetBackdrop:{ flex:1, backgroundColor:'transparent' },
  sheet:{ height: Math.min(SCREEN_H * 0.88, 540), backgroundColor:'#fff', borderTopLeftRadius:16, borderTopRightRadius:16, borderTopWidth:1, borderColor:'#e5e7eb' },
  sheetHeader:{ height:48, flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  sheetCancel:{ color:'#ef4444', fontWeight:'700', fontSize:16 },
  sheetTitle:{  color:'#111827', fontWeight:'700', fontSize:16 },
  sheetDone:{   color:'#ef4444', fontWeight:'700', fontSize:16 },

  row:{ height:ROW_H, flexDirection:'row', alignItems:'center', paddingHorizontal:8, backgroundColor:'#fff' },
  sep:{ height:1, backgroundColor:'#f3f4f6', marginLeft:64 },
  rowLeft:{ flexDirection:'row', alignItems:'center', flex:1, gap:10 },
  rowIconWrap:{ width:36, height:36, borderRadius:8, backgroundColor:'#f3f4f6', alignItems:'center', justifyContent:'center', overflow:'hidden', marginLeft:6 },
  rowIconSmall:{ width:24, height:24, resizeMode:'contain' },
  rowIconFull:{  width:36, height:36, resizeMode:'cover' },
  rowText:{ color:'#111827', fontSize:16, flexShrink:1 },
  rowRight:{ width:40, alignItems:'flex-end', paddingRight:6 },
  checkBox:{ width:22, height:22, borderRadius:4, borderWidth:1, borderColor:'#cbd5e1', backgroundColor:'#fff' },
  checkBoxChecked:{ width:22, height:22, borderRadius:4, backgroundColor:'#ef4444', alignItems:'center', justifyContent:'center' },
});
