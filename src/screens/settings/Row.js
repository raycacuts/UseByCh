// File: src/screens/settings/Row.js
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function Row({ icon, title, subtitle, onPress, disabled }) {
  return (
    <TouchableOpacity style={[styles.row, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={22} color="#111827" />
      </View>
      <View style={styles.rowMid}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fff',
  },
  rowLeft: { width: 30, alignItems: 'center' },
  rowMid: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  rowSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
});
