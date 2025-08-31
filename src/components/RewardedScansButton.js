import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import { useBilling } from '../context/BillingContext';
import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

const K = 3; // scans granted per ad
const LIVE_REWARDED_UNIT = 'ca-app-pub-2231097012853096/7882783810';
const adUnitId = __DEV__ ? TestIds.REWARDED : LIVE_REWARDED_UNIT;

export default function RewardedScansButton() {
  const { scansLeft, grantBonusScans } = useBilling();

  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rewarded, setRewarded] = useState(null);
  const subsRef = useRef([]);

  const authorized = global?.USEBY_ATT_AUTHORIZED === true;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    // Create a new ad instance whenever ATT status changes
    const ad = RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: !authorized,
    });
    setRewarded(ad);

    // Clean up previous listeners
    subsRef.current.forEach((off) => { try { off(); } catch {} });
    subsRef.current = [];

    const onLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      setLoaded(true);
      setLoading(false);
    });
    const onEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      try { grantBonusScans(K); } catch {}
    });
    const onClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setLoading(false);
      setLoaded(false);
      setTimeout(() => ad.load(), 300); // quiet preload
    });
    const onError = ad.addAdEventListener(AdEventType.ERROR, (e) => {
      setLoading(false);
      setLoaded(false);
      console.warn('Rewarded ad error:', e?.message || e);
    });

    subsRef.current = [onLoaded, onEarned, onClosed, onError];
    setLoading(true);
    ad.load();

    return () => {
      subsRef.current.forEach((off) => { try { off(); } catch {} });
      subsRef.current = [];
    };
  }, [authorized, grantBonusScans]);

  if (scansLeft > 0 || Platform.OS !== 'ios') return null;

  const onPress = async () => {
    try {
      if (!loaded) {
        setLoading(true);
        rewarded?.load();
        return;
      }
      setLoading(true);
      await rewarded?.show();
    } catch (e) {
      setLoading(false);
      Alert.alert('Ad not available', 'Please try again in a moment.');
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Out of scans?</Text>
      <Text style={styles.sub}>Watch a short ad to get +{K} scans.</Text>
      <TouchableOpacity style={styles.btn} onPress={onPress} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Watch Ad</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  title: { color: '#fff', fontWeight: '800', fontSize: 16 },
  sub: { color: '#e5e7eb', marginTop: 4, marginBottom: 10 },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 140,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
});
