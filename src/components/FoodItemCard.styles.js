// src/components/FoodItemCard.styles.js
import { StyleSheet, Platform } from 'react-native';

export function borderColor(days) {
  if (typeof days !== 'number') return 'transparent';
  if (days < 0) return '#ef4444';
  return 'transparent';
}

export function statusColor(days) {
  if (typeof days !== 'number') return '#6b7280';
  if (days < 0) return '#ef4444';
  if (days <= 7) return '#f59e0b';
  return '#10b981';
}

export function formatRemaining(days) {
  if (typeof days !== 'number' || Number.isNaN(days)) return '—';
  const sign = days < 0 ? '-' : '';
  const abs = Math.abs(days);
  if (abs >= 365) return `${sign}${Math.round(abs / 365)} y`;
  if (abs >= 30)  return `${sign}${Math.round(abs / 30)} m`;
  return `${sign}${abs} d`;
}

const ICON_SIZE = 72;

export const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderRadius: 12,
    marginBottom: 6,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },

  leftCol: { width: 96, alignItems: 'center' },
  expInline: { fontSize: 10, fontWeight: '700', marginBottom: 6 },

  iconWrap: {
    width: ICON_SIZE, height: ICON_SIZE,
    borderRadius: 12, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  iconImg: { width: '100%', height: '100%' },

  // Make the middle column fill the row height so we can push name to top
  // and the duration/category row to the bottom.
  middleCol: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 6,
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },

  // Larger name
  name: { fontSize: 20, fontWeight: '700', color: '#111827' },

  // Duration/category row pinned to bottom of middleCol
  remainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0, // spacing handled by space-between above
  },

  // Equal-width boxes
// AFTER — fixed width so category always aligns
durationBox: {
  width: 88,               // tweak this (e.g., 80–100) to taste
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  marginRight: 1,
},


categoryBox: {
  flexGrow: 1,             // category takes remaining space
  flexShrink: 1,
  flexBasis: 0,
  minWidth: 0,             // allow text to ellipsize instead of pushing layout
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
},


  // Larger duration text
  remainText: { fontSize: 16 },

  // Category badge: icon + name
  catIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 4,
    marginRight: 1,
    marginLeft: 1, // left inset when icon exists
  },
  // Invisible spacer to keep text aligned when there's no icon
  catIconSpacer: {
    width: 32,
    height: 32,
    marginRight: 1,
    marginLeft: 1,
  },
  // Larger category text
  catText: {
    fontSize: 14,
    color: '#6b7280',
    flexShrink: 1,
    maxWidth: '85%',
  },

  swipeDeleteWrap: {
    width: 72,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    marginBottom: 12,
  },
});
