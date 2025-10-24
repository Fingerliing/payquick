import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SessionDashboard } from '@/components/session/SessionDashboard';
import { Header } from '@/components/ui/Header';
import { NotificationProvider } from '@/components/session/SessionNotifications';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (!id) {
    router.replace('/(tabs)/dashboard');
    return null;
  }

  return (
    <NotificationProvider>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Header
          title="Session collaborative"
          showBackButton
          onLeftPress={() => router.back()}
        />
        <SessionDashboard
          sessionId={id}
          onLeaveSession={() => {
            router.replace('/(tabs)/dashboard');
          }}
        />
      </SafeAreaView>
    </NotificationProvider>
  );
}