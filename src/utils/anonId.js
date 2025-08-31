// src/utils/anonId.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid'; // yarn add react-native-uuid or uuid + polyfill

const KEY = 'useby_anon_id';
export async function getAnonId() {
  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    id = uuidv4();
    await AsyncStorage.setItem(KEY, id);
  }
  return id;
}
