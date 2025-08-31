// src/components/home/SearchRow.js
import React from 'react';
import { StyleSheet, TextInput, View, TouchableOpacity } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

export default function SearchRow({ value, onChange, onClear }) {
  const safeLog = (name, params = {}) => {
    try {
      const ga = getAnalytics(getApp());
      logEvent(ga, name, params);
    } catch {}
  };

  return (
    <View style={styles.searchRow}>
      <Ionicons name="search-outline" size={18} color="#6b7280" />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={(t) => {
          safeLog('search_change', { len: (t || '').length });
          onChange?.(t);
        }}
        onFocus={() => safeLog('search_focus', {})}
        onBlur={() => safeLog('search_blur', {})}
        onSubmitEditing={() => safeLog('search_submit', { len: (value || '').length })}
        placeholder="Search by name..."
        placeholderTextColor="#9ca3af"
        autoFocus
        returnKeyType="search"
      />
      {value?.length > 0 && (
        <TouchableOpacity
          onPress={() => {
            safeLog('search_clear_click', { len: value?.length || 0 });
            onClear?.();
          }}
        >
          <Ionicons name="close-circle" size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    marginHorizontal: 12,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', paddingVertical: 0 },
});
