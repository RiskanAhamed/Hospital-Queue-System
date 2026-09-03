// @ts-ignore
import { TextEncoder, TextDecoder } from 'text-encoding';

// Apply WebSocket/STOMP polyfills at the very top
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Image, Text, AppState } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '../context/AuthContext';
import LoginScreen from './login';

export const unstable_settings = {
  anchor: '(tabs)',
};

import { registerForPushNotificationsAsync } from '../utils/pushNotifications';
import * as Notifications from 'expo-notifications';
import React, { useEffect } from 'react';

function AppContent() {
  const colorScheme = useColorScheme();
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (token) {
      // Register device for background push notifications
      registerForPushNotificationsAsync().catch((e) =>
        console.error('Push notification setup failed:', e)
      );

      // Re-verify push registration when app comes from background to foreground
      const appStateSub = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          registerForPushNotificationsAsync().catch(() => {});
        }
      });

      // Listen for notification taps and navigate to the relevant screen (Deep Linking)
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          const data = response.notification.request.content.data;
          if (data && data.type) {
            if (
              data.type === 'RATE_DOCTOR' ||
              data.type === 'APPOINTMENT_CONFIRMED' ||
              data.type === 'APPOINTMENT_CANCELLED'
            ) {
              router.push('/(tabs)/appointments');
            } else if (
              data.type === 'QUEUE_TURN' ||
              data.type === 'QUEUE_NEXT' ||
              data.type === 'QUEUE_PROXIMITY_ALERT'
            ) {
              router.push('/(tabs)/queue');
            }
          }
        } catch (err) {
          console.error('Error handling notification tap navigation:', err);
        }
      });

      return () => {
        appStateSub.remove();
        subscription.remove();
      };
    }
  }, [token]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.splashLogo}
          resizeMode="contain"
        />
        <Text style={styles.splashBrand}>
          Medi<Text style={{ color: '#38BDF8' }}>Flow</Text>
        </Text>
        <Text style={styles.splashTagline}>Hospital Queue & Appointments</Text>
        <ActivityIndicator size="small" color="#38BDF8" style={{ marginTop: 24 }} />
      </View>
    );
  }

  // If not authenticated, render LoginScreen. This acts as a global auth guard.
  if (!token) {
    return <LoginScreen />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="booking" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reschedule" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}

import { LanguageProvider } from '../context/LanguageContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppContent />
        <StatusBar style="light" />
      </LanguageProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#090D16',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  splashLogo: {
    width: 88,
    height: 88,
    borderRadius: 22,
    marginBottom: 16,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  splashBrand: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  splashTagline: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
});
