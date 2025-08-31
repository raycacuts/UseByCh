// src/screens/addItem/PickerSheet.js
import React from 'react';
import { Platform, View, Text, TouchableOpacity, Pressable } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import styles from './styles';
import { previewSignedDays, rangeArray } from '../../utils/date';

export default function PickerSheet({
  target,
  productDate,
  tempDate, setTempDate,
  tempNumber, setTempNumber,
  tempSign, setTempSign,
  tempY, setTempY,
  tempM, setTempM,
  tempD, setTempD,
  onConfirm,
  onClose,
}) {
  const title =
    target === 'product' ? '选择生产日期' :
    target === 'expiry' ? '选择到期日期' :
    target === 'duration' ? '选择保质期' :
    '提前提醒';

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' }}>
      {/* Transparent, tappable area to close — NO dimming */}
      <Pressable
        onPress={onClose}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' }}
      />

      {/* Sheet */}
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <TouchableOpacity onPress={onConfirm} style={styles.sheetDone}>
            <Text style={styles.sheetDoneText}>完成</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pickerContainer}>
          {(target === 'product' || target === 'expiry') && (
            <DateTimePicker
              value={tempDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              locale="zh-CN"
              onChange={(e, d) => {
                if (Platform.OS === 'android') {
                  if (e.type === 'dismissed') return;
                  if (e.type === 'set' && d) {
                    setTempDate(d);
                    onConfirm();
                  }
                } else if (d) {
                  setTempDate(d);
                }
              }}
              maximumDate={new Date(2100, 11, 31)}
              minimumDate={new Date(2000, 0, 1)}
              style={{ alignSelf: 'stretch' }}
            />
          )}

          {target === 'duration' && (
            <View>
              <View style={styles.signRow}>
                <TouchableOpacity
                  onPress={() => setTempSign(1)}
                  style={[styles.signChip, tempSign === 1 && styles.signChipActive]}
                >
                  <Text style={[styles.signChipText, tempSign === 1 && styles.signChipTextActive]}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTempSign(-1)}
                  style={[styles.signChip, tempSign === -1 && styles.signChipActive]}
                >
                  <Text style={[styles.signChipText, tempSign === -1 && styles.signChipTextActive]}>−</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.durationHeaderRow}>
                <Text style={styles.durationHeader}>年</Text>
                <Text style={styles.durationHeader}>月</Text>
                <Text style={styles.durationHeader}>天</Text>
              </View>

              <View style={styles.durationRow}>
                <Picker style={styles.numberPicker} selectedValue={tempY} onValueChange={setTempY}>
                  {rangeArray(0, 120).map((n) => <Picker.Item key={`y${n}`} label={`${n}`} value={n} />)}
                </Picker>
                <Picker style={styles.numberPicker} selectedValue={tempM} onValueChange={setTempM}>
                  {rangeArray(0, 120).map((n) => <Picker.Item key={`m${n}`} label={`${n}`} value={n} />)}
                </Picker>
                <Picker style={styles.numberPicker} selectedValue={tempD} onValueChange={setTempD}>
                  {rangeArray(0, 366).map((n) => <Picker.Item key={`d${n}`} label={`${n}`} value={n} />)}
                </Picker>
              </View>

              <Text style={{ textAlign: 'center', color: '#6b7280', marginTop: 6 }}>
                (= {previewSignedDays(productDate, tempSign, tempY, tempM, tempD)} 天)
              </Text>
            </View>
          )}

          {/* UPDATED: Remind uses Y/M/D spinners (no sign) */}
          {target === 'remind' && (
            <View>
              <View style={styles.durationHeaderRow}>
                <Text style={styles.durationHeader}>年</Text>
                <Text style={styles.durationHeader}>月</Text>
                <Text style={styles.durationHeader}>天</Text>
              </View>

              <View style={styles.durationRow}>
                <Picker style={styles.numberPicker} selectedValue={tempY} onValueChange={setTempY}>
                  {rangeArray(0, 120).map((n) => <Picker.Item key={`ry${n}`} label={`${n}`} value={n} />)}
                </Picker>
                <Picker style={styles.numberPicker} selectedValue={tempM} onValueChange={setTempM}>
                  {rangeArray(0, 120).map((n) => <Picker.Item key={`rm${n}`} label={`${n}`} value={n} />)}
                </Picker>
                <Picker style={styles.numberPicker} selectedValue={tempD} onValueChange={setTempD}>
                  {rangeArray(0, 366).map((n) => <Picker.Item key={`rd${n}`} label={`${n}`} value={n} />)}
                </Picker>
              </View>

              <Text style={{ textAlign: 'center', color: '#6b7280', marginTop: 6 }}>
                将在到期日前按以上 年/月/天 的提前量进行提醒。

              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
