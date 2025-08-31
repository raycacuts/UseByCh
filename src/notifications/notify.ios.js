// src/notifications/notify.ios.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import { logEvent } from '../utils/analyticsSafe'; // ✅ safe, never throws

const pad2 = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function clearTime(d) { const nd = new Date(d); nd.setHours(0, 0, 0, 0); return nd; }
function atHourOf(d, hour = 11) {
  const nd = new Date(d);
  const hh = Number.isInteger(hour) ? Math.max(0, Math.min(23, hour)) : 11;
  nd.setHours(hh, 0, 0, 0);
  return nd;
}

// tiny helper to swallow analytics errors
const safeLog = (name, params = {}) => { try { logEvent(name, params); } catch {} };

export function initNotifications() {
  // iOS prompt (safe to call multiple times)
  try {
    // log that we’re requesting permissions
    safeLog('ios_notify_request_permissions_start', {});
    const p = PushNotificationIOS.requestPermissions({
      alert: true, badge: true, sound: true,
    });
    // log outcome if the promise resolves/rejects
    if (p && typeof p.then === 'function') {
      p.then((res) => {
        // res can be an object like { alert: 1, badge: 1, sound: 1 }
        safeLog('ios_notify_request_permissions_result', {
          alert: Number(!!res?.alert) || 0,
          badge:  Number(!!res?.badge)  || 0,
          sound:  Number(!!res?.sound)  || 0,
        });
      }).catch((e) => {
        safeLog('ios_notify_request_permissions_error', { message: String(e?.message || e) });
      });
    }
  } catch (e) {
    safeLog('ios_notify_request_permissions_error', { message: String(e?.message || e) });
  }
}

export function cancelAllScheduledReminders() {
  try {
    PushNotificationIOS.removeAllPendingNotificationRequests();
    safeLog('notify_cancel_all_scheduled', {});
  } catch (e) {
    safeLog('notify_cancel_all_scheduled_error', { message: String(e?.message || e) });
  }
}

/**
 * Re-schedule all daily reminders at a given hour (0–23).
 * items: [{ name, expiryDate, remindDays }, ...]
 */
export async function rescheduleAll(items = [], hour = null) {
  // begin
  safeLog('notify_reschedule_begin', {
    items_count: Array.isArray(items) ? items.length : 0,
    hour: (hour == null ? -1 : Number(hour)),
  });

  cancelAllScheduledReminders();

  // Resolve desired hour
  let desiredHour = 11;
  try {
    if (hour == null) {
      const raw = await AsyncStorage.getItem('@useby_notify_hour');
      const h = Number(raw);
      if (Number.isInteger(h) && h >= 0 && h <= 23) desiredHour = h;
    } else {
      desiredHour = Number.isInteger(hour) ? Math.max(0, Math.min(23, hour)) : 11;
    }
  } catch {}

  const now = new Date();
  const perDay = new Map();

  let considered = 0;
  let skippedPast = 0;

  for (const it of items || []) {
    if (!it?.expiryDate || typeof it?.remindDays !== 'number') continue;
    const exp = new Date(it.expiryDate);
    if (isNaN(exp)) continue;

    considered += 1;

    const notifyDay = clearTime(new Date(exp));
    notifyDay.setDate(notifyDay.getDate() - it.remindDays);

    const fireDate = atHourOf(notifyDay, desiredHour);
    if (fireDate < now) { skippedPast += 1; continue; }

    const k = dateKey(notifyDay);
    if (!perDay.has(k)) perDay.set(k, []);
    perDay.get(k).push(it);
  }

  let daysScheduled = 0;
  let notificationsQueued = 0;

  perDay.forEach((list, k) => {
    const [y, m, d] = k.split('-').map((s) => parseInt(s, 10));
    const fireDate = atHourOf(new Date(y, m - 1, d), desiredHour);

    const count = list.length;
    const names = list.map((x) => x.name || 'Unnamed').slice(0, 5).join(', ');
    const extra = count > 5 ? ` +${count - 5} more` : '';
    const title = 'UseBy reminder';
    const body = count === 1
      ? `1 item needs attention today: ${names}`
      : `${count} items need attention today: ${names}${extra}`;

    const identifier = `${y}${pad2(m)}${pad2(d)}`;

    try {
      PushNotificationIOS.addNotificationRequest({
        id: identifier,
        title, body, fireDate,
        repeats: false,
        userInfo: { kind: 'useby-day', dateKey: k },
      });
      daysScheduled += 1;
      notificationsQueued += 1; // one per day in this design
      safeLog('notify_schedule_day', {
        date_key: k,
        items_in_day: count,
        hour: desiredHour,
      });
    } catch (e) {
      safeLog('notify_schedule_day_error', {
        date_key: k,
        items_in_day: count,
        message: String(e?.message || e),
      });
    }
  });

  // done
  safeLog('notify_reschedule_done', {
    considered,
    skipped_past: skippedPast,
    days_scheduled: daysScheduled,
    hour: desiredHour,
    pending_requests: notificationsQueued,
  });
}
