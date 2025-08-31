import { Platform, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },

  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 16 },
  bigIcon: {
    width: 128,
    height: 128,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bigImg: { width: '100%', height: '100%' },
  rightCol: { flex: 1 },

  nameInput: {
    height: 72,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    backgroundColor: '#fff',
  },
  requiredField: { borderWidth: 2, borderColor: '#111827' },

  rightButtons: {
    height: 48,
    marginTop: 8,
    flexDirection: 'row',
    gap: 10,
  },

  actionBtn: {
    width: '100%',
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
  scanBtn: { backgroundColor: '#2563eb' },
  catImg: { width: 24, height: 24 },

  formRow: { marginBottom: 12 },

  requiredLabel: { fontWeight: '700', marginBottom: 6, color: '#111827', fontSize: 16 },
  minorLabel: { fontWeight: '500', marginBottom: 6, color: '#9ca3af', fontSize: 13 },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fieldText: { fontSize: 16, color: '#111827' },

  fieldMinor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fieldMinorText: { fontSize: 14, color: '#4b5563' },

  inputMinor: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  notes: { height: 100, textAlignVertical: 'top', marginTop: 4 },

  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  saveBtn: { backgroundColor: '#16a34a' },
  btnText: { color: '#fff', fontWeight: '700' },

  // Sheets
  sheetContainer: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'white',
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  sheetTitle: { fontSize: 16, fontWeight: '600' },
  sheetDone: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#111827' },
  sheetDoneText: { color: 'white', fontWeight: '700' },
  pickerContainer: { paddingHorizontal: 16, paddingBottom: 8 },

  signRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 10 },
  signChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: '#e5e7eb' },
  signChipActive: { backgroundColor: '#111827' },
  signChipText: { fontWeight: '800', color: '#111827' },
  signChipTextActive: { color: 'white' },
  durationHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 4 },
  durationHeader: { flex: 1, textAlign: 'center', color: '#6b7280', fontWeight: '600' },
  durationRow: { flexDirection: 'row', gap: 8 },
  numberPicker: { flex: 1 },

  notesContainer: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 48 : 16 },
  notesHeader: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notesTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  notesEditorBox: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  notesEditor: { flex: 1, fontSize: 16, textAlignVertical: 'top' },

  catSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    justifyContent: 'space-between',
  },
  catTitle: { fontSize: 16, fontWeight: '600' },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f3f4f6' },
  clearText: { color: '#111827', fontWeight: '600' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 6 },
  catCell: { width: '25%', padding: 10, alignItems: 'center', justifyContent: 'center' },
  catGridImg: { width: 44, height: 44 },
});

export default styles;
