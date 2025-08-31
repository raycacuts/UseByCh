// src/components/common/CategoryBottomSheet.js
import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View, Image } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { iconSourceForItem, keyForItem } from '../../utils/categoryIcons';

const { height: SCREEN_H } = Dimensions.get('window');
const ROW_H = 56;

export default function CategoryBottomSheet({
  visible,
  onClose,
  title = '选择分类',
  initialKey = 'none',
  items = [],                  // [{id, name, iconUri?, builtinKey?, categoryIconKey?, isNone?}, ...]
  onConfirm,                   // (selectedKey) => void
  transparentBackdrop = true,  // true => no dim, tap outside closes
}) {
  const [selectedKey, setSelectedKey] = useState(initialKey);

  useEffect(() => { if (visible) setSelectedKey(initialKey || 'none'); }, [visible, initialKey]);

  const data = useMemo(() => items || [], [items]);

  const isSelected = (it) => keyForItem(it) === selectedKey;

  const onRowPress = (it) => setSelectedKey(keyForItem(it));

  const handleDone = () => { onConfirm?.(selectedKey); onClose?.(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* outside tap */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.sheetBackdrop, !transparentBackdrop && { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
            <Text style={styles.sheetCancel}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>{title}</Text>
          <TouchableOpacity onPress={handleDone} hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
            <Text style={styles.sheetDone}>完成</Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        <FlatList
          data={data}
          keyExtractor={(it) => String(it.id)}
          getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
          renderItem={({ item }) => {
            const selected = isSelected(item);
            const src = iconSourceForItem(item);
            const isUser = !!item.iconUri;

            return (
              <TouchableOpacity style={styles.row} onPress={() => onRowPress(item)} activeOpacity={0.85}>
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
                  {selected
                    ? <View style={styles.checkBoxChecked}><Ionicons name="checkmark" size={14} color="#fff" /></View>
                    : <View style={styles.checkBox} />}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: { flex: 1, backgroundColor: 'transparent' },
  sheet: {
    height: Math.min(SCREEN_H * 0.88, 540),
    backgroundColor: '#fff',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderColor: '#e5e7eb',
  },
  sheetHeader: {
    height: 48, flexDirection:'row', alignItems:'center', justifyContent:'space-between',
    paddingHorizontal: 12, borderBottomWidth:1, borderBottomColor:'#f0f0f0',
  },
  sheetCancel: { color:'#ef4444', fontWeight:'700', fontSize:16 },
  sheetTitle:  { color:'#111827', fontWeight:'700', fontSize:16 },
  sheetDone:   { color:'#ef4444', fontWeight:'700', fontSize:16 },
  row: {
    height: ROW_H, flexDirection:'row', alignItems:'center', paddingHorizontal: 8, backgroundColor:'#fff',
  },
  sep: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 64 },
  rowLeft: { flexDirection:'row', alignItems:'center', flex:1, gap:10 },
  rowIconWrap: {
    width: 36, height: 36, borderRadius: 8, backgroundColor:'#f3f4f6',
    alignItems:'center', justifyContent:'center', overflow:'hidden', marginLeft: 6,
  },
  rowIconSmall: { width: 24, height: 24, resizeMode:'contain' }, // built-in
  rowIconFull:  { width: 36, height: 36, resizeMode:'cover' },   // user
  rowText: { color:'#111827', fontSize:16, flexShrink:1 },
  rowRight: { width: 40, alignItems:'flex-end', paddingRight: 6 },
  checkBox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 1,
    borderColor: '#cbd5e1', backgroundColor: '#fff',
  },
  checkBoxChecked: {
    width: 22, height: 22, borderRadius: 4, backgroundColor: '#ef4444',
    alignItems:'center', justifyContent:'center',
  },
});
