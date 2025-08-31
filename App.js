// App.js
import React, { useEffect } from 'react';
import { Platform, StatusBar, AppState } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTrackingStatus, requestTrackingPermission } from 'react-native-tracking-transparency';
import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EditCategoriesScreen from './src/screens/EditCategoriesScreen';
import { ensureSeeded, patchBuiltinCategoryIcons } from './src/storage/customCategories';

// 🔹 Analytics
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

Ionicons.loadFont();

if (global.USEBY_ATT_AUTHORIZED == null) global.USEBY_ATT_AUTHORIZED = false;

// Screens
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AddItemScreen from './src/screens/AddItemScreen';
import UserGuideScreen from './src/screens/UserGuideScreen';
import { persistBuiltinIconsOnce } from './src/icons';

// Providers
import { DataProvider, useData } from './src/context/DataContext';
import { BillingProvider } from './src/context/BillingContext';

const notifyModule = Platform.select({
  ios: () => require('./src/notifications/notify.ios'),
  android: () => require('./src/notifications/notify.android'),
})();
const { initNotifications, rescheduleAll } = notifyModule;

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TZ_KEY = '@useby_last_tz';
const HOUR_KEY = '@useby_notify_hour';
const DEFAULT_HOUR = 11;

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarIcon: ({ focused, size, color }) => {
          const map = {
            Home: focused ? 'home' : 'home-outline',
            Calendar: focused ? 'calendar' : 'calendar-outline',
            Settings: focused ? 'settings' : 'settings-outline',
          };
          return <Ionicons name={map[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        listeners={{
          tabPress: () => { try { logEvent(getAnalytics(getApp()), 'tab_press', { tab: 'Home' }); } catch {} },
          focus:    () => { try { logEvent(getAnalytics(getApp()), 'tab_focus', { tab: 'Home' }); } catch {} },
          blur:     () => { try { logEvent(getAnalytics(getApp()), 'tab_blur', { tab: 'Home' }); } catch {} },
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={require('./src/screens/CalendarScreen').default}
        listeners={{
          tabPress: () => { try { logEvent(getAnalytics(getApp()), 'tab_press', { tab: 'Calendar' }); } catch {} },
          focus:    () => { try { logEvent(getAnalytics(getApp()), 'tab_focus', { tab: 'Calendar' }); } catch {} },
          blur:     () => { try { logEvent(getAnalytics(getApp()), 'tab_blur', { tab: 'Calendar' }); } catch {} },
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        listeners={{
          tabPress: () => { try { logEvent(getAnalytics(getApp()), 'tab_press', { tab: 'Settings' }); } catch {} },
          focus:    () => { try { logEvent(getAnalytics(getApp()), 'tab_focus', { tab: 'Settings' }); } catch {} },
          blur:     () => { try { logEvent(getAnalytics(getApp()), 'tab_blur', { tab: 'Settings' }); } catch {} },
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * Auto-rescheduler:
 * - initializes iOS notifications
 * - schedules all reminders at saved hour on mount
 * - re-schedules when time zone changes on foreground
 */
function AutoRescheduler() {
  const { items } = useData();

  useEffect(() => {
    let mounted = true;

    (async () => {
      try { typeof initNotifications === 'function' && initNotifications(); } catch {}

      try {
        const raw = await AsyncStorage.getItem(HOUR_KEY);
        const hourNum = Number(raw);
        const hour = Number.isInteger(hourNum) && hourNum >= 0 && hourNum <= 23 ? hourNum : DEFAULT_HOUR;
        if (typeof rescheduleAll === 'function') {
          await rescheduleAll(items || [], hour);
          try { logEvent(getAnalytics(getApp()), 'notify_reschedule_mount', { items: (items || []).length, hour }); } catch {}
        }
      } catch {}

      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        await AsyncStorage.setItem(TZ_KEY, tz);
      } catch {}
    })();

    const sub = AppState.addEventListener('change', async (state) => {
      if (!mounted) return;
      if (state === 'active') {
        try {
          const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
          const lastTz = await AsyncStorage.getItem(TZ_KEY);
          if (currentTz && currentTz !== lastTz) {
            const raw = await AsyncStorage.getItem(HOUR_KEY);
            const hourNum = Number(raw);
            const hour = Number.isInteger(hourNum) && hourNum >= 0 && hourNum <= 23 ? hourNum : DEFAULT_HOUR;
            if (typeof rescheduleAll === 'function') {
              await rescheduleAll(items || [], hour);
              try { logEvent(getAnalytics(getApp()), 'notify_reschedule_tz_change', { items: (items || []).length, hour, new_tz: currentTz, old_tz: lastTz || '' }); } catch {}
            }
            await AsyncStorage.setItem(TZ_KEY, currentTz);
          }
        } catch {}
      }
    });

    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, [items]);

  return null;
}

export default function App() {
  useEffect(() => {
    (async () => {
      try {
        try { logEvent(getAnalytics(getApp()), 'app_boot_start', { platform: Platform.OS }); } catch {}

        // Persist built-in icons once so Release builds always find them
        try { await persistBuiltinIconsOnce(); } catch {}

        // Seed custom categories from built-in ICONS on first launch (no-op if already present)
        try { await ensureSeeded(); try { logEvent(getAnalytics(getApp()), 'categories_seed', {}); } catch {} } catch {}

        // Repoint built-in categories to their persisted file:// icons (one-time patch)
        try { await patchBuiltinCategoryIcons(); } catch {}

        if (Platform.OS === 'ios') {
          let status = await getTrackingStatus();
          try { logEvent(getAnalytics(getApp()), 'att_status', { before: status || 'unknown' }); } catch {}
          if (status === 'not-determined') {
            status = await requestTrackingPermission();
            try { logEvent(getAnalytics(getApp()), 'att_prompt_result', { result: status || 'unknown' }); } catch {}
          }
          global.USEBY_ATT_AUTHORIZED = (status === 'authorized');
        } else {
          global.USEBY_ATT_AUTHORIZED = false;
          try { logEvent(getAnalytics(getApp()), 'att_status', { before: 'android_no_att' }); } catch {}
        }

        await mobileAds().setRequestConfiguration({
          maxAdContentRating: MaxAdContentRating.PG,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
        });
        await mobileAds().initialize();
        try { logEvent(getAnalytics(getApp()), 'ads_init_ok', {}); } catch {}

        setTimeout(() => {
          try {
            if (typeof initNotifications === 'function') {
              initNotifications();
              try { logEvent(getAnalytics(getApp()), 'notifications_init_called', {}); } catch {}
            }
          } catch (e) { console.warn('initNotifications error:', e); }
        }, 400);
      } catch (e) {
        console.warn('ATT/Ads init error:', e);
        try {
          await mobileAds().setRequestConfiguration({
          maxAdContentRating: MaxAdContentRating.PG,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
          });
          await mobileAds().initialize();
          try { logEvent(getAnalytics(getApp()), 'ads_init_retried', {}); } catch {}
        } catch {
          try { logEvent(getAnalytics(getApp()), 'ads_init_error', {}); } catch {}
        }

        setTimeout(() => {
          try {
            if (typeof initNotifications === 'function') {
              initNotifications();
              try { logEvent(getAnalytics(getApp()), 'notifications_init_called', { from: 'catch' }); } catch {}
            }
          } catch (err) { console.warn('initNotifications error:', err); }
        }, 400);
      }
    })();
  }, []);

  return (
    <>
      <BillingProvider>
        <DataProvider>
          <NavigationContainer
            theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#f9fafb' } }}
            onReady={() => { try { logEvent(getAnalytics(getApp()), 'nav_ready', {}); } catch {} }}
          >
            <StatusBar barStyle="dark-content" />
            <Stack.Navigator screenOptions={{ headerShown: false, headerBackTitleVisible: false }}>

              <Stack.Screen name="Root" component={Tabs} options={{ title: '' }} />

              <Stack.Screen
                name="AddItem"
                component={AddItemScreen}
                options={{ headerShown: true, title: 'Add Item', headerBackTitleVisible: false }}
              />

              {/* Hide native header to avoid duplicate top bar on Categories */}
              <Stack.Screen
                name="EditCategories"
                component={EditCategoriesScreen}
                options={{
                  headerShown: false,
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                }}
              />

              {/* Hide native header to avoid duplicate top bar on User Guide (uses in-screen bar) */}
              <Stack.Screen
                name="UserGuide"
                component={UserGuideScreen}
                options={{ headerShown: false }}
              />

              <Stack.Screen
                name="CategoryPicker"
                getComponent={() => require('./src/screens/CategoryPickerScreen').default}
                options={{
                  headerShown: false,
                  presentation: 'card',
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                }}
              />

              {/* Calendar day detail */}
              <Stack.Screen
                name="CalendarDay"
                component={require('./src/screens/CalendarDayScreen').default}
                options={{ headerShown: true, title: '' }}
              />
            </Stack.Navigator>
          </NavigationContainer>

          {/* 🔔 Auto-reschedule notifications at saved hour & on time-zone changes */}
          <AutoRescheduler />
        </DataProvider>
      </BillingProvider>
    </>
  );
}
