// src/server/index.js (ESM)
// Start local:  npm run dev
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Config ----------
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim());
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY || '';
const KEEP_UPLOADS = String(process.env.KEEP_UPLOADS || 'false').toLowerCase() === 'true';

const uploadsDir =
  process.env.UPLOADS_DIR ||
  (process.env.K_SERVICE ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads'));
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

if (!OPENAI_API_KEY) console.warn('[WARN] OPENAI_API_KEY missing — will use regex fallback for dates.');
if (!GOOGLE_VISION_API_KEY) console.warn('[WARN] GOOGLE_VISION_API_KEY missing — Vision calls will fail.');

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const upload = multer({ storage: multer.memoryStorage() });

// ---------- Helpers ----------
function toBase64(buf) { return Buffer.isBuffer(buf) ? buf.toString('base64') : ''; }
function getImageBase64FromReq(req) {
  if (req.file?.buffer) return toBase64(req.file.buffer);
  const s = req.body?.imageBase64;
  if (typeof s === 'string' && s.length >= 50) return s;
  return '';
}
async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}
async function googleVisionAnnotateBatch(imageBase64, features, fieldsParam) {
  const q = new URLSearchParams({ key: GOOGLE_VISION_API_KEY });
  if (fieldsParam) q.set('$fields', fieldsParam);
  const url = `https://vision.googleapis.com/v1/images:annotate?${q.toString()}`;
  const body = { requests: [{ image: { content: imageBase64 }, features }] };
  const res = await fetchWithTimeout(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, 8000);
  if (!res.ok) throw new Error(`Vision API HTTP ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j?.responses?.[0] || {};
}
function titleCase(s) { return (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
function collectOCRText(ocr) {
  const blocks = [];
  if (ocr?.fullTextAnnotation?.text) blocks.push(ocr.fullTextAnnotation.text);
  if (Array.isArray(ocr?.textAnnotations) && ocr.textAnnotations[0]?.description)
    blocks.push(ocr.textAnnotations[0].description);
  return blocks.join('\n').trim();
}
function saveUpload(base64) {
  const buf = Buffer.from(base64, 'base64');
  const p = path.join(uploadsDir, `upload_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  fs.writeFileSync(p, buf);
  console.log(`[SCAN] Saved upload: ${p} (${(buf.length/1024).toFixed(1)} KB)`);
  return p;
}
async function safeUnlink(p) { if (!p) return; try { await fs.promises.unlink(p); } catch {} }

// ---------- Regex dates (deterministic & fast) ----------
const MONTHS = {
  jan:1,january:1,
  feb:2,february:2,feburary:2, // common misspelling
  mar:3,march:3,
  apr:4,april:4,
  may:5,
  jun:6,june:6,
  jul:7,july:7,
  aug:8,august:8,
  sep:9,sept:9,september:9,
  oct:10,october:10,
  nov:11,november:11,
  dec:12,december:12
};
const monthToNum = s => MONTHS[s?.toLowerCase()?.replace('.', '')] || 0;

function toISO(y,m,d) {
  const yy=+y, mm=+m, dd=+d;
  const dt = new Date(Date.UTC(yy, mm-1, dd));
  if (isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear()!==yy || dt.getUTCMonth()+1!==mm || dt.getUTCDate()!==dd) return null;
  return `${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
}

// Normalize OCR quirks and unify separators
function normalizeOCR(s) {
  if (!s) return '';
  let t = s
    .replace(/[\u2010-\u2015–—―]/g, '-')     // dash variants -> '-'
    .replace(/[·•∙]/g, '.')                  // bullets -> '.'
    .replace(/[|]/g, '1')                    // pipe -> '1'
    .replace(/O(?=\d)|(?<=\d)O/g, '0')       // O near digits -> '0'
    .replace(/l(?=\d)|(?<=\d)l/g, '1')       // l near digits -> '1'
    .replace(/\s{2,}/g, ' ')
    .trim();

  // unify year month day separated by spaces into hyphen style for regex simplicity
  t = t.replace(/\b(20\d{2})\s+(0?\d|1[0-2])\s+([0-3]?\d)\b/g, '$1-$2-$3');
  t = t.replace(/\b([0-3]?\d)\s+(0?\d|1[0-2])\s+(20\d{2})\b/g, '$1-$2-$3');
  return t;
}

/**
 * extractDatesRegex:
 *  - returns { productionISO, expiryISO, bestBeforeISO, note }
 *  - detects full dates and partials:
 *      * Y-M (numeric or month name) -> assumes day=01
 *      * Y only -> assumes 01-01
 */
function extractDatesRegex(rawText) {
  const t = normalizeOCR(rawText);
  if (!t) return { productionISO:null, expiryISO:null, bestBeforeISO:null, note:null };

  const sep = '[-/.\\s]';
  let m;

  // FULL DATES (prefer these)
  // YYYY-MM-DD
  m = t.match(new RegExp(`\\b(20\\d{2})${sep}(0?[1-9]|1[0-2])${sep}(0?[1-9]|[12]\\d|3[01])\\b`));
  if (m) {
    const iso = toISO(m[1], m[2], m[3]);
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:null };
  }
  // DD-MM-YYYY
  m = t.match(new RegExp(`\\b(0?[1-9]|[12]\\d|3[01])${sep}(0?[1-9]|1[0-2])${sep}(20\\d{2})\\b`));
  if (m) {
    const iso = toISO(m[3], m[2], m[1]);
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:null };
  }
  // MM-DD-YYYY
  m = t.match(new RegExp(`\\b(0?[1-9]|1[0-2])${sep}(0?[1-9]|[12]\\d|3[01])${sep}(20\\d{2})\\b`));
  if (m) {
    const iso = toISO(m[3], m[1], m[2]);
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:null };
  }
  // Mon DD, YYYY / DD Mon YYYY / YYYY Mon DD (month names)
  m = t.match(/\b(Jan(?:uary)?|Feb(?:ruary|urary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(0?[1-9]|[12]\d|3[01])[, ]+\s*(20\d{2})\b/i);
  if (m) {
    const iso = toISO(m[3], monthToNum(m[1]), m[2]);
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:null };
  }
  m = t.match(/\b(0?[1-9]|[12]\d|3[01])\s+(Jan(?:uary)?|Feb(?:ruary|urary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s+(20\d{2})\b/i);
  if (m) {
    const iso = toISO(m[3], monthToNum(m[2]), m[1]);
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:null };
  }
  m = t.match(/\b(20\d{2})\s+(Jan(?:uary)?|Feb(?:ruary|urary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(0?[1-9]|[12]\d|3[01])\b/i);
  if (m) {
    const iso = toISO(m[1], monthToNum(m[2]), m[3]);
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:null };
  }

  // PARTIALS — Year + Month (numeric)
  m = t.match(new RegExp(`\\b(20\\d{2})${sep}(0?[1-9]|1[0-2])\\b`));
  if (m) {
    const iso = toISO(m[1], m[2], 1);
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:'assumed day=01 from year-month' };
  }
  // PARTIALS — Month + Year (numeric with spaces or separators): "09 2029", "9-2029"
  m = t.match(new RegExp(`\\b(0?[1-9]|1[0-2])${sep}(20\\d{2})\\b`));
  if (m) {
    const iso = toISO(m[2], m[1], 1);
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:'assumed day=01 from month-year' };
  }
  // PARTIALS — Month name + Year: "Feb 2029", "February 2029", "Feburary 2029"
  m = t.match(/\b(Jan(?:uary)?|Feb(?:ruary|urary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b[ ,.-]*(20\d{2})\b/i);
  if (m) {
    const iso = toISO(m[2], monthToNum(m[1]), 1);
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:'assumed day=01 from month name' };
  }
  // PARTIALS — Year + Month name: "2029 Feb"
  m = t.match(/\b(20\d{2})\b[ ,.-]*(Jan(?:uary)?|Feb(?:ruary|urary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i);
  if (m) {
    const iso = toISO(m[1], monthToNum(m[2]), 1);
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:'assumed day=01 from year + month name' };
  }

  // YEAR ONLY
  m = t.match(/\b(20\d{2})\b/);
  if (m) {
    const iso = toISO(m[1], 1, 1); // assume Jan 01
    if (iso) return { productionISO:null, expiryISO:iso, bestBeforeISO:iso, note:'assumed 01-01 from year only' };
  }

  return { productionISO:null, expiryISO:null, bestBeforeISO:null, note:null };
}

// OpenAI text-only with timeout (fallback to regex if missing)
async function extractStructWithTimeout(ocrText, timeoutMs = 3000) {
  const offline = () => {
    const r = extractDatesRegex(ocrText);
    return {
      product_name: null,
      production_date: r.productionISO,
      expiry_date: r.expiryISO,
      best_before_date: r.bestBeforeISO,
      notes: r.note || null,
    };
  };
  if (!openai) return offline();

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const system = `You extract product-related dates from OCR text.
Return strictly JSON with keys:
- product_name (string|null)
- production_date (YYYY-MM-DD|null)
- expiry_date (YYYY-MM-DD|null)
- best_before_date (YYYY-MM-DD|null)
- notes (string|null)
If the text only has a year-month (e.g., 2029/03 or Feb 2029), assume the first day of that month (YYYY-MM-01) and mention that in "notes".
If the text only has a year (e.g., 2029), assume 2029-01-01 and mention that in "notes".`;
    const resp = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'system', content: system },
        { role: 'user', content: `OCR text:\n\n${ocrText || ''}` },
      ],
      text: { format: { type: 'json_object' } },
      signal: ac.signal,
    });
    const parsed = JSON.parse(resp.output_text?.trim() || '{}');

    // backfill with regex if LLM missed
    if (!parsed?.expiry_date && !parsed?.best_before_date && !parsed?.production_date) {
      const r = extractDatesRegex(ocrText);
      parsed.production_date = parsed.production_date || r.productionISO || null;
      parsed.expiry_date = parsed.expiry_date || r.expiryISO || null;
      parsed.best_before_date = parsed.best_before_date || r.bestBeforeISO || null;
      parsed.notes = parsed.notes || r.note || null;
    }
    return parsed;
  } catch (e) {
    console.warn('[LLM timeout/fail] using regex fallback:', String(e?.message || e));
    return offline();
  } finally {
    clearTimeout(t);
  }
}

// ---------- App ----------
const app = express();
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json({ limit: '20mb' }));
app.use(morgan('combined'));

// ---------- Routes ----------
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/**
 * POST /api/analyze
 * Accepts: JSON { imageBase64 } OR multipart/form-data (field: image)
 * Returns: dates ONLY { productionDateISO?, expiryDateISO?, bestBeforeDateISO?, meta }
 * Pipeline: Vision OCR (TEXT only) → Regex → LLM (text-only, 3s cap) fallback.
 */
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  let savedPath = null;
  const t0 = Date.now();
  try {
    const imageBase64 = getImageBase64FromReq(req);
    if (!imageBase64) return res.status(400).json({ ok: false, error: 'image required' });
    if (KEEP_UPLOADS) savedPath = saveUpload(imageBase64);

    // OCR-only
    const vis = await googleVisionAnnotateBatch(
      imageBase64,
      [{ type: 'TEXT_DETECTION', maxResults: 1 }],
      'responses(fullTextAnnotation,textAnnotations)'
    );
    const tVis = Date.now();

    const ocrText = collectOCRText(vis) || '';
    console.log('[SCAN] OCR chars:', ocrText.length);

    // Regex first, then LLM if needed
    let note = null;
    let { productionISO, expiryISO, bestBeforeISO, note: rxNote } = extractDatesRegex(ocrText);
    note = rxNote || null;

    if (!productionISO && !expiryISO && !bestBeforeISO) {
      const extraction = await extractStructWithTimeout(ocrText, 3000);
      productionISO = extraction.production_date || productionISO;
      expiryISO = extraction.expiry_date || expiryISO;
      bestBeforeISO = extraction.best_before_date || bestBeforeISO;
      if (extraction.notes) note = extraction.notes;
    }

    const payload = {
      ok: true,
      productionDateISO: productionISO || null,
      expiryDateISO: expiryISO || null,
      bestBeforeDateISO: bestBeforeISO || null,
      meta: {
        notes: note || null,
        _timingMs: { total: Date.now() - t0, vision: tVis - t0 },
        _debug: {
          ocrPreview: ocrText ? `Here's the transcribed text from the image:\n\n\`\`\`\n${ocrText}\n\`\`\`` : null,
        },
      },
    };

    res.json(payload);
  } catch (err) {
    console.error('[SCAN] ERROR:', err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
  } finally {
    if (savedPath && !KEEP_UPLOADS) await safeUnlink(savedPath);
  }
});

