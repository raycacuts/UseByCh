// src/context/BillingContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from '../utils/analyticsSafe'; // ✅ safe wrapper

const STORAGE_KEY = 'useby_billing_v3';
const BillingCtx = createContext(null);
export const useBilling = () => useContext(BillingCtx);

const DEFAULTS = {
  freeMonthlyScanLimit: 50,
  noadsMonthlyScanLimit: 50,
  premiumMonthlyScanLimit: 1000,
};

export function BillingProvider({ children }) {
  const [planId, setPlanId] = useState('free');
  const [scansThisMonth, setScansThisMonth] = useState(0);
  const [bonusScansThisMonth, setBonusScansThisMonth] = useState(0);
  const [monthKey, setMonthKey] = useState(getMonthKey(new Date()));
  const [isBusy, setIsBusy] = useState(false);
  const [prices] = useState({ premium: 'CA$5.99', noads: 'CA$0.49' });

  // Load persisted billing state
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const j = JSON.parse(raw);
          if (j?.planId) setPlanId(j.planId);
          if (Number.isFinite(j?.scansThisMonth)) setScansThisMonth(j.scansThisMonth);
          if (Number.isFinite(j?.bonusScansThisMonth)) setBonusScansThisMonth(j.bonusScansThisMonth);
          if (j?.monthKey) setMonthKey(j.monthKey);
          logEvent('billing_load_ok', {
            plan: j?.planId || 'free',
            scans: Number(j?.scansThisMonth) || 0,
            bonus: Number(j?.bonusScansThisMonth) || 0,
            month_key: j?.monthKey || '',
          }).catch(() => {});
        } else {
          logEvent('billing_load_empty', {}).catch(() => {});
        }
      } catch (e) {
        logEvent('billing_load_error', { message: String(e?.message || e) }).catch(() => {});
      }
    })();
  }, []);

  // Month rollover check
  useEffect(() => {
    const nowKey = getMonthKey(new Date());
    if (nowKey !== monthKey) {
      logEvent('billing_month_rollover', { from: monthKey, to: nowKey }).catch(() => {});
      setMonthKey(nowKey);
      setScansThisMonth(0);
      setBonusScansThisMonth(0);
      persist({ monthKey: nowKey, scansThisMonth: 0, bonusScansThisMonth: 0 });
    }
  }, [monthKey]);

  // Track plan changes
  useEffect(() => {
    logEvent('billing_plan_change', { plan: planId }).catch(() => {});
  }, [planId]);

  function persist(next = {}) {
    const payload = { planId, scansThisMonth, bonusScansThisMonth, monthKey, ...next };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      .then(() => {
        // keep payload lightweight
        logEvent('billing_persist', {
          plan: payload.planId,
          scans: Number(payload.scansThisMonth) || 0,
          bonus: Number(payload.bonusScansThisMonth) || 0,
          month_key: payload.monthKey || '',
        }).catch(() => {});
      })
      .catch(() => {});
  }

  const baseMonthlyLimit = useMemo(() => {
    switch (planId) {
      case 'premium': return DEFAULTS.premiumMonthlyScanLimit;
      case 'noads':   return DEFAULTS.noadsMonthlyScanLimit;
      default:        return DEFAULTS.freeMonthlyScanLimit;
    }
  }, [planId]);

  const monthlyScanLimit = useMemo(
    () => (baseMonthlyLimit || 0) + (bonusScansThisMonth || 0),
    [baseMonthlyLimit, bonusScansThisMonth]
  );

  const showAds = useMemo(() => planId === 'free', [planId]);

  const scansLeft = useMemo(() =>
    Math.max(0, (monthlyScanLimit || 0) - (scansThisMonth || 0)),
    [monthlyScanLimit, scansThisMonth]
  );

  // Count a successful scan (optionally with metadata)
  function countScan(meta = {}) {
    const nowKey = getMonthKey(new Date());
    if (nowKey !== monthKey) {
      const nextMonthKey = nowKey;
      setMonthKey(nextMonthKey);
      setScansThisMonth(1);
      setBonusScansThisMonth(0);
      persist({ monthKey: nextMonthKey, scansThisMonth: 1, bonusScansThisMonth: 0 });
    } else {
      const next = (scansThisMonth || 0) + 1;
      setScansThisMonth(next);
      persist({ scansThisMonth: next });
    }
    // fire-and-forget analytics
    logEvent('scan_success', {
      method: meta.method || 'ocr',
      has_photo: meta.hasPhoto ? 1 : 0,
    }).catch(() => {});
  }

  function canScan() {
    return (scansThisMonth || 0) < (monthlyScanLimit || 0);
  }

  function grantBonusScans(amount = 5) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const next = (bonusScansThisMonth || 0) + amount;
    setBonusScansThisMonth(next);
    persist({ bonusScansThisMonth: next });
    // Removed user-facing prompt after rewarded ad; add scans silently.
    logEvent('reward_granted', { amount: amount || 0 }).catch(() => {});
    logEvent('reward_balance', { bonus_total: next }).catch(() => {});
  }

  async function downgradeToFree() {
    setIsBusy(true);
    logEvent('billing_downgrade_start', {}).catch(() => {});
    try {
      setPlanId('free');
      persist({ planId: 'free' });
      logEvent('billing_downgrade_done', {}).catch(() => {});
    } finally {
      setIsBusy(false);
    }
  }

  const value = useMemo(() => ({
    planId,
    monthlyScanLimit,
    scansThisMonth,
    scansLeft,
    showAds,
    isBusy,
    prices,
    canScan,
    countScan,
    grantBonusScans,
    downgradeToFree,
  }), [planId, monthlyScanLimit, scansThisMonth, scansLeft, showAds, isBusy, prices]);

  return <BillingCtx.Provider value={value}>{children}</BillingCtx.Provider>;
}

function getMonthKey(d) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  return `${y}-${m}`;
}
