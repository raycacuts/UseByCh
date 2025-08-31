// src/utils/analyticsSafe.js
// Safe analytics wrapper that works even if Firebase Analytics isn't available.
// Supports both modular and instance APIs, never throws, and sanitizes inputs.

let rnAnalytics = null;        // instance API: analytics().logEvent(...)
let modularAnalytics = null;   // modular API: getAnalytics, logEvent, ...
let firebaseApp = null;

try { rnAnalytics = require('@react-native-firebase/analytics').default; } catch {}
try { modularAnalytics = require('@react-native-firebase/analytics'); } catch {}
try { firebaseApp = require('@react-native-firebase/app'); } catch {}

/* ------------------------ helpers ------------------------ */

// Firebase event name rules are fairly strict; we'll keep it simple/safe.
function sanitizeEventName(name) {
  try {
    let s = String(name || '').trim();
    if (!s) return 'event';
    // lower-case, keep letters/numbers/underscores, must start with a letter
    s = s.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!/^[a-z]/.test(s)) s = `e_${s}`;
    if (s.length > 40) s = s.slice(0, 40);
    return s;
  } catch { return 'event'; }
}

// Strip undefined/null, non-finite numbers, objects/arrays -> string, clamp string length
function sanitizeParams(obj = {}) {
  const out = {};
  try {
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      const key = String(k).slice(0, 40); // keep keys short-ish
      switch (typeof v) {
        case 'number':
          if (Number.isFinite(v)) out[key] = v;
          break;
        case 'boolean':
          out[key] = v ? 1 : 0; // numbers are a bit safer across toolchains
          break;
        case 'string': {
          const s = v.length > 100 ? v.slice(0, 100) : v;
          out[key] = s;
          break;
        }
        default: {
          // fallback to string
          const s = String(v);
          out[key] = s.length > 100 ? s.slice(0, 100) : s;
        }
      }
    });
  } catch {}
  return out;
}

async function callModular(name, params) {
  try {
    if (modularAnalytics?.getAnalytics && modularAnalytics?.logEvent && firebaseApp?.getApp) {
      const ga = modularAnalytics.getAnalytics(firebaseApp.getApp());
      await modularAnalytics.logEvent(ga, name, params);
      return true;
    }
  } catch {}
  return false;
}

async function callInstance(name, params) {
  try {
    if (typeof rnAnalytics === 'function') {
      await rnAnalytics().logEvent(name, params);
      return true;
    }
  } catch {}
  return false;
}

/* ------------------------ public API ------------------------ */

/** Fire-and-forget event. Never throws. Accepts (name, params). */
export async function logEvent(name, params = {}) {
  const safeName = sanitizeEventName(name);
  const safeParams = sanitizeParams(params);
  // Prefer modular; fall back to instance
  try {
    if (await callModular(safeName, safeParams)) return;
    await callInstance(safeName, safeParams);
  } catch {}
}

/** Optional helpers (safe no-ops if analytics is missing) */
export async function setUserId(id) {
  try {
    const val = id == null ? null : String(id).slice(0, 64);
    if (modularAnalytics?.getAnalytics && firebaseApp?.getApp && modularAnalytics?.setUserId) {
      const ga = modularAnalytics.getAnalytics(firebaseApp.getApp());
      await modularAnalytics.setUserId(ga, val);
      return;
    }
    if (typeof rnAnalytics === 'function' && rnAnalytics().setUserId) {
      await rnAnalytics().setUserId(val);
      return;
    }
  } catch {}
}

export async function setUserProperties(props = {}) {
  try {
    const sp = sanitizeParams(props);
    if (modularAnalytics?.getAnalytics && firebaseApp?.getApp && modularAnalytics?.setUserProperties) {
      const ga = modularAnalytics.getAnalytics(firebaseApp.getApp());
      await modularAnalytics.setUserProperties(ga, sp);
      return;
    }
    if (typeof rnAnalytics === 'function' && rnAnalytics().setUserProperties) {
      await rnAnalytics().setUserProperties(sp);
      return;
    }
  } catch {}
}

export async function setAnalyticsCollectionEnabled(enabled = true) {
  try {
    const flag = !!enabled;
    if (modularAnalytics?.getAnalytics && firebaseApp?.getApp && modularAnalytics?.setAnalyticsCollectionEnabled) {
      const ga = modularAnalytics.getAnalytics(firebaseApp.getApp());
      await modularAnalytics.setAnalyticsCollectionEnabled(ga, flag);
      return;
    }
    if (typeof rnAnalytics === 'function' && rnAnalytics().setAnalyticsCollectionEnabled) {
      await rnAnalytics().setAnalyticsCollectionEnabled(flag);
      return;
    }
  } catch {}
}

// Default export keeps backward compatibility with `analytics.logEvent(...)`
export default {
  logEvent,
  setUserId,
  setUserProperties,
  setAnalyticsCollectionEnabled,
};