/**
 * POST /api/analyze-name
 * Accepts: JSON { imageBase64 } OR multipart/form-data (field: image)
 * Returns: { ok, name } (name only)
 */
app.post('/api/analyze-name', upload.single('image'), async (req, res) => {
  let savedPath = null;
  try {
    const imageBase64 = getImageBase64FromReq(req);
    if (!imageBase64) return res.status(400).json({ ok: false, error: 'image required' });
    if (KEEP_UPLOADS) savedPath = saveUpload(imageBase64);

    const vis = await googleVisionAnnotateBatch(
      imageBase64,
      [{ type: 'LABEL_DETECTION', maxResults: 10 }, { type: 'OBJECT_LOCALIZATION', maxResults: 10 }],
      'responses(labelAnnotations(description,score),localizedObjectAnnotations(name,score))'
    );

    const blacklist = new Set([
      'food','fruit','vegetable','produce','dish','ingredient','meat','seafood',
      'white','black','red','green','blue','yellow','orange','purple','brown','gray','grey'
    ]);
    const labels = vis?.labelAnnotations || [];
    const objects = (vis?.localizedObjectAnnotations || []).map(o => o.name);
    const sorted = [...labels].sort((a, b) => (b.score || 0) - (a.score || 0));
    let specific = '';
    for (const l of sorted) {
      const d = String(l.description || '').toLowerCase();
      if (d && !blacklist.has(d)) { specific = l.description; break; }
    }
    if (!specific) specific = objects[0] || (sorted[0]?.description || '');

    const name = titleCase((specific || '').split(/[\s_]+/).slice(0, 3).join(' '));
    res.json({ ok: true, name });
  } catch (err) {
    console.error('[NAME] ERROR:', err);
    res.status(404).json({ ok: false, error: String(err?.message || err) });
  } finally {
    if (savedPath && !KEEP_UPLOADS) await safeUnlink(savedPath);
  }
});

/**
 * POST /api/extract-from-text
 * Body: { ocrText }
 * Returns: { ok, productionDateISO?, expiryDateISO?, bestBeforeDateISO?, name?, meta? }
 * Pipeline: OpenAI TEXT-ONLY (3s cap) + regex fallback.
 */
app.post('/api/extract-from-text', async (req, res) => {
  try {
    const ocrText = (req.body?.ocrText || '').trim();
    if (!ocrText) return res.status(400).json({ ok: false, error: 'ocrText required' });
    const extraction = await extractStructWithTimeout(ocrText, 3000);
    res.json({
      ok: true,
      productionDateISO: extraction.production_date || null,
      expiryDateISO: extraction.expiry_date || extraction.best_before_date || null,
      bestBeforeDateISO: extraction.best_before_date || null,
      name: (extraction.product_name || '').trim() || null,
      meta: { notes: extraction.notes || null },
    });
  } catch (err) {
    console.error('[TEXT-ONLY] ERROR:', err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
