// src/screens/addItem/NotesModal.js
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import styles from './styles';

export default function NotesModal({ visible, notes, setNotes, onClose }) {
  function submitNotes() {
    setNotes((cur) => (cur || '').replace(/\n+$/, ''));
    onClose();
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.notesContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.notesHeader}>
          <Text style={styles.notesTitle}>备注</Text>
          <TouchableOpacity onPress={submitNotes} style={styles.sheetDone}>
            <Text style={styles.sheetDoneText}>完成</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.notesEditorBox}>
          <TextInput
            style={styles.notesEditor}
            value={notes}
            onChangeText={setNotes}
            placeholder="输入备注..."
            multiline
            autoFocus
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={submitNotes}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
