// src/screens/HomeScreen.js
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  SafeAreaView,
  StyleSheet,
  View,
  TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

import { useData } from '../context/DataContext';
import { useBilling } from '../context/BillingContext';

import FoodItemCard from '../components/FoodItemCard';
import FAB from '../components/FAB';
import { clearTime, daysBetween, parseISO } from '../utils/date';

import TopBar from '../components/home/TopBar';
import SearchRow from '../components/home/SearchRow';
import FilterDrawer from '../components/home/FilterDrawer';
import AdBar from '../components/ads/AdBar';
import { iconByKey } from '../icons';

// ⬇️ categories store
import { loadCategories, subscribeCategories } from '../storage/customCategories';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PANEL_W = Math.min(320, Math.round(SCREEN_W * 0.8));

const NO_CATEGORY_KEY = '__NONE__';
const isNoCategoryKey = (k) => {
  if (k === NO_CATEGORY_KEY) return true;
  if (k === null || k === undefined) return true;
  const s = String(k).trim();
  return s.length === 0 || s.toLowerCase() === 'none' || s.toLowerCase() === 'no-category';
};

const norm = (s = '') => s.toString().trim().toLowerCase();

export default function HomeScreen() {
  const nav = useNavigation();
  const { items, deleteItem, deleteMany, replaceAllItems } = useData();
  const { showAds } = useBilling();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const slideX = useRef(new Animated.Value(-PANEL_W)).current;

  const [contentTop, setContentTop] = useState(0);
  const [expireDays, setExpireDays] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);

  // 🔹 custom categories
  const [cats, setCats] = useState([]);
  const [catsLoaded, setCatsLoaded] = useState(false); // NEW: track first real load
  const prevCatIdsRef = useRef(null); // NEW: remember previous ids set

  // 🔹 force-list-rerender tick on screen focus
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusTick((t) => t + 1);
    }, [])
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await loadCategories();
        if (mounted) {
          setCats(Array.isArray(list) ? list : []);
          setCatsLoaded(true);
          try {
            logEvent(getAnalytics(getApp()), 'home_cats_loaded', { count: Array.isArray(list) ? list.length : 0 });
          } catch {}
        }
      } catch {}
    })();
    const unsub = subscribeCategories((next) => {
      const arr = Array.isArray(next) ? next : [];
      setCats(arr);
      setCatsLoaded(true);
      try {
        logEvent(getAnalytics(getApp()), 'home_cats_changed', { count: arr.length });
      } catch {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  // ✅ PRUNE STALE FILTER KEYS: if a custom category was deleted, remove its key from the active filter
  useEffect(() => {
    if (!catsLoaded) return;

    const idSet = new Set((cats || []).map(c => String(c.id)));
    if (Array.isArray(categoryFilter) && categoryFilter.length > 0) {
      const cleaned = categoryFilter.filter(k => {
        const s = String(k).trim();
        if (s === NO_CATEGORY_KEY) return true;
        if (s.startsWith('custom:')) {
          const id = s.slice(7);
          return idSet.has(String(id));
        }
        // builtin or legacy name → keep
        return true;
      });
      if (cleaned.length !== categoryFilter.length) {
        try {
          logEvent(getAnalytics(getApp()), 'home_filter_pruned_after_delete', {
            before: categoryFilter.length,
            after: cleaned.length,
          });
        } catch {}
        setCategoryFilter(cleaned.length ? cleaned : null);
      }
    } else if (typeof categoryFilter === 'string' && categoryFilter) {
      const s = String(categoryFilter).trim();
      if (s.startsWith('custom:')) {
        const id = s.slice(7);
        if (!idSet.has(String(id))) {
          try {
            logEvent(getAnalytics(getApp()), 'home_filter_pruned_after_delete', { before: 1, after: 0 });
          } catch {}
          setCategoryFilter(null);
        }
      }
    }
  }, [catsLoaded, cats, categoryFilter, setCategoryFilter]);

  // analytics
  useFocusEffect(
    useCallback(() => {
      const start = Date.now();
      try { logEvent(getAnalytics(getApp()), 'home_open', {}); } catch {}
      return () => {
        try { logEvent(getAnalytics(getApp()), 'home_close', { duration_ms: Date.now() - start }); } catch {}
      };
    }, [])
  );

  // 🔸 extra analytics: search / filter changes
  useEffect(() => {
    try {
      logEvent(getAnalytics(getApp()), 'home_search_query', { len: (searchQuery || '').length });
    } catch {}
  }, [searchQuery]);

  useEffect(() => {
    try {
      logEvent(getAnalytics(getApp()), 'home_filter_expire_days', { days: expireDays ?? -1 });
    } catch {}
  }, [expireDays]);

  useEffect(() => {
    try {
      const count =
        categoryFilter == null
          ? 0
          : Array.isArray(categoryFilter)
          ? categoryFilter.length
          : 1;
      logEvent(getAnalytics(getApp()), 'home_filter_category_change', { count });
    } catch {}
  }, [categoryFilter]);

  // animate drawer
  useEffect(() => {
    Animated.timing(slideX, {
      toValue: drawerOpen ? 0 : -PANEL_W,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [drawerOpen, slideX]);

  // drawer drag gesture
  const onGestureEvent = ({ nativeEvent }) => {
    const tx = Math.min(0, Math.max(-PANEL_W, nativeEvent.translationX));
    slideX.setValue(tx);
  };
  const onHandlerStateChange = ({ nativeEvent }) => {
    const { state, translationX, velocityX } = nativeEvent;
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      const CLOSE_THRESHOLD = -PANEL_W * 0.33;
      const SHOULD_CLOSE = translationX <= CLOSE_THRESHOLD || velocityX < -500;
      Animated.timing(slideX, {
        toValue: SHOULD_CLOSE ? -PANEL_W : 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        if (SHOULD_CLOSE) {
          try { logEvent(getAnalytics(getApp()), 'home_filter_swipe_close', {}); } catch {}
          setDrawerOpen(false);
        }
      });
    }
  };

  const today = useMemo(() => clearTime(new Date()), []);

  const baseData = useMemo(() => {
    const itemsSafe = Array.isArray(items) ? items : [];
    const valid = itemsSafe.filter((it) => !!it?.expiryDate);

    valid.sort((a, b) => {
      const aa = parseISO(a.expiryDate).getTime();
      const bb = parseISO(b.expiryDate).getTime();
      if (aa !== bb) return aa - bb; // earliest expiry first (groups by day naturally)
      const nameA = String(a.name || '').toLowerCase();
      const nameB = String(b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const mapped = valid.map((it) => {
      const exp = parseISO(it.expiryDate);
      return { ...it, _daysRemaining: daysBetween(today, exp) };
    });

    try { logEvent(getAnalytics(getApp()), 'home_list_size', { count: mapped.length }); } catch {}
    return mapped;
  }, [items, today]);

  /** Canonical matching against selection (supports: none, builtin key, custom:<id>, custom name) */
  const matchesSelection = useCallback((it, selSet) => {
    const raw = (it?.categoryIconKey || '').trim();

    // None → NO_CATEGORY_KEY
    if (!raw || raw.toLowerCase() === 'none' || raw.toLowerCase() === 'no-category') {
      return selSet.orig.has(NO_CATEGORY_KEY);
    }

    // Fast direct checks (exact / lowercase)
    if (selSet.orig.has(raw) || selSet.low.has(norm(raw))) return true;

    // custom id → also allow name
    if (raw.startsWith('custom:')) {
      const id = raw.slice(7);
      const c = cats.find((x) => String(x.id) === String(id));
      if (selSet.orig.has(`custom:${id}`)) return true;
      if (c && selSet.low.has(norm(c.name || ''))) return true;
      return false;
    }

    // name stored → also allow matching a selected custom id for that name
    const cByName = cats.find((x) => norm(x.name || '') === norm(raw));
    if (cByName && selSet.orig.has(`custom:${cByName.id}`)) return true;

    // built-in: selection is builtin key (we already checked exact/low above)
    return false;
  }, [cats]);

  const data = useMemo(() => {
    let d = baseData;

    if (expireDays !== null) d = d.filter((it) => it._daysRemaining <= expireDays);

    // Category filter (multi / single)
    if (Array.isArray(categoryFilter) && categoryFilter.length > 0) {
      const selOrig = new Set(categoryFilter.map(String));
      const selLow  = new Set(categoryFilter.map((s) => norm(String(s))));
      const sel = { orig: selOrig, low: selLow };
      d = d.filter((it) => matchesSelection(it, sel));
    } else if (typeof categoryFilter === 'string' && categoryFilter) {
      const selOrig = new Set([String(categoryFilter)]);
      const selLow  = new Set([norm(String(categoryFilter))]);
      const sel = { orig: selOrig, low: selLow };
      if (categoryFilter === NO_CATEGORY_KEY) {
        d = d.filter((it) => isNoCategoryKey(it.categoryIconKey));
      } else {
        d = d.filter((it) => matchesSelection(it, sel));
      }
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) d = d.filter((it) => String(it.name || '').toLowerCase().includes(q));

    return Array.isArray(d) ? d : [];
  }, [baseData, expireDays, categoryFilter, searchQuery, matchesSelection]);

  function clearShown() {
    const ids = data.map((it) => it.id).filter((id) => id != null);
    const count = ids.length;

    try { logEvent(getAnalytics(getApp()), 'home_clear_click', { count }); } catch {}

    if (count === 0) {
      Alert.alert('没有可清除的内容');
      return;
    }

    Alert.alert(
  '清除显示的物品？',
  `这将永久删除当前显示的 ${count} 个物品。`,
      [
        { text: 'Cancel', style: 'cancel',
          onPress: () => { try { logEvent(getAnalytics(getApp()), 'home_clear_cancel', { count }); } catch {} }
        },
        { text: 'Delete', style: 'destructive',
          onPress: () => {
            try { logEvent(getAnalytics(getApp()), 'home_clear_confirm', { count }); } catch {}
            deleteMany(ids);
          }
        },
      ],
    );
  }

  const resetFilters = () => {
    try { logEvent(getAnalytics(getApp()), 'home_filter_reset_click', {}); } catch {}
    setExpireDays(null);
    setCategoryFilter(null);
  };

  const finishFilters = () => {
    try { logEvent(getAnalytics(getApp()), 'home_filter_close_click', {}); } catch {}
    Animated.timing(slideX, {
      toValue: -PANEL_W,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setDrawerOpen(false));
  };

  // helper to resolve icon+name for item (empty string when none)
  const resolveCategory = useCallback((item) => {
    const k = item?.categoryIconKey;
    if (isNoCategoryKey(k)) return { icon: null, name: '' };

    // 1) custom:<id> → strictly resolve against live cats; if not found, treat as none
    if (typeof k === 'string' && k.startsWith('custom:')) {
      const id = k.slice('custom:'.length);
      const hit = cats.find((c) => String(c.id) === String(id));
      if (hit) return { icon: hit.iconUri ? { uri: hit.iconUri } : null, name: hit.name || '' };
      return { icon: null, name: '' };
    }

    // 2) plain string that matches a current custom NAME
    if (typeof k === 'string' && k.trim().length) {
      const byName = cats.find((c) => norm(c.name || '') === norm(k));
      if (byName) return { icon: byName.iconUri ? { uri: byName.iconUri } : null, name: byName.name || '' };
    }

    // 3) built-in mapping (kept last to avoid resurrecting deleted customs)
    const rec = iconByKey(k);
    if (rec) return { icon: rec.source, name: rec.label || '' };

    return { icon: null, name: '' };
  }, [cats]);

  // ✅ GUARDED CASCADE: run only after first real load, and only when a category id was actually removed
  useEffect(() => {
    if (!catsLoaded) return;

    const nextIds = new Set((cats || []).map(c => String(c.id)));
    const prevIds = prevCatIdsRef.current;
    prevCatIdsRef.current = nextIds;

    if (!prevIds) {
      // first ready emission — skip
      try { logEvent(getAnalytics(getApp()), 'home_cascade_skip_initial', {}); } catch {}
      return;
    }

    // only proceed if some id was removed (i.e., a deletion happened)
    let removed = false;
    prevIds.forEach(id => { if (!nextIds.has(id)) removed = true; });
    if (!removed) return;

    const arr = Array.isArray(items) ? items : [];
    let dirty = false;
    let cleared = 0;
    const nextItems = arr.map((it) => {
      const key = it?.categoryIconKey;
      if (typeof key === 'string' && key.startsWith('custom:')) {
        const id = key.slice(7);
        if (!nextIds.has(String(id))) {
          dirty = true;
          cleared++;
          return { ...it, categoryIconKey: '' };
        }
      }
      return it;
    });

    if (dirty && typeof replaceAllItems === 'function') {
      try { logEvent(getAnalytics(getApp()), 'home_cascade_clear_items', { cleared }); } catch {}
      replaceAllItems(nextItems);
    }
  }, [catsLoaded, cats, items, replaceAllItems]);

  // ✅ CLEAN STALE PLAIN-STRING KEYS: when categories change, clear any plain string keys
  // that no longer match a current custom name AND are not a valid built-in key.
  useEffect(() => {
    if (!catsLoaded) return;
    const nameSet = new Set((cats || []).map(c => norm(c.name || '')));
    const arr = Array.isArray(items) ? items : [];
    let dirty = false;
    let cleared = 0;

    const nextItems = arr.map((it) => {
      const key = it?.categoryIconKey;
      if (typeof key === 'string' && key.trim().length && !key.startsWith('custom:')) {
        // if matches current custom name, keep
        if (nameSet.has(norm(key))) return it;
        // if built-in mapping exists, keep
        const rec = iconByKey(key);
        if (rec) return it;
        // otherwise clear
        dirty = true; cleared++;
        return { ...it, categoryIconKey: '' };
      }
      return it;
    });

    if (dirty && typeof replaceAllItems === 'function') {
      try { logEvent(getAnalytics(getApp()), 'home_cascade_clear_plain', { cleared }); } catch {}
      replaceAllItems(nextItems);
    }
  }, [catsLoaded, cats, items, replaceAllItems]);

  // show a divider ONLY between groups of different expiry days,
  // and keep total spacing between cards the same as before
  const shouldShowSeparatorAfter = useCallback((current, next) => {
    if (!next) return false; // no last line
    if (!current?.expiryDate || !next?.expiryDate) return true;
    const a = clearTime(parseISO(current.expiryDate)).getTime();
    const b = clearTime(parseISO(next.expiryDate)).getTime();
    return a !== b; // line only when group (day) changes
  }, []);

  const renderItem = ({ item, index }) => {
    const nextItem = data[index + 1];
    const cat = resolveCategory(item);

    return (
      <View>
        <FoodItemCard
          item={item}
          daysRemaining={item._daysRemaining}
          categoryIcon={cat.icon}
          categoryName={cat.name}
          onPress={() => {
            try { logEvent(getAnalytics(getApp()), 'home_item_open', { id: String(item?.id || '') }); } catch {}
            nav.navigate('AddItem', { editId: item.id });
          }}
          onDelete={() => {
            try { logEvent(getAnalytics(getApp()), 'home_item_delete', { id: String(item?.id || '') }); } catch {}
            deleteItem(item.id);
          }}
        />
        {shouldShowSeparatorAfter(item, nextItem) ? <View style={styles.sep} /> : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <TopBar
        onPressFilter={() => {
          try { logEvent(getAnalytics(getApp()), 'home_filter_open_click', {}); } catch {}
          setDrawerOpen(true);
        }}
        onPressClear={clearShown}
        onToggleSearch={() => {
          const next = !searchOpen;
          try { logEvent(getAnalytics(getApp()), 'home_search_toggle', { open: next ? 1 : 0 }); } catch {}
          setSearchOpen(next);
        }}
        searchOpen={searchOpen}
      />

      {/* {showAds && <AdBar />} */}

      {searchOpen && (
        <SearchRow
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => {
            try { logEvent(getAnalytics(getApp()), 'home_search_clear', {}); } catch {}
            setSearchQuery('');
          }}
        />
      )}

      {/* marker to pin the drawer between top+search and bottom */}
      <View onLayout={(e) => setContentTop(e.nativeEvent.layout.y)} />

      <View style={{ flex: 1 }}>
        <FlatList
          contentContainerStyle={[styles.list, { paddingBottom: 24 }]}
          data={data}
          renderItem={renderItem}
          extraData={{ cats, focusTick, len: data.length }}
          keyExtractor={(it, idx) => String(it?.id ?? idx)}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Animated.Text style={styles.emptyTitle}>
                {searchQuery || expireDays !== null || categoryFilter ? '无结果' : '没有物品'}
              </Animated.Text>
              <Animated.Text style={styles.emptyText}>
                {searchQuery || expireDays !== null || categoryFilter
                  ? '请尝试其他筛选条件或搜索'
                  : '点击“+”添加第一个物品'}
              </Animated.Text>
            </View>
          }
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        />
        <FAB
          onPress={async () => {
            try { await logEvent(getAnalytics(getApp()), 'add_item_button_click', { screen: 'Home' }); } catch {}
            nav.navigate('AddItem');
          }}
        />
      </View>

      {drawerOpen && (
        <TouchableWithoutFeedback onPress={finishFilters}>
          <View
            style={[
              styles.overlayClickArea,
              { top: contentTop, height: SCREEN_H - contentTop, left: PANEL_W },
            ]}
          />
        </TouchableWithoutFeedback>
      )}

      <Animated.View
        pointerEvents={drawerOpen ? 'auto' : 'none'}
        style={[
          styles.drawerWrap,
          { top: contentTop, height: SCREEN_H - contentTop, transform: [{ translateX: slideX }] },
        ]}
      >
        <PanGestureHandler
          activeOffsetX={[-10, 10]}
          failOffsetY={[-10, 10]}
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View style={{ flex: 1 }}>
            <FilterDrawer
              expireDays={expireDays}
              setExpireDays={setExpireDays}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              noCategoryKey={NO_CATEGORY_KEY}
              onReset={resetFilters}
            />
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 12 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#6b7280' },

  // more obvious divider, but keep original spacing between cards:
  // card has marginBottom: 12 → pull the divider up into that space (−12)
  // then give it marginBottom: 10 so 2 (height) + 10 = 12 total.
  sep: {
    height: 0.5,
    backgroundColor: '#d1d5db',
    marginLeft: -12,
    marginRight: -12,
    marginTop: -1,
    marginBottom: 10,
    borderRadius: 0,
    alignSelf: 'stretch',
  },

  overlayClickArea: {
    position: 'absolute',
    right: 0,
    width: SCREEN_W - PANEL_W,
    backgroundColor: 'transparent',
  },
  drawerWrap: {
    position: 'absolute',
    left: 0,
    width: PANEL_W,
  },
});
