// src/utils/localText.js
import { Platform } from 'react-native';
import TextRecognition from 'react-native-text-recognition';
import { logEvent } from './analyticsSafe'; // safe wrapper (no-op if unavailable)

// tiny helper so analytics never crash the app
const safeLog = (name, params = {}) => { try { logEvent(name, params); } catch {} };

// Heuristic: return joined text and a crude "confidence" signal
// (Vision lib here doesn't expose confidences; we derive a proxy).
export async function recognizeLocalText(imageUri, { timeoutMs = 600 } = {}) {
  const t0 = Date.now();

  // quick exits (non-iOS or no image)
  if (Platform.OS !== 'ios') {
    safeLog('local_ocr_skip', { reason: 'not_ios', timeout_ms: timeoutMs, has_uri: !!imageUri });
    return { text: '', hasText: false, conf: 0 };
  }
  if (!imageUri) {
    safeLog('local_ocr_skip', { reason: 'no_uri', timeout_ms: timeoutMs, has_uri: false });
    return { text: '', hasText: false, conf: 0 };
  }

  safeLog('local_ocr_start', { timeout_ms: timeoutMs, has_uri: true });

  // race with timeout so we don't block scan flow
  let timedOut = false;
  const timeout = new Promise((resolve) =>
    setTimeout(() => { timedOut = true; resolve(null); }, timeoutMs)
  );

  let linesRaw = null;
  try {
    const job = TextRecognition.recognize(imageUri).catch(() => null);
    linesRaw = await Promise.race([job, timeout]);
  } catch {
    // swallow, treat as failure below
  }

  const lines = Array.isArray(linesRaw) ? linesRaw : [];
  const joined = lines.join('\n').trim();

  // crude confidence proxy: length + numbers (dates) → higher
  const digits = (joined.match(/\d/g) || []).length;
  const conf = Math.min(1, (joined.length / 80) + (digits / 20)); // 0..1 approx
  const hasText = joined.length >= 12;

  safeLog('local_ocr_done', {
    ms: Date.now() - t0,
    timed_out: timedOut ? 1 : 0,
    has_text: hasText ? 1 : 0,
    text_len: joined.length,
    digit_count: digits,
    conf: Number(conf.toFixed(3)),
  });

  return { text: joined, hasText, conf };
}
