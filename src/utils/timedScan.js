// src/utils/timedScan.js
import { fromOCR } from './scanNormalizer';

export async function timedScan(rawText, ocrDurationMs = null) {
  const log = [];
  const t0 = Date.now();

  // If you already measured OCR duration externally, pass it in.
  if (ocrDurationMs != null) {
    log.push({ step: 'OCR (external)', ms: ocrDurationMs });
  }

  const t1 = Date.now();
  const norm = fromOCR(rawText);  // normalization + parsing
  const t2 = Date.now();
  log.push({ step: 'Normalization + parse', ms: t2 - t1 });

  const total = Date.now() - t0;
  log.push({ step: 'Total', ms: total });

  console.log('[timedScan]', log, 'Result:', norm);
  return { result: norm, timings: log };
}
