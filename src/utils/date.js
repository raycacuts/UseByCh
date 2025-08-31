// src/utils/date.js

export function rangeArray(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

export function clampInt(v, min, max) {
  const n = Math.round(Number(v) || 0);
  return Math.min(max, Math.max(min, n));
}

export function clearTime(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0); // local midnight
  return x;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return clearTime(d);
}

// Format a local Date as YYYY-MM-DD (no timezone math)
export function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Parse "YYYY-MM-DD" as a local calendar day (NOT UTC)
// Returns a Date at local midnight, or NaN if invalid (to match previous behavior)
export function parseISO(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  const y = Number(m[1]), mm = Number(m[2]) - 1, d = Number(m[3]);
  const dt = new Date(y, mm, d); // local
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function isBefore(a, b) {
  return clearTime(a).getTime() < clearTime(b).getTime();
}

// Day-diff that ignores DST by comparing UTC midnights
export function daysBetween(a, b) {
  const A = clearTime(a), B = clearTime(b);
  const aUTC = Date.UTC(A.getFullYear(), A.getMonth(), A.getDate());
  const bUTC = Date.UTC(B.getFullYear(), B.getMonth(), B.getDate());
  return Math.round((bUTC - aUTC) / 86400000);
}

export function signedDaysBetween(a, b) {
  return daysBetween(a, b);
}

export function addSignedYMD(date, sign, y, m, d) {
  const base = clearTime(date);
  const monthsSigned = (sign < 0 ? -1 : 1) * ((y || 0) * 12 + (m || 0));
  const baseYear = base.getFullYear();
  const baseMonth = base.getMonth();
  const targetMonthIndex = baseMonth + monthsSigned;
  const targetYear = baseYear + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(base.getDate(), maxDay);
  const afterYM = new Date(targetYear, targetMonth, day);

  const daysSigned = (sign < 0 ? -1 : 1) * (d || 0);
  return addDays(afterYM, daysSigned);
}

export function diffYMD(a, b) {
  let y = b.getFullYear() - a.getFullYear();
  let m = b.getMonth() - a.getMonth();
  let d = b.getDate() - a.getDate();

  if (d < 0) {
    const prevMonth = new Date(b.getFullYear(), b.getMonth(), 0);
    d += prevMonth.getDate();
    m -= 1;
  }
  if (m < 0) {
    m += 12;
    y -= 1;
  }
  return { y: Math.max(0, y), m: Math.max(0, m), d: Math.max(0, d) };
}

export function signedDiffYMD(a, b) {
  const A = clearTime(a), B = clearTime(b);
  if (isBefore(A, B)) {
    const pos = diffYMD(A, B);
    return { sign: 1, ...pos };
  } else if (isBefore(B, A)) {
    const pos = diffYMD(B, A);
    return { sign: -1, ...pos };
  }
  return { sign: 1, y: 0, m: 0, d: 0 };
}

export function previewSignedDays(productDate, sign, y, m, d) {
  const peekExpiry = addSignedYMD(productDate, sign, y, m, d);
  const days = signedDaysBetween(productDate, peekExpiry);
  return `${days < 0 ? '-' : ''}${Math.abs(days)}`;
}
