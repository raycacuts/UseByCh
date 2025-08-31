// src/utils/api.js
// For local dev you can override with: global.USEBY_API_BASE = 'http://192.168.1.77:4000';

import { logEvent } from './analyticsSafe'; // ✅ safe, no-op if analytics not available

const DEFAULT_BASE = 'https://useby-api-z3d6mrsghq-uc.a.run.app'; // <-- your Cloud Run URL
// const DEFAULT_BASE = 'http://192.168.1.77:4000'; // <-- local URL

const BASE_URL =
  (typeof __DEV__ !== 'undefined' && __DEV__ && global?.USEBY_API_BASE) ||
  (typeof process !== 'undefined' && process?.env?.USEBY_API_BASE) ||
  DEFAULT_BASE;

// ---- tiny helper to swallow analytics errors ----
const safeLog = (name, params = {}) => { try { logEvent(name, params); } catch {} };
const apiHost = (() => { try { return new URL(BASE_URL).host; } catch { return String(BASE_URL); } })();

function checkResp(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Helper: decide whether to send multipart (preferred) or JSON base64
function hasUriImage(image) {
  return image && typeof image === 'object' && typeof image.uri === 'string' && image.uri.length > 0;
}
function hasBase64String(image) {
  return typeof image === 'string' && image.length >= 50;
}

// Small helper to honor AbortController on RN fetch
function withSignal(init, signal) {
  return signal ? { ...init, signal } : init;
}

export async function ping() {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/ping`);
    const out = await checkResp(res);
    safeLog('api_ping_success', { ms: Date.now() - t0, host: apiHost });
    return out;
  } catch (e) {
    safeLog('api_ping_error', { ms: Date.now() - t0, host: apiHost, message: String(e?.message || e) });
    throw e;
  }
}

/**
 * analyzeImage (DATES-ONLY)
 * Input can be:
 *  - base64 string   (backward compatible)
 *  - { uri, type?, name? } object (preferred; sends multipart to save bandwidth)
 *
 * Accepts optional { signal } as the second argument OR inside options when first arg is an object.
 * Returns ONLY:
 *   { productionDateISO, expiryDateISO, bestBeforeDateISO, meta }
 */
export async function analyzeImage(image, opts = {}) {
  const signal = opts?.signal;

  // pre-log intent
  const transport =
    hasUriImage(image) ? 'multipart' :
    hasBase64String(image) ? 'json' : 'invalid';
  const t0 = Date.now();
  safeLog('api_analyze_start', { host: apiHost, transport });

  if (hasUriImage(image)) {
    try {
      const file = {
        uri: image.uri,
        name: image.name || 'scan.jpg',
        type: image.type || 'image/jpeg',
      };
      const form = new FormData();
      form.append('image', file);

      const res = await fetch(`${BASE_URL}/api/analyze`, withSignal({
        method: 'POST',
        body: form,
        // NOTE: do NOT set Content-Type manually for multipart; RN will set boundary.
      }, signal));
      const data = await checkResp(res);

      const out = {
        productionDateISO: data?.productionDateISO ?? null,
        expiryDateISO:
          data?.expiryDateISO ??
          data?.bestBeforeDateISO ??
          data?.updates?.expiryDate ??
          data?.updates?.bestBeforeDate ??
          null,
        bestBeforeDateISO: data?.bestBeforeDateISO ?? null,
        meta: data?.meta ?? null,
      };

      safeLog('api_analyze_success', {
        ms: Date.now() - t0,
        host: apiHost,
        transport: 'multipart',
        has_production: Number(!!out.productionDateISO),
        has_expiry: Number(!!out.expiryDateISO),
        has_best_before: Number(!!out.bestBeforeDateISO),
      });
      return out;
    } catch (e) {
      safeLog('api_analyze_error', { ms: Date.now() - t0, host: apiHost, transport: 'multipart', message: String(e?.message || e) });
      throw e;
    }
  }

  if (!hasBase64String(image)) {
    const err = new Error('imageBase64 required (string >= 50 chars) or pass an object with { uri }');
    safeLog('api_analyze_error', { ms: Date.now() - t0, host: apiHost, transport, message: err.message });
    throw err;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/analyze`, withSignal({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: image }),
    }, signal));
    const data = await checkResp(res);

    const out = {
      productionDateISO: data?.productionDateISO ?? data?.updates?.productionDate ?? null,
      expiryDateISO:
        data?.expiryDateISO ??
        data?.bestBeforeDateISO ??
        data?.updates?.expiryDate ??
        data?.updates?.bestBeforeDate ??
        null,
      bestBeforeDateISO: data?.bestBeforeDateISO ?? null,
      meta: data?.meta ?? null,
    };

    safeLog('api_analyze_success', {
      ms: Date.now() - t0,
      host: apiHost,
      transport: 'json',
      base64_len: (typeof image === 'string' ? image.length : 0),
      has_production: Number(!!out.productionDateISO),
      has_expiry: Number(!!out.expiryDateISO),
      has_best_before: Number(!!out.bestBeforeDateISO),
    });
    return out;
  } catch (e) {
    safeLog('api_analyze_error', { ms: Date.now() - t0, host: apiHost, transport: 'json', message: String(e?.message || e) });
    throw e;
  }
}

