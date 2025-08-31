// src/screens/CalendarScreen.js
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Modal, FlatList, Animated, Easing,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { PanGestureHandler, State as GHState } from 'react-native-gesture-handler';
import { useData } from '../context/DataContext';
import { useBilling } from '../context/BillingContext';
import AdBar from '../components/ads/AdBar';
import { parseISO, clearTime } from '../utils/date';

// 🔹 Analytics
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS   = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

const ICON_SIZE = 26;                          // match Home top bar
const ICON_PALE = 'rgba(17,24,39,0.45)';       // pale icon color (same feel as Home)

/* ---------- date helpers ---------- */
function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(0, 0, 0, 0);
  return d;
}
function formatKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

/** Build 7-column grid cells for a given month */
function buildMonthCells(baseDate, items, today) {
  const first = startOfMonth(baseDate);
  const last  = endOfMonth(baseDate);
  const firstWeekday = first.getDay(); // 0..6
  const daysInMonth  = last.getDate();

  const markMap = new Map();
  for (const it of items || []) {
    if (!it?.expiryDate) continue;
    const d = parseISO(it.expiryDate);
    if (isNaN(d)) continue;
    const ct = clearTime(d);
    if (ct >= first && ct <= last) markMap.set(formatKey(ct), true);
  }

  const arr = [];
  for (let i = 0; i < firstWeekday; i++) arr.push({ key: `blank-${i}`, blank: true });

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(baseDate.getFullYear(), baseDate.getMonth(), d);
    const key = formatKey(dateObj);
    arr.push({
      key,
      blank:    false,
      dateObj:  clearTime(dateObj),
      label:    String(d),
      hasItems: !!markMap.get(key),
      isToday:  isSameDay(clearTime(dateObj), today),
    });
  }
  while (arr.length % 7 !== 0) arr.push({ key: `pad-${arr.length}`, blank: true });
  return arr;
}

