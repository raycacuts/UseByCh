// src/screens/CalendarDayScreen.js
import React, { useMemo, useLayoutEffect, useEffect, useState, useCallback } from 'react';
import { SafeAreaView, FlatList, View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useData } from '../context/DataContext';
import { parseISO, clearTime, daysBetween } from '../utils/date';
import FoodItemCard from '../components/FoodItemCard';
import { iconByKey } from '../icons';
import { loadCategories, subscribeCategories } from '../storage/customCategories';
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

const NO_CATEGORY_KEY = '__NONE__';
const isNoCategoryKey = (k) => {
  if (k === NO_CATEGORY_KEY) return true;
  if (k == null) return true;
  const s = String(k).trim().toLowerCase();
  return !s || s === 'none' || s === 'no-category';
};

const ICON_SIZE = 26;                          // match Home/Calendar top bar icon size
const ICON_PALE = 'rgba(17,24,39,0.45)';       // pale icon color
const HSL = { top: 8, bottom: 8, left: 8, right: 8 };

const norm = (s='') => s.toString().trim().toLowerCase();

export default function CalendarDayScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { iso } = route.params || {};
  const { items, deleteItem } = useData();

  // Today (for correct duration calculation)
  const today = useMemo(() => clearTime(new Date()), []);

  // Load custom categories (for icon/name resolution)
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

  // Force FlatList to refresh when returning to this screen
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(
    React.useCallback(() => {
      setFocusTick((t) => t + 1);
    }, [])
  );

  const targetDate = useMemo(() => {
    const [y, m, d] = (iso || '').split('-').map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    return clearTime(new Date(y, m - 1, d));
  }, [iso]);

  const data = useMemo(() => {
    if (!targetDate) return [];
    return (items || []).filter((it) => {
      if (!it?.expiryDate) return false;
      const ed = parseISO(it.expiryDate);
      if (isNaN(ed)) return false;
      return clearTime(ed).getTime() === targetDate.getTime();
    }).sort((a, b) => String(a.name||'').localeCompare(String(b.name||'')));
  }, [items, targetDate]);

  // Custom top bar replaces native header
  useLayoutEffect(() => {
    nav.setOptions({ headerShown: false });
  }, [nav]);

  const dateTitle = useMemo(() => {
    if (!targetDate) return '';
    return targetDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }, [targetDate]);

  // 🔹 Analytics: screen open/close
  useFocusEffect(
    React.useCallback(() => {
      const start = Date.now();
      try {
        logEvent(getAnalytics(getApp()), 'calendar_day_open', { iso: iso || null, count: (data || []).length });
      } catch {}
      return () => {
        try {
          logEvent(getAnalytics(getApp()), 'calendar_day_close', { iso: iso || null, duration_ms: Date.now() - start });
        } catch {}
      };
    }, [iso, data.length])
  );

  // Resolve category icon + name (STRICT: custom id → custom name → built-in; none otherwise)
  const resolveCategory = useCallback((item) => {
    const k = item?.categoryIconKey;

    // no category → return empty to show nothing
    if (isNoCategoryKey(k)) return { icon: null, name: '' };

    if (typeof k === 'string') {
      // 1) custom:<id> — only if id exists now
      if (k.startsWith('custom:')) {
        const id = k.slice(7);
        const hit = cats.find((c) => String(c.id) === String(id));
        if (hit) return { icon: hit.iconUri ? { uri: hit.iconUri } : null, name: hit.name || '' };
        return { icon: null, name: '' }; // deleted → nothing
      }
      // 2) plain name that matches a current custom
      const byName = cats.find((c) => norm(c.name || '') === norm(k));
      if (byName) {
        return { icon: byName.iconUri ? { uri: byName.iconUri } : null, name: byName.name || '' };
      }
    }

    // 3) built-in mapping (last to avoid resurrecting deleted customs)
    const rec = iconByKey(k);
    if (rec) return { icon: rec.source, name: rec.label || '' };

    // fallback: nothing
    return { icon: null, name: '' };
  }, [cats]);

  const renderItem = ({ item }) => {
    // ✅ correct duration: days from TODAY to this item's expiry
    const exp = parseISO(item.expiryDate);
    const daysRemaining = isNaN(exp) ? NaN : daysBetween(today, clearTime(exp));

    const cat = resolveCategory(item);
    return (
      <FoodItemCard
        item={item}
        daysRemaining={daysRemaining}
        categoryIcon={cat.icon}
        categoryName={cat.name}
        onPress={() => {
          try { logEvent(getAnalytics(getApp()), 'calendar_day_item_tap', { item_id: item?.id ?? null }); } catch {}
          nav.navigate('AddItem', { editId: item.id });
        }}
        onDelete={() => {
          try { logEvent(getAnalytics(getApp()), 'calendar_day_item_delete', { item_id: item?.id ?? null }); } catch {}
          deleteItem(item.id);
        }}
      />
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Top bar (same size/style family as Home) */}
      <View style={s.bar}>
        <TouchableOpacity
          onPress={() => { try { logEvent(getAnalytics(getApp()), 'calendar_day_back'); } catch {} nav.goBack(); }}
          style={s.iconBtn}
          hitSlop={HSL}
        >
          <Ionicons name="chevron-back" size={ICON_SIZE} color={ICON_PALE} />
        </TouchableOpacity>

        <View style={s.centerWrap}>
          <Text style={s.barTitle} numberOfLines={1}>{dateTitle}</Text>
          <Text style={s.barCount}>{data.length} 物品</Text>
        </View>

        {/* spacer to balance layout */}
        <View style={s.iconBtn} />
      </View>

      <FlatList
        contentContainerStyle={[s.list, { paddingBottom: 24 }]}
        data={data}
        renderItem={renderItem}
        keyExtractor={(it, idx) => String(it?.id ?? idx)}
        extraData={{ cats, focusTick, len: data.length }}
        ListEmptyComponent={<View style={{ height: 1 }} />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  /* Top bar (match Home/Calendar vibe) */
  bar: {
    height: 56,
    paddingHorizontal: 8,
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
  centerWrap: {
    minWidth: 10, flexShrink: 1, alignItems: 'center',
  },
  barTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  barCount: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 2 },

  list: { padding: 12 },
});
