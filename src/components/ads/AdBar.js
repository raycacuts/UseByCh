// src/components/ads/AdBar.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { logEvent } from '../../utils/analyticsSafe'; // ✅ safe no-op if analytics not ready

const REAL_IOS_BANNER = 'ca-app-pub-2231097012853096/4344075628';
const REAL_ANDROID_BANNER = null;

export default function AdBar() {
  const [lib, setLib] = useState(null);
  const [failed, setFailed] = useState(false);
  const [adKey, setAdKey] = useState(0); // bump to retry once

  // track if we've already logged placeholder state to avoid spamming
  const placeholderLoggedRef = useRef(false);

  // helper so analytics can never crash the UI
  const safeLog = (name, params = {}) => { try { logEvent(name, params); } catch {} };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import('react-native-google-mobile-ads');
        if (mounted) {
          setLib(mod);
          safeLog('adbar_lib_loaded', { platform: Platform.OS });
        }
      } catch (e) {
        if (mounted) setLib(null);
        safeLog('adbar_lib_load_failed', { platform: Platform.OS, message: String(e?.message || e) });
      }
    })();
    return () => { mounted = false; };
  }, []);

  const unitId = useMemo(() => {
    if (!lib) return '';
    if (__DEV__) return lib.TestIds?.BANNER || '';
    if (Platform.OS === 'ios') return REAL_IOS_BANNER;
    if (Platform.OS === 'android') return REAL_ANDROID_BANNER || lib.TestIds?.BANNER || '';
    return '';
  }, [lib]);

  // log when we resolve a (new) unitId
  const lastUnitRef = useRef('');
  useEffect(() => {
    if (unitId !== lastUnitRef.current) {
      lastUnitRef.current = unitId;
      safeLog('adbar_unit_resolved', {
        platform: Platform.OS,
        has_unit: unitId ? 1 : 0,
        is_dev: __DEV__ ? 1 : 0,
      });
    }
  }, [unitId]);

  const BannerAd = lib?.BannerAd;
  const BannerAdSize = lib?.BannerAdSize;
  const authorized = global?.USEBY_ATT_AUTHORIZED === true;

  // log impression of placeholder once if we can't render a real ad
  useEffect(() => {
    const canShow = !!(BannerAd && BannerAdSize && unitId);
    if (!canShow && !placeholderLoggedRef.current) {
      placeholderLoggedRef.current = true;
      safeLog('adbar_placeholder_shown', {
        platform: Platform.OS,
        has_lib: !!lib ? 1 : 0,
        has_unit: unitId ? 1 : 0,
      });
    }
  }, [BannerAd, BannerAdSize, unitId, lib]);

  return (
    <View style={{
      height: 60, width: '100%', backgroundColor: '#fff',
      borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {BannerAd && BannerAdSize && unitId ? (
        <BannerAd
          key={adKey}
          unitId={unitId}
          size={BannerAdSize.BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: !authorized }}
          onAdLoaded={() => {
            setFailed(false);
            safeLog('adbar_banner_loaded', {
              platform: Platform.OS,
              authorized: authorized ? 1 : 0,
              npa: authorized ? 0 : 1,
            });
            // console.log('[AdBar] Banner loaded', unitId);
          }}
          onAdFailedToLoad={(err) => {
            safeLog('adbar_banner_failed', {
              platform: Platform.OS,
              code: err?.code ?? null,
              message: String(err?.message || ''),
              first_fail: failed ? 0 : 1,
            });
            // console.log('[AdBar] Banner failed', unitId, err?.code, err?.message);
            if (!failed) {
              setFailed(true);
              safeLog('adbar_retry_scheduled', { delay_ms: 1000 });
              setTimeout(() => setAdKey(k => k + 1), 1000); // one-shot retry
            }
          }}
          onAdOpened={() => safeLog('adbar_banner_opened', { platform: Platform.OS })}
          onAdClosed={() => safeLog('adbar_banner_closed', { platform: Platform.OS })}
          onAdClicked={() => safeLog('adbar_banner_clicked', { platform: Platform.OS })}
        />
      ) : (
        <Text style={{ color: '#6b7280', fontWeight: '600' }}>
          Ad (placeholder) {unitId ? '' : '— no unit yet'}
        </Text>
      )}
    </View>
  );
}