export default function CalendarScreen() {
  const nav = useNavigation();
  const { items } = useData();
  const { showAds } = useBilling();

  const today = useMemo(() => clearTime(new Date()), []);
  const [cursor, setCursor] = useState(() => clearTime(new Date())); // current month

  // 🔹 Analytics: screen open/close
  useFocusEffect(
    React.useCallback(() => {
      const start = Date.now();
      try {
        logEvent(getAnalytics(getApp()), 'calendar_open', {
          month: cursor.getMonth() + 1,
          year: cursor.getFullYear(),
        });
      } catch {}
      return () => {
        try {
          logEvent(getAnalytics(getApp()), 'calendar_close', {
            duration_ms: Date.now() - start,
          });
        } catch {}
      };
    }, [cursor])
  );

  // Month/Year picker modal
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickYear, setPickYear]     = useState(cursor.getFullYear());
  const [pickMonth, setPickMonth]   = useState(cursor.getMonth());

  // Content size (for carousel + dynamic cell sizing)
  const [contentW, setContentW] = useState(0);
  const [contentH, setContentH] = useState(0);
  const onContentLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    if (width && Math.abs(width - contentW) > 1) setContentW(width);
    if (height && Math.abs(height - contentH) > 1) setContentH(height);
  };

  // Precompute prev/current/next month dates
  const curMonth  = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const prevMonth = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1), [cursor]);
  const nextMonth = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1), [cursor]);

  // Cells
  const cellsPrev = useMemo(() => buildMonthCells(prevMonth, items, today), [prevMonth, items, today]);
  const cellsCurr = useMemo(() => buildMonthCells(curMonth,  items, today), [curMonth,  items, today]);
  const cellsNext = useMemo(() => buildMonthCells(nextMonth, items, today), [nextMonth, items, today]);

  // Rows in current month (5 or 6 typically)
  const rowsCurr = Math.max(1, Math.ceil(cellsCurr.length / 7));

  // We keep grid area height constant to avoid vertical jumps, and only adjust cell height
  // Reserve ~34px for weekday row + ~8px padding.
  const RESERVED_ABOVE_GRID = 34 + 8;
  const gridAreaH = Math.max(180, contentH - RESERVED_ABOVE_GRID);
  const dayCellSize = Math.max(40, Math.floor(gridAreaH / rowsCurr));

  // Gesture / Animation
  const transX = useRef(new Animated.Value(0)).current;      // animated translation
  const baseX  = useRef(new Animated.Value(0)).current;      // holds -contentW
  useEffect(() => { baseX.setValue(-contentW || 0); }, [contentW, baseX]);

  // Drag handling
  const dragX = useRef(0);
  const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

  const animateTo = useCallback((to, cb) => {
    Animated.timing(transX, {
      toValue: to,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(cb);
  }, [transX]);

  const goPrevMonth = useCallback(() => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  }, []);
  const goNextMonth = useCallback(() => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  }, []);
  const goToToday = useCallback(() => {
    try { logEvent(getAnalytics(getApp()), 'calendar_today_tap', {}); } catch {}
    const now = clearTime(new Date());
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  const onPressDay = useCallback((dateObj) => {
    try { logEvent(getAnalytics(getApp()), 'calendar_day_tap', { iso: formatKey(dateObj) }); } catch {}
    nav.navigate('CalendarDay', { iso: formatKey(dateObj) });
  }, [nav]);

  // Pan gesture handlers
  const onGestureEvent = ({ nativeEvent }) => {
    if (!contentW) return;
    dragX.current = clamp(nativeEvent.translationX, -contentW, contentW);
    transX.setValue(dragX.current);
  };

  const onHandlerStateChange = ({ nativeEvent }) => {
    if (nativeEvent.state === GHState.END) {
      const dx = dragX.current || 0;
      const vx = nativeEvent.velocityX || 0;
      dragX.current = 0;

      if (!contentW) return;
      const THRESHOLD = contentW * 0.25; // 25% or a flick
      if (dx <= -THRESHOLD || vx <= -300) {
        try { logEvent(getAnalytics(getApp()), 'calendar_swipe_next', { dx, vx }); } catch {}
        // animate to next, then swap month and reset transX
        animateTo(-contentW, () => {
          goNextMonth();
          transX.setValue(0);
        });
      } else if (dx >= THRESHOLD || vx >= 300) {
        try { logEvent(getAnalytics(getApp()), 'calendar_swipe_prev', { dx, vx }); } catch {}
        // animate to prev
        animateTo(contentW, () => {
          goPrevMonth();
          transX.setValue(0);
        });
      } else {
        animateTo(0);
      }
    }
  };

  // Month-year picker
  const openMonthYearPicker = () => {
    try { logEvent(getAnalytics(getApp()), 'calendar_month_picker_open', {}); } catch {}
    setPickYear(cursor.getFullYear());
    setPickMonth(cursor.getMonth());
    setPickerOpen(true);
  };
  const applyPicker = () => {
    try { logEvent(getAnalytics(getApp()), 'calendar_month_picker_apply', { year: pickYear, month: pickMonth + 1 }); } catch {}
    setCursor(new Date(pickYear, pickMonth, 1));
    setPickerOpen(false);
    // fade back to center if user changed via picker while dragging
    animateTo(0);
  };

  // Animated translate for carousel: -contentW + transX
  const translateStyle = {
    transform: [{ translateX: Animated.add(baseX, transX) }],
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Top bar styled like Home */}
      <View style={s.bar}>
        <TouchableOpacity
          onPress={() => {
            try { logEvent(getAnalytics(getApp()), 'calendar_prev_tap', {}); } catch {}
            animateTo(contentW, () => { goPrevMonth(); transX.setValue(0); });
          }}
          style={s.iconBtn}
          hitSlop={HSL}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={ICON_SIZE} color={ICON_PALE} />
        </TouchableOpacity>

        <TouchableOpacity onPress={openMonthYearPicker} activeOpacity={0.85} style={s.centerTap}>
          <Text style={s.barTitle}>
            {cursor.toLocaleString('zh-CN', { month: 'long', year: 'numeric' })}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            try { logEvent(getAnalytics(getApp()), 'calendar_next_tap', {}); } catch {}
            animateTo(-contentW, () => { goNextMonth(); transX.setValue(0); });
          }}
          style={s.iconBtn}
          hitSlop={HSL}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={ICON_SIZE} color={ICON_PALE} />
        </TouchableOpacity>
      </View>

      {/* Ad bar */}
      {/* {showAds ? <AdBar /> : null} */}

      {/* Tools row */}
      <View style={s.toolsRow}>
        <TouchableOpacity onPress={goToToday} style={s.todayBtn} activeOpacity={0.9}>
          <Ionicons name="calendar" size={18} color="#111827" />
          <Text style={s.todayText}>今天</Text>
        </TouchableOpacity>
      </View>

      {/* Swipeable content area */}
      <View style={s.content} onLayout={onContentLayout}>
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
          activeOffsetX={[-10, 10]}
          failOffsetY={[-10, 10]}
        >
          <Animated.View style={[{ flex: 1 }, translateStyle]}>
            {/* 3-panel carousel (prev | current | next), each with dynamic cell sizing */}
            <View style={[s.carousel, { width: contentW ? contentW * 3 : '300%' }]}>
              <View style={[s.monthPage, { width: contentW || '33.333%' }]}>
                <MonthView cells={cellsPrev} onPressDay={onPressDay} gridAreaH={gridAreaH} />
              </View>
              <View style={[s.monthPage, { width: contentW || '33.333%' }]}>
                <MonthView cells={cellsCurr} onPressDay={onPressDay} gridAreaH={gridAreaH} />
              </View>
              <View style={[s.monthPage, { width: contentW || '33.333%' }]}>
                <MonthView cells={cellsNext} onPressDay={onPressDay} gridAreaH={gridAreaH} />
              </View>
            </View>
          </Animated.View>
        </PanGestureHandler>
      </View>

      {/* Month/Year picker */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={HSL}>
                <Text style={s.cancelText}>取消</Text>
              </TouchableOpacity>

              <View style={s.yearRow}>
                <TouchableOpacity onPress={() => setPickYear(p => p - 1)} hitSlop={HSL}>
                  <Ionicons name="chevron-back" size={18} color="#111827" />
                </TouchableOpacity>
                <Text style={s.yearText}>{pickYear}</Text>
                <TouchableOpacity onPress={() => setPickYear(p => p + 1)} hitSlop={HSL}>
                  <Ionicons name="chevron-forward" size={18} color="#111827" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={applyPicker} hitSlop={HSL}>
                <Text style={s.doneText}>应用</Text>
              </TouchableOpacity>
            </View>

            <View style={s.monthGrid}>
              {MONTHS.map((m, i) => {
                const selected = i === pickMonth;
                return (
                  <TouchableOpacity
                    key={`${m}-${i}`}
                    style={[s.monthCell, selected && s.monthCellSelected]}
                    onPress={() => setPickMonth(i)}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.monthText, selected && s.monthTextSelected]}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/** Month view: weekday header + 7-column FlatList, height filled smoothly */
function MonthView({ cells, onPressDay, gridAreaH }) {
  const rows = Math.max(1, Math.ceil(cells.length / 7));
  const dayCellSize = Math.max(40, Math.floor(gridAreaH / rows));
  const pillSize = Math.min(38, Math.max(28, dayCellSize - 10));
  const pillRadius = Math.round(pillSize / 2);

  return (
    <View style={{ paddingBottom: 12 }}>
      {/* Week header */}
      <View style={s.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`wd-${i}`} style={s.weekCell}>{w}</Text>
        ))}
      </View>

      {/* Grid (7 columns) */}
      <FlatList
        data={cells}
        numColumns={7}
        keyExtractor={(it) => it.key}
        scrollEnabled={false}
        contentContainerStyle={s.gridList}
        renderItem={({ item }) => {
          if (item.blank) {
            return <View style={[s.dayItem, { height: dayCellSize }]} />;
          }

          // visual states
          const pillStyle = [
            { width: pillSize, height: pillSize, borderRadius: pillRadius },
            s.dayPill,
            item.hasItems && s.dayPillMarked,
            item.isToday && s.dayPillToday,
          ];
          const textStyle = [
            s.dayText,
            item.hasItems && s.dayTextMarked,
            item.isToday && s.dayTextToday,
          ];

          return (
            <TouchableOpacity
              style={[s.dayItem, { height: dayCellSize }]}
              activeOpacity={0.85}
              onPress={() => onPressDay(item.dateObj)}
            >
              <View style={pillStyle}>
                <Text style={textStyle}>{item.label}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const HSL = { top: 8, bottom: 8, left: 8, right: 8 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  /* ---------- Top bar (match Home style) ---------- */
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
  centerTap: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: 44,
  },
  barTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },

  /* ---------- Tools row ---------- */
  toolsRow: {
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10,
    flexDirection: 'row', justifyContent: 'flex-start',
  },
  // Today button: ~2x larger than before (padding & font size up)
  todayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eef2ff',
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 10,
  },
  todayText: { color: '#111827', fontWeight: '800', fontSize: 14 },

  /* ---------- Content / carousel ---------- */
  content: { flex: 1 },
  carousel: { flexDirection: 'row' },
  monthPage: { paddingTop: 0 },

  /* ---------- Week header ---------- */
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f7',
  },
  weekCell: {
    flex: 1, textAlign: 'center',
    color: '#6b7280', fontWeight: '800', letterSpacing: 0.5, fontSize: 12,
  },

  /* ---------- Grid ---------- */
  gridList: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  dayItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#f1f5f9',
  },

  /* Day pills */
  dayPill: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  dayPillMarked: { backgroundColor: '#fdecec' },
  dayPillToday:  { borderWidth: 2, borderColor: '#2563eb', backgroundColor: '#ffffff' },

  dayText: { color: '#111827', fontSize: 14, fontWeight: '700' },
  dayTextMarked: { color: '#ef4444' },
  dayTextToday:  { color: '#111827' },

  /* ---------- Month/year picker ---------- */
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems:'center', justifyContent:'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  modalHeader: {
    height: 48, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  cancelText: { color: '#ef4444', fontWeight: '700' },
  doneText:   { color: '#10b981', fontWeight: '700' },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  yearText: { fontSize: 16, fontWeight: '800', color: '#111827' },

  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12 },
  monthCell: {
    width: '25%', paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
  },
  monthCellSelected: { backgroundColor: '#eef2ff' },
  monthText: { color: '#111827', fontWeight: '600' },
  monthTextSelected: { color: '#2563eb', fontWeight: '800' },
});
