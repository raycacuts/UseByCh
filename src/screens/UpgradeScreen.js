// src/screens/UpgradeScreen.js
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useBilling } from '../context/BillingContext';

export default function UpgradeScreen({ navigation }) {
  const {
    planId,
    prices,
    isBusy,
    subscribe,
    restore,
    downgradeToFree,
    monthlyScanLimit,
    scansThisMonth,
    scansLeft,
  } = useBilling();

  const activeLabel =
    planId === 'premium' ? 'Premium' : planId === 'noads' ? 'No Ads' : 'Free';

  const onChoose = (target) => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Not available', 'Purchases are iOS-only for now.');
      return;
    }
    subscribe(target); // supports 'noads' and 'premium'
  };

  const PlanCard = ({
    id,
    title,
    priceText,
    perText = '/ month',
    subLine,
    bullets = [],
  }) => {
    const active = planId === id;
    return (
      <View style={[styles.card, active && styles.cardActive]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardPrice}>
            {priceText} <Text style={styles.cardPer}>{perText}</Text>
          </Text>
          {subLine ? <Text style={styles.cardSub}>{subLine}</Text> : null}
        </View>

        <View style={styles.cardBody}>
          {bullets.map((b, idx) => (
            <View key={idx} style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={18} color="#10b981" />
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          disabled={active || isBusy}
          onPress={() => onChoose(id)}
          style={[styles.cardCta, active && styles.cardCtaCurrent]}
        >
          <Text style={styles.cardCtaText}>
            {active ? 'Current Plan' : `Choose ${title}`}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation?.goBack?.()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Upgrade</Text>
        {/* spacer to center title */}
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status */}
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>CURRENT PLAN</Text>
          <Text style={styles.statusValue}>{activeLabel}</Text>
          <View style={styles.statusRow}>
            <Ionicons name="scan" size={16} color="#6b7280" />
            <Text style={styles.statusText}>
              Scans this month: {scansThisMonth} / {monthlyScanLimit} ({scansLeft} left)
            </Text>
          </View>
        </View>

        {/* No Ads plan (new) */}
        <PlanCard
          id="noads"
          title="No Ads"
          priceText={prices?.noads || 'CA$0.49'}
          subLine="Remove ad bar • 50 scans/month"
          bullets={[
            'Remove ad bar',
            '50 scans per month',
            'Keep everything else the same',
          ]}
        />

        {/* Premium plan */}
        <PlanCard
          id="premium"
          title="Premium"
          priceText={prices?.premium || 'CA$5.99'}
          subLine="No ads • 1000 scans/month"
          bullets={['No ads anywhere', '1000 scans per month', 'Priority updates']}
        />

        {/* Footer actions */}
        <View style={styles.footerBox}>
          <TouchableOpacity disabled={isBusy} onPress={restore} style={styles.footerBtn}>
            <Text style={styles.footerBtnText}>Restore Purchases</Text>
          </TouchableOpacity>

          {planId !== 'free' && (
            <TouchableOpacity
              disabled={isBusy}
              onPress={downgradeToFree}
              style={[styles.footerBtn, { marginTop: 10 }]}
            >
              <Text style={styles.footerBtnText}>Downgrade to Free</Text>
            </TouchableOpacity>
          )}

          {isBusy ? (
            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginLeft: 8, color: '#6b7280' }}>Processing…</Text>
            </View>
          ) : null}

          <Text style={styles.footnote}>
            You can cancel anytime in your App Store subscriptions. Prices shown are in your
            local currency.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  topBar: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    // Push the bar below the notch/status bar on real devices
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 0) + 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  topBarTitle: { fontSize: 18, fontWeight: '700', color: '#111827', flex: 1, textAlign: 'center' },

  content: { padding: 16, paddingBottom: 32 },

  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
  },
  statusTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  statusValue: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 2, marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  statusText: { color: '#4b5563', fontSize: 13 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 12,
    overflow: 'hidden',
  },
  cardActive: { borderColor: '#111827' },
  cardHeader: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  cardPrice: { fontSize: 20, fontWeight: '900', color: '#111827', marginTop: 4 },
  cardPer: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  cardSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cardBody: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  bulletText: { color: '#111827' },
  cardCta: { backgroundColor: '#111827', paddingVertical: 12, alignItems: 'center' },
  cardCtaCurrent: { backgroundColor: '#e5e7eb' },
  cardCtaText: { color: '#fff', fontWeight: '800' },

  footerBox: { marginTop: 18, alignItems: 'center' },
  footerBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  footerBtnText: { color: '#111827', fontWeight: '700' },
  footnote: { fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 8 },
});
