// src/components/home/TopBar.js
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

export default function TopBar({
  onPressFilter,
  onPressClear,              // preferred prop
  onPressClearExpired,       // legacy prop (kept for compatibility)
  onToggleSearch,
  searchOpen = false,
}) {
  const handleClear = onPressClear || onPressClearExpired;

  const handleFilterPress = () => {
    try { logEvent(getAnalytics(getApp()), 'topbar_filter_click', {}); } catch {}
    onPressFilter?.();
  };

  const handleClearPress = () => {
    try { logEvent(getAnalytics(getApp()), 'topbar_clear_click', {}); } catch {}
    handleClear?.();
  };

  const handleSearchToggle = () => {
    const next = !searchOpen;
    try { logEvent(getAnalytics(getApp()), 'topbar_search_toggle', { open: next ? 1 : 0 }); } catch {}
    onToggleSearch?.();
  };

  return (
    <View style={styles.wrap}>
      {/* Filter (old Ionicon, pale, same layout) */}
      <TouchableOpacity
        onPress={handleFilterPress}
        style={styles.iconBtn}
        hitSlop={HITSLOP}
        accessibilityRole="button"
        accessibilityLabel="Filter"
      >
        <Ionicons name="filter-outline" size={ICON_SIZE} color={ICON_PALE} />
      </TouchableOpacity>

      {/* Clear — red pill with custom trash glyph */}
      <TouchableOpacity
        onPress={handleClearPress}
        style={styles.clearBtn}
        hitSlop={HITSLOP}
        accessibilityRole="button"
        accessibilityLabel="Clear"
      >
        <TrashIcon />
      </TouchableOpacity>

      {/* Search / Close (old Ionicons, pale, same layout) */}
      <TouchableOpacity
        onPress={handleSearchToggle}
        style={styles.iconBtn}
        hitSlop={HITSLOP}
        accessibilityRole="button"
        accessibilityLabel={searchOpen ? 'Close search' : 'Search'}
      >
        <Ionicons
          name={searchOpen ? 'close-outline' : 'search-outline'}
          size={ICON_SIZE}
          color={ICON_PALE}
        />
      </TouchableOpacity>
    </View>
  );
}

/* ---------- Icon constants ---------- */
const ICON_SIZE = 26;                           // matches bottom bar visual size
const ICON_PALE = 'rgba(17,24,39,0.45)';        // #111827 at ~45% opacity

/* ---------- Non-font trash icon for the red pill ---------- */
function TrashIcon() {
  return (
    <View style={styles.trashBox}>
      <View style={styles.trashLid} />
      <View style={styles.trashHandle} />
      <View style={styles.trashBody} />
    </View>
  );
}

/* ---------- Styles ---------- */
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  wrap: {
    height: 56,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },

  // circular tap target to mirror bottom bar feel
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },

  // Red pill button for CLEAR
  clearBtn: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#fee2e2', // pale red background
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Trash glyph (red) drawn in the pill */
  trashBox: {
    width: 18, height: 18,
    alignItems: 'center',
  },
  trashLid: {
    position: 'absolute',
    top: 1,
    width: 14, height: 2, borderRadius: 1,
    backgroundColor: '#ef4444',
  },
  trashHandle: {
    position: 'absolute',
    top: -1,
    width: 6, height: 2, borderRadius: 1,
    backgroundColor: '#ef4444',
  },
  trashBody: {
    position: 'absolute',
    top: 4,
    width: 12, height: 12, borderRadius: 2,
    backgroundColor: '#ef4444',
  },
});
