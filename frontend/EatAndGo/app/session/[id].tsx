import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SessionDashboard } from '@/components/session/SessionDashboard';
import { Header } from '@/components/ui/Header';
import { NotificationProvider } from '@/components/session/SessionNotifications';
import { useSession } from '@/contexts/SessionContext';
import {
  useSessionArchiveCountdown,
  useInactivityWarning,
} from '@/hooks/session/useSessionArchiving';
import { useSessionWebSocket } from '@/hooks/session/useSessionWebSocket';
import { collaborativeSessionService } from '@/services/collaborativeSessionService';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const redirectedRef = useRef(false);

  // ── Session du contexte global (source de vérité fiable) ──
  const { session: ctxSession, isSessionInitialized, clearSession } = useSession();

  // ── WebSocket pour écouter la fermeture en temps réel ──
  const { on } = useSessionWebSocket(id ?? null);

  // ── Countdown avant archivage (session déjà completed) ──
  const { isArchived, timeUntilArchive } = useSessionArchiveCountdown(id ?? null);

  // ── Avertissement d'inactivité (session active/locked) ──
  const { showInactivityWarning, inactivityFormattedTime, isInactivityExpired } = useInactivityWarning(id ?? null);

  // ── Helper : rediriger une seule fois ──
  const redirectToHome = () => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    clearSession();
    router.replace('/(client)');
  };

  // ── 1. Vérification au montage : la session existe-t-elle encore ? ──
  useEffect(() => {
    if (!id || redirectedRef.current) return;
    let cancelled = false;

    const checkSessionExists = async () => {
      try {
        const session = await collaborativeSessionService.getSession(id);
        if (!cancelled && ['cancelled', 'completed'].includes(session.status)) {
          redirectToHome();
        }
      } catch (error: any) {
        if (cancelled) return;
        const status = error?.status ?? error?.response?.status;
        if (status === 404) {
          redirectToHome();
        }
      }
    };

    checkSessionExists();
    return () => { cancelled = true; };
  }, [id]);

  // ── 2. WS : redirection immédiate à la fermeture ──
  useEffect(() => {
    if (!id) return;

    const unsubCompleted = on('session_completed', () => redirectToHome());
    const unsubArchived = on('session_archived', () => redirectToHome());

    return () => {
      unsubCompleted();
      unsubArchived();
    };
  }, [id, on]);

  // ── 3. Contexte : session cleared par un autre écran ou WS ──
  // Filet de sécurité : si index.tsx (ou SessionContext.refreshSession → 404)
  // a déjà clear la session, on le détecte ici et on redirige.
  useEffect(() => {
    if (isSessionInitialized && !ctxSession && !redirectedRef.current) {
      redirectToHome();
    }
  }, [ctxSession, isSessionInitialized]);

  // ── 4. Fallback : isArchived via useSessionArchiveCountdown ──
  useEffect(() => {
    if (isArchived) redirectToHome();
  }, [isArchived]);

  // ── 5. Fallback : countdown archive atteint 0 ──
  useEffect(() => {
    if (timeUntilArchive !== null && timeUntilArchive <= 0) redirectToHome();
  }, [timeUntilArchive]);

  // ── 6. Fallback : inactivité expirée côté client ──
  useEffect(() => {
    if (isInactivityExpired) redirectToHome();
  }, [isInactivityExpired]);

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

        {/* ── Bandeau inactivité (visible 5 min avant auto-completion) ── */}
        {showInactivityWarning && (
          <View style={[
            styles.inactivityBanner,
            isInactivityExpired && styles.inactivityBannerExpired,
          ]}>
            <Ionicons name="time-outline" size={18} color="#FFF" />
            <Text style={styles.inactivityText}>
              {isInactivityExpired
                ? '⚠️ Session expirée — redirection…'
                : `⚠️ Session inactive — fermeture auto dans ${inactivityFormattedTime}`
              }
            </Text>
          </View>
        )}

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

const styles = StyleSheet.create({
  inactivityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9800',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  inactivityBannerExpired: {
    backgroundColor: '#F44336',
  },
  inactivityText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
});