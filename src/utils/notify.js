import { Platform } from 'react-native';
import notifee, { TriggerType, AndroidImportance } from '@notifee/react-native';

export async function requestNotifPermission() {
  await notifee.requestPermission();
  if (Platform.OS === 'android') {
    await notifee.createChannel({ id: 'default', name: 'Reminders', importance: AndroidImportance.HIGH });
  }
}

export async function testLocalNotification() {
  await requestNotifPermission();
  await notifee.createTriggerNotification(
    {
      title: 'UseBy test',
      body: 'This is a test notification 🎯',
      android: { channelId: 'default' },
      ios: { foregroundPresentationOptions: { banner: true, sound: true, badge: true } },
    },
    { type: TriggerType.TIMESTAMP, timestamp: Date.now() + 10_000 } // 10s from now
  );
}