/**
 * analyzeImageForName (NAME-ONLY)
 * Input can be:
 *  - base64 string
 *  - { uri, type?, name? } object (preferred; multipart)
 *
 * Accepts optional { signal } as the second argument.
 * Returns ONLY: { name }
 */
export async function analyzeImageForName(image, opts = {}) {
  const signal = opts?.signal;
  const transport =
    hasUriImage(image) ? 'multipart' :
    hasBase64String(image) ? 'json' : 'invalid';
  const t0 = Date.now();
  safeLog('api_name_start', { host: apiHost, transport });

  if (hasUriImage(image)) {
    try {
      const file = {
        uri: image.uri,
        name: image.name || 'scan.jpg',
        type: image.type || 'image/jpeg',
      };
      const form = new FormData();
      form.append('image', file);

      const res = await fetch(`${BASE_URL}/api/analyze-name`, withSignal({
        method: 'POST',
        body: form,
      }, signal));
      const data = await checkResp(res);
      const out = { name: data?.name ?? '' };
      safeLog('api_name_success', { ms: Date.now() - t0, host: apiHost, transport: 'multipart', name_len: (out.name || '').length });
      return out;
    } catch (e) {
      safeLog('api_name_error', { ms: Date.now() - t0, host: apiHost, transport: 'multipart', message: String(e?.message || e) });
      throw e;
    }
  }

  if (!hasBase64String(image)) {
    const err = new Error('imageBase64 required (string >= 50 chars) or pass an object with { uri }');
    safeLog('api_name_error', { ms: Date.now() - t0, host: apiHost, transport, message: err.message });
    throw err;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/analyze-name`, withSignal({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: image }),
    }, signal));
    const data = await checkResp(res);
    const out = { name: data?.name ?? '' };
    safeLog('api_name_success', { ms: Date.now() - t0, host: apiHost, transport: 'json', base64_len: (typeof image === 'string' ? image.length : 0), name_len: (out.name || '').length });
    return out;
  } catch (e) {
    safeLog('api_name_error', { ms: Date.now() - t0, host: apiHost, transport: 'json', message: String(e?.message || e) });
    throw e;
  }
}

/**
 * TEXT-ONLY extraction (for iOS Apple Vision path).
 * Body: { ocrText }, returns dates/name inferred from text only.
 */
export async function extractFromText(ocrText, opts = {}) {
  const txt = (ocrText || '').trim();
  if (!txt) throw new Error('ocrText required');

  const t0 = Date.now();
  safeLog('api_extract_text_start', { host: apiHost, text_len: txt.length });

  try {
    const res = await fetch(`${BASE_URL}/api/extract-from-text`, withSignal({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ocrText: txt }),
    }, opts?.signal));
    const out = await checkResp(res);
    safeLog('api_extract_text_success', { ms: Date.now() - t0, host: apiHost });
    return out;
  } catch (e) {
    safeLog('api_extract_text_error', { ms: Date.now() - t0, host: apiHost, message: String(e?.message || e) });
    throw e;
  }
}
