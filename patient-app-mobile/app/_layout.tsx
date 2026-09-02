// @ts-ignore
import { TextEncoder, TextDecoder } from 'text-encoding';

// Apply WebSocket/STOMP polyfills at the very top
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
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

  useEffect(() => {
    if (token) {
      // Register device for background push notifications
      registerForPushNotificationsAsync();

      // Listen for notification taps
      const subscription = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('User tapped on notification banner:', response.notification.request.content);
      });

      return () => subscription.remove();
    }
  }, [token]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38BDF8" />
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

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppContent />
      <StatusBar style="light" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#090D16',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
